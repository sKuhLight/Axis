/**
 * The Add palette's catalog (pure, unit-tested): panels, pages and widgets as
 * one list of cards, with each card's status, plus the filter chips and the
 * search. The palette component (host-supplied, see `renderRegistry`
 * `registerAddPalette`) only renders these cards; what a card DOES lives in
 * `addPalette.ts`.
 *
 * Card order: panels (catalog order, then panel templates) · pages (host
 * "missing default pages", Blank page, hidden navigation entries, host
 * "Restore default pages") · widgets (built-in types, hidden widgets, widget
 * templates; unavailable widgets last).
 */
import type {
  DockLayout,
  DockTarget,
  NavigationEntryState,
  PanelCatalogEntry,
  WidgetCatalogEntry,
  WidgetZoneId,
  WorkbenchCommand,
  WorkbenchLayout
} from '../core';
import { createEmptyWorkbenchPage } from '../core';

export type AddPaletteFilter = 'all' | 'panels' | 'pages' | 'widgets';

/**
 * Width (CSS px) of the compact "+" a widget zone shows at its free end while
 * editing (WidgetZone). Exposed so the bar auto-fit can reserve room for it.
 */
export const WIDGET_ZONE_ADD_BUTTON_PX = 26;

export const ADD_PALETTE_FILTERS: ReadonlyArray<{ id: AddPaletteFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'panels', label: 'Panels' },
  { id: 'pages', label: 'Pages' },
  { id: 'widgets', label: 'Widgets' }
];

/**
 * A fixed target (the context "+" entries): a card of the matching kind is
 * inserted right there — no highlight step. Cards of other kinds still go
 * through the highlight step. Without an index a widget target means the end
 * of its zone, a page target the end of the navigation (a re-shown hidden
 * entry included — not the slot it was hidden from).
 */
export type AddPaletteTarget =
  | { kind: 'panel'; to: DockTarget; label: string }
  | { kind: 'widget'; zone: WidgetZoneId; index?: number; label: string }
  | { kind: 'page'; navIndex?: number; label: string };

export interface WorkbenchAddPaletteRequest {
  /** The filter chip the palette opens on. */
  filter: AddPaletteFilter;
  target?: AddPaletteTarget;
}

/**
 * A host page card (e.g. a missing default page, "Restore default pages"):
 * `run` performs it directly (these pages have a fixed home). `dock` + `titles`
 * feed the mini-map.
 */
export interface WorkbenchAddPageCard {
  id: string;
  label: string;
  /** Status line under the title. */
  hint?: string;
  dock?: DockLayout;
  /** Panel id → title, for the mini-map labels. */
  titles?: Record<string, string>;
  run: () => void;
}

/** Host page cards around the generic Blank page / hidden navigation cards. */
export interface WorkbenchAddPageCards {
  /** Before Blank page (missing default pages). */
  leading: WorkbenchAddPageCard[];
  /** After the hidden navigation entries (restore all). */
  trailing?: WorkbenchAddPageCard[];
  /** A note shown with the page cards (e.g. which default pages are there). */
  note?: string;
}

export type AddCardTone = 'here' | 'elsewhere' | 'none' | 'new' | 'off';

export type AddPageAction =
  | { action: 'host'; card: WorkbenchAddPageCard }
  | { action: 'blank' }
  | { action: 'showNav'; entryId: string; pageId?: string };

interface AddCardBase {
  key: string;
  title: string;
  status: string;
  tone: AddCardTone;
  /** A saved template (the card has a ⋯ menu: rename, export, delete). */
  template: boolean;
  /** Why the card cannot be used (greyed). */
  disabled?: string;
  /** Lower-case text the search matches against. */
  search: string;
}

export type AddCatalogItem =
  | (AddCardBase & { kind: 'panel'; entry: PanelCatalogEntry })
  | (AddCardBase & { kind: 'widget'; entry: WidgetCatalogEntry })
  | (AddCardBase & {
      kind: 'page';
      page: AddPageAction;
      dock?: DockLayout;
      titles?: Record<string, string>;
    });

// ── Statuses ─────────────────────────────────────────────────────────────────

/** Where a panel is, relative to the page the palette adds to. */
export function panelCardStatus(entry: PanelCatalogEntry): { status: string; tone: AddCardTone } {
  if (entry.source === 'template') {
    const count = entry.panelCount ?? 1;
    return { status: `Template · ${count} ${count === 1 ? 'panel' : 'panels'}`, tone: 'new' };
  }
  if (entry.multiple) return { status: 'New · empty, for widgets and parameters', tone: 'new' };
  if (entry.placement === 'docked') {
    return entry.onActivePage ? { status: 'On this page', tone: 'here' } : { status: `On ${entry.pageLabel ?? entry.pageId}`, tone: 'elsewhere' };
  }
  if (entry.placement === 'parked') return { status: 'Not placed', tone: 'none' };
  return { status: 'Nowhere yet', tone: 'none' };
}

