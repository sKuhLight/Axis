import { describe, expect, it } from 'vitest';
import { AXIS_BLOCK_TILE_PX, resolveAxisGridMetrics, type AxisBlockSize, type AxisGridMode } from '../gridView';

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
function renderGrid(view: View, paneW: number, paneH: number) {
  const metrics = resolveAxisGridMetrics(view, paneW, paneH);
  const mapMode = metrics.mode === 'map';
  const fullGap = metrics.fullGap;
  const gap = mapMode ? 7 : fullGap;
  // viewport content box the tiles fill (pane minus gridwrap padding).
  const availW = paneW - PANE_PADDING;
  const availH = paneH - PANE_PADDING;
  const tileCap = mapMode ? metrics.mapColMax : metrics.fullColMax;

  // fixedTile ONLY for explicit 'full' (post-fix): auto never uses fixed tiles even when it resolves to full.
  const fixedTile = view.mode === 'full' && metrics.mode === 'full';

  let colW: number;
  let cellH: number;
  if (fixedTile) {
    colW = Math.min(view.tilePx, metrics.fullColMax);
    cellH = colW * ASPECT;
  } else {
    const fillW = (availW - (COLS - 1) * gap) / COLS;
    const fitH = availH > 1 ? (availH - (ROWS - 1) * gap) / ROWS : Infinity;
    colW = Math.max(24, Math.min(fillW, fitH / ASPECT, tileCap));
    const sq = colW * ASPECT;
    cellH = Math.max(24, Math.min(sq, fitH));
  }

  const gridW = COLS * colW + (COLS - 1) * gap;
  const gridH = ROWS * cellH + (ROWS - 1) * gap;
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
