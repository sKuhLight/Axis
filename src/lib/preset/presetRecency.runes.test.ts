// `*.runes.test.ts` → the `runes` vitest project, which compiles rune modules against the CLIENT svelte
// runtime (see vitest.config.ts). The reactivity assertion at the bottom is the reason this can't live in
// the node project: under the server runtime `$state` is inert and it would pass vacuously.

import { describe, it, expect, beforeEach, vi } from 'vitest';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear()
  } as Storage;
}
vi.stubGlobal('localStorage', memoryStorage());

const KEY = 'axs.presets.lastLoaded';
const PICKER_KEY = 'axs.presets';

// Dynamic import so the stub is in place before the singleton's constructor reads storage.
const { presetRecency, pruneRecency, seedFromPickerRecents } = await import('./presetRecency.svelte');

describe('preset recency map', () => {
  beforeEach(() => {
    localStorage.clear();
    presetRecency.map = {};
  });

  it('stamps a load and reads it back, keyed by entry id', () => {
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
    presetRecency.record('dev:12');
    presetRecency.record('file:pad');

    expect(presetRecency.at('dev:12')).toBe(Date.now());
    expect(presetRecency.at('file:pad')).toBe(Date.now());
    // A device slot and an imported file of the same preset are distinct keys.
    expect(presetRecency.at('local:Folder/Lead.syx')).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ 'dev:12': Date.now(), 'file:pad': Date.now() });
    vi.useRealTimers();
  });

  it('ignores an empty entry id', () => {
    presetRecency.record('');
    expect(presetRecency.map).toEqual({});
  });

  it('keeps only the newest 500 stamps', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 600; i++) many[`dev:${i}`] = i; // higher index = newer
    const pruned = pruneRecency(many);

    expect(Object.keys(pruned)).toHaveLength(500);
    expect(pruned['dev:599']).toBe(599); // newest kept
    expect(pruned['dev:100']).toBe(100); // oldest survivor — indices 0..99 are the 100 dropped
    expect(pruned['dev:99']).toBeUndefined();
  });

  it('leaves a map at or under the cap untouched', () => {
    const map = { 'dev:1': 10, 'dev:2': 20 };
    expect(pruneRecency(map)).toBe(map);
  });

  it('seeds from the picker MRU newest-first, below any real load', () => {
    const seeded = seedFromPickerRecents({ rec: [{ n: 7, name: 'A' }, { n: 3, name: 'B' }, { n: 9, name: 'C' }] });

    expect(Object.keys(seeded)).toEqual(['dev:7', 'dev:3', 'dev:9']);
    expect(seeded['dev:7']).toBeGreaterThan(seeded['dev:3']!);
    expect(seeded['dev:3']).toBeGreaterThan(seeded['dev:9']!);
    // Every seeded stamp is in the past, so a real load always sorts above it.
    expect(seeded['dev:7']).toBeLessThan(Date.now());
  });

  it('drops malformed picker entries and a missing rec array', () => {
    expect(seedFromPickerRecents({ rec: [{ n: 4 }, { n: -1 }, { n: 1.5 }, { name: 'x' }, null] })).toEqual({
      'dev:4': expect.any(Number)
    });
    expect(seedFromPickerRecents(null)).toEqual({});
    expect(seedFromPickerRecents({})).toEqual({});
    expect(seedFromPickerRecents({ rec: 'nope' })).toEqual({});
  });
});

describe('preset recency persistence', () => {
  beforeEach(() => localStorage.clear());

  // The singleton loads at import time, so the load/seed path is re-exercised through a fresh module
  // instance per case (vi.resetModules + dynamic import).
  async function freshStore() {
    vi.resetModules();
    return (await import('./presetRecency.svelte')).presetRecency;
  }

  it('seeds once from the picker MRU when no map has been stored yet', async () => {
    localStorage.setItem(PICKER_KEY, JSON.stringify({ rec: [{ n: 5, name: 'Lead' }], fav: [] }));

    const store = await freshStore();

    expect(store.at('dev:5')).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveProperty('dev:5');
  });

  it('does not re-seed once a map exists, even an empty one', async () => {
    localStorage.setItem(PICKER_KEY, JSON.stringify({ rec: [{ n: 5, name: 'Lead' }] }));
    localStorage.setItem(KEY, JSON.stringify({}));

    expect((await freshStore()).at('dev:5')).toBeNull();
  });

  it('degrades a corrupt or stale stored shape to an empty map instead of throwing', async () => {
    localStorage.setItem(KEY, '{not json');
    expect((await freshStore()).map).toEqual({});

    localStorage.setItem(KEY, JSON.stringify(['dev:1', 'dev:2']));
    expect((await freshStore()).map).toEqual({});

    // Per-entry validation: the good key survives, the junk ones don't.
    localStorage.setItem(KEY, JSON.stringify({ 'dev:1': 123, 'dev:2': 'later', 'dev:3': null, 'dev:4': NaN }));
    expect((await freshStore()).map).toEqual({ 'dev:1': 123 });
  });

  // A test file can't declare `$derived` (rune_outside_svelte), so the reactivity contract is pinned at
  // its source instead: `record` REASSIGNS `map`. That is what makes the Preset Browser panel's
  // `$derived` data view re-sort on load, and it holds even for a memoized/raw consumer.
  it('reassigns the map on record rather than mutating it in place', async () => {
    const store = await freshStore();
    const before = store.map;

    store.record('dev:1');

    expect(store.map).not.toBe(before);
    expect(before['dev:1']).toBeUndefined(); // the old object was left alone
    expect(store.at('dev:1')).toBeGreaterThan(0);
  });
});
