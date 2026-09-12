// Central editor state + device actions for Axis. A single runes-based store the
// rail / top bar / grid / editor / palette all read and drive. Wraps the ForgeFX
// HTTP client and preserves the live-verified write wiring (place, re-cabling move,
// cables, params, bypass, channel, retype).
import { forgefx, setRequestFailureReporter } from '$lib/api/forgefx';
import { library } from '$lib/preset/library.svelte';
import { appSettings } from '$lib/platform/appSettings.svelte';
import { defaultBlockLibraryPath } from './blockLibraryPath';
import { blockLibrary } from './blockLibrary.svelte';
import { history } from './history.svelte';
import { notifyMutation } from './syncBus';
import type { Cell } from '$lib/device/grid';
import { baseName, packFor } from '$lib/device/blocks';
import { isWebBuild } from '$lib/platform/buildMode';
import type { NamedParam, EnumParam, ConnPick, ProfileKey, DebugReport, DeviceEvent, TelemetryMode, DecodedBlockFile } from '$lib/api/types';
import type { EditorSurface } from './editorSurface';
import { overlays } from '$lib/overlay/overlays.svelte';
import { TelemetryStore, isTelemetryMode, type TelemetryHost, type ReportTrigger } from './telemetry.svelte';
import { DeviceSessionStore, type DeviceSessionHost } from './deviceSession.svelte';
import { PresetBufferStore, type PresetBufferHost } from './presetBuffer.svelte';
import { GridEditingStore, type GridEditingHost } from './gridEditing.svelte';
import { ParamEditingStore, type ParamEditingHost } from './paramEditing.svelte';

// Optional contact the user may leave so we can follow up on a bug (Fractal forum / Reddit / email).
const CONTACT_KEY = 'axs.profile.contact';
const loadContact = (): string => { try { return localStorage.getItem(CONTACT_KEY) ?? ''; } catch { return ''; } };
// One-time "support development on Ko-fi" nudge (voluntary donation — allowed in-app).
const KOFI_SEEN_KEY = 'axs.kofi.seen';
const loadKofiSeen = (): boolean => { try { return localStorage.getItem(KOFI_SEEN_KEY) === '1'; } catch { return false; } };
// First-run guided tour: shown once (after consent + Ko-fi). TOUR_LAST = index of the last step; must
// match the STEPS array length in Tour.svelte (9 steps → 0..8).
const TOUR_KEY = 'axs.tour.done';
const TOUR_LAST = 8;
// Master kill-switch. The guided tour is disabled everywhere (first-run auto-start + "Replay app
// tour") — it bugs out at step 4 (Next won't advance) on mobile. Flip back to true once reworked.
const TOUR_ENABLED: boolean = false;
const loadTourDone = (): boolean => { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; } };

class EditorStore {
  // ── device-session slice (M4b) ──
  // Connection state + heartbeat poll, negotiated API version + capability gates, the port/profile
  // picker, the current preset REFERENCE, and the live scene + tempo. Owned by `DeviceSessionStore`;
  // every member is re-exposed by the facade further down so the ~44 modules that import `editor`
  // keep working. See `deviceSession.svelte.ts`.
  /** The device-session slice's view of the rest of the store. Private field so nothing here leaks
   *  onto `EditorStore`'s public API. Getters, so every read is live. MUST stay declared above
   *  `#device`, which calls it. */
  #deviceSessionHost = (): DeviceSessionHost => {
    const e = this;
    return {
      load: () => e.load(),
      scheduleSceneReload: (settleMs) => e.#scheduleSceneReload(settleMs),
      showToast: (text, accent) => e.showToast(text, accent),
      histSwitch: (n) => e.#histSwitch(n),
      setLinkMs: (ms) => { e.#telemetry.linkMs = ms; },
      reapplyPollingMode: () => e.#telemetry.reapplyPollingMode()
    };
  };
  #device = new DeviceSessionStore(this.#deviceSessionHost());

