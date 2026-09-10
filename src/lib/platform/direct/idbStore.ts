// IndexedDB store backend for Browser Direct mode. ForgeFX's Store is
// synchronous by contract (see forgefx-server runtime/storeBackend.ts), so an
// in-memory mirror fronts IndexedDB: hydrate once at boot, mutate the mirror
// synchronously, flush write-behind. The working set is small — JSON docs, a
// version index, and content-addressed brotli blobs (a full FM3 backup ≈
// 1.6 MB compressed) — so holding it in memory is cheap.
//
// The codec matches the desktop's blob format: brotli (WASM — CompressionStream
// has no brotli) + sha256 content addressing, so versions/blobs sync to the
// same rows a desktop install produces, and local restores are portable.
import type { StoreBackend, StoreCodec, Doc, PresetVersion, JsonWriteOpts } from 'forgefx-server/runtime';

const DB = 'axis-direct-store';
const STORES = ['docs', 'blobs', 'json'] as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqAsPromise<T>(r: IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

const docKey = (collection: string, id: string) => `${collection}\u0000${id}`;
const VERSIONS_KEY = '\u0000versions'; // versions index lives in the 'json' store under a reserved key

export interface IdbStoreBackend extends StoreBackend {
  /** Await all pending write-behind flushes (call before page unload if you want certainty). */
  flush(): Promise<void>;
}

/** Hydrate the mirror from IndexedDB and return a synchronous StoreBackend over it. */
export async function createIdbStoreBackend(): Promise<IdbStoreBackend> {
  const db = await openDb();

  // ── hydrate ──
  const docs = new Map<string, Doc>();
  const blobs = new Map<string, Uint8Array>();
  const json = new Map<string, unknown>();
  {
    const t = db.transaction(STORES, 'readonly');
    const load = async <T>(store: (typeof STORES)[number], into: (k: string, v: T) => void) => {
      const s = t.objectStore(store);
      const keys = await reqAsPromise<IDBValidKey[]>(s.getAllKeys());
      const vals = await reqAsPromise<T[]>(s.getAll());
      keys.forEach((k, i) => into(String(k), vals[i]!));
    };
    await Promise.all([
      load<Doc>('docs', (k, v) => docs.set(k, v)),
      load<Uint8Array | ArrayBuffer>('blobs', (k, v) =>
        blobs.set(k, v instanceof Uint8Array ? v : new Uint8Array(v))),
      load<unknown>('json', (k, v) => json.set(k, v))
    ]);
  }
  let versions: PresetVersion[] = (json.get(VERSIONS_KEY) as PresetVersion[] | undefined) ?? [];
  json.delete(VERSIONS_KEY);

  // ── write-behind queue (serialized; IDB failures are logged, the mirror stays authoritative) ──
  let tail: Promise<void> = Promise.resolve();
  const enqueue = (store: (typeof STORES)[number], op: (s: IDBObjectStore) => IDBRequest) => {
    tail = tail
      .then(() => reqAsPromise<void>(op(db.transaction(store, 'readwrite').objectStore(store))))
      .catch((e) => console.warn('[direct] store flush failed:', e));
  };
  const persistVersions = () => enqueue('json', (s) => s.put(structuredClone(versions), VERSIONS_KEY));

  return {
    getDoc: (collection, id) => docs.get(docKey(collection, id)) ?? null,
    listDocs: (collection) => {
      const prefix = `${collection}\u0000`;
      return [...docs.entries()].filter(([k]) => k.startsWith(prefix)).map(([, d]) => d);
    },
    putDoc: (doc) => {
      docs.set(docKey(doc.collection, doc.id), doc);
      enqueue('docs', (s) => s.put(structuredClone(doc), docKey(doc.collection, doc.id)));
    },
    deleteDoc: (collection, id) => {
      docs.delete(docKey(collection, id));
      enqueue('docs', (s) => s.delete(docKey(collection, id)));
    },

    listVersions: () => [...versions],
    putVersion: (v) => {
      const i = versions.findIndex((x) => x.id === v.id);
      if (i >= 0) versions[i] = v;
      else versions.push(v);
      persistVersions();
    },
    deleteVersions: (ids) => {
      const drop = new Set(ids);
      versions = versions.filter((v) => !drop.has(v.id));
      persistVersions();
    },

    hasBlob: (key) => blobs.has(key),
    getBlob: (key) => blobs.get(key) ?? null,
    putBlob: (key, bytes) => {
      blobs.set(key, bytes);
      enqueue('blobs', (s) => s.put(bytes.slice(), key));
    },
    deleteBlob: (key) => {
      blobs.delete(key);
      enqueue('blobs', (s) => s.delete(key));
    },

    getJSON: <T>(key: string, fallback: T): T => (json.has(key) ? (json.get(key) as T) : fallback),
    putJSON: (key: string, value: unknown, _opts?: JsonWriteOpts) => {
      json.set(key, value);
      enqueue('json', (s) => s.put(structuredClone(value), key));
    },

    flush: () => tail
  };
}

/**
 * Browser StoreCodec: brotli via WASM + a synchronous sha256. Async factory —
 * the WASM module loads once at boot; the codec itself is then synchronous,
 * matching the Store contract.
 */
export async function createBrowserCodec(): Promise<StoreCodec> {
  const [{ default: brotliInit }, { sha256 }] = await Promise.all([
    import('brotli-wasm'),
    import('js-sha256')
  ]);
  const brotli = await brotliInit;
  return {
    pack: (bytes) => brotli.compress(bytes, { quality: 11 }),
    unpack: (packed) => brotli.decompress(packed),
    sha256Hex: (bytes) => sha256(bytes)
  };
}
