// Block Editor fixed area on screen: where it goes, how big it is, and what that leaves for the pages.
//
// - Column (desktop and tablet): at the far right of the board area, outside the pages' scroller. Pages and
//   column share the 24-cell reference: the pages are measured against 24 − the area's cells (a wider page
//   takes as many as it needs), so the one cell size does not drop needlessly — and the column is drawn with
//   exactly the pages' cell. The column scrolls inside its own viewport, which stops above a dock opener.
// - Band (phone, and an editor so narrow that a column would leave the pages less than PAGES_MIN_W): pinned at
//   the bottom, re-packed to at most four knobs a row; the first row always shows, the rest behind a toggle.
//   The room on its right holds the toggle; on the workbench's phone it also keeps the controls clear of the
//   dock opener that floats over that corner.
// - The place and the column's cell depend on the width only where they could otherwise feed back into
//   themselves (a band takes board height, a column takes board width): the same input always settles.
// Pure numbers in, numbers out — no DOM (fixedLayout.test.ts).

import { availableArea, CMIN, DENSITY, PAD_X, type BeDensity, type BeNav, type PageLayout } from './boardGeometry';
import { bbox, FIXED_MAX_COLS, MAXC, PHONE_COLS, reflowPack, type BeItem, type BeRect } from './boardModel';
import { layoutBoardPages, sharedCell, SPINE_W, spareRowsFor, STRIP_EXTRA, type BoardLayoutInput, type BoardPage } from './boardView';

/** The column's divider line, and its padding (the top navigation's spine carries the label, like a page's). */
export const FIXED_DIVIDER = 1;
export const FIXED_PAD_LEFT = 10;
export const FIXED_PAD_RIGHT = 12;
export const FIXED_SPINE_GAP = 8;
/** Padding of the column in the side navigation (its label is a heading, like a page's). */
export const FIXED_PAD_SIDE = 14;
/** The workbench collapse button extends 28 px from the dock's right edge. */
export const FIXED_DOCK_GUTTER = 30;
/** A column that would leave the pages less than this becomes a band. */
export const PAGES_MIN_W = 240;
/** Band: padding, the room on its right for the toggle, and that room on the workbench's phone (the dock
 *  opener, 10 px from the edge, over it). */
export const BAND_PAD = 8;
export const BAND_SIDE_W = 56;
export const BAND_CLEAR_W = 100;
/** Share of the editor's height the open band (and the band of Arrange) may take; more scrolls inside it. */
export const BAND_MAX_SHARE = 0.5;

/** Horizontal chrome of the column (everything but its grid). */
export const fixedRightPad = (nav: BeNav, dockGutter = false): number =>
  dockGutter ? FIXED_DOCK_GUTTER : nav === 'top' ? FIXED_PAD_RIGHT : FIXED_PAD_SIDE;
const fixedChrome = (nav: BeNav, dockGutter = false): number =>
  FIXED_DIVIDER + (nav === 'top' ? FIXED_PAD_LEFT + SPINE_W + FIXED_SPINE_GAP : FIXED_PAD_SIDE) + fixedRightPad(nav, dockGutter);
/** Width of the column for a cell size. */
export const fixedColumnW = (cols: number, c: number, g: number, nav: BeNav, dockGutter = false): number =>
  fixedChrome(nav, dockGutter) + cols * (c + g) - g;
/** Horizontal chrome the pages keep beside their grid (padding, and in the strip the spine). */
const pagesChrome = (nav: BeNav): number => 2 * PAD_X + (nav === 'top' ? STRIP_EXTRA : 0);

/** The pages' share of the 24-cell reference: what the fixed area leaves, or as many cells as the widest page
 *  needs. */
export function pageRefCols(pages: readonly BoardPage[], fixedCols: number): number {
  const widest = Math.max(1, ...pages.map((p) => (p.items.length ? bbox(p.items).C : 1)));
  return Math.min(MAXC, Math.max(1, MAXC - fixedCols, widest));
}