  // ── preset-buffer slice (M4c) ──
  // Which preset is in the edit buffer and where it can be put: slot nav, the buffer/stored renames,
  // the destructive save, the version store, the local Presets/ + Sync/ folder, and the preset-watch
  // tick. Owned by `PresetBufferStore`; every member is re-exposed by the facade further down so the
  // ~44 modules that import `editor` keep working. See `presetBuffer.svelte.ts`.
  /** The preset-buffer slice's view of the rest of the store. Private field so nothing here leaks
   *  onto `EditorStore`'s public API. Getters, so every read is live. The device-session reads go
   *  through here rather than through a direct import of that slice — slices are siblings, never a
   *  stack (`src/lib/CLAUDE.md`, Store pattern § slices, rule 2). MUST stay declared above
   *  `#preset`, which calls it. */
  #presetBufferHost = (): PresetBufferHost => {
    const e = this;
    return {
      load: () => e.#grid.load(),
      reloadOpenParams: async () => { if (e.#param.selKey) await e.#param.reloadParams(); },
      showToast: (text, accent) => e.showToast(text, accent),
      histSwitch: (n) => e.#histSwitch(n),
      get status() { return e.status; },
      get presetLiveQuery() { return e.presetLiveQuery; },
      get slowLink() { return e.slowLink; },
      get legacyAm4() { return !e.isV2 && e.isAm4; },
      get canRenamePresets() { return e.canRenamePresets; },
      get canDeepScan() { return e.canDeepScan; },
      get preset() { return e.preset; },
      setPreset: (p) => { e.preset = p; },
      get lastPreset() { return e.lastPreset; },
      setLastPreset: (n) => { e.lastPreset = n; },
      poll: () => e.poll()
    };
  };
  #preset = new PresetBufferStore(this.#presetBufferHost());

  // ── grid-editing slice (M4d) ──
  #gridEditingHost = (): GridEditingHost => {
    const e = this;
    return {
      get legacyAm4() { return !e.isV2 && e.isAm4; },
      get capabilityShuntBase() { return e.caps?.shuntBase; },
      get selected() { return e.#param.selected; },
      get virtualActive() { return !!e.#param.virtual; },
      closeEditor: () => e.#param.closeEditor(),
      setSelectionKey: (key) => e.#param.setSelectionKey(key),
      setSceneNames: (names) => { e.sceneNames = names; },
      onGridLoaded: () => e.#param.onGridLoaded(),
      startLiveMeters: () => e.startLiveMeters(),
      showToast: (text, accent) => e.showToast(text, accent),
      offerLoadFailure: (route, message) => e.offerDebugReport({ kind: 'device-comm', route, message })
    };
  };
  #grid = new GridEditingStore(this.#gridEditingHost());

  // ── parameter-editing slice (M4d) ──
  #paramEditingHost = (): ParamEditingHost => {
    const e = this;
    return {
      get layout() { return e.#grid.layout; },
      get status() { return e.#grid.status; },
      get legacyAm4() { return !e.isV2 && e.isAm4; },
      get paramsWithoutPack() { return e.paramsWithoutPack; },
      get hasCursorSelect() { return e.hasCursorSelect; },
      get hasBlockMeters() { return e.hasBlockMeters; },
      get slowLink() { return e.slowLink; },
      loadGrid: () => e.#grid.load(),
      scheduleBlockStateReload: () => e.#scheduleBlockStateReload(),
      showToast: (text, accent) => e.showToast(text, accent),
      clearLooperWave: () => { e.looperWave = null; }
    };
  };
  #param = new ParamEditingStore(this.#paramEditingHost());

  // ── shell view state ──
  inLibrary = $state(false);
  railActive = $state('build');

  // ── telemetry slice (M4a) ──
  // SSE, tuner/CPU/levels/traffic readouts, live meters, polling mode, Faro + debug reports.
  // Owned by `TelemetryStore`; every member below is re-exposed by the facade further down so the
  // ~44 modules that import `editor` keep working. See `telemetry.svelte.ts`.
  /** The telemetry slice's view of the rest of the store. Declared as a private field so nothing here
   *  leaks onto `EditorStore`'s public API, and so the private members it forwards to stay private.
   *  Getters, so every read is live. MUST stay declared above `#telemetry`, which calls it. */
  #telemetryHost = (): TelemetryHost => {
    const e = this;
    return {
      get status() { return e.status; },
      get hasLiveMonitors() { return e.hasLiveMonitors; },
      get slowLink() { return e.slowLink; },
      get hasTelemetryControl() { return e.hasTelemetryControl; },
      get connDevice() { return e.conn.device; },
      get connFw() { return e.conn.fw; },
      get contact() { return e.contact; },
      get selectedEffectId() { return e.selected?.effectId ?? null; },
      get blockSlug() { return e.blockSlug; },
      get inLibrary() { return e.inLibrary; },
      get onVirtualScreen() { return !!e.virtual; },
      showToast: (text, accent) => e.showToast(text, accent),
      persistProfile: () => e.#persistProfile(),
      onConsentResolved: () => e.#maybeShowKofi(),
      applyTempo: (bpm) => e.#device.applyTempo(bpm),
      applyScene: (index) => e.#device.applyScene(index),
      applyParamEcho: (effectId, paramId, norm) => e.#param.applyParamEcho(effectId, paramId, norm),
      applyConfig: (id, data) => e.#applyConfig(id, data),
      scheduleBlockStateReload: () => e.#scheduleBlockStateReload(),
      scheduleStructuralReload: () => e.#scheduleStructuralReload()
    };
  };
  #telemetry = new TelemetryStore(this.#telemetryHost());
  vw = $state(1280);
  vh = $state(800);

  // ── overlays ──
  update = $state<{ version: string; url: string } | null>(null); // newer release (web fallback / non-desktop)
  /** Desktop auto-update status (Electron). idle until the updater reports something. */
  autoUpdate = $state<{ state: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'; version?: string; percent?: number }>({ state: 'idle' });
  // ── Axis hub (single rail entry point: Storage · Connection · Privacy · About) ──
  // Modal open-state lives in the overlay registry (src/lib/overlay/overlays.svelte.ts) — the
  // single owner of "which overlay is open" and of Escape priority. These accessors keep the
  // long-standing `editor.xOpen` call sites (and the EditorSurface contract) working unchanged.
  get axisOpen() { return overlays.isOpen('axisHub'); }
  set axisOpen(v: boolean) { if (v) overlays.open('axisHub'); else overlays.close('axisHub'); }
  axisTab = $state<'storage' | 'privacy' | 'about' | 'device' | 'performance'>('about');
  get themeOpen() { return overlays.isOpen('theme'); } // Appearance / theme picker modal
  set themeOpen(v: boolean) { if (v) overlays.open('theme'); else overlays.close('theme'); }
  drawerOpen = $state(false); // mobile nav drawer (replaces the tool rail on phones)
  /** Optional contact the user may leave (Fractal forum / Reddit / email) so we can follow up on a bug.
   *  ≤100 chars; stored in the synced `config/profile` doc + a local mirror. Never used for marketing. */
  contact = $state<string>(loadContact());
  /** Bottom-bar hover hint (left slot) — describes the parameter/control under the cursor. */
  hint = $state<string | null>(null);
  /** First-run popups: `consentPrompt` = telemetry accept/decline (only when telemetry is enabled in the
   *  build and the user hasn't decided yet); `kofiNotice` = a one-time "support development" nudge. */
  kofiNoticeOpen = $state(false);
  /** First-run guided tour (see Tour.svelte). `tourStep` is a 0-based index into its STEPS array. */
  tourActive = $state(false);
  tourStep = $state(0);
  get paletteOpen() { return overlays.isOpen('palette'); }
  set paletteOpen(v: boolean) { if (v) overlays.open('palette'); else overlays.close('palette'); }
  paletteMode = $state<'place' | 'retype'>('place');
  placeTarget = $state<{ row: number; col: number } | null>(null);
  get quickBuildOpen() { return overlays.isOpen('quickBuild'); }
  set quickBuildOpen(v: boolean) { if (v) overlays.open('quickBuild'); else overlays.close('quickBuild'); }
  get presetOpen() { return overlays.isOpen('presetPicker'); }
  set presetOpen(v: boolean) { if (v) overlays.open('presetPicker'); else overlays.close('presetPicker'); }
  /** PresetPicker "pick a slot" mode. When set, the picker hands the chosen slot number + name to this
   *  callback (e.g. the cross-device converter save dialog) INSTEAD of loading the preset onto the
   *  device, then closes. Null = normal load-a-preset mode. Cleared whenever the picker closes. */
  presetPick = $state<((slot: number, name: string) => void) | null>(null);
  /** The slim, workbench-only preset search overlay opened from the Grid page's top-bar preset widget
   *  (see AxisPresetBrowserSearchOverlay.svelte) — search + results only, no navigation away from Grid. */
  get presetSearchOpen() { return overlays.isOpen('presetSearch'); }
  set presetSearchOpen(v: boolean) { if (v) overlays.open('presetSearch'); else overlays.close('presetSearch'); }
  get cabPickerOpen() { return overlays.isOpen('cabPicker'); }
  set cabPickerOpen(v: boolean) { if (v) overlays.open('cabPicker'); else overlays.close('cabPicker'); }
  cabPickerSlot = $state(0);
  // Device Tools modal (preset backup/restore/decode, firmware validate, modifier view)
  get deviceToolsOpen() { return overlays.isOpen('deviceTools'); }
  set deviceToolsOpen(v: boolean) { if (v) overlays.open('deviceTools'); else overlays.close('deviceTools'); }
  toast = $state<{ text: string; accent: string } | null>(null);

  #toastT: ReturnType<typeof setTimeout> | null = null;

  // ── derived ──
  // Phones AND tablets use the compact layout (burger + slide-in drawer that hides scenes/nav/status);
  // only real laptops/desktops (≥1366) get the full top bar + rail. Raised from 760 so cramped
  // "tablet" widths don't squeeze the top bar — they get the clean drawer layout instead.
  get isMobile() {
    return this.vw < 1366;
  }

  // ── lifecycle ──
  init = async () => {
    this.#param.init();
    // history's inverse writes go straight to forgefx; it calls back here for UI refresh + toasts
    history.bindHost({
      load: () => this.load(),
      reloadParams: () => this.#param.reloadParams(),
      echoParam: (eid, pid, norm) => this.applyDeviceEvent({ type: 'param', effectId: eid, paramId: pid, norm }),
      toast: (text, accent) => this.showToast(text, accent),
      isLegacyAm4: () => !this.isV2 && this.isAm4
    });
    setRequestFailureReporter(this.#telemetry.onReqFailure); // auto-report every 5xx/network failure to Faro
    this.loadPorts(); // know the transport early (drives slowLink → meter throttling over MIDI)
    // Desktop-only first-run + update flows: the remote web app has no desktop to update, and the tour /
    // telemetry-consent / Ko-fi first-run popups belong to the PC install (the host handles telemetry), so
    // skip them in the remote build — otherwise every browser session nags with banners it can't act on.
    if (!isWebBuild()) {
      this.#initUpdater();
      this.#telemetry.init();
    }
    this.#preset.initSync(); // sync-bus hook → debounced local Sync/ mirror
    void this.#loadProfile();
    this.#preset.initLocal();
    this.#telemetry.openEvents();
    // auto-detect the attached unit FIRST (so load() knows whether to use the AM4 4-slot path), and
    // warn if it isn't a model we have a live codec for
    try {
      this.detected = await forgefx.detect();
      blockLibrary.preloadWhenIdle(appSettings.cfg.blockLibraryPath || defaultBlockLibraryPath(this.detected.connected ? this.detected.name : null) || '');
      if (this.detected.connected && !this.detected.supported) this.showToast(`${this.detected.name} detected — not yet supported`, '#d6543f');
    } catch {
      /* detect failed — proceed; load() falls back to the gen-3 path */
    }
    // negotiate the API version + capabilities BEFORE the first load(), so every caps gate below
    // (unified vs legacy routes, polling, meters, renames) is decided correctly from the start
    await this.#device.handshake();
    this.#telemetry.reapplyPollingMode(); // re-assert the saved polling mode once caps confirm the control exists
    if (this.presetLiveQuery) {
      try {
        const n = (await forgefx.currentPreset()).number;
        if (n >= 0) this.lastPreset = n;
      } catch {
        /* */
      }
    }
    await this.load();
    this.#device.syncSceneTempo();
  };

  // one-shot check against GitHub releases — surface a top-bar pill when a newer beta is out
  #checkUpdate = async () => {
    try {
      const r = await fetch('https://api.github.com/repos/sKuhLight/Axis/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const j = await r.json();
      const tag = String(j.tag_name ?? '');
      const latest = tag.replace(/^v/, '').split('-')[0];
      if (this.#isNewer(latest, __APP_VERSION__)) this.update = { version: tag.replace(/^v/, ''), url: j.html_url || 'https://github.com/sKuhLight/Axis/releases/latest' };
    } catch {
      /* offline / rate-limited — no notification */
    }
  };
  #isNewer = (a: string, b: string): boolean => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  };
  dismissUpdate = () => (this.update = null);

  // ── desktop auto-update (Electron) ──
  #initUpdater = () => {
    const u = typeof window !== 'undefined' ? window.axisUpdate : undefined;
    if (!u) { this.#checkUpdate(); return; } // not desktop → web pill fallback
    u.on((e) => {
      if (e.channel === 'available') {
        // Linux distro packages (pacman/deb/rpm) can't be auto-installed — show the GitHub link instead of
        // the (no-op) download/restart flow.
        if (e.canInstall === false) this.update = { version: e.version ?? '', url: e.url ?? 'https://github.com/sKuhLight/Axis/releases/latest' };
        else this.autoUpdate = { state: 'available', version: e.version };
      }
      else if (e.channel === 'progress') this.autoUpdate = { state: 'downloading', percent: e.percent };
      else if (e.channel === 'downloaded') this.autoUpdate = { state: 'downloaded', version: e.version };
      else if (e.channel === 'error') { this.autoUpdate = { state: 'idle' }; this.#checkUpdate(); } // fall back to the manual link
    });
    u.check();
  };
  downloadUpdate = () => window.axisUpdate?.download();
  installUpdate = () => window.axisUpdate?.install();


  // ── first-run onboarding chain (consent → Ko-fi → tour) ──
  /** Called by the telemetry slice once the consent question is settled (answered, or never asked).
   *  Show the one-time "support development on Ko-fi" notice, unless it's already been seen or a
   *  consent prompt is currently up (never stack two first-run popups). If Ko-fi won't show, hand off to
   *  the tour so the first-run sequence continues (consent → Ko-fi → tour). */
  #maybeShowKofi = () => {
    if (this.consentPromptOpen) return;
    if (loadKofiSeen()) { this.#maybeStartTour(); return; }
    this.kofiNoticeOpen = true;
  };
  dismissKofiNotice = () => {
    this.kofiNoticeOpen = false;
    try { localStorage.setItem(KOFI_SEEN_KEY, '1'); } catch { /* */ }
    this.#maybeStartTour(); // continue the first-run sequence
  };
  /** First-run guided tour. Auto-starts once, only after the consent + Ko-fi notices are resolved so
   *  nothing stacks; persists `axs.tour.done` on finish/skip. Replayable via startTour() from the hub. */
  #maybeStartTour = () => {
    if (!TOUR_ENABLED || loadTourDone() || this.consentPromptOpen || this.kofiNoticeOpen) return;
    this.tourStep = 0;
    this.tourActive = true;
  };
  startTour = () => { if (!TOUR_ENABLED) return; this.tourStep = 0; this.tourActive = true; };
  tourNext = () => { if (this.tourStep >= TOUR_LAST) this.endTour(); else this.tourStep++; };
  tourPrev = () => { if (this.tourStep > 0) this.tourStep--; };
  endTour = () => { this.tourActive = false; try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* */ } };

  // ── Axis hub + profile (contact / synced prefs) ──
  openAxis = (tab: 'storage' | 'privacy' | 'about' | 'device' | 'performance' = 'about') => { this.axisTab = tab; this.axisOpen = true; if (tab === 'device') this.loadPorts(); };
  /** Bottom-bar hover hint helpers — a control calls setHint on mouseenter/focus, clearHint on leave/blur. */
  setHint = (text: string) => { this.hint = text; };
  clearHint = () => { this.hint = null; };
  /** Set the optional contact string (capped at 100 chars), mirror locally, and persist to the profile. */
  setContact = (v: string) => {
    this.contact = v.slice(0, 100);
    try { localStorage.setItem(CONTACT_KEY, this.contact); } catch { /* */ }
    this.#persistProfile();
  };
  /** The profile is a single `config/profile` doc: it rides the normal config sync (LWW across devices
   *  when logged in) and is wiped by account deletion. Kept as a plain doc so no bespoke table/endpoint is
   *  needed. Local mirrors (localStorage) keep contact + consent available synchronously and offline. */
  #persistProfile = () => {
    forgefx.putDoc('config', 'profile', { contact: this.contact, telemetryConsent: this.telemetry.consent, pollingMode: this.pollingMode, updatedAt: Date.now() })
      .then(() => notifyMutation())
      .catch(() => { /* store unavailable (engine not ready) — the local mirror still holds the value */ });
  };
  /** Pull the stored profile on boot and reconcile: adopt a stored contact, and honour a stored
   *  telemetry choice (updating the local mirror + Faro state to match). */
  #loadProfile = async () => {
    try {
      const doc = await forgefx.getDoc<{ contact?: string; telemetryConsent?: boolean; pollingMode?: TelemetryMode }>('config', 'profile');
      const p = doc?.data;
      if (!p) return;
      if (typeof p.contact === 'string' && p.contact !== this.contact) {
        this.contact = p.contact.slice(0, 100);
        try { localStorage.setItem(CONTACT_KEY, this.contact); } catch { /* */ }
      }
      if (typeof p.telemetryConsent === 'boolean' && p.telemetryConsent !== this.telemetry.consent) {
        this.setTelemetryConsent(p.telemetryConsent);
      }
      // Adopt a stored polling mode: update state + local mirror, then push it to the device (if the
      // control is available). Not a fresh user action, so we don't re-persist the profile.
      if (isTelemetryMode(p.pollingMode)) this.#telemetry.adoptPollingMode(p.pollingMode);
    } catch { /* no profile yet / engine not ready */ }
  };

  #eventReload: ReturnType<typeof setTimeout> | null = null;
  /** Reflect a scene change WITHOUT a full preset reload. A scene switch never changes the grid
   *  STRUCTURE (block placement/routing is preset-level) — only per-block bypass / active channel /
   *  channel-linked params. So re-apply just the cheap bypass+channel (one fn-0x13 read via
   *  /preset/scene-state) onto the EXISTING layout, and re-read only the currently-open block. Keeps
   *  scene changes snappy and off the heavy preset-dump path (a full dump right after a scene switch
   *  hits the device mid-rebuild → truncated → 503 crash). Devices without the endpoint (501) fall
   *  back to a full load(). */
  #refreshScene = async () => {
    const st = await forgefx.sceneState().catch(() => null);
    if (!st || !Array.isArray(st)) {
      // no lightweight path (AM4: /preset/scene-state is 501) → full reload. load() only refreshes
      // grid+blocks, so the open block's per-channel params (incl. blockType — the Type row) must be
      // re-read here too, exactly like the lightweight path below does.
      await this.#grid.load();
      if (this.#param.selKey) await this.#param.reloadParams();
      return;
    }
    this.#grid.applySceneState(st);
    this.#param.invalidatePinned();
    if (this.#param.selKey) await this.#param.reloadParams();
  };
  /** Debounce scene reflection (coalesces an app click + its SSE echo, or a fast footswitch sweep,
   *  into one lightweight refresh). */
  #scheduleSceneReload = (settleMs = 250) => {
    if (this.#eventReload) clearTimeout(this.#eventReload);
    this.#eventReload = setTimeout(() => { void this.#refreshScene(); }, settleMs);
  };
  /** Debounce block-state reflection after channel changes; FM3-Edit waits a shorter settle window
   *  before re-reading the affected block. */
  #scheduleBlockStateReload = (settleMs = 120) => {
    if (this.#eventReload) clearTimeout(this.#eventReload);
    this.#eventReload = setTimeout(() => { void this.#refreshScene(); }, settleMs);
  };
  /** A structural change elsewhere (block placed/removed, preset switched, or a device-side edit the unit
   *  doesn't push — AM4 front-panel / AM4-Edit). Reload, debounced on the SHARED `#eventReload` timer so a
   *  burst coalesces into one refresh. Also re-read the open block's knobs: load() only refreshes the grid
   *  + blocks, so without this a front-panel knob turn on the open block would leave its arcs stale. */
  #scheduleStructuralReload = () => {
    if (this.#eventReload) clearTimeout(this.#eventReload);
    this.#eventReload = setTimeout(async () => {
      await this.#grid.load();
      if (this.#param.selKey) await this.#param.reloadParams();
    }, 250);
  };

  /** Apply a shared config doc pushed by another UI (host↔remote). Sets local state + the localStorage cache
   *  directly — never re-saves (which would re-broadcast and loop). */
  #applyConfig = (id: string, data: unknown) => {
    const cache = (k: string) => { try { localStorage.setItem(k, JSON.stringify(data)); } catch { /* */ } };
    if ((id === 'swipe' || id === 'layouts') && data && typeof data === 'object') this.#param.applyRemoteConfig(id, data);
    else if (id === 'savedFilters') cache('axs.pb.saved');
    else if (id === 'tags' || id === 'collections' || id === 'favs' || id === 'tagColors') library.applyRemoteConfig(id, data);
  };
  /** Point the history store at the active device+slot (idempotent — cheap to call from poll ticks). */
  #histSwitch = (n: number) => {
    void history.switchTo(this.detected?.short ?? this.layout.model ?? 'dev', n);
  };

