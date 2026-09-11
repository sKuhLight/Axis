// Contract for the preset-buffer slice (`*.runes.test.ts` → the `runes` vitest project, which
// compiles rune modules against the CLIENT svelte runtime; see vitest.config.ts). Under the server
// runtime `$state` is inert, so the propagation assertions below would pass vacuously.
//
// What this pins, all of it load-bearing before the extraction and unchanged by it:
//   1. The DESTRUCTIVE save path: which route each device generation stores through, the dialog
//      closing before the toast, the undo marker, and the library reconcile gated on deep scan.
//   2. The sync-bus hook `editor.init()` registers — a config/version mutation anywhere in the app
//      still lands in the debounced local Sync/ mirror, and still skips when it should.
//   3. Preset nav order: recency, buffer-source invalidation, history context switch, picker close,
//      then poll → load, with the open block re-read only when the device can't be watched.
//   4. The optimistic → await → revert shape of both renames, and the slot round-trip
//      `renameStoredPreset` makes (including the store it must NOT do on a name-scan device).
//   5. Preset-watch discipline: one tick at a time, sat out while a definitions walk owns the
//      transport, throttled to every 4th tick on a slow link.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PresetBufferHost, PresetRef } from './presetBuffer.svelte';

// The slice reads the auto-sync mirror out of localStorage at construction, and writes it back when
// the user toggles it — the `runes` project runs in node, so give it a storage to talk to.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear()
  } as Storage;
}
vi.stubGlobal('localStorage', memoryStorage());

// ── module mocks ────────────────────────────────────────────────────────────────────────────────
const snapshotPreset = vi.fn(async (_n: number) => ({ ok: true }));
const loadVersionReq = vi.fn(async (_id: string) => ({ ok: true }));
const localConfig = vi.fn(async () => ({ configured: false, root: null as string | null, exists: true, lastSync: null as number | null }));
const setLocalRootReq = vi.fn(async (_r: string | null) => ({ configured: true, root: '/music', exists: true, lastSync: null as number | null }));
const localSyncReq = vi.fn(async () => ({ written: 3 }));
const localRestoreReq = vi.fn(async () => ({ imported: 2 }));
const backupDevice = vi.fn(async () => ({ count: 384 }));
const presetBackup = vi.fn(async () => ({ bytes: 'AAAA' }));
const saveLocalPreset = vi.fn(async (_n: string, _b: string, _o: unknown) => ({ path: 'Crunch.syx' }));
const currentPreset = vi.fn(async () => ({ number: 12, name: 'Roundtrip' }));
const setPresetName = vi.fn(async (_n: string) => ({ ok: true }));
const store = vi.fn(async (_n: number) => ({ ok: true }) as { ok: boolean; code?: string });
const selectPresetReq = vi.fn(async (_n: number) => ({ ok: true }));
const am4SwitchPreset = vi.fn(async (_n: number) => ({ ok: true }));
const am4StorePreset = vi.fn(async (_n: number) => ({ ok: true, code: '1A' }));

