// A persisted id → value map (one IndexedDB key) that is only ever written back AFTER it has been read.
//
// The library keeps the raw .syx bytes of every imported preset in ONE blob. Writing that blob from a
// partial in-memory copy destroys every earlier import's bytes, which is exactly what happens when:
//  - an import (or a removal) runs before the startup read has resolved, or
//  - the startup read FAILED (the plain idb.get turns a read error into `undefined`, indistinguishable from
//    "nothing stored yet").
// So: writes are refused until a read has completed successfully ("key absent" counts as a completed read —
// it is safe to write then). Changes made meanwhile stay in memory (puts) / are remembered (removals) and are
// MERGED into the stored blob when the read finally succeeds; a failed read is retried on the next flush.
//
// Framework-free (the store passes its own reactive record in as `target`) so it is unit-tested directly.

export type ReadResult = { ok: true; value: unknown } | { ok: false };

export interface BlobKv {
  /** Resolve `{ok:true, value}` (value undefined = key absent) or `{ok:false}` when the READ itself failed. */
  read: (key: string) => Promise<ReadResult>;
  set: (key: string, val: unknown) => Promise<unknown>;
}

/** A plain, structured-cloneable deep copy for JSON-shaped data (also unwraps a Svelte `$state` proxy). The
 *  default snapshot — the library injects `$state.snapshot` instead, which does the same without a JSON pass. */
export function plainCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class GuardedBlob<V> {
  /** The in-memory view: stored entries once read, plus every put since construction. Mutated in place. */
  readonly data: Record<string, V>;
  #ready = false;
  #loading: Promise<boolean> | null = null;
  /** ids put while the blob was unread (replayed on top of the stored blob when it is read). */
  #dirty = new Set<string>();
  /** ids removed while the blob was unread (must not be resurrected by the merge). */
  #removed = new Set<string>();

  /** @param snapshot turns the in-memory record into a plain, structured-cloneable value right before it is
   *  written. IndexedDB can't store a Svelte `$state` proxy (DataCloneError), and `{...data}` would keep the
   *  proxied nested values — so a reactive `target` MUST be snapshotted (the library passes `$state.snapshot`). */
  constructor(
    private readonly kv: BlobKv,
    private readonly key: string,
    target: Record<string, V> = {},
    private readonly snapshot: (data: Record<string, V>) => Record<string, V> = plainCopy
  ) {
    this.data = target;
  }

  /** True once the stored blob has been read successfully (writes are allowed). */
  get ready(): boolean {
    return this.#ready;
  }

  get(id: string): V | undefined {
    return this.data[id];
  }

  put(id: string, value: V): void {
    this.data[id] = value;
    this.#removed.delete(id);
    if (!this.#ready) this.#dirty.add(id);
  }

  remove(id: string): void {
    delete this.data[id];
    this.#dirty.delete(id);
    if (!this.#ready) this.#removed.add(id);
  }

  /** Read the stored blob and merge the pending changes into it. Resolves true once the blob is ready, false
   *  when the read failed (a later call tries again). Concurrent calls share one read. */
  load(): Promise<boolean> {
    if (this.#ready) return Promise.resolve(true);
    this.#loading ??= this.kv.read(this.key).then(
      (r) => {
        this.#loading = null;
        if (!r.ok) return false;
        this.#merge(r.value);
        return true;
      },
      () => {
        this.#loading = null;
        return false;
      }
    );
    return this.#loading;
  }

  /** Write the blob — but only if it has been read; an unread blob is read first (and the write is dropped,
   *  pending changes kept, when that read fails). Resolves true when the blob was written. */
  async flush(): Promise<boolean> {
    if (!(await this.load())) return false;
    await this.kv.set(this.key, this.snapshot(this.data));
    return true;
  }

  #merge(stored: unknown): void {
    const pending = [...this.#dirty].map((id) => [id, this.data[id] as V] as const);
    for (const k of Object.keys(this.data)) delete this.data[k]; // before the read this held only local puts
    if (stored && typeof stored === 'object') Object.assign(this.data, stored as Record<string, V>);
    for (const id of this.#removed) delete this.data[id];
    for (const [id, v] of pending) this.data[id] = v; // local changes are newer than the stored blob
    this.#dirty.clear();
    this.#removed.clear();
    this.#ready = true;
  }
}