  // Return to the Signal Grid (Build) from any rail/virtual screen.
  openBuild = () => {
    this.#param.clearVirtual();
    this.inLibrary = false;
    this.railActive = 'build';
  };

  // Open the full Preset Browser (its own rail screen — replaces the grid/editor view).
  openLibrary = () => {
    this.#param.clearVirtual();
    this.#param.closeEditor();
    this.inLibrary = true;
    this.railActive = 'library';
  };

  // Open a virtual effect (Setup=1, Controllers=2, Modifier=3, FC=199) as a rail screen. Same param
  // path as a block — "the block editor pointed at effectId N" — rendered full-view by VirtualScreen.
  openVirtual = async (eid: number, slug: string, name: string) => {
    const opening = this.#param.openVirtual(eid, slug, name);
    this.inLibrary = false;
    await opening;
  };

  // ── param writes (optimistic + debounced continuous) ──
  setParam = (p: NamedParam, v: number) => this.#param.setParam(p, v);
  setEnum = (e: EnumParam, value: number) => this.#param.setEnum(e, value);
  toggleBypass = (cell?: Cell) => this.#param.toggleBypass(cell);
  setChannel = (ch: string) => this.#param.setChannel(ch);
  retype = (value: number) => this.#param.retype(value);

  /** Apply the exact saved-block data previewed in the library picker. The device writes are not safely undoable. */
  applyBlockLibrarySource = (block: DecodedBlockFile) => this.#param.applyBlockLibrarySource(block);

