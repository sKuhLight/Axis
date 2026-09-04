import { describe, it, expect } from 'vitest';
import {
  CANVAS_W,
  COL_PITCH,
  DEVICE_COLS,
  CANVAS_ROW_GAP_PX,
  colToPx,
  pxToCol,
  controlPx,
  offsetYOf,
  splitByOffsetY,
  isPanelCluster,
  parsePositionExact,
  clusterByCanvasRow
} from './deviceGeometry';
import type { LayoutControl, LayoutWidget } from './types';

const ctl = (widget: LayoutWidget, placement?: LayoutControl['placement']): LayoutControl => ({
  label: '',
  paramName: null,
  paramId: null,
  widget,
  ...(placement ? { placement } : {})
});

describe('the column pitch is DERIVED, so authored columns survive the round trip exactly', () => {
  // This is the property the whole two-spelling model rests on: `col` and `positionExact.x` resolve onto
  // one number line, and 5852 column-authored controls (Axe-Fx III alone) must come back off it unchanged.
  // It holds because COL_PITCH is defined as CANVAS_W / DEVICE_COLS rather than measured separately.
  it('pxToCol(colToPx(c)) === c for every authored column', () => {
    for (let c = 0; c < DEVICE_COLS; c++) expect(pxToCol(colToPx(c))).toBe(c);
  });

  it('holds under the horizontal nudges the device actually authors (offsetX is 0-90px)', () => {
    for (let c = 0; c < DEVICE_COLS - 1; c++)
      for (const dx of [0, 10, 12, 20, 40, 42, 43, 52]) expect(pxToCol(colToPx(c, dx))).toBe(c);
  });

  it('COL_PITCH is the derived value, not an independently tuned constant', () => {
    expect(COL_PITCH).toBe(CANVAS_W / DEVICE_COLS);
  });

  it('never returns a negative column for a control nudged left of the margin', () => {
    expect(pxToCol(-50)).toBe(0);
  });
});

describe('pxToCol — the canvas positions this was written to get right', () => {
  it("puts the amp's HEADROOM meter (x=465) under the tonestack, not at the left margin", () => {
    expect(pxToCol(465)).toBe(3);
  });

  it("spreads the Speaker page's knobs-flanking-a-graph composition across the grid", () => {
    // Real Axe-Fx III Speaker page x values: left knob stack, graph, right knob stack.
    expect(pxToCol(305)).toBe(2);
    expect(pxToCol(395)).toBe(3);
    expect(pxToCol(745)).toBe(5);
  });

  it("keeps the cab's right-hand strip (x=1179) at the far right", () => {
    expect(pxToCol(1179)).toBe(9);
  });
});

describe('splitByOffsetY — a device row is a band, not a line', () => {
  const y = (v: number) => ({ offsetY: v });

  it("splits the amp Ideal row into its two real lines (toggles at -70, knobs at 0)", () => {
    const items = [y(-70), y(-70), y(0), y(0), y(-70)];
    const lines = splitByOffsetY(items, (i) => i.offsetY);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(3); // the toggles — ABOVE, so first
    expect(lines[1]).toHaveLength(2);
  });

  it('preserves array order within each line (spacer and band-set semantics still read it)', () => {
    const items = [{ offsetY: 0, n: 1 }, { offsetY: -70, n: 2 }, { offsetY: 0, n: 3 }, { offsetY: -70, n: 4 }];
    const lines = splitByOffsetY(items, (i) => i.offsetY);
    expect(lines[0].map((i) => i.n)).toEqual([2, 4]);
    expect(lines[1].map((i) => i.n)).toEqual([1, 3]);
  });

  it('is a no-op for the overwhelming majority of rows, where every control shares one offset', () => {
    const items = [y(0), y(0), y(0)];
    expect(splitByOffsetY(items, (i) => i.offsetY)).toEqual([items]);
  });

  it('merges near-equal nudges rather than splitting into two nearly-identical lines', () => {
    const items = [y(0), y(2), y(-3)];
    expect(splitByOffsetY(items, (i) => i.offsetY)).toHaveLength(1);
  });

  it('handles the empty and single-item cases without inventing a line', () => {
    expect(splitByOffsetY([], (i: { offsetY: number }) => i.offsetY)).toEqual([]);
    expect(splitByOffsetY([y(5)], (i) => i.offsetY)).toHaveLength(1);
  });
});

