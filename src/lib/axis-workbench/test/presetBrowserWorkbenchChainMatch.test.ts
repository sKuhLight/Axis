import { describe, expect, it } from 'vitest';
import { matchingChainChips } from '../presetBrowser/presetBrowserWorkbenchChainMatch';
import type { AxisPbRowBlockChip } from '../presetBrowser/presetBrowserWorkbenchRowChips';

function chip(over: Partial<AxisPbRowBlockChip> = {}): AxisPbRowBlockChip {
  return { slug: 'amp', color: '#d98a2b', cat: 'Amp', type: '5153 100W Blue', label: 'Amp · 5153 100W Blue', title: 'Amp 1 — 5153 100W Blue', ...over };
}

describe('matchingChainChips', () => {
  it('no active search → hides the chain entirely (nothing to highlight)', () => {
    const chips = [chip(), chip({ slug: 'delay', cat: 'Delay', type: null, label: 'Delay', title: 'Delay 1' })];
    expect(matchingChainChips(chips, [], '')).toEqual([]);
  });

  it('a BLOCK() condition keeps only the chip for that family, regardless of TYPE', () => {
    const amp = chip();
    const delay = chip({ slug: 'delay', cat: 'Delay', type: null, label: 'Delay', title: 'Delay 1' });
    const result = matchingChainChips([amp, delay], [{ kind: 'block', block: 'delay', params: [] }], '');
    expect(result).toEqual([delay]);
  });

  it('a BLOCK(TYPE=...) condition still keeps the whole family chip (the row already passed the real TYPE check)', () => {
    const amp = chip();
    const result = matchingChainChips(
      [amp],
      [{ kind: 'block', block: 'amp', params: [{ name: 'TYPE', op: '=', val: '5153' }] }],
      ''
    );
    expect(result).toEqual([amp]);
  });

  it('free text matches against category, type, and slug', () => {
    const amp = chip();
    const delay = chip({ slug: 'delay', cat: 'Delay', type: 'Vintage Digital', label: 'Delay · Vintage Digital', title: 'Delay 1 — Vintage Digital' });
    expect(matchingChainChips([amp, delay], [], '5153')).toEqual([amp]);
    expect(matchingChainChips([amp, delay], [], 'vintage')).toEqual([delay]);
    expect(matchingChainChips([amp, delay], [], 'delay')).toEqual([delay]); // matches the slug
  });

  it('a tag/name/other condition with no free text and no block condition still hides the chain', () => {
    const amp = chip();
    expect(matchingChainChips([amp], [{ kind: 'tag', val: 'Lead' }], '')).toEqual([]);
  });

  it('a search term that matches nothing in the chain (e.g. it matched via name/tags) returns no chips', () => {
    const amp = chip();
    expect(matchingChainChips([amp], [], 'studio')).toEqual([]);
  });
});