class FakeForgeError extends Error {
  status: number;
  constructor(status: number, message = 'forge') { super(message); this.status = status; }
}
vi.mock('$lib/api/forgefx', () => ({
  ForgeError: FakeForgeError,
  forgefx: {
    snapshotPreset: (n: number) => snapshotPreset(n),
    loadVersion: (id: string) => loadVersionReq(id),
    localConfig: () => localConfig(),
    setLocalRoot: (r: string | null) => setLocalRootReq(r),
    localSync: () => localSyncReq(),
    localRestore: () => localRestoreReq(),
    backupDevice: () => backupDevice(),
    presetBackup: () => presetBackup(),
    saveLocalPreset: (n: string, b: string, o: unknown) => saveLocalPreset(n, b, o),
    currentPreset: () => currentPreset(),
    setPresetName: (n: string) => setPresetName(n),
    store: (n: number) => store(n),
    selectPreset: (n: number) => selectPresetReq(n),
    am4SwitchPreset: (n: number) => am4SwitchPreset(n),
    am4StorePreset: (n: number) => am4StorePreset(n)
  }
}));
const deviceDefs = { building: false, importing: false };
vi.mock('$lib/device/deviceDefs.svelte', () => ({ deviceDefs }));
const checkpoint = vi.fn();
const record = vi.fn();
vi.mock('./history.svelte', () => ({ history: { checkpoint: (l: string, b: boolean) => checkpoint(l, b), record: (e: unknown) => record(e) } }));
const refreshSlot = vi.fn();
const refreshLocal = vi.fn();
const applySlotName = vi.fn();
const library = {
  cacheBuilt: true,
  refreshSlot: (n: number) => refreshSlot(n),
  refreshLocal: () => refreshLocal(),
  applySlotName: (n: number, name: string) => applySlotName(n, name)
};
vi.mock('$lib/preset/library.svelte', () => ({ library }));
const recency = vi.fn();
vi.mock('$lib/preset/presetRecency.svelte', () => ({ presetRecency: { record: (k: string) => recency(k) } }));

// The overlay registry and the sync bus are the REAL modules — both are dependency-free, and the
// picker/dialog open-state and the mutation hook are exactly what these tests are about.
const { overlays } = await import('$lib/overlay/overlays.svelte');
const { notifyMutation, onMutation } = await import('./syncBus');
const { PresetBufferStore } = await import('./presetBuffer.svelte');

