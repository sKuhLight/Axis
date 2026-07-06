import type { WidgetInstance } from '../workbench';

// Grid-view state carried by the gridbar widgets (axis.gridMode / axis.blockSize).
// 'auto' fits tiles to the pane (production SignalGrid behavior) and steps to the map /
// mobile paths as the pane shrinks (resolveAxisGridViewMode); 'full' fixes tiles at the
// chosen size and lets the grid scroll; 'map' pins the glyph minimap. Sizes cap ('auto')
// or set ('full') the tile width in px — M matches SignalGrid's historic MAX_TILE, so
// auto+M ≡ old shell.
export type AxisGridMode = 'auto' | 'full' | 'map';
export type AxisBlockSize = 'S' | 'M' | 'L';

// chips offered by the axis.gridMode widget, in toolbar order (Full / Map / Auto per the
// design's gridModes list, 04-fc-and-grid.md §2.1).
export const AXIS_GRID_MODES: readonly AxisGridMode[] = ['full', 'map', 'auto'];
export const AXIS_BLOCK_SIZES: readonly AxisBlockSize[] = ['S', 'M', 'L'];
export const AXIS_BLOCK_TILE_PX: Record<AxisBlockSize, number> = { S: 96, M: 150, L: 190 };

export interface AxisGridView {
  mode: AxisGridMode;
  tilePx: number;
  size: AxisBlockSize;
}

export function readAxisGridMode(value: unknown): AxisGridMode {
  return value === 'full' || value === 'map' ? value : 'auto';
}

export function readAxisBlockSize(value: unknown): AxisBlockSize {
  return value === 'S' || value === 'L' ? value : 'M';
}

export function stepAxisBlockSize(size: AxisBlockSize, direction: -1 | 1): AxisBlockSize {
  const index = AXIS_BLOCK_SIZES.indexOf(size);
  return AXIS_BLOCK_SIZES[Math.max(0, Math.min(AXIS_BLOCK_SIZES.length - 1, index + direction))];
}

export function cycleAxisBlockSize(size: AxisBlockSize): AxisBlockSize {
  return AXIS_BLOCK_SIZES[(AXIS_BLOCK_SIZES.indexOf(size) + 1) % AXIS_BLOCK_SIZES.length];
}

export function cycleAxisGridMode(mode: AxisGridMode): AxisGridMode {
  return AXIS_GRID_MODES[(AXIS_GRID_MODES.indexOf(mode) + 1) % AXIS_GRID_MODES.length];
}

// axis.gridMap widget: the design's 6×3 dot matrix, driven by REAL grid occupancy
// (editor.layout cells+shunts downsampled row/col-proportionally into map buckets).
export const AXIS_GRID_MAP_COLS = 6;
export const AXIS_GRID_MAP_ROWS = 3;

export function axisGridMapDots(
  occupied: readonly { row: number; col: number }[],
  rows: number,
  cols: number
): boolean[] {
  const dots = new Array<boolean>(AXIS_GRID_MAP_COLS * AXIS_GRID_MAP_ROWS).fill(false);
  const rowSpan = Math.max(1, Math.floor(rows));
  const colSpan = Math.max(1, Math.floor(cols));
  for (const cell of occupied) {
    if (cell.row < 0 || cell.col < 0 || cell.row >= rowSpan || cell.col >= colSpan) continue;
    const r = Math.min(AXIS_GRID_MAP_ROWS - 1, Math.floor((cell.row * AXIS_GRID_MAP_ROWS) / rowSpan));
    const c = Math.min(AXIS_GRID_MAP_COLS - 1, Math.floor((cell.col * AXIS_GRID_MAP_COLS) / colSpan));
    dots[r * AXIS_GRID_MAP_COLS + c] = true;
  }
  return dots;
}

