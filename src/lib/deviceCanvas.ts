// Places a device-authentic layout page onto the block editor's canvas, at the device's own pixel
// coordinates. This replaces the widget-grid board builder: nothing here snaps, packs, reflows, or
// re-orders. The device said where each control goes; this module converts that into boxes.
//
// THE TWO LAYERS, AND WHY THEY ARE DIFFERENT
//
// The editor authors a page in two ways at once — 935 of the ~1500 pages in the corpus use BOTH:
//
//   ABSOLUTE (`placement.positionExact = "x,y"`) — a real canvas coordinate. Mined across the three
//   gen-3 devices these cluster at the page extremes: 387 controls in y 0-49 (headers, pickers), 356
//   in y 200-249, and 593 at y 350-399 (the meter strip). They are placed exactly as given.
//
//   FLOWED (`placement.col`, or nothing) — a column index on a 9-column grid, with NO y anywhere in
//   the data. Row index does not encode y either: fitting row index against the absolute coordinates
//   across the whole corpus gives no correlation at all (row 0's y ranges 18..370, median 370), which
//   is why the previous builder's attempt to derive one produced a per-block patch cycle. So flowed
//   rows are STACKED — each row as tall as its tallest control — and the stack is the only invented
//   quantity in this module.
//
// Because the two layers share one canvas, a stacked row can land on top of an absolute control. The
// cursor therefore tests each candidate row against the absolute layer as RECTANGLES (not by y alone:
// the cab page legitimately puts knobs beside its picker strip at the same height) and slides the row
// down past whatever it hits. Overlap is impossible by construction; the sweep test asserts it, and
// `pushedRows` reports how often the slide fired so a bad metric shows up as a number rather than as
// a page that silently looks wrong.

import type { DeviceLayout, LayoutControl, LayoutPage, LayoutRow } from './types';
import { widgetBox } from './deviceWidgets';

/** Columns in the device editor's own control grid (`placement.col` runs 0-8 on every page). */
export const DEVICE_COLS = 9;
/** Width of the device editor's control canvas, in its own pixels. Bounded by the data: the largest
 *  `positionExact` x across all three devices is 1225, the smallest 5. */
export const CANVAS_W = 1240;
/** Device px between two adjacent `placement.col` slots. */
export const COL_PITCH = CANVAS_W / DEVICE_COLS;
/** Rendered at 0.95:1 with the device's own canvas — the block editor is a fixed 1240px wide, non-resizable. */
export const DEVICE_SCALE = 0.95;

/** Top margin before the first flowed row. */
const TOP_MARGIN = 12;
/** Vertical breathing room between two stacked rows. */
const ROW_GAP = 10;
/** Step the cursor slides by when a candidate row collides with the absolute layer. */
const PUSH_STEP = 8;
/** Guard against a pathological page pushing forever. */
const MAX_PUSH = 600;

/** One control, placed. `x`/`y`/`w`/`h` are in RENDERED px (device px x {@link DEVICE_SCALE}). */
export interface PlacedControl {
  control: LayoutControl;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which layer placed it — absolute coordinates from the device, or the stacked flow. */
  layer: 'absolute' | 'flow';
  /** Source row index, for grouping and for diagnostics. */
  row: number;
  /** Controls the device anchors at the SAME coordinate are ALTERNATES — it draws one at a time and
   *  swaps them on some other control's value. The PEQ gives each band a `Gain` knob and a `Slope`
   *  dropdown on one anchor (shelf vs cut filter types); the cab's Align page stacks `graph_cab` and
   *  `graph_cabZoom`. Same anchor = same `alternateKey`; `alternateIndex` is document order within
   *  it, and the renderer shows index 0 unless something selects otherwise. */
  alternateKey: string;
  alternateIndex: number;
}

export interface PlacedPage {
  name: string;
  controls: PlacedControl[];
  /** Always the full canvas: the editor is fixed-width and never reflows to its pane. */
  width: number;
  height: number;
  /** How many flowed rows had to slide past the absolute layer. 0 on a well-understood page. */
  pushedRows: number;
}