/** Cell size the width gives pages and column together (not rounded, no limits). */
export function widthCell(mainW: number, nav: BeNav, gap: number, refCols: number, fixedCols: number, dockGutter = false): number {
  const room = (mainW || 800) - pagesChrome(nav) - fixedChrome(nav, dockGutter) - (refCols - 1) * gap - (fixedCols - 1) * gap;
  return room / (refCols + fixedCols);
}

export interface FixedPlaceInput {
  mainW: number;
  nav: BeNav;
  density: BeDensity;
  phone: boolean;
  refCols: number;
  cols: number;
  dockGutter?: boolean;
}
/** Column, or band: always a band on the phone; elsewhere when a column would leave the pages less than
 *  PAGES_MIN_W. Decided from the width alone (the board height would feed back: a band takes height). */
export function fixedPlace(i: FixedPlaceInput): 'column' | 'band' {
  if (i.phone) return 'band';
  if (!i.mainW) return 'column';
  const d = DENSITY[i.density] ?? DENSITY.m;
  const c = Math.max(CMIN, Math.min(d.cmax, Math.floor(widthCell(i.mainW, i.nav, d.gap, i.refCols, i.cols, i.dockGutter))));
  return i.mainW - fixedColumnW(i.cols, c, d.gap, i.nav, i.dockGutter) < PAGES_MIN_W ? 'band' : 'column';
}

/** The widest column that leaves the pages room at the frozen Arrange cell size. */
export function fixedColumnMax(mainW: number, c: number, g: number, nav: BeNav, dockGutter = false): number {
  if (!mainW) return FIXED_MAX_COLS;
  return Math.min(FIXED_MAX_COLS, Math.floor((mainW - PAGES_MIN_W - fixedChrome(nav, dockGutter) + g) / (c + g)));
}

/** Put the viewport above a floating button only where they intersect. Distances arrive in client pixels. */
export function fixedViewportInset(
  viewport: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  opener: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  zoom: number
): number {
  if (viewport.left >= opener.right || viewport.right <= opener.left || viewport.top >= opener.bottom || viewport.bottom <= opener.top) return 0;
  return Math.ceil((viewport.bottom - opener.top) / zoom) + 4;
}

export interface FixedLayout {
  place: 'column' | 'band';
  /** Cell and gap, px; the grid's columns and rows, and its size. */
  c: number;
  g: number;
  cols: number;
  rows: number;
  W: number;
  H: number;
  /** Column: its whole width. Band: the room kept on its right. */
  width: number;
  side: number;
  /** Band outside Arrange: where the items are drawn (re-packed), the rows of the first line, and how many
   *  controls the closed band leaves out. */
  pos?: Record<string, BeRect>;
  firstRows: number;
  more: number;
}

/** The band's contents: at most four knobs a row (fewer columns where even the smallest cell would not fit),
 *  each item at its first free spot in reading order; the closed band shows the items of the first line. */
export function bandLayout(items: readonly BeItem[], contentW: number, density: BeDensity): Pick<FixedLayout, 'c' | 'g' | 'cols' | 'rows' | 'W' | 'H' | 'pos' | 'firstRows' | 'more'> {
  const d = DENSITY[density] ?? DENSITY.m;
  const g = d.gap;
  const fit = 2 * Math.floor((contentW + g) / (CMIN + g) / 2);
  const cols = Math.max(2, Math.min(PHONE_COLS, fit));
  const c = Math.max(CMIN, Math.min(d.cmax, Math.floor((contentW - (cols - 1) * g) / cols)));
  const r = reflowPack(items, cols);
  const rects = Object.values(r.pos);
  const firstRows = Math.max(1, ...rects.filter((p) => p.y === 0).map((p) => p.h));
  const more = rects.filter((p) => p.y + p.h > firstRows).length;
  return { c, g, cols, rows: r.rows, W: cols * (c + g) - g, H: r.rows * (c + g) - g, pos: r.pos, firstRows, more };
}

