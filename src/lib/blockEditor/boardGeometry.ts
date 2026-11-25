// Block Editor board geometry: a common scale for a full two-row page.
//
// The reference width is ONE full page of 24 cells, so the cell size (and therefore the knob size) is
// the same on every page, with extra width reserved for Fixed. Two knob rows fit the available
// height when possible. Taller layouts scroll at the same scale. Below the minimum
// cell the top navigation (pages side by side) scrolls sideways, the side navigation (pages stacked)
// reflows the page into fewer columns. In arrange mode the cell is frozen per page while dragging. On the
// phone layout every page is re-wrapped to PHONE_COLS (8) cells — at most four knobs a row — and the cell
// is the available width / 8 (within the minimum cell and the control size's maximum); pages stack and
// scroll vertically.
// Pure numbers in, numbers out — no DOM (boardGeometry.test.ts).

import { bbox, MAXC, PHONE_COLS, phoneWrap, reflowPack, type BeItem, type BeRect } from './boardModel';

export type BeNav = 'top' | 'side';
export type BeDensity = 's' | 'm' | 'l';

/** Desktop scale, cell limits, and spacing. Phone retains its four-control layout and caps. The gap is the
 *  divider's band: a divider sits in it (label + line), so it never covers a control or its label. The
 *  maximum cell keeps the pitch (cell + gap) of the 4 px spacing, so the wider gap only narrows controls:
 *  the grid never grows, re-flows or spills a control onto another page. */
export const DENSITY = {
  s: { cmin: 20, cmax: 32, phoneMax: 30, gap: 12, scale: 0.78 },
  m: { cmin: 24, cmax: 42, phoneMax: 40, gap: 14, scale: 0.9 },
  l: { cmin: 28, cmax: 59, phoneMax: 50, gap: 16, scale: 1 }
};
/** Smallest cell before the board scrolls (top) or reflows (side). */
export const CMIN = 20;
/** Horizontal / vertical padding of the board area. */
export const PAD_X = 14;
/** The top padding holds a divider's band (its label) above the first row, so a title at the top of a page
 *  never covers the controls under it. */
export const PAD_Y = 16;
/** Two rows of standard two-cell controls. */
export const PAGE_REFERENCE_ROWS = 4;
/** Height of a page's section heading in the side navigation. */
export const SEC_HEAD = 28;
/** Narrowest editor that may use the side navigation; below it the top navigation is forced. */
export const SIDE_NAV_MIN_W = 560;
/** Phone layout: horizontal padding of a page (the page takes the whole width). */
export const PHONE_PAD_X = 8;
/** Phone layout: room after the last page, so its last row can scroll clear of what floats over the
 *  board's bottom-right corner (the workbench's dock opener, 40 px high and 64 px above the workspace
 *  bottom, and the dock's collapse button). */
export const PHONE_END_PAD = 112;

/** The navigation actually used: side only when the editor is at least 560 px wide. */
export function effectiveNav(nav: BeNav, width: number): BeNav {
  return nav === 'side' && width >= SIDE_NAV_MIN_W ? 'side' : 'top';
}

/** Board area left for one page after padding (and, in the side navigation, the section heading). */
export function availableArea(bodyW: number, bodyH: number, nav: BeNav): { Wa: number; Ha: number } {
  return {
    Wa: Math.max(120, (bodyW || 800) - PAD_X * 2),
    Ha: Math.max(0, (bodyH || 360) - PAD_Y * 2 - (nav === 'top' ? 0 : SEC_HEAD))
  };
}

export function fitBoardCell(density: BeDensity, widthFit: number, heightFit = Infinity): number {
  const { cmin, cmax, scale } = DENSITY[density];
  return Math.max(cmin, Math.min(cmax, Math.floor(Math.min(widthFit, heightFit) * scale)));
}

export function referenceHeightCell(height: number, gap: number): number {
  return (height - (PAGE_REFERENCE_ROWS - 1) * gap) / PAGE_REFERENCE_ROWS;
}

export function minimumBoardHeight(density: BeDensity, nav: BeNav): number {
  const { cmin, gap } = DENSITY[density];
  return PAGE_REFERENCE_ROWS * cmin + (PAGE_REFERENCE_ROWS - 1) * gap + 2 * PAD_Y + (nav === 'side' ? SEC_HEAD : 0);
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
  /** Cell already fitted to the combined page and Fixed width. */
  sharedCell?: number;
  /** Phone layout (device class `phone`, never while arranging): the page re-wrapped to PHONE_COLS cells,
   *  the cell from the width alone. */
  phone?: boolean;
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
  /** Phone layout: the page is shown re-wrapped to PHONE_COLS cells (`pos`; reading it writes nothing). */
  phone?: boolean;
  pos?: Record<string, BeRect>;
  overflowX: boolean;
  overflowY: boolean;
}

/** Width left for a page on the phone layout. */
export const phoneAreaW = (bodyW: number): number => Math.max(120, (bodyW || 390) - PHONE_PAD_X * 2);

/** Phone layout cell: the available width shared by PHONE_COLS cells (so a 2×2 knob is a quarter of the
 *  page), never below the minimum cell nor above the control size's maximum (a phone profile in a wide
 *  window keeps normal-sized knobs; the page is then narrower than the board). */
export function phoneCell(bodyW: number, density: BeDensity): number {
  const d = DENSITY[density] ?? DENSITY.m;
  const fit = Math.floor((phoneAreaW(bodyW) - (PHONE_COLS - 1) * d.gap) / PHONE_COLS);
  return Math.max(CMIN, Math.min(d.phoneMax, fit));
}

export function layoutForPage(input: PageLayoutInput, list: readonly BeItem[]): PageLayout {
  const d = DENSITY[input.density] ?? DENSITY.m;
  const g = d.gap;
  const A = availableArea(input.bodyW, input.bodyH, input.nav);
  if (input.phone && !input.editMode) {
    const c = phoneCell(input.bodyW, input.density);
    const r = phoneWrap(list, PHONE_COLS);
    const W = PHONE_COLS * (c + g) - g;
    const H = r.rows * (c + g) - g;
    return { c, g, cols: PHONE_COLS, rows: r.rows, W, H, reflow: false, phone: true, pos: r.pos, overflowX: W > phoneAreaW(input.bodyW) + 1, overflowY: H > A.Ha + 1 };
  }
  const bb = bbox(list);
  const strip = input.nav === 'top';
  const ref = (A.Wa - (MAXC - 1) * g) / MAXC;
  const c = input.editMode && input.frozenCell ? input.frozenCell : input.sharedCell ?? fitBoardCell(input.density, ref, referenceHeightCell(A.Ha, g));
  let reflow = false;
  let pos: Record<string, BeRect> | undefined;
  if (!input.editMode && !strip && bb.C * (c + g) - g > A.Wa) reflow = true;
  let cols = bb.C;
  let rows = bb.R;
  if (reflow) {
    cols = Math.max(2, Math.floor((A.Wa + g) / (c + g)));
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
