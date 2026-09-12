// The telemetry slice of the editor store (M4a of the architecture refactor).
//
// Everything the device pushes AT us, plus everything we send back about how the app is running:
// the SSE event pipe, live tuner/CPU/output-level/traffic readouts, the per-block audio meters,
// the device-telemetry polling mode, and the privacy-gated diagnostics (Faro RUM + debug reports).
//
// `EditorStore` owns an instance and re-exposes every member below by delegation, so the ~44
// modules that import `editor` keep working unchanged. Call-site migration (importing this store
// directly) is a separate, later change — see `src/lib/CLAUDE.md` (Store pattern § slices).
//
// This store must NEVER import `editor.svelte.ts` — that would be a cycle. Everything it needs
// from the rest of the store arrives through the injected `TelemetryHost`, the same trick
// `history.svelte.ts` uses with `bindHost`.
import { forgefx, isDirect, CLIENT_ID } from '$lib/api/forgefx';
import { deviceDefs } from '$lib/device/deviceDefs.svelte';
import type { DebugReport, DeviceEvent, LiveMonitor, TelemetryMode, TrafficSnapshot } from '$lib/api/types';

// Telemetry consent defaults OFF. Anonymous instance id is a random uuid — never PII.
const TELEMETRY_KEY = 'axs.telemetry.consent';
const INSTANCE_KEY = 'axs.telemetry.instanceId';
const loadTelemetryConsent = (): boolean => { try { return localStorage.getItem(TELEMETRY_KEY) === '1'; } catch { return false; } };
function loadInstanceId(): string {
  try {
    let id = localStorage.getItem(INSTANCE_KEY);
    if (!id) { id = (globalThis.crypto?.randomUUID?.() ?? `anon-${Date.now().toString(36)}`); localStorage.setItem(INSTANCE_KEY, id); }
    return id;
  } catch { return 'anon'; }
}
// Device-telemetry polling mode (META-17). Local mirror so the poll intervals + UI have it synchronously
// on boot (before /device confirms telemetryControl); the synced `config/profile` doc carries it across
// devices. Default 'balanced' (mirrors the server default).
const POLLING_MODE_KEY = 'axs.telemetry.pollingMode';
export const isTelemetryMode = (v: unknown): v is TelemetryMode => v === 'performance' || v === 'balanced' || v === 'reduced';
const loadPollingMode = (): TelemetryMode => { try { const v = localStorage.getItem(POLLING_MODE_KEY); return isTelemetryMode(v) ? v : 'balanced'; } catch { return 'balanced'; } };
// Whether the user has made a first-run telemetry choice (accept OR decline). Distinct from the consent
// value: unset → show the first-run prompt once; set → respect the stored consent silently.
const DECIDED_KEY = 'axs.telemetry.decided';
const loadDecided = (): boolean => { try { return localStorage.getItem(DECIDED_KEY) === '1'; } catch { return false; } };