// A mutable stand-in for the rest of the editor store. The device-session reads are plain fields so
// a test can put the slice on a legacy AM4 or a slow link; the rest are spies.
type Fake = PresetBufferHost & {
  status: 'loading' | 'ready' | 'offline';
  presetLiveQuery: boolean;
  slowLink: boolean;
  legacyAm4: boolean;
  canRenamePresets: boolean;
  canDeepScan: boolean;
  preset: PresetRef | null;
  lastPreset: number | null;
};
function fakeHost(): Fake {
  return {
    load: vi.fn(async () => {}),
    reloadOpenParams: vi.fn(async () => {}),
    showToast: vi.fn(),
    histSwitch: vi.fn(),
    status: 'ready',
    presetLiveQuery: true,
    slowLink: false,
    legacyAm4: false,
    canRenamePresets: true,
    canDeepScan: true,
    preset: { number: 12, name: 'Roundtrip' },
    lastPreset: 12,
    setPreset: vi.fn(function (this: void, p: PresetRef | null) { host.preset = p; }),
    setLastPreset: vi.fn(function (this: void, n: number) { host.lastPreset = n; }),
    poll: vi.fn(async () => {})
  };
}
let host: Fake;
const fresh = () => {
  host = fakeHost();
  return { host, p: new PresetBufferStore(host) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Put the slice's local folder in the "configured, mounted, auto-sync on" state. */
const configured = (p: InstanceType<typeof PresetBufferStore>) => {
  p.local = { ...p.local, available: true, configured: true, exists: true, autoSync: true };
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  deviceDefs.building = false;
  deviceDefs.importing = false;
  library.cacheBuilt = true;
  localConfig.mockResolvedValue({ configured: false, root: null, exists: true, lastSync: null });
  currentPreset.mockResolvedValue({ number: 12, name: 'Roundtrip' });
  localSyncReq.mockResolvedValue({ written: 3 });
  setPresetName.mockResolvedValue({ ok: true });
  store.mockResolvedValue({ ok: true });
  selectPresetReq.mockResolvedValue({ ok: true }); // a rejection staged by one test must not leak

  overlays.close('save');
  overlays.close('presetPicker');
  onMutation(() => {}); // drop any hook a previous test registered
});

// ── save (destructive) ──────────────────────────────────────────────────────────────────────────
describe('save', () => {
  it('stores through the unified route, closes the dialog and drops an undo marker', async () => {
    const { p } = fresh();
    p.saveOpen = true;
    await p.save(7);
    expect(store).toHaveBeenCalledWith(7);
    expect(am4StorePreset).not.toHaveBeenCalled();
    expect(p.saveOpen).toBe(false);
    expect(checkpoint).toHaveBeenCalledWith('Saved to preset 7', false); // marker, not a barrier
    expect(host.poll).toHaveBeenCalled();
    expect(refreshSlot).toHaveBeenCalledWith(7); // deep-scan device → reconcile the slot summary
  });

  it('uses the AM4 codec route on a legacy v1 server and reports the bank-letter code', async () => {
    const { p } = fresh();
    host.legacyAm4 = true;
    await p.save(3);
    expect(am4StorePreset).toHaveBeenCalledWith(3);
    expect(store).not.toHaveBeenCalled();
    expect(host.showToast).toHaveBeenCalledWith('Saved to preset 1A', '#f5a623');
  });

  it('skips the library reconcile on a name-scan device', async () => {
    const { p } = fresh();
    host.canDeepScan = false;
    await p.save(7);
    expect(refreshSlot).not.toHaveBeenCalled();
  });

  it('reports a device rejection without recording an undo marker', async () => {
    const { p } = fresh();
    store.mockResolvedValue({ ok: false });
    await p.save(7);
    expect(p.saveOpen).toBe(false); // the dialog still closes — the write was attempted
    expect(checkpoint).not.toHaveBeenCalled();
    expect(host.showToast).toHaveBeenCalledWith('Save rejected by device', '#d6543f');
  });

  it('reports a transport failure', async () => {
    const { p } = fresh();
    store.mockRejectedValue(new Error('timeout'));
    await p.save(7);
    expect(host.showToast).toHaveBeenCalledWith('Save failed', '#d6543f');
  });

  it('openSave targets the live preset, falling back to the last known slot', () => {
    const { p } = fresh();
    p.openSave();
    expect(p.saveTarget).toBe(12);
    expect(p.saveOpen).toBe(true);
    host.preset = null;
    host.lastPreset = 40;
    p.openSave();
    expect(p.saveTarget).toBe(40);
  });

  it('saveLocalFile writes back to the file the buffer came from — no device slot touched', async () => {
    const { p } = fresh();
    p.bufferSource = { path: '/music/Presets/Crunch.syx', name: 'Crunch' };
    p.saveOpen = true;
    await p.saveLocalFile();
    expect(saveLocalPreset).toHaveBeenCalledWith('Crunch', 'AAAA', { path: '/music/Presets/Crunch.syx', overwrite: true });
    expect(store).not.toHaveBeenCalled();
    expect(p.saveOpen).toBe(false);
    expect(checkpoint).toHaveBeenCalledWith('Saved to Presets/Crunch.syx', false);
    expect(refreshLocal).toHaveBeenCalled();
  });

  it('saveLocalFile is a no-op when the buffer has no file behind it', async () => {
    const { p } = fresh();
    await p.saveLocalFile();
    expect(presetBackup).not.toHaveBeenCalled();
  });
});

// ── the sync-bus hook registered by editor.init() ───────────────────────────────────────────────
describe('local Sync/ mirror', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a mutation anywhere in the app reaches the debounced sync', async () => {
    const { p } = fresh();
    p.initSync();
    configured(p);
    notifyMutation();
    expect(localSyncReq).not.toHaveBeenCalled(); // debounced — batches a burst of edits
    vi.advanceTimersByTime(8000);
    expect(localSyncReq).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst into one sync', () => {
    const { p } = fresh();
    p.initSync();
    configured(p);
    notifyMutation();
    vi.advanceTimersByTime(7000);
    notifyMutation();
    vi.advanceTimersByTime(7000);
    expect(localSyncReq).not.toHaveBeenCalled(); // the second mutation restarted the window
    vi.advanceTimersByTime(1000);
    expect(localSyncReq).toHaveBeenCalledTimes(1);
  });

  it('stays off when auto-sync is switched off, the folder is unset, or it went missing', () => {
    const { p } = fresh();
    p.initSync();
    configured(p);
    p.local = { ...p.local, autoSync: false };
    notifyMutation();
    p.local = { ...p.local, autoSync: true, configured: false };
    notifyMutation();
    p.local = { ...p.local, configured: true, exists: false };
    notifyMutation();
    vi.advanceTimersByTime(8000);
    expect(localSyncReq).not.toHaveBeenCalled();
  });

  it('does not stack a second sync on top of one in flight', () => {
    const { p } = fresh();
    p.initSync();
    configured(p);
    p.local = { ...p.local, syncing: true };
    notifyMutation();
    vi.advanceTimersByTime(8000);
    expect(localSyncReq).not.toHaveBeenCalled();
  });

  it('setLocalAutoSync persists the choice and kicks a sync when switched on', () => {
    const { p } = fresh();
    configured(p);
    p.setLocalAutoSync(false);
    expect(localStorage.getItem('axs.local.autosync')).toBe('0');
    p.setLocalAutoSync(true);
    expect(localStorage.getItem('axs.local.autosync')).toBe('1');
    vi.advanceTimersByTime(8000);
    expect(localSyncReq).toHaveBeenCalledTimes(1);
  });
});

