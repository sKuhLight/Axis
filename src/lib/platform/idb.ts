// Minimal IndexedDB key→value store. The library cache (full per-preset params, IR lists) is far larger
// than the ~5 MB localStorage quota, so the heavy parts live here; small metadata stays in localStorage.
const DB = 'axis-cache';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

export const idb = {
  get: <T>(key: string): Promise<T | undefined> => tx<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined),
  set: (key: string, val: unknown): Promise<unknown> => tx('readwrite', (s) => s.put(val, key)).catch(() => undefined),
  del: (key: string): Promise<unknown> => tx('readwrite', (s) => s.delete(key)).catch(() => undefined),
  /** Is IndexedDB usable in this context? (Electron/web: yes; some sandboxed contexts: no.) */
  available: (): boolean => typeof indexedDB !== 'undefined'
};
