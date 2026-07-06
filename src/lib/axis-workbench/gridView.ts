import type { WidgetInstance } from '../workbench';

// Grid-view state carried by the gridbar widgets (axis.gridMode / axis.blockSize).
// 'auto' fits tiles to the pane (production SignalGrid behavior); 'full' fixes tiles
// at the chosen size and lets the grid scroll. Sizes cap ('auto') or set ('full') the
// tile width in px — M matches SignalGrid's historic MAX_TILE, so auto+M ≡ old shell.
export type AxisGridMode = 'auto' | 'full';
export type AxisBlockSize = 'S' | 'M' | 'L';

export const AXIS_GRID_MODES: readonly AxisGridMode[] = ['full', 'auto'];
export const AXIS_BLOCK_SIZES: readonly AxisBlockSize[] = ['S', 'M', 'L'];
export const AXIS_BLOCK_TILE_PX: Record<AxisBlockSize, number> = { S: 96, M: 150, L: 190 };

export interface AxisGridView {
  mode: AxisGridMode;
  tilePx: number;
}

export function readAxisGridMode(value: unknown): AxisGridMode {
  return value === 'full' ? 'full' : 'auto';
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

/** Derive the grid view from the placed control widgets; null (= stock behavior) when neither is visible. */
export function axisGridViewFromWidgets(widgets: WidgetInstance[]): AxisGridView | null {
  const modeWidget = widgets.find((widget) => widget.type === 'axis.gridMode' && widget.zone !== 'hidden');
  const sizeWidget = widgets.find((widget) => widget.type === 'axis.blockSize' && widget.zone !== 'hidden');
  if (!modeWidget && !sizeWidget) return null;
  return {
    mode: readAxisGridMode(modeWidget?.state?.mode),
    tilePx: AXIS_BLOCK_TILE_PX[readAxisBlockSize(sizeWidget?.state?.size)]
  };
}
