import {
  activeWorkbenchPage,
  createEmptyDockLayout,
  createWorkbenchId,
  orderedWorkbenchPages,
  selectActiveLayout,
  type DockLayout,
  type DockNode,
  type JsonObject,
  type NavigationEntryState,
  type NavigationLayout,
  type NavigationMode,
  type PanelInstance,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchPage
} from '../workbench/core';

/**
 * ROUND 15 — Pages navigation model (AXIS-23), Axis binding half.
 *
 * The generic `workbench/` layer implements the Pages mechanism (a layout owns
 * `pages`, each with its own dock; `activePageId` selects the rendered one, and a
 * navigation entry can bind a `pageId`). THIS module is the Axis-specific policy on
 * top of it: which pages exist by default, what each page docks, and how the Axis
 * nav entries bind to them.
 *
 * Operator directive (2026-07-12): every nav point becomes its own freely
 * configurable layout page. Six predefined pages ship — Grid (today's default
 * layout), Preset Browser (full-size PB), Live, Setup, Controllers, FC —
 * each renamable / deletable / reorderable. Theme + Axis stay ACTION entries
 * (no page). Pages are per device profile (desktop/tablet/phone), same seeds — but
 * the ACTIVE page is carried across a profile switch (see the reducer's
 * `profile.activate`), so it reads as one page selection shared by all three
 * profiles rather than three that drift apart on every window resize.
 */

export const AXIS_PAGE_GRID = 'axis.page.grid';
export const AXIS_PAGE_PRESET_BROWSER = 'axis.page.presetBrowser';
export const AXIS_PAGE_FC = 'axis.page.fc';
export const AXIS_PAGE_CONTROLLERS = 'axis.page.controllers';
export const AXIS_PAGE_LIVE = 'axis.page.live';
export const AXIS_PAGE_SETUP = 'axis.page.setup';

/**
 * Cross-device preset-converter page (M4 · META-24). NOT a nav-bound seed page — it has no navigation
 * entry and is reached only by activating it programmatically from a preset-browser "Convert…" action.
 * It reviews/edits the converted preset in the REAL SignalGrid over the offline `convertEditor` surface.
 * Its four panels dock: convert grid in `main`, minimap + tray split vertically in `right`, block editor
 * in `bottom`.
 */
export const AXIS_PAGE_CONVERT = 'axis.page.convert';
export const AXIS_CONVERT_GRID_PANEL = 'axis.convertGrid';
export const AXIS_CONVERT_BLOCK_EDITOR_PANEL = 'axis.convertBlockEditor';
export const AXIS_CONVERT_MINIMAP_PANEL = 'axis.convertMinimap';
export const AXIS_CONVERT_TRAY_PANEL = 'axis.convertTray';

/** Canonical seed-page order — mirrors the nav order (preset browser first; Grid stays active by default). */
export const AXIS_SEED_PAGE_ORDER = [
  AXIS_PAGE_PRESET_BROWSER,
  AXIS_PAGE_GRID,
  AXIS_PAGE_CONTROLLERS,
  AXIS_PAGE_FC,
  AXIS_PAGE_LIVE,
  AXIS_PAGE_SETUP
] as const;

/** Navigation-entry id → bound page id for the six page entries. */
export const AXIS_PAGE_NAV_BINDINGS: Record<string, string> = {
  grid: AXIS_PAGE_GRID,
  library: AXIS_PAGE_PRESET_BROWSER,
  fc: AXIS_PAGE_FC,
  controllers: AXIS_PAGE_CONTROLLERS,
  live: AXIS_PAGE_LIVE,
  setup: AXIS_PAGE_SETUP
};

/** Labels for the page-bound nav entries (and their pages). */
const NAV_LABELS: Record<string, string> = {
  grid: 'Grid',
  library: 'Preset Browser',
  fc: 'Footswitches',
  controllers: 'Controllers',
  live: 'Live',
  setup: 'Setup'
};