describe('local folder', () => {
  it('marks the root missing on a 409 instead of blaming the sync', async () => {
    const { p } = fresh();
    configured(p);
    localSyncReq.mockRejectedValue(new FakeForgeError(409));
    await p.localSync();
    expect(p.local.exists).toBe(false);
    expect(p.local.note).toMatch(/remount/i);
    expect(p.local.syncing).toBe(false);
  });

  it('reports any other failure as a note and always clears the in-flight flag', async () => {
    const { p } = fresh();
    configured(p);
    localSyncReq.mockRejectedValue(new Error('disk full'));
    await p.localSync();
    expect(p.local.exists).toBe(true);
    expect(p.local.note).toBe('disk full');
    expect(p.local.syncing).toBe(false);
  });

  it('a successful sync records the mirror count and remounts the folder', async () => {
    const { p } = fresh();
    configured(p);
    await p.localSync();
    expect(p.local.note).toBe('Synced ↓3 to folder');
    expect(p.local.lastSync).toBeGreaterThan(0);
  });

  it('hides the feature on an engine without the routes', async () => {
    const { p } = fresh();
    localConfig.mockRejectedValue(new FakeForgeError(404));
    await p.initLocal();
    expect(p.local.available).toBe(false);
  });

  it('setting a root repopulates the library and syncs immediately', async () => {
    const { p } = fresh();
    await p.setLocalRoot('/music');
    expect(p.local.configured).toBe(true);
    expect(p.local.root).toBe('/music');
    expect(refreshLocal).toHaveBeenCalled();
    await flush();
    expect(localSyncReq).toHaveBeenCalled();
  });

  it('a full device backup lands in the folder when one is configured', async () => {
    const { p } = fresh();
    configured(p);
    await p.fullDeviceBackup();
    expect(backupDevice).toHaveBeenCalled();
    expect(host.showToast).toHaveBeenCalledWith('Backed up 384 presets', '#33c46b');
    await flush();
    expect(localSyncReq).toHaveBeenCalled();
  });

  it('a full device backup is refused while a sync is in flight', async () => {
    const { p } = fresh();
    p.local = { ...p.local, syncing: true };
    await p.fullDeviceBackup();
    expect(backupDevice).not.toHaveBeenCalled();
  });
});

// ── version store ───────────────────────────────────────────────────────────────────────────────
describe('versions', () => {
  it('a snapshot refreshes the slot and nudges the folder mirror', async () => {
    const { p } = fresh();
    await p.backupPreset(9);
    expect(snapshotPreset).toHaveBeenCalledWith(9);
    expect(refreshSlot).toHaveBeenCalledWith(9);
  });

  it('loading a version drops a BARRIER — undo cannot cross a wholesale buffer swap', async () => {
    const { p } = fresh();
    p.bufferSource = { path: '/music/Presets/Crunch.syx', name: 'Crunch' };
    await p.loadVersion('v1');
    expect(checkpoint).toHaveBeenCalledWith('Loaded snapshot into edit buffer', true);
    expect(p.bufferSource).toBe(null); // the local-file link is stale now
    expect(host.load).toHaveBeenCalled();
  });
});

