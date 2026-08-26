import { describe, it, expect } from 'vitest';
import { resolveSurfaceCols, surfaceFitCols, type SurfaceColsInput } from './surfaceGrid';
import { densityTileMax } from './density';

const GAP = 8; // ControlSurface's GAP
const desktop = (over: Partial<SurfaceColsInput> = {}): SurfaceColsInput => ({
  containerW: 1965,
  cols: 11,
  gap: GAP,
  maxCell: densityTileMax('compact'),
  editMode: false,
  isMobile: false,
  ...over
});

describe('surfaceFitCols', () => {
  it('never returns fewer than the per-platform floor', () => {
    expect(surfaceFitCols(0, GAP, false)).toBe(3);
    expect(surfaceFitCols(0, GAP, true)).toBe(2);
    expect(surfaceFitCols(-500, GAP, false)).toBe(3);
  });

  it('scales with the container width', () => {
    expect(surfaceFitCols(1965, GAP, false)).toBe(17);
    expect(surfaceFitCols(560, GAP, false)).toBe(5);
  });
});

describe('resolveSurfaceCols', () => {
  // The regression this module exists for: 1965px board, cols=11 → 171px cells, 133px dial.
  it('caps the cell that used to reach 171px, adding columns instead', () => {
    const before = Math.floor((1965 - 10 * GAP) / 11);
    expect(before).toBe(171); // what the old inline math produced

    const { displayCols, cell } = resolveSurfaceCols(desktop());
    expect(cell).toBeLessThanOrEqual(densityTileMax('compact'));
    expect(displayCols).toBeGreaterThan(11);
  });

  it('never returns a cell above the cap at any container width', () => {
    for (const maxCell of [88, 104, 132]) {
      for (let containerW = 200; containerW <= 4000; containerW += 37) {
        const { cell } = resolveSurfaceCols(desktop({ containerW, maxCell }));
        expect(cell, `w=${containerW} max=${maxCell}`).toBeLessThanOrEqual(maxCell);
      }
    }
  });

  it('never shows fewer columns than the cols/fitCols base', () => {
    for (let containerW = 200; containerW <= 4000; containerW += 53) {
      const input = desktop({ containerW });
      const base = Math.min(input.cols, surfaceFitCols(containerW, GAP, false));
      expect(resolveSurfaceCols(input).displayCols).toBeGreaterThanOrEqual(base);
    }
  });

  it('leaves a board alone when the base already satisfies the cap', () => {
    // At comfortable (cap 132) a 1965px board needs only 15 columns, and cols=15 is under fitCols (17),
    // so the base already complies — no growth, and the cell is the plain division.
    const { displayCols, cell } = resolveSurfaceCols(
      desktop({ cols: 15, maxCell: densityTileMax('comfortable') })
    );
    expect(displayCols).toBe(15);
    expect(cell).toBe(Math.floor((1965 - 14 * GAP) / 15));
    expect(cell).toBeLessThanOrEqual(densityTileMax('comfortable'));
  });

  it('a tighter density yields more, smaller columns', () => {
    const loose = resolveSurfaceCols(desktop({ maxCell: densityTileMax('comfortable') }));
    const tight = resolveSurfaceCols(desktop({ maxCell: densityTileMax('tight') }));
    expect(tight.displayCols).toBeGreaterThan(loose.displayCols);
    expect(tight.cell).toBeLessThan(loose.cell);
  });

  it('arrange mode authors at exactly cols but still caps the cell', () => {
    const { displayCols, cell } = resolveSurfaceCols(desktop({ editMode: true }));
    expect(displayCols).toBe(11);
    expect(cell).toBe(densityTileMax('compact'));
  });

  it('holds the legibility floor on a narrow board rather than shrinking further', () => {
    const { cell } = resolveSurfaceCols(desktop({ containerW: 120, cols: 12 }));
    expect(cell).toBe(48);
  });

  it('an unsatisfiable cap loses to the legibility floor', () => {
    const { cell } = resolveSurfaceCols(desktop({ maxCell: 10 }));
    expect(cell).toBe(48);
  });

  it('mobile keeps its own floors and 6-column ceiling', () => {
    const { displayCols, cell } = resolveSurfaceCols(desktop({ containerW: 380, isMobile: true, cols: 12 }));
    expect(displayCols).toBeLessThanOrEqual(6);
    expect(cell).toBeGreaterThanOrEqual(60);
  });

  it('degenerate inputs stay finite and positive', () => {
    for (const over of [{ containerW: 0 }, { containerW: -100 }, { cols: 0 }, { cols: -3 }]) {
      const { displayCols, cell } = resolveSurfaceCols(desktop(over));
      expect(Number.isFinite(displayCols) && displayCols >= 1).toBe(true);
      expect(Number.isFinite(cell) && cell > 0).toBe(true);
    }
  });
});
