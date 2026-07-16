import { describe, it, expect } from 'vitest';
import { scratchToLayout, keyAt, keyForEffectId, titleCase } from './convertScratchAdapter';
import type { ScratchState, ScratchBlock } from './convertScratch';
import type { ConverterPreset } from './types';

// minimal ConverterPreset stub — the adapter never reads `base`, so an empty shell is fine.
const base: ConverterPreset = { name: 'Test', sourceDevice: 'fm9', blocks: [] } as unknown as ConverterPreset;

function block(partial: Partial<ScratchBlock> & { key: string; family: string }): ScratchBlock {
  return { instance: 1, params: [], position: null, ...partial } as ScratchBlock;
}

function state(blocks: ScratchBlock[], rows = 4, cols = 12): ScratchState {
  return {
    sourceDevice: 'fm9',
    targetDevice: 'fm3',
    name: 'My Preset',
    topology: { kind: 'grid', rows, cols },
    blocks,
    conflicts: [],
    base
  };
}

describe('scratchToLayout', () => {
  it('maps placed blocks to cells at their coordinates and excludes tray blocks', () => {
    const s = state([
      block({ key: 'amp', family: 'amp', typeName: 'Brit 800', position: { row: 1, col: 3 } }),
      block({ key: 'drive', family: 'drive', position: { row: 0, col: 0 } }),
      block({ key: 'tray1', family: 'reverb', position: null }) // unplaced → excluded
    ]);
    const l = scratchToLayout(s);

    expect(l.cells).toHaveLength(2);
    const amp = l.cells.find((c) => c.display === 'Brit 800')!;
    expect(amp).toMatchObject({ row: 1, col: 3, kind: 'block', pack: 'Amp' });
    // display falls back to the family label when no typeName
    const drive = l.cells.find((c) => c.row === 0 && c.col === 0)!;
    expect(drive.display).toBe('Drive');
    expect(drive.pack).toBe('Drive');
    // tray block does not appear
    expect(l.cells.some((c) => c.pack === 'Reverb')).toBe(false);
    expect(l.shunts).toEqual([]);
  });

  it('takes dimensions / name / model from the topology + state', () => {
    const l = scratchToLayout(state([], 6, 14));
    expect(l).toMatchObject({ rows: 6, cols: 14, name: 'My Preset', model: 'fm3', crcValid: true });
  });

  it('carries per-block bypass and fromRows through', () => {
    const s = state([
      block({ key: 'a', family: 'delay', position: { row: 2, col: 5 }, bypassed: true, fromRows: [0, 1] })
    ]);
    const [cell] = scratchToLayout(s).cells;
    expect(cell.bypassed).toBe(true);
    expect(cell.fromRows).toEqual([0, 1]);
  });

  it('assigns unique effectIds: real device ids kept, missing ones synthetic + negative', () => {
    const s = state([
      block({ key: 'real', family: 'amp', position: { row: 0, col: 0 }, effectId: 106 } as never),
      block({ key: 'synthA', family: 'drive', position: { row: 0, col: 1 } }),
      block({ key: 'synthB', family: 'reverb', position: { row: 0, col: 2 } })
    ]);
    const ids = scratchToLayout(s).cells.map((c) => c.effectId);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids).toContain(106); // real id preserved
    expect(ids.filter((n) => n < 0)).toHaveLength(2); // two synthetic negatives
  });
});

describe('reverse lookups', () => {
  const s = state([
    block({ key: 'real', family: 'amp', position: { row: 0, col: 0 }, effectId: 106 } as never),
    block({ key: 'synth', family: 'drive', position: { row: 1, col: 2 } }),
    block({ key: 'tray', family: 'reverb', position: null })
  ]);

  it('keyAt resolves a coordinate to the block key, null on empty', () => {
    expect(keyAt(s, 0, 0)).toBe('real');
    expect(keyAt(s, 1, 2)).toBe('synth');
    expect(keyAt(s, 3, 3)).toBeNull();
  });

  it('keyForEffectId round-trips both real and synthetic ids from the layout', () => {
    const cells = scratchToLayout(s).cells;
    for (const c of cells) expect(keyForEffectId(s, c.effectId)).not.toBeNull();
    expect(keyForEffectId(s, 106)).toBe('real');
    expect(keyForEffectId(s, 999)).toBeNull();
  });
});

describe('titleCase', () => {
  it('collapses separators and capitalizes each word', () => {
    expect(titleCase('multi_comp')).toBe('MultiComp');
    expect(titleCase('amp')).toBe('Amp');
    expect(titleCase('')).toBe('');
  });
});