/**
 * The panel each SECONDARY page (everything but Grid) docks full-size in its `main`
 * region. Grid is special (grid + block editor) and built from a passed-in dock.
 * These specs are the single source for the extra panel instances the roster must
 * carry so the pages have something to dock (and for the migration fallback).
 * The Scenes page/panel was retired — see `pruneAxisScenesPage`.
 */
interface AxisPagePanelSpec {
  pageId: string;
  label: string;
  panelId: string;
  panelType: string;
  panelTitle: string;
  singletonKey: string;
  state?: JsonObject;
}

export const AXIS_SECONDARY_PAGE_SPECS: AxisPagePanelSpec[] = [
  {
    pageId: AXIS_PAGE_PRESET_BROWSER,
    label: NAV_LABELS.library,
    panelId: 'axis.presetBrowser',
    panelType: 'axis.presetBrowser',
    panelTitle: 'Preset Browser',
    singletonKey: 'axis.presetBrowser'
  },
  {
    pageId: AXIS_PAGE_FC,
    label: NAV_LABELS.fc,
    panelId: 'axis.fc',
    panelType: 'axis.fc',
    panelTitle: 'Footswitches',
    singletonKey: 'axis.fc'
  },
  {
    pageId: AXIS_PAGE_CONTROLLERS,
    label: NAV_LABELS.controllers,
    panelId: 'axis.controllers',
    panelType: 'axis.virtualScreen',
    panelTitle: 'Controllers',
    singletonKey: 'axis.controllers',
    state: { slug: 'controllers' }
  },
  {
    pageId: AXIS_PAGE_LIVE,
    label: NAV_LABELS.live,
    panelId: 'axis.live',
    panelType: 'axis.placeholder',
    panelTitle: 'Live',
    singletonKey: 'axis.live',
    state: {
      glyph: '⏺',
      heading: 'Live',
      description: 'The performance / setlist view docks here in a later phase.',
      meta: 'Meanwhile · use the Footswitches editor for live control'
    }
  },
  {
    pageId: AXIS_PAGE_SETUP,
    label: NAV_LABELS.setup,
    panelId: 'axis.setup',
    panelType: 'axis.virtualScreen',
    panelTitle: 'Setup',
    singletonKey: 'axis.setup',
    state: { slug: 'global' }
  }
];

const specForPage = (pageId: string): AxisPagePanelSpec | undefined =>
  AXIS_SECONDARY_PAGE_SPECS.find((spec) => spec.pageId === pageId);

const specForPanel = (panelId: string): AxisPagePanelSpec | undefined =>
  AXIS_SECONDARY_PAGE_SPECS.find((spec) => spec.panelId === panelId);

const toPanelInstance = (spec: AxisPagePanelSpec): PanelInstance => ({
  id: spec.panelId,
  type: spec.panelType,
  title: spec.panelTitle,
  closable: true,
  collapsible: true,
  singletonKey: spec.singletonKey,
  ...(spec.state ? { state: spec.state } : {})
});

/**
 * Panel instances the SEED pages dock that are NOT part of the historical roster
 * (`createAxisWorkbenchPanels` already defines signalGrid/blockEditor/presetBrowser/
 * fc). These three (Setup / Controllers / Live) used to be minted on demand
 * by the add-or-focus nav actions; now that each is its own page they live in the
 * roster so the page has something to dock. Returns a fresh object per call.
 */
export function createAxisPagePanels(): Record<string, PanelInstance> {
  const panels: Record<string, PanelInstance> = {};
  for (const spec of AXIS_SECONDARY_PAGE_SPECS) {
    if (spec.panelId === 'axis.presetBrowser' || spec.panelId === 'axis.fc') continue;
    panels[spec.panelId] = toPanelInstance(spec);
  }
  return panels;
}

const mainTabs = (panelId: string, mintNodeId: () => string): DockNode => ({
  kind: 'tabs',
  id: mintNodeId(),
  panelIds: [panelId],
  activePanelId: panelId
});

