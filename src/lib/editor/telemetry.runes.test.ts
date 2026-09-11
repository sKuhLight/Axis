// Contract for the telemetry slice (`*.runes.test.ts` → the `runes` vitest project, which compiles
// rune modules against the CLIENT svelte runtime; see vitest.config.ts). Under the server runtime
// `$state` is inert, so the reassignment/propagation assertions below would pass vacuously.
//
// Four things this pins, all of which were load-bearing before the extraction and stayed that way:
//   1. `scrubPII` strips emails + home-directory usernames from anything leaving the machine.
//   2. Polling-mode transitions: optimistic → PUT → persist, revert on failure, and a server echo
//      that adopts WITHOUT writing back (the loop that would otherwise form).
//   3. Consent defaults OFF, is asked at most once, and never gates the per-incident debug upload.
//   4. The live-meter loop reads exactly ONE block per tick, and only when it's allowed to — a
//      full-preset sweep serializes behind every other read on the shared request chain.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TelemetryHost } from './telemetry.svelte';

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
vi.stubGlobal('__APP_VERSION__', '0.0.0-test');
vi.stubGlobal('navigator', { platform: 'TestOS' }); // the debug report stamps the platform

// ── module mocks ────────────────────────────────────────────────────────────────────────────────
const telemetryStatus = vi.fn(async () => ({ enabled: false, uploadEnabled: false, faroUrl: '' }));
const setTelemetryMode = vi.fn(async (_m: string) => ({ ok: true }));
const monitorsLive = vi.fn(async (_eid: number) => [] as { effectId: number; norm: number; db: number }[]);
const looper = vi.fn(async (_eid: number) => ({ wave: [0], position: 0, level: 0 }));
const setTuner = vi.fn(async (_on: boolean) => ({ ok: true }));
const diag = vi.fn(async () => ({ engine: 'test' }));
const uploadDebugReport = vi.fn(async (_r: unknown) => ({ stored: 2048 }));

vi.mock('$lib/api/forgefx', () => ({
  CLIENT_ID: 'test-client',
  isDirect: () => false,
  forgefx: {
    telemetryStatus: () => telemetryStatus(),
    setTelemetryMode: (m: string) => setTelemetryMode(m),
    monitorsLive: (eid: number) => monitorsLive(eid),
    looper: (eid: number) => looper(eid),
    setTuner: (on: boolean) => setTuner(on),
    diag: () => diag(),
    uploadDebugReport: (r: unknown) => uploadDebugReport(r),
    events: () => null
  }
}));
const initFaro = vi.fn(async (_o: unknown) => {});
const pauseFaro = vi.fn();
const resumeFaro = vi.fn();
vi.mock('$lib/api/faro', () => ({
  initFaro: (o: unknown) => initFaro(o as never),
  pauseFaro: () => pauseFaro(),
  resumeFaro: () => resumeFaro(),
  faroDeviceError: vi.fn()
}));
const onBuildEvent = vi.fn();
vi.mock('$lib/device/deviceDefs.svelte', () => ({ deviceDefs: { onBuildEvent: (e: unknown) => onBuildEvent(e) } }));

const { TelemetryStore, scrubPII } = await import('./telemetry.svelte');

// A mutable stand-in for the rest of the editor store. Plain fields: what's under test is the
// slice's own reactivity, and the real host feeds these from its `$state`.
type Fake = TelemetryHost & {
  status: 'loading' | 'ready' | 'offline';
  hasLiveMonitors: boolean;
  slowLink: boolean;
  hasTelemetryControl: boolean;
  connDevice: string | undefined;
  connFw: string | undefined;
  contact: string;
  selectedEffectId: number | null;
  blockSlug: string | null;
  inLibrary: boolean;
  onVirtualScreen: boolean;
};
function fakeHost(over: Partial<Fake> = {}): Fake {
  return {
    status: 'ready',
    hasLiveMonitors: true,
    slowLink: false,
    hasTelemetryControl: true,
    connDevice: 'FM3',
    connFw: '7.02',
    contact: '',
    selectedEffectId: 106,
    blockSlug: 'amp',
    inLibrary: false,
    onVirtualScreen: false,
    showToast: vi.fn(),
    persistProfile: vi.fn(),
    onConsentResolved: vi.fn(),
    applyTempo: vi.fn(),
    applyScene: vi.fn(),
    applyParamEcho: vi.fn(),
    applyConfig: vi.fn(),
    scheduleBlockStateReload: vi.fn(),
    scheduleStructuralReload: vi.fn(),
    ...over
  };
}
const fresh = (over: Partial<Fake> = {}) => {
  const host = fakeHost(over);
  return { host, t: new TelemetryStore(host) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  telemetryStatus.mockResolvedValue({ enabled: false, uploadEnabled: false, faroUrl: '' });
  setTelemetryMode.mockResolvedValue({ ok: true });
  monitorsLive.mockResolvedValue([]);
});

