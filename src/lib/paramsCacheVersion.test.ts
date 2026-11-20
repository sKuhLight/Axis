import { describe, it, expect } from 'vitest';
import {
  PARAMS_DECODE_VERSION,
  wrapParams,
  unwrapParams,
  loadParamsCache,
  isStaleParamsVersion,
  dropStaleEmbeddedParams
} from './paramsCacheVersion';

// Synthetic decoded blocks (the shape is irrelevant to the version gate).
const blocks = (label: string) => [{ effectId: 1, slug: 'amp', params: [{ label, value: 5 }] }];

/** An in-memory stand-in for the IndexedDB key→value store, recording deletes. */
function fakeKv(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  const deleted: string[] = [];
  return {
    deleted,
    data,
    get: async (k: string) => data.get(k),
    del: async (k: string) => {
      deleted.push(k);
      data.delete(k);
    }
  };
}

describe('params cache envelope', () => {
  it('round-trips a current-version envelope', () => {
    const params = { 'dev:1': blocks('Gain') };
    expect(unwrapParams(wrapParams(params))).toBe(params);
    expect(wrapParams(params).v).toBe(PARAMS_DECODE_VERSION);
  });

  it('never serves a legacy (unversioned) map, another version, or a malformed blob', () => {
    const params = { 'dev:1': blocks('Gain') };
    expect(unwrapParams(params)).toBeNull(); // legacy: the bare id → blocks map
    expect(unwrapParams({ v: PARAMS_DECODE_VERSION - 1, params })).toBeNull(); // older decode
    expect(unwrapParams({ v: PARAMS_DECODE_VERSION + 1, params })).toBeNull(); // newer / unknown
    expect(unwrapParams({ v: PARAMS_DECODE_VERSION })).toBeNull(); // no params
    expect(unwrapParams({ v: PARAMS_DECODE_VERSION, params: 'x' })).toBeNull();
    for (const junk of [null, undefined, 3, 'cache', []]) expect(unwrapParams(junk)).toBeNull();
  });
});

describe('loadParamsCache (the library IndexedDB read path)', () => {
  it('serves a current-version entry and leaves it in the store', async () => {
    const params = { 'dev:1': blocks('Gain') };
    const kv = fakeKv({ 'lib.params': wrapParams(params) });
    expect(await loadParamsCache(kv, 'lib.params')).toEqual(params);
    expect(kv.deleted).toEqual([]);
  });

  it('does NOT serve an old-version entry: it reads as absent and is deleted', async () => {
    const kv = fakeKv({ 'lib.params': { v: PARAMS_DECODE_VERSION - 1, params: { 'dev:1': blocks('Hicut (linear decode)') } } });
    expect(await loadParamsCache(kv, 'lib.params')).toBeNull();
    expect(kv.deleted).toEqual(['lib.params']);
    expect(kv.data.has('lib.params')).toBe(false);
  });

  it('does NOT serve a legacy unversioned entry (written before versioning existed): absent + deleted', async () => {
    const kv = fakeKv({ 'lib.params': { 'dev:1': blocks('Hicut (linear decode)') } });
    expect(await loadParamsCache(kv, 'lib.params')).toBeNull();
    expect(kv.deleted).toEqual(['lib.params']);
  });

  it('a missing entry is simply absent (nothing to delete)', async () => {
    const kv = fakeKv();
    expect(await loadParamsCache(kv, 'lib.params')).toBeNull();
    expect(kv.deleted).toEqual([]);
  });
});

describe('embedded params in persisted file summaries', () => {
  const files = () => [
    { id: 'file:a.syx', folder: 'F', summary: { number: 0, name: 'A', params: blocks('Gain') } },
    { id: 'file:b.syx', summary: { number: 1, name: 'B', params: blocks('Drive') } },
    { id: 'file:c.syx', summary: { number: 2, name: 'C' } }
  ];

  it('treats a missing or other decode-version marker as stale', () => {
    expect(isStaleParamsVersion(null)).toBe(true);
    expect(isStaleParamsVersion(undefined)).toBe(true);
    expect(isStaleParamsVersion(PARAMS_DECODE_VERSION - 1)).toBe(true);
    expect(isStaleParamsVersion(String(PARAMS_DECODE_VERSION))).toBe(true); // wrong type
    expect(isStaleParamsVersion(PARAMS_DECODE_VERSION)).toBe(false);
  });

  it('drops the embedded params when the stored marker is stale (old version or none), keeping everything else', () => {
    for (const marker of [null, PARAMS_DECODE_VERSION - 1]) {
      const input = files();
      const snapshot = JSON.stringify(input);
      const { items, stale } = dropStaleEmbeddedParams(input, marker);
      expect(stale).toBe(true);
      expect(items.map((i) => i.summary.params)).toEqual([undefined, undefined, undefined]);
      expect(items.map((i) => [i.id, i.summary.name, i.folder])).toEqual([
        ['file:a.syx', 'A', 'F'],
        ['file:b.syx', 'B', undefined],
        ['file:c.syx', 'C', undefined]
      ]);
      expect(JSON.stringify(input)).toBe(snapshot); // input untouched
    }
  });

  it('keeps the params (same references) when the marker is current', () => {
    const input = files();
    const { items, stale } = dropStaleEmbeddedParams(input, PARAMS_DECODE_VERSION);
    expect(stale).toBe(false);
    expect(items).toBe(input);
  });
});
