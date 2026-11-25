import {
  createEmptyDockLayout,
  createWorkbenchId,
  orderedWorkbenchPages,
  panelIdsInDockTree,
  panelIdsInPageDock,
  type DockLayout,
  type DockNode,
  type DockRegionId,
  type NavigationEntryState,
  type PanelInstance,
  type WorkbenchCommand,
  type WorkbenchLayout,
  type WorkbenchPage
} from '../workbench/core';
import type {
  WorkbenchAddPageCard,
  WorkbenchAddPageCards,
  WorkbenchAddPageItems,
  WorkbenchEditBarPagesExtension,
  WorkbenchMenuItem,
  WorkbenchPageHint,
  WorkbenchPageResetAction
} from '../workbench';
import { createAxisDefaultGridDock, createAxisWorkbenchPanels } from './axisWorkbenchDefaults';
import { buildAxisPresetGridDock, isAxisLayoutPresetKind } from './axisWorkbenchLayoutPresets';
import {
  AXIS_PAGE_CONVERT,
  AXIS_PAGE_GRID,
  AXIS_SECONDARY_PAGE_SPECS,
  AXIS_SEED_PAGE_LABELS,
  AXIS_SEED_PAGE_NAV_ENTRY,
  AXIS_SEED_PAGE_ORDER,
  axisPagePanelInstance,
  buildConvertPageDock,
  createAxisConvertPanels
} from './axisWorkbenchPages';

/**
 * Slice 3 — default pages are never lost (Axis policy on top of the generic
 * parking model: `page.remove` / `panel.remove` park panels, `panel.create`,
 * `page.add` with `navIndex`, `page.setDock`).
 *
 *   - Every page is deletable; its panels are parked, never destroyed.
 *   - "Restore default pages" brings back MISSING seed pages at their seed
 *     position, with their original id, label and nav entry id (so the nav
 *     glyph matches), and docks their spec panels: a parked one is docked, an
 *     absent one is created from its spec, one that lives on ANOTHER page stays
 *     there — the restored page then shows a "Bring it here" hint.
 *   - "Reset to default" rebuilds a default page's dock from its spec; panels
 *     not in the spec are parked (still in Add panel). A custom page resets to
 *     empty ("Clear page").
 *
 * Pure: everything returns command batches (one undo step each). The convert
 * page is nav-less and never listed as missing (its marker-free self-heal in
 * the normalization chain owns it); it can still be reset to its spec.
 */

/** One default page: its identity, the panels its dock references, and a fresh dock. */
export interface AxisDefaultPageSpec {
  pageId: string;
  label: string;
  /** Original navigation entry id (undefined for the nav-less convert page). */
  navEntryId?: string;
  /** Panel prototypes the dock references, in dock order. */
  panels: PanelInstance[];
  /** A fresh dock (newly minted node ids) referencing the prototype ids. */
  buildDock: () => DockLayout;
}

/** A missing seed page, in seed order. */
export interface AxisMissingDefaultPage {
  pageId: string;
  label: string;
  navEntryId: string;
}

const mintTabs = (): string => createWorkbenchId('tabs');

const tabsNode = (panelId: string): DockNode => ({ kind: 'tabs', id: mintTabs(), panelIds: [panelId], activePanelId: panelId });

/** Every panel id a dock references (all regions). */
function dockPanelIds(dock: DockLayout): string[] {
  return Object.values(dock.root).flatMap((node) => panelIdsInDockTree(node ?? null));
}

/**
 * The Grid page dock of the layout's preset: `settings.presetKind` (legacy
 * `activePreset`) names the preset the layout was built from; a layout with
 * neither is the default document, whose Grid is Signal Grid + Block Editor.
 */
function gridDockFor(layout: WorkbenchLayout | undefined): DockLayout {
  const settings = layout?.settings ?? {};
  const kind = isAxisLayoutPresetKind(settings.presetKind)
    ? settings.presetKind
    : isAxisLayoutPresetKind(settings.activePreset)
      ? settings.activePreset
      : null;
  if (!kind) return createAxisDefaultGridDock({ main: mintTabs(), bottom: mintTabs() });
  const rightW = typeof settings.rightW === 'number' ? settings.rightW : undefined;
  return buildAxisPresetGridDock(kind, { rightW });
}