/** The four convert-page panel instances (offline converter review/edit surface). Fresh per call. */
export function createAxisConvertPanels(): Record<string, PanelInstance> {
  const p = (id: string, title: string, extra: Partial<PanelInstance> = {}): PanelInstance => ({
    id,
    type: id,
    title,
    closable: true,
    collapsible: true,
    singletonKey: id,
    ...extra
  });
  return {
    [AXIS_CONVERT_GRID_PANEL]: p(AXIS_CONVERT_GRID_PANEL, 'Converted Grid', { closable: false }),
    [AXIS_CONVERT_BLOCK_EDITOR_PANEL]: p(AXIS_CONVERT_BLOCK_EDITOR_PANEL, 'Block Editor'),
    [AXIS_CONVERT_MINIMAP_PANEL]: p(AXIS_CONVERT_MINIMAP_PANEL, 'Source'),
    [AXIS_CONVERT_TRAY_PANEL]: p(AXIS_CONVERT_TRAY_PANEL, 'Unplaced Blocks')
  };
}

/** Build the convert page's dock: grid (main) · minimap+tray split (right) · block editor (bottom). */
function buildConvertPageDock(mintNodeId: () => string): DockLayout {
  const dock = createEmptyDockLayout();
  dock.root.main = mainTabs(AXIS_CONVERT_GRID_PANEL, mintNodeId);
  dock.root.right = {
    kind: 'split',
    id: mintNodeId(),
    axis: 'vertical',
    ratio: [0.5, 0.5],
    children: [mainTabs(AXIS_CONVERT_MINIMAP_PANEL, mintNodeId), mainTabs(AXIS_CONVERT_TRAY_PANEL, mintNodeId)]
  };
  dock.root.bottom = mainTabs(AXIS_CONVERT_BLOCK_EDITOR_PANEL, mintNodeId);
  dock.regions.right.sizePx = 340;
  dock.regions.bottom.sizePx = 360;
  return dock;
}

export interface BuildAxisSeedPagesOptions {
  /** Node-id factory for the secondary pages' tab stacks (defaults to `createWorkbenchId`). */
  mintNodeId?: () => string;
}

/**
 * Build the six seed pages. The Grid page carries the passed-in `gridDock` (the
 * profile's signal-grid-centric arrangement); every secondary page docks its single
 * panel full-size in `main`. Grid is the active page. Returns the `pages` map,
 * `pageOrder`, and `activePageId` ready to assign onto a `WorkbenchLayout`.
 */
export function buildAxisSeedPages(
  gridDock: DockLayout,
  options: BuildAxisSeedPagesOptions = {}
): { pages: Record<string, WorkbenchPage>; pageOrder: string[]; activePageId: string } {
  const mintNodeId = options.mintNodeId ?? (() => createWorkbenchId('tabs'));
  const pages: Record<string, WorkbenchPage> = {
    [AXIS_PAGE_GRID]: { id: AXIS_PAGE_GRID, label: NAV_LABELS.grid, dock: gridDock }
  };
  for (const spec of AXIS_SECONDARY_PAGE_SPECS) {
    const dock = createEmptyDockLayout();
    dock.root.main = mainTabs(spec.panelId, mintNodeId);
    pages[spec.pageId] = { id: spec.pageId, label: spec.label, dock };
  }
  // The converter page is seeded on every layout so it can be activated on demand, but it stays OUT of
  // the returned pageOrder / navigation (no nav entry) — repair appends it to pageOrder, and it is only
  // reached via a preset-browser "Convert…" action.
  pages[AXIS_PAGE_CONVERT] = { id: AXIS_PAGE_CONVERT, label: 'Convert', dock: buildConvertPageDock(mintNodeId) };
  return { pages, pageOrder: [...AXIS_SEED_PAGE_ORDER], activePageId: AXIS_PAGE_GRID };
}

const pageNavEntry = (id: string, label: string, pageId: string): NavigationEntryState => ({
  id,
  label,
  hidden: false,
  pageId
});

const actionNavEntry = (
  id: string,
  label: string,
  command: string,
  extra: Partial<NavigationEntryState> = {}
): NavigationEntryState => ({ id, label, hidden: false, target: { command }, ...extra });