/** Where a widget is: "In Top right", "Hidden", "Not placed", or why it is unavailable. */
export function widgetCardStatus(entry: WidgetCatalogEntry, zoneLabel: (zone: WidgetZoneId) => string): { status: string; tone: AddCardTone } {
  if (entry.unavailable) return { status: entry.unavailable, tone: 'off' };
  if (entry.source === 'template') {
    const count = entry.widgetCount ?? 1;
    return { status: `Template · ${count} ${count === 1 ? 'widget' : 'widgets'}`, tone: 'new' };
  }
  if (entry.placement === 'placed' && entry.zone) return { status: `In ${zoneLabel(entry.zone)}`, tone: 'elsewhere' };
  if (entry.placement === 'hidden') return { status: 'Hidden', tone: 'none' };
  return { status: 'Not placed', tone: 'none' };
}

// ── Building ─────────────────────────────────────────────────────────────────

export interface BuildAddCatalogInput {
  layout: WorkbenchLayout | undefined;
  panels: readonly PanelCatalogEntry[];
  widgets: readonly WidgetCatalogEntry[];
  /** Host page cards (missing default pages, restore all). */
  pageCards?: WorkbenchAddPageCards | null;
  zoneLabel: (zone: WidgetZoneId) => string;
}

const searchOf = (...parts: Array<string | undefined>): string =>
  parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** Panel id → title for every panel of a layout (mini-map labels). */
export function panelTitles(layout: WorkbenchLayout | undefined): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const panel of Object.values(layout?.panels ?? {})) titles[panel.id] = panel.title ?? panel.type;
  return titles;
}

function hiddenNavigationEntries(layout: WorkbenchLayout | undefined): NavigationEntryState[] {
  if (!layout) return [];
  const order = layout.navigation.order;
  return Object.values(layout.navigation.entries)
    .filter((entry) => entry.hidden)
    .sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.id.localeCompare(b.id);
    });
}

export function buildAddCatalog(input: BuildAddCatalogInput): AddCatalogItem[] {
  const { layout } = input;
  const items: AddCatalogItem[] = [];

  // Panels: instances / canonical first, templates after (catalog order within each).
  const panelEntries = [...input.panels.filter((entry) => entry.source !== 'template'), ...input.panels.filter((entry) => entry.source === 'template')];
  for (const entry of panelEntries) {
    const { status, tone } = panelCardStatus(entry);
    items.push({
      kind: 'panel',
      key: `panel:${entry.key}`,
      title: entry.title,
      status,
      tone,
      template: entry.source === 'template',
      entry,
      search: searchOf(entry.title, status, entry.type, entry.source === 'template' ? 'template' : 'panel')
    });
  }

  // Pages.
  const titles = panelTitles(layout);
  for (const card of input.pageCards?.leading ?? []) {
    items.push({
      kind: 'page',
      key: `page:host:${card.id}`,
      title: card.label,
      status: card.hint ?? 'Default page',
      tone: 'none',
      template: false,
      page: { action: 'host', card },
      dock: card.dock,
      titles: card.titles,
      search: searchOf(card.label, card.hint, 'page')
    });
  }
  items.push({
    kind: 'page',
    key: 'page:blank',
    title: 'Blank page',
    status: 'An empty page',
    tone: 'new',
    template: false,
    page: { action: 'blank' },
    search: searchOf('blank page', 'empty new page')
  });
  for (const entry of hiddenNavigationEntries(layout)) {
    const page = entry.pageId ? layout?.pages[entry.pageId] : undefined;
    const label = entry.label ?? page?.label ?? entry.id;
    items.push({
      kind: 'page',
      key: `page:nav:${entry.id}`,
      title: label,
      status: 'Hidden in navigation',
      tone: 'none',
      template: false,
      page: { action: 'showNav', entryId: entry.id, ...(entry.pageId ? { pageId: entry.pageId } : {}) },
      ...(page ? { dock: page.dock, titles } : {}),
      search: searchOf(label, 'hidden navigation page')
    });
  }
  for (const card of input.pageCards?.trailing ?? []) {
    items.push({
      kind: 'page',
      key: `page:host:${card.id}`,
      title: card.label,
      status: card.hint ?? '',
      tone: 'new',
      template: false,
      page: { action: 'host', card },
      dock: card.dock,
      titles: card.titles,
      search: searchOf(card.label, card.hint, 'page')
    });
  }

  // Widgets (the catalog already lists unavailable ones last).
  for (const entry of input.widgets) {
    const { status, tone } = widgetCardStatus(entry, input.zoneLabel);
    items.push({
      kind: 'widget',
      key: `widget:${entry.key}`,
      title: entry.title,
      status,
      tone,
      template: entry.source === 'template',
      entry,
      ...(entry.unavailable ? { disabled: entry.unavailable } : {}),
      search: searchOf(entry.title, status, entry.type, ...(entry.keywords ?? []), entry.source === 'template' ? 'template' : 'widget')
    });
  }
  return items;
}

