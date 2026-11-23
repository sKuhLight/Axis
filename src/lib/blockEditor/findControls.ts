// "Find a control…" (F5): the popover groups the block's controls ("jump to" + pin rows); Enter or
// "Show all" opens the flat, directly operable results in the board. Pure (findControls.test.ts).

import { isDivider, pageItems, type BeBoard } from './boardModel';
import { isPinnableKind } from './boardView';
import type { BeCtl, BeKind } from './catalog';

export type FindFilter = 'all' | 'unused';

export interface FindRow {
  key: string;
  label: string;
  kind: BeKind;
  /** Pages the control is on, in page order. */
  pages: string[];
  /** It is on the current page. */
  onCurrent: boolean;
  /** It can be pinned to a workbench panel. */
  pinnable: boolean;
}

export interface FindGroup {
  id: 'cont' | 'toggle' | 'select' | 'other';
  title: string;
  rows: FindRow[];
}

const GROUPS: readonly { id: FindGroup['id']; title: string }[] = [
  { id: 'cont', title: 'Knobs & faders' },
  { id: 'toggle', title: 'Switches' },
  { id: 'select', title: 'Selectors' },
  { id: 'other', title: 'Graphs · meters · actions' }
];

export const KIND_NAME: Readonly<Record<BeKind, string>> = {
  cont: 'Continuous',
  toggle: 'Switch',
  select: 'Selector',
  eq: 'Graph',
  action: 'Action',
  meter: 'Meter',
  wave: 'Waveform'
};

/** The glyph of a row's kind (the Find popover and the "Add" library). */
export const KIND_ICON: Readonly<Record<BeKind, string>> = {
  cont: '◉',
  toggle: '⊙',
  select: '▾',
  eq: '∿',
  action: '⏻',
  meter: '▊',
  wave: '⌇'
};

const groupOf = (kind: BeKind): FindGroup['id'] => (kind === 'cont' || kind === 'toggle' || kind === 'select' ? kind : 'other');

/** Case-insensitive label match; an empty query matches everything. */
export const matchesQuery = (label: string, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !q || label.toLowerCase().includes(q);
};

/** Pages a control key sits on, in page order. */
export function pagesOf(board: BeBoard | null, key: string): string[] {
  if (!board) return [];
  return board.pageOrder.filter((pg) => pageItems(board, pg).some((it) => !isDivider(it) && it.key === key));
}

/** The popover's groups: matching controls (all, or only those on no page), in catalog order. */
export function findGroups(catalog: readonly BeCtl[], board: BeBoard | null, query: string, filter: FindFilter = 'all'): FindGroup[] {
  const current = board?.page ?? '';
  const rows = new Map<FindGroup['id'], FindRow[]>();
  for (const c of catalog) {
    if (!matchesQuery(c.label, query)) continue;
    const pages = pagesOf(board, c.key);
    if (filter === 'unused' && pages.length) continue;
    const g = groupOf(c.kind);
    const list = rows.get(g) ?? [];
    list.push({ key: c.key, label: c.label, kind: c.kind, pages, onCurrent: pages.includes(current), pinnable: isPinnableKind(c) });
    rows.set(g, list);
  }
  return GROUPS.filter((g) => rows.get(g.id)?.length).map((g) => ({ ...g, rows: rows.get(g.id)! }));
}

/** First row of the groups (keyboard default), or null. */
export const firstRow = (groups: readonly FindGroup[]): FindRow | null => groups[0]?.rows[0] ?? null;

/** Page to jump to for a control: the current page when it is there, else its first page; null when the
 *  control is on no page. */
export function jumpPage(board: BeBoard | null, key: string, preferred?: string): string | null {
  const pages = pagesOf(board, key);
  if (!pages.length) return null;
  if (preferred && pages.includes(preferred)) return preferred;
  return board && pages.includes(board.page) ? board.page : pages[0]!;
}

/** Id of a control's tile on a page (for the jump highlight). */
export function itemIdOn(board: BeBoard | null, page: string, key: string): string | null {
  if (!board) return null;
  const it = pageItems(board, page).find((i) => !isDivider(i) && i.key === key);
  return it ? it.id : null;
}

/** The flat "Show all" results: every matching control except the EQ graph (as the results view
 *  always did); an empty query lists every control. The popover's filter carries over ("unused" = on
 *  no page of the board). */
export function flatMatches(catalog: readonly BeCtl[], query: string, filter: FindFilter = 'all', board: BeBoard | null = null): BeCtl[] {
  return catalog.filter((c) => c.kind !== 'eq' && matchesQuery(c.label, query) && (filter !== 'unused' || !pagesOf(board, c.key).length));
}