/** True for the seven seed pages and the convert page (they have a default dock to reset to). */
export function isAxisDefaultPage(pageId: string): boolean {
  return (AXIS_SEED_PAGE_ORDER as readonly string[]).includes(pageId) || pageId === AXIS_PAGE_CONVERT;
}

/** The default spec of a seed page (or the convert page), resolved against the layout's preset. */
export function axisDefaultPageSpec(layout: WorkbenchLayout | undefined, pageId: string): AxisDefaultPageSpec | undefined {
  const roster = createAxisWorkbenchPanels();
  if (pageId === AXIS_PAGE_GRID) {
    const probe = gridDockFor(layout);
    return {
      pageId,
      label: AXIS_SEED_PAGE_LABELS[pageId],
      navEntryId: AXIS_SEED_PAGE_NAV_ENTRY[pageId],
      panels: dockPanelIds(probe).map((id) => roster[id]).filter((panel): panel is PanelInstance => !!panel),
      buildDock: () => gridDockFor(layout)
    };
  }
  if (pageId === AXIS_PAGE_CONVERT) {
    const panels = createAxisConvertPanels();
    const probe = buildConvertPageDock(mintTabs);
    return {
      pageId,
      label: 'Convert',
      panels: dockPanelIds(probe).map((id) => panels[id]).filter((panel): panel is PanelInstance => !!panel),
      buildDock: () => buildConvertPageDock(mintTabs)
    };
  }
  const spec = AXIS_SECONDARY_PAGE_SPECS.find((entry) => entry.pageId === pageId);
  if (!spec) return undefined;
  return {
    pageId,
    label: spec.label,
    navEntryId: AXIS_SEED_PAGE_NAV_ENTRY[pageId],
    panels: [roster[spec.panelId] ?? axisPagePanelInstance(spec)],
    buildDock: () => {
      const dock = createEmptyDockLayout();
      dock.root.main = tabsNode(spec.panelId);
      return dock;
    }
  };
}

/** Seed pages the layout no longer has, in seed order (never the convert page). */
export function listMissingAxisDefaultPages(layout: WorkbenchLayout | undefined): AxisMissingDefaultPage[] {
  if (!layout) return [];
  return AXIS_SEED_PAGE_ORDER.filter((pageId) => !layout.pages?.[pageId]).map((pageId) => ({
    pageId,
    label: AXIS_SEED_PAGE_LABELS[pageId],
    navEntryId: AXIS_SEED_PAGE_NAV_ENTRY[pageId]
  }));
}

/** The instance standing in for a prototype: same singleton key, else same id. */
function instanceFor(layout: WorkbenchLayout, proto: PanelInstance): PanelInstance | undefined {
  if (proto.singletonKey) return Object.values(layout.panels).find((panel) => panel.singletonKey === proto.singletonKey);
  return layout.panels[proto.id];
}

/** panel id → id of the page it is docked on. */
function dockedPageOf(layout: WorkbenchLayout): Map<string, string> {
  const index = new Map<string, string>();
  for (const page of orderedWorkbenchPages(layout)) {
    for (const panelId of panelIdsInPageDock(page)) if (!index.has(panelId)) index.set(panelId, page.id);
  }
  return index;
}

function remapNode(node: DockNode | null, map: Map<string, string>): DockNode | null {
  if (!node) return null;
  if (node.kind === 'tabs') {
    const panelIds = node.panelIds.map((id) => map.get(id) ?? id);
    return { ...node, panelIds, activePanelId: map.get(node.activePanelId) ?? node.activePanelId };
  }
  return { ...node, children: node.children.map((child) => remapNode(child, map)).filter((child): child is DockNode => !!child) };
}

