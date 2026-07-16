import { describe, it, expect } from 'vitest';
import type { Doc, Store } from 'forgefx-server/runtime';
import { makeDeviceCacheLoader } from './deviceCacheLoader';

/** Minimal getDoc-only store over a fixture map keyed `${collection}/${id}`. */
function fakeStore(docs: Record<string, { data: unknown; deleted?: boolean }>): Pick<Store, 'getDoc'> {
  return {
    getDoc: (collection, id) => {
      const d = docs[`${collection}/${id}`];
      if (!d) return null;
      return { id, collection, data: d.data, updatedAt: 0, rev: 1, deleted: d.deleted } as Doc;
    }
  };
}

describe('makeDeviceCacheLoader', () => {
  it('returns the stored BuiltCache for a known key', () => {
    const built = { model: 0x11, firmware: '12.0', records: [] };
    const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/fm3-12-0': { data: built } }));
    expect(load('fm3-12-0')).toBe(built);
  });

  it('returns null when no cache is stored (registry keeps the bundled profile)', () => {
    const load = makeDeviceCacheLoader(fakeStore({}));
    expect(load('fm3-12-0')).toBeNull();
  });

  it('returns null for a tombstoned (deleted) doc', () => {
    const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/x': { data: { model: 1 }, deleted: true } }));
    expect(load('x')).toBeNull();
  });

  it('reads from the deviceCaches collection under the given key', () => {
    const seen: Array<[string, string]> = [];
    const store: Pick<Store, 'getDoc'> = {
      getDoc: (collection, id) => {
        seen.push([collection, id]);
        return null;
      }
    };
    makeDeviceCacheLoader(store)('fm9-11-2');
    expect(seen).toEqual([['deviceCaches', 'fm9-11-2']]);
  });
});
