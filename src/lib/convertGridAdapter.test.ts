import { describe, it, expect } from 'vitest';
import {
  gridLayoutFromScratch,
  gridLayoutFromConverterPreset,
  presetEffectKeyMap,
  effectKeyMap,
  isGridTarget,
  gridCellsOf,
  gridCellsOfPreset,
  keyForGridCell
} from './convertGridAdapter';
import type { ScratchState, ScratchBlock } from './convertScratch';
import type { Cell } from './grid';
import type { ConverterBlock, ConverterPreset } from './types';

function block(partial: Partial<ScratchBlock> & { key: string; family: string }): ScratchBlock {
  return { instance: 1, params: [], position: null, ...partial } as ScratchBlock;
}

function gridState(gridCells: unknown[], blocks: ScratchBlock[] = [], kind: 'grid' | 'slots' = 'grid'): ScratchState {
  const base = { name: 'P', sourceDevice: 'fm9', blocks: [], routing: { gridCells, seriesChains: [] } } as unknown as ConverterPreset;
  return {
    sourceDevice: 'fm9',
    targetDevice: 'fm3',
    name: 'Grid Preset',
    topology: { kind, rows: 4, cols: 12 },
    blocks,
    conflicts: [],
    base
  };
}

// FM3-ish converted routing: Amp → Shunt → Cab on row 0, with the shunt and cab fed from row 0.
const CELLS = [
  { row: 0, col: 0, effectId: 100, name: 'Brit 800', slug: 'Amp', isShunt: false, routeFlag: 0, fromRows: [], blockKey: 'amp1' },
  { row: 0, col: 1, effectId: 1024, name: 'Shunt', isShunt: true, routeFlag: 1, fromRows: [0] },
  { row: 0, col: 2, effectId: 101, name: '4x12', slug: 'Cab', isShunt: false, routeFlag: 1, fromRows: [0], blockKey: 'cab1' }
];

describe('isGridTarget / gridCellsOf', () => {
  it('detects a grid topology and reads the routing cells; slot topology is not a grid target', () => {
    expect(isGridTarget(gridState(CELLS))).toBe(true);
    expect(isGridTarget(gridState(CELLS, [], 'slots'))).toBe(false);
    expect(isGridTarget(null)).toBe(false);
    expect(gridCellsOf(gridState(CELLS))).toHaveLength(3);
    expect(gridCellsOf(gridState([]))).toEqual([]);
  });
});

describe('gridLayoutFromScratch', () => {
  it('renders the FULL grid — blocks + shunts + cables — from the converted routing cells', () => {
    const l = gridLayoutFromScratch(gridState(CELLS));
    expect(l.cells.map((c) => c.effectId).sort()).toEqual([100, 101]);
    expect(l.shunts).toHaveLength(1);
    expect(l.shunts[0]).toMatchObject({ row: 0, col: 1, kind: 'shunt' });
    // cables: the cab (0,2) and the shunt (0,1) are each fed from row 0 (the converted routing survives)
    const cab = l.cells.find((c) => c.effectId === 101)!;
    expect(cab.fromRows).toEqual([0]);
    expect(l.shunts[0].fromRows).toEqual([0]);
    expect(l).toMatchObject({ rows: 4, cols: 12, model: 'fm3' });
  });

  it('uses the cells REAL effectIds (no synthetic negatives)', () => {
    const l = gridLayoutFromScratch(gridState(CELLS));
    expect(l.cells.every((c) => c.effectId > 0)).toBe(true);
  });
});

describe('effectKeyMap / keyForGridCell', () => {
  it('maps each block cell effectId to its ScratchBlock key (shunts excluded)', () => {
    const map = effectKeyMap(gridState(CELLS));
    expect(map.get(100)).toBe('amp1');
    expect(map.get(101)).toBe('cab1');
    expect(map.has(1024)).toBe(false);
    const cab: Cell = { row: 0, col: 2, kind: 'block', effectId: 101, display: '4x12', pack: 'Cab', color: '#000', fromRows: [0] };
    const shunt: Cell = { row: 0, col: 1, kind: 'shunt', effectId: 1024, display: 'Shunt', pack: null, color: '#000', fromRows: [0] };
    expect(keyForGridCell(map, cab)).toBe('cab1');
    expect(keyForGridCell(map, shunt)).toBeNull();
  });

  it('falls back to the seed coordinate when a cell carries no blockKey', () => {
    const cells = [{ row: 1, col: 3, effectId: 200, name: 'Drive', isShunt: false, routeFlag: 0, fromRows: [] }];
    const blocks = [block({ key: 'drv', family: 'drive', position: { row: 1, col: 3 } })];
    expect(effectKeyMap(gridState(cells, blocks)).get(200)).toBe('drv');
  });
});

// ── source-preset (read-only reference grid + drag source) ──
function sourcePreset(gridCells: unknown[], blocks: ConverterBlock[] = []): ConverterPreset {
  return {
    sourceDevice: 'fm3',
    name: 'Src Preset',
    sceneCount: 1,
    blocks,
    routing: { gridCells, seriesChains: [] },
    decodeDepth: 'full'
  };
}

describe('gridLayoutFromConverterPreset / gridCellsOfPreset', () => {
  it('builds a read-only Layout from the source routing cells (blocks + shunts + cables)', () => {
    const l = gridLayoutFromConverterPreset(sourcePreset(CELLS));
    expect(l.cells.map((c) => c.effectId).sort()).toEqual([100, 101]);
    expect(l.shunts).toHaveLength(1);
    expect(l.cells.find((c) => c.effectId === 101)!.fromRows).toEqual([0]);
    expect(l).toMatchObject({ rows: 4, cols: 12, model: 'fm3', name: 'Src Preset' });
    expect(gridCellsOfPreset(sourcePreset(CELLS))).toHaveLength(3);
  });

  it('derives rows/cols from the cell extent, clamped to a 4×12 minimum', () => {
    const big = gridLayoutFromConverterPreset(
      sourcePreset([{ row: 5, col: 14, effectId: 200, name: 'Drive', isShunt: false, routeFlag: 0, fromRows: [] }])
    );
    expect(big.rows).toBe(6);
    expect(big.cols).toBe(15);
  });

  it('yields an EMPTY Layout when gridCells are absent/empty (slot/chain source)', () => {
    const l = gridLayoutFromConverterPreset(sourcePreset([]));
    expect(l.cells).toEqual([]);
    expect(l.shunts).toEqual([]);
    expect(l).toMatchObject({ rows: 4, cols: 12 });
    expect(gridCellsOfPreset(sourcePreset([]))).toEqual([]);
  });
});

describe('presetEffectKeyMap', () => {
  it('maps each block cell effectId to its ConverterBlock key via the blockKey back-reference (shunts excluded)', () => {
    const map = presetEffectKeyMap(sourcePreset(CELLS));
    expect(map.get(100)).toBe('amp1');
    expect(map.get(101)).toBe('cab1');
    expect(map.has(1024)).toBe(false);
  });

  it('falls back to the cell coordinate when no blockKey is present', () => {
    const cells = [{ row: 2, col: 1, effectId: 300, name: 'Delay', isShunt: false, routeFlag: 0, fromRows: [] }];
    const blocks: ConverterBlock[] = [{ key: 'dly', family: 'delay', instance: 1, params: [], position: { row: 2, col: 1 } }];
    expect(presetEffectKeyMap(sourcePreset(cells, blocks)).get(300)).toBe('dly');
  });
});