/** Parse a `positionExact` string (`"465,370"`) into canvas px, or null when absent/malformed. */
export function parsePositionExact(s: string | null | undefined): { x: number; y: number } | null {
  if (!s) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

interface Rect { x: number; y: number; w: number; h: number }

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Lay one row's flowed controls out relative to a baseline y, without committing them. `offsetY` is
 *  the device's own nudge off that baseline — it is how ONE row draws more than one visual line (the
 *  amp's Ideal page puts five toggles 70px above the knobs sharing their column numbers; -70 and 60
 *  are the only two values in the entire corpus). */
function layoutRow(row: LayoutRow, rowIndex: number, baselineY: number): { rects: Rect[]; controls: { control: LayoutControl; rect: Rect }[]; height: number } {
  const rects: Rect[] = [];
  const controls: { control: LayoutControl; rect: Rect }[] = [];
  // One cursor per sub-line: an authored column is a MINIMUM x, not an exact one. Two controls may
  // share a column — the compressor's Basic page puts both gain-reduction meters at col 8, drawn side
  // by side — so a later control at the same column follows its predecessor rather than landing on
  // it. Controls nudged onto a different sub-line by `offsetY` advance their own cursor.
  const cursors = new Map<number, number>();
  let top = 0;
  let bottom = 0;
  for (const c of row.controls) {
    if (parsePositionExact(c.placement?.positionExact)) continue; // absolute layer, handled separately
    const box = widgetBox(c.rawWidget);
    const offsetY = c.placement?.offsetY ?? 0;
    const cursor = cursors.get(offsetY) ?? 0;
    const col = c.placement?.col;
    // `col` runs 0-8 on every page that matters; cols 9 and 10 exist but total a handful of controls
    // per device, so they clamp onto the last column rather than widening the pitch for everyone.
    const colX = col == null ? cursor : Math.min(col, DEVICE_COLS - 1) * COL_PITCH;
    const x = Math.max(colX, cursor) + (c.placement?.offsetX ?? 0);
    const y = baselineY + offsetY;
    cursors.set(offsetY, x + box.w);
    top = Math.min(top, y - baselineY);
    bottom = Math.max(bottom, y - baselineY + box.h);
    const rect: Rect = { x, y, w: box.w, h: box.h };
    rects.push(rect);
    controls.push({ control: c, rect });
  }
  return { rects, controls, height: bottom - top };
}


/** The clamp never produces a zero box, and never GROWS one: a control whose natural size already
 *  fits keeps it, and one the device crowded is shrunk to exactly the room the device left it (the
 *  cab page puts a `labelSeperator` rule 2px before the heading it separates). */
const MIN_PX = 1;

/**
 * Shrink every box to the space the DEVICE actually left for it.
 *
 * `deviceWidgets.ts` gives a widget its natural size, but the editor draws a widget into whatever
 * room its own coordinates leave — two `positionExact` controls 36px apart are two 36px-wide
 * controls, whatever the type's usual width. So the table is a MAXIMUM and the device's spacing is
 * the authority: each box is capped by the distance to its nearest neighbour on the right (for
 * width) and below (for height). This is what keeps the absolute layer faithful without hand-tuning
 * a per-token width for every crowded page, and it is why the sweep can assert zero overlaps
 * instead of pinning known-bad pages by name.
 */
function clampToNeighbours(rects: Rect[]): void {
  const yOverlap = (a: Rect, b: Rect) => a.y < b.y + b.h && b.y < a.y + a.h;
  const xOverlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w;
  // Pull a box that starts past the canvas edge back inside before anything else: the cursor rule can
  // walk a crowded row off the right edge, and a col-9 control anchors exactly at CANVAS_W.
  for (const a of rects) a.x = Math.min(a.x, Math.max(0, CANVAS_W - a.w));
  for (const a of rects) {
    let right = Infinity;
    for (const b of rects) if (b !== a && b.x > a.x && yOverlap(a, b)) right = Math.min(right, b.x);
    if (Number.isFinite(right)) a.w = Math.min(a.w, Math.max(MIN_PX, right - a.x));
    a.w = Math.min(a.w, Math.max(MIN_PX, CANVAS_W - a.x));
  }
  for (const a of rects) {
    let below = Infinity;
    for (const b of rects) if (b !== a && b.y > a.y && xOverlap(a, b)) below = Math.min(below, b.y);
    if (Number.isFinite(below)) a.h = Math.min(a.h, Math.max(MIN_PX, below - a.y));
  }
}