// ── privacy ─────────────────────────────────────────────────────────────────────────────────────
describe('scrubPII', () => {
  it('replaces email addresses', () => {
    expect(scrubPII('contact tn.pablo+axis@protonmail.com about it')).toBe('contact <email> about it');
  });

  it('replaces the username in POSIX and Windows home paths', () => {
    expect(scrubPII('/Users/pablo/code/Axis/log.txt')).toBe('/Users/<user>/code/Axis/log.txt');
    expect(scrubPII('/home/pablo/.config/axis')).toBe('/home/<user>/.config/axis');
    expect(scrubPII('C:\\Users\\Pablo\\AppData\\axis.log')).toBe('C:\\Users\\<user>\\AppData\\axis.log');
  });

  it('leaves a path with no username segment alone', () => {
    expect(scrubPII('/opt/forgefx/engine.log')).toBe('/opt/forgefx/engine.log');
  });
});

// ── polling mode ────────────────────────────────────────────────────────────────────────────────
describe('polling mode', () => {
  it('seeds from the local mirror, defaulting to balanced and rejecting garbage', () => {
    expect(fresh().t.pollingMode).toBe('balanced');
    localStorage.setItem('axs.telemetry.pollingMode', 'performance');
    expect(fresh().t.pollingMode).toBe('performance');
    localStorage.setItem('axs.telemetry.pollingMode', 'turbo');
    expect(fresh().t.pollingMode).toBe('balanced');
  });

  it('a local change is optimistic, then persists the mirror + profile once the PUT lands', async () => {
    const { host, t } = fresh();
    const p = t.setPollingMode('reduced');
    expect(t.pollingMode).toBe('reduced'); // optimistic — before the PUT resolves
    expect(localStorage.getItem('axs.telemetry.pollingMode')).toBeNull();
    await p;
    expect(setTelemetryMode).toHaveBeenCalledWith('reduced');
    expect(localStorage.getItem('axs.telemetry.pollingMode')).toBe('reduced');
    expect(host.persistProfile).toHaveBeenCalledTimes(1);
  });

  it('reverts, toasts, and leaves nothing persisted when the device rejects it', async () => {
    const { host, t } = fresh();
    setTelemetryMode.mockRejectedValueOnce(new Error('unsupported'));
    await t.setPollingMode('performance');
    expect(t.pollingMode).toBe('balanced'); // reverted
    expect(localStorage.getItem('axs.telemetry.pollingMode')).toBeNull(); // a rejected change never leaks
    expect(host.persistProfile).not.toHaveBeenCalled();
    expect(host.showToast).toHaveBeenCalledWith('Could not change polling mode', '#d6543f');
  });

  it('is a no-op when the mode is unchanged', async () => {
    const { t } = fresh();
    await t.setPollingMode('balanced');
    expect(setTelemetryMode).not.toHaveBeenCalled();
  });

  it('adopts a server echo WITHOUT writing back — the loop that would otherwise form', () => {
    const { host, t } = fresh();
    t.applyDeviceEvent({ type: 'telemetryConfig', mode: 'reduced' } as never);
    expect(t.pollingMode).toBe('reduced');
    expect(localStorage.getItem('axs.telemetry.pollingMode')).toBe('reduced');
    expect(setTelemetryMode).not.toHaveBeenCalled(); // no PUT
    expect(host.persistProfile).not.toHaveBeenCalled(); // no profile write
  });

  it('re-applies to the device on reconnect only when caps say the control exists', () => {
    fresh({ hasTelemetryControl: false }).t.reapplyPollingMode();
    expect(setTelemetryMode).not.toHaveBeenCalled();
    fresh({ hasTelemetryControl: true }).t.reapplyPollingMode();
    expect(setTelemetryMode).toHaveBeenCalledWith('balanced');
  });

  it('adopting a profile mode pushes to the device but never re-persists', () => {
    const { host, t } = fresh();
    t.adoptPollingMode('performance');
    expect(t.pollingMode).toBe('performance');
    expect(localStorage.getItem('axs.telemetry.pollingMode')).toBe('performance');
    expect(setTelemetryMode).toHaveBeenCalledWith('performance');
    expect(host.persistProfile).not.toHaveBeenCalled();
  });
});