// ── preset nav ──────────────────────────────────────────────────────────────────────────────────
describe('preset nav', () => {
  it('switches slot, closes the picker and re-reads in poll → load order', async () => {
    const { p } = fresh();
    overlays.open('presetPicker');
    p.bufferSource = { path: '/music/Presets/Crunch.syx', name: 'Crunch' };
    await p.selectPreset(30);
    expect(selectPresetReq).toHaveBeenCalledWith(30);
    expect(host.lastPreset).toBe(30);
    expect(recency).toHaveBeenCalledWith('dev:30');
    expect(p.bufferSource).toBe(null);
    expect(host.histSwitch).toHaveBeenCalledWith(30);
    expect(overlays.isOpen('presetPicker')).toBe(false);
    expect(host.poll).toHaveBeenCalled();
    expect(host.load).toHaveBeenCalled();
    // the device answers the live query, so watchPreset will refresh the open block
    expect(host.reloadOpenParams).not.toHaveBeenCalled();
  });

  it('re-reads the open block itself when the device cannot be watched', async () => {
    const { p } = fresh();
    host.presetLiveQuery = false;
    await p.selectPreset(30);
    expect(host.reloadOpenParams).toHaveBeenCalled();
  });

  it('an internal slot hop does not count as a user load', async () => {
    const { p } = fresh();
    await p.selectPreset(30, { recency: false });
    expect(recency).not.toHaveBeenCalled();
  });

  it('falls back to the AM4 codec route on a legacy v1 server', async () => {
    const { p } = fresh();
    host.legacyAm4 = true;
    await p.selectPreset(30);
    expect(am4SwitchPreset).toHaveBeenCalledWith(30);
    expect(selectPresetReq).not.toHaveBeenCalled();
    expect(host.load).toHaveBeenCalled();
    expect(host.reloadOpenParams).toHaveBeenCalled();
  });

  it('stepPreset walks from the live preset and never goes below zero', async () => {
    const { p } = fresh();
    await p.stepPreset(1);
    expect(selectPresetReq).toHaveBeenLastCalledWith(13);
    host.preset = { number: 0, name: 'Zero' };
    await p.stepPreset(-1);
    expect(selectPresetReq).toHaveBeenLastCalledWith(0);
  });

  it('a failed switch leaves the buffer state alone', async () => {
    const { p } = fresh();
    selectPresetReq.mockRejectedValue(new Error('nope'));
    await p.selectPreset(30);
    expect(host.load).not.toHaveBeenCalled();
  });
});

