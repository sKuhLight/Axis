// Default Block Editor board (v2, cell units) from the server's device layout.
//
// Pages become pages; inside a page the controls take the device editor's positions where the layout
// gives them (exact pixel positions, columns, nudges) and otherwise flow left→right inside a layout row,
// rows top→bottom; section changes and section titles become labelled dividers (layoutPlacement.ts has
// the rules). Catalog entries the layout never mentions go to a trailing "More" page. Sizes come from
// BE_SPEC (one knob = 2×2) and a page is at most 24 cells wide. Same control resolution as the v1
// builder in ../deviceLayoutBoard.ts (shared `resolveControl`).
//
// Height budget: all pages of a board share one cell size (always fit), so a taller page would shrink
// the controls of every page. No page of the new default may be taller than the tallest page of the
// previous rows-only default; a page over it drops inserted title lines, then section-divider lines,
// then its positions, and last falls back to its rows-only layout (`fitLayoutPage`).
//
// `rowFlowOnly` builds the board as it was before positions were used (rows only, no dividers): it sets
// the height budget, and the persistence layer recognises a stored board that is still exactly that
// previous default.
// Pure (deviceLayoutBoardV2.test.ts).

import { layoutVariantSig, resolveControl } from '../deviceLayoutBoard';
import type { DeviceLayout, LayoutPage } from '../types';
import { bbox, BE_SPEC, findFree, isBeView, MAXC, type BeBoard, type BeControl, type BeItem, type BeView } from './boardModel';
import type { BeCtl } from './catalog';
import { fitLayoutPage, GAP_CELLS, itemId, measureLayoutPitch, pageEntries, pitchSamples, type PageMode } from './layoutPlacement';

export { GAP_CELLS, itemId };

const sizeFor = (view: BeView): { w: number; h: number } => ({ w: Math.min(BE_SPEC[view].w, MAXC), h: BE_SPEC[view].h });