// ── pane-relative sizing (04-fc-and-grid.md §2.2, verbatim constants) ─────────────
// The design keys everything off `gpSizeMin=[56,72,96][gpSize]` (S/M/L min column width),
// with the full-grid gap = round(gpSizeMin*0.32). `auto` steps full → map → mobile so the
// grid never scrollbars: <620px pane → mobile; else map when the pane can't fit a scroll-free
// full grid in EITHER axis, else full. Cell heights are capped so 4 rows always fit
// (_colCapH); map cells ≤42px, full cells ≤140px.
export const AXIS_GRID_SIZE_MIN: Record<AxisBlockSize, number> = { S: 56, M: 72, L: 96 };
export const AXIS_GRID_MOBILE_MAX_PANE_W = 620;
export const AXIS_GRID_MAP_COL_MAX = 42;
export const AXIS_GRID_FULL_COL_MAX = 140;

export type AxisResolvedGridMode = 'full' | 'map' | 'mobile';

export interface AxisGridMetrics {
  /** resolved rendering mode after the auto stepping */
  mode: AxisResolvedGridMode;
  /** min column width in px for a full-grid track (the S/M/L base) */
  sizeMin: number;
  /** gap between full-grid cells (round(sizeMin*0.32)) */
  fullGap: number;
  /** width a scroll-free 12-col full grid needs */
  fullMin: number;
  /** height a scroll-free 4-row full grid needs */
  fullMinH: number;
  /** per-cell width cap so 4 rows fit the pane height without scrolling */
  colCapH: number;
  /** map-mode max cell width (min(42, colCapH)) */
  mapColMax: number;
  /** full-mode max cell width (min(140, colCapH)) */
  fullColMax: number;
}

/**
 * Resolve the concrete grid mode + cell caps for a pane of `paneW × paneH` px, given the
 * requested view. Mirrors the design's `renderVals()` grid math (§2.2). `paneH<=0` disables
 * the height-based cap (returns a large colCapH), matching the desktop-unmeasured fallback.
 */
export function resolveAxisGridMetrics(
  view: Pick<AxisGridView, 'mode' | 'size'>,
  paneW: number,
  paneH: number
): AxisGridMetrics {
  const sizeMin = AXIS_GRID_SIZE_MIN[view.size];
  const fullGap = Math.round(sizeMin * 0.32);
  const fullMin = 12 * sizeMin + 11 * fullGap + 44;
  const fullMinH = 4 * Math.round(sizeMin * 0.95) + 3 * fullGap + 56;

  let mode: AxisResolvedGridMode;
  if (view.mode === 'map') mode = 'map';
  else if (view.mode === 'full') mode = 'full';
  else mode = paneW < AXIS_GRID_MOBILE_MAX_PANE_W ? 'mobile' : (paneW < fullMin || paneH < fullMinH ? 'map' : 'full');

  // _colCapH uses the resolved-mode gap + vertical padding: map pads 34, full pads 58.
  const isMap = mode === 'map';
  const gap = isMap ? 7 : fullGap;
  const padV = isMap ? 34 : 58;
  const colCapH = paneH > 0 ? Math.max(22, Math.floor(((paneH - padV - 3 * gap) / 4) / 0.95)) : 9999;
  const mapColMax = Math.min(AXIS_GRID_MAP_COL_MAX, colCapH);
  const fullColMax = Math.min(AXIS_GRID_FULL_COL_MAX, colCapH);

  return { mode, sizeMin, fullGap, fullMin, fullMinH, colCapH, mapColMax, fullColMax };
}

/** Derive the grid view from the placed control widgets; null (= stock behavior) when neither is visible. */
export function axisGridViewFromWidgets(widgets: WidgetInstance[]): AxisGridView | null {
  const modeWidget = widgets.find((widget) => widget.type === 'axis.gridMode' && widget.zone !== 'hidden');
  const sizeWidget = widgets.find((widget) => widget.type === 'axis.blockSize' && widget.zone !== 'hidden');
  if (!modeWidget && !sizeWidget) return null;
  const size = readAxisBlockSize(sizeWidget?.state?.size);
  return {
    mode: readAxisGridMode(modeWidget?.state?.mode),
    tilePx: AXIS_BLOCK_TILE_PX[size],
    size
  };
}
