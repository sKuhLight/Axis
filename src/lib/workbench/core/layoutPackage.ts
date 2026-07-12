import { createWorkbenchId, reserveWorkbenchIds } from './ids';
import { cloneWorkbenchDocument, isJsonSerializable, repairWorkbenchDocument, validateWorkbenchDocument } from './invariants';
import { WORKBENCH_SCHEMA_VERSION } from './schema';
import type {
  DockLayout,
  DockNode,
  PanelInstance,
  PanelTemplate,
  WidgetGroup,
  WidgetInstance,
  WorkbenchLayout,
  WorkbenchPage,
  WorkbenchPageLayout
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
export const PAGE_LAYOUT_PACKAGE_KIND = 'workbench.pageLayout.package' as const;
export const LAYOUT_PACKAGE_VERSION = 1 as const;

export type LayoutPackageKind =
  | typeof LAYOUT_PACKAGE_KIND
  | typeof PANEL_PACKAGE_KIND
  | typeof PAGE_LAYOUT_PACKAGE_KIND;

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

export interface PageLayoutPackage {
  kind: typeof PAGE_LAYOUT_PACKAGE_KIND;
  version: typeof LAYOUT_PACKAGE_VERSION;
  schemaVersion: typeof WORKBENCH_SCHEMA_VERSION;
  /** A self-contained saved page layout (one page's dock + the panels it references). */
  pageLayout: WorkbenchPageLayout;
}

export type WorkbenchPortablePackage = LayoutPackage | PanelPackage | PageLayoutPackage;

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

export function exportPageLayoutPackage(
  doc: { pageLayouts: Record<string, WorkbenchPageLayout> },
  pageLayoutId: string
): PageLayoutPackage | null {
  const pageLayout = doc.pageLayouts?.[pageLayoutId];
  if (!pageLayout) return null;
  return {
    kind: PAGE_LAYOUT_PACKAGE_KIND,
    version: LAYOUT_PACKAGE_VERSION,
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    pageLayout: clone(pageLayout)
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

/** Remap one dock (regions kept, every node id re-minted, panel refs mapped). */
function remapDock(dock: DockLayout, panelIdMap: Map<string, string>): DockLayout {
  const root = Object.fromEntries(
    Object.entries(dock.root ?? {}).map(([region, node]) => [region, remapDockNode(node, panelIdMap)])
  ) as DockLayout['root'];
  return { regions: clone(dock.regions ?? {}) as DockLayout['regions'], root };
}

/**
 * Normalize a (possibly legacy schema-v1) layout payload into pages form so the
 * re-mint path treats every dock uniformly: when the payload has no pages but a
 * top-level `dock`, that dock becomes the single `main` page (mirroring the
 * repair-time migration) so its interior node ids get re-minted too.
 */
function coercePagesShape(layout: WorkbenchLayout): {
  pages: Record<string, WorkbenchPage>;
  pageOrder: string[];
  activePageId: string;
} {
  const pages = isRecord(layout.pages) ? layout.pages : {};
  if (Object.keys(pages).length > 0) {
    return {
      pages,
      pageOrder: Array.isArray(layout.pageOrder) ? layout.pageOrder : Object.keys(pages),
      activePageId: typeof layout.activePageId === 'string' ? layout.activePageId : Object.keys(pages)[0]
    };
  }
  const legacyDock: DockLayout = isRecord(layout.dock)
    ? (layout.dock as DockLayout)
    : ({ regions: {}, root: {} } as unknown as DockLayout);
  const page: WorkbenchPage = { id: 'main', label: 'Main', dock: legacyDock };
  return { pages: { [page.id]: page }, pageOrder: [page.id], activePageId: page.id };
}

/** Remap every page of a layout: fresh page ids, fresh dock-node ids, mapped panel refs. */
function remapPages(
  layout: WorkbenchLayout,
  panelIdMap: Map<string, string>
): { pages: Record<string, WorkbenchPage>; pageOrder: string[]; activePageId: string; pageIdMap: Map<string, string> } {
  const source = coercePagesShape(layout);
  const pageIdMap = new Map<string, string>();
  for (const id of Object.keys(source.pages)) pageIdMap.set(id, createWorkbenchId(prefixOf(id, 'page')));

  const pages: Record<string, WorkbenchPage> = {};
  for (const page of Object.values(source.pages)) {
    const id = pageIdMap.get(page.id) ?? page.id;
    pages[id] = {
      ...clone(page),
      id,
      dock: remapDock(page.dock ?? ({ regions: {}, root: {} } as unknown as DockLayout), panelIdMap)
    };
  }
  const pageOrder = source.pageOrder.map((id) => pageIdMap.get(id) ?? id).filter((id) => !!pages[id]);
  const activePageId = pageIdMap.get(source.activePageId) ?? pageOrder[0] ?? Object.keys(pages)[0];
  return { pages, pageOrder, activePageId, pageIdMap };
}

/** Rewrite navigation `pageId` bindings through the page id map (dropping nothing else). */
function remapNavigationPageIds(layout: WorkbenchLayout, pageIdMap: Map<string, string>): WorkbenchLayout['navigation'] {
  const navigation = clone(layout.navigation);
  for (const entry of Object.values(navigation?.entries ?? {})) {
    if (entry.pageId) entry.pageId = pageIdMap.get(entry.pageId) ?? entry.pageId;
  }
  return navigation;
}

/**
 * Deep-clone a layout with every interior id re-minted so it cannot collide with any
 * id already present in a target document. Reserves the source ids first so a later
 * `createWorkbenchId` call in the same session never reproduces them.
 */
export function remintLayout(layout: WorkbenchLayout): WorkbenchLayout {
  return remintLayoutInteriorIds(layout, createWorkbenchId(prefixOf(layout.id, 'layout')));
}

/**
 * Deep-clone a layout re-minting every **interior** id (page ids, dock nodes, panels,
 * widgets, groups, `panel:` zone refs, tab-stack `panelIds`, nav `pageId` bindings) so
 * it cannot collide with any id already live in a target document — but keep a
 * caller-supplied top-level `layoutId` rather than minting a fresh one. This is the
 * collision-safe core of {@link remintLayout} exposed for the command-based import path
 * (`packages.ts`), which owns its own top-level id policy (`.copyN` de-dup / explicit
 * id / overwrite) and only needs the interior fixed.
 *
 * Reserves the source ids first so a later `createWorkbenchId` never reproduces them.
 */
export function remintLayoutInteriorIds(layout: WorkbenchLayout, layoutId: string): WorkbenchLayout {
  reserveWorkbenchIds(collectLayoutIds(layout));
  const { panels, widgets, widgetGroups, panelIdMap } = remapLayoutBits(
    layout.panels ?? {},
    layout.widgets ?? {},
    layout.widgetGroups ?? {}
  );
  const { pages, pageOrder, activePageId, pageIdMap } = remapPages(layout, panelIdMap);

  const next: WorkbenchLayout = {
    ...clone(layout),
    id: layoutId,
    pages,
    pageOrder,
    activePageId,
    navigation: remapNavigationPageIds(layout, pageIdMap),
    panels,
    widgets,
    widgetGroups
  };
  // The legacy single dock (schema v1 payloads) has been folded into `pages`.
  delete next.dock;
  return next;
}

export interface RemintWorkbenchPageOptions {
  /** Top-level id for the copy (the caller owns collision policy for it). */
  pageId: string;
  label?: string;
}

/**
 * Deep-copy ONE page plus the panel instances its dock references, re-minting
 * every interior id (dock nodes via {@link remapDockNode}, panel instances via
 * the shared id machinery). `singletonKey` is stripped from the copied panels —
 * singletons are mutually exclusive per layout, so a faithful copy would be
 * repaired away immediately. Backs `page.duplicate`.
 */
export function remintWorkbenchPage(
  page: WorkbenchPage,
  panels: Record<string, PanelInstance>,
  options: RemintWorkbenchPageOptions
): { page: WorkbenchPage; panels: Record<string, PanelInstance> } {
  const sourceIds: string[] = [page.id, ...Object.keys(panels)];
  const walk = (node: DockNode | null): void => {
    if (!node) return;
    sourceIds.push(node.id);
    if (node.kind === 'split') node.children.forEach(walk);
  };
  for (const node of Object.values(page.dock.root ?? {})) walk(node);
  reserveWorkbenchIds(sourceIds);

  const panelIdMap = new Map<string, string>();
  for (const id of Object.keys(panels)) panelIdMap.set(id, createWorkbenchId(prefixOf(id, 'panel')));

  const nextPanels: Record<string, PanelInstance> = {};
  for (const panel of Object.values(panels)) {
    const id = panelIdMap.get(panel.id) ?? panel.id;
    const next = { ...clone(panel), id };
    delete next.singletonKey;
    nextPanels[id] = next;
  }

  const nextPage: WorkbenchPage = {
    ...clone(page),
    id: options.pageId,
    label: options.label ?? page.label,
    dock: remapDock(page.dock, panelIdMap)
  };
  return { page: nextPage, panels: nextPanels };
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
  for (const [pageId, page] of Object.entries(layout.pages ?? {})) {
    ids.push(pageId);
    for (const node of Object.values(page?.dock?.root ?? {})) walk(node);
  }
  // Legacy schema-v1 payloads: the single dock's node ids must be reserved too.
  for (const node of Object.values(layout.dock?.root ?? {})) walk(node);
  ids.push(...Object.keys(layout.panels ?? {}), ...Object.keys(layout.widgets ?? {}), ...Object.keys(layout.widgetGroups ?? {}));
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
  // Older schema versions are accepted: the import path re-mints and then runs
  // the payload through document repair, which migrates a v1 single-dock layout
  // into pages form. Newer-than-current versions are rejected.
  const schemaVersion = input.schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > WORKBENCH_SCHEMA_VERSION) {
    return new LayoutPackageError('wrong-schema-version', `Unsupported schema version ${String(input.schemaVersion)}.`);
  }
  if (!isJsonSerializable(input)) return new LayoutPackageError('not-serializable', 'Package is not serializable JSON.');
  return null;
}

function looksLikeLayout(value: unknown): value is WorkbenchLayout {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isRecord(value.panels) ||
    !isRecord(value.widgets) ||
    !isRecord(value.widgetGroups) ||
    !isRecord(value.navigation) ||
    !isRecord(value.zones)
  ) {
    return false;
  }
  // Dock content: either pages (schema v2) or the legacy single dock (v1).
  if (isRecord(value.pages) && Object.keys(value.pages).length > 0) return true;
  return isRecord(value.dock) && isRecord((value.dock as Record<string, unknown>).root);
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
    widgetLibrary: {},
    pageLayouts: {}
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

function looksLikePageLayout(value: unknown): value is WorkbenchPageLayout {
  if (!isRecord(value)) return false;
  const page = value.page;
  return isRecord(page) && isRecord((page as Record<string, unknown>).dock) && isRecord(value.panels);
}

/**
 * Parse + validate a page-layout package and return a fully re-minted
 * {@link WorkbenchPageLayout} (fresh top-level id + re-minted interior page /
 * panel / dock-node ids) ready for `pageLayout.save`. Re-minting keeps a
 * round-trip import into the source document collision-free even before apply
 * re-mints again.
 */
export function importPageLayoutPackage(pkg: unknown): ImportLayoutResult<WorkbenchPageLayout> {
  const err = baseChecks(pkg, PAGE_LAYOUT_PACKAGE_KIND);
  if (err) return { success: false, error: err };
  const pageLayout = (pkg as PageLayoutPackage).pageLayout;
  if (!looksLikePageLayout(pageLayout)) {
    return { success: false, error: new LayoutPackageError('malformed', 'Package page layout is missing required fields.') };
  }
  const label =
    typeof pageLayout.label === 'string' && pageLayout.label.trim() ? pageLayout.label.trim() : 'Imported Page Layout';
  const { page, panels } = remintWorkbenchPage(pageLayout.page, pageLayout.panels ?? {}, {
    pageId: createWorkbenchId('page'),
    label
  });
  return {
    success: true,
    payload: {
      id: createWorkbenchId('pageLayout'),
      label,
      page,
      panels,
      createdAt: new Date().toISOString()
    }
  };
}
