import { describe, it, expect } from 'vitest';
import { CURRENT_CACHE_SCHEMA, type Doc, type Store } from 'forgefx-server/runtime';
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

/** A synthetic profile stamped with the given schema (undefined = unstamped, like a profile from before
 *  profiles were versioned). */
function profile(schema: unknown, extra: Record<string, unknown> = {}) {
  const meta: Record<string, unknown> = { recordCount: 3, source: 'live' };
  if (schema !== undefined) meta.schema = schema;
  return { model: 0x11, firmware: '12.0', meta, ...extra };
}

describe('makeDeviceCacheLoader', () => {
  it('returns the stored BuiltCache for a known key when it carries the current schema', () => {
    const built = profile(CURRENT_CACHE_SCHEMA);
    const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/fm3-12-0': { data: built } }));
    expect(load('fm3-12-0')).toBe(built);
  });

  it('returns null when no cache is stored (registry keeps the bundled profile)', () => {
    const load = makeDeviceCacheLoader(fakeStore({}));
    expect(load('fm3-12-0')).toBeNull();
  });

  it('returns null for a tombstoned (deleted) doc', () => {
    const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/x': { data: profile(CURRENT_CACHE_SCHEMA), deleted: true } }));
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

  describe('stale profiles are not applied', () => {
    const stale: Array<[string, unknown]> = [
      ['an unstamped profile', undefined],
      ['an older schema', CURRENT_CACHE_SCHEMA - 1],
      ['a newer schema than this build understands', CURRENT_CACHE_SCHEMA + 1],
      ['a non-numeric stamp', 'one']
    ];
    for (const [label, schema] of stale) {
      it(`returns null for ${label}`, () => {
        const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/k': { data: profile(schema) } }));
        expect(load('k')).toBeNull();
      });
    }

    it('does not delete a stale profile and picks it up again once it is current', () => {
      const docs: Record<string, { data: unknown; deleted?: boolean }> = { 'deviceCaches/k': { data: profile(undefined) } };
      const load = makeDeviceCacheLoader(fakeStore(docs));
      expect(load('k')).toBeNull();
      expect(docs['deviceCaches/k']?.deleted).toBeUndefined(); // the loader never touches the store
      const rebuilt = profile(CURRENT_CACHE_SCHEMA);
      docs['deviceCaches/k'] = { data: rebuilt };
      expect(load('k')).toBe(rebuilt);
    });
  });
});
