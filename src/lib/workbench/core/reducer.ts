import type {
  DockAxis,
  DockLayout,
  DockNode,
  DockRegionId,
  FloatingRect,
  JsonObject,
  NavigationEntryState,
  PanelInstance,
  SplitDockNode,
  TabStackDockNode,
  WidgetInstance,
  WidgetZoneId,
  WorkbenchDocument,
  WorkbenchLayout,
  WorkbenchPage,
  WorkbenchPageLayout
} from './schema';
import { DEFAULT_WIDGET_ZONES, isDockRegionId } from './schema';
import { createWorkbenchId } from './ids';
import { createEmptyDockLayout } from './defaults';
import { cloneWorkbenchDocument, normalizeRatios, repairWorkbenchDocument } from './invariants';
import { remapDockLayout, remintWorkbenchPage } from './layoutPackage';
import { activeWorkbenchPage, orderedWorkbenchPages, panelIdsInDockTree, panelIdsInPageDock, selectActiveLayout } from './selectors';
import { removePanelFromDock } from './dockTree';
import type { DockTarget, WorkbenchCommand, WorkbenchCommandResult, WorkbenchErrorCode } from './commands';

interface InsertResult {
  success: boolean;
  code?: WorkbenchErrorCode;
  message?: string;
}

const ok = (next: WorkbenchDocument, warnings?: string[]): WorkbenchCommandResult => ({
  success: true,
  next: repairWorkbenchDocument(next),
  warnings
});

const fail = (
  doc: WorkbenchDocument,
  code: WorkbenchErrorCode,
  message: string,
  warnings?: string[]
): WorkbenchCommandResult => ({
  success: false,
  next: doc,
  error: { code, message },
  warnings
});

function activeLayout(doc: WorkbenchDocument): WorkbenchLayout | undefined {
  const profile = doc.profiles[doc.activeProfileId];
  return profile ? doc.layouts[profile.layoutId] : undefined;
}

/**
 * The dock every dock-scoped command (panel.*, region.*, split.resize) operates
 * on: the ACTIVE page's. Repair guarantees at least one page, so this only
 * returns `undefined` on documents that bypassed repair entirely.
 */
function activePageDock(layout: WorkbenchLayout): DockLayout | undefined {
  return activeWorkbenchPage(layout)?.dock;
}

const makeTabStack = (panelId: string): TabStackDockNode => ({
  kind: 'tabs',
  id: createWorkbenchId('tabs'),
  activePanelId: panelId,
  panelIds: [panelId]
});

const makeSplit = (axis: DockAxis, children: DockNode[]): SplitDockNode => ({
  kind: 'split',
  id: createWorkbenchId('split'),
  axis,
  ratio: normalizeRatios([], children.length),
  children
});

// A panel id may appear in at most one page's dock, but removal sweeps ALL
// pages defensively so a move/close can never leave a stale reference behind.
function removePanelFromAllPages(layout: WorkbenchLayout, panelId: string): boolean {
  let removed = false;
  for (const page of orderedWorkbenchPages(layout)) {
    removed = removePanelFromDock(page.dock, panelId) || removed;
  }
  return removed;
}

/** Panel ids docked on every page EXCEPT `pageId`. */
function panelIdsDockedElsewhere(layout: WorkbenchLayout, pageId: string): Set<string> {
  const ids = new Set<string>();
  for (const page of orderedWorkbenchPages(layout)) {
    if (page.id === pageId) continue;
    for (const panelId of panelIdsInPageDock(page)) ids.add(panelId);
  }
  return ids;
}

/**
 * A working copy of an incoming page dock (page.add / page.setDock) that never
 * takes a panel away from another page: references to panels docked elsewhere
 * are dropped, so they stay where they are. References to missing panels are
 * left for repair to prune. The command's own dock is never mutated.
 */
function ownDockFor(layout: WorkbenchLayout, pageId: string, dock: DockLayout | undefined): DockLayout {
  const copy: DockLayout = dock ? (JSON.parse(JSON.stringify(dock)) as DockLayout) : createEmptyDockLayout();
  copy.regions = copy.regions ?? createEmptyDockLayout().regions;
  copy.root = copy.root ?? createEmptyDockLayout().root;
  const elsewhere = panelIdsDockedElsewhere(layout, pageId);
  if (!elsewhere.size) return copy;
  const referenced = Object.values(copy.root).flatMap((node) => panelIdsInDockTree(node ?? null));
  for (const panelId of referenced) {
    if (elsewhere.has(panelId)) removePanelFromDock(copy, panelId);
  }
  return copy;
}

/** JSON with sorted keys: a deep-equality key for panel state. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Equality key of a panel state: an absent state and `{}` are the same. */
function stateKeyOf(state: JsonObject | undefined): string {
  return !state || Object.keys(state).length === 0 ? 'null' : stableJson(state);
}

/** A fresh panel id the layout does not use yet. */
function freshPanelId(layout: WorkbenchLayout, sourceId: string): string {
  const prefix = sourceId.split(/[.\-:]/)[0] || 'panel';
  let id = createWorkbenchId(prefix);
  while (layout.panels[id]) id = createWorkbenchId(prefix);
  return id;
}

interface AppliedPageLayout {
  dock: DockLayout;
  /** Distinct single-instance panels that live on another page (they stay there). */
  keptElsewhere: number;
}

/**
 * Map a stored page layout onto the live layout for `pageLayout.apply`
 * (`page.setDock` semantics — nothing is deleted, nothing is duplicated):
 *
 *   - a stored panel with a `singletonKey` is the instance that carries that
 *     key (created with the key when none exists); if that instance is docked
 *     on ANOTHER page it stays there (counted in `keptElsewhere`);
 *   - a keyless stored panel reuses a keyless instance with the same type +
 *     title + deep-equal state (absent state = `{}`): one already on the target
 *     page first, else a parked one — but a parked one only when it owns no
 *     widgets (identical custom panels differ only by their widgets, so the
 *     target's own panel must win and a parked panel carrying widgets is never
 *     swapped in for an empty one). Only otherwise is a copy minted — applying
 *     the same layout twice creates nothing new.
 *
 * Mutates `layout.panels` (created instances); returns the target page's new
 * dock (fresh node ids). The caller docks it through {@link ownDockFor}, which
 * parks the target's unused panels and drops elsewhere-docked references.
 */
