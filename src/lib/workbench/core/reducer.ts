import type {
  DockAxis,
  DockNode,
  DockRegionId,
  FloatingRect,
  NavigationEntryState,
  PanelInstance,
  SplitDockNode,
  TabStackDockNode,
  WidgetInstance,
  WidgetZoneId,
  WorkbenchDocument,
  WorkbenchLayout
} from './schema';
import { DEFAULT_WIDGET_ZONES, isDockRegionId } from './schema';
import { createWorkbenchId } from './ids';
import { cloneWorkbenchDocument, normalizeRatios, repairWorkbenchDocument } from './invariants';
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

function removePanelFromNode(node: DockNode | null, panelId: string): { node: DockNode | null; removed: boolean } {
  if (!node) return { node, removed: false };
  if (node.kind === 'tabs') {
    if (!node.panelIds.includes(panelId)) return { node, removed: false };
    const panelIds = node.panelIds.filter((id) => id !== panelId);
    if (panelIds.length === 0) return { node: null, removed: true };
    return {
      removed: true,
      node: {
        ...node,
        panelIds,
        activePanelId: panelIds.includes(node.activePanelId) ? node.activePanelId : panelIds[0]
      }
    };
  }

  let removed = false;
  const children = node.children
    .map((child) => {
      const result = removePanelFromNode(child, panelId);
      removed = removed || result.removed;
      return result.node;
    })
    .filter((child): child is DockNode => !!child);
  if (!removed) return { node, removed: false };
  if (children.length === 0) return { node: null, removed: true };
  if (children.length === 1) return { node: children[0], removed: true };
  return {
    removed: true,
    node: {
      ...node,
      children,
      ratio: normalizeRatios(node.ratio, children.length)
    }
  };
}

function removePanelFromDock(layout: WorkbenchLayout, panelId: string): boolean {
  let removed = false;
  for (const region of Object.keys(layout.dock.root) as DockRegionId[]) {
    const result = removePanelFromNode(layout.dock.root[region], panelId);
    layout.dock.root[region] = result.node;
    removed = removed || result.removed;
  }
  return removed;
}

