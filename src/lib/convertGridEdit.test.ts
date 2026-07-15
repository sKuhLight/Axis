import { describe, it, expect } from 'vitest';
import { applyRouteOps, connectOnLayout, moveOnLayout, removeAtOnLayout, disconnectOnLayout, bypassOnLayout } from './convertGridEdit';
import type { Cell, Layout } from './grid';

const SHUNT_BASE = 1024;

function cell(row: number, col: number, effectId: number, display = 'Blk', fromRows: number[] = []): Cell {
  return { row, col, kind: 'block', effectId, display, pack: null, color: '#000', fromRows };
}
function layout(cells: Cell[], shunts: Cell[] = []): Layout {
  return { cells, shunts, rows: 4, cols: 12, name: 'L', model: 'fm3', crcValid: true };
}
const at = (l: Layout, r: number, c: number) => [...l.cells, ...l.shunts].find((x) => x.row === r && x.col === c);

describe('applyRouteOps', () => {
  it('places a shunt and wires a cable into the next-column cells fromRows', () => {
    const l = layout([cell(0, 0, 100), cell(0, 2, 101)]);
    const next = applyRouteOps(
      l,
      [
        { kind: 'place', row: 0, col: 1, blockId: SHUNT_BASE, display: 'Shunt' },
        { kind: 'cable', srcRow: 0, srcCol: 1, destRow: 0, connect: true }
      ],
      SHUNT_BASE
    );
    expect(next.shunts).toHaveLength(1);
    expect(at(next, 0, 2)!.fromRows).toEqual([0]); // cable landed on the (0,2) cell
  });
});

describe('connectOnLayout (planConnect-driven fromRows edit, applied in-memory)', () => {
  it('spans a gap: lays a shunt in the empty column and feeds both the shunt and the destination', () => {
    const src = cell(0, 0, 100, 'Amp');
    const l = layout([src, cell(0, 2, 101, 'Cab')]);
    const r = connectOnLayout(l, src, 0, 2, SHUNT_BASE);
    expect(r.ok).toBe(true);
    expect(r.layout.shunts).toHaveLength(1);
    expect(at(r.layout, 0, 1)!.fromRows).toEqual([0]); // new shunt fed from row 0
    expect(at(r.layout, 0, 2)!.fromRows).toEqual([0]); // destination fed from row 0
  });

  it('cross-row connect bends into the destination row on the final hop', () => {
    const src = cell(1, 0, 100, 'Amp');
    const l = layout([src, cell(2, 1, 101, 'Cab')]);
    const r = connectOnLayout(l, src, 2, 1, SHUNT_BASE);
    expect(r.ok).toBe(true);
    expect(at(r.layout, 2, 1)!.fromRows).toEqual([1]);
  });

  it('rejects a connect to an earlier/same column', () => {
    const src = cell(0, 2, 100);
    const r = connectOnLayout(layout([src]), src, 0, 1, SHUNT_BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe('moveOnLayout', () => {
  it('same-column move re-points downstream feeders onto the new row', () => {
    const src = cell(0, 0, 100, 'Amp');
    const downstream = cell(0, 1, 101, 'Cab', [0]); // fed from row 0
    const r = moveOnLayout(layout([src, downstream]), src, 2, 0, SHUNT_BASE);
    expect(r.ok).toBe(true);
    expect(at(r.layout, 2, 0)!.effectId).toBe(100); // block relocated
    expect(at(r.layout, 0, 1)!.fromRows).toEqual([2]); // downstream now fed from the new row
  });

  it('cross-column move drops the block wiring (device default)', () => {
    const src = cell(0, 0, 100, 'Amp');
    const downstream = cell(0, 1, 101, 'Cab', [0]);
    const r = moveOnLayout(layout([src, downstream]), src, 0, 3, SHUNT_BASE);
    expect(at(r.layout, 0, 3)!.fromRows).toEqual([]);
    expect(at(r.layout, 0, 1)!.fromRows).toEqual([]); // downstream feed dropped
  });

  it('dropping onto a shunt replaces it, moving the shunts cables onto the block', () => {
    const src = cell(0, 0, 100, 'Amp');
    const shunt: Cell = { row: 0, col: 2, kind: 'shunt', effectId: SHUNT_BASE, display: 'Shunt', pack: null, color: '#3a3a44', fromRows: [1] };
    const downstream = cell(0, 3, 101, 'Cab', [0]); // fed from the shunts row 0
    const r = moveOnLayout(layout([src, downstream], [shunt]), src, 0, 2, SHUNT_BASE);
    expect(r.ok).toBe(true);
    expect(at(r.layout, 0, 2)!.effectId).toBe(100); // block now sits where the shunt was
    expect(at(r.layout, 0, 2)!.kind).toBe('block');
    expect(at(r.layout, 0, 2)!.fromRows).toEqual([1]); // inherited the shunts input wiring
    expect(at(r.layout, 0, 3)!.fromRows).toEqual([0]); // downstream still fed from row 0
    expect(r.layout.shunts).toHaveLength(0);
  });

  it('refuses to move onto an occupied block cell', () => {
    const src = cell(0, 0, 100);
    const r = moveOnLayout(layout([src, cell(0, 1, 101)]), src, 0, 1, SHUNT_BASE);
    expect(r.ok).toBe(false);
  });
});

describe('removeAtOnLayout / disconnectOnLayout / bypassOnLayout', () => {
  it('removes a cell and strips its dangling downstream feed', () => {
    const l = layout([cell(0, 0, 100), cell(0, 1, 101, 'Cab', [0])]);
    const next = removeAtOnLayout(l, 0, 0);
    expect(at(next, 0, 0)).toBeUndefined();
    expect(at(next, 0, 1)!.fromRows).toEqual([]);
  });

  it('disconnect removes one fromRows bit from the dest cell at (destRow, srcCol+1)', () => {
    const l = layout([cell(0, 0, 100), cell(0, 1, 101, 'Cab', [0, 1])]);
    // remove the feed from row 0 into the cell at (destRow=0, srcCol+1=1)
    const next = disconnectOnLayout(l, 0, 0, 0, SHUNT_BASE);
    expect(at(next, 0, 1)!.fromRows).toEqual([1]);
  });

  it('bypass toggles the target block only', () => {
    const l = layout([cell(0, 0, 100)]);
    expect(bypassOnLayout(l, 0, 0).cells[0].bypassed).toBe(true);
    expect(bypassOnLayout(bypassOnLayout(l, 0, 0), 0, 0).cells[0].bypassed).toBe(false);
  });
});
