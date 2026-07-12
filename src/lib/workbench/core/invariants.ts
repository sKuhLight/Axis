import {
  createEmptyWorkbenchDocument,
  createEmptyDockLayout,
  createEmptyWorkbenchPage,
  createDefaultWidgetZoneLayout,
  createEmptyNavigationLayout,
  DEFAULT_WORKBENCH_PAGE_ID
} from './defaults';
import { createWorkbenchId, reserveWorkbenchIds } from './ids';
import {
  DOCK_REGION_IDS,
  WORKBENCH_SCHEMA_VERSION,
  type DockLayout,
  type DockNode,
  type DockRegionId,
  type JsonValue,
  type SplitDockNode,
  type TabStackDockNode,
  type WidgetInstance,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchPage,
  type WorkbenchPageLayout
} from './schema';

export type WorkbenchValidationSeverity = 'error' | 'warning';

export interface WorkbenchValidationIssue {
  code: string;
  message: string;
  path: string;
  severity: WorkbenchValidationSeverity;
}

export interface WorkbenchValidationResult {
  valid: boolean;
  issues: WorkbenchValidationIssue[];
}

const issue = (
  issues: WorkbenchValidationIssue[],
  code: string,
  message: string,
  path: string,
  severity: WorkbenchValidationSeverity = 'error'
): void => {
  issues.push({ code, message, path, severity });
};

export function cloneWorkbenchDocument<T extends JsonValue | WorkbenchDocument>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Keep only structurally-sound saved page layouts (id/label strings + a page
 * with a dock + a panels record). Interior ids are inert until apply re-mints
 * them, so we only need shape validation here, not deep dock repair. A bad or
 * missing store degrades to {}.
 */
function repairPageLayouts(
  store: Record<string, WorkbenchPageLayout> | undefined
): Record<string, WorkbenchPageLayout> {
  if (!isRecord(store)) return {};
  const next: Record<string, WorkbenchPageLayout> = {};
  for (const [id, entry] of Object.entries(store)) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) continue;
    const page = entry.page;
    if (!isRecord(page) || !isRecord(page.dock)) continue;
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : id;
    next[id] = {
      id: entry.id,
      label,
      page: page as unknown as WorkbenchPage,
      panels: isRecord(entry.panels) ? (entry.panels as WorkbenchPageLayout['panels']) : {},
      ...(typeof entry.createdAt === 'string' ? { createdAt: entry.createdAt } : {})
    };
  }
  return next;
}

export function isJsonSerializable(value: unknown, seen = new Set<unknown>()): boolean {
  if (value == null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(value);
  if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isJsonSerializable(item, seen));
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => isJsonSerializable(item, seen));
}

export function normalizeRatios(ratio: unknown, childCount: number): number[] {
  if (childCount <= 0) return [];
  if (!Array.isArray(ratio) || ratio.length !== childCount) {
    return new Array(childCount).fill(1 / childCount);
  }
  // Floor invalid or non-positive entries at 0.01 so no pane collapses to zero width and the division by `total` stays stable.
  const values = ratio.map((value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0.01));
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? values.map((value) => value / total) : new Array(childCount).fill(1 / childCount);
}