/**
 * The Axis seed navigation: the six page-bound entries (each activates its page)
 * plus the Axis ACTION entry (the account modal, pinned to the rail footer). Page
 * entries carry NO `target`; their `pageId` binding drives `page.activate` in the
 * generic `NavigationHost`. Theme/appearance lives inside the Axis hub as a tab, so
 * it has no separate nav entry.
 */
export function createAxisSeedNavigation(mode: NavigationMode): NavigationLayout {
  return {
    mode,
    entries: {
      grid: pageNavEntry('grid', NAV_LABELS.grid, AXIS_PAGE_GRID),
      library: pageNavEntry('library', NAV_LABELS.library, AXIS_PAGE_PRESET_BROWSER),
      fc: pageNavEntry('fc', NAV_LABELS.fc, AXIS_PAGE_FC),
      controllers: pageNavEntry('controllers', NAV_LABELS.controllers, AXIS_PAGE_CONTROLLERS),
      live: pageNavEntry('live', NAV_LABELS.live, AXIS_PAGE_LIVE),
      setup: pageNavEntry('setup', NAV_LABELS.setup, AXIS_PAGE_SETUP),
      account: actionNavEntry('account', 'Axis', 'axis.openAccount', {
        locked: true,
        fixedSlot: 'rail.footer'
      })
    },
    order: ['library', 'grid', 'controllers', 'fc', 'live', 'setup', 'account']
  };
}

// ── One-shot migration of persisted documents ────────────────────────────────

/** doc.metadata marker: this document has already been migrated to the Pages model. */
export const AXIS_SEED_PAGES_MARKER = 'axisSeedPages';

/** Panel ids that belong on their OWN seed page (must be pulled out of the Grid dock). */
const SECONDARY_PANEL_IDS = new Set(AXIS_SECONDARY_PAGE_SPECS.map((spec) => spec.panelId));

/** Recursively strip a set of panel ids from a dock tree; empty stacks collapse to null. */
function stripPanelsFromNode(node: DockNode | null, drop: Set<string>): DockNode | null {
  if (!node) return null;
  if (node.kind === 'tabs') {
    const panelIds = node.panelIds.filter((id) => !drop.has(id));
    if (panelIds.length === 0) return null;
    return { ...node, panelIds, activePanelId: panelIds.includes(node.activePanelId) ? node.activePanelId : panelIds[0] };
  }
  const children = node.children.map((child) => stripPanelsFromNode(child, drop)).filter((child): child is DockNode => !!child);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

function stripSecondaryPanels(dock: DockLayout): DockLayout {
  const next = createEmptyDockLayout();
  next.regions = dock.regions;
  for (const region of Object.keys(next.root) as (keyof DockLayout['root'])[]) {
    next.root[region] = stripPanelsFromNode(dock.root[region] ?? null, SECONDARY_PANEL_IDS);
  }
  return next;
}

/** Ensure every panel a seed page needs to dock exists on the layout (adds only missing ones). */
function ensurePagePanelsExist(layout: WorkbenchLayout): void {
  layout.panels = layout.panels ?? {};
  for (const spec of AXIS_SECONDARY_PAGE_SPECS) {
    if (!layout.panels[spec.panelId]) layout.panels[spec.panelId] = toPanelInstance(spec);
  }
}

/** True when this layout has already been seeded with the Pages model. */
function layoutAlreadySeeded(layout: WorkbenchLayout): boolean {
  if (layout.pages?.[AXIS_PAGE_GRID]) return true;
  // Or: any nav entry already bound to a page (a doc built by the new defaults).
  return Object.values(layout.navigation?.entries ?? {}).some((entry) => typeof entry.pageId === 'string' && entry.pageId);
}

/**
 * Migrate a persisted (pre-Pages) Axis document to the Pages model. Idempotent via a
 * doc-metadata marker. For every layout:
 *
 *  - the existing (active or first) page's dock becomes the **Grid** page — minus any
 *    panels that own a dedicated page (Preset Browser / FC / Setup / Controllers /
 *    Live), which are pulled out so they land cleanly on their own pages;
 *  - the other five seed pages + the full-size Preset Browser page are added;
 *  - the navigation is rebuilt with the six page bindings (preserving the layout's
 *    nav `mode`), Theme + Axis staying action entries.
 *
 * A schema-v1 doc has already been wrapped into a single `main` page by the framework
 * repair before this runs, so "the existing dock tree" is that page's dock. New /
 * default-seeded documents carry the marker and are left untouched.
 */
export function ensureAxisSeedPages(doc: WorkbenchDocument): WorkbenchDocument {
  if (doc.metadata?.[AXIS_SEED_PAGES_MARKER]) {
    ensureActionNavigationLabels(doc);
    return doc;
  }

  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object') continue;
    if (layoutAlreadySeeded(layout)) continue;

    const currentPage = activeWorkbenchPage(layout) ?? orderedWorkbenchPages(layout)[0];
    const sourceDock = currentPage?.dock ?? createEmptyDockLayout();
    const gridDock = stripSecondaryPanels(sourceDock);

    ensurePagePanelsExist(layout);

    const seeded = buildAxisSeedPages(gridDock);
    layout.pages = seeded.pages;
    layout.pageOrder = seeded.pageOrder;
    layout.activePageId = seeded.activePageId;

    const mode: NavigationMode = layout.navigation?.mode === 'bottom' ? 'bottom' : 'side';
    layout.navigation = createAxisSeedNavigation(mode);
  }

  doc.metadata = { ...(doc.metadata ?? {}), [AXIS_SEED_PAGES_MARKER]: 'v1' };
  ensureActionNavigationLabels(doc);
  return doc;
}