const FILTER_KIND: Record<Exclude<AddPaletteFilter, 'all'>, AddCatalogItem['kind']> = {
  panels: 'panel',
  pages: 'page',
  widgets: 'widget'
};

/**
 * The cards a filter chip + search show, in catalog order. The search matches
 * every whitespace-separated term (case-insensitive) against a card's title,
 * status and type.
 */
export function filterAddCatalog(items: readonly AddCatalogItem[], filter: AddPaletteFilter, query: string): AddCatalogItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filter !== 'all' && item.kind !== FILTER_KIND[filter]) return false;
    return terms.every((term) => item.search.includes(term));
  });
}

/** Card counts per chip (for a "n results" line and chip hints). */
export function addCatalogCounts(items: readonly AddCatalogItem[]): Record<AddPaletteFilter, number> {
  return {
    all: items.length,
    panels: items.filter((item) => item.kind === 'panel').length,
    pages: items.filter((item) => item.kind === 'page').length,
    widgets: items.filter((item) => item.kind === 'widget').length
  };
}

/** "n results" (as the CommandPalette counts). */
export function addResultCountLabel(count: number): string {
  return `${count} result${count === 1 ? '' : 's'}`;
}

/** The target chip: the fixed target, or how placing works. */
export function addPaletteTargetChip(target: AddPaletteTarget | undefined): string {
  return target ? `✛ ${target.label}` : '✛ Pick a card, then click a highlight';
}

/** Whether a card of this kind goes straight to the fixed target (no highlight step). */
export function cardUsesFixedTarget(item: Pick<AddCatalogItem, 'kind'>, target: AddPaletteTarget | undefined): boolean {
  return !!target && target.kind === item.kind;
}

// ── Navigation insertion (page cards) ───────────────────────────────────────

/**
 * Map an insertion gap among the VISIBLE navigation entries to an index in
 * `navigation.order` (which also holds hidden entries): the gap before visible
 * entry `gap` sits right before that entry; past the last one is the end.
 * `movingId` (an entry being re-shown) is left out of the order first, like
 * the reducer's move.
 */
export function navOrderIndexForGap(order: readonly string[], visibleIds: readonly string[], gap: number, movingId?: string): number {
  const rest = movingId ? order.filter((id) => id !== movingId) : [...order];
  const before = visibleIds.filter((id) => id !== movingId)[gap];
  if (before == null) return rest.length;
  const at = rest.indexOf(before);
  return at < 0 ? rest.length : at;
}

/**
 * Map a navigation gap given by its NEIGHBOURS (`before`: the entry right after
 * the gap, `after`: the one right before it — measured on screen) to an index in
 * `navigation.order`: right before `before`, else right after `after`, else the
 * end. By id, so entries scrolled out of view or not rendered do not shift it.
 * `movingId` (an entry being re-shown) is left out of the order first, like the
 * reducer's move.
 */
export function navOrderIndexForNeighbours(
  order: readonly string[],
  neighbours: { before?: string; after?: string },
  movingId?: string
): number {
  const rest = movingId ? order.filter((id) => id !== movingId) : [...order];
  const before = neighbours.before && neighbours.before !== movingId ? rest.indexOf(neighbours.before) : -1;
  if (before >= 0) return before;
  const after = neighbours.after && neighbours.after !== movingId ? rest.indexOf(neighbours.after) : -1;
  if (after >= 0) return after + 1;
  return rest.length;
}

/**
 * The pageOrder index for a new page whose nav entry lands at `navIndex`: right
 * after the last page whose (page-bound) entry precedes it — so pages and the
 * navigation stay in the same sequence.
 */
export function pageIndexForNavIndex(layout: WorkbenchLayout, navIndex: number): number {
  const preceding = layout.navigation.order.slice(0, Math.max(0, navIndex));
  let index = 0;
  for (const entryId of preceding) {
    const pageId = layout.navigation.entries[entryId]?.pageId;
    if (!pageId) continue;
    const at = layout.pageOrder.indexOf(pageId);
    if (at >= 0) index = Math.max(index, at + 1);
  }
  return index;
}

/**
 * One batch that adds a blank page and opens it. With `navIndex` (a placed
 * page) its nav entry lands there and the page takes the matching pageOrder
 * slot; without it both go to the end.
 */
export function blankPageCommands(layout: WorkbenchLayout, pageId: string, navIndex?: number | null): WorkbenchCommand[] {
  const page = createEmptyWorkbenchPage({ id: pageId, label: `Page ${layout.pageOrder.length + 1}` });
  const add: WorkbenchCommand =
    navIndex == null ? { type: 'page.add', page } : { type: 'page.add', page, index: pageIndexForNavIndex(layout, navIndex), navIndex };
  return [add, { type: 'page.activate', pageId }];
}

/** Show a hidden navigation entry again, at `navIndex` (or where it was). */
export function showNavigationEntryCommands(entryId: string, navIndex?: number | null): WorkbenchCommand[] {
  return [navIndex == null ? { type: 'navigation.show', entryId } : { type: 'navigation.show', entryId, index: navIndex }];
}