export interface EditorLayoutInput extends BoardLayoutInput {
  /** Width of the board area: the pages and the fixed area together. */
  mainW: number;
  /** The band keeps the corner clear of the workbench buttons. */
  clearCorner?: boolean;
  dockGutter?: boolean;
  /** Arrangement stays in the same form even as its width changes. */
  arrangePlace?: FixedLayout['place'];
}

export interface EditorLayout {
  layouts: Record<string, PageLayout>;
  /** Null without a fixed area to show. */
  fixed: FixedLayout | null;
}

/** Pages and fixed area with ONE cell size. `fixed` = the area's width and drawn items; null = none. */
export function layoutEditor(pages: readonly BoardPage[], fixed: { cols: number; items: readonly BeItem[] } | null, input: EditorLayoutInput): EditorLayout {
  const { mainW, clearCorner, dockGutter, arrangePlace, ...base } = input;
  if (!fixed) return { layouts: layoutBoardPages(pages, base), fixed: null };
  const d = DENSITY[input.density] ?? DENSITY.m;
  const g = d.gap;
  const refCols = pageRefCols(pages, fixed.cols);
  const place = (input.editMode && arrangePlace) || fixedPlace({ mainW, nav: input.nav, density: input.density, phone: !!input.phone, refCols, cols: fixed.cols, dockGutter });
  const spare = input.editMode ? spareRowsFor([...pages, { page: '', items: fixed.items }]) : 0;
  const content = fixed.items.length ? bbox(fixed.items).R : 0;

  if (place === 'band') {
    const layouts = layoutBoardPages(pages, { ...base, ...(input.editMode ? { spareRows: spare } : {}) });
    const side = clearCorner ? BAND_CLEAR_W : BAND_SIDE_W;
    if (input.editMode) {
      const c = input.frozenCell && input.frozenCell > 0 ? input.frozenCell : CMIN;
      const rows = Math.max(1, content + spare);
      const H = rows * (c + g) - g;
      return { layouts, fixed: { place, c, g, cols: fixed.cols, rows, W: fixed.cols * (c + g) - g, H, width: 0, side: 0, firstRows: rows, more: 0 } };
    }
    const b = bandLayout(fixed.items, Math.max(40, (mainW || 390) - 2 * BAND_PAD - side), input.density);
    return { layouts, fixed: { place, ...b, width: 0, side } };
  }

  const area = availableArea(mainW || 800, input.bodyH, input.nav);
  const heights = pages.map((p) => (p.items.length ? bbox(p.items).R : 1));
  const fit = Math.min(d.cmax, widthCell(mainW, input.nav, g, refCols, fixed.cols, dockGutter), ...heights.map((R) => (area.Ha - (R - 1) * g) / R));
  let c = Math.max(CMIN, Math.floor(fit));
  if (input.editMode && input.frozenCell && input.frozenCell > 0) c = input.frozenCell;
  const width = fixedColumnW(fixed.cols, c, g, input.nav, dockGutter);
  const layouts = layoutBoardPages(pages, {
    ...base,
    bodyW: Math.max(1, (mainW || 800) - width),
    refCols,
    maxCell: c,
    ...(input.editMode ? { spareRows: spare } : {})
  });
  // pages and column agree on the cell by construction; a board of re-flowed pages keeps the smallest one
  if (!input.editMode) c = sharedCell(layouts) ?? c;
  const room = Math.floor((area.Ha + g) / (c + g));
  const rows = input.editMode ? Math.max(content + spare, room) : Math.max(1, content);
  const H = rows * (c + g) - g;
  return { layouts, fixed: { place, c, g, cols: fixed.cols, rows, W: fixed.cols * (c + g) - g, H, width, side: 0, firstRows: rows, more: 0 } };
}

/** Room the phone's pages keep below their end: what a band of this height leaves of the corner clearance. */
export const endPadOver = (endPad: number, bandH: number): number => Math.max(0, endPad - bandH);
