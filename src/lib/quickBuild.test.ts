import { describe, it, expect } from 'vitest';
import { quickBuildDropValid, packForSlug } from './quickBuild';
import { catFor } from './catalog';
import type { Cell } from './grid';

const block = (row: number, col: number): Cell => ({
  row, col, kind: 'block', effectId: row * 12 + col, display: 'Amp 1', pack: 'Amp', color: '#f5a623', fromRows: []
});
const shunt = (row: number, col: number): Cell => ({
  row, col, kind: 'shunt', effectId: 1024 + row * 12 + col, display: 'Shunt', pack: null, color: '#3a3a44', fromRows: []
});

describe('quickBuildDropValid', () => {
  it('accepts an empty cell', () => {
    expect(quickBuildDropValid([block(0, 0)], [], 2, 3)).toBe(true);
  });
  it('accepts a shunt (replaced in place)', () => {
    expect(quickBuildDropValid([block(0, 0)], [shunt(1, 4)], 1, 4)).toBe(true);
  });
  it('rejects a cell already holding a block', () => {
    expect(quickBuildDropValid([block(1, 4)], [], 1, 4)).toBe(false);
  });
  it('does not conflate row and col when checking occupancy', () => {
    expect(quickBuildDropValid([block(1, 4)], [], 4, 1)).toBe(true);
  });
});

describe('packForSlug', () => {
  it('resolves every known codec slug to a real catalog glyph (not the fallback)', () => {
    const slugs = [
      'input', 'output', 'comp', 'geq', 'peq', 'amp', 'cab', 'reverb', 'delay', 'multitap',
      'chorus', 'flanger', 'rotary', 'phaser', 'wah', 'formant', 'volume', 'tremolo', 'pitch',
      'filter', 'drive', 'enhancer', 'mixer', 'synth', 'megatap', 'gate', 'ringmod', 'multicomp',
      'tentap', 'resonator', 'looper', 'plex', 'send', 'return', 'multiplexer'
    ];
    for (const slug of slugs) {
      const pack = packForSlug(slug);
      expect(pack, slug).not.toBeNull();
      const entry = catFor(pack);
      // FALLBACK has a dashed-square glyph; a real catalog hit never does.
      expect(entry.glyph, slug).not.toContain('stroke-dasharray');
    }
  });
  it('returns null for an unknown slug', () => {
    expect(packForSlug('not-a-block')).toBeNull();
  });
});