/** Place one page's controls at the device's own coordinates. Pure — no Svelte, no DOM, no measurement. */
export function placePage(page: LayoutPage): PlacedPage {
  // Each entry keeps a REFERENCE to its rect so the clamp passes below can shrink boxes in place.
  const entries: { control: LayoutControl; rect: Rect; layer: 'absolute' | 'flow'; row: number }[] = [];

  // ── absolute layer: the device's own canvas coordinates, clamped against each other ──
  const absRects: Rect[] = [];
  page.rows.forEach((row, rowIndex) => {
    for (const c of row.controls) {
      const pos = parsePositionExact(c.placement?.positionExact);
      if (!pos) continue;
      const box = widgetBox(c.rawWidget);
      const rect: Rect = {
        x: pos.x + (c.placement?.offsetX ?? 0),
        y: pos.y + (c.placement?.offsetY ?? 0),
        w: box.w,
        h: box.h
      };
      absRects.push(rect);
      entries.push({ control: c, rect, layer: 'absolute', row: rowIndex });
    }
  });
  clampToNeighbours(absRects);

  // ── flow layer: stacked rows, sliding past anything already on the canvas ──
  const placedRects: Rect[] = [...absRects];
  let cursorY = TOP_MARGIN;
  let pushedRows = 0;

  page.rows.forEach((row, rowIndex) => {
    let baseline = cursorY;
    let attempt = layoutRow(row, rowIndex, baseline);
    if (attempt.controls.length === 0) return; // absolute-only row (or an empty one) — nothing to stack
    let pushed = 0;
    while (pushed < MAX_PUSH && attempt.rects.some((r) => placedRects.some((p) => overlaps(r, p)))) {
      baseline += PUSH_STEP;
      pushed += PUSH_STEP;
      attempt = layoutRow(row, rowIndex, baseline);
    }
    if (pushed > 0) pushedRows++;
    // Clamp the row against its own neighbours AND the absolute layer it now sits beside.
    clampToNeighbours([...attempt.rects, ...absRects]);
    for (const rect of attempt.rects) placedRects.push(rect);
    for (const c of attempt.controls) entries.push({ control: c.control, rect: c.rect, layer: 'flow', row: rowIndex });
    cursorY = baseline + attempt.height + ROW_GAP;
  });

  const ordered = entries.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const anchorSeen = new Map<string, number>();
  const alt = ordered.map((e) => {
    const key = `${e.rect.x},${e.rect.y}`;
    const index = anchorSeen.get(key) ?? 0;
    anchorSeen.set(key, index + 1);
    return { key, index };
  });
  const bottom = ordered.reduce((m, e) => Math.max(m, e.rect.y + e.rect.h), 0);

  return {
    name: page.name,
    pushedRows,
    width: CANVAS_W * DEVICE_SCALE,
    height: (bottom + TOP_MARGIN) * DEVICE_SCALE,
    controls: ordered.map((e, i) => ({
      control: e.control,
      layer: e.layer,
      row: e.row,
      alternateKey: alt[i].key,
      alternateIndex: alt[i].index,
      x: e.rect.x * DEVICE_SCALE,
      y: e.rect.y * DEVICE_SCALE,
      w: e.rect.w * DEVICE_SCALE,
      h: e.rect.h * DEVICE_SCALE
    }))
  };
}

/** Place every page of a served layout. Pages render as tabs, in the editor's own display order. */
export function placeLayout(layout: DeviceLayout | null | undefined): PlacedPage[] {
  if (!layout?.pages?.length) return [];
  return layout.pages.map(placePage);
}
