// Regression cover for the clean baseline across preset loads (the Save chip's dirty state).
//
// History persists per device+slot, so when a preset is loaded from the device its stored
// changelog can still end in an unsaved edit that is NO LONGER in the buffer. Without a barrier
// that stale edit reads as "edited" on the freshly-loaded preset — the reported bug, including
// the preset the app boots on.
//
// Must stay a `.runes.test.ts`: real `$state` proxies are what `switchTo` mutates (see the
// `history.runes.test.ts` header for why the node project would pass vacuously).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('$lib/api/forgefx', () => ({
  forgefx: { setParam: vi.fn(async () => ({ ok: true })), setBypass: vi.fn(async () => ({ ok: true })) }
}));
vi.mock('$lib/platform/idb', () => ({
  idb: {
    available: () => true,
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v); },
    del: async (k: string) => { store.delete(k); }
  }
}));

const { history } = await import('./history.svelte');
const { isSaveDirty } = await import('../axis-workbench/widgets/saveDirtyState');

const host = {
  load: vi.fn(async () => {}),
  reloadParams: vi.fn(async () => {}),
  echoParam: vi.fn(),
  toast: vi.fn(),
  isLegacyAm4: () => false
};

const edit = (eid = 3) => ({ kind: 'bypass' as const, eid, block: `Amp ${eid}`, from: false, to: true });

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  history.bindHost(host);
  history.key = '';
  history.entries = [];
  history.cursor = 0;
});

describe('preset loads reset the save-dirty baseline', () => {
  it('barriers a persisted unsaved edit on the very first load, keeping the changelog', async () => {
    store.set('axs.hist.v1:FM3:5', {
      v: 1,
      entries: [{ id: 'e', t: 1, label: 'Amp 1 bypassed', ops: [], undoable: true }],
      cursor: 1,
      updatedAt: 1
    });
    await history.switchTo('FM3', 5);
    expect(history.entries).toHaveLength(2);
    expect(history.entries.some((e) => e.undoable)).toBe(true); // changelog kept
    expect(history.entries.at(-1)?.barrier).toBe(true);
    expect(isSaveDirty(history.entries, history.cursor)).toBe(false);
  });

  it('barriers a later switch so a stale unsaved edit reads clean, keeping the changelog', async () => {
    await history.switchTo('FM3', 5); // initial context
    history.record(edit());
    expect(isSaveDirty(history.entries, history.cursor)).toBe(true);

    await history.switchTo('FM3', 6); // navigate away (flushes 5)
    await history.switchTo('FM3', 5); // navigate back — the device reloaded the buffer

    expect(history.entries.some((e) => e.undoable)).toBe(true); // changelog kept
    expect(history.entries.at(-1)?.barrier).toBe(true);
    expect(isSaveDirty(history.entries, history.cursor)).toBe(false);
  });

  it('reads dirty again for an edit made after the load barrier', async () => {
    await history.switchTo('FM3', 5);
    history.record(edit(3));
    await history.switchTo('FM3', 6);
    await history.switchTo('FM3', 5);
    history.record(edit(4));
    expect(isSaveDirty(history.entries, history.cursor)).toBe(true);
  });

  it('does not stack a barrier when the loaded changelog already ends in one', async () => {
    await history.switchTo('FM3', 5);
    history.record(edit());
    await history.switchTo('FM3', 6);
    await history.switchTo('FM3', 5);
    const afterFirstReturn = history.entries.length;
    await history.switchTo('FM3', 7);
    await history.switchTo('FM3', 5);
    expect(history.entries).toHaveLength(afterFirstReturn);
  });
});
