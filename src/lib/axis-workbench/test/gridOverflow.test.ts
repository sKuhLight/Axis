import { describe, expect, it } from 'vitest';
import {
  AXIS_BLOCK_TILE_PX,
  resolveAxisGridMetrics,
  resolveAxisGridPresentation,
  type AxisBlockSize,
  type AxisGridMode
} from '../gridView';

// ── SignalGrid tile-fit model (mirrors SignalGrid.svelte colW/cellH derivations) ──────────────────
// The scrollbar bug (04-fc-and-grid.md §2.2 invariant: auto/map NEVER scrollbar; only 'full' pans) was
// NOT in resolveAxisGridMetrics — it was in SignalGrid: `auto` resolving to full took the FIXED-tile
// path, whose colW = min(tilePx, fullColMax) is capped only by pane HEIGHT (colCapH). The 12-col WIDTH
// then routinely exceeded the pane content box → .viewport.free's overflow:auto showed a horizontal
// scrollbar. This model pins the rendered tile width/height and the resulting grid box against the
// viewport content box so the no-overflow invariant is unit-tested, not just visually checked.

const ASPECT = 0.95; // preferred tile height ÷ width (SignalGrid.ASPECT)
const ROWS = 4;
const COLS = 12;
// gridwrap padding = 22px each side (SignalGrid .gridwrap). The pane-host (border-box) the resolver reads
// includes this padding; the viewport content box the tiles actually live in loses it on both axes.
const PANE_PADDING = 44;

interface View {
  mode: AxisGridMode;
  size: AxisBlockSize;
  tilePx: number;
}

/**
 * Reproduce SignalGrid's rendered tile size for a desktop workbench view on a pane of paneW×paneH.
 * Returns the grid box (gridW×gridH incl. gaps) and the viewport content box it must fit inside, plus
 * whether the fixed-tile (scrolling) path is used — which the invariant only permits for view.mode 'full'.
 */
function renderGrid(view: View, paneW: number, paneH: number, dims = { rows: ROWS, cols: COLS }) {
  const metrics = resolveAxisGridMetrics(view, paneW, paneH, dims);
  const mapMode = metrics.mode === 'map';
  const fullGap = metrics.fullGap;
  const gap = mapMode ? 7 : fullGap;
  // viewport content box the tiles fill (pane minus gridwrap padding).
  const availW = paneW - PANE_PADDING;
  const availH = paneH - PANE_PADDING;
  const tileCap = mapMode ? metrics.mapColMax : metrics.fullColMax;

  // fixedTile ONLY for explicit 'full' (post-fix): auto never uses fixed tiles even when it resolves to full.
  const fixedTile = view.mode === 'full' && metrics.mode === 'full';

  const fillW = (availW - (dims.cols - 1) * gap) / dims.cols;
  const fitH = availH > 1 ? (availH - (dims.rows - 1) * gap) / dims.rows : Infinity;
  let colW: number;
  let cellH: number;
  if (fixedTile) {
    // chosen S/M/L px is the floor (scrolls below it); given room the tiles grow to fill, capped like auto.
    const base = Math.min(view.tilePx, metrics.fullColMax);
    colW = Math.max(base, Math.min(fillW, fitH / ASPECT, metrics.fullColMax));
    cellH = colW * ASPECT;
  } else {
    colW = Math.max(24, Math.min(fillW, fitH / ASPECT, tileCap));
    const sq = colW * ASPECT;
    cellH = Math.max(24, Math.min(sq, fitH));
  }

  const gridW = dims.cols * colW + (dims.cols - 1) * gap;
  const gridH = dims.rows * cellH + (dims.rows - 1) * gap;
  return { mode: metrics.mode, fixedTile, colW, cellH, gridW, gridH, availW, availH };
}

// pane sweep across the S/M/L pane-size classes the operator can dock the grid at.
const PANE_SWEEP: Array<[number, number]> = [
  [700, 400], // S: small dock
  [900, 500],
  [1000, 620],
  [1200, 700], // M
  [1400, 520], // the operator's reported large-but-short pane
  [1400, 900],
  [1500, 700],
  [1680, 900], // L
  [1920, 1080],
  [2560, 1400] // ultra-wide
];