  // ── cab IR picker ──
  /** Read a block's current cab/IR state. Routed through the store (not called on `forgefx` directly by
   *  components) so the editor surface owns it — an offline surface can override with a buffer read. */
  cabState = (eid: number) => this.#param.cabState(eid);
  openCabPicker = (slot = 0) => {
    if (!this.selected?.pack) return;
    this.cabPickerSlot = Math.max(0, slot);
    this.cabPickerOpen = true;
  };
  /** Apply a set of discrete cab writes (mode / bank / IR index / dyna type) then refresh params. */
  applyCab = (writes: { paramId: number; value: number }[]) => this.#param.applyCab(writes);

  // ── external drop preview (Quick Build sidecar → grid) ──
  setExternalDrop = (row: number, col: number, valid: boolean) => this.#grid.setExternalDrop(row, col, valid);
  clearExternalDrop = () => this.#grid.clearExternalDrop();

  // ── palette openers ──
  openPaletteAt = (row: number, col: number) => {
    this.placeTarget = { row, col };
    this.paletteMode = 'place';
    this.paletteOpen = true;
  };
  openRetype = () => {
    if (!this.selected?.pack) return;
    this.paletteMode = 'retype';
    this.paletteOpen = true;
  };

  // ── grid editing ──
  place = (row: number, col: number, blockId: number, label?: string) => this.#grid.place(row, col, blockId, label);
  removeAt = (row: number, col: number) => this.#grid.removeAt(row, col);
  removeSelected = () => this.#grid.removeSelected();
  removeHoveredOrSelected = () => this.#grid.removeHoveredOrSelected();

