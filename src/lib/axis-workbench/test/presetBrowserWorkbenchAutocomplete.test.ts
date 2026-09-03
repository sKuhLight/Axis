import { describe, expect, it } from 'vitest';
import {
  applyAcceptance,
  buildAutocompleteContext,
  findBacktickRegion,
  suggest,
  suggestInQuery,
  tidyQuery,
  type AutocompleteContext
} from '../presetBrowser/presetBrowserWorkbenchAutocomplete';
import { specsBySlug, type SpecLibEntry } from '../presetBrowser/presetBrowserWorkbenchSpecs';

const libEntry: SpecLibEntry = {
  summaryBlockSlugs: ['amp', 'reverb'],
  models: { amp: ['USA Clean', '5153 Red'], reverb: ['Large Hall'] },
  blocks: [
    {
      slug: 'amp',
      params: [
        { label: 'Gain', kind: 'float', value: 2, enumLabel: null },
        { label: 'Gain', kind: 'float', value: 10, enumLabel: null }
      ]
    },
    {
      slug: 'reverb',
      params: [
        { label: 'Mix', kind: 'float', value: 5, enumLabel: null },
        { label: 'Mix', kind: 'float', value: 60, enumLabel: null }
      ]
    }
  ]
};

const ctx: AutocompleteContext = buildAutocompleteContext([libEntry], specsBySlug([libEntry]), ['Lead', 'Ambient']);

describe('Preset Browser autocomplete', () => {
  it('suggests blocks + snippet tokens in block/token context', () => {
    const r = suggest(ctx, 'AM', 2);
    const labels = r.items.map((i) => i.label);
    expect(labels).toContain('AMP');
    expect(r.label).toBe('block / token');
  });

  it('suggests params (Type first) inside an open block', () => {
    const text = 'AMP(';
    const r = suggest(ctx, text, text.length);
    expect(r.label).toBe('Amp parameter');
    const paramLabels = r.items.filter((i) => i.kind !== 'close').map((i) => i.label);
    expect(paramLabels[0]).toBe('Type');
    expect(paramLabels).toContain('Gain');
    // the ) close-block action is offered
    expect(r.items.some((i) => i.kind === 'close')).toBe(true);
  });

  it('suggests values after NAME OP (value context)', () => {
    const text = 'AMP(Type=';
    const r = suggest(ctx, text, text.length);
    expect(r.label).toBe('value · Type');
    const vals = r.items.map((i) => i.label);
    expect(vals).toContain('USA Clean');
    expect(r.items.every((i) => i.kind === 'value')).toBe(true);
  });

  it('suggests numeric candidates (lo/25/50/75/hi) for numeric values', () => {
    const text = 'AMP(Gain>';
    const r = suggest(ctx, text, text.length);
    expect(r.items.map((i) => i.label)).toContain('2'); // lo
    expect(r.items.map((i) => i.label)).toContain('10'); // hi
  });

  it('suggests tags after tag:', () => {
    const text = 'tag:Lea';
    const r = suggest(ctx, text, text.length);
    expect(r.label).toBe('tag');
    expect(r.items.map((i) => i.label)).toEqual(['Lead']);
  });

  it('applyAcceptance splices a value insert and auto-advances with a comma', () => {
    const text = 'AMP(Type=';
    const item = suggest(ctx, text, text.length).items.find((i) => i.label === 'USA Clean')!;
    const res = applyAcceptance(item, text, text.length);
    expect(res.text).toBe('AMP(Type="USA Clean", ');
    expect(res.caret).toBe(res.text.length);
  });

  it('applyAcceptance close action closes the block and starts the next', () => {
    const text = 'AMP(Gain>7, ';
    const item = suggest(ctx, text, text.length).items.find((i) => i.kind === 'close')!;
    const res = applyAcceptance(item, text, text.length);
    expect(res.text).toBe('AMP(Gain>7) + ');
  });

  it('done action closes without a text change', () => {
    const item = { label: '✓ done', insert: '', fragLen: 0, hint: '', color: '', dot: false, kind: 'done' as const };
    const res = applyAcceptance(item, 'AMP + ', 6);
    expect(res.closed).toBe(true);
    expect(res.text).toBe('AMP + ');
  });

  it('tidyQuery trims dangling separators', () => {
    expect(tidyQuery('AMP + ')).toBe('AMP');
    expect(tidyQuery('AMP(Gain>7, ')).toBe('AMP(Gain>7');
  });

  describe('backtick-scoped autocomplete (unified query)', () => {
    it('findBacktickRegion returns the inner span containing the caret', () => {
      const text = 'clean `AM`'; // caret right after the typed fragment, before the closing tick
      expect(findBacktickRegion(text, 9)).toEqual({ start: 7, end: 9 });
    });

    it('findBacktickRegion returns null when the caret is outside any span', () => {
      expect(findBacktickRegion('clean `AMP` tone', 2)).toBeNull(); // in the leading free text
      expect(findBacktickRegion('clean `AMP` tone', 14)).toBeNull(); // in the trailing free text
    });

    it('findBacktickRegion returns null with only a lone, unclosed backtick', () => {
      // Real usage never hits this — onQueryInput auto-pairs a lone backtick — but the function
      // itself requires a matched pair and must not treat an unclosed tick as an open-ended span.
      expect(findBacktickRegion('clean `AM', 9)).toBeNull();
    });

    it('findBacktickRegion picks the containing span among multiple', () => {
      const text = '`AMP` mid `tag:Lead`';
      expect(findBacktickRegion(text, 15)).toEqual({ start: 11, end: 19 }); // inside the second span
    });

    it('findBacktickRegion includes the boundary positions right after/before the ticks', () => {
      const text = '`AMP`';
      expect(findBacktickRegion(text, 1)).toEqual({ start: 1, end: 4 }); // just after the open tick
      expect(findBacktickRegion(text, 4)).toEqual({ start: 1, end: 4 }); // just before the close tick
    });

    it('suggestInQuery delegates to suggest() scoped to the containing span', () => {
      const text = 'clean `AM`';
      const r = suggestInQuery(ctx, text, 9);
      expect(r.label).toBe('block / token');
      expect(r.items.map((i) => i.label)).toContain('AMP');
    });

    it('suggestInQuery returns no items when the caret is outside any backtick span', () => {
      const r = suggestInQuery(ctx, 'clean AM tone', 8);
      expect(r.items).toEqual([]);
      expect(r.label).toBe('');
    });

    it('applyAcceptance splice math is valid against the FULL text, no offset remapping needed', () => {
      // Auto-pairing means a closing tick always sits somewhere after the caret, here right after it.
      const text = 'clean `AMP(Type=`';
      const caret = 16; // right before the closing tick
      const item = suggestInQuery(ctx, text, caret).items.find((i) => i.label === 'USA Clean')!;
      const res = applyAcceptance(item, text, caret);
      expect(res.text).toBe('clean `AMP(Type="USA Clean", `');
    });
  });
});
