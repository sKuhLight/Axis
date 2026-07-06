import { describe, expect, it } from 'vitest';
import type { WidgetInstance } from '../../workbench';
import {
  AXIS_BLOCK_TILE_PX,
  AXIS_GRID_FULL_COL_MAX,
  AXIS_GRID_MAP_COL_MAX,
  AXIS_GRID_MAP_COLS,
  AXIS_GRID_MAP_ROWS,
  AXIS_GRID_MODES,
  AXIS_GRID_SIZE_MIN,
  axisGridMapDots,
  axisGridViewFromWidgets,
  cycleAxisBlockSize,
  cycleAxisGridMode,
  readAxisBlockSize,
  readAxisGridMode,
  resolveAxisGridMetrics,
  stepAxisBlockSize
} from '../gridView';

const widget = (type: string, zone = 'gridbar', state?: Record<string, string>): WidgetInstance => ({
  id: `widget.${type}`,
  type,
  zone,
  order: 0,
  size: 'default',
  state
});

describe('gridView helpers', () => {
  it('reads modes and sizes defensively', () => {
    expect(readAxisGridMode('full')).toBe('full');
    expect(readAxisGridMode('map')).toBe('map');
    expect(readAxisGridMode('auto')).toBe('auto');
    expect(readAxisGridMode('nope')).toBe('auto');
    expect(readAxisGridMode(undefined)).toBe('auto');
    expect(readAxisBlockSize('S')).toBe('S');
    expect(readAxisBlockSize('XL')).toBe('M');
    expect(readAxisBlockSize(undefined)).toBe('M');
  });

  it('offers all three grid-mode chips in toolbar order', () => {
    expect(AXIS_GRID_MODES).toEqual(['full', 'map', 'auto']);
  });

  it('cycles grid modes in toolbar order with wrap', () => {
    expect(cycleAxisGridMode('full')).toBe('map');
    expect(cycleAxisGridMode('map')).toBe('auto');
    expect(cycleAxisGridMode('auto')).toBe('full');
  });

  it('steps sizes with clamping and cycles with wrap', () => {
    expect(stepAxisBlockSize('M', 1)).toBe('L');
    expect(stepAxisBlockSize('L', 1)).toBe('L');
    expect(stepAxisBlockSize('S', -1)).toBe('S');
    expect(cycleAxisBlockSize('S')).toBe('M');
    expect(cycleAxisBlockSize('L')).toBe('S');
  });

  it('derives the view from placed widgets (mode + tilePx + size)', () => {
    const view = axisGridViewFromWidgets([
      widget('axis.gridMode', 'gridbar', { mode: 'full' }),
      widget('axis.blockSize', 'gridbar', { size: 'S' })
    ]);
    expect(view).toEqual({ mode: 'full', tilePx: AXIS_BLOCK_TILE_PX.S, size: 'S' });
  });

  it('carries the map mode through the resolver', () => {
    const view = axisGridViewFromWidgets([widget('axis.gridMode', 'gridbar', { mode: 'map' })]);
    expect(view).toEqual({ mode: 'map', tilePx: AXIS_BLOCK_TILE_PX.M, size: 'M' });
  });

  it('defaults missing state and ignores hidden widgets', () => {
    expect(axisGridViewFromWidgets([widget('axis.gridMode')])).toEqual({
      mode: 'auto',
      tilePx: AXIS_BLOCK_TILE_PX.M,
      size: 'M'
    });
    expect(axisGridViewFromWidgets([widget('axis.gridMode', 'hidden'), widget('axis.blockSize', 'hidden')])).toBeNull();
    expect(axisGridViewFromWidgets([])).toBeNull();
  });
});

