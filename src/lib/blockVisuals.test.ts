import { describe, expect, it } from 'vitest';
import { graphCatalogKey, isGraphKey, parseBlockVisuals } from './blockVisuals';

describe('parseBlockVisuals', () => {
  it('absent or not a list → undefined (no graphs)', () => {
    expect(parseBlockVisuals(undefined)).toBeUndefined();
    expect(parseBlockVisuals(null)).toBeUndefined();
    expect(parseBlockVisuals({ key: 'dynamics' })).toBeUndefined();
  });

  it('keeps well-formed entries with their roles and mode', () => {
    const v = parseBlockVisuals([
      { key: 'dynamics', kind: 'dynamics', title: 'Compressor curve', mode: 'compressor', roles: { threshold: 0, ratio: 1, gainReduction: 25 } }
    ]);
    expect(v).toEqual([{ key: 'dynamics', kind: 'dynamics', title: 'Compressor curve', mode: 'compressor', roles: { threshold: 0, ratio: 1, gainReduction: 25 } }]);
  });

  it('drops malformed entries and roles, keeps the first of a repeated key', () => {
    const v = parseBlockVisuals([
      { key: 'lfo', kind: 'lfo', title: 'LFO', roles: { rate: 2, shape: -1, depth: 1.5, phase: '3' } },
      { key: 'lfo', kind: 'lfo', title: 'second', roles: {} },
      { key: 'x', kind: 'nope', roles: {} },
      { key: 'bad key', kind: 'decay', roles: {} },
      { kind: 'decay', roles: {} },
      { key: 'decay', kind: 'decay', roles: null },
      'junk'
    ]);
    expect(v).toEqual([{ key: 'lfo', kind: 'lfo', title: 'LFO', roles: { rate: 2 } }]);
  });

  it('a missing title falls back to the key', () => {
    expect(parseBlockVisuals([{ key: 'echo', kind: 'echo', roles: { time: 8 } }])![0]!.title).toBe('echo');
  });
});

describe('graph keys', () => {
  it('prefix and predicate', () => {
    expect(graphCatalogKey('lfo1')).toBe('graph:lfo1');
    expect(isGraphKey('graph:lfo1')).toBe(true);
    expect(isGraphKey('graph:')).toBe(false);
    expect(isGraphKey('k4')).toBe(false);
  });
});
