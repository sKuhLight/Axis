// Default Block Editor board (v2, cell units) from the server's device layout.
//
// Same resolution rules as the v1 builder in ../deviceLayoutBoard.ts (shared `resolveControl`): pages
// become pages, controls flow left→right inside a layout row, rows flow top→bottom, every item carries
// its source `row` so a narrow reflow keeps rows together, and catalog entries the layout never mentions
// go to a trailing "More" page. Sizes come from BE_SPEC (one knob = 2×2), a page is at most 24 cells
// wide, and a gap in the layout (spacer, label, unknown parameter) advances one knob slot (2 cells).
// Exact positions from the layout data are not used yet. Pure (deviceLayoutBoardV2.test.ts).

import { layoutVariantSig, resolveControl } from '../deviceLayoutBoard';
import type { DeviceLayout } from '../types';
import { BE_SPEC, findFree, isBeView, MAXC, type BeBoard, type BeControl, type BeView } from './boardModel';
import type { BeCtl } from './catalog';

/** Cells a gap in a layout row advances: one knob slot. */
export const GAP_CELLS = BE_SPEC.knob.w;

/** Deterministic, page-qualified item id (a key may sit on several pages). */
export const itemId = (pageIndex: number, key: string): string => `w${pageIndex}.${key}`;

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

/** Board from a device layout, or null when it has no renderable control (the caller then uses the
 *  curated board). */
export function buildDeviceLayoutBoardV2(layout: DeviceLayout | null | undefined, catalog: readonly BeCtl[]): BeBoard | null {
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

  const boards: Record<string, BeControl[]> = {};
  const pageOrder: string[] = [];
  for (const pg of layout.pages) {
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
        items.push({ id: itemId(pageOrder.length, r.key), key: r.key, view, x, y: gridY, w, h, row: rowIndex });
        x += w;
        rowH = Math.max(rowH, h);
        placed = true;
      }
      if (placed) gridY += rowH;
    });
    if (!items.length) continue;
    const name = uniqName(pg.name?.trim() || `Page ${pageOrder.length + 1}`);
    boards[name] = items;
    pageOrder.push(name);
  }
  if (!pageOrder.length) return null;

  const placedKeys = new Set(pageOrder.flatMap((p) => boards[p]!.map((it) => it.key)));
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