function validateDockNode(
  node: DockNode | null,
  layout: WorkbenchLayout,
  path: string,
  seenPanels: Map<string, string>,
  seenNodeIds: Map<string, string>,
  issues: WorkbenchValidationIssue[]
): void {
  if (!node) return;
  const firstNodePath = seenNodeIds.get(node.id);
  if (firstNodePath) {
    issue(issues, 'duplicate-node-id', `Dock node id ${node.id} appears more than once in the layout.`, `${path} (first: ${firstNodePath})`);
  } else {
    seenNodeIds.set(node.id, path);
  }
  if (node.kind === 'tabs') {
    if (!Array.isArray(node.panelIds)) {
      issue(issues, 'invalid-tabs', 'Tab stack panelIds must be an array.', `${path}.panelIds`);
      return;
    }
    for (const panelId of node.panelIds) {
      if (!layout.panels[panelId]) issue(issues, 'missing-panel-reference', `Panel ${panelId} is referenced but not defined.`, path);
      const firstPath = seenPanels.get(panelId);
      if (firstPath) issue(issues, 'duplicate-panel-reference', `Panel ${panelId} appears more than once in the dock tree.`, `${path} (first: ${firstPath})`);
      else seenPanels.set(panelId, path);
    }
    if (node.panelIds.length > 0 && !node.panelIds.includes(node.activePanelId)) {
      issue(issues, 'invalid-active-tab', `Active panel ${node.activePanelId} is not in tab stack ${node.id}.`, `${path}.activePanelId`);
    }
    return;
  }

  if (node.kind === 'split') {
    if (!Array.isArray(node.children) || node.children.length === 0) {
      issue(issues, 'empty-split', `Split ${node.id} has no children.`, `${path}.children`);
    }
    if (!Array.isArray(node.ratio) || node.ratio.length !== node.children.length) {
      issue(issues, 'invalid-split-ratio', `Split ${node.id} ratio count must match child count.`, `${path}.ratio`);
    }
    node.children.forEach((child, index) => validateDockNode(child, layout, `${path}.children[${index}]`, seenPanels, seenNodeIds, issues));
  }
}

export function validateWorkbenchDocument(doc: WorkbenchDocument): WorkbenchValidationResult {
  const issues: WorkbenchValidationIssue[] = [];

  if (!isJsonSerializable(doc)) {
    issue(issues, 'not-json-serializable', 'Workbench document must be serializable JSON.', '$');
  }
  if (doc.schemaVersion !== WORKBENCH_SCHEMA_VERSION) {
    issue(issues, 'unsupported-schema-version', `Unsupported schema version ${String(doc.schemaVersion)}.`, '$.schemaVersion');
  }
  if (!doc.profiles?.[doc.activeProfileId]) {
    issue(issues, 'active-profile-missing', `Active profile ${doc.activeProfileId} does not exist.`, '$.activeProfileId');
  }

  const activeProfile = doc.profiles?.[doc.activeProfileId];
  if (activeProfile && !doc.layouts?.[activeProfile.layoutId]) {
    issue(issues, 'active-layout-missing', `Active layout ${activeProfile.layoutId} does not exist.`, `$.profiles.${activeProfile.id}.layoutId`);
  }

  for (const [layoutId, layout] of Object.entries(doc.layouts ?? {})) {
    // Pages: at least one, a resolving activePageId, and a deduped pageOrder
    // that only references existing pages. Panel/node ids are unique across the
    // WHOLE layout (all pages share the seen-maps), so a panel docked on two
    // pages reports as `duplicate-panel-reference`.
    const pageIds = Object.keys(layout.pages ?? {});
    if (pageIds.length === 0) {
      issue(issues, 'missing-pages', `Layout ${layoutId} has no pages.`, `$.layouts.${layoutId}.pages`);
    }
    if (pageIds.length > 0 && !layout.pages?.[layout.activePageId]) {
      issue(issues, 'active-page-missing', `Active page ${layout.activePageId} does not exist.`, `$.layouts.${layoutId}.activePageId`);
    }
    const orderSeen = new Set<string>();
    for (const pageId of layout.pageOrder ?? []) {
      if (!layout.pages?.[pageId]) {
        issue(issues, 'missing-page-order-entry', `Page order references missing page ${pageId}.`, `$.layouts.${layoutId}.pageOrder`);
      }
      if (orderSeen.has(pageId)) {
        issue(issues, 'duplicate-page-order-entry', `Page ${pageId} appears more than once in pageOrder.`, `$.layouts.${layoutId}.pageOrder`);
      }
      orderSeen.add(pageId);
    }
    for (const pageId of pageIds) {
      if (!orderSeen.has(pageId)) {
        issue(issues, 'missing-page-order-entry', `Page ${pageId} is missing from pageOrder.`, `$.layouts.${layoutId}.pageOrder`);
      }
    }

    const seenPanels = new Map<string, string>();
    const seenNodeIds = new Map<string, string>();
    for (const [pageId, page] of Object.entries(layout.pages ?? {})) {
      for (const region of DOCK_REGION_IDS) {
        if (!page.dock?.regions?.[region]) {
          issue(issues, 'missing-region-state', `Dock region ${region} is missing state.`, `$.layouts.${layoutId}.pages.${pageId}.dock.regions.${region}`);
        }
        validateDockNode(page.dock?.root?.[region] ?? null, layout, `$.layouts.${layoutId}.pages.${pageId}.dock.root.${region}`, seenPanels, seenNodeIds, issues);
      }
    }

    for (const [groupId, group] of Object.entries(layout.widgetGroups ?? {})) {
      for (const widgetId of group.widgetIds ?? []) {
        if (!layout.widgets[widgetId]) {
          issue(issues, 'missing-widget-reference', `Widget group ${groupId} references missing widget ${widgetId}.`, `$.layouts.${layoutId}.widgetGroups.${groupId}`);
        }
      }
    }
    for (const [widgetId, widget] of Object.entries(layout.widgets ?? {})) {
      if (widget.groupId && !layout.widgetGroups?.[widget.groupId]) {
        issue(issues, 'missing-widget-group', `Widget ${widgetId} references missing group ${widget.groupId}.`, `$.layouts.${layoutId}.widgets.${widgetId}.groupId`);
      }
    }

    const navEntries = layout.navigation?.entries ?? {};
    const navSeen = new Set<string>();
    for (const id of layout.navigation?.order ?? []) {
      if (!navEntries[id]) issue(issues, 'missing-navigation-entry', `Navigation order references missing entry ${id}.`, `$.layouts.${layoutId}.navigation.order`);
      if (navSeen.has(id)) issue(issues, 'duplicate-navigation-entry', `Navigation entry ${id} appears more than once in order.`, `$.layouts.${layoutId}.navigation.order`);
      navSeen.add(id);
    }
    for (const [id, entry] of Object.entries(navEntries)) {
      if ((entry.locked || (entry.fixedSlot && entry.fixedSlot !== 'none')) && entry.hidden) {
        issue(issues, 'locked-navigation-hidden', `Locked/fixed navigation entry ${id} cannot be hidden.`, `$.layouts.${layoutId}.navigation.entries.${id}.hidden`);
      }
      if (entry.pageId && !layout.pages?.[entry.pageId]) {
        issue(issues, 'missing-navigation-page', `Navigation entry ${id} references missing page ${entry.pageId}.`, `$.layouts.${layoutId}.navigation.entries.${id}.pageId`);
      }
    }
  }

  return {
    valid: issues.every((entry) => entry.severity !== 'error'),
    issues
  };
}