// ── Seed order reconciliation ────────────────────────────────────────────────

/**
 * doc.metadata marker: the seed pages / page-bound nav entries have been put into
 * their canonical order (see {@link ensureAxisSeedOrder}). One-shot, so a user who
 * deliberately reorders pages after this ships is never clobbered on the next load.
 */
export const AXIS_SEED_ORDER_MARKER = 'axisSeedOrder';

/** Stable reorder: ranked (known) ids first in rank order; everything else keeps its relative position. */
function moveRankedToFront<T>(ids: T[], rankOf: (id: T) => number | undefined): T[] {
  const ranked = ids.filter((id) => rankOf(id) !== undefined).sort((a, b) => rankOf(a)! - rankOf(b)!);
  const rest = ids.filter((id) => rankOf(id) === undefined);
  return [...ranked, ...rest];
}

/**
 * Put the six seed pages — and the nav entries bound to them — into
 * {@link AXIS_SEED_PAGE_ORDER}. The Preset Browser moved to the top of the rail, so a
 * document persisted before that change still carries the old order; this repairs it
 * once (marker-gated). Only the known seed page ids are moved among themselves — every
 * other page / nav entry keeps its relative position (the nav-less Convert page trails).
 * Idempotent via the marker.
 */
export function ensureAxisSeedOrder(doc: WorkbenchDocument): WorkbenchDocument {
  if (doc.metadata?.[AXIS_SEED_ORDER_MARKER]) return doc;

  const pageRank = new Map<string, number>(AXIS_SEED_PAGE_ORDER.map((id, index) => [id, index]));
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object') continue;
    if (Array.isArray(layout.pageOrder)) {
      layout.pageOrder = moveRankedToFront(layout.pageOrder, (id) => pageRank.get(id));
    }
    if (Array.isArray(layout.navigation?.order)) {
      const order = layout.navigation.order;
      layout.navigation.order = moveRankedToFront(order, (id) => {
        const pageId = layout.navigation.entries?.[id]?.pageId;
        return pageId ? pageRank.get(pageId) : undefined;
      });
    }
  }

  doc.metadata = { ...(doc.metadata ?? {}), [AXIS_SEED_ORDER_MARKER]: 'v1' };
  return doc;
}

// ── Retired pages ────────────────────────────────────────────────────────────

/**
 * Pages retired from the Axis shell. The Scenes page was removed entirely — it
 * shipped as a placeholder whose only content pointed at the Scenes widget that
 * already lives in the top bar. A persisted document (marker present, so
 * `ensureAxisSeedPages` leaves it alone) still carries the page, its nav entry and
 * its placeholder panel, so strip all three on load. Idempotent.
 *
 * The placeholder panel id `axis.scenes` COLLIDES with the still-supported
 * `axis.scenes` WIDGET type, so the panel is only dropped when its type is
 * `axis.placeholder` — never touch the widget.
 */