// Run `finder` against each region root and return the first defined match. Every dock lookup
// (tab stack by id/panel, split by id) shares this "walk all region roots, first hit wins" shape.
function findAcrossRegions<T>(layout: WorkbenchLayout, finder: (node: DockNode | null) => T | undefined): T | undefined {
  for (const node of Object.values(layout.dock.root)) {
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

function appendPanelToRegion(layout: WorkbenchLayout, panelId: string, region: DockRegionId, index?: number): InsertResult {
  if (!isDockRegionId(region)) return { success: false, code: 'invalid-region', message: `Invalid dock region: ${region}` };
  const root = layout.dock.root[region];
  if (!root) {
    layout.dock.root[region] = makeTabStack(panelId);
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

function insertPanelIntoTab(layout: WorkbenchLayout, panelId: string, target: Extract<DockTarget, { kind: 'tab' }>): InsertResult {
  const stack = findAcrossRegions(layout, (node) =>
    target.tabStackId ? findTabStackById(node, target.tabStackId) : target.targetPanelId ? findTabStackByPanel(node, target.targetPanelId) : undefined
  );
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

function insertPanelAsSplit(layout: WorkbenchLayout, panelId: string, target: Extract<DockTarget, { kind: 'split' }>): InsertResult {
  const position = target.position ?? 'after';
  if (target.targetPanelId) {
    for (const region of Object.keys(layout.dock.root) as DockRegionId[]) {
      const result = splitNearTarget(layout.dock.root[region], panelId, target.targetPanelId, target.axis, position);
      if (result.inserted) {
        layout.dock.root[region] = result.node;
        return { success: true };
      }
    }
    return { success: false, code: 'missing-target', message: `Target panel ${target.targetPanelId} was not found.` };
  }

  const region = target.region;
  if (!region) return { success: false, code: 'missing-target', message: 'Split target needs a region or target panel.' };
  if (!isDockRegionId(region)) return { success: false, code: 'invalid-region', message: `Invalid dock region: ${region}` };
  const root = layout.dock.root[region];
  if (!root) {
    layout.dock.root[region] = makeTabStack(panelId);
    return { success: true };
  }
  const newStack = makeTabStack(panelId);
  layout.dock.root[region] = makeSplit(target.axis, position === 'before' ? [newStack, root] : [root, newStack]);
  return { success: true };
}

function insertPanel(layout: WorkbenchLayout, panelId: string, target: DockTarget | undefined, fallbackRegion: DockRegionId): InsertResult {
  if (!target || target.kind === 'region') {
    return appendPanelToRegion(layout, panelId, target?.region ?? fallbackRegion, target?.index);
  }
  if (target.kind === 'tab') return insertPanelIntoTab(layout, panelId, target);
  return insertPanelAsSplit(layout, panelId, target);
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

export function reduceWorkbenchDocument(doc: WorkbenchDocument, command: WorkbenchCommand): WorkbenchCommandResult {
  const next = cloneWorkbenchDocument(doc);
  const layout = activeLayout(next);
  if (!layout) return fail(doc, 'active-layout-missing', 'The active Workbench layout could not be found.');

  switch (command.type) {
    case 'panel.add': {
      if (layout.panels[command.panel.id]) return fail(doc, 'duplicate-id', `Panel ${command.panel.id} already exists.`);
      const conflict = findSingletonConflict(layout, command.panel);
      if (conflict) return fail(doc, 'duplicate-singleton', `Panel singleton ${command.panel.singletonKey} already exists as ${conflict.id}.`);
      layout.panels[command.panel.id] = { ...command.panel };
      const result = insertPanel(layout, command.panel.id, command.target, command.region);
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not add panel.');
    }
    case 'panel.close': {
      const panel = layout.panels[command.panelId];
      if (!panel) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      if (panel.locked) return fail(doc, 'locked-panel', `Panel ${command.panelId} is locked and cannot be closed.`);
      removePanelFromDock(layout, command.panelId);
      removePanelOwnedWidgets(layout, command.panelId);
      delete layout.panels[command.panelId];
      return ok(next);
    }
    case 'panel.move': {
      if (!layout.panels[command.panelId]) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      removePanelFromDock(layout, command.panelId);
      const result = insertPanel(layout, command.panelId, command.to, 'main');
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not move panel.');
    }
    case 'panel.tab': {
      if (!layout.panels[command.panelId]) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      if (!layout.panels[command.targetPanelId]) return fail(doc, 'missing-target', `Target panel ${command.targetPanelId} does not exist.`);
      removePanelFromDock(layout, command.panelId);
      const result = insertPanelIntoTab(layout, command.panelId, { kind: 'tab', targetPanelId: command.targetPanelId, index: command.index });
      return result.success ? ok(next) : fail(doc, result.code ?? 'invalid-command', result.message ?? 'Could not tab panel.');
    }
    case 'panel.activate': {
      if (!layout.panels[command.panelId]) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      const stack = findAcrossRegions(layout, (node) => findTabStackByPanel(node, command.panelId));
      if (!stack) return fail(doc, 'missing-target', `Panel ${command.panelId} is not in a tab stack.`);
      stack.activePanelId = command.panelId;
      return ok(next);
    }
    case 'panel.split': {
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
        removePanelFromDock(layout, panelId);
      }
      const result = insertPanelAsSplit(layout, panelId, {
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
    case 'panel.collapse': {
      const panel = layout.panels[command.panelId];
      if (!panel) return fail(doc, 'missing-panel', `Panel ${command.panelId} does not exist.`);
      if (panel.collapsible === false) return fail(doc, 'invalid-command', `Panel ${command.panelId} is not collapsible.`);
      panel.collapsed = command.collapsed;
      return ok(next);
    }
    case 'region.resize': {
      if (!isDockRegionId(command.region)) return fail(doc, 'invalid-region', `Invalid dock region: ${command.region}`);
      layout.dock.regions[command.region].sizePx = Math.max(0, command.sizePx);
      return ok(next);
    }
    case 'region.collapse': {
      if (!isDockRegionId(command.region)) return fail(doc, 'invalid-region', `Invalid dock region: ${command.region}`);
      layout.dock.regions[command.region].collapsed = command.collapsed;
      return ok(next);
    }
    case 'split.resize': {
      const split = findAcrossRegions(layout, (node) => findSplitById(node, command.splitId));
      if (!split) return fail(doc, 'missing-split', `Split ${command.splitId} does not exist.`);
      split.ratio = normalizeRatios(command.ratio, split.children.length);
      return ok(next);
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
      if (!next.layouts[profile.layoutId]) return fail(doc, 'missing-layout', `Layout ${profile.layoutId} does not exist.`);
      next.activeProfileId = command.profileId;
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