const SIZES: AxisBlockSize[] = ['S', 'M', 'L'];
const view = (mode: AxisGridMode, size: AxisBlockSize): View => ({ mode, size, tilePx: AXIS_BLOCK_TILE_PX[size] });

describe('grid no-overflow invariant (auto/map never scrollbar)', () => {
  for (const size of SIZES) {
    for (const [w, h] of PANE_SWEEP) {
      it(`auto+${size} on ${w}×${h} fits both axes and never uses the scrolling path`, () => {
        const g = renderGrid(view('auto', size), w, h);
        // auto must never take the fixed-tile (overflow:auto) path — that is the only scrollbar path.
        expect(g.fixedTile).toBe(false);
        // and the rendered grid must fit the viewport content box on BOTH axes (float slack for rounding).
        expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5);
        expect(g.gridH).toBeLessThanOrEqual(g.availH + 0.5);
      });

      it(`map+${size} on ${w}×${h} fits both axes and never uses the scrolling path`, () => {
        const g = renderGrid(view('map', size), w, h);
        expect(g.fixedTile).toBe(false);
        expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5);
        expect(g.gridH).toBeLessThanOrEqual(g.availH + 0.5);
      });
    }
  }

  it('the operator large pane (1400×520, auto+M) resolves to full but FITS — no scrollbar', () => {
    const g = renderGrid(view('auto', 'M'), 1400, 520);
    expect(g.mode).toBe('full'); // auto still steps to the full tier on a comfortable pane…
    expect(g.fixedTile).toBe(false); // …but renders with fit tiles, not the scrolling fixed-tile path.
    expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5); // pre-fix this overflowed (gridW≈1489 > 1356)
    expect(g.gridH).toBeLessThanOrEqual(g.availH + 0.5);
  });

  it("explicit 'full' IS allowed to overflow/scroll (fixed tiles pan) — the one mode that may scrollbar", () => {
    // On a wide pane, explicit full pins tiles at the M cap and the 12-col width exceeds the pane: that
    // is the intended, spec-sanctioned scroll (only 'full' pans).
    const g = renderGrid(view('full', 'M'), 1400, 900);
    expect(g.fixedTile).toBe(true);
    expect(g.gridW).toBeGreaterThan(g.availW); // fixed tiles → wider than the pane → panning scroll
  });
});

describe('small device grids fill the pane (AM4 1×4, VP4 1×8)', () => {
  const AM4 = { rows: 1, cols: 4 };

  it('auto+M on an AM4 grid grows tiles far past the gen-3 cap and still fits both axes', () => {
    const g = renderGrid(view('auto', 'M'), 1400, 700, AM4);
    expect(g.mode).toBe('full');
    // pre-fix these 4 tiles were pinned at fullColMax=140 (min(140, colCapH)) in a ~1356px-wide box
    expect(g.colW).toBeGreaterThan(300);
    expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5);
    expect(g.gridH).toBeLessThanOrEqual(g.availH + 0.5);
  });

  it("explicit 'full'+M on an AM4 grid grows past the chosen tile px when the pane has room (no scroll)", () => {
    const g = renderGrid(view('full', 'M'), 1400, 700, AM4);
    expect(g.fixedTile).toBe(true);
    expect(g.colW).toBeGreaterThan(AXIS_BLOCK_TILE_PX.M); // grew beyond the 150px chip size
    expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5); // grown-to-fit → nothing to scroll
  });

  it("explicit 'full'+M on a tight pane keeps the chip px as the floor and scrolls", () => {
    const g = renderGrid(view('full', 'M'), 700, 300, AM4);
    expect(g.fixedTile).toBe(true);
    expect(g.colW).toBe(AXIS_BLOCK_TILE_PX.M); // floor holds: 150px tiles
    expect(g.gridW).toBeGreaterThan(g.availW); // → the sanctioned 'full' panning scroll
  });

  it('auto on an AM4 grid never scrolls across the pane sweep', () => {
    for (const [w, h] of PANE_SWEEP) {
      const g = renderGrid(view('auto', 'M'), w, h, AM4);
      expect(g.fixedTile).toBe(false);
      expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5);
      expect(g.gridH).toBeLessThanOrEqual(g.availH + 0.5);
    }
  });
});

