import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CURRENT_CACHE_SCHEMA, loadUsableProfile, type Doc, type Store } from 'forgefx-server/runtime';
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
  it('delegates to the lookup it is handed (the loader itself imports no runtime value)', () => {
    const store = fakeStore({});
    const seen: unknown[][] = [];
    const sentinel = profile(CURRENT_CACHE_SCHEMA);
    const load = makeDeviceCacheLoader(store, ((...args: unknown[]) => { seen.push(args); return sentinel; }) as unknown as typeof loadUsableProfile);
    expect(load('k')).toBe(sentinel);
    expect(seen).toEqual([[store, 'k']]);
  });

  it('stays off the eager bundle: forgefx-server/runtime is only ever imported as a type here', () => {
    // runtime.ts dynamic-imports the runtime so desktop/remote bundles never carry it; a value import in this
    // module (which is on the eager chain) would pull the whole runtime into the entry chunk.
    const src = readFileSync(new URL('./deviceCacheLoader.ts', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import\s.*from\s+'forgefx-server\/runtime';?\s*$/gm)].map((m) => m[0].trim());
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) expect(i).toMatch(/^import type /);
  });

  it('returns the stored BuiltCache for a known key when it carries the current schema', () => {
    const built = profile(CURRENT_CACHE_SCHEMA);
    const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/fm3-12-0': { data: built } }), loadUsableProfile);
    expect(load('fm3-12-0')).toBe(built);
  });

  it('returns null when no cache is stored (registry keeps the bundled profile)', () => {
    const load = makeDeviceCacheLoader(fakeStore({}), loadUsableProfile);
    expect(load('fm3-12-0')).toBeNull();
  });

  it('returns null for a tombstoned (deleted) doc', () => {
    const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/x': { data: profile(CURRENT_CACHE_SCHEMA), deleted: true } }), loadUsableProfile);
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
    makeDeviceCacheLoader(store, loadUsableProfile)('fm9-11-2');
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
        const load = makeDeviceCacheLoader(fakeStore({ 'deviceCaches/k': { data: profile(schema) } }), loadUsableProfile);
        expect(load('k')).toBeNull();
      });
    }

    it('does not delete a stale profile and picks it up again once it is current', () => {
      const docs: Record<string, { data: unknown; deleted?: boolean }> = { 'deviceCaches/k': { data: profile(undefined) } };
      const load = makeDeviceCacheLoader(fakeStore(docs), loadUsableProfile);
      expect(load('k')).toBeNull();
      expect(docs['deviceCaches/k']?.deleted).toBeUndefined(); // the loader never touches the store
      const rebuilt = profile(CURRENT_CACHE_SCHEMA);
      docs['deviceCaches/k'] = { data: rebuilt };
      expect(load('k')).toBe(rebuilt);
    });
  });
});
