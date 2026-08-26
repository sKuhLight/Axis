// ControlSurface board geometry: how many columns the board shows, and how wide a cell is.
//
// Extracted from ControlSurface's inline `$derived`s so the math is testable — and so the cell CAP has a
// home. Previously `cell` was `containerW / displayCols` with a floor and no ceiling, while `displayCols`
// was `min(cols, fitCols)`. Because `cols` (the user's preferred count, persisted from whatever window
// first seeded it) was an UPPER bound, a wide pane could not add columns — it only made each tile fatter.
// On a ~1965px board with cols=11 that produced 171px cells and a 133px knob dial.
//
// The rule now: `cols` still sets the floor on column count, but once a cell would exceed the density's
// `tileMax` the board adds columns instead of inflating. Arrange mode keeps authoring at exactly `cols`
// (the drag/resize math is written against that canvas) but still caps the cell, so tiles never balloon.

export interface SurfaceColsInput {
  /** measured board width in px (ControlSurface's containerW: clientWidth − 32) */
  containerW: number;
  /** the user's preferred / arrange-time column count */
  cols: number;
  /** grid gap between cells in px */
  gap: number;
  /** largest a cell may grow to — the active density's tileMax (density.ts) */
  maxCell: number;
  /** arrange mode authors at exactly `cols` */
  editMode: boolean;
  isMobile: boolean;
}

export interface SurfaceCols {
  displayCols: number;
  cell: number;
}

/** Smallest legible cell, below which we stop shrinking and let the board overflow instead. */
const MIN_CELL = { desktop: 48, mobile: 60 };
/** Width budget per column used to decide how many columns legibly fit at all. Note this equals the
 *  COMPACT density's tileMax by design — at that density the fit count and the cap count coincide, so the
 *  cap adds at most one column and the real widening comes from `cols` no longer being an upper bound.
 *  Change one of the two and the other stops agreeing. */
const FIT_UNIT = { desktop: 104, mobile: 84 };
/** Fewest columns the board will ever show. */
const MIN_COLS = { desktop: 3, mobile: 2 };
/** Mobile shows at most this many columns regardless of how wide the pane is. */
const MOBILE_MAX_COLS = 6;

/** Columns that legibly fit `containerW` — unchanged from the original inline derivation. */
export function surfaceFitCols(containerW: number, gap: number, isMobile: boolean): number {
  const unit = isMobile ? FIT_UNIT.mobile : FIT_UNIT.desktop;
  const floorCols = isMobile ? MIN_COLS.mobile : MIN_COLS.desktop;
  return Math.max(floorCols, Math.floor((Math.max(0, containerW) + gap) / (unit + gap)));
}

export function resolveSurfaceCols(input: SurfaceColsInput): SurfaceCols {
  const { cols, gap, editMode, isMobile } = input;
  const containerW = Math.max(0, input.containerW);
  const minCell = isMobile ? MIN_CELL.mobile : MIN_CELL.desktop;
  // an unsatisfiable cap (maxCell below the legibility floor) must not win over the floor
  const maxCell = Math.max(minCell, input.maxCell);
  const wanted = Math.max(1, Math.floor(cols));

  const fitCols = surfaceFitCols(containerW, gap, isMobile);
  const base = isMobile
    ? Math.min(wanted, Math.max(MIN_COLS.mobile, Math.min(MOBILE_MAX_COLS, fitCols)))
    : Math.min(wanted, fitCols);
  // columns needed for a cell to land at or under the cap
  const capped = Math.max(1, Math.ceil((containerW + gap) / (maxCell + gap)));

  // Arrange authors at the canvas width it is editing; use mode may add columns to honour the cap.
  const displayCols = editMode ? wanted : Math.max(base, capped);
  const raw = Math.floor((containerW - (displayCols - 1) * gap) / displayCols);
  const cell = Math.min(maxCell, Math.max(minCell, raw));
  return { displayCols, cell };
}