function uniqueNodeId(node: DockNode, seenNodeIds: Set<string>): string {
  // Duplicate node ids happen when a persisted layout meets a fresh session id counter (see
  // reserveWorkbenchIds); keyed renders crash on them, so re-mint the later occurrence.
  let id = typeof node.id === 'string' && node.id ? node.id : createWorkbenchId(node.kind);
  if (seenNodeIds.has(id)) id = createWorkbenchId(node.kind);
  seenNodeIds.add(id);
  return id;
}

function repairDockNode(node: DockNode | null, layout: WorkbenchLayout, seenPanels: Set<string>, seenNodeIds: Set<string>): DockNode | null {
  if (!node) return null;
  if (node.kind === 'tabs') {
    const panelIds = (Array.isArray(node.panelIds) ? node.panelIds : []).filter((panelId) => {
      if (!layout.panels[panelId] || seenPanels.has(panelId)) return false;
      seenPanels.add(panelId);
      return true;
    });
    if (panelIds.length === 0) return null;
    const repaired: TabStackDockNode = {
      ...node,
      kind: 'tabs',
      id: uniqueNodeId(node, seenNodeIds),
      panelIds,
      activePanelId: panelIds.includes(node.activePanelId) ? node.activePanelId : panelIds[0]
    };
    return repaired;
  }

  if (node.kind === 'split') {
    const children = (Array.isArray(node.children) ? node.children : [])
      .map((child) => repairDockNode(child, layout, seenPanels, seenNodeIds))
      .filter((child): child is DockNode => !!child);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const repaired: SplitDockNode = {
      ...node,
      kind: 'split',
      id: uniqueNodeId(node, seenNodeIds),
      axis: node.axis === 'vertical' ? 'vertical' : 'horizontal',
      children,
      ratio: normalizeRatios(node.ratio, children.length)
    };
    return repaired;
  }

  return null;
}

