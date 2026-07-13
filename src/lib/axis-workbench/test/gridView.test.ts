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
  resolveAxisGridPresentation,
  stepAxisBlockSize,
  type AxisGridView
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

  // Regression guard for the "tiny ~30px tiles" bug: on a comfortable pane, auto+M must resolve to FULL
  // with sizable tiles. The bug was SignalGrid feeding the padding-stripped viewport box (which already
  // excluded the gridbar + 22px pane padding) into the resolver, whose thresholds/colCapH strip padding
  // AGAIN — double-counting chrome collapsed the pane below fullMinH and forced map (~30px cells). The fix
  // feeds the raw pane-host (gridwrap) rect, which these numbers pin.
  describe('realistic workbench pane (the tiny-tile regression)', () => {
    // SignalGrid's fixed-tile column width (view.mode==='full'): min(tilePx, fullColMax). Mirror it so the
    // rendered tile size is pinned, not just the resolver internals.
    const fixedTileColW = (view: { mode: 'auto' | 'full' | 'map'; size: 'S' | 'M' | 'L'; tilePx: number }, w: number, h: number) => {
      const met = resolveAxisGridMetrics(view, w, h);
      return Math.min(view.tilePx, met.fullColMax);
    };

    it('auto+M on a 1400×520 pane resolves to full with tiles near the M cap (not map ~30px)', () => {
      const met = resolveAxisGridMetrics({ mode: 'auto', size: 'M' }, 1400, 520);
      expect(met.mode).toBe('full');
      // 1400 ≥ fullMin (1161) and 520 ≥ fullMinH (397) → full, not map.
      expect(met.fullMin).toBe(12 * 72 + 11 * 23 + 44); // 1161
      expect(met.fullMinH).toBe(4 * Math.round(72 * 0.95) + 3 * 23 + 56); // 397
      // 4-row height cap on this pane: floor(((520-58-3*23)/4)/0.95) = 103 → tiles cap at 103px, well above
      // the map ceiling (42) that produced the broken ~30px circles.
      expect(met.colCapH).toBe(103);
      expect(met.fullColMax).toBe(103);
      const view = { mode: 'auto' as const, size: 'M' as const, tilePx: AXIS_BLOCK_TILE_PX.M };
      // fixed-tile mode uses the design 'full' branch; a comfortable pane yields a big tile, not a glyph dot.
      expect(fixedTileColW({ ...view, mode: 'full' }, 1400, 520)).toBe(103);
    });

    it('the design S pane (~1460×509) is full; the operator short M pane (~1580×276) degrades to map', () => {
      // design reference screenshot: SIZE=S, tall pane → full-mode large tiles.
      expect(resolveAxisGridMetrics({ mode: 'auto', size: 'S' }, 1460, 509).mode).toBe('full');
      // operator's broken screenshot: SIZE=M, half-height pane → auto correctly steps to map (this is a
      // genuine short pane, not the measurement bug; the fix stops the *further* erroneous shrink).
      expect(resolveAxisGridMetrics({ mode: 'auto', size: 'M' }, 1580, 276).mode).toBe('map');
    });

    it('a very short pane keeps map tiles at the ceiling (≥ what the double-count produced)', () => {
      // 276px pane-host in map: colCapH = floor(((276-34-3*7)/4)/0.95) = 58 → mapColMax stays at the 42 cap.
      const met = resolveAxisGridMetrics({ mode: 'map', size: 'M' }, 1580, 276);
      expect(met.colCapH).toBe(58);
      expect(met.mapColMax).toBe(AXIS_GRID_MAP_COL_MAX); // 42, not the ~30 the stripped box yielded
    });
  });

  // Small device grids (AM4 1×4, VP4 1×8) relax the 12×4-anchored math so tiles may fill the pane;
  // larger-than-design grids (FM9/III 6×14) clamp back to the 12×4 constants — gen-3 stays pixel-identical.
  describe('grid-aware dims (AM4/VP4 fill, gen-3 unchanged)', () => {
    const M = { mode: 'auto' as const, size: 'M' as const };

    it('omitted dims ≡ the design 12×4 (backwards compatible)', () => {
      const def = resolveAxisGridMetrics(M, 1400, 520);
      const dims = resolveAxisGridMetrics(M, 1400, 520, { rows: 4, cols: 12 });
      expect(dims).toEqual(def);
    });

    it('grids larger than 12×4 clamp to the design constants (FM9/III 6×14 ≡ today)', () => {
      const def = resolveAxisGridMetrics(M, 1400, 520);
      const fm9 = resolveAxisGridMetrics(M, 1400, 520, { rows: 6, cols: 14 });
      expect(fm9).toEqual(def);
    });

    it('AM4 (1×4): full-cell cap scales by 12/cols and the height cap divides by ONE row', () => {
      const am4 = resolveAxisGridMetrics(M, 1400, 700, { rows: 1, cols: 4 });
      // colCapH for 1 row: floor(((700-58-0)/1)/0.95) = 675 → cap = min(140*3, 675) = 420
      expect(am4.colCapH).toBe(675);
      expect(am4.fullColMax).toBe(AXIS_GRID_FULL_COL_MAX * 3);
      // map minimap keeps its compact ceiling
      expect(am4.mapColMax).toBe(AXIS_GRID_MAP_COL_MAX);
    });

    it('AM4 (1×4): auto stays full on panes where a 12-col grid would step to map', () => {
      // 700×500 pane: 12-col fullMin is 1161 → map; a 4-col grid needs only 4*72+3*23+44 = 401 → full.
      expect(resolveAxisGridMetrics(M, 700, 500).mode).toBe('map');
      const am4 = resolveAxisGridMetrics(M, 700, 500, { rows: 1, cols: 4 });
      expect(am4.mode).toBe('full');
      expect(am4.fullMin).toBe(4 * 72 + 3 * 23 + 44);
      expect(am4.fullMinH).toBe(Math.round(72 * 0.95) + 56);
    });

    it('VP4 (1×8): cap scales by 12/8', () => {
      const vp4 = resolveAxisGridMetrics(M, 2000, 800, { rows: 1, cols: 8 });
      expect(vp4.fullColMax).toBe(Math.round(AXIS_GRID_FULL_COL_MAX * 1.5));
    });

    it('the mobile threshold still wins below 620px regardless of dims', () => {
      expect(resolveAxisGridMetrics(M, 500, 500, { rows: 1, cols: 4 }).mode).toBe('mobile');
    });
  });
});

