// The device-session slice of the editor store (M4b of the architecture refactor).
//
// Everything about WHICH device we are talking to and what it can do: the connection state and
// its heartbeat poll, the negotiated API version + capability gates, the serial/MIDI port picker
// and forced device profile, the current preset REFERENCE (slot number + name, not its contents),
// and the live scene + tempo the device reports.
//
// `EditorStore` owns an instance and re-exposes every member below by delegation, so the ~44
// modules that import `editor` keep working unchanged. Call-site migration (importing this store
// directly) is a separate, later change — see `src/lib/CLAUDE.md` (Store pattern § slices).
//
// This store must NEVER import `editor.svelte.ts`, nor another slice — both are cycles, and the
// second one rebuilds the god object under new filenames. Everything it needs from the rest of
// the store arrives through the injected `DeviceSessionHost`.
import { forgefx } from '$lib/api/forgefx';
import { deviceDefs } from '$lib/device/deviceDefs.svelte';
import { history } from './history.svelte';
import { library } from '$lib/preset/library.svelte';
import type { ConnInfo, ConnPick, DetectResult, DeviceCaps, DeviceInfo, ProfileKey } from '$lib/api/types';

/** Connection state as the UI shows it: connecting until the first successful health poll, then
 *  online (with the device's reported firmware/model) or offline. */
export type DeviceConn = { state: 'connecting' | 'online' | 'offline'; fw?: string; device?: string };

/** The narrow view of the rest of the editor store that the device-session slice needs. Getters
 *  (not snapshots) so every read stays live — `EditorStore` implements this with `get` accessors
 *  over its own `$state`. Keep it minimal: everything added here is coupling the next extraction
 *  has to carry. */
export interface DeviceSessionHost {
  /** Re-read the grid + blocks (owned by the grid state that stays on `EditorStore` for now). */
  load: () => Promise<void>;
  /** Reflect a scene change WITHOUT a full preset dump, on the store's SHARED `#eventReload`
   *  debounce — which is why the timer stays on the host rather than moving in here. */
  scheduleSceneReload: (settleMs?: number) => void;
  showToast: (text: string, accent?: string) => void;
  /** Point the undo/redo history at the active device+slot. Stays on the host because the preset
   *  NAV paths (watchPreset / selectPreset — `presetBuffer`, M4c) call it too. */
  histSwitch: (n: number) => void;
  /** Serial round-trip latency measured by the poll tick. Telemetry state, so it goes back through
   *  the host rather than the slice reaching sideways into `TelemetryStore`. */
  setLinkMs: (ms: number | null) => void;
  /** Re-assert the saved device-telemetry polling mode after a (re)connect. Telemetry-owned. */
  reapplyPollingMode: () => void;
}

export class DeviceSessionStore {
  #host: DeviceSessionHost;
  constructor(host: DeviceSessionHost) {
    this.#host = host;
  }

