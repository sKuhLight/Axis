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

// Workbench fallback when a layout carries no gridMode/blockSize widgets (hand-built layout,
// widgets hidden/deleted): auto + M ≈ the old stock fit, but with the design's pane-relative
// map stepping still active — the grid's responsive behavior must never depend on the user's
// widget placement. The old shell (<SignalGrid /> without view) keeps stock behavior.
export const AXIS_DEFAULT_GRID_VIEW: AxisGridView = { mode: 'auto', tilePx: AXIS_BLOCK_TILE_PX.M, size: 'M' };

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
// full grid in EITHER axis, else full. Cell heights are capped so all rows always fit
// (_colCapH); map cells ≤42px, full cells ≤140px on the design's 12-col grid (smaller
// device grids scale that cap by 12/cols — see resolveAxisGridMetrics).
export const AXIS_GRID_SIZE_MIN: Record<AxisBlockSize, number> = { S: 56, M: 72, L: 96 };
export const AXIS_GRID_MOBILE_MAX_PANE_W = 620;
export const AXIS_GRID_MAP_COL_MAX = 42;
export const AXIS_GRID_FULL_COL_MAX = 140;

export type AxisResolvedGridMode = 'full' | 'map' | 'mobile';

/** Device routing-grid dimensions (AM4 1×4, VP4 1×8, FM3 4×12, FM9/III 6×14). */
export interface AxisGridDims {
  rows: number;
  cols: number;
}

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
 *
 * `grid` = the DEVICE routing-grid dimensions. The §2.2 constants assume the design's 12×4
 * grid, so dims are clamped at 12/4: gen-3 grids (12 & 14 col) resolve exactly as before,
 * while SMALLER grids (AM4 1×4, VP4 1×8) relax the math to their own size — the mode
 * thresholds shrink to what a scroll-free small grid actually needs, the height cap divides
 * the pane by the real row count, and the full-cell cap scales by 12/cols so the grid may
 * use the same pane fraction a 12-col grid would (tiles fill the pane instead of floating
 * at gen-3 size in empty space).
 */
export function resolveAxisGridMetrics(
  view: Pick<AxisGridView, 'mode' | 'size'>,
  paneW: number,
  paneH: number,
  grid?: AxisGridDims
): AxisGridMetrics {
  const cols = Math.max(1, Math.min(grid?.cols ?? 12, 12));
  const rows = Math.max(1, Math.min(grid?.rows ?? 4, 4));
  const sizeMin = AXIS_GRID_SIZE_MIN[view.size];
  const fullGap = Math.round(sizeMin * 0.32);
  const fullMin = cols * sizeMin + (cols - 1) * fullGap + 44;
  const fullMinH = rows * Math.round(sizeMin * 0.95) + (rows - 1) * fullGap + 56;

  let mode: AxisResolvedGridMode;
  if (view.mode === 'map') mode = 'map';
  else if (view.mode === 'full') mode = 'full';
  else mode = paneW < AXIS_GRID_MOBILE_MAX_PANE_W ? 'mobile' : (paneW < fullMin || paneH < fullMinH ? 'map' : 'full');

  // _colCapH uses the resolved-mode gap + vertical padding: map pads 34, full pads 58.
  const isMap = mode === 'map';
  const gap = isMap ? 7 : fullGap;
  const padV = isMap ? 34 : 58;
  const colCapH = paneH > 0 ? Math.max(22, Math.floor(((paneH - padV - (rows - 1) * gap) / rows) / 0.95)) : 9999;
  const mapColMax = Math.min(AXIS_GRID_MAP_COL_MAX, colCapH);
  const fullColMax = Math.min(Math.round(AXIS_GRID_FULL_COL_MAX * (12 / cols)), colCapH);

  return { mode, sizeMin, fullGap, fullMin, fullMinH, colCapH, mapColMax, fullColMax };
}

// ── presentation gating (SignalGrid.svelte) ───────────────────────────────────────
// The single source of truth for HOW the grid renders, so the component and its tests agree. The critical
// rule: when a workbench `view` is supplied the presentation derives ONLY from the pane metrics — NEVER
// from the old shell's window-width flag (editor.isMobile, <1366). Feeding isMobile in here is exactly the
// 1333px-window bug: a sub-1366 window (isMobile=true) with a wide grid pane would lose map/full/auto and
// collapse into the legacy pager, ignoring the GRID Map chip. The old shell (view == null) keeps its
// window-driven behavior.
export type AxisGridPresentation = 'full' | 'map' | 'paged';

export interface AxisGridPresentationInput {
  /** the active workbench view, or null for the old shell */
  view: Pick<AxisGridView, 'mode' | 'size'> | null;
  /** resolved pane metrics when a view is active (null for the old shell) */
  metricsMode: AxisResolvedGridMode | null;
  /** old-shell real-mobile window flag (editor.isMobile); consulted ONLY when view == null */
  isMobile: boolean;
}

export interface AxisGridPresentationResult {
  /** legacy page-a-column-band presentation (page arrows/dots, swipe/pinch) */
  paged: boolean;
  /** the workbench mobile TIER: a docked pane below the 620px threshold under an AUTO view */
  paneMobile: boolean;
  /** the desktop glyph minimap (§2.5) */
  mapMode: boolean;
  /** fixed-size tiles that pan in a scrolling pane — only the explicit 'full' chip */
  fixedTile: boolean;
}

/**
 * Resolve the SignalGrid presentation flags. View-active branches key ONLY off `metricsMode`
 * (pane-derived); `isMobile` is consulted solely on the old-shell (view == null) path.
 */
export function resolveAxisGridPresentation(input: AxisGridPresentationInput): AxisGridPresentationResult {
  const { view, metricsMode, isMobile } = input;
  // AUTO-only: an explicit 'map'/'full' chip pins its mode even at a tiny pane (metricsMode already
  // reflects the chip, so this only fires when the pane genuinely stepped down under auto).
  const paneMobile = !!view && metricsMode === 'mobile';
  const paged = view ? paneMobile : isMobile;
  const mapMode = metricsMode === 'map' && !paneMobile;
  const fixedTile = !paged && view?.mode === 'full' && metricsMode === 'full';
  return { paged, paneMobile, mapMode, fixedTile };
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