function mapStoredPageLayout(layout: WorkbenchLayout, stored: WorkbenchPageLayout, targetPageId: string): AppliedPageLayout {
  const storedPanels = stored.panels ?? {};
  const dockedOn = new Map<string, string>();
  for (const page of orderedWorkbenchPages(layout)) {
    for (const panelId of panelIdsInPageDock(page)) if (!dockedOn.has(panelId)) dockedOn.set(panelId, page.id);
  }
  const referenced = [...new Set(Object.values(stored.page?.dock?.root ?? {}).flatMap((node) => panelIdsInDockTree(node ?? null)))];
  const remap = new Map<string, string>();
  const claimed = new Set<string>();
  const unknown: string[] = [];
  const keptElsewhere = new Set<string>();
  // Reuse candidates, computed once: keyless instances on the target page
  // (preferred) and parked ones that own no widgets, with their state key.
  const zonesWithWidgets = new Set(Object.values(layout.widgets ?? {}).map((widget) => widget.zone));
  const candidates = Object.values(layout.panels)
    .filter((panel) => {
      if (panel.singletonKey) return false;
      const at = dockedOn.get(panel.id);
      if (at) return at === targetPageId;
      return !zonesWithWidgets.has(`panel:${panel.id}`);
    })
    .map((panel) => ({ panel, onTarget: dockedOn.get(panel.id) === targetPageId, stateKey: stateKeyOf(panel.state) }))
    .sort((a, b) => Number(b.onTarget) - Number(a.onTarget));

  for (const storedId of referenced) {
    const source = storedPanels[storedId];
    if (!source) {
      unknown.push(storedId);
      continue;
    }
    if (source.singletonKey) {
      const existing = Object.values(layout.panels).find((panel) => panel.singletonKey === source.singletonKey);
      if (existing) {
        remap.set(storedId, existing.id);
        const at = dockedOn.get(existing.id);
        if (at && at !== targetPageId) keptElsewhere.add(existing.id);
        continue;
      }
      const id = layout.panels[source.id] ? freshPanelId(layout, source.id) : source.id;
      layout.panels[id] = { ...(JSON.parse(JSON.stringify(source)) as PanelInstance), id };
      remap.set(storedId, id);
      continue;
    }
    const stateKey = stateKeyOf(source.state);
    const reuse = candidates.find(
      (candidate) =>
        !claimed.has(candidate.panel.id) &&
        candidate.panel.type === source.type &&
        (candidate.panel.title ?? '') === (source.title ?? '') &&
        candidate.stateKey === stateKey
    )?.panel;
    if (reuse) {
      claimed.add(reuse.id);
      remap.set(storedId, reuse.id);
      continue;
    }
    const id = freshPanelId(layout, source.id);
    const copy: PanelInstance = { ...(JSON.parse(JSON.stringify(source)) as PanelInstance), id, closable: source.closable ?? true };
    delete copy.locked;
    layout.panels[id] = copy;
    claimed.add(id);
    remap.set(storedId, id);
  }

  const sourceDock: DockLayout = JSON.parse(JSON.stringify(stored.page?.dock ?? createEmptyDockLayout()));
  sourceDock.regions = sourceDock.regions ?? createEmptyDockLayout().regions;
  sourceDock.root = sourceDock.root ?? createEmptyDockLayout().root;
  for (const storedId of unknown) removePanelFromDock(sourceDock, storedId);
  return { dock: remapDockLayout(sourceDock, remap), keptElsewhere: keptElsewhere.size };
}

// Run `finder` against each region root and return the first defined match. Every dock lookup
// (tab stack by id/panel, split by id) shares this "walk all region roots, first hit wins" shape.
function findAcrossRegions<T>(dock: DockLayout, finder: (node: DockNode | null) => T | undefined): T | undefined {
  for (const node of Object.values(dock.root)) {
    const found = finder(node);
    if (found) return found;
  }
  return undefined;
}

function findTabStackByPanel(node: DockNode | null, panelId: string): TabStackDockNode | undefined {
  if (!node) return undefined;
  if (node.kind === 'tabs') return node.panelIds.includes(panelId) ? node : undefined;
  for (const child of node.children) {
    const found = findTabStackByPanel(child, panelId);
    if (found) return found;
  }
  return undefined;
}

function findTabStackById(node: DockNode | null, tabStackId: string): TabStackDockNode | undefined {
  if (!node) return undefined;
  if (node.kind === 'tabs') return node.id === tabStackId ? node : undefined;
  for (const child of node.children) {
    const found = findTabStackById(child, tabStackId);
    if (found) return found;
  }
  return undefined;
}

/**
 * A panel dropped into a region the user collapsed (region.collapse) would land
 * invisibly inside the strip: every insert into a region expands it.
 */
function expandRegion(dock: DockLayout, region: DockRegionId): void {
  const state = dock.regions[region];
  if (state?.collapsed) state.collapsed = false;
}

function appendPanelToRegion(dock: DockLayout, panelId: string, region: DockRegionId, index?: number): InsertResult {
  if (!isDockRegionId(region)) return { success: false, code: 'invalid-region', message: `Invalid dock region: ${region}` };
  expandRegion(dock, region);
  const root = dock.root[region];
  if (!root) {
    dock.root[region] = makeTabStack(panelId);
    return { success: true };
  }
  if (root.kind === 'tabs') {
    const panelIds = root.panelIds.filter((id) => id !== panelId);
    panelIds.splice(Math.max(0, Math.min(index ?? panelIds.length, panelIds.length)), 0, panelId);
    root.panelIds = panelIds;
    root.activePanelId = panelId;
    return { success: true };
  }

  const children = [...root.children];
  children.splice(Math.max(0, Math.min(index ?? children.length, children.length)), 0, makeTabStack(panelId));
  root.children = children;
  root.ratio = normalizeRatios(root.ratio, children.length);
  return { success: true };
}

function insertPanelIntoTab(dock: DockLayout, panelId: string, target: Extract<DockTarget, { kind: 'tab' }>): InsertResult {
  let stack: TabStackDockNode | undefined;
  for (const region of Object.keys(dock.root) as DockRegionId[]) {
    const node = dock.root[region];
    stack = target.tabStackId ? findTabStackById(node, target.tabStackId) : target.targetPanelId ? findTabStackByPanel(node, target.targetPanelId) : undefined;
    if (stack) {
      expandRegion(dock, region);
      break;
    }
  }
  if (!stack) return { success: false, code: 'missing-target', message: 'Target tab stack was not found.' };
  const panelIds = stack.panelIds.filter((id) => id !== panelId);
  const index = Math.max(0, Math.min(target.index ?? panelIds.length, panelIds.length));
  panelIds.splice(index, 0, panelId);
  stack.panelIds = panelIds;
  stack.activePanelId = panelId;
  return { success: true };
}

function splitNearTarget(node: DockNode | null, panelId: string, targetPanelId: string, axis: DockAxis, position: 'before' | 'after'): { node: DockNode | null; inserted: boolean } {
  if (!node) return { node, inserted: false };
  if (node.kind === 'tabs') {
    if (!node.panelIds.includes(targetPanelId)) return { node, inserted: false };
    const newStack = makeTabStack(panelId);
    const children = position === 'before' ? [newStack, node] : [node, newStack];
    return { node: makeSplit(axis, children), inserted: true };
  }
  let inserted = false;
  const children = node.children.map((child) => {
    if (inserted) return child;
    const result = splitNearTarget(child, panelId, targetPanelId, axis, position);
    inserted = result.inserted;
    return result.node ?? child;
  });
  return {
    inserted,
    node: inserted
      ? {
          ...node,
          children,
          ratio: normalizeRatios(node.ratio, children.length)
        }
      : node
  };
}

