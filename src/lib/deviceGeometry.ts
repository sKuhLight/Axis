// The device editor's canvas geometry, and the single mapping from it onto Axis's column grid.
//
// The served layout places every control on a fixed ~1240px canvas, and it says so in FOUR fields:
// `placement.col`, `placement.offsetX`, `placement.offsetY`, and `placement.positionExact`. Axis
// historically read `col` and the *y* half of `positionExact`, and dropped the rest — so the builder had
// to re-infer the discarded information with a different heuristic per block shape, and each heuristic was
// right for the block it was written against and wrong for the next one. This module is where all four
// fields become ONE number line, so placement is derived from what the device said rather than guessed.
//
// TWO axes, deliberately modelled differently, because the device authors them differently:
//
//   HORIZONTAL is absolute. `col` and `positionExact.x` are two spellings of the same canvas x, so they
//   resolve into a shared pixel space and snap through one function (`pxToCol`). `COL_PITCH` is defined as
//   `CANVAS_W / DEVICE_COLS` precisely so that `pxToCol(colToPx(c)) === c` for every authored column — the
//   5852 column-authored controls keep their exact placement as an identity of the definition, not as a
//   re-tuning that happens to land close. See the test.
//
//   VERTICAL is relative. `offsetY` is a nudge from the row's own baseline (the amp's Ideal toggles carry
//   -70: drawn 70px ABOVE the knobs sharing their columns), whereas `positionExact.y` is an absolute canvas
//   coordinate. There is no reliable constant converting a row index into a canvas y — row pitch varies by
//   page — so this module never tries. `offsetY` splits a row into sub-lines relative to itself
//   (`splitByOffsetY`); absolute `positionExact` controls are clustered among THEMSELVES (`clusterByCanvasRow`)
//   and the builder keeps placing those clusters below the row's own content, exactly as it does today.
//   Mixing the two onto one absolute axis would need a row-pitch constant that the generated data does not
//   support, and would put the amp's HEADROOM meter somewhere invented.

import type { LayoutControl } from './types';

/** Columns in the device editor's own control grid. `placement.col` runs 0-8 on every page that matters;
 *  cols 9 and 10 exist but total 2-13 controls per device, so they clamp rather than widen the pitch. */
export const DEVICE_COLS = 9;

/** Width of the device editor's control canvas, in its own pixels. The generated data bounds it: the
 *  largest `positionExact` x across all three devices is 1225 (the cab's right-hand strip) and the
 *  smallest is 5. */
export const CANVAS_W = 1240;

/** Device px between two adjacent `placement.col` slots. DERIVED, never tuned independently — see the
 *  identity property in the module banner. */
export const COL_PITCH = CANVAS_W / DEVICE_COLS;

/** Gap (device px) above which two controls are treated as different visual lines rather than neighbours
 *  on the same one. Tuned against real device data (the generated layout data), not
 *  guessed: same-row spread tops out around 7px (the cab Align page's `Bank`/`Type`/`Zoom` row), while
 *  genuine line-to-line gaps start at 30px+ (Scene Levels' `Scene 1` → `Scene 2` is 34px; the cab's
 *  Bank/Type row → its IR Length row below is 60px; the amp Ideal toggles sit 70px above their knobs).
 *  20px sits cleanly between both with margin on either side. */
export const CANVAS_ROW_GAP_PX = 20;

/** Canvas x of an authored column, including its horizontal nudge. */
export const colToPx = (col: number, offsetX: number | null | undefined = 0): number =>
  col * COL_PITCH + (offsetX ?? 0);

/** Canvas x → grid column. Inverse of `colToPx` for every authored column (see banner); for a
 *  `positionExact` control it is the nearest column, which is the best a column grid can do and is what
 *  the panel tier exists to catch when it is not good enough. */
export const pxToCol = (x: number): number => Math.max(0, Math.round((x / CANVAS_W) * DEVICE_COLS));

