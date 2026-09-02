// Reactivity contract for the library store's heavy caches (`*.runes.test.ts` → the `runes` vitest
// project, which compiles runes against the CLIENT svelte runtime; see vitest.config.ts).
//
// `#paramsCache` / `#fileBytes` are `$state.raw` ON PURPOSE — a deep `$state` proxy made the Preset
// Browser's spec/autocomplete derivations ~85x slower (every param read paying a proxy trap), which is
// what stalled the query input for seconds on first click. Raw buys that back but moves the burden onto
// the writers: they MUST reassign the field, because an in-place write no longer notifies anything.
// These tests pin both halves of that trade — contents stay unproxied, reassignment still propagates.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DecodedBlock, DecodedParam, PresetSummary } from './types';
import type { LibEntry } from './library.svelte';
import { fallbackSwatch, tagSwatchCss } from './tagColors';

// ── module mocks ────────────────────────────────────────────────────────────────────────────────
// The store builds its singleton at import time and reaches for the network, IndexedDB and
// localStorage on the way. Everything below exists to let that constructor run in node.
const presetParams = vi.fn<(n: number) => Promise<{ blocks: DecodedBlock[] }>>();
const decodePresetFile = vi.fn<(buf: ArrayBuffer) => Promise<PresetSummary>>();
const device = vi.fn<() => Promise<unknown>>();
const presetSummary = vi.fn<(n: number, full: number) => Promise<PresetSummary>>();
const presetLocations = vi.fn<() => Promise<{ count: number; locations: { location: number; code: string | null; name: string; isEmpty: boolean }[] }>>();

vi.mock('./forgefx', () => ({
  forgefx: {
    presetParams: (n: number) => presetParams(n),
    decodePresetFile: (buf: ArrayBuffer) => decodePresetFile(buf),
    device: () => device(),
    presetSummary: (n: number, full: number) => presetSummary(n, full),
    presetLocations: () => presetLocations(),
    putDoc: vi.fn(async () => ({})),
    listDocs: vi.fn(async () => ({ docs: [] })),
    deleteDoc: vi.fn(async () => ({}))
  }
}));
// isWebBuild() → true short-circuits the constructor's config-publish block.
vi.mock('./buildMode', () => ({ isWebBuild: () => true }));
// available() → false skips the IndexedDB restore AND every persist call.
vi.mock('./idb', () => ({ idb: { available: () => false, get: async () => undefined, set: async () => undefined } }));
vi.mock('./cabIrsCache', () => ({ refreshCabIrsCache: async () => {} }));
vi.mock('./syncBus', () => ({ notifyMutation: () => {} }));

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

// Dynamic import so the stubs above are in place before the singleton is constructed.
const { library } = await import('./library.svelte');

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
const param = (label: string, value: number): DecodedParam => ({ paramId: 1, name: label.toUpperCase(), label, kind: 'float', raw: value * 100, value });
const block = (slug: string, ...labels: string[]): DecodedBlock => ({
  effectId: 106,
  family: slug,
  slug,
  instance: 1,
  typeName: 'USA Clean',
  params: labels.map((l, i) => param(l, i + 1))
});
const summary = (number: number, name: string): PresetSummary => ({
  number,
  name,
  model: 'AxisFx3',
  crcValid: true,
  crc: number,
  scenes: ['Scene 1'],
  blocks: [{ effectId: 106, slug: 'amp', name: 'Amp 1', instance: 1 }],
  models: { amp: ['USA Clean'] },
  amps: ['USA Clean']
});
// The store is a module singleton and its param cache has no public reset, so every test claims a
// fresh slot number — reusing an id would hit the cache left behind by an earlier test.
let nextNumber = 1;
const deviceEntry = (): LibEntry => {
  const number = nextNumber++;
  return { id: `dev:${number}`, source: 'device', summary: summary(number, `Preset ${number}`), fav: false };
};

