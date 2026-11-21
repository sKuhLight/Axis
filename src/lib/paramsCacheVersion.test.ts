import { describe, it, expect } from 'vitest';
import {
  PARAMS_DECODE_VERSION,
  wrapParams,
  unwrapParams,
  loadParamsCache,
  settleFilesOnLoad,
  isTransientDecodeError,
  redecodePass,
  type PersistedFile
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

// ── imported files: per-file decode stamp ────────────────────────────────────────────────────────
type SummaryLike = { name: string; params?: unknown };
type FileRec = PersistedFile & { summary: SummaryLike };

const file = (id: string, paramsV?: number): FileRec => ({
  id,
  summary: { name: id, params: blocks(`${id} (old decode)`) },
  ...(paramsV !== undefined ? { paramsV } : {})
});

class HttpError extends Error {
  constructor(public status: number) {
    super(`http ${status}`);
  }
}

describe('settleFilesOnLoad (per-file stamp)', () => {
  it('keeps a current-stamped file untouched (same reference, params kept)', () => {
    const f = file('a', PARAMS_DECODE_VERSION);
    const { items, pending } = settleFilesOnLoad([f], true);
    expect(items[0]).toBe(f);
    expect(pending).toEqual([]);
  });

  it("with IndexedDB: drops a stale / unstamped file's params and leaves it pending (stamp stays stale)", () => {
    for (const stamp of [undefined, PARAMS_DECODE_VERSION - 1]) {
      const input = [file('a', stamp)];
      const snapshot = JSON.stringify(input);
      const { items, pending } = settleFilesOnLoad(input, true);
      expect(items[0].summary.params).toBeUndefined();
      expect(items[0].summary.name).toBe('a');
      expect(items[0].paramsV).toBe(stamp); // not advanced: a crash / failed re-decode retries it
      expect(pending).toEqual(['a']);
      expect(JSON.stringify(input)).toBe(snapshot); // input untouched
    }
  });

  it('only the stale files are dropped / pending; current ones keep their params', () => {
    const cur = file('cur', PARAMS_DECODE_VERSION);
    const { items, pending } = settleFilesOnLoad([file('s1'), cur, file('s2', 1)], true);
    expect(pending).toEqual(['s1', 's2']);
    expect(items[1]).toBe(cur);
    expect(items[1].summary.params).toBeDefined();
  });

  it('WITHOUT IndexedDB: drops stale params once and advances the stamp immediately (nothing to re-decode from)', () => {
    const { items, pending } = settleFilesOnLoad([file('a'), file('b', 1)], false);
    expect(pending).toEqual([]);
    expect(items.map((i) => i.paramsV)).toEqual([PARAMS_DECODE_VERSION, PARAMS_DECODE_VERSION]);
    expect(items.map((i) => i.summary.params)).toEqual([undefined, undefined]);
  });
});

describe('isTransientDecodeError', () => {
  it('4xx (the server refused these bytes) is deterministic; no status / 5xx / 408 / 429 is transient', () => {
    for (const s of [400, 404, 413, 415, 422]) expect(isTransientDecodeError(new HttpError(s))).toBe(false);
    for (const s of [408, 429, 500, 502, 503, 504]) expect(isTransientDecodeError(new HttpError(s))).toBe(true);
    expect(isTransientDecodeError(new TypeError('fetch failed'))).toBe(true); // server offline
    expect(isTransientDecodeError(new DOMException('timed out', 'TimeoutError'))).toBe(true);
    expect(isTransientDecodeError(undefined)).toBe(true);
  });
});

// A mini lifecycle over the pure pieces the library store composes: load → settle → one re-decode pass →
// persist (stamp each settled file, keep counted failures). `launch` returns what would be persisted for the
// NEXT launch.
async function launch(
  persisted: FileRec[],
  opts: { idb?: boolean; bytes?: Set<string>; decode: (id: string) => Promise<SummaryLike> }
) {
  const calls: string[] = [];
  const { items, pending } = settleFilesOnLoad(persisted, opts.idb ?? true);
  const failures = new Map<string, number>(items.filter((i) => i.paramsFail).map((i) => [i.id, i.paramsFail!]));
  const byId = new Map<string, FileRec>(items.map((i): [string, FileRec] => [i.id, { ...i }]));
  const stillPending = await redecodePass<SummaryLike>(
    pending,
    async (id) => {
      if (opts.bytes && !opts.bytes.has(id)) return null; // no stored bytes
      calls.push(id);
      return opts.decode(id);
    },
    (id, fresh) => {
      const rec = byId.get(id)!;
      if (fresh) rec.summary = { ...fresh, name: rec.summary.name }; // the store keeps the visible name
      rec.paramsV = PARAMS_DECODE_VERSION;
      failures.delete(id);
    },
    failures
  );
  for (const rec of byId.values()) {
    if (rec.paramsV === PARAMS_DECODE_VERSION || !failures.get(rec.id)) delete rec.paramsFail;
    else rec.paramsFail = failures.get(rec.id);
  }
  return { persisted: [...byId.values()], calls, stillPending, pendingAtLoad: pending };
}
const freshDecode = (id: string): Promise<SummaryLike> => Promise.resolve({ name: 'decoded', params: blocks(`${id} (new decode)`) });
const mustNotDecode = (): Promise<SummaryLike> => Promise.reject(new Error('decode must not be called'));

describe('re-decode lifecycle: one bad file among many', () => {
  const stale = () => ['a', 'b', 'bad', 'c', 'd'].map((id) => file(id));
  const decodeWithBad = (id: string) => (id === 'bad' ? Promise.reject(new HttpError(422)) : freshDecode(id));

  it('launch 1 re-decodes every stale file once; the rejected one is settled (no params), the rest get fresh params', async () => {
    const r = await launch(stale(), { decode: decodeWithBad });
    expect(r.calls).toEqual(['a', 'b', 'bad', 'c', 'd']);
    expect(r.stillPending).toEqual([]);
    expect(r.persisted.every((f) => f.paramsV === PARAMS_DECODE_VERSION)).toBe(true);
    expect(r.persisted.find((f) => f.id === 'bad')!.summary.params).toBeUndefined();
    expect(JSON.stringify(r.persisted.find((f) => f.id === 'a')!.summary.params)).toContain('new decode');
    expect(r.persisted.find((f) => f.id === 'a')!.summary.name).toBe('a'); // user-visible name kept
  });

  it('launch 2 re-decodes NOTHING: the good files keep their params and the bad one is not retried', async () => {
    const first = await launch(stale(), { decode: decodeWithBad });
    const second = await launch(first.persisted, { decode: mustNotDecode });
    expect(second.calls).toEqual([]);
    expect(second.persisted).toEqual(first.persisted);
    expect(second.persisted.filter((f) => f.summary.params !== undefined).map((f) => f.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a file with no stored bytes is settled without params and is not retried either', async () => {
    const first = await launch([file('a'), file('nobytes')], { bytes: new Set(['a']), decode: freshDecode });
    expect(first.calls).toEqual(['a']);
    expect(first.persisted.find((f) => f.id === 'nobytes')).toMatchObject({ paramsV: PARAMS_DECODE_VERSION, summary: { name: 'nobytes' } });
    expect(first.persisted.find((f) => f.id === 'nobytes')!.summary.params).toBeUndefined();
    const second = await launch(first.persisted, { bytes: new Set(['a']), decode: mustNotDecode });
    expect(second.calls).toEqual([]);
  });

  it('with an ABSENT bytes blob (IndexedDB there, never written) every pending file settles at once and is not re-dropped', async () => {
    const first = await launch([file('a'), file('b')], { bytes: new Set(), decode: mustNotDecode });
    expect(first.calls).toEqual([]);
    expect(first.persisted.every((f) => f.paramsV === PARAMS_DECODE_VERSION && f.summary.params === undefined)).toBe(true);
    const second = await launch(first.persisted, { bytes: new Set(), decode: mustNotDecode });
    expect(second.pendingAtLoad).toEqual([]);
  });
});

describe('re-decode lifecycle: server offline / transient failures', () => {
  const offline = (): Promise<SummaryLike> => Promise.reject(new TypeError('fetch failed'));

  it('an offline server costs ONE request per pass, not one per file; every file stays pending and nothing is counted', async () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((id) => file(id));
    const r = await launch(files, { decode: offline });
    expect(r.calls).toEqual(['a']); // one attempt, then stop
    expect(r.stillPending).toEqual(['a', 'b', 'c', 'd', 'e']);
    // nothing was stamped current → all retried next launch; params stay dropped meanwhile
    expect(r.persisted.every((f) => f.paramsV === undefined && f.summary.params === undefined)).toBe(true);
    // being offline is never held against a file: no failure counts, however many launches
    const again = await launch(r.persisted, { decode: offline });
    expect(again.persisted.every((f) => f.paramsFail === undefined)).toBe(true);
  });

  it('the single in-session retry is one further request while still offline: bounded, no loop', async () => {
    let requests = 0;
    const decode = async (): Promise<null> => {
      requests++;
      throw new TypeError('fetch failed');
    };
    const pass1 = await redecodePass(['a', 'b', 'c'], decode, () => {});
    const retry = await redecodePass(pass1, decode, () => {}); // the one allowed retry
    expect(requests).toBe(2);
    expect(retry).toEqual(['a', 'b', 'c']); // still pending → next launch
  });

  it('server-wide errors (every request 503): stops after 3 in a row, counts nothing, keeps the rest pending', async () => {
    const calls: string[] = [];
    const failures = new Map<string, number>();
    const left = await redecodePass(
      ['a', 'b', 'c', 'd', 'e'],
      async (id) => {
        calls.push(id);
        throw new HttpError(503);
      },
      () => {},
      failures
    );
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(left).toEqual(['d', 'e', 'a', 'b', 'c']); // unattempted first, the failed ones deferred behind them
    expect(failures.size).toBe(0); // no success in the pass → could be a down/starting server → not counted
  });

  it('an always-500 file FIRST in line does not block the rest: it is deferred behind them and counted', async () => {
    const files = ['bad', 'a', 'b', 'c'].map((id) => file(id));
    const decode = (id: string) => (id === 'bad' ? Promise.reject(new HttpError(500)) : freshDecode(id));
    const r = await launch(files, { decode });
    expect(r.calls).toEqual(['bad', 'a', 'b', 'c']); // the pass carried on past it
    expect(r.stillPending).toEqual(['bad']);
    expect(r.persisted.filter((f) => f.paramsV === PARAMS_DECODE_VERSION).map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(r.persisted.find((f) => f.id === 'bad')).toMatchObject({ paramsFail: 1 }); // counted: others decoded fine
    expect(r.persisted.find((f) => f.id === 'bad')!.paramsV).toBeUndefined();
  });

  it('the persistently failing file is tried LAST on the next launch and is settled after 3 counted failures', async () => {
    const bad = (id: string) => (id === 'bad' ? Promise.reject(new HttpError(500)) : freshDecode(id));
    // launch 1: bad (first) fails, 1 other file decodes → counted once
    let r = await launch([file('bad'), file('x')], { decode: bad });
    expect(r.persisted.find((f) => f.id === 'bad')!.paramsFail).toBe(1);
    // a NEW stale file shows up (e.g. imported with an older build) → the failing one is ordered after it
    r = await launch([...r.persisted, file('late')], { decode: bad });
    expect(r.pendingAtLoad).toEqual(['late', 'bad']); // fewest failures first
    expect(r.persisted.find((f) => f.id === 'late')!.paramsV).toBe(PARAMS_DECODE_VERSION);
    expect(r.persisted.find((f) => f.id === 'bad')!.paramsFail).toBe(2);
    // launch 3: bad is the only pending file → no other success in the pass → NOT counted, still retried
    r = await launch(r.persisted, { decode: bad });
    expect(r.persisted.find((f) => f.id === 'bad')).toMatchObject({ paramsFail: 2 });
    // launch 4: with another stale file decoding fine alongside, the 3rd counted failure settles it for good
    r = await launch([...r.persisted, file('more')], { decode: bad });
    const settled = r.persisted.find((f) => f.id === 'bad')!;
    expect(settled.paramsV).toBe(PARAMS_DECODE_VERSION);
    expect(settled.summary.params).toBeUndefined();
    expect(settled.paramsFail).toBeUndefined();
    expect(r.stillPending).toEqual([]);
    const after = await launch(r.persisted, { decode: mustNotDecode });
    expect(after.calls).toEqual([]);
  });

  it('a transient HTTP failure mid-way settles what was done; the failed file alone stays pending', async () => {
    const files = ['a', 'b', 'c', 'd'].map((id) => file(id));
    const r1 = await launch(files, { decode: (id) => (id === 'c' ? Promise.reject(new HttpError(503)) : freshDecode(id)) });
    expect(r1.calls).toEqual(['a', 'b', 'c', 'd']);
    expect(r1.stillPending).toEqual(['c']);
    expect(r1.persisted.map((f) => f.paramsV)).toEqual([PARAMS_DECODE_VERSION, PARAMS_DECODE_VERSION, undefined, PARAMS_DECODE_VERSION]);
    // server healthy again: only c is decoded — a, b, d are NOT re-decoded
    const r2 = await launch(r1.persisted, { decode: freshDecode });
    expect(r2.calls).toEqual(['c']);
    expect(r2.stillPending).toEqual([]);
    expect(r2.persisted.every((f) => f.summary.params !== undefined && f.paramsV === PARAMS_DECODE_VERSION)).toBe(true);
  });

  it('a deterministic rejection is settled; a network failure stays pending (never mixed up)', async () => {
    const r = await launch([file('x'), file('y')], { decode: (id) => (id === 'x' ? Promise.reject(new HttpError(400)) : offline()) });
    expect(r.calls).toEqual(['x', 'y']);
    expect(r.stillPending).toEqual(['y']);
    expect(r.persisted.map((f) => f.paramsV)).toEqual([PARAMS_DECODE_VERSION, undefined]);
  });
});

describe('re-decode lifecycle: no IndexedDB', () => {
  it('drops stale params once and advances at once; files imported fresh last session keep theirs', async () => {
    const imported = file('fresh', PARAMS_DECODE_VERSION); // stamped when imported last session
    const first = await launch([file('old'), imported], { idb: false, decode: mustNotDecode });
    expect(first.calls).toEqual([]); // nothing to re-decode from → no requests at all
    expect(first.stillPending).toEqual([]);
    expect(first.persisted.find((f) => f.id === 'old')).toMatchObject({ paramsV: PARAMS_DECODE_VERSION });
    expect(first.persisted.find((f) => f.id === 'old')!.summary.params).toBeUndefined();
    expect(first.persisted.find((f) => f.id === 'fresh')!.summary.params).toBeDefined();

    // next launch (still no IndexedDB): nothing is dropped again — the fresh file keeps its params
    const second = await launch(first.persisted, { idb: false, decode: mustNotDecode });
    expect(second.persisted).toEqual(first.persisted);
    expect(second.persisted.find((f) => f.id === 'fresh')!.summary.params).toBeDefined();
  });
});

describe('redecodePass', () => {
  it('settles every id on success and returns nothing pending', async () => {
    const settled: [string, boolean][] = [];
    const left = await redecodePass(['a', 'b'], freshDecode, (id, fresh) => settled.push([id, fresh !== null]));
    expect(left).toEqual([]);
    expect(settled).toEqual([['a', true], ['b', true]]);
  });

  it('an empty pending list makes no request', async () => {
    let calls = 0;
    const left = await redecodePass([], async () => {
      calls++;
      return null;
    }, () => {});
    expect(left).toEqual([]);
    expect(calls).toBe(0);
  });
});
