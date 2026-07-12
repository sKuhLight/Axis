import { describe, it, expect } from 'vitest';
import { planConnect, planReplaceShunt, type RouteCell } from './gridRouting';

const SHUNT_BASE = 1024;

const block = (row: number, col: number, effectId: number, display: string, fromRows: number[] = []): RouteCell =>
  ({ row, col, kind: 'block', effectId, display, fromRows });
const shunt = (row: number, col: number, inst: number, fromRows: number[] = []): RouteCell =>
  ({ row, col, kind: 'shunt', effectId: SHUNT_BASE + inst, display: 'Shunt', fromRows });

// convenience filters over the returned ops
const places = (ops: { kind: string }[]) => ops.filter((o) => o.kind === 'place');
const cables = (ops: { kind: string }[]) => ops.filter((o) => o.kind === 'cable');
const removes = (ops: { kind: string }[]) => ops.filter((o) => o.kind === 'remove');

describe('planConnect', () => {
  it('rejects a non-forward target', () => {
    const src = block(0, 3, 1, 'PEQ 1');
    for (const destCol of [3, 2, 0]) {
      const p = planConnect([src], [], src, 0, destCol, SHUNT_BASE);
      expect(p.ok).toBe(false);
      expect(p.error).toMatch(/later column/i);
    }
  });

  it('fills empty gaps with shunts and chains cables straight along the source row', () => {
    // PEQ1 @ (0,0) → GEQ @ (0,3), cols 1 & 2 empty, dest empty
    const src = block(0, 0, 10, 'PEQ 1');
    const p = planConnect([src], [], src, 0, 3, SHUNT_BASE);
    expect(p.ok).toBe(true);
    // shunts placed in the two gaps + the empty destination
    expect(places(p.ops).map((o: any) => `${o.row},${o.col}`)).toEqual(['0,1', '0,2', '0,3']);
    // unique instance ids (0,1,2) — never reuse (device would dedupe)
    expect(places(p.ops).map((o: any) => o.blockId)).toEqual([1024, 1025, 1026]);
    // cables chain each adjacent hop, all on row 0
    expect(cables(p.ops).map((o: any) => `${o.srcRow},${o.srcCol}->${o.destRow}`)).toEqual([
      '0,0->0', '0,1->0', '0,2->0',
    ]);
    expect(p.newShunts).toHaveLength(3);
    expect(p.cables).toHaveLength(3);
  });

  it('chains through an existing block on the source row instead of erroring', () => {
    // PEQ1 @ (0,0) → GEQ @ (0,3) with PEQ2 block @ (0,1); col 2 empty
    const src = block(0, 0, 10, 'PEQ 1');
    const peq2 = block(0, 1, 11, 'PEQ 2');
    const geq = block(0, 3, 12, 'GEQ');
    const p = planConnect([src, peq2, geq], [], src, 0, 3, SHUNT_BASE);
    expect(p.ok).toBe(true);
    // only the empty gap (col 2) gets a shunt; PEQ2 is chained through, GEQ already exists
    expect(places(p.ops).map((o: any) => `${o.row},${o.col}`)).toEqual(['0,2']);
    // cables chain PEQ1→PEQ2→shunt→GEQ
    expect(cables(p.ops).map((o: any) => `${o.srcRow},${o.srcCol}->${o.destRow}`)).toEqual([
      '0,0->0', '0,1->0', '0,2->0',
    ]);
  });

  it('routes on the source row then bends into the destination row on the last hop', () => {
    // src row 0 → dest row 2 col 2; col 1 empty on row 0
    const src = block(0, 0, 10, 'Amp');
    const p = planConnect([src], [], src, 2, 2, SHUNT_BASE);
    expect(p.ok).toBe(true);
    // shunt on the SOURCE row in the gap, plus a shunt at the (row2,col2) destination
    expect(places(p.ops).map((o: any) => `${o.row},${o.col}`)).toEqual(['0,1', '2,2']);
    // straight hop on row 0, final diagonal hop into row 2
    expect(cables(p.ops).map((o: any) => `${o.srcRow},${o.srcCol}->${o.destRow}`)).toEqual([
      '0,0->0', '0,1->2',
    ]);
  });

  it('does not place a shunt when the destination cell is already occupied', () => {
    const src = block(0, 0, 10, 'Amp');
    const cab = block(0, 1, 11, 'Cab');
    const p = planConnect([src, cab], [], src, 0, 1, SHUNT_BASE);
    expect(p.ok).toBe(true);
    expect(places(p.ops)).toHaveLength(0);
    expect(cables(p.ops).map((o: any) => `${o.srcRow},${o.srcCol}->${o.destRow}`)).toEqual(['0,0->0']);
  });

  it('allocates the lowest FREE shunt instance, skipping ids already in use', () => {
    // existing shunts use instances 0 and 2 → new ones must be 1 then 3
    const src = block(0, 0, 10, 'Amp');
    const s0 = shunt(1, 0, 0);
    const s2 = shunt(2, 0, 2);
    const p = planConnect([src], [s0, s2], src, 0, 3, SHUNT_BASE); // 2 gaps + dest = 3 shunts
    const ids = places(p.ops).map((o: any) => o.blockId);
    expect(ids).toEqual([SHUNT_BASE + 1, SHUNT_BASE + 3, SHUNT_BASE + 4]);
  });
});