/** Node 20 has no `Promise.withResolvers`. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  presetParams.mockReset();
  decodePresetFile.mockReset();
  device.mockReset();
  presetSummary.mockReset();
  presetLocations.mockReset();
  library.entries = [];
  library.paramQueries = [];
});

describe('paramsCache is raw, not deep-proxied', () => {
  it('hands back the exact object it was given (no proxy wrapper)', async () => {
    const entry = deviceEntry();
    library.entries = [entry];
    const blocks = [block('amp', 'Gain')];
    presetParams.mockResolvedValue({ blocks });

    await library.hydrateParams(entry.id);

    // Under deep `$state` this is a Proxy and `toBe` fails; under `$state.raw` it is the same object.
    // Reference identity is the whole point: it means downstream param walks touch plain properties.
    expect(library.paramsOf(entry)).toBe(blocks);
    expect(library.paramsOf(entry)?.[0]).toBe(blocks[0]);
    expect(library.paramsOf(entry)?.[0].params[0]).toBe(blocks[0].params[0]);
  });
});

describe('reassignment still notifies derived readers', () => {
  it('hydrateParams updates allParamFields and paramsReady', async () => {
    const entry = deviceEntry();
    library.entries = [entry];
    expect(library.allParamFields).toEqual([]);
    expect(library.paramsReady).toBe(false);

    presetParams.mockResolvedValue({ blocks: [block('amp', 'Gain', 'Master')] });
    await library.hydrateParams(entry.id);

    expect(library.allParamFields).toEqual(['Gain', 'Master']);
    expect(library.paramsReady).toBe(true);
  });

  it('a param query over freshly hydrated params matches', async () => {
    const entry = deviceEntry();
    library.entries = [entry];
    presetParams.mockResolvedValue({ blocks: [block('amp', 'Gain')] });
    await library.hydrateParams(entry.id);

    library.paramQueries = [{ slug: 'amp', field: 'Gain', op: 'gt', value: 0.5 }];
    expect(library.filtered.map((e) => e.id)).toEqual([entry.id]);

    library.paramQueries = [{ slug: 'amp', field: 'Gain', op: 'gt', value: 99 }];
    expect(library.filtered).toEqual([]);
  });

  it('notifies after EACH hydration, not only once the last one lands', async () => {
    const [first, second] = [deviceEntry(), deviceEntry()];
    library.entries = [first, second];
    // Gate each fetch so we can observe the derived state between hydrations — hydrating a library
    // one preset at a time must publish progressively, which is only true while every write
    // reassigns the raw cache.
    const gates = new Map([
      [first.summary.number, deferred<{ blocks: DecodedBlock[] }>()],
      [second.summary.number, deferred<{ blocks: DecodedBlock[] }>()]
    ]);
    presetParams.mockImplementation((n) => gates.get(n)!.promise);

    const pending = Promise.all([library.hydrateParams(first.id), library.hydrateParams(second.id)]);

    gates.get(first.summary.number)!.resolve({ blocks: [block('amp', 'Gain')] });
    await vi.waitFor(() => expect(library.allParamFields).toEqual(['Gain']));
    expect(library.paramsReady).toBe(false); // second entry still outstanding

    gates.get(second.summary.number)!.resolve({ blocks: [block('amp', 'Master')] });
    await pending;

    expect(library.allParamFields).toEqual(['Gain', 'Master']);
    expect(library.paramsReady).toBe(true);
  });
});

describe('fileBytes lifecycle survives the raw switch', () => {
  const syx = (name: string, bytes: number[]) => new File([new Uint8Array(bytes)], name);

  it('round-trips imported bytes and clears them on remove', async () => {
    decodePresetFile.mockResolvedValue(summary(0, 'Imported'));

    const res = await library.importFiles([syx('a.syx', [1, 2, 3]), syx('b.syx', [4, 5])], 'rig');
    expect(res).toEqual({ ok: 2, failed: 0 });
    expect(library.fileBytes('file:rig/a.syx')).toEqual(new Uint8Array([1, 2, 3]));
    expect(library.fileBytes('file:rig/b.syx')).toEqual(new Uint8Array([4, 5]));

    library.removeFile('file:rig/a.syx');
    expect(library.fileBytes('file:rig/a.syx')).toBeNull();
    expect(library.fileBytes('file:rig/b.syx')).toEqual(new Uint8Array([4, 5]));

    library.removeFolder('rig');
    expect(library.fileBytes('file:rig/b.syx')).toBeNull();
    expect(library.entries).toEqual([]);
  });

  it('skips non-.syx files without caching bytes', async () => {
    decodePresetFile.mockResolvedValue(summary(0, 'Imported'));
    const res = await library.importFiles([syx('notes.txt', [9])]);
    expect(res).toEqual({ ok: 0, failed: 0 });
    expect(library.fileBytes('file:notes.txt')).toBeNull();
  });
});

// `buildCache` rebuilds the device index from the hardware. A slot the user cleared on the FM3 (or
// AM4) comes back as an empty/<EMPTY> preset, so a rescan must DROP the stale cached name — not just
// skip re-adding it (which left the ghost entry behind and kept cleared slots showing names).
describe('buildCache drops presets cleared on the device', () => {
  const v2Deep = { apiVersion: 2, model: 'FM3', capabilities: { presets: { canScanNames: false, canDeepScan: true, count: 512 } } };
  const v2Name = { apiVersion: 2, model: 'AM4', capabilities: { presets: { canScanNames: true, canDeepScan: false, count: 512 } } };
  const emptySummary = (n: number): PresetSummary => ({ number: n, name: '<EMPTY>', model: 'FM3', crcValid: true, scenes: [], blocks: [], models: {}, amps: [] });

  it('full scan removes a cached entry whose slot now reads empty', async () => {
    library.entries = [deviceEntry()];
    const n = library.entries[0].summary.number;
    device.mockResolvedValue(v2Deep);
    presetSummary.mockResolvedValue(emptySummary(n));

    await library.buildCache(n, n);

    expect(library.entries).toEqual([]);
  });

  // The real FM3 "clear preset" leaves the NAME header intact (still decodes the old name) while the
  // grid empties to zero blocks — so the cleared signal is `blocks: []`, not an empty name.
  it('full scan drops a cleared slot that keeps its old name but has no blocks', async () => {
    library.entries = [deviceEntry()];
    const n = library.entries[0].summary.number;
    device.mockResolvedValue(v2Deep);
    presetSummary.mockResolvedValue({
      number: n,
      name: '====== Plexis ======',
      model: 'FM3',
      crcValid: true,
      crc: 21527,
      scenes: ['', '', '', '', '', '', '', ''],
      blocks: [],
      models: {},
      amps: []
    });

    await library.buildCache(n, n);

    expect(library.entries).toEqual([]);
  });

  it('full scan keeps the cached entry when the slot read throws (transient, not a clear)', async () => {
    library.entries = [deviceEntry()];
    const n = library.entries[0].summary.number;
    device.mockResolvedValue(v2Deep);
    presetSummary.mockRejectedValue(new Error('busy'));

    await library.buildCache(n, n);

    expect(library.entries.map((e) => e.summary.number)).toContain(n);
  });

  it('name scan removes a cached entry whose stored location comes back empty', async () => {
    library.entries = [deviceEntry()];
    const n = library.entries[0].summary.number;
    device.mockResolvedValue(v2Name);
    presetLocations.mockResolvedValue({ count: 1, locations: [{ location: n, code: null, name: '', isEmpty: true }] });

    await library.buildCache(n, n);

    expect(library.entries).toEqual([]);
  });
});

// The live current-preset poll hands the store a fresh slot name. `clearSlotIfEmpty` turns a cleared
// slot (device reads `<EMPTY>`/blank) into an immediate cache drop — the path that fixes "I cleared a
// preset on the hardware but Axis still shows its old name" without waiting for a full rescan.
describe('clearSlotIfEmpty drops a slot the device reports empty', () => {
  it('drops a cached entry whose fresh name is the <EMPTY> sentinel', () => {
    library.entries = [deviceEntry()];
    const n = library.entries[0].summary.number;
    library.cacheBuilt = true;

    library.clearSlotIfEmpty(n, '<EMPTY>');

    expect(library.entries).toEqual([]);
    expect(library.slotIsEmpty(n)).toBe(true);
  });

  it('drops a cached entry whose fresh name is blank', () => {
    library.entries = [deviceEntry()];
    const n = library.entries[0].summary.number;
    library.cacheBuilt = true;

    library.clearSlotIfEmpty(n, '   ');

    expect(library.entries).toEqual([]);
  });

  it('leaves a non-empty name untouched', () => {
    const entry = deviceEntry();
    library.entries = [entry];
    library.cacheBuilt = true;

    library.clearSlotIfEmpty(entry.summary.number, 'RealName');

    expect(library.entries.map((e) => e.summary.name)).toEqual([entry.summary.name]);
  });

  it('slotIsEmpty is false before any scan, even for an absent slot', () => {
    library.entries = [];
    library.cacheBuilt = false;
    expect(library.slotIsEmpty(7)).toBe(false);
  });
});

// `allTags` walks `tags` with no idea whether its keys still refer to a preset that exists, so a
// removed import used to keep feeding ghost tags to every consumer of it — the Frequent Tags row,
// the monolith's quick tags, `tag:` autocomplete and the tag picker.
describe('removing a preset forgets its tags', () => {
  const syx = (name: string, bytes: number[]) => new File([new Uint8Array(bytes)], name);

  it('removeFile drops that preset\'s tags and invalidates allTags', async () => {
    decodePresetFile.mockResolvedValue(summary(0, 'Imported'));
    await library.importFiles([syx('ghost.syx', [1]), syx('keep.syx', [2])], 'rig');
    library.tags = {};
    library.addTag('file:rig/ghost.syx', 'GhostOnly');
    library.addTag('file:rig/keep.syx', 'KeptTag');
    expect(library.allTags).toContain('GhostOnly');

    library.removeFile('file:rig/ghost.syx');

    expect(library.tags['file:rig/ghost.syx']).toBeUndefined();
    expect(library.allTags).not.toContain('GhostOnly');
    expect(library.allTags).toContain('KeptTag'); // the surviving preset is untouched
  });

  it('removeFolder drops the tags of every preset in it', async () => {
    decodePresetFile.mockResolvedValue(summary(0, 'Imported'));
    await library.importFiles([syx('one.syx', [1]), syx('two.syx', [2])], 'doomed');
    await library.importFiles([syx('safe.syx', [3])], 'other');
    library.tags = {};
    library.addTag('file:doomed/one.syx', 'DoomedA');
    library.addTag('file:doomed/two.syx', 'DoomedB');
    library.addTag('file:other/safe.syx', 'SurvivorTag');

    library.removeFolder('doomed');

    expect(library.allTags).not.toContain('DoomedA');
    expect(library.allTags).not.toContain('DoomedB');
    expect(library.allTags).toContain('SurvivorTag');
  });

  it('removing an untagged preset leaves the tag map alone', async () => {
    decodePresetFile.mockResolvedValue(summary(0, 'Imported'));
    await library.importFiles([syx('bare.syx', [1])], 'plain');
    library.tags = { 'dev:900': ['UnrelatedTag'] };

    library.removeFile('file:plain/bare.syx');

    expect(library.tags).toEqual({ 'dev:900': ['UnrelatedTag'] });
  });
});

describe('tag colors registry round-trip (persist → load → applyRemoteConfig)', () => {
  it('addTag claims a swatch for a brand-new tag, colorOf reflects the claimed index', () => {
    library.tags = {};
    library.tagColors = {};
    library.addTag('dev:rt1', 'RoundTripLead');
    const idx = library.tagColors['RoundTripLead'];
    expect(idx).toBeTypeOf('number');
    expect(library.colorOf('RoundTripLead')).toBe(tagSwatchCss(idx));
  });

  it('setTagColor overrides a claimed swatch and colorOf reflects it', () => {
    library.tags = {};
    library.tagColors = {};
    library.addTag('dev:rt2', 'RoundTripBass');
    library.setTagColor('RoundTripBass', 7);
    expect(library.tagColors['RoundTripBass']).toBe(7);
    expect(library.colorOf('RoundTripBass')).toBe(tagSwatchCss(7));
  });

  it('colorOf falls back to a deterministic hash for a tag with no stored assignment', () => {
    library.tagColors = {};
    expect(library.colorOf('NeverClaimed')).toBe(tagSwatchCss(fallbackSwatch('NeverClaimed')));
  });

  // renameTag reassigns BOTH nested maps. `allTags` derives off `tags`, so this is exactly the
  // shape that fails silently if a writer mutates in place instead of reassigning.
  it('renameTag rewrites every preset and invalidates allTags', () => {
    library.tags = { 'dev:r1': ['RenameCruch', 'RenameClean'], 'dev:r2': ['RenameCruch'] };
    library.tagColors = {};
    expect(library.allTags).toContain('RenameCruch');

    library.renameTag('RenameCruch', 'RenameCrunch');

    expect(library.tags).toEqual({
      'dev:r1': ['RenameCrunch', 'RenameClean'],
      'dev:r2': ['RenameCrunch']
    });
    expect(library.allTags).toContain('RenameCrunch');
    expect(library.allTags).not.toContain('RenameCruch');
  });

  it('renameTag carries the tag color to the new name', () => {
    library.tags = { 'dev:r3': ['RenameColored'] };
    library.tagColors = { RenameColored: 5 };
    library.renameTag('RenameColored', 'RenameRecolored');
    expect(library.tagColors).toEqual({ RenameRecolored: 5 });
    expect(library.colorOf('RenameRecolored')).toBe(tagSwatchCss(5));
  });

  it('renameTag merges onto an existing tag without duplicating it', () => {
    library.tags = { 'dev:r4': ['RenameMergeA', 'RenameMergeB'], 'dev:r5': ['RenameMergeA'] };
    library.tagColors = { RenameMergeA: 1, RenameMergeB: 6 };
    library.renameTag('RenameMergeA', 'RenameMergeB');
    expect(library.tags).toEqual({ 'dev:r4': ['RenameMergeB'], 'dev:r5': ['RenameMergeB'] });
    expect(library.tagColors).toEqual({ RenameMergeB: 6 }); // the survivor keeps its own color
  });

  it('renameTag ignores an empty name and a tag no preset carries', () => {
    library.tags = { 'dev:r6': ['RenameKeep'] };
    library.renameTag('RenameKeep', '   ');
    expect(library.tags).toEqual({ 'dev:r6': ['RenameKeep'] });
    library.renameTag('RenameAbsent', 'RenameWhatever');
    expect(library.tags).toEqual({ 'dev:r6': ['RenameKeep'] });
  });

  it('applyRemoteConfig("tagColors", …) adopts a live push and persists it, without re-broadcasting', () => {
    library.tagColors = {};
    library.applyRemoteConfig('tagColors', { RoundTripLive: 4 });
    expect(library.tagColors).toEqual({ RoundTripLive: 4 });
    expect(JSON.parse(localStorage.getItem('axs.lib.tagColors')!)).toEqual({ RoundTripLive: 4 });
  });
});