/** Left→right sweep in catalog order, wrapping at 24 cells (the "More" page). */
function packSequential(ctls: readonly BeCtl[], pageIndex: number): BeControl[] {
  const out: BeControl[] = [];
  let x = 0;
  let y = 0;
  let rowH = 1;
  for (const c of ctls) {
    const { w, h } = sizeFor(c.view);
    if (x + w > MAXC) {
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

/** The previous default of one page: rows only (no placement data, no dividers), a gap = one knob slot. */
function rowFlowPage(pg: LayoutPage, byKey: ReadonlyMap<string, BeCtl>, pageIndex: number): BeControl[] {
  const items: BeControl[] = [];
  const seen = new Set<string>();
  let gridY = 0;
  (pg.rows ?? []).forEach((row, rowIndex) => {
    let x = 0;
    let rowH = 1;
    let placed = false;
    for (const ctl of row.controls ?? []) {
      const r = resolveControl(ctl, byKey);
      const base = r === 'gap' ? undefined : byKey.get(r.key);
      if (r === 'gap' || !base || seen.has(r.key)) {
        x += GAP_CELLS; // keep the slot so neighbours stay aligned
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
  /** Build the previous default (rows only, no positions, no dividers). */
  rowFlowOnly?: boolean;
  /** Told how every page was laid out (diagnostics and tests). */
  onPage?: (page: string, mode: PageMode) => void;
}

/** True when the device layout has a control the catalog can show (the default board then comes from
 *  it; otherwise the curated fallback is used). */
export function hasDeviceLayoutBoard(layout: DeviceLayout | null | undefined, catalog: readonly BeCtl[]): boolean {
  if (!layout?.pages?.length) return false;
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  return layout.pages.some((pg) => !!pg && (pg.rows ?? []).some((r) => (r?.controls ?? []).some((c) => !!c && resolveControl(c, byKey) !== 'gap')));
}

/** Height of the tallest page of a board (cells). */
const tallestPage = (b: BeBoard | null): number => (b ? Math.max(0, ...b.pageOrder.map((p) => (b.boards[p]!.length ? bbox(b.boards[p]!).R : 0))) : 0);

/** Board from a device layout, or null when it has no renderable control (the caller then uses the
 *  curated board). */
export function buildDeviceLayoutBoardV2(layout: DeviceLayout | null | undefined, catalog: readonly BeCtl[], opts: DeviceLayoutBoardOptions = {}): BeBoard | null {
  if (!layout?.pages?.length) return null;
  const byKey = new Map(catalog.map((c) => [c.key, c]));

  // page names key the board, so a layout that repeats a name gets a numeric suffix
  const used = new Set<string>();
  const uniqName = (n: string): string => {
    let name = n || 'Page';
    for (let i = 2; used.has(name); i++) name = `${n || 'Page'} ${i}`;
    used.add(name);
    return name;
  };

  const pages = layout.pages.filter((pg): pg is LayoutPage => !!pg && typeof pg === 'object');
  const entries = opts.rowFlowOnly ? [] : pages.map((pg) => pageEntries(pg.rows, byKey));
  const layoutPitch = opts.rowFlowOnly ? null : measureLayoutPitch(entries.map(pitchSamples));
  // the previous default's tallest page: no page may get taller (one cell size for every page)
  const budget = opts.rowFlowOnly ? 0 : tallestPage(buildDeviceLayoutBoardV2(layout, catalog, { rowFlowOnly: true }));

  const boards: Record<string, BeItem[]> = {};
  const pageOrder: string[] = [];
  pages.forEach((pg, i) => {
    const pageIndex = pageOrder.length;
    let items: BeItem[];
    let mode: PageMode = 'rows-only';
    if (opts.rowFlowOnly) items = rowFlowPage(pg, byKey, pageIndex);
    else ({ items, mode } = fitLayoutPage(entries[i]!, { pageIndex, layoutPitch }, budget, () => rowFlowPage(pg, byKey, pageIndex)));
    if (!items.some((it) => 'key' in it)) return;
    const name = uniqName(pg.name?.trim() || `Page ${pageOrder.length + 1}`);
    boards[name] = items;
    pageOrder.push(name);
    opts.onPage?.(name, mode);
  });
  if (!pageOrder.length) return null;

  const placedKeys = new Set(pageOrder.flatMap((p) => boards[p]!.flatMap((it) => ('key' in it ? [it.key] : []))));
  const rest = catalog.filter((c) => !placedKeys.has(c.key));
  if (rest.length) {
    const name = uniqName('More');
    boards[name] = packSequential(rest, pageOrder.length);
    pageOrder.push(name);
  }
  return { v: 2, pageOrder, page: pageOrder[0]!, boards, variantSig: layoutVariantSig(layout) };
}

/** Curated board for blocks without a device layout: "Main" (EQ, the given musician-facing knobs,
 *  bypass) and "Advanced" (everything else), each filled first-free in catalog order. */
export function buildCuratedBoardV2(catalog: readonly BeCtl[], mainParamIds: ReadonlySet<number>): BeBoard {
  const fill = (ctls: readonly BeCtl[], pageIndex: number): BeControl[] => {
    const out: BeControl[] = [];
    for (const c of ctls) {
      const { w, h } = sizeFor(c.view);
      const p = findFree(out, w, h);
      out.push({ id: itemId(pageIndex, c.key), key: c.key, view: c.view, x: p.x, y: p.y, w, h });
    }
    return out;
  };
  const main = catalog.filter((c) => c.key === 'eq' || c.key === 'bypass' || (c.kind === 'cont' && mainParamIds.has(c.id)));
  const rest = catalog.filter((c) => !main.includes(c));
  const boards: Record<string, BeControl[]> = { Main: fill(main, 0) };
  const pageOrder = ['Main'];
  if (rest.length) {
    boards.Advanced = fill(rest, 1);
    pageOrder.push('Advanced');
  }
  return { v: 2, pageOrder, page: 'Main', boards };
}
