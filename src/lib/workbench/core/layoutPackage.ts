import { createWorkbenchId, reserveWorkbenchIds } from './ids';
import { cloneWorkbenchDocument, isJsonSerializable, repairWorkbenchDocument, validateWorkbenchDocument } from './invariants';
import { WORKBENCH_SCHEMA_VERSION } from './schema';
import type {
  DockNode,
  PanelInstance,
  PanelTemplate,
  WidgetGroup,
  WidgetInstance,
  WorkbenchLayout
} from './schema';

/**
 * Portable, self-contained layout/panel packages (task T29).
 *
 * These packages are the on-disk (`.json`) interchange format for sharing a saved
 * layout or a panel template between documents / machines / users. Unlike the
 * in-session `packages.ts` helpers (which produce reducer commands and only re-key
 * the top-level entry), the import path here **deep re-mints every id** the payload
 * carries — the layout id, panel ids, widget ids, group ids, and dock-node ids —
 * through {@link createWorkbenchId}. That is the T02 crash class: an imported
 * `tabs-0001` / `panel.a` colliding with an id already live in the target document
 * produces duplicate keyed-each ids and crashes the dock render. Re-minting makes a
 * round-trip (export → import into the very document you exported from) collision-free
 * by construction.
 */

export const LAYOUT_PACKAGE_KIND = 'workbench.layout.package' as const;
export const PANEL_PACKAGE_KIND = 'workbench.panel.package' as const;
export const LAYOUT_PACKAGE_VERSION = 1 as const;

export type LayoutPackageKind = typeof LAYOUT_PACKAGE_KIND | typeof PANEL_PACKAGE_KIND;

export interface LayoutPackage {
  kind: typeof LAYOUT_PACKAGE_KIND;
  version: typeof LAYOUT_PACKAGE_VERSION;
  schemaVersion: typeof WORKBENCH_SCHEMA_VERSION;
  /** The full, self-contained layout (dock tree, panels, widgets, groups, nav, zones). */
  layout: WorkbenchLayout;
}

export interface PanelPackage {
  kind: typeof PANEL_PACKAGE_KIND;
  version: typeof LAYOUT_PACKAGE_VERSION;
  schemaVersion: typeof WORKBENCH_SCHEMA_VERSION;
  template: PanelTemplate;
}

export type WorkbenchPortablePackage = LayoutPackage | PanelPackage;

export type LayoutPackageErrorCode =
  | 'not-an-object'
  | 'wrong-kind'
  | 'wrong-version'
  | 'wrong-schema-version'
  | 'malformed'
  | 'not-serializable'
  | 'invalid-after-import';

export class LayoutPackageError extends Error {
  readonly code: LayoutPackageErrorCode;
  constructor(code: LayoutPackageErrorCode, message: string) {
    super(message);
    this.name = 'LayoutPackageError';
    this.code = code;
  }
}

export type ImportLayoutResult<TPayload> =
  | { success: true; payload: TPayload }
  | { success: false; error: LayoutPackageError };

const clone = <T>(value: T): T => cloneWorkbenchDocument(value as never) as T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const PANEL_ZONE_PREFIX = 'panel:';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportLayoutPackage(doc: { layouts: Record<string, WorkbenchLayout> }, layoutId: string): LayoutPackage | null {
  const layout = doc.layouts[layoutId];
  if (!layout) return null;
  return {
    kind: LAYOUT_PACKAGE_KIND,
    version: LAYOUT_PACKAGE_VERSION,
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    layout: clone(layout)
  };
}

export function exportPanelPackage(doc: { panelLibrary: Record<string, PanelTemplate> }, templateId: string): PanelPackage | null {
  const template = doc.panelLibrary[templateId];
  if (!template) return null;
  return {
    kind: PANEL_PACKAGE_KIND,
    version: LAYOUT_PACKAGE_VERSION,
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    template: clone(template)
  };
}

/** A stable, filesystem-safe filename stem for a package download (no extension). */
export function layoutPackageFilename(title: string, fallback = 'layout'): string {
  const stem = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || fallback;
}

// ---------------------------------------------------------------------------
// Id re-minting (the T02-safe core)
// ---------------------------------------------------------------------------

/** A prefix hint for `createWorkbenchId` derived from an existing id, e.g. `panel.a` → `panel`. */
function prefixOf(id: string, fallback: string): string {
  const head = id.split(/[.\-:]/)[0];
  return head || fallback;
}

function remapDockNode(node: DockNode | null, panelIdMap: Map<string, string>): DockNode | null {
  if (!node) return null;
  if (node.kind === 'tabs') {
    const panelIds = node.panelIds.map((id) => panelIdMap.get(id) ?? id);
    return {
      kind: 'tabs',
      id: createWorkbenchId('tabs'),
      activePanelId: panelIdMap.get(node.activePanelId) ?? node.activePanelId,
      panelIds
    };
  }
  return {
    kind: 'split',
    id: createWorkbenchId('split'),
    axis: node.axis,
    ratio: [...node.ratio],
    children: node.children.map((child) => remapDockNode(child, panelIdMap)).filter((child): child is DockNode => child !== null)
  };
}