// ── consent gate ────────────────────────────────────────────────────────────────────────────────
describe('consent gate', () => {
  it('defaults OFF with nothing stored', () => {
    expect(fresh().t.telemetry.consent).toBe(false);
  });

  it('asks once when the build ships diagnostics and the user has not chosen', async () => {
    const { host, t } = fresh();
    telemetryStatus.mockResolvedValue({ enabled: true, uploadEnabled: true, faroUrl: 'https://faro.test' });
    await t.init();
    expect(t.consentPromptOpen).toBe(true);
    expect(host.onConsentResolved).not.toHaveBeenCalled(); // the chain waits on the answer
    expect(initFaro).not.toHaveBeenCalled(); // no consent yet → no RUM
  });

  it('does not ask again once a choice is recorded, and hands straight to the onboarding chain', async () => {
    localStorage.setItem('axs.telemetry.decided', '1');
    const { host, t } = fresh();
    telemetryStatus.mockResolvedValue({ enabled: true, uploadEnabled: true, faroUrl: 'https://faro.test' });
    await t.init();
    expect(t.consentPromptOpen).toBe(false);
    expect(host.onConsentResolved).toHaveBeenCalledTimes(1);
  });

  it('never asks when the build has diagnostics switched off', async () => {
    const { host, t } = fresh();
    await t.init(); // enabled: false
    expect(t.consentPromptOpen).toBe(false);
    expect(host.onConsentResolved).toHaveBeenCalledTimes(1);
  });

  it('answering closes the prompt, records the choice, and resumes the chain', () => {
    const { host, t } = fresh();
    t.consentPromptOpen = true;
    t.decideTelemetry(false);
    expect(t.consentPromptOpen).toBe(false);
    expect(t.telemetry.consent).toBe(false);
    expect(localStorage.getItem('axs.telemetry.consent')).toBe('0');
    expect(localStorage.getItem('axs.telemetry.decided')).toBe('1'); // declining is a decision too
    expect(host.persistProfile).toHaveBeenCalledTimes(1);
    expect(host.onConsentResolved).toHaveBeenCalledTimes(1);
  });

  it('opting in mid-session starts RUM; opting back out pauses it at once', async () => {
    const { t } = fresh();
    telemetryStatus.mockResolvedValue({ enabled: true, uploadEnabled: false, faroUrl: 'https://faro.test' });
    localStorage.setItem('axs.telemetry.decided', '1');
    await t.init();
    expect(initFaro).not.toHaveBeenCalled();

    t.setTelemetryConsent(true);
    await flush();
    expect(initFaro).toHaveBeenCalledTimes(1);

    t.setTelemetryConsent(false);
    await flush();
    expect(pauseFaro).toHaveBeenCalledTimes(1);
  });

  it('the instance id is a uuid, persisted, and never carries a name', () => {
    const id = fresh().t.telemetry.instanceId;
    expect(id).toMatch(/^[0-9a-f-]{8,}$/i);
    expect(fresh().t.telemetry.instanceId).toBe(id); // stable across sessions
  });

  it('the per-incident debug upload works with consent OFF, and scrubs what it sends', async () => {
    const { host, t } = fresh({ contact: 'forum: pablo' });
    t.telemetry = { ...t.telemetry, uploadEnabled: true };
    expect(t.telemetry.consent).toBe(false);
    t.recordEvent('error', 'device-comm failed for pablo@example.com');

    expect(await t.uploadDebugReport({ kind: 'manual' })).toBe(true);
    const sent = uploadDebugReport.mock.calls[0][0] as { events: { text: string }[]; contact?: string; instanceId: string };
    expect(sent.events[0].text).toBe('device-comm failed for <email>');
    expect(sent.contact).toBe('forum: pablo'); // opt-in and user-typed — deliberately not scrubbed
    expect(sent.instanceId).toBe(t.telemetry.instanceId);
    expect(host.showToast).toHaveBeenCalledWith(expect.stringContaining('Debug report sent'), '#33c46b');
  });

  it('refuses a second concurrent upload and clears the sending flag afterwards', async () => {
    const { t } = fresh();
    let release: (v: { stored: number }) => void = () => {};
    uploadDebugReport.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const first = t.uploadDebugReport();
    await flush();
    expect(t.telemetry.sending).toBe(true);
    expect(await t.uploadDebugReport()).toBe(false); // rejected while one is in flight
    release({ stored: 1 });
    await first;
    expect(t.telemetry.sending).toBe(false);
  });

  it('debounces the upload prompt per category and only offers it when upload is configured', () => {
    const { t } = fresh();
    t.offerDebugReport({ kind: 'device-comm' });
    expect(t.reportPrompt).toBeNull(); // uploadEnabled is false — nothing to upload to

    t.telemetry = { ...t.telemetry, uploadEnabled: true };
    t.offerDebugReport({ kind: 'device-comm', route: '/preset/grid' });
    expect(t.reportPrompt).toEqual({ kind: 'device-comm', route: '/preset/grid' });

    t.dismissReportPrompt();
    t.offerDebugReport({ kind: 'device-comm', route: '/preset/grid' });
    expect(t.reportPrompt).toBeNull(); // same category within 5 min → suppressed
    t.offerDebugReport({ kind: 'engine' });
    expect(t.reportPrompt).toEqual({ kind: 'engine' }); // a different category still gets through
  });
});

