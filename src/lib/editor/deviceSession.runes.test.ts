// Contract for the device-session slice (`*.runes.test.ts` → the `runes` vitest project, which
// compiles rune modules against the CLIENT svelte runtime; see vitest.config.ts). Under the server
// runtime `$state` is inert, so the proxy/propagation assertions below would pass vacuously.
//
// What this pins, all of it load-bearing before the extraction and unchanged by it:
//   1. The capability-gate idiom: caps-driven on API v2, the legacy `isAm4` branches on v1, and
//      optional caps fields degrading to false rather than to "supported".
//   2. `slowLink` — the generic-MIDI-adapter detection every meter/watch throttle hangs off.
//   3. Poll-loop discipline: one tick at a time, sat out entirely while a definitions walk owns the
//      transport, and the current-preset round-trip run only every 4th tick on a slow link.
//   4. The optimistic → await → revert shape of the scene/tempo actions, and the capability +
//      range gates in front of them.
//   5. The reconnect sequence in the port/profile picker, including re-asserting the polling mode.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DeviceSessionHost } from './deviceSession.svelte';

// ── module mocks ────────────────────────────────────────────────────────────────────────────────
const health = vi.fn(async () => ({ device: 'FM3', api: { version: 2 } }) as Record<string, unknown>);
const device = vi.fn(async () => null as unknown);
const currentPreset = vi.fn(async () => ({ number: 12, name: 'Roundtrip' }));
const detect = vi.fn(async () => ({ modelId: 0x0a, short: 'fm3', name: 'FM3', connected: true, supported: true }));
const listPorts = vi.fn(async () => ({ ports: [] as unknown[], chosen: null, override: null, profileOverride: null }) as Record<string, unknown>);
const selectPort = vi.fn(async (_c: unknown, _m?: string) => ({ ok: true }));
const getScene = vi.fn(async () => ({ index: 2 }));
const getTempo = vi.fn(async () => ({ bpm: 132 }));
const setTempo = vi.fn(async (_b: number) => ({ ok: true }));
const tapTempoReq = vi.fn(async () => ({ ok: true }));
const setScene = vi.fn(async (_i: number) => ({ ok: true }));
const am4SetScene = vi.fn(async (_i: number) => ({ ok: true }));
const setSceneName = vi.fn(async (_i: number, _n: string) => ({ ok: true }));

vi.mock('$lib/api/forgefx', () => ({
  forgefx: {
    health: () => health(),
    device: () => device(),
    currentPreset: () => currentPreset(),
    detect: () => detect(),
    listPorts: () => listPorts(),
    selectPort: (c: unknown, m?: string) => selectPort(c, m),
    getScene: () => getScene(),
    getTempo: () => getTempo(),
    setTempo: (b: number) => setTempo(b),
    tapTempo: () => tapTempoReq(),
    setScene: (i: number) => setScene(i),
    am4SetScene: (i: number) => am4SetScene(i),
    setSceneName: (i: number, n: string) => setSceneName(i, n)
  }
}));
const defsRefresh = vi.fn();
const deviceDefs = { building: false, importing: false, refresh: (o: unknown) => defsRefresh(o) };
vi.mock('$lib/device/deviceDefs.svelte', () => ({ deviceDefs }));
const record = vi.fn();
vi.mock('./history.svelte', () => ({ history: { record: (e: unknown) => record(e), switchTo: vi.fn() } }));
const clearSlotIfEmpty = vi.fn();
vi.mock('$lib/preset/library.svelte', () => ({ library: { clearSlotIfEmpty: (n: number, name: string) => clearSlotIfEmpty(n, name) } }));

const { DeviceSessionStore } = await import('./deviceSession.svelte');

