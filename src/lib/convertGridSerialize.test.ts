import { describe, it, expect } from 'vitest';
import { layoutToRouting, applyGridEditsToState } from './convertGridSerialize';
import { gridLayoutFromScratch } from './convertGridAdapter';
import { scratchToPreset } from './convertScratch';
import type { Cell, Layout } from './grid';
import type { ScratchState, ScratchBlock } from './convertScratch';
import type { ConverterPreset } from './types';

function block(partial: Partial<ScratchBlock> & { key: string; family: string }): ScratchBlock {
  return { instance: 1, params: [], position: null, ...partial } as ScratchBlock;
}
function cell(row: number, col: number, effectId: number, kind: 'block' | 'shunt', display: string, pack: string | null, fromRows: number[] = []): Cell {
  return { row, col, kind, effectId, display, pack, color: '#000', fromRows };
}
function layout(cells: Cell[], shunts: Cell[] = []): Layout {
  return { cells, shunts, rows: 4, cols: 12, name: 'L', model: 'fm3', crcValid: true };
}
function stateOf(blocks: ScratchBlock[], routing: unknown): ScratchState {
  const base = { name: 'L', sourceDevice: 'fm9', blocks: [], routing, decodeDepth: 'full', sceneCount: 1 } as unknown as ConverterPreset;
  return { sourceDevice: 'fm9', targetDevice: 'fm3', name: 'L', topology: { kind: 'grid', rows: 4, cols: 12 }, blocks, conflicts: [], base };
}

const MAP = new Map<number, string>([[100, 'amp1'], [101, 'cab1']]);
const L = layout(
  [cell(0, 0, 100, 'block', 'Brit 800', 'Amp', []), cell(0, 2, 101, 'block', '4x12', 'Cab', [0])],
  [cell(0, 1, 1024, 'shunt', 'Shunt', null, [0])]
);

describe('layoutToRouting', () => {
  it('round-trips through gridLayoutFromScratch — cells, shunts and cables survive', () => {
    const routing = layoutToRouting(L, MAP);
    const round = gridLayoutFromScratch(stateOf([], routing));
    // same blocks + shunts at the same coordinates with the same wiring
    expect(round.cells.map((c) => [c.row, c.col, c.effectId, ...c.fromRows]).sort()).toEqual([[0, 0, 100], [0, 2, 101, 0]].sort());
    expect(round.shunts).toHaveLength(1);
    expect(round.shunts[0]).toMatchObject({ row: 0, col: 1, kind: 'shunt' });
    expect(round.shunts[0].fromRows).toEqual([0]);
  });

  it('emits routeFlag from fromRows and a blockKey back-reference (null for shunts)', () => {
    const { gridCells } = layoutToRouting(L, MAP);
    const cab = gridCells.find((g) => g.effectId === 101)!;
    expect(cab.routeFlag).toBe(0b1); // fed from row 0
    expect(cab.blockKey).toBe('cab1');
    expect(gridCells.find((g) => g.isShunt)!.blockKey).toBeNull();
  });

  it('linearizes a seriesChains fallback left-to-right', () => {
    expect(layoutToRouting(L, MAP).seriesChains).toEqual([['amp1', 'cab1']]);
  });
});

describe('applyGridEditsToState', () => {
  const blocks = [
    block({ key: 'amp1', family: 'amp', position: { row: 0, col: 0 } }),
    block({ key: 'cab1', family: 'cab', position: { row: 0, col: 3 } }), // stale position (moved on the grid)
    block({ key: 'gone', family: 'drive', position: { row: 1, col: 0 } }) // removed from the grid
  ];

  it('prunes removed blocks and syncs surviving blocks position + fromRows from the layout', () => {
    const next = applyGridEditsToState(stateOf(blocks, { seriesChains: [] }), L, MAP);
    expect(next.blocks.map((b) => b.key).sort()).toEqual(['amp1', 'cab1']); // 'gone' pruned
    const cab = next.blocks.find((b) => b.key === 'cab1')!;
    expect(cab.position).toEqual({ row: 0, col: 2 }); // synced from the edited cell
    expect(cab.fromRows).toEqual([0]);
  });

  it('threads the edited routing into base.routing so the commit preset reflects it', () => {
    const next = applyGridEditsToState(stateOf(blocks, { seriesChains: [] }), L, MAP);
    const preset = scratchToPreset(next);
    const gridCells = (preset.routing as { gridCells: { effectId: number }[] }).gridCells;
    expect(gridCells.map((g) => g.effectId).sort()).toEqual([100, 101, 1024]);
    expect(preset.blocks.find((b) => b.key === 'cab1')!.position).toEqual({ row: 0, col: 2 });
  });

  // FORGEFXMID-43: the preset the export path SENDS (scratchToPreset of the committed state) must carry
  // each cell's routeFlag/fromRows — the drawn cables — so ForgeFX authors them into the .syx grid.
  it('the exported IR carries per-cell routeFlag + fromRows (the drawn cables) and the shunt', () => {
    const next = applyGridEditsToState(stateOf(blocks, { seriesChains: [] }), L, MAP);
    const cells = (scratchToPreset(next).routing as { gridCells: { effectId: number; routeFlag?: number; fromRows?: number[]; isShunt?: boolean }[] }).gridCells;
    const cab = cells.find((g) => g.effectId === 101)!;
    expect(cab.routeFlag).toBe(0b1); // fed from row 0
    expect(cab.fromRows).toEqual([0]);
    const shunt = cells.find((g) => g.isShunt)!;
    expect(shunt.routeFlag).toBe(0b1);
    expect(shunt.fromRows).toEqual([0]);
  });
});