  move = (src: Cell, row: number, col: number) => this.#grid.move(src, row, col);

  armLink = (c: Cell) => this.#grid.armLink(c);
  cancelLink = () => this.#grid.cancelLink();
  completeLink = (row: number, col: number) => this.#grid.completeLink(row, col);
  connect = (src: Cell, destRow: number, destCol: number) => this.#grid.connect(src, destRow, destCol);

  replaceShunt = (target: Cell, block: { blockId: number; display: string; src?: Cell }) => this.#grid.replaceShunt(target, block);
  disconnect = (srcRow: number, srcCol: number, destRow: number) => this.#grid.disconnect(srcRow, srcCol, destRow);

  // ── preset picker (slot-pick mode) ──
  // Preset NAV itself (selectPreset / stepPreset / save / renames) lives in the preset-buffer slice.
  // This opener stays here because it touches no buffer state — only `presetPick` + the overlay
  // registry, both owned by the overlay layer above.
  /** Open the preset picker in "pick a slot" mode: `onPick` receives the chosen slot number + name and
   *  the picker closes WITHOUT loading the preset (used by the converter save dialog to reuse the real
   *  device-preset list as a slot chooser). */
  openSlotPicker = (onPick: (slot: number, name: string) => void) => {
    this.presetPick = onPick;
    this.presetOpen = true;
  };