// ── live meters ─────────────────────────────────────────────────────────────────────────────────
describe('live meters', () => {
  it('canMeterBlocks tracks the host capability/link gates', () => {
    expect(fresh().t.canMeterBlocks).toBe(true);
    const { host, t } = fresh();
    host.status = 'offline';
    expect(t.canMeterBlocks).toBe(false); // the getter recomputes — not a snapshot
    host.status = 'ready';
    host.slowLink = true;
    expect(t.canMeterBlocks).toBe(false);
    host.slowLink = false;
    host.hasLiveMonitors = false;
    expect(t.canMeterBlocks).toBe(false);
  });

  it('reads ONLY the open block and drops rows belonging to anything else', async () => {
    const { t } = fresh({ selectedEffectId: 106, blockSlug: null });
    monitorsLive.mockResolvedValue([
      { effectId: 106, norm: 0.5, db: -6 },
      { effectId: 106, norm: 0.25, db: -12 },
      { effectId: 200, norm: 1, db: 0 } // another block — must not land in our bucket
    ]);
    t.startLiveMeters();
    await flush();
    t.stopLiveMeters();

    expect(monitorsLive).toHaveBeenCalledTimes(1);
    expect(monitorsLive).toHaveBeenCalledWith(106); // ONE block per tick, never a sweep
  });

  it('reassigns liveMeters so derived readers see the new rows', async () => {
    const { t } = fresh({ selectedEffectId: 106, blockSlug: null });
    const before = t.liveMeters;
    monitorsLive.mockResolvedValue([{ effectId: 106, norm: 0.5, db: -6 }, { effectId: 200, norm: 1, db: 0 }]);
    t.startLiveMeters();
    await flush();

    expect(t.liveMeters).not.toBe(before); // reassigned, not mutated in place
    expect(t.monitorsFor(106)).toHaveLength(1);
    expect(t.monitorFor(106)?.db).toBe(-6);
    expect(t.monitorsFor(200)).toEqual([]);

    t.stopLiveMeters();
    expect(t.monitorFor(106)).toBeNull(); // stopping clears the readings
  });

  it('issues no device read while metering is off, in the library, or on a virtual screen', async () => {
    const off = fresh();
    off.t.meteringOn = false;
    off.t.startLiveMeters();
    await flush();
    off.t.stopLiveMeters();

    const lib = fresh({ inLibrary: true });
    lib.t.startLiveMeters();
    await flush();
    lib.t.stopLiveMeters();

    const virt = fresh({ onVirtualScreen: true });
    virt.t.startLiveMeters();
    await flush();
    virt.t.stopLiveMeters();

    const none = fresh({ selectedEffectId: null });
    none.t.startLiveMeters();
    await flush();
    none.t.stopLiveMeters();

    expect(monitorsLive).not.toHaveBeenCalled();
  });

  it('fetches the looper waveform only for an open Looper block', async () => {
    const amp = fresh({ blockSlug: 'amp' });
    amp.t.startLiveMeters();
    await flush();
    amp.t.stopLiveMeters();
    expect(looper).not.toHaveBeenCalled();

    const lp = fresh({ blockSlug: 'looper' });
    lp.t.startLiveMeters();
    await flush();
    lp.t.stopLiveMeters();
    expect(looper).toHaveBeenCalledWith(106);
  });

  // KNOWN GAP (pre-dates the extraction — identical on `main`, recorded not fixed here): the
  // `if (this.#liveMeterTimer) return` guard only holds once a tick has RESCHEDULED. `tick()` nulls
  // the handle as its first statement and runs synchronously from `startLiveMeters()`, so a second
  // start while a read is in flight does stack a second loop. `load()` is the only caller, so two
  // overlapping loads double the meter cadence until one loop is stopped.
  it('a second start is a no-op once the loop is idle between ticks', async () => {
    const { t } = fresh({ blockSlug: null });
    t.startLiveMeters();
    await flush(); // first tick done → the handle is set again
    t.startLiveMeters(); // guarded
    await flush();
    t.stopLiveMeters();
    expect(monitorsLive).toHaveBeenCalledTimes(1);
  });

  it('starting again mid-read stacks a second loop — the known gap above', async () => {
    const { t } = fresh({ blockSlug: null });
    t.startLiveMeters();
    t.startLiveMeters(); // still inside the first tick's await → not guarded
    await flush();
    t.stopLiveMeters();
    expect(monitorsLive).toHaveBeenCalledTimes(2);
  });
});