// ── renames ─────────────────────────────────────────────────────────────────────────────────────
describe('renames', () => {
  it('renamePreset is optimistic, records undo and confirms with a poll', async () => {
    const { p } = fresh();
    await p.renamePreset('Clean Rhythm');
    expect(host.preset).toEqual({ number: 12, name: 'Clean Rhythm' });
    expect(record).toHaveBeenCalledWith({ kind: 'presetName', from: 'Roundtrip', to: 'Clean Rhythm' });
    expect(applySlotName).toHaveBeenCalledWith(12, 'Clean Rhythm');
    expect(host.poll).toHaveBeenCalled();
  });

  it('renamePreset strips non-ASCII and caps the name at the device width', async () => {
    const { p } = fresh();
    await p.renamePreset('Ámp' + 'x'.repeat(40));
    const sent = setPresetName.mock.calls[0][0];
    expect(sent.length).toBe(32);
    expect(sent).toMatch(/^mp?x+$/); // the accented char is gone, not transliterated
  });

  it('renamePreset reverts when the device rejects it', async () => {
    const { p } = fresh();
    setPresetName.mockResolvedValue({ ok: false });
    await p.renamePreset('Clean Rhythm');
    expect(host.preset).toEqual({ number: 12, name: 'Roundtrip' });
    expect(host.showToast).toHaveBeenCalledWith('Preset rename failed', '#d6543f');
  });

  it('renamePreset is gated on the capability', async () => {
    const { p } = fresh();
    host.canRenamePresets = false;
    await p.renamePreset('Clean Rhythm');
    expect(setPresetName).not.toHaveBeenCalled();
  });

  it('renameStoredPreset hops to the slot, stores, and returns the user to where they were', async () => {
    const { p } = fresh();
    const ok = await p.renameStoredPreset(40, 'Lead');
    expect(ok).toBe(true);
    expect(selectPresetReq.mock.calls.map((c) => c[0])).toEqual([40, 12]); // out and back
    // …and each hop really LOADED, rather than failing inside selectPreset's catch
    expect(host.load).toHaveBeenCalledTimes(2);
    expect(host.histSwitch).toHaveBeenNthCalledWith(1, 40);
    expect(host.histSwitch).toHaveBeenNthCalledWith(2, 12);
    expect(store).toHaveBeenCalledWith(40); // deep-dump device: the store persists the renamed buffer
    expect(applySlotName).toHaveBeenCalledWith(40, 'Lead');
    expect(recency).not.toHaveBeenCalled(); // the round-trip is not a user load
  });

  it('renameStoredPreset does NOT store on a name-scan device — that would clobber the rename', async () => {
    const { p } = fresh();
    host.canDeepScan = false;
    await p.renameStoredPreset(40, 'Lead');
    expect(store).not.toHaveBeenCalled();
    expect(applySlotName).toHaveBeenCalledWith(40, 'Lead');
  });

  it('renameStoredPreset renames the ACTIVE slot without a round-trip', async () => {
    const { p } = fresh();
    await p.renameStoredPreset(12, 'Lead');
    expect(selectPresetReq).not.toHaveBeenCalled();
    expect(host.poll).toHaveBeenCalled();
  });

  it('renameStoredPreset restores the original slot when the write fails', async () => {
    const { p } = fresh();
    setPresetName.mockResolvedValue({ ok: false });
    const ok = await p.renameStoredPreset(40, 'Lead');
    expect(ok).toBe(false);
    expect(selectPresetReq.mock.calls.map((c) => c[0])).toEqual([40, 12]);
    expect(host.showToast).toHaveBeenCalledWith('Rename failed', '#d6543f');
  });

  it('renameStoredPreset refuses an empty name and an invalid slot', async () => {
    const { p } = fresh();
    expect(await p.renameStoredPreset(40, '   ')).toBe(false);
    expect(await p.renameStoredPreset(-1, 'Lead')).toBe(false);
    expect(setPresetName).not.toHaveBeenCalled();
  });
});

