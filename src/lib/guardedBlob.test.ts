import { describe, it, expect } from 'vitest';
import { GuardedBlob, type BlobKv, type ReadResult } from './guardedBlob';
import { deepProxy, cloneCheckedSet, isStructuredCloneable } from './testing/idbClone';

const KEY = 'lib.fileBytes';

/** A fake key→value store whose READ can be held open / failed, and which records every WRITE. */
function fakeKv(stored?: Record<string, number[]>) {
  const writes: Record<string, number[]>[] = [];
  let reads = 0;
  let queue: ((r: ReadResult) => void)[] = [];
  let mode: 'auto' | 'manual' = 'auto';
  let failNext = 0;
  const kv: BlobKv = {
    read: () => {
      reads++;
      if (mode === 'manual') return new Promise<ReadResult>((res) => queue.push(res));
      if (failNext > 0) {
        failNext--;
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, value: stored ? structuredClone(stored) : undefined });
    },
    set: async (_k, v) => {
      writes.push(structuredClone(v as Record<string, number[]>));
      stored = structuredClone(v as Record<string, number[]>);
    }
  };
  return {
    kv,
    writes,
    get reads() {
      return reads;
    },
    /** hold every read open until `settleReads` */
    holdReads: () => {
      mode = 'manual';
    },
    settleReads: (r: ReadResult) => {
      mode = 'auto';
      const q = queue;
      queue = [];
      q.forEach((res) => res(r));
    },
    failReads: (n = 1) => {
      failNext = n;
    },
    get stored() {
      return stored;
    }
  };
}

const old = { 'file:old1': [1, 1], 'file:old2': [2, 2] };

describe('GuardedBlob: writes only after a successful read', () => {
  it('an import BEFORE the startup read resolves does not overwrite earlier imports: the write waits and merges', async () => {
    const f = fakeKv(old);
    f.holdReads();
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    const startup = blob.load(); // startup read in flight
    blob.put('file:new', [9]); // user imports right after launch
    const flushed = blob.flush(); // joins the in-flight read
    await Promise.resolve();
    expect(f.writes).toEqual([]); // nothing written while unread
    expect(f.reads).toBe(1); // one shared read

    f.settleReads({ ok: true, value: structuredClone(old) });
    expect(await startup).toBe(true);
    expect(await flushed).toBe(true);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toEqual({ ...old, 'file:new': [9] }); // earlier imports' bytes survive
    expect(blob.data).toEqual({ ...old, 'file:new': [9] });
  });

  it('a late-resolving startup read MERGES with what was imported meanwhile instead of replacing it', async () => {
    const f = fakeKv(old);
    f.holdReads();
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    const startup = blob.load();
    blob.put('file:new', [9]);
    expect(blob.data).toEqual({ 'file:new': [9] }); // only the local put so far
    f.settleReads({ ok: true, value: structuredClone(old) });
    await startup;
    expect(blob.data).toEqual({ ...old, 'file:new': [9] }); // the just-imported bytes were NOT dropped
  });

  it('a local put wins over a stored value for the same id (it is newer)', async () => {
    const f = fakeKv({ 'file:a': [1] });
    f.holdReads();
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    const startup = blob.load();
    blob.put('file:a', [2]);
    f.settleReads({ ok: true, value: { 'file:a': [1] } });
    await startup;
    expect(blob.get('file:a')).toEqual([2]);
  });

  it('a removal made before the read resolves is not resurrected by the merge', async () => {
    const f = fakeKv(old);
    f.holdReads();
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    const startup = blob.load();
    blob.remove('file:old1');
    blob.put('file:new', [9]);
    const flushed = blob.flush();
    f.settleReads({ ok: true, value: structuredClone(old) });
    await startup;
    await flushed;
    expect(blob.data).toEqual({ 'file:old2': [2, 2], 'file:new': [9] });
    expect(f.writes[0]).toEqual({ 'file:old2': [2, 2], 'file:new': [9] });
  });

  it('remove then re-import of the same id before the read keeps the new bytes', async () => {
    const f = fakeKv(old);
    f.holdReads();
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    const startup = blob.load();
    blob.remove('file:old1');
    blob.put('file:old1', [7]);
    f.settleReads({ ok: true, value: structuredClone(old) });
    await startup;
    expect(blob.get('file:old1')).toEqual([7]);
  });
});

describe('GuardedBlob: a failed read is not "key absent"', () => {
  it('an import after a FAILED read writes NOTHING (the stored blob is left intact)', async () => {
    const f = fakeKv(old);
    f.failReads(2);
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    expect(await blob.load()).toBe(false); // startup read failed
    blob.put('file:new', [9]);
    expect(await blob.flush()).toBe(false); // flush retries the read → fails again → no write
    expect(f.writes).toEqual([]);
    expect(f.stored).toEqual(old); // earlier imports' bytes untouched
    expect(blob.ready).toBe(false);
  });

  it('keeps the pending import and merges it once a later read succeeds (retry)', async () => {
    const f = fakeKv(old);
    f.failReads(1);
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    await blob.load(); // fails
    blob.put('file:new', [9]);
    blob.remove('file:old2');
    expect(await blob.flush()).toBe(true); // retry read succeeds → merge → write
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toEqual({ 'file:old1': [1, 1], 'file:new': [9] });
    expect(blob.ready).toBe(true);
  });

  it('a read that rejects outright is treated like a failed read (no write)', async () => {
    const kv: BlobKv = { read: () => Promise.reject(new Error('boom')), set: () => Promise.reject(new Error('must not write')) };
    const blob = new GuardedBlob<number[]>(kv, KEY);
    blob.put('x', [1]);
    expect(await blob.flush()).toBe(false);
  });

  it('a failed read can be retried by load() (not stuck on the failure)', async () => {
    const f = fakeKv(old);
    f.failReads(1);
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    expect(await blob.load()).toBe(false);
    expect(await blob.load()).toBe(true);
    expect(f.reads).toBe(2);
    expect(blob.data).toEqual(old);
  });
});

