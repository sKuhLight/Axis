// Regression cover for the one thing that is easy to get wrong in the history store: `entries` is
// `$state`, so an entry pushed into it is stored as a deep PROXY of the object that was passed in.
// `recordGesture` holds on to an entry between calls to coalesce a knob drag into a single step — and if
// it holds the raw object instead of the proxy, every write it makes is invisible to `entries` readers
// and `entries.indexOf(rawEntry)` is always -1. That surfaced three ways: a no-op drag that never got
// dropped, a panel label frozen at the first reading, and a redo/persist replaying an intermediate
// value instead of where the drag actually ended.
//
// Must stay a `.runes.test.ts`: the `runes` vitest project compiles rune modules in CLIENT mode, so
// `$state` is a real proxy here. The `node` project does not compile them at all (`$state is not defined`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryOp } from './history.svelte';

// Typed params matter: `mock.calls` is inferred from the implementation signature.
const setParam = vi.fn(async (_eid: number, _paramId: number, _value: number, _continuous: boolean) => ({ ok: true }));
const setBypass = vi.fn(async (_eid: number, _on: boolean) => ({ ok: true }));
vi.mock('./forgefx', () => ({ forgefx: { setParam, setBypass } }));

const idbSet = vi.fn(async (_key: string, _value: unknown) => {});
const idbGet = vi.fn(async (_key: string) => undefined);
vi.mock('./idb', () => ({
  idb: { available: () => true, get: idbGet, set: idbSet, del: vi.fn(async () => {}) }
}));

const { history } = await import('./history.svelte');

const host = {
  load: vi.fn(async () => {}),
  reloadParams: vi.fn(async () => {}),
  echoParam: vi.fn(),
  toast: vi.fn(),
  isLegacyAm4: () => false
};

/** One tick of a continuous knob drag on the same (eid, paramId) — coalesced into one entry. */
const drag = (to: number): Extract<HistoryOp, { kind: 'param' }> => ({
  kind: 'param', eid: 1, paramId: 2, continuous: true, from: 0.1, to, block: 'Amp 1', param: 'Drive'
});

beforeEach(async () => {
  vi.clearAllMocks();
  history.bindHost(host);
  history.key = '';
  await history.switchTo('FM3', 12); // gives the store a doc key so persistence actually runs
  history.clear();
});

// Fake timers are installed per test; restore the real ones even when an assertion throws.
afterEach(() => {
  vi.useRealTimers();
});

describe('gesture coalescing writes through the live entry', () => {
  it('drops a drag that ended where it started', () => {
    vi.useFakeTimers();
    history.recordGesture(drag(0.1)); // never moved
    expect(history.entries.length).toBe(1);
    history.endGesture();
    expect(history.entries.length).toBe(0);
  });

  it('keeps a drag that moved', () => {
    vi.useFakeTimers();
    history.recordGesture(drag(0.9));
    history.endGesture();
    expect(history.entries.length).toBe(1);
  });

  it('updates the label a reader has already rendered', () => {
    vi.useFakeTimers();
    history.recordGesture(drag(0.2));
    const first = history.entries[0].label; // HistoryPanel renders {e.label} — this pins the source
    history.recordGesture(drag(0.9));
    expect(history.entries[0].label).not.toBe(first);
  });

  // The gesture's push truncated the redo tail; dropping the no-op must persist that, or a reload would
  // bring the redo entries back.
  it('persists the truncated redo tail when it drops a no-op drag', async () => {
    history.record({ kind: 'bypass', eid: 3, block: 'Amp 1', from: false, to: true });
    await history.undo(); // the bypass entry is now redo-able
    vi.useFakeTimers();
    history.recordGesture(drag(0.1)); // truncates the redo tail...
    history.endGesture(); // ...and is itself dropped as a no-op
    idbSet.mockClear();
    vi.advanceTimersByTime(500);
    const docs = idbSet.mock.calls
      .map((c) => c[1] as { entries?: unknown[] })
      .filter((d) => Array.isArray(d?.entries));
    expect(docs.at(-1)?.entries).toEqual([]);
  });

  // `#flushPersist` is debounced 500 ms and `$state.snapshot`s every entry, so an edit made just before a
  // drag lands its persist in the MIDDLE of that drag — deep-reading `ops` while it is still being
  // written. The value the user let go of must survive that.
  it('replays and persists where the drag ended, even when a persist lands mid-drag', async () => {
    vi.useFakeTimers();
    history.record({ kind: 'bypass', eid: 3, block: 'Amp 1', from: false, to: true });
    history.recordGesture(drag(0.2));
    vi.advanceTimersByTime(500); // the earlier edit's debounced persist fires mid-drag
    history.recordGesture(drag(0.9)); // ...and the drag carries on to its real end
    history.endGesture();
    vi.advanceTimersByTime(500);
    vi.useRealTimers();

    await history.undo();
    setParam.mockClear();
    await history.redo();
    expect(setParam.mock.calls[0]?.[2]).toBe(0.9);

    // the store also writes an LRU index doc, so take the last write that actually carries entries
    const docs = idbSet.mock.calls
      .map((c) => c[1] as { entries?: { ops: HistoryOp[] }[] })
      .filter((d) => Array.isArray(d?.entries));
    const param = docs.at(-1)!.entries!.flatMap((e) => e.ops).find((o) => o.kind === 'param');
    expect(param).toMatchObject({ to: 0.9 });
  });
});
