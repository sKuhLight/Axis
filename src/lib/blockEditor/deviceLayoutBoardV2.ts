// Default Block Editor board (v2, cell units) from the server's device layout.
//
// Pages become pages; inside a page the controls take the device editor's positions where the layout
// gives them (exact pixel positions, columns, nudges) and otherwise flow left→right inside a layout row,
// rows top→bottom; section changes and section titles become labelled dividers (layoutPlacement.ts has
// the rules). Catalog entries the layout never mentions go to a trailing "More" page, except graph displays
// (only a graph slot of the layout anchors one; the Arrange library offers the rest). Sizes come from
// BE_SPEC (one knob = 2×2) and a page is at most 24 cells wide. Same control resolution as the v1
// builder in ../deviceLayoutBoard.ts (shared `resolveControl`).
//
// What every page repeats (the mixer, a control beside the pages) is taken off the pages and packed into the
// board's fixed area once (fixedSeed.ts has the rules); nothing repeated = no fixed area. The header's
// controls (headerControls.ts) are on no page and not in the area; a page that held only those goes away.
//
// Height budget: a taller page can shrink the shared cell size. The tallest remaining rows-only page
// sets the floor. Up to two extra lines for titles and dividers can use the height freed by the fixed area
// and header. A page over budget drops inserted title lines, then section dividers, then positions,
// and finally falls back to rows only (`fitLayoutPage`).
// (The fixed area has a width of its own: a block that is limited by the panel's width can get smaller cells
// than before it.)
//
// Previous defaults are still built for recognition only (the persistence layer finds a stored board that is
// still exactly one of them): `rowFlowOnly` = before positions were used (rows only, no dividers; it also
// sets the height budget), `withoutFixed` = before the fixed area (every control on its pages, the header's
// included, no page-level controls).
// Pure (deviceLayoutBoardV2.test.ts).

import { layoutVariantSig, resolveControl, withoutCrossBlockRefs, type LayoutOwner } from '../deviceLayoutBoard';
import type { DeviceLayout, LayoutPage } from '../types';
import { bbox, BE_SPEC, findFree, isBeView, MAXC, type BeBoard, type BeControl, type BeItem, type BeView } from './boardModel';
import type { BeCtl } from './catalog';
import { packFixed, pickFixed } from './fixedSeed';
import { headerKeys, type HeaderBlockState } from './headerControls';
import { fitLayoutPage, GAP_CELLS, itemId, measureLayoutPitch, pageEntries, pageRows, pitchSamples, rowKeys, type PageMode, type PlacedRow } from './layoutPlacement';

export { GAP_CELLS, itemId };

/** Lines a page may take for titles and dividers over the tallest page by rows only. */
export const TITLE_LINES = 2;

const sizeFor = (view: BeView): { w: number; h: number } => ({ w: Math.min(BE_SPEC[view].w, MAXC), h: BE_SPEC[view].h });

/** Left→right sweep in catalog order, wrapping at `maxC` cells (the "More" page). */
function packSequential(ctls: readonly BeCtl[], pageIndex: number, maxC: number): BeControl[] {
  const out: BeControl[] = [];
  let x = 0;
  let y = 0;
  let rowH = 1;
  for (const c of ctls) {
    const { w, h } = sizeFor(c.view);
    if (x + w > maxC) {
      y += rowH;
      x = 0;
      rowH = 1;
    }
    out.push({ id: itemId(pageIndex, c.key), key: c.key, view: c.view, x, y, w, h });
    x += w;
    rowH = Math.max(rowH, h);
  }
  return out;
}

/** One page by rows only (no placement data, no dividers), a gap = one knob slot. A control in `skip` leaves
 *  no slot, nor does a gap left of the first control of such a row. */
function rowFlowPage(rows: readonly PlacedRow[], byKey: ReadonlyMap<string, BeCtl>, pageIndex: number, owner: LayoutOwner, skip: ReadonlySet<string>): BeControl[] {
  const items: BeControl[] = [];
  const seen = new Set<string>();
  const own = rowKeys(rows, byKey, owner);
  let gridY = 0;
  rows.forEach((row, rowIndex) => {
    let x = 0;
    let rowH = 1;
    let placed = false;
    const resolved = (row.controls ?? []).map((ctl) => resolveControl(ctl, byKey, owner));
    const someGone = resolved.some((r) => r !== 'gap' && skip.has(r.key));
    for (const r of resolved) {
      const base = r === 'gap' ? undefined : byKey.get(r.key);
      if (r !== 'gap' && skip.has(r.key)) continue;
      if (r === 'gap' || !base || seen.has(r.key) || (row.pageLevel && own.has(r.key))) {
        if (!row.pageLevel && (placed || !someGone)) x += GAP_CELLS; // keep the slot so neighbours stay aligned
        continue;
      }
      const view: BeView = isBeView(r.view) && base.views.includes(r.view) ? r.view : base.view;
      const { w, h } = sizeFor(view);
      if (x + w > MAXC) {
        gridY += rowH; // wrap onto a new line, still the same layout row
        x = 0;
        rowH = 1;
      }
      seen.add(r.key);
      items.push({ id: itemId(pageIndex, r.key), key: r.key, view, x, y: gridY, w, h, row: rowIndex });
      x += w;
      rowH = Math.max(rowH, h);
      placed = true;
    }
    if (placed) gridY += rowH;
  });
  return items;
}