/** Strip the obvious PII from a string before it leaves the machine: emails + usernames in home paths. */
export function scrubPII(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/([Cc]:\\Users\\)[^\\\/\r\n"]+/g, '$1<user>')
    .replace(/(\/(?:home|Users)\/)[^\/\r\n"]+/g, '$1<user>');
}

/** What a failure report carries: the coarse category plus whatever context the call site had. */
export type ReportTrigger = { kind: string; route?: string; status?: number; message?: string };

/** The narrow view of the rest of the editor store that the telemetry slice needs. Getters (not
 *  snapshots) so every read stays live — `EditorStore` implements this with `get` accessors over
 *  its own `$state`. Keep it minimal: everything added here is coupling the next extraction has
 *  to carry. */
export interface TelemetryHost {
  // ── device/connection reads the slice gates on ──
  readonly status: 'loading' | 'ready' | 'offline';
  readonly hasLiveMonitors: boolean;
  readonly slowLink: boolean;
  readonly hasTelemetryControl: boolean;
  readonly connDevice: string | undefined;
  readonly connFw: string | undefined;
  /** Optional user-supplied contact, attached to a debug report verbatim (opt-in, not scrubbed). */
  readonly contact: string;
  // ── the open block: the live-meter loop reads exactly ONE block per tick ──
  readonly selectedEffectId: number | null;
  readonly blockSlug: string | null;
  readonly inLibrary: boolean;
  /** True while a virtual/rail screen (Setup, Controllers, Modifier, FC) is open — not a grid block. */
  readonly onVirtualScreen: boolean;

  showToast: (text: string, accent?: string) => void;
  /** Mirror the consent / polling-mode choice into the synced `config/profile` doc. */
  persistProfile: () => void;
  /** First-run: the consent question is settled (answered, or never asked) — continue the
   *  Ko-fi → tour chain, which is onboarding and stays on the host. */
  onConsentResolved: () => void;

  // ── applyDeviceEvent cases owned by other slices ──
  applyTempo: (bpm: number) => void;
  applyScene: (index: number) => void;
  applyParamEcho: (effectId: number, paramId: number, norm: number) => void;
  applyConfig: (id: string, data: unknown) => void;
  /** A block's bypass/channel changed device-side — reflect it (host-owned debounce). */
  scheduleBlockStateReload: () => void;
  /** SSE 'changed': structural reload + open-block re-read, on the host's shared debounce timer. */
  scheduleStructuralReload: () => void;
}

export class TelemetryStore {
  #host: TelemetryHost;
  constructor(host: TelemetryHost) {
    this.#host = host;
  }

  // ── live telemetry (SSE) ──
  tuner = $state<{ active: boolean; freq?: number; note?: string; cents?: number; octave?: number }>({ active: false });
  /** Live CPU% (decoded from the device meters frame), null until first reading. FM3-family only. */
  cpu = $state<number | null>(null);
  /** Live output level meters in dB (−40…0, floor-clamped) — Output 1 & 2, each L/R — from the FM3's
   *  Preset Leveling poll (fn 0x19, 5-septet RMS float → 10·log10 dB). Smoothed server-side. */
  levels = $state<{ out1L: number; out1R: number; out2L: number; out2R: number } | null>(null);
  // CPU% is not transmitted by the FM3 (FM3-Edit computes it from a DSP cost model) — so the top-bar
  // slot shows the real, measurable serial round-trip latency instead. Written by the host's poll().
  linkMs = $state<number | null>(null);
  /** Latest cumulative device-traffic snapshot (from the `traffic` DeviceEvent), or null until the first
   *  one arrives. The workbench telemetry widget derives per-second rates from successive snapshots. */
  traffic = $state<TrafficSnapshot | null>(null);
  /** Looper page telemetry for the open Looper block: waveform envelope (0..1) + playhead + level. */
  looperWave = $state<{ wave: number[]; position: number | null; level: number | null } | null>(null);
  #events: EventSource | null = null;

  // ── device-telemetry polling mode (META-17) ──
  /** Active polling mode — drives the poll/watch interval selection (pollIntervals.ts) + the mode UI.
   *  Seeded from the local mirror; reconciled with the server (PUT on reconnect, adopt on telemetryConfig
   *  events). */
  pollingMode = $state<TelemetryMode>(loadPollingMode());

  // ── telemetry / diagnostics ── `enabled` = live RUM gate (AXIS_TELEMETRY); `uploadEnabled` = on-demand
  // debug-report upload available; `consent` = user opted into live telemetry (default OFF). The on-demand
  // upload is per-incident consent and works even when `consent` is false.
  telemetry = $state<{ enabled: boolean; uploadEnabled: boolean; consent: boolean; instanceId: string; faroUrl: string; sending: boolean }>(
    { enabled: false, uploadEnabled: false, consent: loadTelemetryConsent(), instanceId: loadInstanceId(), faroUrl: '', sending: false }
  );
  #faroStarted = false;
  /** First-run telemetry consent prompt (rendered by Notices.svelte via the overlay registry). */
  consentPromptOpen = $state(false);
  // Major-error → "Upload Debug Log" prompt. Set by offerDebugReport (debounced per category); the
  // DiagnosticsPanel renders it as a dismissible card with an explicit Upload button.
  reportPrompt = $state<ReportTrigger | null>(null);
  #lastOffer: Record<string, number> = {}; // per-category debounce for offerDebugReport
  #recentEvents: { t: number; kind: string; text: string }[] = []; // recent-events ring for the debug report

  // ── live audio meters (per-block monitor level, normalized→dB) ──
  // GENTLE poll: reads ONLY the currently-selected block's monitor (one serial round-trip per tick),
  // and ONLY while the block editor is open. Never sweep every placed block: a full-preset sweep
  // serializes behind every other read on the shared request chain. (The one evidenced audio-dropout
  // incident was AM4 background block re-reads every 1.5 s — FORGEFX-25, CHANGELOG 0.9.x — not
  // metering; captures show FM3-Edit itself polls its meters round-robin at a ~60 ms tick.)
  meteringOn = $state(true); // on by default, like the official editors; canMeterBlocks still gates it
  /** Live audio meters per placed monitored block (normalized 0..1 + mapped dB), keyed by effectId. */
  liveMeters = $state<Record<number, LiveMonitor[]>>({});
  /** Primary live meter for a block (first monitor; null if none / not yet read) — back-compat. */
  monitorFor = (effectId: number): LiveMonitor | null => this.liveMeters[effectId]?.[0] ?? null;
  /** ALL live meters a block reports (e.g. OUTPUT VU L+R, M-Comp 3 bands, cab gain+VU). */
  monitorsFor = (effectId: number): LiveMonitor[] => this.liveMeters[effectId] ?? [];
  /** Per-block metering is only offered when the device supports live monitors, over a fast link
   *  (never a slow 5-pin-DIN MIDI adapter). The global IN/OUT display is separate. */
  get canMeterBlocks(): boolean {
    return this.#host.status === 'ready' && this.#host.hasLiveMonitors && !this.#host.slowLink;
  }
  #liveMeterTimer: ReturnType<typeof setTimeout> | null = null;
  startLiveMeters = () => {
    if (this.#liveMeterTimer) return; // already running
    const tick = async () => {
      this.#liveMeterTimer = null;
      const eid = this.#host.selectedEffectId;
      const ok = this.meteringOn && this.canMeterBlocks && eid != null && !this.#host.inLibrary && !this.#host.onVirtualScreen;
      if (ok) {
        try {
          const rows = await forgefx.monitorsLive(eid); // single-block read (all of the open block's monitors)
          const next = { ...this.liveMeters };
          next[eid] = rows.filter((r) => r.effectId === eid); // every monitor this block reports (may be several)
          this.liveMeters = next;
        } catch {
          /* best-effort */
        }
        // Looper: also fetch the live waveform + playhead + level for the open Looper block.
        if (this.#host.blockSlug === 'looper') {
          try { this.looperWave = await forgefx.looper(eid); } catch { /* keep last */ }
        }
      }
      // ~250 ms when active (snappier level/VU + playhead), 2 s idle heartbeat when metering is off.
      this.#liveMeterTimer = setTimeout(tick, ok ? 250 : 2000);
    };
    tick();
  };
  stopLiveMeters = () => {
    if (this.#liveMeterTimer) clearTimeout(this.#liveMeterTimer);
    this.#liveMeterTimer = null;
    this.liveMeters = {};
  };

  // ── telemetry / diagnostics ──
  /** Boot: read the operator's telemetry config, start RUM if consented, and ask the first-run
   *  consent question once. Whichever way that lands, hand back to the host's onboarding chain. */
  init = async () => {
    try {
      const s = await forgefx.telemetryStatus();
      this.telemetry = { ...this.telemetry, enabled: s.enabled, uploadEnabled: s.uploadEnabled, faroUrl: s.faroUrl };
      await this.#startFaro();
      // First run: if the build ships live diagnostics and the user hasn't chosen yet, ask once. If they
      // already chose (or telemetry is off in this build), fall through to the host's first-run chain.
      if (s.enabled && !loadDecided()) this.consentPromptOpen = true;
      else this.#host.onConsentResolved();
    } catch { /* telemetry disabled / engine not ready */ }
  };
  /** Start live Faro RUM iff the operator enabled it, the user consented, and we have a collector URL.
   *  Dynamic-imported so the SDK never loads for users/builds without telemetry. Idempotent. */
  #startFaro = async () => {
    const t = this.telemetry;
    if (!t.enabled || !t.consent || !t.faroUrl) return;
    try {
      const m = await import('$lib/api/faro');
      if (this.#faroStarted) { m.resumeFaro(); return; } // re-opted-in: resume the paused instance
      this.#faroStarted = true;
      await m.initFaro({ url: t.faroUrl, version: __APP_VERSION__, instanceId: t.instanceId });
    } catch { this.#faroStarted = false; /* offline / blocked — never let telemetry break the app */ }
  };
  setTelemetryConsent = (on: boolean) => {
    this.telemetry = { ...this.telemetry, consent: on };
    try { localStorage.setItem(TELEMETRY_KEY, on ? '1' : '0'); localStorage.setItem(DECIDED_KEY, '1'); } catch { /* */ }
    if (on) this.#startFaro(); // opting in mid-session starts (or resumes) RUM immediately
    else import('$lib/api/faro').then((m) => m.pauseFaro()).catch(() => {}); // opting out stops sending at once
    this.#host.persistProfile(); // mirror the choice to the synced profile when logged in
  };
  /** First-run consent choice (accept/decline). Records it, closes the prompt, then hands back to the
   *  host's first-run chain (Ko-fi → tour). */
  decideTelemetry = (on: boolean) => {
    this.consentPromptOpen = false;
    this.setTelemetryConsent(on);
    this.#host.onConsentResolved();
  };

  // ── device-telemetry polling mode (META-17) ──
  /** Set the polling mode from a LOCAL user action: optimistic update → PUT → revert on failure. Follows
   *  the store's optimistic-update idiom. Persists (local mirror + synced profile) only after the PUT
   *  succeeds, so a rejected change never leaks into the profile. A no-op if unchanged. */
  setPollingMode = async (mode: TelemetryMode) => {
    const prev = this.pollingMode;
    if (prev === mode) return;
    this.pollingMode = mode; // optimistic
    try {
      await forgefx.setTelemetryMode(mode);
      try { localStorage.setItem(POLLING_MODE_KEY, mode); } catch { /* */ }
      this.#host.persistProfile(); // mirror the choice to the synced profile when logged in
    } catch {
      this.pollingMode = prev; // revert — server rejected / unsupported
      this.#host.showToast('Could not change polling mode', '#d6543f');
    }
  };
  /** Re-apply the saved polling mode to the device after a connect/reconnect, once caps confirm the
   *  control exists. Fire-and-forget with error tolerance — an old/unsupported server just ignores it.
   *  NOT a user action, so it never persists (the local mirror is already the source of the value). */
  reapplyPollingMode = () => {
    if (!this.#host.hasTelemetryControl) return;
    forgefx.setTelemetryMode(this.pollingMode).catch(() => { /* unsupported / not ready — leave as-is */ });
  };
  /** Adopt a polling mode that came from the synced profile: state + local mirror + push to the device.
   *  Not a fresh user action, so it never re-persists the profile. */
  adoptPollingMode = (mode: TelemetryMode) => {
    if (mode === this.pollingMode) return;
    this.pollingMode = mode;
    try { localStorage.setItem(POLLING_MODE_KEY, mode); } catch { /* */ }
    this.reapplyPollingMode();
  };

  // ── failure reporting ──
  /** Silently report a failure to Faro with device context (model/firmware/route/status) + record it for
   *  the debug-report trail. This is the FLEET signal — the real device bugs are server-side 5xx, not
   *  JS crashes, so we report every one. No UI; opt-in gated (only sends when the user enabled telemetry). */
  reportFailure = (trigger: ReportTrigger) => {
    this.recordEvent('error', `${trigger.kind} ${trigger.route ?? ''} ${trigger.status ?? ''} ${trigger.message ?? ''}`.trim());
    if (this.#faroStarted) {
      import('$lib/api/faro').then((m) => m.faroDeviceError({ ...trigger, model: this.#host.connDevice, firmware: this.#host.connFw })).catch(() => {});
    }
  };
  /** Every ForgeFX request failure (5xx or network) auto-reports here — registered on the client so we
   *  don't have to remember to instrument each call site. Classifies the route into a coarse `kind` so the
   *  Grafana dashboard can group (device-comm / telemetry / engine). */
  onReqFailure = (info: { route: string; method: string; status: number; message: string }) => {
    const kind = info.route.startsWith('/telemetry') ? 'telemetry'
      : info.status === 0 ? 'engine' : 'device-comm';
    this.reportFailure({ kind, route: info.route, status: info.status, message: info.message });
  };
  /** On a MAJOR error (grid decode fail, detect failure), also nudge the user to upload a full debug
   *  report — debounced per category so it never spams. Reporting to Faro already happened via the req
   *  hook / reportFailure; this just adds the explicit-upload prompt on top for the big ones. */
  offerDebugReport = (trigger: ReportTrigger) => {
    this.reportFailure(trigger);
    if (!this.telemetry.uploadEnabled) return; // nothing to upload to
    const now = Date.now();
    if (now - (this.#lastOffer[trigger.kind] ?? 0) < 5 * 60_000) return;
    this.#lastOffer[trigger.kind] = now;
    this.reportPrompt = trigger;
  };
  dismissReportPrompt = () => { this.reportPrompt = null; };
  /** Record a recent app event for the debug-report trail (small ring; scrubbed on upload). */
  recordEvent = (kind: string, text: string) => {
    this.#recentEvents.push({ t: Date.now(), kind, text: text.slice(0, 300) });
    if (this.#recentEvents.length > 60) this.#recentEvents.shift();
  };
  /** Assemble → scrub → upload a debug report (the "Upload Debug Log" action). Independent of live
   *  telemetry consent — an explicit per-incident send. The log is read via the Electron bridge (the
   *  renderer can't touch the FS); in a browser dev build it's empty and we still send diag + events. */
  uploadDebugReport = async (trigger?: DebugReport['trigger']): Promise<boolean> => {
    if (this.telemetry.sending) return false;
    this.telemetry = { ...this.telemetry, sending: true };
    try {
      let log = '';
      try { log = (await (globalThis as { axisDesktop?: { readDebugLog?: () => Promise<string> } }).axisDesktop?.readDebugLog?.()) ?? ''; } catch { /* */ }
      let diag: unknown;
      try { diag = await forgefx.diag(); } catch { /* */ }
      const contact = this.#host.contact.trim();
      const report: DebugReport = {
        instanceId: this.telemetry.instanceId,
        capturedAt: Date.now(),
        app: { version: (globalThis as { axisDesktop?: { version?: string } }).axisDesktop?.version ?? 'dev', platform: navigator.platform },
        trigger,
        contact: contact ? contact.slice(0, 100) : undefined, // user-supplied, opt-in — not scrubbed
        diag,
        log: scrubPII(log),
        events: this.#recentEvents.slice(-60).map((e) => ({ ...e, text: scrubPII(e.text) }))
      };
      const r = await forgefx.uploadDebugReport(report);
      this.#host.showToast(`Debug report sent (${Math.max(1, Math.round((r.stored ?? 0) / 1024))} KB) — thank you`, '#33c46b');
      return true;
    } catch {
      this.#host.showToast("Couldn't reach the server — your log is still saved locally (Help → Open Debug Log)", '#d6543f');
      return false;
    } finally {
      this.telemetry = { ...this.telemetry, sending: false };
    }
  };

  // ── device events (SSE) ──
  // live tuner/tempo/scene/cpu pushes from the device (local: SSE). Browser Direct subscribes to the
  // in-page runtime's event bus instead (see direct.svelte.ts) — SSE is skipped there.
  openEvents = () => {
    if (this.#events) return;
    if (isDirect()) return; // events arrive via the in-page runtime subscription instead
    try {
      this.#events = forgefx.events((e) => this.applyDeviceEvent(e));
    } catch {
      /* SSE unsupported / offline — telemetry stays at last-known */
    }
  };
  /** THE single device-event path: one switch over the `DeviceEvent` union. Telemetry-owned cases are
   *  handled here; everything else is handed to the host slice that owns the state. To react to a new
   *  device-side change, extend a `case` — never add a parallel timer or a second event path. */
  applyDeviceEvent = (e: DeviceEvent) => {
    switch (e.type) {
      case 'tempo': this.#host.applyTempo(e.bpm); break;
      case 'scene': this.#host.applyScene(e.index); break;
      case 'tuner': this.tuner = { ...this.tuner, freq: e.freq, note: e.note, cents: e.cents, octave: e.octave }; break;
      case 'cpu': this.cpu = e.percent; break;
      case 'meters': this.levels = { out1L: e.out1L, out1R: e.out1R, out2L: e.out2L, out2R: e.out2R }; break;
      case 'blockState': this.#host.scheduleBlockStateReload(); break;
      case 'param': this.#host.applyParamEcho(e.effectId, e.paramId, e.norm); break;
      // structural change elsewhere (block placed/removed, preset switched, or a device-side edit the
      // unit doesn't push — AM4 front-panel / AM4-Edit) — reload, debounced so a burst coalesces into
      // one refresh.
      case 'changed': this.#host.scheduleStructuralReload(); break;
      case 'config': if (e.origin !== CLIENT_ID) this.#host.applyConfig(e.id, e.data); break; // ignore our own echo
      case 'telemetryConfig': {
        // The polling mode changed server-side (another UI, or our own PUT's echo). Adopt it into state
        // + the local mirror WITHOUT re-triggering a PUT or a profile persist — only a local user action
        // (setPollingMode) writes back, so this can never loop.
        if (isTelemetryMode(e.mode) && e.mode !== this.pollingMode) {
          this.pollingMode = e.mode;
          try { localStorage.setItem(POLLING_MODE_KEY, e.mode); } catch { /* */ }
        }
        break;
      }
      case 'traffic': {
        this.traffic = { txMsgs: e.txMsgs, txBytes: e.txBytes, rxMsgs: e.rxMsgs, rxBytes: e.rxBytes, since: e.since, loops: e.loops };
        break;
      }
      case 'cacheBuild': {
        // Device-definitions build progress (A4) — hand off to the deviceDefs store.
        deviceDefs.onBuildEvent(e);
        break;
      }
    }
  };

  toggleTuner = async () => {
    const next = !this.tuner.active;
    this.tuner = { active: next };
    await forgefx.setTuner(next).catch(() => {
      this.tuner = { active: !next };
    });
  };
}