/** Remap a `panel:<id>` widget zone reference through the panel id map; other zones pass through. */
function remapZone(zone: string, panelIdMap: Map<string, string>): string {
  if (!zone.startsWith(PANEL_ZONE_PREFIX)) return zone;
  const sourcePanelId = zone.slice(PANEL_ZONE_PREFIX.length);
  const mapped = panelIdMap.get(sourcePanelId);
  return mapped ? `${PANEL_ZONE_PREFIX}${mapped}` : zone;
}

interface RemappedLayoutBits {
  panels: Record<string, PanelInstance>;
  widgets: Record<string, WidgetInstance>;
  widgetGroups: Record<string, WidgetGroup>;
  panelIdMap: Map<string, string>;
}

function remapLayoutBits(
  panels: Record<string, PanelInstance>,
  widgets: Record<string, WidgetInstance>,
  widgetGroups: Record<string, WidgetGroup>
): RemappedLayoutBits {
  const panelIdMap = new Map<string, string>();
  const widgetIdMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();

  for (const id of Object.keys(panels)) panelIdMap.set(id, createWorkbenchId(prefixOf(id, 'panel')));
  for (const id of Object.keys(widgets)) widgetIdMap.set(id, createWorkbenchId(prefixOf(id, 'widget')));
  for (const id of Object.keys(widgetGroups)) groupIdMap.set(id, createWorkbenchId(prefixOf(id, 'group')));

  const nextPanels: Record<string, PanelInstance> = {};
  for (const panel of Object.values(panels)) {
    const id = panelIdMap.get(panel.id) ?? panel.id;
    nextPanels[id] = { ...clone(panel), id };
  }

  const nextWidgets: Record<string, WidgetInstance> = {};
  for (const widget of Object.values(widgets)) {
    const id = widgetIdMap.get(widget.id) ?? widget.id;
    const groupId = widget.groupId ? groupIdMap.get(widget.groupId) ?? null : (widget.groupId ?? null);
    nextWidgets[id] = { ...clone(widget), id, zone: remapZone(widget.zone, panelIdMap), groupId };
  }

  const nextGroups: Record<string, WidgetGroup> = {};
  for (const group of Object.values(widgetGroups)) {
    const id = groupIdMap.get(group.id) ?? group.id;
    nextGroups[id] = {
      ...clone(group),
      id,
      widgetIds: group.widgetIds.map((widgetId) => widgetIdMap.get(widgetId) ?? widgetId)
    };
  }

  return { panels: nextPanels, widgets: nextWidgets, widgetGroups: nextGroups, panelIdMap };
}

/**
 * Deep-clone a layout with every interior id re-minted so it cannot collide with any
 * id already present in a target document. Reserves the source ids first so a later
 * `createWorkbenchId` call in the same session never reproduces them.
 */
export function remintLayout(layout: WorkbenchLayout): WorkbenchLayout {
  reserveWorkbenchIds(collectLayoutIds(layout));
  const { panels, widgets, widgetGroups, panelIdMap } = remapLayoutBits(layout.panels, layout.widgets, layout.widgetGroups);
  const root = Object.fromEntries(
    Object.entries(layout.dock.root).map(([region, node]) => [region, remapDockNode(node, panelIdMap)])
  ) as WorkbenchLayout['dock']['root'];

  return {
    ...clone(layout),
    id: createWorkbenchId(prefixOf(layout.id, 'layout')),
    dock: { regions: clone(layout.dock.regions), root },
    panels,
    widgets,
    widgetGroups
  };
}

/**
 * Deep-clone a layout re-minting every **interior** id (dock nodes, panels, widgets,
 * groups, `panel:` zone refs, tab-stack `panelIds`) so it cannot collide with any id
 * already live in a target document — but keep a caller-supplied top-level `layoutId`
 * rather than minting a fresh one. This is the collision-safe core of {@link remintLayout}
 * exposed for the command-based import path (`packages.ts`), which owns its own top-level
 * id policy (`.copyN` de-dup / explicit id / overwrite) and only needs the interior fixed.
 *
 * Reserves the source ids first so a later `createWorkbenchId` never reproduces them.
 */
export function remintLayoutInteriorIds(layout: WorkbenchLayout, layoutId: string): WorkbenchLayout {
  reserveWorkbenchIds(collectLayoutIds(layout));
  const { panels, widgets, widgetGroups, panelIdMap } = remapLayoutBits(layout.panels, layout.widgets, layout.widgetGroups);
  const root = Object.fromEntries(
    Object.entries(layout.dock.root).map(([region, node]) => [region, remapDockNode(node, panelIdMap)])
  ) as WorkbenchLayout['dock']['root'];

  return {
    ...clone(layout),
    id: layoutId,
    dock: { regions: clone(layout.dock.regions), root },
    panels,
    widgets,
    widgetGroups
  };
}