function collectDockNodeIds(node: DockNode | null, ids: Set<string>): void {
  if (!node) return;
  if (typeof node.id === 'string' && node.id) ids.add(node.id);
  if (node.kind === 'split') {
    for (const child of Array.isArray(node.children) ? node.children : []) collectDockNodeIds(child, ids);
  }
}

function collectDocumentIds(doc: WorkbenchDocument): Set<string> {
  const ids = new Set<string>();
  for (const key of Object.keys(doc.profiles ?? {})) ids.add(key);
  for (const key of Object.keys(doc.panelLibrary ?? {})) ids.add(key);
  for (const key of Object.keys(doc.widgetLibrary ?? {})) ids.add(key);
  for (const [layoutId, layout] of Object.entries(doc.layouts ?? {})) {
    ids.add(layoutId);
    for (const key of Object.keys(layout.panels ?? {})) ids.add(key);
    for (const key of Object.keys(layout.widgets ?? {})) ids.add(key);
    for (const key of Object.keys(layout.widgetGroups ?? {})) ids.add(key);
    // Reserve across ALL pages (and any not-yet-migrated legacy dock), so ids
    // minted this session can never collide with a persisted page interior.
    for (const [pageId, page] of Object.entries(layout.pages ?? {})) {
      ids.add(pageId);
      for (const region of DOCK_REGION_IDS) collectDockNodeIds(page?.dock?.root?.[region] ?? null, ids);
    }
    for (const region of DOCK_REGION_IDS) collectDockNodeIds(layout.dock?.root?.[region] ?? null, ids);
  }
  return ids;
}

function collectDockPanelIds(node: DockNode | null, ids: Set<string>): void {
  if (!node) return;
  if (node.kind === 'tabs') {
    for (const panelId of Array.isArray(node.panelIds) ? node.panelIds : []) ids.add(panelId);
    return;
  }
  if (node.kind === 'split') {
    for (const child of Array.isArray(node.children) ? node.children : []) collectDockPanelIds(child, ids);
  }
}

function dedupeSingletonPanels(layout: WorkbenchLayout): void {
  const docked = new Set<string>();
  for (const page of orderedLayoutPages(layout)) {
    for (const region of DOCK_REGION_IDS) collectDockPanelIds(page.dock.root[region], docked);
  }
  const keptByKey = new Map<string, string>();
  for (const panel of Object.values(layout.panels)) {
    if (!panel.singletonKey) continue;
    const kept = keptByKey.get(panel.singletonKey);
    if (!kept) {
      keptByKey.set(panel.singletonKey, panel.id);
      continue;
    }
    if (!docked.has(kept) && docked.has(panel.id)) {
      delete layout.panels[kept];
      keptByKey.set(panel.singletonKey, panel.id);
    } else {
      delete layout.panels[panel.id];
    }
  }
}

function normalizeWidgetOrders(layout: WorkbenchLayout): void {
  const byZone = new Map<string, WidgetInstance[]>();
  for (const widget of Object.values(layout.widgets)) {
    widget.size = widget.size ?? 'default';
    widget.zone = typeof widget.zone === 'string' ? widget.zone : 'hidden';
    widget.order = Number.isFinite(widget.order) ? widget.order : 0;
    const list = byZone.get(widget.zone) ?? [];
    list.push(widget);
    byZone.set(widget.zone, list);
  }
  for (const widgets of byZone.values()) {
    widgets.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    widgets.forEach((widget, index) => {
      widget.order = index;
    });
  }
}