describe('axisGridMapDots', () => {
  it('produces a 6×3 matrix', () => {
    expect(axisGridMapDots([], 4, 12)).toHaveLength(AXIS_GRID_MAP_COLS * AXIS_GRID_MAP_ROWS);
    expect(axisGridMapDots([], 4, 12).every((d) => d === false)).toBe(true);
  });

  it('downsamples occupancy proportionally into buckets', () => {
    // top-left cell → bucket (0,0); bottom-right of a 4×12 grid → bucket (2,5)
    const dots = axisGridMapDots(
      [
        { row: 0, col: 0 },
        { row: 3, col: 11 }
      ],
      4,
      12
    );
    expect(dots[0]).toBe(true); // r0*6 + c0
    expect(dots[2 * AXIS_GRID_MAP_COLS + 5]).toBe(true); // r2*6 + c5
    expect(dots.filter(Boolean)).toHaveLength(2);
  });

  it('ignores out-of-range cells and clamps degenerate spans', () => {
    expect(axisGridMapDots([{ row: 9, col: 0 }], 4, 12).filter(Boolean)).toHaveLength(0);
    expect(axisGridMapDots([{ row: -1, col: 0 }], 4, 12).filter(Boolean)).toHaveLength(0);
    // rows/cols <1 clamp to a single-cell span → everything maps to bucket 0
    expect(axisGridMapDots([{ row: 0, col: 0 }], 0, 0)[0]).toBe(true);
  });
});

describe('resolveAxisGridMetrics', () => {
  const M = { size: 'M' as const };

  it('pins full and map modes regardless of pane rect', () => {
    expect(resolveAxisGridMetrics({ mode: 'full', ...M }, 100, 100).mode).toBe('full');
    expect(resolveAxisGridMetrics({ mode: 'map', ...M }, 5000, 5000).mode).toBe('map');
  });

  it('auto → full when the pane fits a scroll-free grid in both axes', () => {
    const met = resolveAxisGridMetrics({ mode: 'auto', ...M }, 4000, 2000);
    expect(met.mode).toBe('full');
    // M base: sizeMin 72, gap round(72*0.32)=23
    expect(met.sizeMin).toBe(AXIS_GRID_SIZE_MIN.M);
    expect(met.fullGap).toBe(Math.round(72 * 0.32));
    expect(met.fullMin).toBe(12 * 72 + 11 * 23 + 44);
    expect(met.fullMinH).toBe(4 * Math.round(72 * 0.95) + 3 * 23 + 56);
  });

  it('auto → map when either axis cannot fit the full grid, → mobile below 620px wide', () => {
    const met = resolveAxisGridMetrics({ mode: 'auto', ...M }, 4000, 2000);
    // width just under fullMin → map
    expect(resolveAxisGridMetrics({ mode: 'auto', ...M }, met.fullMin - 1, 2000).mode).toBe('map');
    // height just under fullMinH → map
    expect(resolveAxisGridMetrics({ mode: 'auto', ...M }, 4000, met.fullMinH - 1).mode).toBe('map');
    // very narrow pane → mobile tier
    expect(resolveAxisGridMetrics({ mode: 'auto', ...M }, 500, 2000).mode).toBe('mobile');
  });

  it('caps cell width by pane height so 4 rows fit (map ≤42, full ≤140)', () => {
    // tall pane → caps sit at the design maxima
    const tall = resolveAxisGridMetrics({ mode: 'full', ...M }, 4000, 4000);
    expect(tall.fullColMax).toBe(AXIS_GRID_FULL_COL_MAX);
    const tallMap = resolveAxisGridMetrics({ mode: 'map', ...M }, 4000, 4000);
    expect(tallMap.mapColMax).toBe(AXIS_GRID_MAP_COL_MAX);
    // short pane → colCapH drives the cap below the maxima
    const short = resolveAxisGridMetrics({ mode: 'full', ...M }, 4000, 260);
    expect(short.fullColMax).toBeLessThan(AXIS_GRID_FULL_COL_MAX);
    expect(short.fullColMax).toBe(short.colCapH);
    // unmeasured height (0) → uncapped sentinel, maxima apply
    const unmeasured = resolveAxisGridMetrics({ mode: 'full', ...M }, 4000, 0);
    expect(unmeasured.colCapH).toBe(9999);
    expect(unmeasured.fullColMax).toBe(AXIS_GRID_FULL_COL_MAX);
  });

  it('scales the full-fit thresholds with block size', () => {
    const s = resolveAxisGridMetrics({ mode: 'auto', size: 'S' }, 0, 0);
    const l = resolveAxisGridMetrics({ mode: 'auto', size: 'L' }, 0, 0);
    expect(s.sizeMin).toBe(AXIS_GRID_SIZE_MIN.S);
    expect(l.sizeMin).toBe(AXIS_GRID_SIZE_MIN.L);
    expect(l.fullMin).toBeGreaterThan(s.fullMin);
  });
});