/** Deep-clone a panel template with every interior id (template, panels, widgets, groups, dock) re-minted. */
export function remintPanelTemplate(template: PanelTemplate): PanelTemplate {
  reserveWorkbenchIds(collectPanelTemplateIds(template));
  const { panels, widgets, widgetGroups, panelIdMap } = remapLayoutBits(
    template.panels,
    template.widgets ?? {},
    template.widgetGroups ?? {}
  );
  return {
    ...clone(template),
    id: createWorkbenchId(prefixOf(template.id, 'template')),
    panels,
    widgets,
    widgetGroups,
    dock: remapDockNode(template.dock ?? null, panelIdMap)
  };
}

function collectLayoutIds(layout: WorkbenchLayout): string[] {
  const ids: string[] = [layout.id];
  const walk = (node: DockNode | null): void => {
    if (!node) return;
    ids.push(node.id);
    if (node.kind === 'split') node.children.forEach(walk);
  };
  for (const node of Object.values(layout.dock.root)) walk(node);
  ids.push(...Object.keys(layout.panels), ...Object.keys(layout.widgets), ...Object.keys(layout.widgetGroups));
  return ids;
}

function collectPanelTemplateIds(template: PanelTemplate): string[] {
  const ids: string[] = [template.id, ...Object.keys(template.panels)];
  if (template.widgets) ids.push(...Object.keys(template.widgets));
  if (template.widgetGroups) ids.push(...Object.keys(template.widgetGroups));
  const walk = (node: DockNode | null): void => {
    if (!node) return;
    ids.push(node.id);
    if (node.kind === 'split') node.children.forEach(walk);
  };
  walk(template.dock ?? null);
  return ids;
}

// ---------------------------------------------------------------------------
// Import (parse + validate + re-mint)
// ---------------------------------------------------------------------------

function baseChecks(input: unknown, kind: LayoutPackageKind): LayoutPackageError | null {
  if (!isRecord(input)) return new LayoutPackageError('not-an-object', 'Package must be a JSON object.');
  if (input.kind !== kind) return new LayoutPackageError('wrong-kind', `Expected a ${kind} package.`);
  if (input.version !== LAYOUT_PACKAGE_VERSION) {
    return new LayoutPackageError('wrong-version', `Unsupported package version ${String(input.version)}.`);
  }
  if (input.schemaVersion !== WORKBENCH_SCHEMA_VERSION) {
    return new LayoutPackageError('wrong-schema-version', `Unsupported schema version ${String(input.schemaVersion)}.`);
  }
  if (!isJsonSerializable(input)) return new LayoutPackageError('not-serializable', 'Package is not serializable JSON.');
  return null;
}

function looksLikeLayout(value: unknown): value is WorkbenchLayout {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRecord(value.dock) &&
    isRecord((value.dock as Record<string, unknown>).root) &&
    isRecord(value.panels) &&
    isRecord(value.widgets) &&
    isRecord(value.widgetGroups) &&
    isRecord(value.navigation) &&
    isRecord(value.zones)
  );
}

function looksLikePanelTemplate(value: unknown): value is PanelTemplate {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string' && isRecord(value.panels);
}

/**
 * Parse + validate a layout package and return a fully re-minted, collision-free
 * layout ready to hand to `layout.save`. Never mutates the input document; the caller
 * adopts the returned layout (it is NOT auto-activated).
 */
export function importLayoutPackage(pkg: unknown): ImportLayoutResult<WorkbenchLayout> {
  const err = baseChecks(pkg, LAYOUT_PACKAGE_KIND);
  if (err) return { success: false, error: err };
  const layout = (pkg as LayoutPackage).layout;
  if (!looksLikeLayout(layout)) {
    return { success: false, error: new LayoutPackageError('malformed', 'Package layout is missing required fields.') };
  }

  const reminted = remintLayout(layout);

  // Validate by probing it through repair on a throwaway single-layout document so a
  // malformed dock tree / dangling reference is caught (and repaired) before adoption.
  const probe = repairWorkbenchDocument({
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    activeProfileId: 'probe.profile',
    profiles: { 'probe.profile': { id: 'probe.profile', label: 'probe', layoutId: reminted.id } },
    layouts: { [reminted.id]: reminted },
    panelLibrary: {},
    widgetLibrary: {}
  });
  const repaired = probe.layouts[reminted.id];
  if (!repaired) {
    return { success: false, error: new LayoutPackageError('invalid-after-import', 'Layout could not be repaired into a valid state.') };
  }
  const validation = validateWorkbenchDocument(probe);
  if (!validation.valid) {
    const first = validation.issues.find((i) => i.severity === 'error');
    return {
      success: false,
      error: new LayoutPackageError('invalid-after-import', first ? `${first.code}: ${first.message}` : 'Layout failed validation after import.')
    };
  }

  return { success: true, payload: repaired };
}

/** Parse + validate a panel-template package and return a fully re-minted template ready for `library.panel.save`. */
export function importPanelPackage(pkg: unknown): ImportLayoutResult<PanelTemplate> {
  const err = baseChecks(pkg, PANEL_PACKAGE_KIND);
  if (err) return { success: false, error: err };
  const template = (pkg as PanelPackage).template;
  if (!looksLikePanelTemplate(template)) {
    return { success: false, error: new LayoutPackageError('malformed', 'Package template is missing required fields.') };
  }
  return { success: true, payload: remintPanelTemplate(template) };
}