describe('GuardedBlob: key absent is a completed read', () => {
  it('an absent blob is safe to write: the first import creates it', async () => {
    const f = fakeKv(undefined);
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    blob.put('file:new', [9]);
    expect(await blob.flush()).toBe(true);
    expect(f.writes).toEqual([{ 'file:new': [9] }]);
  });

  it('after the read, puts and removals flush the full current snapshot', async () => {
    const f = fakeKv(old);
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    expect(await blob.load()).toBe(true);
    blob.put('file:new', [9]);
    blob.remove('file:old1');
    expect(await blob.flush()).toBe(true);
    expect(f.writes.at(-1)).toEqual({ 'file:old2': [2, 2], 'file:new': [9] });
    expect(f.reads).toBe(1); // already ready: no re-read
  });

  it('never writes an unread blob, however often flush is called', async () => {
    const f = fakeKv(old);
    f.failReads(5);
    const blob = new GuardedBlob<number[]>(f.kv, KEY);
    blob.put('file:new', [9]);
    for (let i = 0; i < 3; i++) await blob.flush();
    expect(f.writes).toEqual([]);
  });

  it('mutates the supplied target in place (so a reactive proxy keeps tracking it)', async () => {
    const f = fakeKv(old);
    const target: Record<string, number[]> = {};
    const blob = new GuardedBlob<number[]>(f.kv, KEY, target);
    blob.put('file:new', [9]);
    await blob.load();
    expect(blob.data).toBe(target);
    expect(target).toEqual({ ...old, 'file:new': [9] });
  });
});

// ── a reactive ($state) record must be snapshotted before it reaches IndexedDB ───────────────────
describe('GuardedBlob: a reactive ($state) record is snapshotted before it is written', () => {
  // Svelte 5 `$state` records are deep Proxies. IndexedDB structured-clones what it stores, which throws
  // DataCloneError for a Proxy (also for `{...proxy}`, whose nested arrays stay proxied) — and idb.set used to
  // swallow that, so the imported bytes were never persisted.
  const absentKv = (set: BlobKv['set']): BlobKv => ({ read: async () => ({ ok: true, value: undefined }), set });
  const reactiveTarget = () => deepProxy<Record<string, number[]>>({});

  it('control: the helper really emulates the problem — the proxied record and a spread of it are not cloneable', () => {
    const t = reactiveTarget();
    t['file:a'] = [1, 2, 3];
    expect(isStructuredCloneable(t)).toBe(false);
    expect(isStructuredCloneable({ ...t })).toBe(false);
  });

  it('flush writes a plain, structured-cloneable snapshot (default snapshot) with the right contents', async () => {
    const { set, store } = cloneCheckedSet(); // rejects with DataCloneError if handed a proxy
    const blob = new GuardedBlob<number[]>(absentKv(set), KEY, reactiveTarget());
    blob.put('file:a', [1, 2, 3]);
    blob.put('file:b', [4, 5]);
    expect(await blob.flush()).toBe(true);
    expect(store.get(KEY)).toEqual({ 'file:a': [1, 2, 3], 'file:b': [4, 5] });
  });

  it('the same after a merge with a stored blob and a removal', async () => {
    const { set, store } = cloneCheckedSet();
    const kv: BlobKv = { read: async () => ({ ok: true, value: { 'file:old': [9] } }), set };
    const blob = new GuardedBlob<number[]>(kv, KEY, reactiveTarget());
    blob.put('file:new', [1]);
    blob.remove('file:gone');
    await blob.flush();
    expect(store.get(KEY)).toEqual({ 'file:old': [9], 'file:new': [1] });
  });

  it('uses the injected snapshotter (the library passes $state.snapshot) on the live record', async () => {
    const { set, store } = cloneCheckedSet();
    const target = reactiveTarget();
    const seen: unknown[] = [];
    const blob = new GuardedBlob<number[]>(absentKv(set), KEY, target, (d) => {
      seen.push(d);
      return JSON.parse(JSON.stringify(d));
    });
    blob.put('file:a', [1]);
    await blob.flush();
    expect(seen).toEqual([target]);
    expect(store.get(KEY)).toEqual({ 'file:a': [1] });
  });

  it('without a snapshot step the clone-checking store fails the write (so a regression cannot hide)', async () => {
    const { set } = cloneCheckedSet();
    const blob = new GuardedBlob<number[]>(absentKv(set), KEY, reactiveTarget(), (d) => ({ ...d }));
    blob.put('file:a', [1]);
    await expect(blob.flush()).rejects.toThrow();
  });
});