describe('planReplaceShunt', () => {
  it('rejects a non-shunt target', () => {
    const target = block(0, 1, 11, 'Cab');
    const p = planReplaceShunt([target], [], target, { blockId: 20, display: 'Drive' });
    expect(p.ok).toBe(false);
  });

  it('replaces a shunt on the add-block flow, preserving its inputs and outputs', () => {
    // shunt @ (1,2) fed from rows [0,1] of col1, feeding a block @ (1,3)
    const sh = shunt(1, 2, 0, [0, 1]);
    const downstream = block(1, 3, 30, 'Reverb', [1]); // fed from row 1 of col 2 (the shunt)
    const p = planReplaceShunt([downstream], [sh], sh, { blockId: 20, display: 'Drive' });
    expect(p.ok).toBe(true);
    // no source removal on the add-block flow
    expect(removes(p.ops)).toHaveLength(1); // just the shunt
    expect(places(p.ops)).toHaveLength(1);
    // shunt cleared first, block placed at the same cell
    expect(p.ops[0]).toMatchObject({ kind: 'remove', row: 1, col: 2, inRows: [0, 1], outRows: [1] });
    expect(p.ops[1]).toMatchObject({ kind: 'place', row: 1, col: 2, blockId: 20 });
    // inputs re-wired from col-1, outputs re-wired to col+1
    const cbl = cables(p.ops).map((o: any) => `${o.srcRow},${o.srcCol}->${o.destRow}`);
    expect(cbl).toEqual(['0,1->1', '1,1->1', '1,2->1']);
  });

  it('replaces a shunt on a block-move, clearing the moved block first (undo carries its wires)', () => {
    const sh = shunt(1, 2, 0, [0]);
    const src = block(0, 0, 40, 'Amp', []);
    // src @ (0,0) feeds a cell @ (0,1) → captured as the src remove op's outRows for undo
    const srcOut = block(0, 1, 41, 'Cab', [0]);
    const p = planReplaceShunt([src, srcOut], [sh], sh, { blockId: 40, display: 'Amp', src: { row: 0, col: 0, effectId: 40, display: 'Amp', fromRows: [] } });
    expect(p.ok).toBe(true);
    // both the source block AND the shunt are removed before the block is placed
    expect(removes(p.ops)).toHaveLength(2);
    expect(p.ops[0]).toMatchObject({ kind: 'remove', row: 0, col: 0, blockId: 40, outRows: [0] });
    expect(p.ops[1]).toMatchObject({ kind: 'remove', row: 1, col: 2, inRows: [0] });
    expect(p.ops[2]).toMatchObject({ kind: 'place', row: 1, col: 2, blockId: 40 });
    // shunt input re-wired onto the block
    expect(cables(p.ops).map((o: any) => `${o.srcRow},${o.srcCol}->${o.destRow}`)).toEqual(['0,1->1']);
  });

  it('rejects moving a block onto its own cell', () => {
    const sh = shunt(1, 2, 0);
    const p = planReplaceShunt([], [sh], sh, { blockId: 40, display: 'Amp', src: { row: 1, col: 2, effectId: 40, display: 'Amp', fromRows: [] } });
    expect(p.ok).toBe(false);
  });
});