/**
 * The commands that make a spec's panels available to its dock: `panel.create`
 * for every prototype with no instance (fresh, with its singleton key), and the
 * dock with prototype ids pointed at the existing instance ids. Panels docked on
 * another page stay referenced — `page.add` / `page.setDock` leave them where
 * they are (the page hint offers to bring them).
 */
function prepareSpec(
  layout: WorkbenchLayout,
  spec: AxisDefaultPageSpec,
  created: Set<string>
): { commands: WorkbenchCommand[]; dock: DockLayout } {
  const commands: WorkbenchCommand[] = [];
  const remap = new Map<string, string>();
  for (const proto of spec.panels) {
    const existing = instanceFor(layout, proto);
    if (existing) {
      if (existing.id !== proto.id) remap.set(proto.id, existing.id);
      continue;
    }
    const key = proto.singletonKey ?? proto.id;
    if (created.has(key) || layout.panels[proto.id]) continue;
    created.add(key);
    commands.push({ type: 'panel.create', panel: JSON.parse(JSON.stringify(proto)) as PanelInstance });
  }
  const dock = spec.buildDock();
  if (remap.size) {
    for (const region of Object.keys(dock.root) as DockRegionId[]) dock.root[region] = remapNode(dock.root[region], remap);
  }
  return { commands, dock };
}

export interface RestoreAxisDefaultPagesOptions {
  /** Restore only these missing pages (default: every missing seed page). */
  pageIds?: readonly string[];
}

/**
 * One batch that restores missing default pages: per page (in seed order) the
 * `panel.create`s its spec needs, then `page.add` with the original id, label
 * and nav entry id, inserted right after the nearest preceding seed page that
 * exists — in pageOrder (`index`) and in the navigation (`navIndex`) — so it
 * lands at its seed position. Pages that exist are never touched.
 */
export function restoreAxisDefaultPagesCommands(
  layout: WorkbenchLayout | undefined,
  options: RestoreAxisDefaultPagesOptions = {}
): WorkbenchCommand[] {
  if (!layout) return [];
  const wanted = options.pageIds ? new Set(options.pageIds) : null;
  const missing = listMissingAxisDefaultPages(layout).filter((page) => !wanted || wanted.has(page.pageId));
  if (!missing.length) return [];

  const pageOrder = [...layout.pageOrder];
  const navOrder = [...layout.navigation.order];
  const navPageOf = new Map<string, string>(
    Object.values(layout.navigation.entries)
      .filter((entry) => typeof entry.pageId === 'string')
      .map((entry) => [entry.id, entry.pageId as string])
  );
  const takenNavIds = new Set(Object.keys(layout.navigation.entries));
  const created = new Set<string>();
  const commands: WorkbenchCommand[] = [];

  for (const page of missing) {
    const spec = axisDefaultPageSpec(layout, page.pageId);
    if (!spec) continue;
    const seedIndex = AXIS_SEED_PAGE_ORDER.indexOf(page.pageId as (typeof AXIS_SEED_PAGE_ORDER)[number]);
    const preceding = AXIS_SEED_PAGE_ORDER.slice(0, seedIndex).reverse();
    const anchorPage = preceding.find((id) => pageOrder.includes(id));
    const index = anchorPage ? pageOrder.indexOf(anchorPage) + 1 : 0;
    let navIndex = 0;
    for (const id of preceding) {
      const at = navOrder.findIndex((entryId) => navPageOf.get(entryId) === id);
      if (at >= 0) {
        navIndex = at + 1;
        break;
      }
    }

    const prepared = prepareSpec(layout, spec, created);
    commands.push(...prepared.commands);
    const pageValue: WorkbenchPage = { id: page.pageId, label: page.label, dock: prepared.dock };
    // The original entry id keeps the nav glyph; minted only on a (dangling) collision.
    const navEntryId = takenNavIds.has(page.navEntryId) ? undefined : page.navEntryId;
    const navEntry: NavigationEntryState | undefined = navEntryId
      ? { id: navEntryId, label: page.label, hidden: false, pageId: page.pageId }
      : undefined;
    commands.push({ type: 'page.add', page: pageValue, index, navIndex, ...(navEntry ? { navEntry } : {}) });

    const entryId = navEntryId ?? `page:${page.pageId}`;
    takenNavIds.add(entryId);
    pageOrder.splice(index, 0, page.pageId);
    navOrder.splice(navIndex, 0, entryId);
    navPageOf.set(entryId, page.pageId);
  }
  return commands;
}

