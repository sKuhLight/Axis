// Block Editor board geometry ("always fit"): how big one grid cell is for a page in a given panel.
//
// The reference width is ONE full page of 24 cells, so the cell size (and therefore the knob size) is
// the same on every page; the height still fits per page. Density caps the cell size. Below the minimum
// cell the top navigation (pages side by side) scrolls sideways, the side navigation (pages stacked)
// reflows the page into fewer columns. In arrange mode the cell is frozen per page while dragging.
// Pure numbers in, numbers out — no DOM (boardGeometry.test.ts).

import { bbox, MAXC, reflowPack, type BeItem, type BeRect } from './boardModel';

export type BeNav = 'top' | 'side';
export type BeDensity = 's' | 'm' | 'l';

/** Maximum cell size and gap (px) per control size: Compact / Normal / Large. */
export const DENSITY: Readonly<Record<BeDensity, { cmax: number; gap: number }>> = {
  s: { cmax: 32, gap: 4 },
  m: { cmax: 40, gap: 4 },
  l: { cmax: 50, gap: 5 }
};
/** Smallest cell before the board scrolls (top) or reflows (side). */
export const CMIN = 20;
/** Horizontal / vertical padding of the board area. */
export const PAD_X = 14;
export const PAD_Y = 10;
/** Height of a page's section heading in the side navigation. */
export const SEC_HEAD = 28;
/** Narrowest editor that may use the side navigation; below it the top navigation is forced. */
export const SIDE_NAV_MIN_W = 560;

/** The navigation actually used: side only when the editor is at least 560 px wide. */
export function effectiveNav(nav: BeNav, width: number): BeNav {
  return nav === 'side' && width >= SIDE_NAV_MIN_W ? 'side' : 'top';
}

/** Board area left for one page after padding (and, in the side navigation, the section heading). */
export function availableArea(bodyW: number, bodyH: number, nav: BeNav): { Wa: number; Ha: number } {
  return {
    Wa: Math.max(120, (bodyW || 800) - PAD_X * 2),
    Ha: Math.max(80, (bodyH || 360) - PAD_Y * 2 - (nav === 'top' ? 0 : SEC_HEAD))
  };
}

export interface PageLayoutInput {
  bodyW: number;
  bodyH: number;
  /** Effective navigation (see effectiveNav). */
  nav: BeNav;
  density: BeDensity;
  editMode: boolean;
  /** Arrange mode: the cell this page was frozen at when arranging began. */
  frozenCell?: number;
  /** Arrange mode: empty rows kept below the content, so the tallest item can be dropped under it
   *  (default 1). */
  spareRows?: number;
}

export interface PageLayout {
  /** Cell size, px. */
  c: number;
  /** Gap, px. */
  g: number;
  cols: number;
  rows: number;
  /** Grid width / height, px. */
  W: number;
  H: number;
  /** Side navigation below the minimum cell: the page is shown re-packed (`pos`). */
  reflow: boolean;
  pos?: Record<string, BeRect>;
  overflowX: boolean;
  overflowY: boolean;
}

export function layoutForPage(input: PageLayoutInput, list: readonly BeItem[]): PageLayout {
  const d = DENSITY[input.density] ?? DENSITY.m;
  const g = d.gap;
  const bb = bbox(list);
  const A = availableArea(input.bodyW, input.bodyH, input.nav);
  const strip = input.nav === 'top';
  const ref = (A.Wa - (MAXC - 1) * g) / MAXC;
  const fh = (A.Ha - (bb.R - 1) * g) / bb.R;
  let c = Math.floor(Math.min(d.cmax, ref, fh));
  let reflow = false;
  let pos: Record<string, BeRect> | undefined;
  if (input.editMode) c = input.frozenCell && input.frozenCell > 0 ? input.frozenCell : Math.max(CMIN, c);
  else if (c < CMIN) {
    c = CMIN;
    if (!strip && ref < fh && bb.C * (CMIN + g) - g > A.Wa) reflow = true;
  }
  let cols = bb.C;
  let rows = bb.R;
  if (reflow) {
    cols = Math.max(2, Math.floor((A.Wa + g) / (CMIN + g)));
    c = Math.max(CMIN, Math.min(d.cmax, Math.floor((A.Wa - (cols - 1) * g) / cols)));
    const r = reflowPack(list, cols);
    pos = r.pos;
    rows = r.rows;
  }
  if (input.editMode) {
    cols = Math.max(MAXC, bb.C);
    rows = Math.max(bb.R + Math.max(1, input.spareRows ?? 1), Math.floor((A.Ha + g) / (c + g)));
  }
  const W = cols * (c + g) - g;
  const H = rows * (c + g) - g;
  const out: PageLayout = { c, g, cols, rows, W, H, reflow, overflowX: W > A.Wa + 1, overflowY: H > A.Ha + 1 };
  if (pos) out.pos = pos;
  return out;
}

export interface BeSection {
  page: string;
  /** Offset along the scroll axis (left in top navigation, top in side navigation), px. */
  start: number;
  /** Extent along the scroll axis, px. */
  size: number;
}

/** Pages at least half in view (half of the page, or half of the viewport for pages larger than it). */
export function visiblePages(sections: readonly BeSection[], viewport: { start: number; size: number }): string[] {
  const out: string[] = [];
  for (const s of sections) {
    if (s.size <= 0) continue;
    const seen = Math.max(0, Math.min(s.start + s.size, viewport.start + viewport.size) - Math.max(s.start, viewport.start));
    if (seen >= Math.min(s.size, viewport.size) * 0.5) out.push(s.page);
  }
  return out;
}