describe('offsetYOf — only a nudge counts, never an absolute canvas y', () => {
  it("reads a control's authored nudge", () => {
    expect(offsetYOf(ctl('toggle', { col: 0, offsetY: -70 }))).toBe(-70);
  });

  it('is 0 for a control with no placement at all', () => {
    expect(offsetYOf(ctl('knob'))).toBe(0);
  });

  it('is 0 for a positionExact control, whose y is absolute and must not split an authored row', () => {
    expect(offsetYOf(ctl('meter', { positionExact: '465,370' }))).toBe(0);
  });
});

describe('controlPx — the one number line both horizontal spellings meet on', () => {
  it('takes a positionExact control at its literal x', () => {
    expect(controlPx(ctl('meter', { positionExact: '465,370' }), 0)).toBe(465);
  });

  it('resolves an authored column through the pitch', () => {
    expect(controlPx(ctl('knob', { col: 3 }), 0)).toBe(colToPx(3));
  });

  it('adds the horizontal nudge', () => {
    expect(controlPx(ctl('knob', { col: 3, offsetX: 42 }), 0)).toBe(colToPx(3) + 42);
  });

  it('falls back to the row index for a flow row, reproducing the left→right sweep', () => {
    expect(pxToCol(controlPx(ctl('knob'), 4))).toBe(4);
  });
});

describe('isPanelCluster — which pages a column grid genuinely cannot express', () => {
  it('is false for the HEADROOM shape: one canvas control on a column-authored page', () => {
    expect(isPanelCluster([465], 12)).toBe(false);
  });

  it('is false for well-separated canvas columns', () => {
    expect(isPanelCluster([305, 745], 12)).toBe(false);
  });

  it("is true when two controls are closer than half a column — the cab page authors some 4px apart", () => {
    expect(isPanelCluster([305, 309], 12)).toBe(true);
  });

  it('is true for the real Speaker page, whose graph and dropdown share a column', () => {
    expect(isPanelCluster([305, 395, 456, 592, 745], 12)).toBe(true);
  });

  it('is true when the set needs more columns than the grid has', () => {
    expect(isPanelCluster([0, 200, 400, 600, 800], 4)).toBe(true);
  });

  it('is false for a single position, or none', () => {
    expect(isPanelCluster([], 12)).toBe(false);
    expect(isPanelCluster([465, 465], 12)).toBe(false);
  });
});

describe('primitives that moved here keep their behaviour', () => {
  it('parsePositionExact parses and rejects', () => {
    expect(parsePositionExact('465,370')).toEqual({ x: 465, y: 370 });
    expect(parsePositionExact('nope')).toBeNull();
    expect(parsePositionExact(null)).toBeNull();
  });

  it('clusterByCanvasRow still splits on the tuned gap', () => {
    const rows = clusterByCanvasRow([
      { xPx: 10, yPx: 0 },
      { xPx: 5, yPx: 7 }, // same visual row (≤7px spread, the cab Align case)
      { xPx: 0, yPx: 60 } // a real row below
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2);
    expect(rows[1]).toHaveLength(1);
  });

  it('clusterByCanvasRow orders a row left→right when its controls share a y', () => {
    const rows = clusterByCanvasRow([{ xPx: 10, yPx: 4 }, { xPx: 5, yPx: 4 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((r) => r.xPx)).toEqual([5, 10]);
  });

  it('the tuned gap sits between real same-row spread (≤7px) and real row gaps (≥30px)', () => {
    expect(CANVAS_ROW_GAP_PX).toBeGreaterThan(7);
    expect(CANVAS_ROW_GAP_PX).toBeLessThan(30);
  });
});