/** Parse a device `positionExact` string (`"465,370"`) into canvas pixels, or `null` if absent/malformed. */
export function parsePositionExact(s: string | null | undefined): { x: number; y: number } | null {
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

/** Group items into visual lines by their y, splitting wherever the gap exceeds `CANVAS_ROW_GAP_PX`.
 *  Sorts by `(y, x)` — device reading order — so each returned line is already left→right.
 *
 *  Pure position math: no knowledge of grid columns or widget sizes, so callers are free to place each
 *  returned line however they need to. Used for both axes' clustering (absolute `positionExact` scatter,
 *  and `offsetY` sub-lines within one authored row). */
export function clusterByCanvasRow<T extends { xPx: number; yPx: number }>(items: readonly T[]): T[][] {
  const sorted = items.slice().sort((a, b) => a.yPx - b.yPx || a.xPx - b.xPx);
  const rows: T[][] = [];
  let prevY: number | null = null;
  for (const item of sorted) {
    if (prevY == null || item.yPx - prevY > CANVAS_ROW_GAP_PX) rows.push([]);
    rows[rows.length - 1]!.push(item);
    prevY = item.yPx;
  }
  return rows;
}

/** Split ONE authored row into the sub-lines its controls' `offsetY` nudges describe, top line first.
 *
 *  A device "row" is a band, not a line. The amp's Ideal page authors ONE row holding two visual lines:
 *  five toggles at `{col, offsetY: -70}` and, sharing those same column numbers, the knobs they sit above
 *  at plain `{col}`. Read as one line — which is what ignoring `offsetY` amounts to — the duplicate columns
 *  collide and the placement cursor shoves all fourteen controls into a single row, destroying both the
 *  two-line reading and the column alignment with the row above. 176 rows on the Axe-Fx III carry duplicate
 *  columns (99 FM9, 109 FM3) and every one of them is this shape.
 *
 *  Order within a line is preserved (stable), because the caller still needs array order for spacer and
 *  band-set semantics; only the split is positional. A row where every control shares one `offsetY` — the
 *  overwhelming majority — returns a single line and is indistinguishable from not calling this at all. */
export function splitByOffsetY<T>(items: readonly T[], offsetYOf: (item: T) => number): T[][] {
  if (items.length < 2) return items.length ? [items.slice()] : [];
  const ys = [...new Set(items.map(offsetYOf))].sort((a, b) => a - b);
  if (ys.length < 2) return [items.slice()];
  // Bucket the distinct offsets into lines first, so near-equal nudges (a 2px typo in the editor's own
  // data) stay on one line instead of splitting into two nearly-identical rows.
  const lineOf = new Map<number, number>();
  let line = 0;
  lineOf.set(ys[0], 0);
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i - 1] > CANVAS_ROW_GAP_PX) line++;
    lineOf.set(ys[i], line);
  }
  const out: T[][] = Array.from({ length: line + 1 }, () => []);
  for (const item of items) out[lineOf.get(offsetYOf(item))!].push(item);
  return out.filter((l) => l.length);
}

/** The `offsetY` a control is nudged by, 0 when it authors none. `positionExact` controls are NOT part of
 *  this axis (their y is absolute, not a nudge) and report 0 so they never split an authored row. */
export const offsetYOf = (ctl: LayoutControl): number =>
  ctl.placement?.positionExact ? 0 : (ctl.placement?.offsetY ?? 0);

/** Canvas x of any control, whichever field it authors its position in — the one number line the two
 *  horizontal spellings meet on. `fallbackCol` is used when the control authors no column at all (a pure
 *  flow row), which makes its index within the row its column and reproduces the flow sweep exactly. */
export function controlPx(ctl: LayoutControl, fallbackCol: number): number {
  const exact = parsePositionExact(ctl.placement?.positionExact);
  if (exact) return exact.x;
  return colToPx(ctl.placement?.col ?? fallbackCol, ctl.placement?.offsetX);
}

/** Can this set of canvas x positions be told apart as distinct grid columns?
 *
 *  False when two DIFFERENT x values round to the same column (controls closer together than half a
 *  column pitch — the cab page authors some 4px apart, and no pitch can separate those), or when the set
 *  needs more columns than the grid has. Those pages are pixel-composed panels rather than grids: 34 of
 *  the Axe-Fx III's 152 distinct pages, including Cab, Align, Speaker, PEQ, Filter and Scene Levels.
 *
 *  This is a computed property of the geometry, deliberately NOT a list of block families. A hardcoded
 *  list is exactly what produced the per-block patch cycle this module replaces — the next device, or the
 *  next firmware's re-authored page, would not be on it. */
export function isPanelCluster(xs: readonly number[], columns: number): boolean {
  const distinct = [...new Set(xs)];
  if (distinct.length < 2) return false;
  if (distinct.length > columns) return true;
  const cols = new Set(distinct.map(pxToCol));
  return cols.size < distinct.length;
}