  // ── connection / preset ──
  conn = $state<DeviceConn>({ state: 'connecting' });
  /** Per-model capabilities from the device descriptor (scenes, channels, slot model, …) — drives UI gating. */
  caps = $state<DeviceCaps | null>(null);
  /** Negotiated backend API version (from /healthz `api.version` / /device `apiVersion`).
   *  1 = legacy pre-caps server → the per-cluster gates below fall back to today's isAm4 branches. */
  apiVersion = $state(1);
  /** True when the backend speaks the capabilities-driven unified API (v2): every device goes through
   *  the unified /preset/* + /scene routes and UI gating comes from `caps`, not the model id. */
  get isV2(): boolean { return this.apiVersion >= 2; }
  // ── capability gates (v2: caps-driven; v1 fallback: the legacy isAm4 branches) ──
  /** Device answers the live current-preset query — safe to poll (watchPreset / poll ticks). */
  get presetLiveQuery(): boolean { return this.isV2 ? !!this.caps?.presets?.liveQuery : !this.isAm4; }
  /** Per-block meter/param sweep reads are supported (grid level fills + swipe controls). */
  get hasBlockMeters(): boolean { return this.isV2 ? !!this.caps?.meters?.blockMeters : !this.isAm4; }
  /** Live per-block audio monitors are supported (METER toggle). */
  get hasLiveMonitors(): boolean { return this.isV2 ? !!this.caps?.meters?.liveMonitors : !this.isAm4; }
  /** Device supports tempo read/write + tap. */
  get hasTempo(): boolean { return this.isV2 ? !!this.caps?.tempo : !this.isAm4; }
  /** Device has a tuner. */
  get hasTuner(): boolean { return this.isV2 ? !!this.caps?.tuner : !this.isAm4; }
  /** Device mirrors the UI selection on its own screen (grid cursor-select). */
  get hasCursorSelect(): boolean { return this.isV2 ? !!this.caps?.gridCursorSelect : !this.isAm4; }
  /** Blocks can expose params without a gen-3 definition pack (don't gate the editor on `pack`). */
  get paramsWithoutPack(): boolean { return this.isV2 ? !!this.caps?.paramsWithoutPack : this.isAm4; }
  /** Presets can be renamed (working buffer + stored slots). */
  get canRenamePresets(): boolean { return this.isV2 ? !!this.caps?.presets?.canRename : !this.isAm4; }
  /** Scene names are writable on this device. */
  get canRenameScenes(): boolean { return this.isV2 ? !!this.caps?.sceneNamesWritable : !this.isAm4; }
  /** Device supports full preset dumps → the library's deep param index (summary/params reads). */
  get canDeepScan(): boolean { return this.isV2 ? !!this.caps?.presets?.canDeepScan : !this.isAm4; }
  /** Library indexing is a stored-location NAME scan only (no per-preset dumps/params). */
  get scanNamesOnly(): boolean {
    return this.isV2 ? !!this.caps?.presets?.canScanNames && !this.caps?.presets?.canDeepScan : this.isAm4;
  }
  /** Save targets render as bank-letter codes (A01..Z04) instead of numeric slots. */
  get bankLetterAddressing(): boolean { return !!this.caps?.presets && this.caps.presets.addressing === 'bankLetter'; }
  /** Grid routing (cables/shunts) exists on this device — gates route ports/link mode (false on the AM4's flat chain). */
  get canGridRoute(): boolean { return this.isV2 ? !!this.caps?.gridRouting : !this.isAm4; }
  /** Number of scenes this device has (0 if none) — drives the topbar SCN selector. */
  get sceneCount(): number { return this.caps?.hasScenes ? (this.caps.sceneCount || 0) : 0; }
  /** Device server exposes the telemetry polling-mode control (META-17). Gates the AxisPanel Performance
   *  tab + the workbench telemetry widget. Absent on old servers → false → all new UI hidden. */
  get hasTelemetryControl(): boolean { return !!this.caps?.telemetryControl; }
  detected = $state<DetectResult | null>(null); // which Fractal unit is attached (auto-detect)
  preset = $state<{ number: number; name: string } | null>(null);
  lastPreset = $state<number | null>(null);
  presetCount = $state(512); // FM3 preset slots

  /** @deprecated AM4 (model 0x15) detection — kept ONLY for the legacy v1-server fallback paths
   *  (API v2 gates everything through `caps`). Do not add new call sites. */
  get isAm4(): boolean {
    return this.detected?.modelId === 0x15;
  }

  // ── scene / tempo (live device state, pulled at load and pushed over SSE) ──
  scene = $state(1);
  /** Scene names of the open preset (index 0 = scene 1), decoded from the grid read. Empty string = unnamed. */
  sceneNames = $state<string[]>([]);
  /** Display name for a 1-based scene number — the decoded name, or "Scene N" when blank/unknown. */
  sceneName = (n: number): string => {
    const s = this.sceneNames[n - 1]?.trim();
    return s && s.length ? s : `Scene ${n}`;
  };
  bpm = $state(120);

  // ── connection picker (serial + MIDI ports) ──
  portsOpen = $state(false);
  ports = $state<ConnInfo[]>([]);
  portChosen = $state<ConnPick | null>(null);
  portOverride = $state<ConnPick | null>(null);
  /** Forced device-profile key ('fm3'|'fm9'|'axe3'|'axe2'|'vp4'|'am4'), or null when auto-detecting. */
  profileOverride = $state<string | null>(null);
  /** A slow link — a generic MIDI interface into 5-pin DIN (≈31.25 kbaud) — can't carry high-rate meter
   *  reads without saturating and inflating every edit to seconds, so meter/watch polling backs off there.
   *  A device's OWN USB-MIDI port (Axe-Fx III / FM9, Fractal-named) is full USB speed → NOT slow. */
  get slowLink(): boolean {
    const c = this.portChosen;
    if (c?.transport !== 'midi') return false;
    const info = this.ports.find((p) => p.transport === 'midi' && p.id === (c.inId ?? c.id));
    return info ? !info.fractal : false; // Fractal USB-MIDI = fast; generic adapter = slow; unknown → don't throttle
  }