function insertPanelAsSplit(dock: DockLayout, panelId: string, target: Extract<DockTarget, { kind: 'split' }>): InsertResult {
  const position = target.position ?? 'after';
  if (target.targetPanelId) {
    for (const region of Object.keys(dock.root) as DockRegionId[]) {
      const result = splitNearTarget(dock.root[region], panelId, target.targetPanelId, target.axis, position);
      if (result.inserted) {
        dock.root[region] = result.node;
        expandRegion(dock, region);
        return { success: true };
      }
    }
    return { success: false, code: 'missing-target', message: `Target panel ${target.targetPanelId} was not found.` };
  }

  const region = target.region;
  if (!region) return { success: false, code: 'missing-target', message: 'Split target needs a region or target panel.' };
  if (!isDockRegionId(region)) return { success: false, code: 'invalid-region', message: `Invalid dock region: ${region}` };
  expandRegion(dock, region);
  const root = dock.root[region];
  if (!root) {
    dock.root[region] = makeTabStack(panelId);
    return { success: true };
  }
  const newStack = makeTabStack(panelId);
  dock.root[region] = makeSplit(target.axis, position === 'before' ? [newStack, root] : [root, newStack]);
  return { success: true };
}

function insertPanel(dock: DockLayout, panelId: string, target: DockTarget | undefined, fallbackRegion: DockRegionId): InsertResult {
  if (!target || target.kind === 'region') {
    return appendPanelToRegion(dock, panelId, target?.region ?? fallbackRegion, target?.index);
  }
  if (target.kind === 'tab') return insertPanelIntoTab(dock, panelId, target);
  return insertPanelAsSplit(dock, panelId, target);
}

function findSplitById(node: DockNode | null, splitId: string): SplitDockNode | undefined {
  if (!node) return undefined;
  if (node.kind === 'split' && node.id === splitId) return node;
  if (node.kind === 'split') {
    for (const child of node.children) {
      const found = findSplitById(child, splitId);
      if (found) return found;
    }
  }
  return undefined;
}