function normalizeWidgetGroups(layout: WorkbenchLayout): void {
  layout.widgetGroups = layout.widgetGroups ?? {};
  for (const widget of Object.values(layout.widgets)) {
    if (!widget.groupId) continue;
    layout.widgetGroups[widget.groupId] ??= { id: widget.groupId, widgetIds: [] };
    if (!layout.widgetGroups[widget.groupId].widgetIds.includes(widget.id)) {
      layout.widgetGroups[widget.groupId].widgetIds.push(widget.id);
    }
  }

  for (const [groupId, group] of Object.entries({ ...layout.widgetGroups })) {
    const widgetIds = (group.widgetIds ?? []).filter((widgetId) => !!layout.widgets[widgetId]);
    const extra = Object.values(layout.widgets)
      .filter((widget) => widget.groupId === groupId && !widgetIds.includes(widget.id))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((widget) => widget.id);
    const repairedIds = [...widgetIds, ...extra];
    if (repairedIds.length < 2) {
      delete layout.widgetGroups[groupId];
      for (const widgetId of repairedIds) {
        if (layout.widgets[widgetId]?.groupId === groupId) layout.widgets[widgetId].groupId = null;
      }
      continue;
    }
    layout.widgetGroups[groupId] = { ...group, id: groupId, widgetIds: repairedIds };
    for (const widgetId of repairedIds) layout.widgets[widgetId].groupId = groupId;
  }

  for (const widget of Object.values(layout.widgets)) {
    if (widget.groupId && !layout.widgetGroups[widget.groupId]) widget.groupId = null;
  }
}