const AXIS_RETIRED_SCENES_PAGE_ID = 'axis.page.scenes';
const AXIS_RETIRED_SCENES_NAV_ID = 'scenes';
const AXIS_RETIRED_SCENES_PANEL_ID = 'axis.scenes';

export function pruneAxisScenesPage(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object') continue;

    if (layout.navigation?.entries?.[AXIS_RETIRED_SCENES_NAV_ID]) {
      delete layout.navigation.entries[AXIS_RETIRED_SCENES_NAV_ID];
    }
    if (layout.navigation?.order) {
      layout.navigation.order = layout.navigation.order.filter((id) => id !== AXIS_RETIRED_SCENES_NAV_ID);
    }

    if (layout.pages?.[AXIS_RETIRED_SCENES_PAGE_ID]) {
      delete layout.pages[AXIS_RETIRED_SCENES_PAGE_ID];
    }
    if (layout.pageOrder) {
      layout.pageOrder = layout.pageOrder.filter((id) => id !== AXIS_RETIRED_SCENES_PAGE_ID);
    }
    // A persisted active Scenes page would otherwise strand the shell on a missing page.
    if (layout.activePageId === AXIS_RETIRED_SCENES_PAGE_ID) layout.activePageId = AXIS_PAGE_GRID;

    const panel = layout.panels?.[AXIS_RETIRED_SCENES_PANEL_ID];
    if (panel && panel.type === 'axis.placeholder') delete layout.panels[AXIS_RETIRED_SCENES_PANEL_ID];
  }
  return doc;
}

/** The Axis ACTION entry has been renamed since it shipped — it was "Axis Cloud" before the cloud
 *  was removed. Renaming the seed only fixes NEW documents, so repair the persisted label on load,
 *  keyed on the stable command (never the entry id or the label itself, which is what went stale). */
const ACTION_NAV_LABELS: Record<string, string> = {
  'axis.openAccount': 'Axis'
};

function ensureActionNavigationLabels(doc: WorkbenchDocument): void {
  for (const layout of Object.values(doc.layouts ?? {})) {
    for (const entry of Object.values(layout?.navigation?.entries ?? {})) {
      const label = entry?.target?.command ? ACTION_NAV_LABELS[entry.target.command] : undefined;
      if (label) entry.label = label;
    }
  }
}

/**
 * Ensure the (nav-less) converter page + its four panels exist on every layout (M4). Idempotent and
 * marker-free: a layout that already carries the convert page is left untouched, so it self-heals a
 * persisted document minted before the converter page existed without a one-shot migration. Runs in the
 * normalization chain after `ensureAxisSeedPages` (which guarantees every layout has a `pages` map).
 */
export function ensureAxisConvertPage(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object') continue;
    layout.pages = layout.pages ?? {};
    layout.panels = layout.panels ?? {};
    if (!layout.pages[AXIS_PAGE_CONVERT]) {
      layout.pages[AXIS_PAGE_CONVERT] = {
        id: AXIS_PAGE_CONVERT,
        label: 'Convert',
        dock: buildConvertPageDock(() => createWorkbenchId('tabs'))
      };
    }
    const convertPanels = createAxisConvertPanels();
    for (const [id, instance] of Object.entries(convertPanels)) {
      if (!layout.panels[id]) layout.panels[id] = instance;
    }
    // Heal the repurposed right-top panel's title on docs persisted before it became the source grid
    // (it shipped as the converted-grid "Grid Map" minimap). Idempotent: only rewrites the old title.
    const srcPanel = layout.panels[AXIS_CONVERT_MINIMAP_PANEL];
    if (srcPanel && srcPanel.title === 'Grid Map') srcPanel.title = 'Source';
  }
  return doc;
}

// Re-exported for tests / callers that want to introspect the active seed page.
export { activeWorkbenchPage, selectActiveLayout, specForPage, specForPanel };
