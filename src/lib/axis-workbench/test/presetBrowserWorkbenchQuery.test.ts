import { describe, expect, it } from 'vitest';
import {
  condsEqual,
  condsToQuery,
  matchNumeric,
  matchPreset,
  parseQuery,
  parseTerm,
  splitTop,
  toAdvancedText,
  toSimpleConds,
  type AxisPbMatchEntry
} from '../presetBrowser/presetBrowserWorkbenchQuery';

const entry = (over: Partial<AxisPbMatchEntry> = {}): AxisPbMatchEntry => ({
  name: 'Studio Clean',
  tags: ['Clean', 'Live'],
  author: 'Cliff',
  sceneCount: 3,
  cpu: 42,
  models: { amp: ['5153 red', 'deluxe verb'], reverb: ['large hall'] },
  blockSlugs: ['amp', 'reverb', 'delay'],
  ...over
});

describe('Preset Browser query grammar', () => {
  it('splits on a top-level char, paren-aware', () => {
    expect(splitTop('AMP(GAIN>7, TYPE=X) + tag:Lead', '+').map((s) => s.text.trim())).toEqual([
      'AMP(GAIN>7, TYPE=X)',
      'tag:Lead'
    ]);
  });

  it('parses tag / name / author / scalar / block terms', () => {
    expect(parseTerm('tag:Lead')).toEqual({ kind: 'tag', val: 'Lead' });
    expect(parseTerm('name:"Big Verb"')).toEqual({ kind: 'name', val: 'Big Verb' });
    expect(parseTerm('author:Cliff')).toEqual({ kind: 'author', val: 'Cliff' });
    expect(parseTerm('cpu<55')).toEqual({ kind: 'cpu', op: '<', val: '55' });
    expect(parseTerm('scenes>=4')).toEqual({ kind: 'scenes', op: '>=', val: '4' });
    expect(parseTerm('AMP')).toEqual({ kind: 'block', block: 'amp', params: [] });
    expect(parseTerm('AMP(TYPE=5153, GAIN>7)')).toEqual({
      kind: 'block',
      block: 'amp',
      params: [
        { name: 'TYPE', op: '=', val: '5153' },
        { name: 'GAIN', op: '>', val: '7' }
      ]
    });
  });

  it('rejects unknown block tokens', () => {
    expect(parseTerm('WOBBLE')).toBeNull();
    expect(parseTerm('WOBBLE(X=1)')).toBeNull();
  });

  it('round-trips advanced <-> simple via conds serialization', () => {
    const text = 'AMP(TYPE=5153, GAIN>7)  +  tag:Lead  +  cpu<60';
    const conds = toSimpleConds(text);
    expect(toAdvancedText(conds)).toBe(text);
  });

  it('condsEqual is order-insensitive', () => {
    expect(condsEqual(parseQuery('AMP + tag:Lead'), parseQuery('tag:Lead + AMP'))).toBe(true);
    expect(condsEqual(parseQuery('AMP'), parseQuery('DRIVE'))).toBe(false);
  });

  it('quotes serialized values containing whitespace/commas/parens', () => {
    expect(condsToQuery(parseQuery('tag:"Big Ambient"'))).toBe('tag:"Big Ambient"');
  });
});

describe('Preset Browser matching', () => {
  it('matches range literals inclusive either order', () => {
    expect(matchNumeric(50, '=', '40-60')).toBe(true);
    expect(matchNumeric(50, '=', '60-40')).toBe(true);
    expect(matchNumeric(70, '=', '40-60')).toBe(false);
  });

  it('matches tag / name / author / scenes / cpu conditions', () => {
    expect(matchPreset(entry(), parseQuery('tag:clean'), '')).toBe(true);
    expect(matchPreset(entry(), parseQuery('name:studio'), '')).toBe(true);
    expect(matchPreset(entry(), parseQuery('author:cliff'), '')).toBe(true);
    expect(matchPreset(entry(), parseQuery('scenes>=3'), '')).toBe(true);
    expect(matchPreset(entry(), parseQuery('cpu<50'), '')).toBe(true);
    expect(matchPreset(entry(), parseQuery('cpu>50'), '')).toBe(false);
  });

  it('matches a block presence and TYPE against the summary model list, incl. != negation', () => {
    expect(matchPreset(entry(), parseQuery('AMP'), '')).toBe(true);
    expect(matchPreset(entry(), parseQuery('COMP'), '')).toBe(false);
    expect(matchPreset(entry(), parseQuery('AMP(TYPE=5153)'), '')).toBe(true);
    expect(matchPreset(entry(), parseQuery('AMP(TYPE=marshall)'), '')).toBe(false);
    expect(matchPreset(entry(), parseQuery('AMP(TYPE!=marshall)'), '')).toBe(true);
  });

  it('simple free text requires every whitespace token in the haystack', () => {
    expect(matchPreset(entry(), [], 'studio clean')).toBe(true);
    expect(matchPreset(entry(), [], 'studio metal')).toBe(false);
  });

  it('combines conditions (all must pass) with simple text', () => {
    expect(matchPreset(entry(), parseQuery('tag:Live + AMP'), 'studio')).toBe(true);
    expect(matchPreset(entry(), parseQuery('tag:Live + COMP'), 'studio')).toBe(false);
  });
});