// ── preset watch ────────────────────────────────────────────────────────────────────────────────
describe('watchPreset', () => {
  it('reloads everything when the device moved to another slot', async () => {
    const { p } = fresh();
    p.bufferSource = { path: '/music/Presets/Crunch.syx', name: 'Crunch' };
    currentPreset.mockResolvedValue({ number: 40, name: 'Lead' });
    await p.watchPreset();
    expect(host.lastPreset).toBe(40);
    expect(p.bufferSource).toBe(null);
    expect(host.histSwitch).toHaveBeenCalledWith(40);
    expect(host.load).toHaveBeenCalled();
    expect(host.reloadOpenParams).toHaveBeenCalled();
    expect(refreshSlot).toHaveBeenCalledWith(40);
  });

  it('ignores the flaky -1 the device returns on a modified buffer', async () => {
    const { p } = fresh();
    currentPreset.mockResolvedValue({ number: -1, name: '' });
    await p.watchPreset();
    expect(host.load).not.toHaveBeenCalled();
    expect(host.lastPreset).toBe(12);
  });

  it('recovers a grid that went offline on the same slot', async () => {
    const { p } = fresh();
    host.status = 'offline';
    await p.watchPreset();
    expect(host.load).toHaveBeenCalled();
  });

  it('re-decodes the stored slot at most once a minute as an external-edit safety net', async () => {
    const { p } = fresh();
    await p.watchPreset();
    expect(refreshSlot).toHaveBeenCalledWith(12);
    refreshSlot.mockClear();
    await p.watchPreset(); // immediately again — inside the 60s window
    expect(refreshSlot).not.toHaveBeenCalled();
  });

  it('does nothing on a device without the live current-preset query', async () => {
    const { p } = fresh();
    host.presetLiveQuery = false;
    await p.watchPreset();
    expect(currentPreset).not.toHaveBeenCalled();
  });

  it('sits out a definitions walk — an interleaved read has frozen an FM3', async () => {
    const { p } = fresh();
    deviceDefs.building = true;
    await p.watchPreset();
    deviceDefs.building = false;
    deviceDefs.importing = true;
    await p.watchPreset();
    expect(currentPreset).not.toHaveBeenCalled();
  });

  it('skips a tick rather than queueing behind an in-flight watch', async () => {
    const { p } = fresh();
    let release: (v: { number: number; name: string }) => void = () => {};
    currentPreset.mockReturnValue(new Promise((r) => { release = r; }) as never);
    const first = p.watchPreset();
    await p.watchPreset(); // second tick while the first is still out
    expect(currentPreset).toHaveBeenCalledTimes(1);
    release({ number: 12, name: 'Roundtrip' });
    await first;
  });

  it('runs only every 4th tick on a slow link', async () => {
    const { p } = fresh();
    host.slowLink = true;
    for (let i = 0; i < 8; i++) await p.watchPreset();
    expect(currentPreset).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good grid when the read throws', async () => {
    const { p } = fresh();
    currentPreset.mockRejectedValue(new Error('link down'));
    await p.watchPreset();
    expect(host.load).not.toHaveBeenCalled();
    await p.watchPreset(); // the guard must have been released
    expect(currentPreset).toHaveBeenCalledTimes(2);
  });
});

// ── reactivity (the reason this file runs in the `runes` project) ───────────────────────────────
// `.test.ts` can't host a rune, so — as in `library.runes.test.ts` — reactivity is pinned the way a
// derived reader actually observes it: every write REASSIGNS the object rather than mutating it in
// place, and `$state` hands back a proxy, not the literal that was assigned.
describe('reactivity', () => {
  it('reassigns `local` on every write so derived readers see it', async () => {
    const { p } = fresh();
    const before = p.local;
    configured(p);
    await p.localSync();
    expect(p.local).not.toBe(before);
    expect(p.local.note).toBe('Synced ↓3 to folder');
    expect(p.local.syncing).toBe(false);
  });

  it('holds `local` as a deep $state proxy', () => {
    const { p } = fresh();
    const next = { ...p.local, note: 'hi' };
    p.local = next;
    expect(p.local.note).toBe('hi');
    expect(p.local).not.toBe(next); // proxied on the way in — a plain field would be identical
  });

  it('bufferSource tracks the buffer being replaced', async () => {
    const { p } = fresh();
    expect(p.bufferSource).toBe(null);
    p.bufferSource = { path: '/music/Presets/Crunch.syx', name: 'Crunch' };
    expect(p.bufferSource?.name).toBe('Crunch');
    await p.loadVersion('v1'); // a wholesale buffer swap clears it again
    expect(p.bufferSource).toBe(null);
  });

  it('saveOpen reads through to the overlay registry, not a local boolean', () => {
    const { p } = fresh();
    expect(p.saveOpen).toBe(false);
    overlays.open('save');
    expect(p.saveOpen).toBe(true);
    p.saveOpen = false;
    expect(overlays.isOpen('save')).toBe(false);
  });
});