  // ── toast ──
  showToast = (text: string, accent = '#33c46b') => {
    if (this.#toastT) clearTimeout(this.#toastT);
    this.toast = { text, accent };
    this.#toastT = setTimeout(() => (this.toast = null), 2150);
  };

  setViewport = (w: number, h: number) => {
    this.vw = w;
    this.vh = h;
    this.#grid.applyViewportWidth(w);
  };

  // ── grid-editing facade ──────────────────────────────────────────────────────────────────────
  get status() { return this.#grid.status; }
  get layout() { return this.#grid.layout; }
  get everLoaded() { return this.#grid.everLoaded; }
  get mobCols() { return this.#grid.mobCols; }
  get mobColsAuto() { return this.#grid.mobColsAuto; }
  get gridPage() { return this.#grid.gridPage; }
  get pageCount() { return this.#grid.pageCount; }
  get firstEmptyCell() { return this.#grid.firstEmptyCell; }
  get shuntBase() { return this.#grid.shuntBase; }
  get externalDrop() { return this.#grid.externalDrop; }
  get linkFrom() { return this.#grid.linkFrom; }
  fitCols = (w: number) => this.#grid.fitCols(w);
  changeCols = (d: number) => this.#grid.changeCols(d);
  setCols = (n: number) => this.#grid.setCols(n);
  colsFit = () => this.#grid.colsFit();
  changePage = (d: number) => this.#grid.changePage(d);
  setPage = (p: number) => this.#grid.setPage(p);
  load = () => this.#grid.load();

  // ── parameter-editing facade ─────────────────────────────────────────────────────────────────
  get selKey() { return this.#param.selKey; }
  get selected() { return this.#param.selected; }
  get editorOpen() { return this.#param.editorOpen; }
  get editorH() { return this.#param.editorH; }
  set editorH(v) { this.#param.editorH = v; }
  get params() { return this.#param.params; }
  get enums() { return this.#param.enums; }
  get blockType() { return this.#param.blockType; }
  get blockSlug() { return this.#param.blockSlug; }
  get sheetState() { return this.#param.sheetState; }
  get blockLayout() { return this.#param.blockLayout; }
  get virtual() { return this.#param.virtual; }
  set virtual(v) { this.#param.virtual = v; }
  get activePage() { return this.#param.activePage; }
  get customLayouts() { return this.#param.customLayouts; }
  get editingTabs() { return this.#param.editingTabs; }
  get swipeControls() { return this.#param.swipeControls; }
  get meters() { return this.#param.meters; }
  get activeCtl() { return this.#param.activeCtl; }
  get pinnedParams() { return this.#param.pinnedParams; }
  get monitorParams() { return this.#param.monitorParams; }
  get familyKey() { return this.#param.familyKey; }
  get tabs() { return this.#param.tabs; }
  get openBlockMonitors() { return this.#param.openBlockMonitors; }
  typeNameFor = (effectId: number) => this.#param.typeNameFor(effectId);
  loadMonitorParams = () => this.#param.loadMonitorParams();
  monitorsByPid = (family: string | null | undefined) => this.#param.monitorsByPid(family);
  looperControl = (action: string, on: boolean) => this.#param.looperControl(action, on);
  addTab = () => this.#param.addTab();
  renameTab = (id: string, name: string) => this.#param.renameTab(id, name);
  deleteTab = (id: string) => this.#param.deleteTab(id);
  toggleParamInTab = (id: string, paramId: number) => this.#param.toggleParamInTab(id, paramId);
  slugOf = (c: Cell) => this.#param.slugOf(c);
  swipeFor = (slug: string) => this.#param.swipeFor(slug);
  isSwipeControl = (paramId: number) => this.#param.isSwipeControl(paramId);
  toggleSwipeControl = (p: NamedParam) => this.#param.toggleSwipeControl(p);
  controlsFor = (cell: Cell) => this.#param.controlsFor(cell);
  meterFor = (cell: Cell) => this.#param.meterFor(cell);
  cycleControl = (cell: Cell, dir: number) => this.#param.cycleControl(cell, dir);
  adjustSwipe = (cell: Cell, deltaNorm: number) => this.#param.adjustSwipe(cell, deltaNorm);
  fetchMeters = () => this.#param.fetchMeters();
  registerPinnedBlock = (effectId: number | undefined) => this.#param.registerPinnedBlock(effectId);
  pinnedView = (effectId: number | undefined) => this.#param.pinnedView(effectId);
  setPinnedParam = (effectId: number, p: NamedParam, v: number) => this.#param.setPinnedParam(effectId, p, v);
  setPinnedEnum = (effectId: number, e: EnumParam, value: number) => this.#param.setPinnedEnum(effectId, e, value);
  selectCellOnDevice = (row: number, col: number) => this.#param.selectCellOnDevice(row, col);
  openCell = (c: Cell) => this.#param.openCell(c);
  closeEditor = () => this.#param.closeEditor();

  // ── device-session facade ────────────────────────────────────────────────────────────────────
  // Straight delegation to `#device` (deviceSession.svelte.ts). Keeps `editor.conn`, `editor.caps`,
  // every capability gate, `editor.poll()`, the port picker and the scene/tempo actions reading and
  // writing exactly as they did before the extraction. ADD to this facade when the slice grows a
  // member; never re-add state to `EditorStore`.
  get conn() { return this.#device.conn; }
  get caps() { return this.#device.caps; }
  get apiVersion() { return this.#device.apiVersion; }
  get isV2() { return this.#device.isV2; }
  get presetLiveQuery() { return this.#device.presetLiveQuery; }
  get hasBlockMeters() { return this.#device.hasBlockMeters; }
  get hasLiveMonitors() { return this.#device.hasLiveMonitors; }
  get hasTempo() { return this.#device.hasTempo; }
  get hasTuner() { return this.#device.hasTuner; }
  get hasCursorSelect() { return this.#device.hasCursorSelect; }
  get paramsWithoutPack() { return this.#device.paramsWithoutPack; }
  get canRenamePresets() { return this.#device.canRenamePresets; }
  get canRenameScenes() { return this.#device.canRenameScenes; }
  get canDeepScan() { return this.#device.canDeepScan; }
  get scanNamesOnly() { return this.#device.scanNamesOnly; }
  get bankLetterAddressing() { return this.#device.bankLetterAddressing; }
  get canGridRoute() { return this.#device.canGridRoute; }
  get sceneCount() { return this.#device.sceneCount; }
  get hasTelemetryControl() { return this.#device.hasTelemetryControl; }
  get isAm4() { return this.#device.isAm4; }
  get slowLink() { return this.#device.slowLink; }
  get presetCount() { return this.#device.presetCount; }
  // Writable: all four were plain `$state` fields before the extraction and are still written from
  // the parts of the store that have not been extracted yet (init, load, watchPreset, the preset
  // renames + nav). Dropping a `set` here breaks assignment at RUNTIME and nothing catches it —
  // `_editorSatisfiesSurface` cannot, because TypeScript ignores write-ability in assignability.
  get detected() { return this.#device.detected; }
  set detected(v) { this.#device.detected = v; }
  get preset() { return this.#device.preset; }
  set preset(v) { this.#device.preset = v; }
  get lastPreset() { return this.#device.lastPreset; }
  set lastPreset(v) { this.#device.lastPreset = v; }
  get sceneNames() { return this.#device.sceneNames; }
  set sceneNames(v) { this.#device.sceneNames = v; }
  get scene() { return this.#device.scene; }
  get bpm() { return this.#device.bpm; }
  set bpm(v) { this.#device.bpm = v; } // no writer today, but `EditorSurface` hands it to components as mutable
  sceneName = (n: number) => this.#device.sceneName(n);
  poll = () => this.#device.poll();
  selectScene = (ui: number) => this.#device.selectScene(ui);
  renameScene = (ui: number, name: string) => this.#device.renameScene(ui, name);
  setBpm = (bpm: number) => this.#device.setBpm(bpm);
  tapTempo = () => this.#device.tapTempo();
  // The monolith's ToolRail closes the port popover by assignment, so `portsOpen` keeps its setter.
  get portsOpen() { return this.#device.portsOpen; }
  set portsOpen(v) { this.#device.portsOpen = v; }
  get ports() { return this.#device.ports; }
  get portChosen() { return this.#device.portChosen; }
  get portOverride() { return this.#device.portOverride; }
  get profileOverride() { return this.#device.profileOverride; }
  openPorts = () => this.#device.openPorts();
  loadPorts = () => this.#device.loadPorts();
  pickPort = (conn: ConnPick | null) => this.#device.pickPort(conn);
  pickProfile = (model: ProfileKey) => this.#device.pickProfile(model);

  // ── telemetry facade ─────────────────────────────────────────────────────────────────────────
  // Straight delegation to `#telemetry` (telemetry.svelte.ts). This exists so the ~44 modules that
  // import `editor` keep reading `editor.tuner`, `editor.meteringOn`, `editor.uploadDebugReport()`
  // and friends unchanged — the extraction is invisible to call sites. Migrating those call sites to
  // import `TelemetryStore` directly is a separate, later change; until then ADD to this facade
  // rather than re-adding state to `EditorStore`.
  get tuner() { return this.#telemetry.tuner; }
  get cpu() { return this.#telemetry.cpu; }
  get levels() { return this.#telemetry.levels; }
  get linkMs() { return this.#telemetry.linkMs; }
  set linkMs(v) { this.#telemetry.linkMs = v; }
  get traffic() { return this.#telemetry.traffic; }
  get looperWave() { return this.#telemetry.looperWave; }
  set looperWave(v) { this.#telemetry.looperWave = v; }
  get pollingMode() { return this.#telemetry.pollingMode; }
  get telemetry() { return this.#telemetry.telemetry; }
  // Writable: both were plain `$state` fields before the extraction, and the overlay e2e harness
  // drives them directly to stage a prompt. Product code only reads them.
  get consentPromptOpen() { return this.#telemetry.consentPromptOpen; }
  set consentPromptOpen(v) { this.#telemetry.consentPromptOpen = v; }
  get reportPrompt() { return this.#telemetry.reportPrompt; }
  set reportPrompt(v) { this.#telemetry.reportPrompt = v; }
  get meteringOn() { return this.#telemetry.meteringOn; }
  set meteringOn(v) { this.#telemetry.meteringOn = v; }
  get liveMeters() { return this.#telemetry.liveMeters; }
  get canMeterBlocks() { return this.#telemetry.canMeterBlocks; }
  monitorFor = (effectId: number) => this.#telemetry.monitorFor(effectId);
  monitorsFor = (effectId: number) => this.#telemetry.monitorsFor(effectId);
  startLiveMeters = () => this.#telemetry.startLiveMeters();
  stopLiveMeters = () => this.#telemetry.stopLiveMeters();
  applyDeviceEvent = (e: DeviceEvent) => this.#telemetry.applyDeviceEvent(e);
  toggleTuner = () => this.#telemetry.toggleTuner();
  setPollingMode = (mode: TelemetryMode) => this.#telemetry.setPollingMode(mode);
  setTelemetryConsent = (on: boolean) => this.#telemetry.setTelemetryConsent(on);
  decideTelemetry = (on: boolean) => this.#telemetry.decideTelemetry(on);
  uploadDebugReport = (trigger?: DebugReport['trigger']) => this.#telemetry.uploadDebugReport(trigger);
  offerDebugReport = (trigger: ReportTrigger) => this.#telemetry.offerDebugReport(trigger);
  reportFailure = (trigger: ReportTrigger) => this.#telemetry.reportFailure(trigger);
  dismissReportPrompt = () => this.#telemetry.dismissReportPrompt();
  recordEvent = (kind: string, text: string) => this.#telemetry.recordEvent(kind, text);

  // ── preset-buffer facade ─────────────────────────────────────────────────────────────────────
  // Straight delegation to `#preset` (presetBuffer.svelte.ts). Keeps `editor.selectPreset()`,
  // `editor.save()`, `editor.local`, `editor.bufferSource` and friends reading and writing exactly
  // as they did before the extraction. ADD to this facade when the slice grows a member; never
  // re-add state to `EditorStore`.
  backupPreset = (n: number) => this.#preset.backupPreset(n);
  loadVersion = (id: string) => this.#preset.loadVersion(id);
  scheduleAutoSync = () => this.#preset.scheduleAutoSync();
  get local() { return this.#preset.local; }
  setLocalRoot = (root: string | null) => this.#preset.setLocalRoot(root);
  localSync = () => this.#preset.localSync();
  localRestore = () => this.#preset.localRestore();
  setLocalAutoSync = (on: boolean) => this.#preset.setLocalAutoSync(on);
  fullDeviceBackup = () => this.#preset.fullDeviceBackup();
  noteBufferReplaced = (label: string) => this.#preset.noteBufferReplaced(label);
  saveLocalFile = () => this.#preset.saveLocalFile();
  watchPreset = () => this.#preset.watchPreset();
  renamePreset = (name: string) => this.#preset.renamePreset(name);
  renameStoredPreset = (slot: number, name: string) => this.#preset.renameStoredPreset(slot, name);
  selectPreset = (n: number, opts?: { recency?: boolean }) => this.#preset.selectPreset(n, opts);
  stepPreset = (dir: number) => this.#preset.stepPreset(dir);
  loadAm4Preset = (location: number, opts?: { recency?: boolean }) => this.#preset.loadAm4Preset(location, opts);
  openSave = () => this.#preset.openSave();
  save = (n: number) => this.#preset.save(n);
  // Writable: the preset browser + the workbench preset host assign `bufferSource` when they load a
  // local file onto the device, SaveDialog closes itself with `editor.saveOpen = false`, and the
  // save dialog binds `saveTarget`. Dropping a `set` here breaks assignment at RUNTIME and nothing
  // catches it — `_editorSatisfiesSurface` cannot, because TypeScript ignores write-ability in
  // assignability (see `src/lib/CLAUDE.md`, Store pattern § slices, rule 4).
  get bufferSource() { return this.#preset.bufferSource; }
  set bufferSource(v) { this.#preset.bufferSource = v; }
  get saveOpen() { return this.#preset.saveOpen; }
  set saveOpen(v) { this.#preset.saveOpen = v; }
  get saveTarget() { return this.#preset.saveTarget; }
  set saveTarget(v) { this.#preset.saveTarget = v; }
}

export const editor = new EditorStore();
export { baseName, packFor };

// Compile-time guard: the live singleton MUST satisfy the data-source seam consumed by the
// editor-backed grid components (SignalGrid / GridMap / BlockEditor / EQGraph /
// CabPicker). If this stops typechecking, reconcile EditorSurface to the singleton's real signatures
// (the interface is a subset the singleton satisfies) — never the reverse.
export const _editorSatisfiesSurface: EditorSurface = editor;