// A mutable stand-in for the rest of the editor store. Plain vi.fn()s: what's under test is the
// slice's own state, and the real host just forwards into `EditorStore`.
function fakeHost(): DeviceSessionHost {
  return {
    load: vi.fn(async () => {}),
    scheduleSceneReload: vi.fn(),
    showToast: vi.fn(),
    histSwitch: vi.fn(),
    setLinkMs: vi.fn(),
    reapplyPollingMode: vi.fn()
  };
}
const fresh = () => {
  const host = fakeHost();
  return { host, d: new DeviceSessionStore(host) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A v2 device with everything switched on — individual tests knock out the field they're about. */
const fullCaps = () => ({
  presets: { liveQuery: true, canRename: true, canDeepScan: true, canScanNames: true, count: 1024, addressing: 'numeric' },
  meters: { blockMeters: true, liveMonitors: true },
  tempo: true,
  tuner: true,
  gridCursorSelect: true,
  paramsWithoutPack: true,
  sceneNamesWritable: true,
  gridRouting: true,
  hasScenes: true,
  sceneCount: 8,
  telemetryControl: true,
  shuntBase: 2048
});
/** Put the slice on API v2 with the given capabilities. */
function v2(d: InstanceType<typeof DeviceSessionStore>, caps: Record<string, unknown> = fullCaps()) {
  d.apiVersion = 2;
  d.caps = caps as never;
}
/** Put the slice on a legacy v1 server, optionally with an AM4 attached. */
function v1(d: InstanceType<typeof DeviceSessionStore>, am4: boolean) {
  d.apiVersion = 1;
  d.detected = { modelId: am4 ? 0x15 : 0x0a } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  deviceDefs.building = false;
  deviceDefs.importing = false;
  health.mockResolvedValue({ device: 'FM3', api: { version: 2 } });
  device.mockResolvedValue(null);
  currentPreset.mockResolvedValue({ number: 12, name: 'Roundtrip' });
  setSceneName.mockResolvedValue({ ok: true });
  // pickPort/pickProfile end with a loadPorts(), which re-adopts the server's view of the
  // overrides — so every test needs the list mock back at its neutral answer.
  listPorts.mockResolvedValue({ ports: [], chosen: null, override: null, profileOverride: null });
});

// ── capability gates ────────────────────────────────────────────────────────────────────────────
describe('capability gates', () => {
  it('read from caps on API v2', () => {
    const { d } = fresh();
    v2(d);
    expect(d.isV2).toBe(true);
    expect(d.presetLiveQuery).toBe(true);
    expect(d.hasBlockMeters).toBe(true);
    expect(d.hasLiveMonitors).toBe(true);
    expect(d.hasTempo).toBe(true);
    expect(d.hasTuner).toBe(true);
    expect(d.hasCursorSelect).toBe(true);
    expect(d.paramsWithoutPack).toBe(true);
    expect(d.canRenamePresets).toBe(true);
    expect(d.canRenameScenes).toBe(true);
    expect(d.canDeepScan).toBe(true);
    expect(d.canGridRoute).toBe(true);
    expect(d.sceneCount).toBe(8);
    expect(d.hasTelemetryControl).toBe(true);
  });

  it('degrade to false — never to "supported" — when a v2 caps field is absent', () => {
    // v2 caps fields are optional by design so a partial payload from an older/smaller device
    // doesn't claim features it does not have.
    const { d } = fresh();
    v2(d, {});
    expect(d.presetLiveQuery).toBe(false);
    expect(d.hasBlockMeters).toBe(false);
    expect(d.hasLiveMonitors).toBe(false);
    expect(d.hasTempo).toBe(false);
    expect(d.hasTuner).toBe(false);
    expect(d.hasCursorSelect).toBe(false);
    expect(d.paramsWithoutPack).toBe(false);
    expect(d.canRenamePresets).toBe(false);
    expect(d.canRenameScenes).toBe(false);
    expect(d.canDeepScan).toBe(false);
    expect(d.canGridRoute).toBe(false);
    expect(d.sceneCount).toBe(0);
    expect(d.hasTelemetryControl).toBe(false);
    expect(d.bankLetterAddressing).toBe(false);
  });

  it('fall back to the legacy isAm4 branches on a v1 server', () => {
    const gen3 = fresh().d;
    v1(gen3, false);
    expect(gen3.isV2).toBe(false);
    expect(gen3.isAm4).toBe(false);
    expect(gen3.presetLiveQuery).toBe(true);
    expect(gen3.hasBlockMeters).toBe(true);
    expect(gen3.hasTempo).toBe(true);
    expect(gen3.canRenamePresets).toBe(true);
    expect(gen3.canGridRoute).toBe(true);
    expect(gen3.paramsWithoutPack).toBe(false); // gen-3 blocks DO need a definition pack
    expect(gen3.scanNamesOnly).toBe(false); // …and answer full dumps

    const am4 = fresh().d;
    v1(am4, true);
    expect(am4.isAm4).toBe(true);
    expect(am4.presetLiveQuery).toBe(false);
    expect(am4.hasBlockMeters).toBe(false);
    expect(am4.hasTempo).toBe(false);
    expect(am4.canRenamePresets).toBe(false);
    expect(am4.canGridRoute).toBe(false); // flat chain — no grid routing to gate on
    expect(am4.paramsWithoutPack).toBe(true);
    expect(am4.scanNamesOnly).toBe(true);
  });

  it('scanNamesOnly means name-scan AND no deep scan', () => {
    const { d } = fresh();
    v2(d, { presets: { canScanNames: true, canDeepScan: true } });
    expect(d.scanNamesOnly).toBe(false); // deep scan wins
    v2(d, { presets: { canScanNames: true } });
    expect(d.scanNamesOnly).toBe(true);
    v2(d, { presets: { canDeepScan: true } });
    expect(d.scanNamesOnly).toBe(false);
  });

  it('bank-letter addressing and telemetry control are caps-only — no v1 fallback', () => {
    const { d } = fresh();
    v1(d, false); // legacy server, but caps happen to be present
    d.caps = { presets: { addressing: 'bankLetter' }, telemetryControl: true } as never;
    expect(d.isV2).toBe(false);
    expect(d.bankLetterAddressing).toBe(true);
    expect(d.hasTelemetryControl).toBe(true);
  });

  it('sceneCount is 0 unless the device actually has scenes', () => {
    const { d } = fresh();
    v2(d, { hasScenes: false, sceneCount: 8 });
    expect(d.sceneCount).toBe(0);
  });

  it('gates recompute live as caps change — the reason they are getters over $state', () => {
    const { d } = fresh();
    const caps = fullCaps();
    v2(d, caps);
    expect(d.canDeepScan).toBe(true);
    // Deep `$state` hands back a proxy, not the object handed in — which is exactly what makes an
    // in-place write to a nested caps field visible to every reader of the gate.
    expect(d.caps).not.toBe(caps);
    d.caps!.presets!.canDeepScan = false;
    expect(d.canDeepScan).toBe(false);
    expect(d.scanNamesOnly).toBe(true); // …and the gate derived from it follows
  });
});

// ── slow link ───────────────────────────────────────────────────────────────────────────────────
describe('slowLink', () => {
  const midi = (id: string, fractal: boolean) => ({ id, transport: 'midi', fractal });

  it('is false without a MIDI link', () => {
    const { d } = fresh();
    expect(d.slowLink).toBe(false); // nothing chosen yet
    d.portChosen = { transport: 'serial', id: 'usb0' } as never;
    expect(d.slowLink).toBe(false);
  });

  it("is false on a device's OWN USB-MIDI port and true through a generic adapter", () => {
    const { d } = fresh();
    d.ports = [midi('a', true), midi('b', false)] as never;
    d.portChosen = { transport: 'midi', id: 'a' } as never;
    expect(d.slowLink).toBe(false); // Fractal-named USB-MIDI = full speed
    d.portChosen = { transport: 'midi', id: 'b' } as never;
    expect(d.slowLink).toBe(true); // generic MIDI→5-pin DIN ≈ 31.25 kbaud
  });

  it('matches on the IN port when the pick names one', () => {
    const { d } = fresh();
    d.ports = [midi('in', false), midi('out', true)] as never;
    d.portChosen = { transport: 'midi', id: 'out', inId: 'in' } as never;
    expect(d.slowLink).toBe(true);
  });

  it('does not throttle a port it cannot identify', () => {
    const { d } = fresh();
    d.ports = [] as never;
    d.portChosen = { transport: 'midi', id: 'ghost' } as never;
    expect(d.slowLink).toBe(false);
  });
});

// ── handshake ───────────────────────────────────────────────────────────────────────────────────
describe('handshake', () => {
  it('adopts caps, API version and slot count, then refreshes the definitions profile', async () => {
    const { d } = fresh();
    device.mockResolvedValue({ model: 'FM3', modelByte: 0x0a, apiVersion: 2, firmware: { version: '7.02' }, capabilities: fullCaps() });
    await d.handshake();
    expect(d.apiVersion).toBe(2);
    expect(d.presetCount).toBe(1024);
    expect(d.canDeepScan).toBe(true);
    expect(defsRefresh).toHaveBeenCalledWith(expect.objectContaining({ model: 'FM3', firmware: '7.02' }));
  });

  it('survives an engine that is not up yet — poll() retries and adopts later', async () => {
    const { d } = fresh();
    device.mockRejectedValue(new Error('ECONNREFUSED'));
    await d.handshake();
    expect(d.caps).toBeNull();
    expect(d.apiVersion).toBe(1);
    expect(defsRefresh).not.toHaveBeenCalled();
  });
});

// ── poll loop ───────────────────────────────────────────────────────────────────────────────────
describe('poll', () => {
  it('goes online, adopts the negotiated version, and reads the current preset', async () => {
    const { host, d } = fresh();
    device.mockResolvedValue({ apiVersion: 2, firmware: { version: '7.02' }, capabilities: fullCaps() });
    await d.poll();
    expect(d.conn).toEqual({ state: 'online', fw: '7.02', device: 'FM3' });
    expect(d.apiVersion).toBe(2);
    expect(d.preset).toEqual({ number: 12, name: 'Roundtrip' });
    expect(host.histSwitch).toHaveBeenCalledWith(12);
    expect(host.setLinkMs).toHaveBeenCalledWith(expect.any(Number)); // serial round-trip latency
    expect(clearSlotIfEmpty).toHaveBeenCalledWith(12, 'Roundtrip');
  });

  it('goes offline when the health check fails, and clears the guard for the next tick', async () => {
    const { d } = fresh();
    health.mockRejectedValueOnce(new Error('down'));
    await d.poll();
    expect(d.conn).toEqual({ state: 'offline' });
    await d.poll();
    expect(d.conn.state).toBe('online'); // not wedged
  });

  it('never lets two ticks stack serial ops', async () => {
    const { d } = fresh();
    let release: (v: Record<string, unknown>) => void = () => {};
    health.mockReturnValueOnce(new Promise<Record<string, unknown>>((r) => { release = r; }));
    const first = d.poll();
    await flush();
    await d.poll(); // second tick while the first is in flight
    expect(health).toHaveBeenCalledTimes(1);
    release({ device: 'FM3', api: { version: 2 } });
    await first;
    await d.poll();
    expect(health).toHaveBeenCalledTimes(2);
  });

  it('sits the whole tick out while a definitions walk owns the transport', async () => {
    const { d } = fresh();
    deviceDefs.building = true;
    await d.poll();
    expect(health).not.toHaveBeenCalled();
    deviceDefs.building = false;
    deviceDefs.importing = true;
    await d.poll();
    expect(health).not.toHaveBeenCalled();
  });

  it('keeps connection state fresh but runs the preset round-trip only every 4th tick on a slow link', async () => {
    const { d } = fresh();
    v2(d);
    d.ports = [{ id: 'b', transport: 'midi', fractal: false }] as never;
    d.portChosen = { transport: 'midi', id: 'b' } as never;
    expect(d.slowLink).toBe(true);
    for (let i = 0; i < 8; i++) await d.poll();
    expect(health).toHaveBeenCalledTimes(8); // free — every tick
    expect(currentPreset).toHaveBeenCalledTimes(2); // real device read — ticks 0 and 4
  });

  it('skips the preset query entirely on a device with no live current-preset support', async () => {
    const { d } = fresh();
    v1(d, true); // AM4 → presetLiveQuery false
    health.mockResolvedValue({ device: 'AM4', api: { version: 1 } });
    await d.poll();
    expect(currentPreset).not.toHaveBeenCalled();
    expect(d.conn.state).toBe('online'); // connection state still tracked
  });

  it('ignores a -1 preset read rather than storing it', async () => {
    const { host, d } = fresh();
    v2(d);
    currentPreset.mockResolvedValue({ number: -1, name: '' });
    await d.poll();
    expect(d.preset).toBeNull();
    expect(host.histSwitch).not.toHaveBeenCalled();
  });
});

// ── scene + tempo pull ──────────────────────────────────────────────────────────────────────────
describe('syncSceneTempo', () => {
  it('adopts the device scene (0-based → 1-based) and tempo', async () => {
    const { d } = fresh();
    v2(d);
    await d.syncSceneTempo();
    expect(d.scene).toBe(3);
    expect(d.bpm).toBe(132);
  });

  it('reads nothing at all on a legacy AM4 — the frames it ignores cost a 5s timeout each', async () => {
    const { d } = fresh();
    v1(d, true);
    await d.syncSceneTempo();
    expect(getScene).not.toHaveBeenCalled();
    expect(getTempo).not.toHaveBeenCalled();
  });

  it('asks only for what the device has', async () => {
    const { d } = fresh();
    v2(d, { hasScenes: false, tempo: true });
    await d.syncSceneTempo();
    expect(getScene).not.toHaveBeenCalled();
    expect(getTempo).toHaveBeenCalled();
  });

  it('ignores a failed scene read', async () => {
    const { d } = fresh();
    v2(d);
    getScene.mockResolvedValueOnce({ index: -1 });
    await d.syncSceneTempo();
    expect(d.scene).toBe(1); // unchanged
  });
});

// ── scene actions ───────────────────────────────────────────────────────────────────────────────
describe('selectScene', () => {
  it('is optimistic, records history, and reflects without a full preset dump', async () => {
    const { host, d } = fresh();
    v2(d);
    const p = d.selectScene(3);
    expect(d.scene).toBe(3); // optimistic — before the device answers
    await p;
    expect(setScene).toHaveBeenCalledWith(2); // UI 1..8 → device 0..7
    expect(record).toHaveBeenCalledWith({ kind: 'scene', from: 1, to: 3 });
    expect(host.scheduleSceneReload).toHaveBeenCalledTimes(1); // lightweight reflect, not load()
    expect(host.load).not.toHaveBeenCalled();
  });

  it('reverts and records nothing when the device refuses', async () => {
    const { host, d } = fresh();
    v2(d);
    setScene.mockRejectedValueOnce(new Error('nope'));
    await d.selectScene(4);
    expect(d.scene).toBe(1);
    expect(record).not.toHaveBeenCalled();
    expect(host.scheduleSceneReload).not.toHaveBeenCalled();
  });

  it('is a no-op when the scene is already selected', async () => {
    const { d } = fresh();
    v2(d);
    await d.selectScene(1);
    expect(setScene).not.toHaveBeenCalled();
  });

  it('uses the AM4 route on a legacy v1 server', async () => {
    const { d } = fresh();
    v1(d, true);
    await d.selectScene(2);
    expect(am4SetScene).toHaveBeenCalledWith(1);
    expect(setScene).not.toHaveBeenCalled();
  });
});

describe('renameScene', () => {
  const ready = () => {
    const f = fresh();
    v2(f.d);
    f.d.sceneNames = ['One', 'Two', 'Three'];
    return f;
  };

  it('is optimistic, then re-reads the grid to confirm the device stored it', async () => {
    const { host, d } = ready();
    const p = d.renameScene(2, 'Crunch');
    expect(d.sceneNames[1]).toBe('Crunch'); // optimistic
    await p;
    expect(setSceneName).toHaveBeenCalledWith(1, 'Crunch');
    expect(record).toHaveBeenCalledWith({ kind: 'sceneName', index: 1, from: 'Two', to: 'Crunch' });
    expect(host.load).toHaveBeenCalledTimes(1);
  });

  it('strips non-printable characters and caps the name at 32', async () => {
    const { d } = ready();
    await d.renameScene(1, '  Lead Boost\n'.padEnd(60, 'x'));
    const sent = setSceneName.mock.calls[0][1];
    expect(sent).toHaveLength(32);
    expect(sent).toBe('  Lead Boost'.padEnd(32, 'x'));
  });

  it('reverts and toasts when the device rejects it', async () => {
    const { host, d } = ready();
    setSceneName.mockResolvedValueOnce({ ok: false });
    await d.renameScene(2, 'Crunch');
    expect(d.sceneNames[1]).toBe('Two'); // reverted
    expect(host.showToast).toHaveBeenCalledWith('Scene rename failed', '#d6543f');
    expect(host.load).not.toHaveBeenCalled();
  });

  it('refuses when the device cannot rename scenes, or the index is out of range', async () => {
    const { d } = ready();
    d.caps!.sceneNamesWritable = false;
    await d.renameScene(2, 'Crunch');
    expect(setSceneName).not.toHaveBeenCalled();

    d.caps!.sceneNamesWritable = true;
    await d.renameScene(0, 'Crunch');
    await d.renameScene(9, 'Crunch'); // sceneCount is 8
    expect(setSceneName).not.toHaveBeenCalled();
  });
});

// ── tempo actions ───────────────────────────────────────────────────────────────────────────────
describe('tempo', () => {
  it('rounds and applies a tempo optimistically', async () => {
    const { d } = fresh();
    const p = d.setBpm(128.4);
    expect(d.bpm).toBe(128);
    await p;
    expect(setTempo).toHaveBeenCalledWith(128);
  });

  it('refuses a tempo outside the device range', async () => {
    const { d } = fresh();
    await d.setBpm(19);
    await d.setBpm(251);
    await d.setBpm(Number.NaN);
    expect(setTempo).not.toHaveBeenCalled();
    expect(d.bpm).toBe(120);
  });

  it('pulls the new tempo back after a tap', async () => {
    const { d } = fresh();
    await d.tapTempo();
    expect(tapTempoReq).toHaveBeenCalled();
    expect(d.bpm).toBe(132);
  });
});

// ── device-event hooks ──────────────────────────────────────────────────────────────────────────
describe('device-event hooks', () => {
  it('a device-side scene switch badges immediately and reflects lightweight', () => {
    const { host, d } = fresh();
    d.applyScene(4); // device index
    expect(d.scene).toBe(5); // 1-based in the UI
    expect(host.scheduleSceneReload).toHaveBeenCalledTimes(1);
  });

  it('a pushed tempo lands with no round-trip', () => {
    const { d } = fresh();
    d.applyTempo(96);
    expect(d.bpm).toBe(96);
    expect(setTempo).not.toHaveBeenCalled();
  });
});

// ── connection picker ───────────────────────────────────────────────────────────────────────────
describe('connection picker', () => {
  it('loads ports Fractal-first and adopts the current overrides', async () => {
    const { d } = fresh();
    listPorts.mockResolvedValue({
      ports: [{ id: 'generic', transport: 'midi', fractal: false }, { id: 'fm3', transport: 'serial', fractal: true }],
      chosen: { transport: 'serial', id: 'fm3' },
      override: null,
      profileOverride: 'fm3'
    });
    await d.loadPorts();
    expect(d.ports.map((p) => p.id)).toEqual(['fm3', 'generic']);
    expect(d.portChosen).toEqual({ transport: 'serial', id: 'fm3' });
    expect(d.profileOverride).toBe('fm3');
  });

  it('opening the picker shows it and refreshes the list', async () => {
    const { d } = fresh();
    await d.openPorts();
    expect(d.portsOpen).toBe(true);
    expect(listPorts).toHaveBeenCalled();
  });

  it('picking a port closes the popover, reconnects, re-detects and re-asserts the polling mode', async () => {
    const { host, d } = fresh();
    d.portsOpen = true;
    await d.pickPort({ transport: 'midi', id: 'b' } as never);
    expect(d.portsOpen).toBe(false);
    expect(selectPort).toHaveBeenCalledWith({ transport: 'midi', id: 'b' }, undefined);
    expect(selectPort.mock.calls[0][1]).toBeUndefined(); // no model sent → a forced profile survives a port change
    expect(health).toHaveBeenCalled(); // poll() ran → connection state refreshed
    expect(d.detected).toMatchObject({ short: 'fm3' });
    expect(host.load).toHaveBeenCalledTimes(1);
    expect(host.reapplyPollingMode).toHaveBeenCalledTimes(1);
    expect(host.showToast).toHaveBeenCalledWith('Connection changed', '#35c9d6');
  });

  it('reports a failed port switch instead of leaving the UI mid-reconnect', async () => {
    const { host, d } = fresh();
    selectPort.mockRejectedValueOnce(new Error('busy'));
    await d.pickPort(null);
    expect(host.showToast).toHaveBeenCalledWith('Could not switch connection', '#d6543f');
    expect(host.load).not.toHaveBeenCalled();
  });

  it('forcing a profile keeps any manual PORT override', async () => {
    const { host, d } = fresh();
    d.portOverride = { transport: 'midi', id: 'b' } as never;
    listPorts.mockResolvedValue({ ports: [], chosen: null, override: null, profileOverride: 'fm3' });
    await d.pickProfile('fm3' as never);
    // The manual port override is passed back, NOT the resolved auto connection — otherwise forcing
    // a profile would pin whatever port auto-detect happened to land on.
    expect(selectPort).toHaveBeenCalledWith({ transport: 'midi', id: 'b' }, 'fm3');
    expect(d.profileOverride).toBe('fm3');
    expect(host.reapplyPollingMode).toHaveBeenCalledTimes(1);
    expect(host.showToast).toHaveBeenCalledWith('Device profile forced: FM3', '#35c9d6');
  });

  it("clearing the profile back to 'auto' drops the override", async () => {
    const { host, d } = fresh();
    d.profileOverride = 'fm3';
    await d.pickProfile('auto' as never);
    expect(d.profileOverride).toBeNull();
    expect(host.showToast).toHaveBeenCalledWith('Device profile: auto-detect', '#35c9d6');
  });

  it('lets the engine have the last word on what is actually overridden', async () => {
    // The optimistic set is immediately reconciled: pickProfile ends with a loadPorts(), so an
    // engine that refused (or silently dropped) the forced profile leaves the UI showing auto.
    const { d } = fresh();
    listPorts.mockResolvedValue({ ports: [], chosen: null, override: null, profileOverride: null });
    await d.pickProfile('fm9' as never);
    expect(d.profileOverride).toBeNull();
  });
});
