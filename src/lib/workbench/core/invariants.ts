import { createEmptyWorkbenchDocument, createEmptyDockLayout, createDefaultWidgetZoneLayout, createEmptyNavigationLayout } from './defaults';
import {
  DOCK_REGION_IDS,
  WORKBENCH_SCHEMA_VERSION,
  type DockNode,
  type DockRegionId,
  type JsonValue,
  type SplitDockNode,
  type TabStackDockNode,
  type WidgetInstance,
  type WorkbenchDocument,
  type WorkbenchLayout
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
  const values = ratio.map((value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0.01));
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? values.map((value) => value / total) : new Array(childCount).fill(1 / childCount);
}

function validateDockNode(
  node: DockNode | null,
  layout: WorkbenchLayout,
  path: string,
  seenPanels: Map<string, string>,
  issues: WorkbenchValidationIssue[]
): void {
  if (!node) return;
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
    node.children.forEach((child, index) => validateDockNode(child, layout, `${path}.children[${index}]`, seenPanels, issues));
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
    const seenPanels = new Map<string, string>();
    for (const region of DOCK_REGION_IDS) {
      if (!layout.dock?.regions?.[region]) {
        issue(issues, 'missing-region-state', `Dock region ${region} is missing state.`, `$.layouts.${layoutId}.dock.regions.${region}`);
      }
      validateDockNode(layout.dock?.root?.[region] ?? null, layout, `$.layouts.${layoutId}.dock.root.${region}`, seenPanels, issues);
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
    }
  }

  return {
    valid: issues.every((entry) => entry.severity !== 'error'),
    issues
  };
}

function repairDockNode(node: DockNode | null, layout: WorkbenchLayout, seenPanels: Set<string>): DockNode | null {
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
      panelIds,
      activePanelId: panelIds.includes(node.activePanelId) ? node.activePanelId : panelIds[0]
    };
    return repaired;
  }

  if (node.kind === 'split') {
    const children = (Array.isArray(node.children) ? node.children : [])
      .map((child) => repairDockNode(child, layout, seenPanels))
      .filter((child): child is DockNode => !!child);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const repaired: SplitDockNode = {
      ...node,
      kind: 'split',
      axis: node.axis === 'vertical' ? 'vertical' : 'horizontal',
      children,
      ratio: normalizeRatios(node.ratio, children.length)
    };
    return repaired;
  }

  return null;
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

function ensureLayoutShape(layout: WorkbenchLayout): void {
  layout.dock = layout.dock ?? createEmptyDockLayout();
  layout.dock.regions = layout.dock.regions ?? createEmptyDockLayout().regions;
  layout.dock.root = layout.dock.root ?? createEmptyDockLayout().root;
  for (const region of DOCK_REGION_IDS) {
    layout.dock.regions[region] ??= { collapsed: false };
    layout.dock.root[region] ??= null;
  }
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

  for (const layout of Object.values(next.layouts)) {
    ensureLayoutShape(layout);
    const seenPanels = new Set<string>();
    for (const region of DOCK_REGION_IDS) {
      layout.dock.root[region] = repairDockNode(layout.dock.root[region], layout, seenPanels);
    }
    normalizeWidgetGroups(layout);
    normalizeWidgetOrders(layout);
    normalizeNavigation(layout);
  }

  return next;
}