/**
 * One batch that resets a page: a default page's dock goes back to its spec
 * (panels not in the spec are parked; spec panels docked on another page stay
 * there); any other page is cleared (`page.setDock` without a dock parks every
 * panel on it). [] for a missing page.
 */
export function resetAxisPageCommands(layout: WorkbenchLayout | undefined, pageId: string): WorkbenchCommand[] {
  if (!layout?.pages?.[pageId]) return [];
  const spec = isAxisDefaultPage(pageId) ? axisDefaultPageSpec(layout, pageId) : undefined;
  if (!spec) return [{ type: 'page.setDock', pageId }];
  const prepared = prepareSpec(layout, spec, new Set());
  return [...prepared.commands, { type: 'page.setDock', pageId, dock: prepared.dock }];
}

/** The region a spec dock places a prototype in (default: main). */
function specRegionOf(spec: AxisDefaultPageSpec, protoId: string): DockRegionId {
  const dock = spec.buildDock();
  for (const [region, node] of Object.entries(dock.root) as [DockRegionId, DockNode | null][]) {
    if (panelIdsInDockTree(node).includes(protoId)) return region;
  }
  return 'main';
}

/**
 * Page hints (a slim bar above the dock workspace): on a default page, each
 * spec panel that lives on ANOTHER page gets "<Panel> is on page <Page> · Bring
 * it here", which moves it onto this page (`panel.move` with `pageId`) — locked
 * panels too: locked only means a panel cannot leave the layout.
 */
export function axisPageHints(layout: WorkbenchLayout, page: WorkbenchPage): WorkbenchPageHint[] {
  const spec = isAxisDefaultPage(page.id) ? axisDefaultPageSpec(layout, page.id) : undefined;
  if (!spec) return [];
  const docked = dockedPageOf(layout);
  const hints: WorkbenchPageHint[] = [];
  for (const proto of spec.panels) {
    const instance = instanceFor(layout, proto);
    const otherPageId = instance ? docked.get(instance.id) : undefined;
    if (!instance || !otherPageId || otherPageId === page.id) continue;
    const title = instance.title ?? proto.title ?? instance.type;
    const otherLabel = layout.pages[otherPageId]?.label ?? otherPageId;
    const region = specRegionOf(spec, proto.id);
    hints.push({
      id: `axis.bringHere.${instance.id}`,
      text: `${title} is on page ${otherLabel}`,
      actionLabel: 'Bring it here',
      commands: () => [{ type: 'panel.move', panelId: instance.id, to: { kind: 'region', region }, pageId: page.id }]
    });
  }
  return hints;
}

// ── Edit-bar / navigation contributions ──────────────────────────────────────

const noop = (): void => {};

export interface AxisPagesHost {
  getLayout: () => WorkbenchLayout | undefined;
  /** Dispatch ONE batch (one undo step). */
  dispatchMany: (commands: WorkbenchCommand[]) => void;
}