export interface DeviceLayoutBoardOptions {
  /** Build a previous default: rows only, no positions, no dividers, everything on its pages. */
  rowFlowOnly?: boolean;
  /** Build the previous default as versions before the fixed area did: every control on its pages (the
   *  header's controls and the repeated mixer included), no page-level controls — only to recognise an
   *  untouched stored Default board (boardPersistence `previousSeed`), never for a drawn board. */
  withoutFixed?: boolean;
  /** The served block state (its params are the header's); absent = the server tags none. */
  blockState?: HeaderBlockState | null;
  /** Told how every page was laid out (diagnostics and tests). */
  onPage?: (page: string, mode: PageMode) => void;
  /** Effect id of the open block: a control of another block (a cross-block ref) binds only when the
   *  server names this block as its owner; otherwise it is a gap (deviceLayoutBoard `isForeignControl`). */
  effectId?: number | null;
  /** Build a previous default exactly as versions before the cross-block guard did (refs bound by their
   *  bare paramId) — only to recognise an untouched stored Default board (boardPersistence
   *  `previousSeed`), never for a drawn board. */
  legacyUnguarded?: boolean;
}

/** True when the device layout has a control the default board can show (it then comes from the layout;
 *  otherwise the curated fallback is used): one the catalog lists and the header does not show. */
export function hasDeviceLayoutBoard(
  layout: DeviceLayout | null | undefined,
  catalog: readonly BeCtl[],
  opts: Pick<DeviceLayoutBoardOptions, 'effectId' | 'blockState'> = {}
): boolean {
  if (!layout?.pages?.length) return false;
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const own: LayoutOwner = { effectId: opts.effectId, family: layout.family };
  const header = headerKeys(catalog, { layout, blockState: opts.blockState, effectId: opts.effectId });
  return layout.pages.some((pg) => pageEntries(pageRows(pg), byKey, own, header).some((e) => e.kind === 'tile'));
}

/** Height of the tallest of some pages (cells). */
const tallest = (pages: readonly (readonly BeItem[])[]): number => Math.max(0, ...pages.map((items) => (items.length ? bbox(items).R : 0)));
const tallestPage = (b: BeBoard | null): number => (b ? tallest(b.pageOrder.map((p) => b.boards[p]!)) : 0);

/** Board from a device layout, or null when it has no renderable control (the caller then uses the
 *  curated board). */
