// `*.runes.test.ts` → the `runes` vitest project, which compiles runes against the CLIENT svelte
// runtime (see vitest.config.ts) — needed because `deviceRealNames` is a `.svelte.ts` rune store.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlockTypeOption } from './types';

const blockTypes = vi.fn<(slug: string) => Promise<BlockTypeOption[]>>();
vi.mock('./forgefx', () => ({ forgefx: { blockTypes: (slug: string) => blockTypes(slug) } }));

const { deviceRealNames } = await import('./deviceRealNames.svelte');

const type = (over: Partial<BlockTypeOption> = {}): BlockTypeOption => ({
  value: 1,
  name: 'HIPOWER',
  manufacturer: null,
  basedOn: null,
  ...over
});

describe('device real names cache', () => {
  beforeEach(() => {
    blockTypes.mockReset();
  });

  it('returns "" before priming, then the joined manufacturer/basedOn text once resolved', async () => {
    blockTypes.mockResolvedValue([type({ manufacturer: 'Hiwatt', basedOn: 'Custom 100' })]);

    expect(deviceRealNames.realNameFor('amp', 'HIPOWER')).toBe('');

    deviceRealNames.prime(['amp']);

    await vi.waitFor(() => expect(deviceRealNames.realNameFor('amp', 'HIPOWER')).toBe('Hiwatt Custom 100'));
    // case-insensitive lookup, matching how model names are folded into the haystack lowercased.
    expect(deviceRealNames.realNameFor('amp', 'hipower')).toBe('Hiwatt Custom 100');
  });

  it('is idempotent per slug: does not refetch while cached or in flight', async () => {
    blockTypes.mockResolvedValue([type({ manufacturer: 'Hiwatt', basedOn: 'Custom 100' })]);

    deviceRealNames.prime(['drive']);
    deviceRealNames.prime(['drive']); // still in flight → skipped
    await vi.waitFor(() => expect(deviceRealNames.realNameFor('drive', 'HIPOWER')).toBe('Hiwatt Custom 100'));
    deviceRealNames.prime(['drive']); // resolved → skipped

    expect(blockTypes).toHaveBeenCalledTimes(1);
  });

  it('a model with no lineage in the catalog resolves to ""', async () => {
    blockTypes.mockResolvedValue([type({ name: 'MARSHALL', manufacturer: null, basedOn: null })]);

    deviceRealNames.prime(['cab']);

    await vi.waitFor(() => expect(blockTypes).toHaveBeenCalledTimes(1));
    expect(deviceRealNames.realNameFor('cab', 'MARSHALL')).toBe('');
  });

  it('an unknown model name in a resolved family resolves to ""', async () => {
    blockTypes.mockResolvedValue([type({ manufacturer: 'Hiwatt', basedOn: 'Custom 100' })]);

    deviceRealNames.prime(['reverb']);

    await vi.waitFor(() => expect(deviceRealNames.realNameFor('reverb', 'HIPOWER')).toBe('Hiwatt Custom 100'));
    expect(deviceRealNames.realNameFor('reverb', 'SOMETHING ELSE')).toBe('');
  });

  it('a fetch failure resolves to "" rather than throwing, and does not wedge future priming', async () => {
    blockTypes.mockRejectedValueOnce(new Error('network'));

    deviceRealNames.prime(['comp']);
    // Flush the rejection's `.catch` handler (a macrotask tick, not just a microtask, guarantees it has
    // run) before asserting settled 'error' state — `realNameFor` reads '' for BOTH 'loading' and 'error',
    // so a bare `waitFor` on it can't tell "still in flight" from "already failed".
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deviceRealNames.realNameFor('comp', 'ANYTHING')).toBe('');
    expect(blockTypes).toHaveBeenCalledTimes(1);

    // an 'error' family is retried on the next prime (unlike a resolved/loading one).
    blockTypes.mockResolvedValueOnce([type({ name: 'ANYTHING', manufacturer: 'Fender', basedOn: 'Deluxe' })]);
    deviceRealNames.prime(['comp']);
    await vi.waitFor(() => expect(deviceRealNames.realNameFor('comp', 'ANYTHING')).toBe('Fender Deluxe'));
    expect(blockTypes).toHaveBeenCalledTimes(2);
  });
});