function normalizeNavigation(layout: WorkbenchLayout): void {
  layout.navigation = layout.navigation ?? createEmptyNavigationLayout();
  layout.navigation.entries = layout.navigation.entries ?? {};
  layout.navigation.order = Array.isArray(layout.navigation.order) ? layout.navigation.order : [];
  // Dangling page bindings: an entry pointing at a page that no longer exists
  // loses the binding — and when it has no other purpose (no command target),
  // the whole entry is removed (a pure page entry without its page is dead).
  for (const [id, entry] of Object.entries(layout.navigation.entries)) {
    if (typeof entry.pageId === 'string' && !layout.pages?.[entry.pageId]) {
      if (entry.target) delete entry.pageId;
      else delete layout.navigation.entries[id];
    }
  }
  const seen = new Set<string>();
  layout.navigation.order = layout.navigation.order.filter((id) => {
    if (!layout.navigation.entries[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of Object.keys(layout.navigation.entries).sort()) {
    const entry = layout.navigation.entries[id];
    entry.id = entry.id || id;
    if ((entry.locked || (entry.fixedSlot && entry.fixedSlot !== 'none')) && entry.hidden) entry.hidden = false;
    if (!seen.has(id)) layout.navigation.order.push(id);
  }
  if (layout.navigation.mode !== 'bottom') layout.navigation.mode = 'side';
}

function ensureDockShape(dock: DockLayout | undefined): DockLayout {
  const next = dock ?? createEmptyDockLayout();
  next.regions = next.regions ?? createEmptyDockLayout().regions;
  next.root = next.root ?? createEmptyDockLayout().root;
  for (const region of DOCK_REGION_IDS) {
    next.regions[region] ??= { collapsed: false };
    next.root[region] ??= null;
  }
  return next;
}

/** Pages of a layout in canonical (pageOrder) order. Call after {@link ensurePagesShape}. */
function orderedLayoutPages(layout: WorkbenchLayout): WorkbenchPage[] {
  const order = Array.isArray(layout.pageOrder) ? layout.pageOrder : [];
  const seen = new Set<string>();
  const pages: WorkbenchPage[] = [];
  for (const id of order) {
    const page = layout.pages?.[id];
    if (page && !seen.has(id)) {
      seen.add(id);
      pages.push(page);
    }
  }
  for (const [id, page] of Object.entries(layout.pages ?? {})) {
    if (!seen.has(id)) pages.push(page);
  }
  return pages;
}

/**
 * Guarantee the pages invariants: ≥1 page (a legacy v1 `layout.dock` is wrapped
 * into the default page; otherwise an empty page is created), every page has a
 * well-formed dock, `pageOrder` is deduped + complete, and `activePageId`
 * resolves. The deprecated `layout.dock` is consumed and DELETED — runtime code
 * only ever sees page docks.
 */
function ensurePagesShape(layout: WorkbenchLayout): void {
  const pages: Record<string, WorkbenchPage> = {};
  for (const [id, page] of Object.entries(layout.pages ?? {})) {
    if (!page || typeof page !== 'object') continue;
    const pageId = typeof page.id === 'string' && page.id ? page.id : id;
    pages[id] = {
      ...page,
      id: pageId === id ? pageId : id,
      label: typeof page.label === 'string' && page.label.trim() ? page.label : id,
      dock: ensureDockShape(page.dock)
    };
  }

  if (Object.keys(pages).length === 0) {
    // Legacy single-dock layout (schema v1) or a brand-new shell: wrap whatever
    // dock exists into one default page so the layout renders exactly as before.
    const page = createEmptyWorkbenchPage({
      id: DEFAULT_WORKBENCH_PAGE_ID,
      dock: ensureDockShape(layout.dock)
    });
    pages[page.id] = page;
  }
  delete layout.dock;
  layout.pages = pages;

  const order = Array.isArray(layout.pageOrder) ? layout.pageOrder : [];
  const seen = new Set<string>();
  layout.pageOrder = order.filter((id) => {
    if (typeof id !== 'string' || !pages[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of Object.keys(pages).sort()) {
    if (!seen.has(id)) layout.pageOrder.push(id);
  }
  if (!pages[layout.activePageId]) layout.activePageId = layout.pageOrder[0];
}

function ensureLayoutShape(layout: WorkbenchLayout): void {
  ensurePagesShape(layout);
  layout.panels = layout.panels ?? {};
  layout.widgets = layout.widgets ?? {};
  layout.widgetGroups = layout.widgetGroups ?? {};
  layout.zones = layout.zones ?? createDefaultWidgetZoneLayout();
  layout.settings = layout.settings ?? {};
  normalizeNavigation(layout);
}

export function repairWorkbenchDocument(doc: WorkbenchDocument): WorkbenchDocument {
  let next: WorkbenchDocument;
  try {
    next = cloneWorkbenchDocument(doc);
  } catch {
    return createEmptyWorkbenchDocument();
  }

  next.schemaVersion = WORKBENCH_SCHEMA_VERSION;
  next.profiles = next.profiles ?? {};
  next.layouts = next.layouts ?? {};
  next.panelLibrary = next.panelLibrary ?? {};
  next.widgetLibrary = next.widgetLibrary ?? {};
  next.pageLayouts = repairPageLayouts(next.pageLayouts);

  if (!next.profiles[next.activeProfileId]) {
    const firstProfile = Object.values(next.profiles)[0];
    if (firstProfile) next.activeProfileId = firstProfile.id;
    else return createEmptyWorkbenchDocument();
  }

  const activeProfile = next.profiles[next.activeProfileId];
  if (!next.layouts[activeProfile.layoutId]) {
    const firstLayout = Object.values(next.layouts)[0];
    if (firstLayout) activeProfile.layoutId = firstLayout.id;
    else return createEmptyWorkbenchDocument();
  }

  // Keep the session id counters ahead of every id already present in the document, so ids minted
  // during this session (splits, tab stacks, groups, …) can never collide with persisted ones.
  reserveWorkbenchIds(collectDocumentIds(next));

  for (const layout of Object.values(next.layouts)) {
    ensureLayoutShape(layout);
    dedupeSingletonPanels(layout);
    // The seen-sets are shared across ALL pages: a panel id may appear in at
    // most one page's dock (first occurrence in page order wins) and dock node
    // ids stay unique layout-wide. Pages are repaired in pageOrder order so the
    // "keep first occurrence" rule is deterministic.
    const seenPanels = new Set<string>();
    const seenNodeIds = new Set<string>();
    for (const page of orderedLayoutPages(layout)) {
      for (const region of DOCK_REGION_IDS) {
        page.dock.root[region] = repairDockNode(page.dock.root[region], layout, seenPanels, seenNodeIds);
      }
    }
    normalizeWidgetGroups(layout);
    normalizeWidgetOrders(layout);
    normalizeNavigation(layout);
  }

  return next;
}