describe('1333px window (old-shell isMobile=true) — workbench view ignores it', () => {
  // Regression guard for the T31 finding: on a 1333px-wide window editor.isMobile is true (<1366). Before
  // the fix SignalGrid gated the ENTIRE workbench view path on !isMobile, so any window under 1366 lost
  // metrics/map/full/auto and fell into the legacy pager — ignoring the GRID Map chip. The pane inside such
  // a window is comfortably ~950px, so the presentation must be a real full/map render, not the pager.
  const PANE_W = 950;
  const PANE_H = 520;

  it('Map chip renders the map (not the legacy pager) at a 1333px window', () => {
    const mode = resolveAxisGridMetrics(view('map', 'M'), PANE_W, PANE_H).mode;
    const p = resolveAxisGridPresentation({ view: view('map', 'M'), metricsMode: mode, isMobile: true });
    expect(p.mapMode).toBe(true);
    expect(p.paged).toBe(false);
    // and the map still fits its viewport (no overflow) at this pane
    const g = renderGrid(view('map', 'M'), PANE_W, PANE_H);
    expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5);
    expect(g.gridH).toBeLessThanOrEqual(g.availH + 0.5);
  });

  it('Auto renders full or map by the pane (never legacy-mob) at a 1333px window', () => {
    const mode = resolveAxisGridMetrics(view('auto', 'M'), PANE_W, PANE_H).mode;
    expect(mode === 'full' || mode === 'map').toBe(true);
    const p = resolveAxisGridPresentation({ view: view('auto', 'M'), metricsMode: mode, isMobile: true });
    expect(p.paged).toBe(false);
    const g = renderGrid(view('auto', 'M'), PANE_W, PANE_H);
    expect(g.fixedTile).toBe(false); // auto never scrolls
    expect(g.gridW).toBeLessThanOrEqual(g.availW + 0.5);
    expect(g.gridH).toBeLessThanOrEqual(g.availH + 0.5);
  });

  it('explicit Map at a tiny pane stays map even with isMobile true', () => {
    const mode = resolveAxisGridMetrics(view('map', 'M'), 400, 300).mode;
    const p = resolveAxisGridPresentation({ view: view('map', 'M'), metricsMode: mode, isMobile: true });
    expect(p.mapMode).toBe(true);
    expect(p.paged).toBe(false);
  });
});

describe('mobile tier renders paged (not shrunk-to-nothing) below 620px pane', () => {
  it('a narrow pane resolves to the mobile tier, not map/full', () => {
    expect(resolveAxisGridMetrics(view('auto', 'M'), 560, 700).mode).toBe('mobile');
    expect(resolveAxisGridMetrics(view('auto', 'M'), 480, 400).mode).toBe('mobile');
  });

  it('the mobile tier keeps usable page-width tiles (no unusably-tiny cells)', () => {
    // SignalGrid's paged path fills the page width at a fixed column density (design default 6 cols).
    // Model one page: colW = (availW - (visCols-1)*gap)/visCols, floored at 24. With a sane density the
    // tiles stay well above the floor even on a small pane.
    const visCols = 6;
    const gap = 12; // visCols<=6 → 12 (SignalGrid gap ladder)
    for (const paneW of [560, 500, 440, 380]) {
      const availW = paneW - PANE_PADDING;
      const colW = Math.max(24, (availW - (visCols - 1) * gap) / visCols);
      expect(colW).toBeGreaterThanOrEqual(40); // comfortably above the 24px hard floor
    }
  });
});