  // ── handshake / heartbeat ──
  /** One-shot /device pull that adopts the negotiated API version + capabilities before first load. */
  handshake = async () => {
    try {
      const dev = await forgefx.device();
      this.#adoptDevice(dev);
      // Refresh the device-definitions profile status once per connect (self-describe / import / cloud).
      // Degrades silently on older servers (the endpoints 404 → capOptional → null).
      if (dev) void deviceDefs.refresh({ model: dev.model, modelByte: dev.modelByte, firmware: dev.firmware?.version ?? null, caps: dev.capabilities ?? null });
    } catch {
      /* engine not ready — poll() keeps retrying and adopts caps when it comes up */
    }
  };
  /** Adopt a /device payload: capabilities, API version, preset-slot count. */
  #adoptDevice = (dev: DeviceInfo | null) => {
    if (!dev) return;
    if (dev.capabilities) this.caps = dev.capabilities; // per-model UI capabilities (scenes, channels, …)
    if (dev.apiVersion) this.apiVersion = dev.apiVersion;
    const count = dev.capabilities?.presets?.count;
    if (count) this.presetCount = count;
  };

  #polling = false;
  #pollTick = 0;
  poll = async () => {
    if (this.#polling) return; // never let interval ticks stack serial ops on a slow link
    // A definitions walk/import owns the exclusive transport (FORGEFX-32) — /healthz and /device are
    // free, but #adoptDevice fans out into real device reads on change. Sit the whole tick out.
    if (deviceDefs.building || deviceDefs.importing) return;
    this.#polling = true;
    try {
      const h = await forgefx.health();
      const dev = await forgefx.device().catch(() => null); // both free — no device round-trip
      this.conn = { state: 'online', fw: dev?.firmware?.version, device: h.device };
      if (h.api?.version) this.apiVersion = h.api.version;
      this.#adoptDevice(dev);
      // The current-preset query is a real device round-trip. On a slow MIDI link it competes with what
      // the user is doing (opening a block, editing), so run it only every ~4th tick there; connection
      // state above stays fresh every tick.
      if (this.presetLiveQuery && !(this.slowLink && this.#pollTick++ % 4 !== 0)) {
        const t0 = performance.now();
        const p = await forgefx.currentPreset().catch(() => null);
        this.#host.setLinkMs(Math.round(performance.now() - t0)); // serial round-trip latency
        if (p && p.number >= 0) {
          this.preset = p;
          this.#host.histSwitch(p.number);
          // the current slot was just read cheaply — if the device reports it empty, drop the stale
          // cached name so a preset cleared on the hardware stops showing up without a full rescan
          library.clearSlotIfEmpty(p.number, p.name);
        }
      }
    } catch {
      this.conn = { state: 'offline' };
    } finally {
      this.#polling = false;
    }
  };

  // ── device-event hooks (called by the telemetry slice through the host, which owns the event switch) ──
  /** Tempo pushed by the device. */
  applyTempo = (bpm: number) => { this.bpm = bpm; };
  /** Scene switched device-side: badge immediately, then lightweight reflect (no full preset dump). */
  applyScene = (index: number) => {
    this.scene = index + 1;
    this.#host.scheduleSceneReload();
  };

  // ── scene / tempo actions ──
  // pull current scene + tempo once at load (device → UI), each gated by its capability so a device
  // without the feature never eats a timeout (legacy v1: skip both on the AM4 — it ignores the frames)
  syncSceneTempo = async () => {
    if (!this.isV2 && this.isAm4) return; // legacy: gen-3 scene/tempo frames; the AM4 ignores them → 5s timeouts that clog the queue
    try {
      if (this.sceneCount > 0) { const si = (await forgefx.getScene()).index; if (si >= 0) this.scene = si + 1; } // ignore a failed read (-1)
      if (this.hasTempo) this.bpm = (await forgefx.getTempo()).bpm;
    } catch {
      /* */
    }
  };
  // UI scenes are 1..8; the device is 0..7. Switching a scene changes per-scene bypass/channel,
  // so reload the grid (badges) + the open block's params (channel may have changed).
  selectScene = async (ui: number) => {
    const prev = this.scene;
    if (prev === ui) return;
    this.scene = ui; // optimistic
    try {
      // API v2: the unified POST /scene switches every device; legacy v1 AM4 uses its own route.
      await (!this.isV2 && this.isAm4 ? forgefx.am4SetScene(ui - 1) : forgefx.setScene(ui - 1));
      history.record({ kind: 'scene', from: prev, to: ui });
      // Lightweight reflect (no full preset dump) — same path as a footswitch scene change; coalesces
      // with the scene SSE echo. Reflects bypass/channel + re-reads the open block, snappy & crash-free.
      this.#host.scheduleSceneReload();
    } catch {
      this.scene = prev;
    }
  };
  /** Rename a scene (1-based) in the working buffer, then re-read to confirm the device took it.
   *  Optimistic; reverts on failure or if the read-back doesn't match. Not persisted to flash (store is separate). */
  renameScene = async (ui: number, name: string) => {
    if (!this.canRenameScenes || ui < 1 || ui > (this.sceneCount || 8)) return;
    const clean = name.replace(/[^\x20-\x7e]/g, '').slice(0, 32).trimEnd();
    const prev = this.sceneNames.slice();
    const next = this.sceneNames.slice();
    next[ui - 1] = clean;
    this.sceneNames = next; // optimistic
    try {
      const r = await forgefx.setSceneName(ui - 1, clean);
      if (!r.ok) throw new Error('rejected');
      if ((prev[ui - 1] ?? '') !== clean) history.record({ kind: 'sceneName', index: ui - 1, from: prev[ui - 1] ?? '', to: clean });
      await this.#host.load(); // re-read grid → verifies the device stored the name (sceneNames refreshed)
    } catch {
      this.sceneNames = prev; // revert
      this.#host.showToast('Scene rename failed', '#d6543f');
    }
  };
  setBpm = async (bpm: number) => {
    const n = Math.round(bpm);
    if (!Number.isFinite(n) || n < 20 || n > 250) return;
    this.bpm = n; // optimistic
    await forgefx.setTempo(n).catch(() => {});
  };
  tapTempo = async () => {
    await forgefx.tapTempo().catch(() => {});
    try {
      this.bpm = (await forgefx.getTempo()).bpm; // tap shifts tempo; pull the new value
    } catch {
      /* */
    }
  };

  // ── connection picker ──
  openPorts = async () => {
    this.portsOpen = true;
    await this.loadPorts();
  };
  loadPorts = async () => {
    try {
      const r = await forgefx.listPorts();
      this.ports = [...r.ports].sort((a, b) => Number(b.fractal) - Number(a.fractal)); // Fractal first
      this.portChosen = r.chosen;
      this.portOverride = r.override;
      this.profileOverride = r.profileOverride ?? null;
    } catch {
      /* offline */
    }
  };
  // pick a port (or null to clear back to auto-detect); reconnect + re-detect + reload. Sends no `model`,
  // so any forced device profile is preserved across a port change.
  pickPort = async (conn: ConnPick | null) => {
    this.portsOpen = false;
    try {
      await forgefx.selectPort(conn);
      this.conn = { state: 'connecting' };
      await this.poll();
      const d = await forgefx.detect().catch(() => null);
      if (d) this.detected = d;
      await this.#host.load();
      await this.loadPorts();
      this.#host.reapplyPollingMode(); // reconnect → re-assert the saved polling mode
      this.#host.showToast(conn ? 'Connection changed' : 'Back to auto-detect', '#35c9d6');
    } catch {
      this.#host.showToast('Could not switch connection', '#d6543f');
    }
  };
  /** Force (or clear with 'auto') the device profile. Preserves any manual PORT override — passing the
   *  current portOverride (not the resolved auto conn) so forcing a profile never pins an auto-detected
   *  port. This is what makes an FM3 reachable over a generic MIDI→USB adapter (force FM3 + MIDI ports). */
  pickProfile = async (model: ProfileKey) => {
    try {
      await forgefx.selectPort(this.portOverride, model);
      this.profileOverride = model === 'auto' ? null : model;
      this.conn = { state: 'connecting' };
      await this.poll();
      const d = await forgefx.detect().catch(() => null);
      if (d) this.detected = d;
      await this.#host.load();
      await this.loadPorts();
      this.#host.reapplyPollingMode(); // reconnect → re-assert the saved polling mode
      this.#host.showToast(model === 'auto' ? 'Device profile: auto-detect' : `Device profile forced: ${model.toUpperCase()}`, '#35c9d6');
    } catch {
      this.#host.showToast('Could not set device profile', '#d6543f');
    }
  };
}