// ── the single device-event path ────────────────────────────────────────────────────────────────
describe('applyDeviceEvent', () => {
  it('writes the telemetry readouts it owns', () => {
    const { t } = fresh();
    t.applyDeviceEvent({ type: 'tuner', freq: 440, note: 'A', cents: -3, octave: 4 } as never);
    expect(t.tuner).toMatchObject({ freq: 440, note: 'A', cents: -3 });
    expect(t.tuner.active).toBe(false); // an incoming reading never arms the tuner

    t.applyDeviceEvent({ type: 'cpu', percent: 42 } as never);
    expect(t.cpu).toBe(42);

    t.applyDeviceEvent({ type: 'meters', out1L: -6, out1R: -7, out2L: -8, out2R: -9 } as never);
    expect(t.levels).toEqual({ out1L: -6, out1R: -7, out2L: -8, out2R: -9 });

    const before = t.traffic;
    t.applyDeviceEvent({ type: 'traffic', txMsgs: 1, txBytes: 2, rxMsgs: 3, rxBytes: 4, since: 5, loops: 6 } as never);
    expect(t.traffic).not.toBe(before);
    expect(t.traffic).toEqual({ txMsgs: 1, txBytes: 2, rxMsgs: 3, rxBytes: 4, since: 5, loops: 6 });
  });

  it('hands every other case to the slice that owns it, exactly once', () => {
    const { host, t } = fresh();
    t.applyDeviceEvent({ type: 'tempo', bpm: 132 } as never);
    expect(host.applyTempo).toHaveBeenCalledWith(132);

    t.applyDeviceEvent({ type: 'scene', index: 2 } as never);
    expect(host.applyScene).toHaveBeenCalledWith(2); // device index; the host does the 1-based shift

    t.applyDeviceEvent({ type: 'param', effectId: 106, paramId: 8, norm: 0.4 } as never);
    expect(host.applyParamEcho).toHaveBeenCalledWith(106, 8, 0.4);

    t.applyDeviceEvent({ type: 'blockState' } as never);
    expect(host.scheduleBlockStateReload).toHaveBeenCalledTimes(1);

    t.applyDeviceEvent({ type: 'changed' } as never);
    expect(host.scheduleStructuralReload).toHaveBeenCalledTimes(1);

    t.applyDeviceEvent({ type: 'cacheBuild', phase: 'done' } as never);
    expect(onBuildEvent).toHaveBeenCalledTimes(1);
  });

  it('ignores the echo of a config doc this client itself wrote', () => {
    const { host, t } = fresh();
    t.applyDeviceEvent({ type: 'config', id: 'swipe', data: {}, origin: 'test-client' } as never);
    expect(host.applyConfig).not.toHaveBeenCalled();
    t.applyDeviceEvent({ type: 'config', id: 'swipe', data: { a: 1 }, origin: 'other' } as never);
    expect(host.applyConfig).toHaveBeenCalledWith('swipe', { a: 1 });
  });
});

describe('toggleTuner', () => {
  it('is optimistic and reverts when the device refuses', async () => {
    const { t } = fresh();
    const p = t.toggleTuner();
    expect(t.tuner.active).toBe(true); // optimistic
    await p;
    expect(setTuner).toHaveBeenCalledWith(true);

    setTuner.mockRejectedValueOnce(new Error('nope'));
    await t.toggleTuner();
    expect(t.tuner.active).toBe(true); // reverted back to on
  });
});