function orderedWidgets(layout: WorkbenchLayout, zone: WidgetZoneId, exclude = new Set<string>()): WidgetInstance[] {
  return Object.values(layout.widgets)
    .filter((widget) => widget.zone === zone && !exclude.has(widget.id))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function placeWidgets(layout: WorkbenchLayout, widgetIds: string[], zone: WidgetZoneId, index?: number, floatingRect?: FloatingRect): void {
  const unique = [...new Set(widgetIds)];
  const others = orderedWidgets(layout, zone, new Set(unique));
  const at = Math.max(0, Math.min(index ?? others.length, others.length));
  const ordered = [...others];
  ordered.splice(at, 0, ...unique.map((id) => layout.widgets[id]).filter((widget): widget is WidgetInstance => !!widget));
  ordered.forEach((widget, order) => {
    widget.zone = zone;
    widget.order = order;
    if (floatingRect) widget.floatingRect = { ...floatingRect };
  });

  const touched = new Set(ordered.map((widget) => widget.id));
  Object.values(layout.widgets)
    .filter((widget) => widget.zone !== zone && !touched.has(widget.id))
    .forEach((widget) => {
      widget.order = Number.isFinite(widget.order) ? widget.order : 0;
    });
}

// Detach any moved widget from its group unless its ENTIRE group is being moved
// together (whole-group relocation via the group grip). A member dragged out on
// its own leaves the group; a group left with fewer than two members dissolves.
function detachPartialGroupMembers(layout: WorkbenchLayout, widgetIds: string[]): void {
  const moving = new Set(widgetIds);
  const touchedGroups = new Set<string>();
  for (const widgetId of widgetIds) {
    const widget = layout.widgets[widgetId];
    const groupId = widget?.groupId;
    if (!widget || !groupId) continue;
    const group = layout.widgetGroups[groupId];
    if (!group || group.locked) continue;
    // Whole group moving together — keep it intact.
    if (group.widgetIds.every((id) => moving.has(id))) continue;
    widget.groupId = null;
    group.widgetIds = group.widgetIds.filter((id) => id !== widgetId);
    touchedGroups.add(groupId);
  }
  // Dissolve any group that no longer holds at least two members.
  for (const groupId of touchedGroups) {
    const group = layout.widgetGroups[groupId];
    if (!group) continue;
    if (group.widgetIds.length < 2) {
      for (const id of group.widgetIds) {
        if (layout.widgets[id]?.groupId === groupId) layout.widgets[id].groupId = null;
      }
      delete layout.widgetGroups[groupId];
    }
  }
}

// Remove the given widgets from any group OTHER than `targetGroupId` they still
// belong to (used when `widget.group` folds a member out of one group and into
// another). A source group left with fewer than two members dissolves, matching
// `detachPartialGroupMembers`.
function detachFromOtherGroups(layout: WorkbenchLayout, widgetIds: string[], targetGroupId: string): void {
  const moving = new Set(widgetIds);
  const touchedGroups = new Set<string>();
  for (const widgetId of widgetIds) {
    const widget = layout.widgets[widgetId];
    const groupId = widget?.groupId;
    if (!widget || !groupId || groupId === targetGroupId) continue;
    const group = layout.widgetGroups[groupId];
    if (!group || group.locked) continue;
    group.widgetIds = group.widgetIds.filter((id) => id !== widgetId);
    touchedGroups.add(groupId);
  }
  for (const groupId of touchedGroups) {
    const group = layout.widgetGroups[groupId];
    if (!group) continue;
    if (group.widgetIds.length < 2) {
      for (const id of group.widgetIds) {
        if (layout.widgets[id]?.groupId === groupId && !moving.has(id)) layout.widgets[id].groupId = null;
      }
      delete layout.widgetGroups[groupId];
    }
  }
}

function moveZoneWidgets(layout: WorkbenchLayout, fromZone: WidgetZoneId, toZone: WidgetZoneId): void {
  layout.zones[toZone] ??= {
    id: toZone,
    orientation: toZone === 'hidden' ? 'horizontal' : 'horizontal',
    acceptsGroups: toZone !== 'hidden'
  };
  const moved = Object.values(layout.widgets)
    .filter((widget) => widget.zone === fromZone)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (!moved.length) return;
  const baseOrder = orderedWidgets(layout, toZone).length;
  moved.forEach((widget, index) => {
    widget.zone = toZone;
    widget.order = baseOrder + index;
    widget.groupId = null;
    delete widget.floatingRect;
  });
}

function panelWidgetZone(panelId: string): WidgetZoneId {
  return `panel:${panelId}`;
}

function removePanelOwnedWidgets(layout: WorkbenchLayout, panelId: string): void {
  const zone = panelWidgetZone(panelId);
  moveZoneWidgets(layout, zone, 'hidden');
  delete layout.zones[zone];
}

function navigationFixedMoveAllowed(entry: NavigationEntryState): boolean {
  return entry.state?.allowFixedMove === true;
}

function moveNavigation(layout: WorkbenchLayout, entryId: string, index: number): InsertResult {
  const entry = layout.navigation.entries[entryId];
  if (!entry) return { success: false, code: 'missing-navigation', message: `Navigation entry ${entryId} does not exist.` };
  if (entry.fixedSlot && entry.fixedSlot !== 'none' && !navigationFixedMoveAllowed(entry)) {
    return { success: false, code: 'locked-navigation', message: `Navigation entry ${entryId} is fixed and cannot be moved.` };
  }
  const order = layout.navigation.order.filter((id) => id !== entryId && !!layout.navigation.entries[id]);
  order.splice(Math.max(0, Math.min(index, order.length)), 0, entryId);
  layout.navigation.order = order;
  return { success: true };
}

function hideNavigation(layout: WorkbenchLayout, entryId: string): InsertResult {
  const entry = layout.navigation.entries[entryId];
  if (!entry) return { success: false, code: 'missing-navigation', message: `Navigation entry ${entryId} does not exist.` };
  if (entry.locked || (entry.fixedSlot && entry.fixedSlot !== 'none')) {
    return { success: false, code: 'locked-navigation', message: `Navigation entry ${entryId} is locked/fixed and cannot be hidden.` };
  }
  entry.hidden = true;
  return { success: true };
}

function findSingletonConflict(layout: WorkbenchLayout, panel: PanelInstance): PanelInstance | undefined {
  if (!panel.singletonKey) return undefined;
  return Object.values(layout.panels).find((candidate) => candidate.id !== panel.id && candidate.singletonKey === panel.singletonKey);
}

function layoutReferencedByProfile(doc: WorkbenchDocument, layoutId: string): boolean {
  return Object.values(doc.profiles).some((profile) => profile.layoutId === layoutId);
}

/** Navigation entries bound to a page (normally one, but repair tolerates several). */
function navigationEntriesForPage(layout: WorkbenchLayout, pageId: string): NavigationEntryState[] {
  return Object.values(layout.navigation.entries).filter((entry) => entry.pageId === pageId);
}

/**
 * Default navigation entry for a page (used when `page.add`/`page.duplicate`
 * get no explicit entry): id derived from the page id (`page:<id>`, minted
 * fresh on the unlikely collision), label from the page, icon carried in
 * `state.icon` for the app's nav renderer.
 */
function defaultPageNavigationEntry(layout: WorkbenchLayout, page: WorkbenchPage): NavigationEntryState {
  const preferred = `page:${page.id}`;
  const id = layout.navigation.entries[preferred] ? createWorkbenchId('nav') : preferred;
  return {
    id,
    label: page.label,
    hidden: false,
    pageId: page.id,
    ...(page.icon ? { state: { icon: page.icon } } : {})
  };
}

function insertNavigationEntry(layout: WorkbenchLayout, entry: NavigationEntryState, index?: number): void {
  layout.navigation.entries[entry.id] = entry;
  const order = layout.navigation.order.filter((id) => id !== entry.id);
  order.splice(Math.max(0, Math.min(index ?? order.length, order.length)), 0, entry.id);
  layout.navigation.order = order;
}

/**
 * Re-order the page-bound navigation entries so they follow `pageOrder`, while
 * leaving every non-page entry (Theme/Cloud actions, hidden restores) anchored
 * in its current slot. Backs `page.move`: the visible nav IS the pages, so a
 * page reorder must reorder its menu entries too. Each page-bound slot in
 * `navigation.order` is filled, in place, with the next entry from the
 * page-order sequence — a 1:1 replacement (repair guarantees every page-bound
 * entry's page exists).
 */
function syncPageNavigationOrder(layout: WorkbenchLayout): void {
  const desired: string[] = [];
  for (const pageId of layout.pageOrder) {
    for (const entry of navigationEntriesForPage(layout, pageId)) desired.push(entry.id);
  }
  const isPageBound = (id: string): boolean => !!layout.navigation.entries[id]?.pageId;
  let cursor = 0;
  layout.navigation.order = layout.navigation.order.map((id) =>
    isPageBound(id) && cursor < desired.length ? desired[cursor++] : id
  );
}

export function reduceWorkbenchDocument(doc: WorkbenchDocument, command: WorkbenchCommand): WorkbenchCommandResult {
  const next = cloneWorkbenchDocument(doc);
  const layout = activeLayout(next);
  if (!layout) return fail(doc, 'active-layout-missing', 'The active Workbench layout could not be found.');
  // Dock-scoped commands implicitly target the ACTIVE page's dock. Repair
  // guarantees at least one page, so a missing dock means the incoming document
  // skipped repair — surface that as missing-page rather than crash.
  const dock = activePageDock(layout);

  switch (command.type) {
    case 'panel.add': {
      if (!dock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      if (layout.panels[command.panel.id]) return fail(doc, 'duplicate-id', `Panel ${command.panel.id} already exists.`);
      const conflict = findSingletonConflict(layout, command.panel);
      if (conflict) return fail(doc, 'duplicate-singleton', `Panel singleton ${command.panel.singletonKey} already exists as ${conflict.id}.`);
      layout.panels[command.panel.id] = { ...command.panel };
      const result = insertPanel(dock, command.panel.id, command.target, command.region);
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not add panel.');
    }
    case 'panel.create': {
      const panel = command.panel;
      if (!panel || typeof panel.id !== 'string' || !panel.id) return fail(doc, 'invalid-command', 'panel.create needs a panel with an id.');
      if (layout.panels[panel.id]) return fail(doc, 'duplicate-id', `Panel ${panel.id} already exists.`);
      const conflict = findSingletonConflict(layout, panel);
      if (conflict) return fail(doc, 'duplicate-singleton', `Panel singleton ${panel.singletonKey} already exists as ${conflict.id}.`);
      // Parked: in the roster, on no page.
      layout.panels[panel.id] = { ...panel };
      return ok(next);
    }
    case 'panel.close': {
      const panel = layout.panels[command.panelId];
      if (!panel) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      // Locked = cannot leave the layout — except a keyless COPY of a
      // single-instance panel (another panel of its type carries the key):
      // older page duplicates kept the lock, and the original stays anyway.
      const lockedCopy =
        !!panel.locked &&
        !panel.singletonKey &&
        Object.values(layout.panels).some((other) => other.id !== panel.id && other.type === panel.type && !!other.singletonKey);
      if (panel.locked && !lockedCopy) return fail(doc, 'locked-panel', `Panel ${command.panelId} is locked and cannot be closed.`);
      removePanelFromAllPages(layout, command.panelId);
      removePanelOwnedWidgets(layout, command.panelId);
      delete layout.panels[command.panelId];
      return ok(next);
    }
    case 'panel.remove': {
      // Park: the panel leaves every page, the instance (state, owned widget
      // zone + widgets) stays so it can be docked again.
      const panel = layout.panels[command.panelId];
      if (!panel) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      if (panel.locked) return fail(doc, 'locked-panel', `Panel ${command.panelId} is locked and cannot be removed.`);
      removePanelFromAllPages(layout, command.panelId);
      return ok(next);
    }
    case 'panel.move': {
      // `pageId` targets ANOTHER page's dock (drop on a nav page / "Move to ▸
      // Page"): the panel leaves wherever it is and `to` is applied to that
      // page's dock. The active page does not change.
      const targetDock = command.pageId ? layout.pages[command.pageId]?.dock : dock;
      if (command.pageId && !targetDock) return fail(doc, 'missing-page', `Page ${command.pageId} does not exist.`);
      if (!targetDock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      if (!layout.panels[command.panelId]) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      removePanelFromAllPages(layout, command.panelId);
      // A moved panel arrives expanded: the drop preview shows it at full size,
      // so it must never land as a collapsed strip (old docs / strip menus).
      delete layout.panels[command.panelId].collapsed;
      const result = insertPanel(targetDock, command.panelId, command.to, 'main');
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not move panel.');
    }
    case 'panel.tab': {
      if (!dock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      if (!layout.panels[command.panelId]) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      if (!layout.panels[command.targetPanelId]) return fail(doc, 'missing-target', `Target panel ${command.targetPanelId} does not exist.`);
      removePanelFromAllPages(layout, command.panelId);
      const result = insertPanelIntoTab(dock, command.panelId, { kind: 'tab', targetPanelId: command.targetPanelId, index: command.index });
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not tab panel.');
    }
    case 'panel.activate': {
      if (!dock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      if (!layout.panels[command.panelId]) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      const stack = findAcrossRegions(dock, (node) => findTabStackByPanel(node, command.panelId));
      if (!stack) return fail(doc, 'missing-target', `Panel ${command.panelId} is not in a tab stack.`);
      stack.activePanelId = command.panelId;
      return ok(next);
    }
    case 'panel.split': {
      if (!dock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      const panelId = command.panel?.id ?? command.panelId;
      if (!panelId) return fail(doc, 'invalid-command', 'Split command needs a panel or panelId.');
      if (command.targetPanelId && command.targetPanelId === panelId) return fail(doc, 'invalid-command', 'A panel cannot be split beside itself.');
      if (command.panel) {
        if (layout.panels[command.panel.id]) return fail(doc, 'duplicate-id', `Panel ${command.panel.id} already exists.`);
        const conflict = findSingletonConflict(layout, command.panel);
        if (conflict) return fail(doc, 'duplicate-singleton', `Panel singleton ${command.panel.singletonKey} already exists as ${conflict.id}.`);
        layout.panels[command.panel.id] = { ...command.panel };
      } else if (!layout.panels[panelId]) {
        return fail(doc, 'missing-panel', `Panel ${panelId} does not exist.`);
      } else {
        removePanelFromAllPages(layout, panelId);
      }
      const result = insertPanelAsSplit(dock, panelId, {
        kind: 'split',
        region: command.region,
        targetPanelId: command.targetPanelId,
        axis: command.axis,
        position: command.position
      });
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not split panel.');
    }
    case 'panel.rename': {
      const panel = layout.panels[command.panelId];
      if (!panel) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      const title = command.title.trim();
      if (!title) return fail(doc, 'invalid-command', 'Panel title cannot be empty.');
      panel.title = title;
      return ok(next);
    }
    case 'panel.state': {
      const panel = layout.panels[command.panelId];
      if (!panel) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      panel.state = { ...panel.state, ...command.state };
      return ok(next);
    }
    case 'panel.collapse': {
      const panel = layout.panels[command.panelId];
      if (!panel) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      if (panel.collapsible === false) return fail(doc, 'invalid-command', `Panel ${command.panelId} is not collapsible.`);
      panel.collapsed = command.collapsed;
      return ok(next);
    }
    case 'region.resize': {
      if (!dock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      if (!isDockRegionId(command.region)) return fail(doc, 'invalid-region', `Invalid dock region: ${command.region}`);
      dock.regions[command.region].sizePx = Math.max(0, command.sizePx);
      return ok(next);
    }
    case 'region.collapse': {
      if (!dock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      if (!isDockRegionId(command.region)) return fail(doc, 'invalid-region', `Invalid dock region: ${command.region}`);
      dock.regions[command.region].collapsed = command.collapsed;
      return ok(next);
    }
    case 'split.resize': {
      if (!dock) return fail(doc, 'missing-page', 'The active Workbench page could not be found.');
      const split = findAcrossRegions(dock, (node) => findSplitById(node, command.splitId));
      if (!split) return fail(doc, 'missing-split', `Split ${command.splitId} does not exist.`);
      split.ratio = normalizeRatios(command.ratio, split.children.length);
      return ok(next);
    }
    case 'page.add': {
      const page = command.page;
      if (!page || typeof page.id !== 'string' || !page.id) return fail(doc, 'invalid-command', 'page.add needs a page with an id.');
      if (layout.pages[page.id]) return fail(doc, 'duplicate-id', `Page ${page.id} already exists.`);
      if (command.navEntry && layout.navigation.entries[command.navEntry.id]) {
        return fail(doc, 'duplicate-id', `Navigation entry ${command.navEntry.id} already exists.`);
      }
      const label = typeof page.label === 'string' && page.label.trim() ? page.label.trim() : page.id;
      // A new page docks only parked panels: one already on another page stays there.
      const inserted: WorkbenchPage = { ...page, label, dock: ownDockFor(layout, page.id, page.dock) };
      layout.pages[page.id] = inserted;
      const order = layout.pageOrder.filter((id) => id !== page.id);
      order.splice(Math.max(0, Math.min(command.index ?? order.length, order.length)), 0, page.id);
      layout.pageOrder = order;
      // `navEntry: null` adds a nav-less page (reached programmatically only).
      if (command.navEntry !== null) {
        const entry = command.navEntry
          ? { ...command.navEntry, pageId: page.id }
          : defaultPageNavigationEntry(layout, inserted);
        insertNavigationEntry(layout, entry, command.navIndex ?? command.index);
      }
      return ok(next);
    }
    case 'page.remove': {
      const page = layout.pages[command.pageId];
      if (!page) return fail(doc, 'missing-page', `Page ${command.pageId} does not exist.`);
      if (Object.keys(layout.pages).length <= 1) return fail(doc, 'protected-page', 'The last page cannot be removed.');
      // The page's panels are PARKED, never deleted: dropping the page drops
      // its dock references, while the instances (locked ones too) keep their
      // state and owned widgets in `layout.panels`, ready to be docked again.
      const removedIndex = layout.pageOrder.indexOf(command.pageId);
      delete layout.pages[command.pageId];
      layout.pageOrder = layout.pageOrder.filter((id) => id !== command.pageId);
      for (const entry of navigationEntriesForPage(layout, command.pageId)) {
        delete layout.navigation.entries[entry.id];
        layout.navigation.order = layout.navigation.order.filter((id) => id !== entry.id);
      }
      if (layout.activePageId === command.pageId) {
        // Nearest remaining page by order: the one that slid into the removed
        // slot, else the new last page.
        const at = Math.max(0, Math.min(removedIndex < 0 ? layout.pageOrder.length - 1 : removedIndex, layout.pageOrder.length - 1));
        layout.activePageId = layout.pageOrder[at];
      }
      return ok(next);
    }
    case 'page.setDock': {
      const page = layout.pages[command.pageId];
      if (!page) return fail(doc, 'missing-page', `Page ${command.pageId} does not exist.`);
      // Panels the new dock does not reference are parked (they simply drop out
      // of the page); panels docked on another page stay there. Without a dock
      // (Clear page) the region sizes stay and only the roots empty.
      const cleared: DockLayout = { regions: JSON.parse(JSON.stringify(page.dock.regions)), root: createEmptyDockLayout().root };
      page.dock = ownDockFor(layout, page.id, command.dock ?? cleared);
      return ok(next);
    }
    case 'page.rename': {
      const page = layout.pages[command.pageId];
      if (!page) return fail(doc, 'missing-page', `Page ${command.pageId} does not exist.`);
      const label = command.label.trim();
      if (!label) return fail(doc, 'invalid-command', 'Page label cannot be empty.');
      page.label = label;
      for (const entry of navigationEntriesForPage(layout, command.pageId)) entry.label = label;
      return ok(next);
    }
    case 'page.activate': {
      if (!layout.pages[command.pageId]) return fail(doc, 'missing-page', `Page ${command.pageId} does not exist.`);
      layout.activePageId = command.pageId;
      return ok(next);
    }
    case 'page.duplicate': {
      const source = layout.pages[command.pageId];
      if (!source) return fail(doc, 'missing-page', `Page ${command.pageId} does not exist.`);
      const newPageId = command.newPageId ?? createWorkbenchId('page');
      if (layout.pages[newPageId]) return fail(doc, 'duplicate-id', `Page ${newPageId} already exists.`);
      const sourcePanels: Record<string, PanelInstance> = {};
      for (const panelId of panelIdsInPageDock(source)) {
        if (layout.panels[panelId]) sourcePanels[panelId] = layout.panels[panelId];
      }
      const { page: copy, panels: copiedPanels } = remintWorkbenchPage(source, sourcePanels, {
        pageId: newPageId,
        label: command.label ?? `${source.label} Copy`
      });
      for (const panel of Object.values(copiedPanels)) layout.panels[panel.id] = panel;
      layout.pages[copy.id] = copy;
      const sourceIndex = layout.pageOrder.indexOf(command.pageId);
      layout.pageOrder.splice(sourceIndex < 0 ? layout.pageOrder.length : sourceIndex + 1, 0, copy.id);
      // Bind a nav entry right after the source page's entry (or at the end).
      const sourceEntry = navigationEntriesForPage(layout, command.pageId)[0];
      const sourceEntryIndex = sourceEntry ? layout.navigation.order.indexOf(sourceEntry.id) : -1;
      insertNavigationEntry(
        layout,
        defaultPageNavigationEntry(layout, copy),
        sourceEntryIndex < 0 ? undefined : sourceEntryIndex + 1
      );
      return ok(next);
    }
    case 'page.move': {
      if (!layout.pages[command.pageId]) return fail(doc, 'missing-page', `Page ${command.pageId} does not exist.`);
      const order = layout.pageOrder.filter((id) => id !== command.pageId);
      order.splice(Math.max(0, Math.min(command.index, order.length)), 0, command.pageId);
      layout.pageOrder = order;
      syncPageNavigationOrder(layout);
      return ok(next);
    }
    case 'pageLayout.save': {
      const pageLayout = command.pageLayout;
      if (!pageLayout || typeof pageLayout.id !== 'string' || !pageLayout.id) {
        return fail(doc, 'invalid-command', 'pageLayout.save needs a page layout with an id.');
      }
      next.pageLayouts = next.pageLayouts ?? {};
      const label = typeof pageLayout.label === 'string' && pageLayout.label.trim() ? pageLayout.label.trim() : pageLayout.id;
      next.pageLayouts[pageLayout.id] = { ...pageLayout, label, panels: pageLayout.panels ?? {} };
      return ok(next);
    }
    case 'pageLayout.rename': {
      next.pageLayouts = next.pageLayouts ?? {};
      const stored = next.pageLayouts[command.pageLayoutId];
      if (!stored) return fail(doc, 'missing-page-layout', `Page layout ${command.pageLayoutId} does not exist.`);
      const label = command.label.trim();
      if (!label) return fail(doc, 'invalid-command', 'Page layout label cannot be empty.');
      stored.label = label;
      return ok(next);
    }
    case 'pageLayout.delete': {
      next.pageLayouts = next.pageLayouts ?? {};
      if (!next.pageLayouts[command.pageLayoutId]) {
        return fail(doc, 'missing-page-layout', `Page layout ${command.pageLayoutId} does not exist.`);
      }
      delete next.pageLayouts[command.pageLayoutId];
      return ok(next);
    }
    case 'pageLayout.apply': {
      next.pageLayouts = next.pageLayouts ?? {};
      const stored = next.pageLayouts[command.pageLayoutId];
      if (!stored) return fail(doc, 'missing-page-layout', `Page layout ${command.pageLayoutId} does not exist.`);
      const targetId = command.pageId ?? layout.activePageId;
      const target = layout.pages[targetId];
      if (!target) return fail(doc, 'missing-page', `Page ${targetId} does not exist.`);
      // `page.setDock` semantics: the target page keeps its identity (id /
      // label / icon / metadata + its bound nav entry) and gets the stored dock
      // (fresh node ids) mapped onto live instances — single-instance panels
      // ARE their live instance (one on another page stays there), keyless ones
      // reuse an identical instance before a copy is minted. The target's
      // panels the new dock does not use are PARKED, never deleted.
      const applied = mapStoredPageLayout(layout, stored, target.id);
      target.dock = ownDockFor(layout, target.id, applied.dock);
      const kept = applied.keptElsewhere;
      return ok(next, kept ? [kept === 1 ? '1 panel stays on another page' : `${kept} panels stay on other pages`] : undefined);
    }
    case 'widget.add': {
      if (layout.widgets[command.widget.id]) return fail(doc, 'duplicate-id', `Widget ${command.widget.id} already exists.`);
      layout.widgets[command.widget.id] = { ...command.widget, zone: command.zone, size: command.widget.size ?? 'default' };
      placeWidgets(layout, [command.widget.id], command.zone, command.index, command.widget.floatingRect);
      return ok(next);
    }
    case 'widget.move': {
      for (const widgetId of command.widgetIds) {
        if (!layout.widgets[widgetId]) return fail(doc, 'missing-widget', `Widget ${widgetId} does not exist.`);
      }
      // Dragging a widget OUT of its group (a partial move — the whole group is
      // not being relocated together) detaches it from that group; a group that
      // drops below two members dissolves. Moving every member of a group at once
      // (the group grip) keeps the group intact.
      detachPartialGroupMembers(layout, command.widgetIds);
      placeWidgets(layout, command.widgetIds, command.zone, command.index, command.floatingRect);
      return ok(next);
    }
    case 'widget.hide': {
      for (const widgetId of command.widgetIds) {
        const widget = layout.widgets[widgetId];
        if (!widget) return fail(doc, 'missing-widget', `Widget ${widgetId} does not exist.`);
        if (widget.locked) return fail(doc, 'locked-widget', `Widget ${widgetId} is locked and cannot be hidden.`);
      }
      command.widgetIds.forEach((widgetId, index) => {
        layout.widgets[widgetId].zone = 'hidden';
        layout.widgets[widgetId].order = index;
        layout.widgets[widgetId].groupId = null;
      });
      return ok(next);
    }
    case 'widget.resize': {
      const widget = layout.widgets[command.widgetId];
      if (!widget) return fail(doc, 'missing-widget', `Widget ${command.widgetId} does not exist.`);
      if (widget.locked) return fail(doc, 'locked-widget', `Widget ${command.widgetId} is locked and cannot be resized.`);
      widget.size = command.size;
      return ok(next);
    }
    case 'widget.state': {
      // functional state (not layout), so locked widgets may still update it
      const widget = layout.widgets[command.widgetId];
      if (!widget) return fail(doc, 'missing-widget', `Widget ${command.widgetId} does not exist.`);
      widget.state = { ...widget.state, ...command.state };
      return ok(next);
    }
    case 'widget.group': {
      const widgetIds = [...new Set(command.widgetIds)];
      if (widgetIds.length < 2) return fail(doc, 'invalid-command', 'Grouping requires at least two widgets.');
      for (const widgetId of widgetIds) {
        const widget = layout.widgets[widgetId];
        if (!widget) return fail(doc, 'missing-widget', `Widget ${widgetId} does not exist.`);
        if (widget.locked) return fail(doc, 'locked-widget', `Widget ${widgetId} is locked and cannot be grouped.`);
      }
      const groupId = command.groupId ?? createWorkbenchId('group');
      const existingGroup = layout.widgetGroups[groupId];
      if (existingGroup?.locked) return fail(doc, 'locked-widget-group', `Widget group ${groupId} is locked and cannot be changed.`);
      // A member of another LOCKED group cannot leave it (that group would change).
      for (const widgetId of widgetIds) {
        const from = layout.widgets[widgetId].groupId;
        if (from && from !== groupId && layout.widgetGroups[from]?.locked) {
          return fail(doc, 'locked-widget-group', `Widget ${widgetId} is in the locked group ${from} and cannot be grouped elsewhere.`);
        }
      }
      const zone = command.zone ?? layout.widgets[widgetIds[0]].zone;
      // An explicit `memberOrder` (V14b positional insert / in-group reorder)
      // pins the member sequence verbatim, restricted to the ids actually being
      // grouped so a stale entry can't slip in; anything missing from it falls
      // back to the current-order default so the set is always complete.
      const idSet = new Set(widgetIds);
      const pinned = (command.memberOrder ?? []).filter((id) => idSet.has(id));
      const byOrder = widgetIds
        .map((id) => layout.widgets[id])
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((widget) => widget.id);
      const orderedIds = pinned.length
        ? [...pinned, ...byOrder.filter((id) => !pinned.includes(id))]
        : byOrder;
      // Detach members that are arriving from a DIFFERENT group (V14b: dropping a
      // member from group X into group Y) so the source group doesn't keep a
      // dangling id; dissolve any source group that falls below two members.
      detachFromOtherGroups(layout, orderedIds, groupId);
      orderedIds.forEach((widgetId) => {
        layout.widgets[widgetId].groupId = groupId;
      });
      layout.widgetGroups[groupId] = { ...existingGroup, id: groupId, widgetIds: orderedIds };
      placeWidgets(layout, orderedIds, zone, command.index);
      return ok(next);
    }
    case 'widget.ungroup': {
      const group = layout.widgetGroups[command.groupId];
      if (!group) return fail(doc, 'missing-widget', `Widget group ${command.groupId} does not exist.`);
      if (group.locked) return fail(doc, 'locked-widget-group', `Widget group ${command.groupId} is locked and cannot be ungrouped.`);
      group.widgetIds.forEach((widgetId) => {
        if (layout.widgets[widgetId]?.groupId === command.groupId) layout.widgets[widgetId].groupId = null;
      });
      delete layout.widgetGroups[command.groupId];
      return ok(next);
    }
    case 'zone.ensure': {
      const id = command.zone.id?.trim();
      if (!id) return fail(doc, 'invalid-command', 'Widget zone id cannot be empty.');
      layout.zones[id] = {
        ...layout.zones[id],
        ...command.zone,
        id
      };
      return ok(next);
    }
    case 'zone.rename': {
      const zone = layout.zones[command.zoneId];
      if (!zone) return fail(doc, 'missing-zone', `Widget zone ${command.zoneId} does not exist.`);
      const label = command.label.trim();
      if (!label) return fail(doc, 'invalid-command', 'Widget zone label cannot be empty.');
      zone.label = label;
      return ok(next);
    }
    case 'zone.hide': {
      const zone = layout.zones[command.zoneId];
      if (!zone) return fail(doc, 'missing-zone', `Widget zone ${command.zoneId} does not exist.`);
      if (command.zoneId === 'hidden' && command.hidden) return fail(doc, 'protected-zone', 'The hidden widget zone cannot be hidden.');
      zone.hidden = command.hidden;
      return ok(next);
    }
    case 'zone.delete': {
      if (!layout.zones[command.zoneId]) return fail(doc, 'missing-zone', `Widget zone ${command.zoneId} does not exist.`);
      if ((DEFAULT_WIDGET_ZONES as readonly string[]).includes(command.zoneId)) {
        return fail(doc, 'protected-zone', `Default widget zone ${command.zoneId} cannot be deleted.`);
      }
      const target = command.moveWidgetsTo ?? 'hidden';
      if (target === command.zoneId) return fail(doc, 'invalid-command', 'A deleted widget zone cannot move widgets to itself.');
      moveZoneWidgets(layout, command.zoneId, target);
      delete layout.zones[command.zoneId];
      return ok(next);
    }
    case 'navigation.move': {
      const result = moveNavigation(layout, command.entryId, command.index);
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not move navigation entry.');
    }
    case 'navigation.hide': {
      const result = hideNavigation(layout, command.entryId);
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not hide navigation entry.');
    }
    case 'navigation.show': {
      const entry = layout.navigation.entries[command.entryId];
      if (!entry) return fail(doc, 'missing-navigation', `Navigation entry ${command.entryId} does not exist.`);
      entry.hidden = false;
      if (!layout.navigation.order.includes(command.entryId)) layout.navigation.order.push(command.entryId);
      // Showing always succeeds (unhide + ensure in order); the optional reorder is skipped for fixed entries.
      if (entry.fixedSlot && entry.fixedSlot !== 'none' && !navigationFixedMoveAllowed(entry)) return ok(next);
      const result = moveNavigation(layout, command.entryId, command.index ?? layout.navigation.order.indexOf(command.entryId));
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not show navigation entry.');
    }
    case 'navigation.mode': {
      layout.navigation.mode = command.mode;
      return ok(next);
    }
    case 'profile.add': {
      if (next.profiles[command.profile.id]) return fail(doc, 'duplicate-id', `Profile ${command.profile.id} already exists.`);
      if (!next.layouts[command.profile.layoutId]) return fail(doc, 'missing-layout', `Layout ${command.profile.layoutId} does not exist.`);
      const label = command.profile.label.trim();
      if (!label) return fail(doc, 'invalid-command', 'Profile label cannot be empty.');
      next.profiles[command.profile.id] = { ...command.profile, label };
      return ok(next);
    }
    case 'profile.activate': {
      const profile = next.profiles[command.profileId];
      if (!profile) return fail(doc, 'missing-profile', `Profile ${command.profileId} does not exist.`);
      const incoming = next.layouts[profile.layoutId];
      if (!incoming) return fail(doc, 'missing-layout', `Layout ${profile.layoutId} does not exist.`);
      // Carry the active PAGE across the profile switch. Every profile owns its own
      // layout, and each layout remembers its own `activePageId` — so without this the
      // viewport resolver (a window resize crossing 760/1366) silently moves the user
      // from, say, the Preset Browser to whatever page that profile's layout was last
      // left on. The page is the user's "where am I", not a per-device preference:
      // chrome adapts to the width, the view must not.
      //
      // Deliberately applies to EVERY activation path — resize, ribbon pin, Auto, and
      // the boot-time resolve — so the active page reads as one selection shared across
      // profiles rather than three that drift apart. Do not "fix" this back to a
      // resize-only carry.
      //
      // Layouts whose pages diverged (custom pages) keep their own page: only carry an
      // id the incoming layout actually has, so `activePageId` never dangles.
      const outgoing = selectActiveLayout(next);
      const carriedPageId = outgoing?.activePageId;
      next.activeProfileId = command.profileId;
      if (carriedPageId && incoming.pages?.[carriedPageId]) incoming.activePageId = carriedPageId;
      return ok(next);
    }
    case 'profile.rename': {
      const profile = next.profiles[command.profileId];
      if (!profile) return fail(doc, 'missing-profile', `Profile ${command.profileId} does not exist.`);
      const label = command.label.trim();
      if (!label) return fail(doc, 'invalid-command', 'Profile label cannot be empty.');
      profile.label = label;
      return ok(next);
    }
    case 'profile.setLayout': {
      const profile = next.profiles[command.profileId];
      if (!profile) return fail(doc, 'missing-profile', `Profile ${command.profileId} does not exist.`);
      if (!next.layouts[command.layoutId]) return fail(doc, 'missing-layout', `Layout ${command.layoutId} does not exist.`);
      profile.layoutId = command.layoutId;
      return ok(next);
    }
    case 'profile.delete': {
      if (!next.profiles[command.profileId]) return fail(doc, 'missing-profile', `Profile ${command.profileId} does not exist.`);
      if (Object.keys(next.profiles).length <= 1) return fail(doc, 'protected-profile', 'The last profile cannot be deleted.');
      if (command.profileId === next.activeProfileId) {
        const fallback = command.fallbackProfileId ? next.profiles[command.fallbackProfileId] : undefined;
        if (!fallback || command.fallbackProfileId === command.profileId) {
          return fail(doc, 'protected-profile', `Active profile ${command.profileId} needs a different fallback profile before deletion.`);
        }
        if (!next.layouts[fallback.layoutId]) return fail(doc, 'missing-layout', `Layout ${fallback.layoutId} does not exist.`);
        next.activeProfileId = command.fallbackProfileId!;
      }
      delete next.profiles[command.profileId];
      return ok(next);
    }
    case 'layout.apply': {
      if (!next.layouts[command.layoutId]) return fail(doc, 'missing-layout', `Layout ${command.layoutId} does not exist.`);
      next.profiles[next.activeProfileId].layoutId = command.layoutId;
      return ok(next);
    }
    case 'layout.save': {
      next.layouts[command.layout.id] = { ...command.layout };
      return ok(next);
    }
    case 'layout.rename': {
      const target = next.layouts[command.layoutId];
      if (!target) return fail(doc, 'missing-layout', `Layout ${command.layoutId} does not exist.`);
      const label = command.label.trim();
      if (!label) return fail(doc, 'invalid-command', 'Layout label cannot be empty.');
      target.label = label;
      return ok(next);
    }
    case 'layout.delete': {
      if (!next.layouts[command.layoutId]) return fail(doc, 'missing-layout', `Layout ${command.layoutId} does not exist.`);
      if (layoutReferencedByProfile(next, command.layoutId)) {
        return fail(doc, 'protected-layout', `Layout ${command.layoutId} is used by a profile and cannot be deleted.`);
      }
      delete next.layouts[command.layoutId];
      return ok(next);
    }
    case 'library.panel.save': {
      next.panelLibrary[command.template.id] = { ...command.template };
      return ok(next);
    }
    case 'library.panel.rename': {
      const template = next.panelLibrary[command.templateId];
      if (!template) return fail(doc, 'missing-template', `Panel template ${command.templateId} does not exist.`);
      const title = command.title.trim();
      if (!title) return fail(doc, 'invalid-command', 'Panel template title cannot be empty.');
      template.title = title;
      return ok(next);
    }
    case 'library.panel.delete': {
      delete next.panelLibrary[command.templateId];
      return ok(next);
    }
    case 'library.widget.save': {
      next.widgetLibrary[command.template.id] = { ...command.template };
      return ok(next);
    }
    case 'library.widget.rename': {
      const template = next.widgetLibrary[command.templateId];
      if (!template) return fail(doc, 'missing-template', `Widget template ${command.templateId} does not exist.`);
      const title = command.title.trim();
      if (!title) return fail(doc, 'invalid-command', 'Widget template title cannot be empty.');
      template.title = title;
      return ok(next);
    }
    case 'library.widget.delete': {
      delete next.widgetLibrary[command.templateId];
      return ok(next);
    }
    default:
      return fail(doc, 'invalid-command', `Unsupported Workbench command: ${(command as { type?: string }).type ?? 'unknown'}`);
  }
}