/** "Add page" rows: missing default pages (each restores + opens), what is already there, restore all. */
export function buildAxisAddPageItems(host: AxisPagesHost): WorkbenchAddPageItems {
  const layout = host.getLayout();
  const missing = listMissingAxisDefaultPages(layout);
  if (!missing.length) {
    return {
      leading: [{ id: 'axis.addPage.allThere', kind: 'header', label: 'All default pages are there', className: 'axis-add-page-all', run: noop }]
    };
  }
  const present = AXIS_SEED_PAGE_ORDER.filter((id) => !!layout?.pages?.[id]).map((id) => layout!.pages[id].label);
  const leading: WorkbenchMenuItem[] = [
    { id: 'axis.addPage.missing', kind: 'header', label: 'Missing default pages', run: noop },
    ...missing.map(
      (page): WorkbenchMenuItem => ({
        id: `axis.addPage.restore.${page.pageId}`,
        label: page.label,
        className: 'axis-add-default-page',
        run: () => {
          const commands = restoreAxisDefaultPagesCommands(host.getLayout(), { pageIds: [page.pageId] });
          if (commands.length) host.dispatchMany([...commands, { type: 'page.activate', pageId: page.pageId }]);
        }
      })
    )
  ];
  if (present.length) {
    leading.push({
      id: 'axis.addPage.present',
      kind: 'header',
      label: `Already there: ${present.join(', ')}`,
      className: 'axis-add-page-present',
      run: noop
    });
  }
  return {
    leading,
    trailing: [
      {
        id: 'axis.addPage.restoreAll',
        label: `Restore default pages (${missing.length})`,
        separatorBefore: true,
        run: () => {
          const commands = restoreAxisDefaultPagesCommands(host.getLayout());
          if (commands.length) host.dispatchMany(commands);
        }
      }
    ]
  };
}

/**
 * The same "Add page" contributions as Add palette cards: each missing default
 * page (with its spec dock for the mini-map; a click restores it at its seed
 * position and opens it), "Restore default pages (n)", and a note naming the
 * default pages that are already there.
 */
export function buildAxisAddPageCards(host: AxisPagesHost): WorkbenchAddPageCards {
  const layout = host.getLayout();
  const missing = listMissingAxisDefaultPages(layout);
  if (!missing.length) return { leading: [], note: 'All default pages are there' };
  const present = AXIS_SEED_PAGE_ORDER.filter((id) => !!layout?.pages?.[id]).map((id) => layout!.pages[id].label);
  const leading = missing.map((page): WorkbenchAddPageCard => {
    const spec = axisDefaultPageSpec(layout, page.pageId);
    const titles: Record<string, string> = {};
    for (const panel of spec?.panels ?? []) titles[panel.id] = panel.title ?? panel.type;
    return {
      id: `restore.${page.pageId}`,
      label: page.label,
      hint: 'Missing default page',
      ...(spec ? { dock: spec.buildDock(), titles } : {}),
      run: () => {
        const commands = restoreAxisDefaultPagesCommands(host.getLayout(), { pageIds: [page.pageId] });
        if (commands.length) host.dispatchMany([...commands, { type: 'page.activate', pageId: page.pageId }]);
      }
    };
  });
  return {
    leading,
    trailing: [
      {
        id: 'restoreAll',
        label: `Restore default pages (${missing.length})`,
        hint: 'Every missing default page, at its place',
        run: () => {
          const commands = restoreAxisDefaultPagesCommands(host.getLayout());
          if (commands.length) host.dispatchMany(commands);
        }
      }
    ],
    ...(present.length ? { note: `Already there: ${present.join(', ')}` } : {})
  };
}

/** "Reset to default" for a default page, "Clear page" for any other — always behind an inline confirm. */
export function axisPageResetAction(host: AxisPagesHost, pageId: string): WorkbenchPageResetAction | null {
  const page = host.getLayout()?.pages?.[pageId];
  if (!page) return null;
  const commands = () => resetAxisPageCommands(host.getLayout(), pageId);
  if (isAxisDefaultPage(pageId)) {
    return {
      label: 'Reset to default',
      prompt: `Reset “${page.label}” to its default panels? Other panels on it stay available in Add panel. Undo brings it back.`,
      confirmLabel: 'Reset',
      commands
    };
  }
  return {
    label: 'Clear page',
    prompt: `Clear “${page.label}”? Its panels stay available in Add panel. Undo brings them back.`,
    confirmLabel: 'Clear',
    commands
  };
}

/** The `pages` part of the Axis edit-bar extension (also used by the navigation). */
export function createAxisPagesExtension(host: AxisPagesHost): WorkbenchEditBarPagesExtension {
  return {
    addPageItems: () => buildAxisAddPageItems(host),
    addPageCards: () => buildAxisAddPageCards(host),
    reset: (pageId) => axisPageResetAction(host, pageId)
  };
}
