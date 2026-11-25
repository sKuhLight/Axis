// Cover for what `switchTo` does with a loaded changelog when the preset changes.
//
// The device replaces its edit buffer when another preset is loaded, so edits the stored changelog of the
// slot you land on still holds (structural ones included: place / remove / cable) are no longer IN the
// buffer — undo must not replay them onto the freshly loaded preset. They stay readable, behind a barrier.
// The FIRST context after launch is left alone: the changelog survives a restart and stays undoable.
//
// Must stay a `.runes.test.ts`: real `$state` proxies are what `switchTo` mutates (see the
// `history.runes.test.ts` header).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryOp } from './history.svelte';

const setBypass = vi.fn(async (_eid: number, _on: boolean) => ({ ok: true }));
const clearCell = vi.fn(async (_row: number, _col: number) => ({ ok: true }));
vi.mock('./forgefx', () => ({ forgefx: { setBypass, clearCell } }));

const store = new Map<string, unknown>();
vi.mock('./idb', () => ({
  idb: {
    available: () => true,
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); }
  }
}));

const { history } = await import('./history.svelte');

const host = {
  load: vi.fn(async () => {}),
  reloadParams: vi.fn(async () => {}),
  echoParam: vi.fn(),
  toast: vi.fn(),
  isLegacyAm4: () => false
};

const bypass: HistoryOp = { kind: 'bypass', eid: 3, block: 'Amp 1', from: false, to: true };
const place: HistoryOp = { kind: 'place', row: 0, col: 2, blockId: 7, display: 'Amp' };
const saved = (ops: HistoryOp[]) => ({
  v: 1,
  entries: ops.map((op, i) => ({ id: `e${i}`, t: i, label: op.kind, ops: [op], undoable: true })),
  cursor: ops.length,
  updatedAt: 1
});

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  history.bindHost(host);
  history.key = '';
  history.entries = [];
  history.cursor = 0;
});

describe('switching preset starts a fresh undo segment', () => {
  it('barriers the changelog of a slot you come back to, keeping it readable', async () => {
    await history.switchTo('FM3', 5);
    history.record(bypass);
    history.record(place);
    await history.switchTo('FM3', 6); // the device loads another preset; slot 5's changelog is flushed
    await history.switchTo('FM3', 5); // ...and back: the buffer is the stored preset again

    expect(history.entries.map((e) => e.undoable)).toEqual([true, true, false]); // changelog kept
    expect(history.entries.at(-1)?.barrier).toBe(true);
    expect(history.entries.at(-1)?.label).toBe('Loaded preset 005');
    expect(history.canUndo).toBe(false);
    expect(await history.undo()).toBe(false);
    expect(clearCell).not.toHaveBeenCalled(); // the stale `place` was not replayed onto the new buffer
    expect(setBypass).not.toHaveBeenCalled();
  });

  it('barriers a slot whose changelog was stored in an earlier session', async () => {
    store.set('axs.hist.v1:FM3:6', saved([bypass]));
    await history.switchTo('FM3', 5);
    await history.switchTo('FM3', 6);
    expect(history.entries.at(-1)?.barrier).toBe(true);
    expect(history.canUndo).toBe(false);
  });

  it('keeps undo after a restart: the first context after launch gets no barrier', async () => {
    store.set('axs.hist.v1:FM3:5', saved([bypass]));
    await history.switchTo('FM3', 5);
    expect(history.entries).toHaveLength(1);
    expect(history.canUndo).toBe(true);
  });

  it('does not barrier the startup flip from the placeholder device name to the detected one', async () => {
    await history.switchTo('dev', 12);
    store.set('axs.hist.v1:FM3:12', saved([bypass]));
    await history.switchTo('FM3', 12);
    expect(history.entries).toHaveLength(1);
    expect(history.canUndo).toBe(true);
  });

  it('does not barrier a different device', async () => {
    store.set('axs.hist.v1:AM4:5', saved([bypass]));
    await history.switchTo('FM3', 5);
    await history.switchTo('AM4', 5);
    expect(history.entries).toHaveLength(1);
    expect(history.canUndo).toBe(true);
  });

  it('adds nothing for a slot with no changelog, and does not stack barriers', async () => {
    await history.switchTo('FM3', 5);
    await history.switchTo('FM3', 6);
    expect(history.entries).toHaveLength(0);

    history.record(bypass);
    await history.switchTo('FM3', 5);
    await history.switchTo('FM3', 6);
    const afterFirstReturn = history.entries.length;
    expect(history.entries.at(-1)?.barrier).toBe(true);
    await history.switchTo('FM3', 5);
    await history.switchTo('FM3', 6); // returns to a changelog already ending in a barrier
    expect(history.entries).toHaveLength(afterFirstReturn);
  });

  it('reads as undoable again for an edit made after the barrier', async () => {
    await history.switchTo('FM3', 5);
    history.record(bypass);
    await history.switchTo('FM3', 6);
    await history.switchTo('FM3', 5);
    history.record(place);
    expect(history.canUndo).toBe(true);
    expect(await history.undo()).toBe(true);
    expect(clearCell).toHaveBeenCalledTimes(1); // only the new edit is undone...
    expect(await history.undo()).toBe(false); // ...then undo stops at the barrier
  });
});