describe('resolveAxisGridPresentation (view-active NEVER consults editor.isMobile)', () => {
  const gview = (mode: 'auto' | 'full' | 'map', size: 'S' | 'M' | 'L' = 'M'): Pick<AxisGridView, 'mode' | 'size'> => ({
    mode,
    size
  });

  // The T31 / Round-9 bug: a window under the old shell's 1366 boundary sets editor.isMobile=true. When a
  // workbench view is active, that flag must be IGNORED — the presentation derives purely from the pane
  // metrics. These cases pin the 1333px-window scenario: a sub-1366 window with a comfortable grid pane.
  describe('1333px window (isMobile=true) with a view active', () => {
    // pane ~950 wide → auto resolves to full/map (never mobile); the Map chip resolves to map at any pane.
    const mapMetrics = resolveAxisGridMetrics(gview('map'), 950, 520).mode; // 'map'
    const autoMetrics = resolveAxisGridMetrics(gview('auto'), 950, 520).mode; // full or map by pane

    it('Map chip → map mode, NOT the legacy pager, even though isMobile is true', () => {
      const p = resolveAxisGridPresentation({ view: gview('map'), metricsMode: mapMetrics, isMobile: true });
      expect(p.mapMode).toBe(true);
      expect(p.paged).toBe(false); // the whole point: no legacy-mob pager
      expect(p.paneMobile).toBe(false);
      expect(p.fixedTile).toBe(false);
    });

    it('Auto → full or map by the pane (never the legacy-mob pager) while isMobile is true', () => {
      expect(autoMetrics === 'full' || autoMetrics === 'map').toBe(true); // ~950×520 pane is above the 620 tier
      const p = resolveAxisGridPresentation({ view: gview('auto'), metricsMode: autoMetrics, isMobile: true });
      expect(p.paged).toBe(false);
      expect(p.paneMobile).toBe(false);
      if (autoMetrics === 'full') expect(p.mapMode).toBe(false);
      else expect(p.mapMode).toBe(true);
    });

    it('explicit Full chip → fixed-tile pan, not the pager, while isMobile is true', () => {
      const fullMetrics = resolveAxisGridMetrics(gview('full'), 950, 520).mode; // 'full'
      const p = resolveAxisGridPresentation({ view: gview('full'), metricsMode: fullMetrics, isMobile: true });
      expect(p.fixedTile).toBe(true);
      expect(p.paged).toBe(false);
      expect(p.mapMode).toBe(false);
    });
  });

  it('explicit Map at a TINY pane stays map (the user chose it) — never degrades to the pager', () => {
    // even a sub-620 pane: 'map' pins map, so metricsMode is 'map' regardless of size.
    const tinyMap = resolveAxisGridMetrics(gview('map'), 400, 300).mode;
    expect(tinyMap).toBe('map');
    const p = resolveAxisGridPresentation({ view: gview('map'), metricsMode: tinyMap, isMobile: true });
    expect(p.mapMode).toBe(true);
    expect(p.paged).toBe(false);
  });

  it('AUTO at a sub-620 pane reaches the workbench mobile tier (paged), on any window width', () => {
    const mobileMetrics = resolveAxisGridMetrics(gview('auto'), 500, 500).mode; // 'mobile'
    expect(mobileMetrics).toBe('mobile');
    // wide desktop window (isMobile=false): still paged, because the PANE is in the mobile tier.
    const wide = resolveAxisGridPresentation({ view: gview('auto'), metricsMode: mobileMetrics, isMobile: false });
    expect(wide.paged).toBe(true);
    expect(wide.paneMobile).toBe(true);
    // narrow window (isMobile=true): identical — driven by the pane, not the window.
    const narrow = resolveAxisGridPresentation({ view: gview('auto'), metricsMode: mobileMetrics, isMobile: true });
    expect(narrow).toEqual(wide);
  });

  it('old shell (view == null) keeps window-driven paging via isMobile', () => {
    const mobile = resolveAxisGridPresentation({ view: null, metricsMode: null, isMobile: true });
    expect(mobile.paged).toBe(true);
    expect(mobile.paneMobile).toBe(false); // paneMobile is workbench-only
    expect(mobile.mapMode).toBe(false);
    expect(mobile.fixedTile).toBe(false);

    const desktop = resolveAxisGridPresentation({ view: null, metricsMode: null, isMobile: false });
    expect(desktop.paged).toBe(false);
    expect(desktop.mapMode).toBe(false);
    expect(desktop.fixedTile).toBe(false);
  });
});