export function buildDeviceLayoutBoardV2(
  served: DeviceLayout | null | undefined,
  catalog: readonly BeCtl[],
  opts: DeviceLayoutBoardOptions = {}
): BeBoard | null {
  if (!served?.pages?.length) return null;
  const layout = opts.legacyUnguarded ? withoutCrossBlockRefs(served) : served;
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const owner: LayoutOwner = { effectId: opts.effectId, family: layout.family };

  // page names key the board, so a layout that repeats a name gets a numeric suffix
  const used = new Set<string>();
  const uniqName = (n: string): string => {
    let name = n || 'Page';
    for (let i = 2; used.has(name); i++) name = `${n || 'Page'} ${i}`;
    used.add(name);
    return name;
  };

  const pages = layout.pages.filter((pg): pg is LayoutPage => !!pg && typeof pg === 'object');
  const previous = !!(opts.rowFlowOnly || opts.withoutFixed);
  const rows = pages.map((pg): readonly PlacedRow[] => (previous ? (pg.rows ?? []) : pageRows(pg)));
  // what is not on the pages: the header's controls, and what the fixed area takes
  const header: ReadonlySet<string> = previous ? new Set<string>() : headerKeys(catalog, { layout, blockState: opts.blockState, effectId: opts.effectId });
  const picks = previous ? [] : pickFixed(rows.map((r) => pageEntries(r, byKey, owner, header)));
  const skip: ReadonlySet<string> = new Set([...header, ...picks.map((p) => p.key)]);
  const entries = opts.rowFlowOnly ? [] : rows.map((r) => pageEntries(r, byKey, owner, skip));
  const layoutPitch = opts.rowFlowOnly ? null : measureLayoutPitch(entries.map(pitchSamples));
  // the height budget (see above): previous defaults kept to their own rows-only height
  const full = opts.rowFlowOnly ? 0 : tallestPage(buildDeviceLayoutBoardV2(layout, catalog, { rowFlowOnly: true, effectId: opts.effectId }));
  const left = previous ? full : tallest(rows.map((r) => rowFlowPage(r, byKey, 0, owner, skip)));
  const budget = Math.max(left, Math.min(full, left + TITLE_LINES));

  const boards: Record<string, BeItem[]> = {};
  const pageOrder: string[] = [];
  pages.forEach((pg, i) => {
    const pageIndex = pageOrder.length;
    let items: BeItem[];
    let mode: PageMode = 'rows-only';
    if (opts.rowFlowOnly) items = rowFlowPage(rows[i]!, byKey, pageIndex, owner, skip);
    else ({ items, mode } = fitLayoutPage(entries[i]!, { pageIndex, layoutPitch }, budget, () => rowFlowPage(rows[i]!, byKey, pageIndex, owner, skip)));
    if (!items.some((it) => 'key' in it)) return;
    const name = uniqName(pg.name?.trim() || `Page ${pageOrder.length + 1}`);
    boards[name] = items;
    pageOrder.push(name);
    opts.onPage?.(name, mode);
  });
  if (!pageOrder.length) return null;

  const placedKeys = new Set(pageOrder.flatMap((p) => boards[p]!.flatMap((it) => ('key' in it ? [it.key] : []))));
  // graph displays the layout does not anchor are not added (no page just for a graph): the Arrange
  // library offers them
  const rest = catalog.filter((c) => !placedKeys.has(c.key) && !skip.has(c.key) && c.kind !== 'graph');
  const device = tallest(pageOrder.map((p) => boards[p]!));
  // "More" uses the same 24-cell reference as the fixed area beside it.
  const more = (cols: number): BeControl[] => packSequential(rest, pageOrder.length, MAXC - cols);
  const fixed = packFixed(picks, (key) => byKey.get(key)?.label ?? key, (cols) => Math.max(device, tallest([more(cols)])));
  if (rest.length) {
    const items = more(fixed?.cols ?? 0);
    const name = uniqName('More');
    boards[name] = items;
    pageOrder.push(name);
  }
  return { v: 2, pageOrder, page: pageOrder[0]!, boards, ...(fixed ? { fixed } : {}), variantSig: layoutVariantSig(layout) };
}

export interface CuratedBoardOptions {
  /** The served block state (its params are the header's); absent = the server tags none. */
  blockState?: HeaderBlockState | null;
  /** Build the previous default, with the header's controls — only to recognise an untouched stored Default
   *  board (boardPersistence `previousSeed`). */
  withHeader?: boolean;
}

/** Curated board for blocks without a device layout: "Main" (EQ, the given musician-facing knobs) and
 *  "Advanced" (everything else the header does not show), each filled first-free in catalog order; no fixed
 *  area. Graph displays are not placed (no layout anchors them): the Arrange library offers them. */
export function buildCuratedBoardV2(catalog: readonly BeCtl[], mainParamIds: ReadonlySet<number>, opts: CuratedBoardOptions = {}): BeBoard {
  const header: ReadonlySet<string> = opts.withHeader ? new Set<string>() : headerKeys(catalog, { blockState: opts.blockState });
  const shown = catalog.filter((c) => !header.has(c.key));
  const fill = (ctls: readonly BeCtl[], pageIndex: number): BeControl[] => {
    const out: BeControl[] = [];
    for (const c of ctls) {
      const { w, h } = sizeFor(c.view);
      const p = findFree(out, w, h);
      out.push({ id: itemId(pageIndex, c.key), key: c.key, view: c.view, x: p.x, y: p.y, w, h });
    }
    return out;
  };
  const main = shown.filter((c) => c.key === 'eq' || c.key === 'bypass' || (c.kind === 'cont' && mainParamIds.has(c.id)));
  const rest = shown.filter((c) => !main.includes(c) && c.kind !== 'graph');
  // nothing musician-facing left: everything on Main, no empty page in front
  if (!main.length) return { v: 2, pageOrder: ['Main'], page: 'Main', boards: { Main: fill(rest, 0) } };
  const boards: Record<string, BeControl[]> = { Main: fill(main, 0) };
  const pageOrder = ['Main'];
  if (rest.length) {
    boards.Advanced = fill(rest, 1);
    pageOrder.push('Advanced');
  }
  return { v: 2, pageOrder, page: 'Main', boards };
}
