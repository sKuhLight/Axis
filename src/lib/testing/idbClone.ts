// Test doubles for the IndexedDB write path. Production code never imports this file.
//
// IndexedDB stores values with the structured clone algorithm, which cannot clone a Proxy — and a Svelte 5
// `$state` record/array IS a (deep, lazily created) Proxy. A write of such a value throws DataCloneError, and
// the app's idb.set swallowed it, so the data silently never persisted. These helpers make that failure LOUD
// in unit tests: `deepProxy` emulates a `$state` proxy, `cloneCheckedSet` behaves like idb.set but runs
// structuredClone on whatever it is handed (exactly what IndexedDB does) and rejects when that throws.

/** Emulate a Svelte `$state` value: every object/array read through it comes back wrapped in a Proxy too. */
export function deepProxy<T extends object>(value: T): T {
  return new Proxy(value, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      return v !== null && typeof v === 'object' ? deepProxy(v as object) : v;
    }
  });
}

/** True when structuredClone accepts the value (i.e. IndexedDB could store it). */
export function isStructuredCloneable(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/** An idb.set stand-in: clones what it is given (like IndexedDB), records the clone, rejects on DataCloneError. */
export function cloneCheckedSet(store: Map<string, unknown> = new Map()) {
  const set = async (key: string, value: unknown): Promise<void> => {
    store.set(key, structuredClone(value)); // throws DataCloneError for a proxied value → the write fails the test
  };
  return { set, store };
}
