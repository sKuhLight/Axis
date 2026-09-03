import { describe, expect, it } from 'vitest';
import {
  condsEqual,
  condsToQuery,
  matchEntryFromSummary,
  matchNumeric,
  matchPreset,
  parseQuery,
  parseTerm,
  parseUnifiedQuery,
  serializeUnifiedQuery,
  splitTop,
  type AxisPbMatchEntry
} from '../presetBrowser/presetBrowserWorkbenchQuery';
import type { AxisPresetBrowserEntrySummary } from '../presetBrowser/presetBrowserWorkbenchData';

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

  it('round-trips conditions through condsToQuery serialization', () => {
    const text = 'AMP(TYPE=5153, GAIN>7)  +  tag:Lead  +  cpu<60';
    expect(condsToQuery(parseQuery(text))).toBe(text);
  });

  it('parseUnifiedQuery parses only `` `...` `` spans, everything else is free text', () => {
    const { conds, free } = parseUnifiedQuery('lead tone `AMP(TYPE=5153) + tag:Lead` more words');
    expect(conds.map((c) => c.kind)).toEqual(['block', 'tag']);
    expect(free).toBe('lead tone more words');
  });

  it('parseUnifiedQuery leaves query-shaped text outside backticks as free text (no auto-parse)', () => {
    const { conds, free } = parseUnifiedQuery('tag:Lead');
    expect(conds).toEqual([]);
    expect(free).toBe('tag:Lead');
  });

  it('parseUnifiedQuery merges multiple backtick spans', () => {
    const { conds, free } = parseUnifiedQuery('`AMP` clean `tag:Lead`');
    expect(conds.map((c) => c.kind)).toEqual(['block', 'tag']);
    expect(free).toBe('clean');
  });

  it('serializeUnifiedQuery puts free text first, then one canonical backtick block', () => {
    expect(serializeUnifiedQuery(parseQuery('AMP + tag:Lead'), 'clean tone')).toBe('clean tone `AMP  +  tag:Lead`');
    expect(serializeUnifiedQuery(parseQuery('AMP'), '')).toBe('`AMP`');
    expect(serializeUnifiedQuery([], 'clean tone')).toBe('clean tone');
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

  it('free text matches a real device name via the injected lookup, not just the decoded model', () => {
    const realNameFor = (slug: string, modelName: string) =>
      slug === 'amp' && modelName === '5153 red' ? 'Fractal Audio 5150 III' : '';
    expect(matchPreset(entry(), [], 'fractal', realNameFor)).toBe(true);
    expect(matchPreset(entry(), [], '5150', realNameFor)).toBe(true);
    // Without a lookup (or one that doesn't know this model), the real name isn't searchable.
    expect(matchPreset(entry(), [], 'fractal')).toBe(false);
    expect(matchPreset(entry(), [], 'fractal', () => '')).toBe(false);
  });
});

describe('matchEntryFromSummary (regression: decoded models must survive summary normalization)', () => {
  const summaryEntry = (over: Partial<AxisPresetBrowserEntrySummary> = {}): AxisPresetBrowserEntrySummary => ({
    id: 'dev:1',
    sourceId: 'device',
    sourceLabel: 'Device',
    number: 2,
    name: '5153 Lead',
    model: 'FM3', // the device model string — must never leak into the amp model list
    sceneCount: 0,
    blockCount: 1,
    fav: false,
    folder: null,
    tags: [],
    lastLoadedAt: null,
    blocks: [{ effectId: 101, slug: 'amp', name: 'Amp 1', instance: 1 }],
    models: { amp: ['5153 100W Blue'] },
    amps: ['5153 100W Blue'],
    converted: false,
    provenance: null,
    ...over
  });

  it('matches TYPE against the decoded model name, not the generic block label or device string', () => {
    const matched = matchEntryFromSummary(summaryEntry());
    expect(matchPreset(matched, parseQuery('AMP(TYPE=5153)'), '')).toBe(true);
    expect(matchPreset(matched, parseQuery('AMP(TYPE=marshall)'), '')).toBe(false);
    expect(matchPreset(matched, parseQuery('AMP(TYPE!=marshall)'), '')).toBe(true);
    expect(matchPreset(matched, parseQuery('AMP(TYPE!=5153)'), '')).toBe(false);
    expect(matchPreset(matched, [], '5153')).toBe(true);
    // the device model string ("FM3") must not be searchable as if it were an amp type.
    expect(matchPreset(matched, parseQuery('AMP(TYPE=FM3)'), '')).toBe(false);
  });

  it('falls back to the generic block label when no decoded model exists for that slug', () => {
    const matched = matchEntryFromSummary(summaryEntry({ models: {}, amps: [] }));
    expect(matchPreset(matched, parseQuery('AMP(TYPE=Amp 1)'), '')).toBe(true);
  });

  it('does not throw on an entry with empty models/amps maps', () => {
    const matched = matchEntryFromSummary(summaryEntry({ blocks: [], models: {}, amps: [] }));
    expect(matchPreset(matched, parseQuery('AMP(TYPE=5153)'), '')).toBe(false);
  });
});
