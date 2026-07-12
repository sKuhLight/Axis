// Central editor state + device actions for Axis. A single runes-based store the
// rail / top bar / grid / editor / palette all read and drive. Wraps the ForgeFX
// HTTP client and preserves the live-verified write wiring (place, re-cabling move,
// cables, params, bypass, channel, retype).
import { forgefx, ForgeError, setRequestFailureReporter, isRemote, isDirect, CLIENT_ID } from './forgefx';
import { library } from './library.svelte';
import { cloud } from './cloud.svelte';
import { history } from './history.svelte';
import { onMutation, notifyMutation } from './syncBus';
import { layoutFromGrid, type Cell, type Layout } from './grid';
import { baseName, packFor, statusColor } from './blocks';
import { resolveTabs, loadLayouts, saveLayouts, newTabId, loadSwipe, saveSwipe, type SwipeCtrl } from './layouts';
import { surfApplyRemote } from './surfaceStore.svelte';
import { isRemoteBuild } from './cloudBrowser';
import { paramValue } from './format';
import type { NamedParam, EnumParam, TabDef, ResolvedTab, MeterVal, DetectResult, ConnPick, ConnInfo, ProfileKey, DeviceLayout, DebugReport, DeviceEvent } from './types';

export type ViewMode = 'basic' | 'advanced';
type Conn = { state: 'connecting' | 'online' | 'offline'; fw?: string; device?: string };
type CloudScopes = { presets: boolean; scenes: boolean; fc: boolean; settings: boolean };
const SCOPES_KEY = 'axs.cloud.scopes';
function loadScopes(): CloudScopes {
  try { return { presets: true, scenes: true, fc: true, settings: true, ...(JSON.parse(localStorage.getItem(SCOPES_KEY) || '{}')) }; }
  catch { return { presets: true, scenes: true, fc: true, settings: true }; }
}
const saveScopes = (s: CloudScopes) => { try { localStorage.setItem(SCOPES_KEY, JSON.stringify(s)); } catch { /* */ } };
const AUTOSYNC_KEY = 'axs.cloud.autosync';
const loadAutoSync = (): boolean => { try { return localStorage.getItem(AUTOSYNC_KEY) !== '0'; } catch { return true; } }; // default on
const LOCAL_AUTOSYNC_KEY = 'axs.local.autosync';
const loadLocalAutoSync = (): boolean => { try { return localStorage.getItem(LOCAL_AUTOSYNC_KEY) !== '0'; } catch { return true; } }; // default on
// Telemetry consent defaults OFF (inverse of auto-sync). Anonymous instance id is a random uuid — never PII.
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
// Optional contact the user may leave so we can follow up on a bug (Fractal forum / Reddit / email).
const CONTACT_KEY = 'axs.profile.contact';
const loadContact = (): string => { try { return localStorage.getItem(CONTACT_KEY) ?? ''; } catch { return ''; } };
// Whether the user has made a first-run telemetry choice (accept OR decline). Distinct from the consent
// value: unset → show the first-run prompt once; set → respect the stored consent silently.
const DECIDED_KEY = 'axs.telemetry.decided';
const loadDecided = (): boolean => { try { return localStorage.getItem(DECIDED_KEY) === '1'; } catch { return false; } };
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
/** Strip the obvious PII from a string before it leaves the machine: emails + usernames in home paths. */
function scrubPII(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/([Cc]:\\Users\\)[^\\\/\r\n"]+/g, '$1<user>')
    .replace(/(\/(?:home|Users)\/)[^\/\r\n"]+/g, '$1<user>');
}
const EMPTY: Layout = { cells: [], shunts: [], rows: 4, cols: 12, name: '', model: '', crcValid: true };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const SHUNT_ID = 1024; // FM3 routing/shunt cell base effect id (decoder: eid > 1000)

class EditorStore {
  // ── connection / preset ──
  conn = $state<Conn>({ state: 'connecting' });
  /** Per-model capabilities from the device descriptor (scenes, channels, slot model, …) — drives UI gating. */
  caps = $state<import('./types').DeviceCaps | null>(null);
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
  detected = $state<DetectResult | null>(null); // which Fractal unit is attached (auto-detect)
  preset = $state<{ number: number; name: string } | null>(null);
  lastPreset = $state<number | null>(null);

  // ── grid ──
  status = $state<'loading' | 'ready' | 'offline'>('loading');
  layout = $state<Layout>(EMPTY);
  everLoaded = $state(false);

  // ── selection / editor ──
  selKey = $state<string | null>(null); // "row,col"
  editorOpen = $state(false);
  editorH = $state(380);
  params = $state<NamedParam[]>([]);
  enums = $state<EnumParam[]>([]);
  blockType = $state<{ value: number; name: string } | null>(null);
  blockSlug = $state<string | null>(null); // catalog slug of the open block (from blockParams) — gates the looper poll
  /** Looper page telemetry for the open Looper block: waveform envelope (0..1) + playhead + level. */
  looperWave = $state<{ wave: number[]; position: number | null; level: number | null } | null>(null);
  sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('loading');
  /** Device-authentic editor pages for the open block/virtual effect (seeds the ControlSurface Default layout). */
  blockLayout = $state<DeviceLayout | null>(null);
  /** Active virtual effect (Setup=1, Controllers=2, Modifier=3, FC=199) when a rail screen is open, else null. */
  virtual = $state<{ eid: number; slug: string; name: string } | null>(null);
  /** True when the full Preset Browser rail screen is open (replaces the grid/editor view). */
  inLibrary = $state(false);

  // ── view + chrome ──
  globalMode = $state<ViewMode>('basic');
  activePage = $state<string>(''); // active tab id for the open block

  // ── parameter tabs (per-family custom layouts) ──
  customLayouts = $state<Record<string, TabDef[]>>({});
  editingTabs = $state(false);

  // ── swipe controls: knobs assigned to direct grid adjustment, per family slug ──
  swipeControls = $state<Record<string, SwipeCtrl[]>>({});
  // always-on per-block meter values (keyed effectId) + which control is active per block
  meters = $state<Record<number, { defaultId: number; defaultName: string; typeName: string; vals: Record<number, MeterVal> }>>({});
  activeCtl = $state<Record<number, number>>({});
  // ── pinned-param hydration: full param/enum data for placed blocks that host a
  // custom-panel control but are NOT the open block, so those controls read/write
  // live regardless of what (if anything) is selected. Same DTO the open block
  // uses (blockParams → named/enums), fetched on demand for mounted pinned widgets
  // only and invalidated on every preset/scene reload. Keyed by effectId. */
  pinnedParams = $state<Record<number, { named: NamedParam[]; enums: EnumParam[] }>>({});
  #pinnedRefs = new Map<number, number>(); // effectId → count of mounted pinned widgets
  #hydratePinnedTimer: ReturnType<typeof setTimeout> | null = null;
  /** Current model/type name of a placed block (for the grid tile sub-label). */
  typeNameFor = (effectId: number): string => this.meters[effectId]?.typeName ?? '';
  /** Live audio meters per placed monitored block (normalized 0..1 + mapped dB), keyed by effectId. */
  liveMeters = $state<Record<number, import('./types').LiveMonitor[]>>({});
  /** Primary live meter for a block (first monitor; null if none / not yet read) — back-compat. */
  monitorFor = (effectId: number): import('./types').LiveMonitor | null => this.liveMeters[effectId]?.[0] ?? null;
  /** ALL live meters a block reports (e.g. OUTPUT VU L+R, M-Comp 3 bands, cab gain+VU). */
  monitorsFor = (effectId: number): import('./types').LiveMonitor[] => this.liveMeters[effectId] ?? [];
  /** Toggle a looper transport control (record/play/stop/overdub/undo/once/reverse/half) on the open block. */
  looperControl = async (action: string, on: boolean) => {
    const eid = this.selected?.effectId;
    if (eid == null) return;
    try { await forgefx.looperControl(eid, action, on); } catch { /* best-effort */ }
  };
  scene = $state(1);
  /** Scene names of the open preset (index 0 = scene 1), decoded from the grid read. Empty string = unnamed. */
  sceneNames = $state<string[]>([]);
  /** Display name for a 1-based scene number — the decoded name, or "Scene N" when blank/unknown. */
  sceneName = (n: number): string => {
    const s = this.sceneNames[n - 1]?.trim();
    return s && s.length ? s : `Scene ${n}`;
  };
  railActive = $state('build');
  bpm = $state(120);
  presetCount = $state(512); // FM3 preset slots
  /** Live CPU% (decoded from the device meters frame), null until first reading. FM3-family only. */
  cpu = $state<number | null>(null);
  /** Live output level meters in dB (−40…0, floor-clamped) — Output 1 & 2, each L/R — from the FM3's
   *  Preset Leveling poll (fn 0x19, 5-septet RMS float → 10·log10 dB). Smoothed server-side. */
  levels = $state<{ out1L: number; out1R: number; out2L: number; out2R: number } | null>(null);

  // ── mobile grid: column density (3–12) + horizontal paging through the 12 columns ──
  mobCols = $state(4);
  mobColsAuto = $state(true); // auto-fit column count to viewport width until the user pinches/± (then fixed)
  gridPage = $state(0);
  /** Column count that fits the width at a comfortable ~96px tile pitch (3–12). */
  fitCols = (w: number) => Math.max(3, Math.min(12, Math.round((w - 24) / 96)));
  get pageCount() {
    return Math.ceil(12 / Math.max(3, Math.min(12, this.mobCols)));
  }
  changeCols = (d: number) => {
    const nc = Math.max(3, Math.min(12, this.mobCols + d));
    if (nc === this.mobCols) return;
    this.mobColsAuto = false;
    this.mobCols = nc;
    this.gridPage = Math.min(this.gridPage, this.pageCount - 1);
  };
  setCols = (n: number) => {
    this.mobColsAuto = false;
    this.mobCols = Math.max(3, Math.min(12, n));
    this.gridPage = Math.min(this.gridPage, this.pageCount - 1);
  };
  colsFit = () => {
    this.mobColsAuto = false;
    this.mobCols = this.mobCols >= 12 ? 4 : 12; // toggle overview ↔ edit density
    this.gridPage = 0;
    this.showToast(this.mobCols >= 12 ? 'Overview' : 'Edit view', '#35c9d6');
  };
  changePage = (d: number) => {
    this.gridPage = Math.max(0, Math.min(this.pageCount - 1, this.gridPage + d));
  };
  setPage = (p: number) => {
    this.gridPage = Math.max(0, Math.min(this.pageCount - 1, p));
  };

  // ── live telemetry (SSE) ──
  tuner = $state<{ active: boolean; freq?: number; note?: string; cents?: number; octave?: number }>({ active: false });
  // CPU% is not transmitted by the FM3 (FM3-Edit computes it from a DSP cost model) — so the top-bar
  // slot shows the real, measurable serial round-trip latency instead.
  linkMs = $state<number | null>(null);
  #events: EventSource | null = null;
  vw = $state(1280);
  vh = $state(800);

  // ── overlays ──
  update = $state<{ version: string; url: string } | null>(null); // newer release (web fallback / non-desktop)
  /** Desktop auto-update status (Electron). idle until the updater reports something. */
  autoUpdate = $state<{ state: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'; version?: string; percent?: number }>({ state: 'idle' });
  /** Cloud sync (Supabase). enabled only when the engine has AXIS_CLOUD set; user null until logged in.
   *  `scopes` mirror the account panel's per-item toggles; `plan` is the billing tier (Free until billing
   *  lands); `pendingEmail` drives the email-confirmation screen after register. */
  cloud = $state<{
    enabled: boolean;
    user: { email: string } | null;
    syncing: boolean;
    lastSync: number | null;
    note: string | null;
    plan: string;
    /** Active paid subscription (authoritative flag from the server; drives preset-sync + backup UI). */
    paid: boolean;
    scopes: { presets: boolean; scenes: boolean; fc: boolean; settings: boolean };
    fullBackup: boolean;
    autoSync: boolean;
    pendingEmail: string | null;
    /** Free-tier quota readout (server RPC) — null for paid users, signed-out, or a pre-quota server. */
    quota: { usedBytes: number; snapshots: number; backups: number; limits: { maxStoredBytes: number; maxSnapshots: number; maxBackups: number } | null } | null;
  }>({ enabled: false, user: null, syncing: false, lastSync: null, note: null, plan: 'Free', paid: false, scopes: loadScopes(), fullBackup: false, autoSync: loadAutoSync(), pendingEmail: null, quota: null });
  /** Local storage folder (ForgeFX /local/*): a user-picked root with Presets/ (library) + Sync/
   *  (plain-syx version mirror, unlimited). `available` = the engine serves the routes (404 = old
   *  engine → feature hidden); `exists` = the configured root is still mounted. */
  local = $state<{
    available: boolean;
    configured: boolean;
    root: string | null;
    exists: boolean;
    syncing: boolean;
    lastSync: number | null;
    note: string | null;
    autoSync: boolean;
  }>({ available: false, configured: false, root: null, exists: true, syncing: false, lastSync: null, note: null, autoSync: loadLocalAutoSync() });
  // ── Axis hub (single rail entry point: Account · Privacy · About) ──
  axisOpen = $state(false);
  axisTab = $state<'account' | 'storage' | 'privacy' | 'about' | 'device'>('account');
  themeOpen = $state(false); // Appearance / theme picker modal
  drawerOpen = $state(false); // mobile nav drawer (replaces the tool rail on phones)
  /** Optional contact the user may leave (Fractal forum / Reddit / email) so we can follow up on a bug.
   *  ≤100 chars; stored in the synced `config/profile` doc + a local mirror. Never used for marketing. */
  contact = $state<string>(loadContact());
  /** Bottom-bar hover hint (left slot) — describes the parameter/control under the cursor. */
  hint = $state<string | null>(null);
  /** First-run popups: `consentPrompt` = telemetry accept/decline (only when telemetry is enabled in the
   *  build and the user hasn't decided yet); `kofiNotice` = a one-time "support development" nudge. */
  consentPromptOpen = $state(false);
  kofiNoticeOpen = $state(false);
  /** First-run guided tour (see Tour.svelte). `tourStep` is a 0-based index into its STEPS array. */
  tourActive = $state(false);
  tourStep = $state(0);
  /** Axis Cloud Remote (host side): is this PC exposing remote control, and is a remote session live?
   *  Off by default — the user opts in per device. Only meaningful when signed in. */
  remote = $state<{ enabled: boolean; connected: boolean }>({ enabled: false, connected: false });
  // ── telemetry / diagnostics ── `enabled` = live RUM gate (AXIS_TELEMETRY); `uploadEnabled` = on-demand
  // debug-report upload available; `consent` = user opted into live telemetry (default OFF). The on-demand
  // upload is per-incident consent and works even when `consent` is false.
  telemetry = $state<{ enabled: boolean; uploadEnabled: boolean; consent: boolean; instanceId: string; faroUrl: string; sending: boolean }>(
    { enabled: false, uploadEnabled: false, consent: loadTelemetryConsent(), instanceId: loadInstanceId(), faroUrl: '', sending: false }
  );
  #faroStarted = false;
  // Major-error → "Upload Debug Log" prompt. Set by offerDebugReport (debounced per category); the
  // DiagnosticsPanel renders it as a dismissible card with an explicit Upload button.
  reportPrompt = $state<{ kind: string; route?: string; status?: number; message?: string } | null>(null);
  #lastOffer: Record<string, number> = {}; // per-category debounce for offerDebugReport
  #recentEvents: { t: number; kind: string; text: string }[] = []; // recent-events ring for the debug report
  // ── connection picker (serial + MIDI ports) ──
  portsOpen = $state(false);
  ports = $state<ConnInfo[]>([]);
  portChosen = $state<ConnPick | null>(null);
  portOverride = $state<ConnPick | null>(null);
  /** Forced device-profile key ('fm3'|'fm9'|'axe3'|'axe2'|'vp4'|'am4'), or null when auto-detecting. */
  profileOverride = $state<string | null>(null);
  paletteOpen = $state(false);
  paletteMode = $state<'place' | 'retype'>('place');
  placeTarget = $state<{ row: number; col: number } | null>(null);
  presetOpen = $state(false);
  cabPickerOpen = $state(false);
  deviceToolsOpen = $state(false); // Device Tools modal (preset backup/restore/decode, firmware validate, modifier view)
  toast = $state<{ text: string; accent: string } | null>(null);

  #toastT: ReturnType<typeof setTimeout> | null = null;
  #sendTimers: Record<string | number, ReturnType<typeof setTimeout>> = {};

  // ── derived ──
  // Phones AND tablets use the compact layout (burger + slide-in drawer that hides scenes/nav/status);
  // only real laptops/desktops (≥1366) get the full top bar + rail. Raised from 760 so cramped
  // "tablet" widths don't squeeze the top bar — they get the clean drawer layout instead.
  get isMobile() {
    return this.vw < 1366;
  }
  get selected(): Cell | null {
    if (this.virtual) {
      // virtual effects (Setup/Controllers/Modifier/FC) aren't on the grid — synthesize a cell so the
      // same param/load/write machinery (and the ControlSurface) work unchanged.
      const v = this.virtual;
      return { row: -1, col: -1, kind: 'block', effectId: v.eid, display: v.name, pack: v.slug, color: '#35c9d6', fromRows: [] };
    }
    if (!this.selKey) return null;
    return [...this.layout.cells, ...this.layout.shunts].find((c) => `${c.row},${c.col}` === this.selKey) ?? null;
  }
  get firstEmptyCell(): { row: number; col: number } | null {
    const filled = new Set([...this.layout.cells, ...this.layout.shunts].map((c) => `${c.row},${c.col}`));
    for (let col = 0; col < this.layout.cols; col++)
      for (let row = 0; row < this.layout.rows; row++) if (!filled.has(`${row},${col}`)) return { row, col };
    return null;
  }

  // write API is 1-indexed; the decoded grid is 0-indexed
  #W = (n: number) => n + 1;
  slugOf = (c: Cell) => (c.pack ?? '').toLowerCase();

  // ── parameter tabs ──
  // family key for layouts = the block's pack slug (all amps share 'amp', etc.)
  get familyKey(): string {
    const c = this.selected;
    return c?.pack ? c.pack.toLowerCase() : '';
  }
  get tabs(): ResolvedTab[] {
    // amp exposes a built-in graphic EQ (its ±12 dB band params) on a dedicated EQ tab
    const eqIds = this.selected?.pack === 'Amp' ? this.params.filter((p) => p.id != null && p.min === -12 && p.max === 12).map((p) => p.id as number) : [];
    return resolveTabs(this.params, this.enums, this.customLayouts[this.familyKey] ?? [], eqIds);
  }
  #persistLayouts = () => {
    this.customLayouts = { ...this.customLayouts }; // new ref so $state reacts
    saveLayouts(this.customLayouts);
  };
  addTab = () => {
    const fam = this.familyKey;
    if (!fam) return;
    const tab: TabDef = { id: newTabId(), name: 'New Tab', paramIds: [] };
    this.customLayouts[fam] = [...(this.customLayouts[fam] ?? []), tab];
    this.#persistLayouts();
    this.activePage = tab.id;
    this.editingTabs = true;
  };
  renameTab = (id: string, name: string) => {
    const list = this.customLayouts[this.familyKey];
    const t = list?.find((x) => x.id === id);
    if (!t) return;
    t.name = name.trim() || t.name;
    this.#persistLayouts();
  };
  deleteTab = (id: string) => {
    const fam = this.familyKey;
    const list = this.customLayouts[fam];
    if (!list) return;
    this.customLayouts[fam] = list.filter((x) => x.id !== id);
    if (this.activePage === id) this.activePage = '__ideal';
    this.#persistLayouts();
  };
  toggleParamInTab = (id: string, paramId: number) => {
    const t = this.customLayouts[this.familyKey]?.find((x) => x.id === id);
    if (!t) return;
    t.paramIds = t.paramIds.includes(paramId) ? t.paramIds.filter((x) => x !== paramId) : [...t.paramIds, paramId];
    this.#persistLayouts();
  };

  // ── swipe controls ──
  swipeFor = (slug: string): SwipeCtrl[] => this.swipeControls[slug] ?? [];
  isSwipeControl = (paramId: number) => this.swipeFor(this.familyKey).some((c) => c.id === paramId);
  toggleSwipeControl = (p: NamedParam) => {
    if (p.id == null) return;
    const fam = this.familyKey;
    if (!fam) return;
    const list = this.swipeControls[fam] ?? [];
    this.swipeControls[fam] = list.some((c) => c.id === p.id) ? list.filter((c) => c.id !== p.id) : [...list, { id: p.id, name: p.name }];
    this.swipeControls = { ...this.swipeControls };
    saveSwipe(this.swipeControls);
    this.fetchMeters(); // pick up the new control's value
  };
  /** The ordered controls a block exposes: user ⚡ assignments, else the auto-picked primary. */
  controlsFor = (cell: Cell): SwipeCtrl[] => {
    const user = this.swipeFor(this.slugOf(cell));
    if (user.length) return user;
    const m = this.meters[cell.effectId];
    return m ? [{ id: m.defaultId, name: m.defaultName }] : [];
  };
  /** Meter readout for a block's currently-active swipe control: fill (norm) + display value/unit. */
  meterFor = (cell: Cell): { norm: number; value: number; unit?: string; min?: number; max?: number; log?: boolean; count: number; active: number; name: string } | null => {
    const ctrls = this.controlsFor(cell);
    if (!ctrls.length) return null;
    const active = Math.min(this.activeCtl[cell.effectId] ?? 0, ctrls.length - 1);
    const v = this.meters[cell.effectId]?.vals[ctrls[active].id];
    return { norm: v?.norm ?? 0, value: v?.value ?? 0, unit: v?.unit, min: v?.min, max: v?.max, log: v?.log, count: ctrls.length, active, name: ctrls[active].name };
  };
  cycleControl = (cell: Cell, dir: number) => {
    const n = this.controlsFor(cell).length;
    if (n <= 1) return;
    this.activeCtl[cell.effectId] = (((this.activeCtl[cell.effectId] ?? 0) + dir) % n + n) % n;
    this.activeCtl = { ...this.activeCtl };
  };
  /** Adjust the active swipe control by a normalized delta (vertical drag / wheel on the tile). */
  adjustSwipe = (cell: Cell, deltaNorm: number) => {
    const ctrls = this.controlsFor(cell);
    if (!ctrls.length) return;
    const active = Math.min(this.activeCtl[cell.effectId] ?? 0, ctrls.length - 1);
    const ctl = ctrls[active];
    const m = this.meters[cell.effectId] ?? { defaultId: ctl.id, defaultName: ctl.name, typeName: '', vals: {} as Record<number, MeterVal> };
    const prev = m.vals[ctl.id];
    const norm = clamp01((prev?.norm ?? 0.5) + deltaNorm);
    m.vals = { ...m.vals, [ctl.id]: { ...(prev ?? { value: 0 }), norm, value: paramValue({ norm, min: prev?.min, max: prev?.max, unit: prev?.unit, log: prev?.log }) } };
    this.meters = { ...this.meters, [cell.effectId]: m };
    // keep the open editor's knob in sync if this is the selected block
    if (this.selected?.effectId === cell.effectId) {
      const p = this.params.find((x) => x.id === ctl.id);
      if (p) p.norm = norm;
    }
    clearTimeout(this.#sendTimers[ctl.id]);
    this.#sendTimers[ctl.id] = setTimeout(() => forgefx.setParam(cell.effectId, ctl.id, norm, true).catch(() => {}), 50);
  };
  /** Read every placed block's meter + swipe-control values (background, debounced — load() runs
   * after every optimistic edit, so coalesce the N bulk reads). */
  #metersTimer: ReturnType<typeof setTimeout> | null = null;
  /** A slow link — a generic MIDI interface into 5-pin DIN (≈31.25 kbaud) — can't carry high-rate meter
   *  reads without saturating and inflating every edit to seconds, so meter/watch polling backs off there.
   *  A device's OWN USB-MIDI port (Axe-Fx III / FM9, Fractal-named) is full USB speed → NOT slow. */
  get slowLink(): boolean {
    const c = this.portChosen;
    if (c?.transport !== 'midi') return false;
    const info = this.ports.find((p) => p.transport === 'midi' && p.id === (c.inId ?? c.id));
    return info ? !info.fractal : false; // Fractal USB-MIDI = fast; generic adapter = slow; unknown → don't throttle
  }
  fetchMeters = () => {
    if (!this.hasBlockMeters || this.slowLink) return; // no meter polling without the capability or on a slow MIDI link (keeps editing snappy)
    if (this.#metersTimer) clearTimeout(this.#metersTimer);
    this.#metersTimer = setTimeout(async () => {
      const wants: Record<string, number[]> = {};
      for (const [slug, list] of Object.entries(this.swipeControls)) if (list.length) wants[slug] = list.map((c) => c.id);
      try {
        const rows = await forgefx.meters(wants);
        const next: Record<number, { defaultId: number; defaultName: string; typeName: string; vals: Record<number, MeterVal> }> = {};
        for (const r of rows) next[r.effectId] = { defaultId: r.defaultId, defaultName: r.defaultName, typeName: r.typeName, vals: r.vals };
        this.meters = next;
      } catch {
        /* meters are best-effort */
      }
    }, 350);
  };

  // ── pinned-param hydration (custom-panel controls stay live without an open block) ──
  /** A mounted pinned param widget registers its bound block; the return unregisters it.
   *  Ref-counted so several controls off the same block share one hydration. */
  registerPinnedBlock = (effectId: number | undefined): (() => void) => {
    if (effectId == null || effectId < 0) return () => {};
    this.#pinnedRefs.set(effectId, (this.#pinnedRefs.get(effectId) ?? 0) + 1);
    this.#scheduleHydratePinned();
    return () => {
      const next = (this.#pinnedRefs.get(effectId) ?? 1) - 1;
      if (next > 0) { this.#pinnedRefs.set(effectId, next); return; }
      this.#pinnedRefs.delete(effectId);
      if (this.pinnedParams[effectId]) {
        const { [effectId]: _drop, ...rest } = this.pinnedParams;
        this.pinnedParams = rest;
      }
    };
  };
  /** Live params+enums for a block: the open block's own arrays, else the hydrated
   *  pinned copy (empty until hydration lands). Both writable through set*ById. */
  pinnedView = (effectId: number | undefined): { named: NamedParam[]; enums: EnumParam[] } => {
    if (effectId != null && this.selected?.effectId === effectId) return { named: this.params, enums: this.enums };
    return (effectId != null && this.pinnedParams[effectId]) || { named: [], enums: [] };
  };
  #scheduleHydratePinned = () => {
    if (this.#hydratePinnedTimer) clearTimeout(this.#hydratePinnedTimer);
    this.#hydratePinnedTimer = setTimeout(() => void this.#hydratePinned(), 250);
  };
  /** Invalidate every hydrated block (preset/scene changed) and re-fetch the mounted ones. */
  #invalidatePinned = () => {
    if (Object.keys(this.pinnedParams).length) this.pinnedParams = {};
    if (this.#pinnedRefs.size) this.#scheduleHydratePinned();
  };
  #hydratePinned = async () => {
    this.#hydratePinnedTimer = null;
    // A slow 5-pin MIDI link can't afford extra per-block reads — leave those controls
    // as read-only previews (click opens the block) instead of inflating edit latency.
    if (!this.#pinnedRefs.size || this.slowLink || this.status !== 'ready') return;
    const placed = new Set([...this.layout.cells, ...this.layout.shunts].map((c) => c.effectId));
    for (const eid of this.#pinnedRefs.keys()) {
      if (eid === this.selected?.effectId) continue; // open block is already live via editor.params
      if (!placed.has(eid) || this.pinnedParams[eid]) continue; // not in this preset, or already hydrated
      try {
        const r = !this.isV2 && this.isAm4 ? await forgefx.am4BlockParams(eid) : await forgefx.blockParams(eid);
        this.pinnedParams = {
          ...this.pinnedParams,
          [eid]: { named: r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase())), enums: r.enums ?? [] }
        };
      } catch {
        /* best-effort — the control falls back to a read-only preview */
      }
    }
  };
  #cellFor = (effectId: number): Cell | undefined =>
    [...this.layout.cells, ...this.layout.shunts].find((c) => c.effectId === effectId);
  /** Continuous write for a pinned control whose block may not be open. Delegates to the
   *  normal path when it IS open; otherwise writes by effectId + optimistically updates the
   *  hydrated copy so the tile tracks the gesture. */
  setPinnedParam = (effectId: number, p: NamedParam, v: number) => {
    if (this.selected?.effectId === effectId) { this.setParam(p, v); return; }
    if (p.id == null) return;
    const from = p.norm ?? 0;
    p.norm = v; // optimistic on the hydrated object
    this.pinnedParams = { ...this.pinnedParams }; // nudge reactivity
    const cell = this.#cellFor(effectId);
    history.recordGesture({
      kind: 'param', eid: effectId, paramId: p.id, continuous: true, from, to: v,
      block: cell?.display ?? p.name, param: p.name, min: p.min, max: p.max, unit: p.unit, log: p.log
    });
    clearTimeout(this.#sendTimers[p.id]);
    this.#sendTimers[p.id] = setTimeout(() => forgefx.setParam(effectId, p.id as number, v, true).catch(() => {}), 60);
  };
  /** Discrete write for a pinned control whose block may not be open. */
  setPinnedEnum = (effectId: number, e: EnumParam, value: number) => {
    if (this.selected?.effectId === effectId) { this.setEnum(e, value); return; }
    const from = e.value;
    e.value = value; // optimistic
    this.pinnedParams = { ...this.pinnedParams };
    const cell = this.#cellFor(effectId);
    if (from !== value) history.record({
      kind: 'param', eid: effectId, paramId: e.id, continuous: false, from, to: value,
      block: cell?.display ?? e.name, param: e.name,
      fromLabel: e.options.find((o) => o.value === from)?.label, toLabel: e.options.find((o) => o.value === value)?.label
    });
    forgefx.setParam(effectId, e.id, value, false).catch(() => {});
  };

  // ── live audio meters (per-block monitor level, normalized→dB) ──
  // GENTLE poll: reads ONLY the currently-selected block's monitor (one serial round-trip per tick),
  // and ONLY while metering is actually enabled + the block editor is open. Polling every placed
  // block flooded the FM3's serial link and caused audio dropouts — never do a full-preset sweep here.
  meteringOn = $state(false); // opt-in; off by default so it can't disturb the device unnoticed
  /** Per-block metering is only offered when the device supports live monitors, over a fast link
   *  (never a slow 5-pin-DIN MIDI adapter, never remote). The global IN/OUT display is separate. */
  get canMeterBlocks(): boolean {
    return this.status === 'ready' && this.hasLiveMonitors && !this.slowLink && !isRemote();
  }
  #liveMeterTimer: ReturnType<typeof setTimeout> | null = null;
  startLiveMeters = () => {
    if (this.#liveMeterTimer) return; // already running
    const tick = async () => {
      this.#liveMeterTimer = null;
      const eid = this.selected?.effectId;
      const ok = this.meteringOn && this.canMeterBlocks && eid != null && !this.inLibrary && !this.virtual;
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
        if (this.blockSlug === 'looper') {
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

  // ── lifecycle ──
  init = async () => {
    this.customLayouts = loadLayouts();
    this.swipeControls = loadSwipe();
    // history's inverse writes go straight to forgefx; it calls back here for UI refresh + toasts
    history.bindHost({
      load: () => this.load(),
      reloadParams: () => this.#loadParams(),
      echoParam: (eid, pid, norm) => this.applyDeviceEvent({ type: 'param', effectId: eid, paramId: pid, norm }),
      toast: (text, accent) => this.showToast(text, accent),
      isLegacyAm4: () => !this.isV2 && this.isAm4
    });
    setRequestFailureReporter(this.#onReqFailure); // auto-report every 5xx/network failure to Faro
    this.loadPorts(); // know the transport early (drives slowLink → meter throttling over MIDI)
    // Desktop-only first-run + update flows: the remote web app has no desktop to update, and the tour /
    // telemetry-consent / Ko-fi first-run popups belong to the PC install (the host handles telemetry), so
    // skip them in the remote build — otherwise every browser session nags with banners it can't act on.
    if (!isRemoteBuild()) {
      this.#initUpdater();
      this.#initTelemetry();
    }
    this.#initCloud();
    this.#initLocal();
    this.#openEvents();
    // auto-detect the attached unit FIRST (so load() knows whether to use the AM4 4-slot path), and
    // warn if it isn't a model we have a live codec for
    try {
      this.detected = await forgefx.detect();
      if (this.detected.connected && !this.detected.supported) this.showToast(`${this.detected.name} detected — not yet supported`, '#d6543f');
    } catch {
      /* detect failed — proceed; load() falls back to the gen-3 path */
    }
    // negotiate the API version + capabilities BEFORE the first load(), so every caps gate below
    // (unified vs legacy routes, polling, meters, renames) is decided correctly from the start
    await this.#handshake();
    if (this.presetLiveQuery) {
      try {
        const n = (await forgefx.currentPreset()).number;
        if (n >= 0) this.lastPreset = n;
      } catch {
        /* */
      }
    }
    await this.load();
    this.#syncTelemetry();
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

  // ── preset versions / backup ──
  /** Snapshot the given device preset into the version store. */
  backupPreset = async (n: number) => {
    try { await forgefx.snapshotPreset(n); this.showToast(`Backed up preset ${n}`, '#33c46b'); library.refreshSlot(n); this.scheduleAutoSync(); }
    catch (e) { this.showToast('Backup failed: ' + (e as Error).message, '#d6543f'); }
  };
  /** Load a stored version straight into the edit buffer (plays it without occupying a slot). */
  loadVersion = async (id: string) => {
    try {
      await forgefx.loadVersion(id);
      this.noteBufferReplaced('Loaded snapshot into edit buffer'); // barrier — undo stops here
      await this.load();
      this.showToast('Loaded into edit buffer — Save to keep it on a slot', '#f5a623');
    } catch (e) {
      this.showToast('Load failed: ' + (e as Error).message, '#d6543f');
    }
  };

  // ── cloud sync ──
  #autoSyncT: ReturnType<typeof setTimeout> | null = null;
  #initCloud = async () => {
    // Any local config/version mutation (tags, collections, layouts, snapshots…) nudges a debounced sync.
    onMutation(() => this.scheduleAutoSync());
    try {
      const s = await forgefx.cloudStatus();
      const paid = !!s.subscription?.active;
      this.cloud = { ...this.cloud, enabled: s.enabled, user: s.user ? { email: s.user.email } : null, paid, plan: paid ? (s.subscription?.plan ?? 'Supporter') : 'Free', quota: !paid && s.quota ? s.quota : null };
      if (s.user) { await this.cloudSync(); await this.#loadProfile(); await this.refreshRemote(); cloud.refresh(); } // pull latest + profile + remote state + sync-state index on launch
    } catch {
      /* cloud disabled / engine not ready */
    }
  };
  /** Axis Cloud Remote (host side): reflect + toggle whether this PC exposes remote control. Off by
   *  default; only works when signed in (the private channel is keyed to the user). */
  refreshRemote = async () => {
    try { const s = await forgefx.remoteStatus(); this.remote = { enabled: s.enabled, connected: s.connected }; } catch { /* remote unavailable */ }
  };
  setRemoteAccess = async (on: boolean) => {
    try {
      const s = await forgefx.remoteEnable(on);
      this.remote = { enabled: s.enabled, connected: s.connected };
      if (s.error) this.showToast(`Remote: ${s.error}`, '#f5a623');
      else this.showToast(on ? 'Remote control enabled — reachable from axisapp.live when signed in' : 'Remote control turned off', on ? '#33c46b' : '#9a9aa3');
    } catch {
      this.showToast('Could not change remote access', '#d6543f');
    }
  };
  /** Debounced background sync after a local change — batches rapid edits, skips if off/in-flight.
   *  Drives BOTH mirrors: cloud (signed-in + enabled) and the local Sync/ folder (configured + auto). */
  scheduleAutoSync = () => {
    const doCloud = this.cloud.enabled && !!this.cloud.user && this.cloud.autoSync;
    const doLocal = this.local.configured && this.local.exists && this.local.autoSync;
    if (!doCloud && !doLocal) return;
    if (this.#autoSyncT) clearTimeout(this.#autoSyncT);
    this.#autoSyncT = setTimeout(() => {
      if (doCloud && !this.cloud.syncing) this.cloudSync();
      if (doLocal && !this.local.syncing) this.localSync();
    }, 8000);
  };
  setAutoSync = (on: boolean) => {
    this.cloud = { ...this.cloud, autoSync: on };
    try { localStorage.setItem(AUTOSYNC_KEY, on ? '1' : '0'); } catch { /* */ }
    if (on) this.scheduleAutoSync();
  };

  // ── local storage folder (Presets/ library + Sync/ version mirror) ──
  #initLocal = async () => {
    if (isRemote()) return; // the folder lives on the host PC — hidden in remote sessions
    try {
      const s = await forgefx.localConfig();
      this.local = { ...this.local, available: true, configured: s.configured, root: s.root, exists: s.exists, lastSync: s.lastSync };
      if (s.configured && s.exists) void library.refreshLocal();
    } catch { /* 404 = older engine → feature hidden (available stays false) */ }
  };
  /** Set (or clear with null) the local root. Native picker in AxisPanel feeds this an absolute path. */
  setLocalRoot = async (root: string | null) => {
    try {
      const s = await forgefx.setLocalRoot(root);
      this.local = { ...this.local, configured: s.configured, root: s.root, exists: s.exists, lastSync: s.lastSync, note: null };
      void library.refreshLocal(); // populates or clears the `local:` entries
      if (s.configured) { this.showToast('Local folder set — Presets/ & Sync/ ready', '#33c46b'); void this.localSync(); }
      else this.showToast('Local folder cleared', '#9a9aa3');
    } catch (e) {
      this.showToast('Could not set folder: ' + (e as Error).message, '#d6543f');
    }
  };
  /** Mirror the version store → the local Sync/ folder (incremental; never deletes user files). */
  localSync = async () => {
    if (!this.local.configured || this.local.syncing) return;
    this.local = { ...this.local, syncing: true, note: null };
    try {
      const r = await forgefx.localSync();
      this.local = { ...this.local, exists: true, lastSync: Date.now(), note: r.written ? `Synced ↓${r.written} to folder` : null };
    } catch (e) {
      const status = e instanceof ForgeError ? e.status : 0;
      if (status === 409) this.local = { ...this.local, exists: false, note: 'Folder missing — remount the drive or pick a new folder' };
      else this.local = { ...this.local, note: (e as Error).message || 'Local sync failed' };
    } finally {
      this.local = { ...this.local, syncing: false };
    }
  };
  /** Re-import versions from the Sync/ folder into the version store (fresh machine / recovery). */
  localRestore = async () => {
    if (this.local.syncing) return;
    this.local = { ...this.local, syncing: true, note: null };
    try {
      const r = await forgefx.localRestore();
      this.showToast(r.imported ? `Restored ${r.imported} version(s) from folder` : 'Nothing new to restore', '#33c46b');
      cloud.refresh(); // version list changed → refresh sync-state index
    } catch (e) {
      this.showToast('Restore failed: ' + (e as Error).message, '#d6543f');
    } finally {
      this.local = { ...this.local, syncing: false };
    }
  };
  setLocalAutoSync = (on: boolean) => {
    this.local = { ...this.local, autoSync: on };
    try { localStorage.setItem(LOCAL_AUTOSYNC_KEY, on ? '1' : '0'); } catch { /* */ }
    if (on) this.scheduleAutoSync();
  };

  // ── telemetry / diagnostics ──
  #initTelemetry = async () => {
    try {
      const s = await forgefx.telemetryStatus();
      this.telemetry = { ...this.telemetry, enabled: s.enabled, uploadEnabled: s.uploadEnabled, faroUrl: s.faroUrl };
      await this.#startFaro();
      // First run: if the build ships live diagnostics and the user hasn't chosen yet, ask once. If they
      // already chose (or telemetry is off in this build), fall through to the one-time Ko-fi nudge.
      if (s.enabled && !loadDecided()) this.consentPromptOpen = true;
      else this.#maybeShowKofi();
    } catch { /* telemetry disabled / engine not ready */ }
  };
  /** Show the one-time "support development on Ko-fi" notice, unless it's already been seen or a
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
  /** Start live Faro RUM iff the operator enabled it, the user consented, and we have a collector URL.
   *  Dynamic-imported so the SDK never loads for users/builds without telemetry. Idempotent. */
  #startFaro = async () => {
    const t = this.telemetry;
    if (!t.enabled || !t.consent || !t.faroUrl) return;
    try {
      const m = await import('./faro');
      if (this.#faroStarted) { m.resumeFaro(); return; } // re-opted-in: resume the paused instance
      this.#faroStarted = true;
      await m.initFaro({ url: t.faroUrl, version: __APP_VERSION__, instanceId: t.instanceId });
    } catch { this.#faroStarted = false; /* offline / blocked — never let telemetry break the app */ }
  };
  setTelemetryConsent = (on: boolean) => {
    this.telemetry = { ...this.telemetry, consent: on };
    try { localStorage.setItem(TELEMETRY_KEY, on ? '1' : '0'); localStorage.setItem(DECIDED_KEY, '1'); } catch { /* */ }
    if (on) this.#startFaro(); // opting in mid-session starts (or resumes) RUM immediately
    else import('./faro').then((m) => m.pauseFaro()).catch(() => {}); // opting out stops sending at once
    this.#persistProfile(); // mirror the choice to the synced profile when logged in
  };
  /** First-run consent choice (accept/decline). Records it, closes the prompt, then shows the Ko-fi nudge. */
  decideTelemetry = (on: boolean) => {
    this.consentPromptOpen = false;
    this.setTelemetryConsent(on);
    this.#maybeShowKofi();
  };

  // ── Axis hub + profile (contact / synced prefs) ──
  openAxis = (tab: 'account' | 'storage' | 'privacy' | 'about' | 'device' = 'account') => { this.axisTab = tab; this.axisOpen = true; if (tab === 'device') this.loadPorts(); };
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
    forgefx.putDoc('config', 'profile', { contact: this.contact, telemetryConsent: this.telemetry.consent, updatedAt: Date.now() })
      .then(() => notifyMutation())
      .catch(() => { /* store unavailable (engine not ready) — the local mirror still holds the value */ });
  };
  /** Pull the synced profile after login and reconcile: adopt a cloud-set contact, and if the cloud has a
   *  telemetry choice, honour it (updating the local mirror + Faro state to match). */
  /** Re-read the subscription (paid flag + plan) + free-tier quota from the server after auth/sync. */
  #refreshSubscription = async () => {
    try {
      const s = await forgefx.cloudStatus();
      const paid = !!s.subscription?.active;
      this.cloud = { ...this.cloud, paid, plan: paid ? (s.subscription?.plan ?? 'Supporter') : 'Free', quota: !paid && s.quota ? s.quota : null };
    } catch { /* engine not ready */ }
  };
  #loadProfile = async () => {
    try {
      const doc = await forgefx.getDoc<{ contact?: string; telemetryConsent?: boolean }>('config', 'profile');
      const p = doc?.data;
      if (!p) return;
      if (typeof p.contact === 'string' && p.contact !== this.contact) {
        this.contact = p.contact.slice(0, 100);
        try { localStorage.setItem(CONTACT_KEY, this.contact); } catch { /* */ }
      }
      if (typeof p.telemetryConsent === 'boolean' && p.telemetryConsent !== this.telemetry.consent) {
        this.setTelemetryConsent(p.telemetryConsent);
      }
    } catch { /* no profile yet / engine not ready */ }
  };
  /** Silently report a failure to Faro with device context (model/firmware/route/status) + record it for
   *  the debug-report trail. This is the FLEET signal — the real device/cloud bugs are server-side 5xx, not
   *  JS crashes, so we report every one. No UI; opt-in gated (only sends when the user enabled telemetry). */
  reportFailure = (trigger: NonNullable<typeof this.reportPrompt>) => {
    this.recordEvent('error', `${trigger.kind} ${trigger.route ?? ''} ${trigger.status ?? ''} ${trigger.message ?? ''}`.trim());
    if (this.#faroStarted) {
      import('./faro').then((m) => m.faroDeviceError({ ...trigger, model: this.conn.device, firmware: this.conn.fw })).catch(() => {});
    }
  };
  /** Every ForgeFX request failure (5xx or network) auto-reports here — registered on the client so we
   *  don't have to remember to instrument each call site. Classifies the route into a coarse `kind` so the
   *  Grafana dashboard can group (device-comm / cloud / telemetry / engine). */
  #onReqFailure = (info: { route: string; method: string; status: number; message: string }) => {
    const kind = info.route.startsWith('/cloud') ? 'cloud'
      : info.route.startsWith('/telemetry') ? 'telemetry'
      : info.status === 0 ? 'engine' : 'device-comm';
    this.reportFailure({ kind, route: info.route, status: info.status, message: info.message });
  };
  /** On a MAJOR error (grid decode fail, detect failure), also nudge the user to upload a full debug
   *  report — debounced per category so it never spams. Reporting to Faro already happened via the req
   *  hook / reportFailure; this just adds the explicit-upload prompt on top for the big ones. */
  offerDebugReport = (trigger: NonNullable<typeof this.reportPrompt>) => {
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
      const report: DebugReport = {
        instanceId: this.telemetry.instanceId,
        capturedAt: Date.now(),
        app: { version: (globalThis as { axisDesktop?: { version?: string } }).axisDesktop?.version ?? 'dev', platform: navigator.platform },
        trigger,
        contact: this.contact.trim() ? this.contact.trim().slice(0, 100) : undefined, // user-supplied, opt-in — not scrubbed
        diag,
        log: scrubPII(log),
        events: this.#recentEvents.slice(-60).map((e) => ({ ...e, text: scrubPII(e.text) }))
      };
      const r = await forgefx.uploadDebugReport(report);
      this.showToast(`Debug report sent (${Math.max(1, Math.round((r.stored ?? 0) / 1024))} KB) — thank you`, '#33c46b');
      return true;
    } catch {
      this.showToast("Couldn't reach the server — your log is still saved locally (Help → Open Debug Log)", '#d6543f');
      return false;
    } finally {
      this.telemetry = { ...this.telemetry, sending: false };
    }
  };
  cloudLogin = async (email: string, password: string) => {
    this.cloud.note = null;
    try {
      const r = await forgefx.cloudLogin(email, password);
      this.cloud = { ...this.cloud, user: { email: r.user.email }, pendingEmail: null };
      await this.#refreshSubscription();
      await this.cloudSync();
      await this.#loadProfile();
      cloud.refresh();
    } catch (e) {
      this.cloud.note = (e as Error).message || 'Login failed';
    }
  };
  cloudRegister = async (email: string, password: string) => {
    this.cloud.note = null;
    try {
      const r = await forgefx.cloudRegister(email, password);
      if (r.needsConfirmation) this.cloud = { ...this.cloud, pendingEmail: email, note: null };
      else if (r.user) { this.cloud = { ...this.cloud, user: { email: r.user.email }, pendingEmail: null }; await this.#refreshSubscription(); await this.cloudSync(); await this.#loadProfile(); this.#persistProfile(); cloud.refresh(); }
    } catch (e) {
      this.cloud.note = (e as Error).message || 'Sign-up failed';
    }
  };
  cloudLogout = async () => {
    try { await forgefx.cloudLogout(); } catch { /* */ }
    this.cloud = { ...this.cloud, user: null, lastSync: null, pendingEmail: null };
    cloud.clear();
  };
  /** GDPR erasure: permanently delete the account + all cloud data, then sign out locally. */
  cloudDeleteAccount = async () => {
    try {
      await forgefx.cloudDeleteAccount();
      this.cloud = { ...this.cloud, user: null, lastSync: null, pendingEmail: null, note: null };
      cloud.clear();
      this.showToast('Account and cloud data deleted', '#9a9aa3');
    } catch (e) {
      this.showToast('Delete failed: ' + (e as Error).message, '#d6543f');
    }
  };
  /** Toggle a sync scope (presets/scenes/fc/settings) and persist the choice. */
  setCloudScope = (key: keyof CloudScopes, on: boolean) => {
    this.cloud = { ...this.cloud, scopes: { ...this.cloud.scopes, [key]: on } };
    saveScopes(this.cloud.scopes);
  };
  cloudSync = async () => {
    if (!this.cloud.user) return;
    this.cloud.syncing = true;
    this.cloud.note = null;
    try {
      // Preset sync is open to every tier since 0.7.1 — free accounts are quota-limited (3 MB / 1 full
      // backup / N snapshots), reconciled client-side in ForgeFX and enforced by the server's quota
      // trigger as a backstop. Config (tags/collections/favorites/filters/layouts + profile) is free.
      const r = await forgefx.cloudSync({ presets: this.cloud.scopes.presets, config: true });
      const up = r.config.pushed + r.versions.pushed, down = r.config.pulled + r.versions.pulled;
      this.cloud = { ...this.cloud, lastSync: Date.now(), note: `Synced · ↑${up} ↓${down}` };
      cloud.refresh();
      void this.#refreshSubscription(); // quota bar tracks the sync
    } catch (e) {
      this.cloud.note = (e as Error).message || 'Sync failed';
    } finally {
      this.cloud.syncing = false;
    }
  };
  /** Full device backup → version store, then sync it up. Drives the account panel's "Full device backup". */
  cloudFullBackup = async () => {
    this.cloud = { ...this.cloud, fullBackup: true, syncing: true, note: null };
    this.showToast('Backing up the whole device — this can take a few minutes…', '#f5a623');
    try {
      const r = await forgefx.backupDevice();
      this.showToast(`Backed up ${r.count} presets`, '#33c46b');
      if (this.local.configured) void this.localSync(); // land the backup in the local folder immediately
      await this.cloudSync();
    } catch (e) {
      this.cloud.note = (e as Error).message || 'Backup failed';
    } finally {
      this.cloud = { ...this.cloud, syncing: false };
    }
  };

  // live tuner/tempo/scene/cpu pushes from the device (local: SSE). Remote mode gets the same CHANGE events
  // over the relay channel (see remote.svelte.ts → applyDeviceEvent); Browser Direct subscribes to the
  // in-page runtime's event bus (see direct.svelte.ts) — SSE is skipped in both.
  #openEvents = () => {
    if (this.#events) return;
    if (isRemote() || isDirect()) return; // events arrive via relay channel / runtime subscription instead
    try {
      this.#events = forgefx.events((e) => this.applyDeviceEvent(e));
    } catch {
      /* SSE unsupported / offline — telemetry stays at last-known */
    }
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
    if (!st || !Array.isArray(st)) { await this.load(); return; } // no lightweight path → full reload
    const byId = new Map(st.map((b) => [b.effectId, b]));
    const apply = (c: Cell): Cell => {
      const s = byId.get(c.effectId);
      return s ? { ...c, bypassed: s.bypassed ?? undefined, channel: s.channel ?? undefined } : c;
    };
    this.layout = { ...this.layout, cells: this.layout.cells.map(apply), shunts: this.layout.shunts.map(apply) };
    this.#invalidatePinned(); // per-channel param values changed → re-hydrate pinned controls
    if (this.selKey) await this.#loadParams(); // open block's params are per-channel → re-read it
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
  /** Apply one live device event — from SSE (local) or the remote relay channel. Drives cross-UI sync:
   *  another window / the remote / the device itself changed something, so this UI follows. */
  applyDeviceEvent = (e: DeviceEvent) => {
    switch (e.type) {
      case 'tempo': this.bpm = e.bpm; break;
      case 'scene': {
        this.scene = e.index + 1; // badge immediately, then lightweight reflect (no full preset dump)
        this.#scheduleSceneReload();
        break;
      }
      case 'tuner': this.tuner = { ...this.tuner, freq: e.freq, note: e.note, cents: e.cents, octave: e.octave }; break;
      case 'cpu': this.cpu = e.percent; break;
      case 'meters': this.levels = { out1L: e.out1L, out1R: e.out1R, out2L: e.out2L, out2R: e.out2R }; break;
      case 'blockState': {
        this.#scheduleBlockStateReload();
        break;
      }
      case 'param': {
        // another UI moved a knob — reflect it live if that block is open (cheap: update the arc)
        if (this.selected?.effectId === e.effectId) {
          const p = this.params.find((x) => x.id === e.paramId);
          if (p && p.norm !== e.norm) { p.norm = e.norm; this.params = [...this.params]; }
        }
        // keep the on-grid block level indicator (meter fill) in sync too — it reads from `meters`, which the
        // open-block knob update above doesn't touch, so without this the tile wouldn't move either direction.
        const m = this.meters[e.effectId];
        if (m) {
          const prev = m.vals[e.paramId];
          const value = prev ? paramValue({ norm: e.norm, min: prev.min, max: prev.max, unit: prev.unit, log: prev.log }) : 0;
          m.vals = { ...m.vals, [e.paramId]: { ...(prev ?? { value: 0 }), norm: e.norm, value } };
          this.meters = { ...this.meters, [e.effectId]: { ...m } };
        }
        break;
      }
      case 'changed': {
        // structural change elsewhere (block placed/removed, preset switched, or a device-side edit the
        // unit doesn't push — AM4 front-panel / AM4-Edit) — reload, debounced so a burst coalesces into
        // one refresh. Also re-read the open block's knobs: load() only refreshes the grid + blocks, so
        // without this a front-panel knob turn on the currently-open block would leave its arcs stale.
        if (this.#eventReload) clearTimeout(this.#eventReload);
        this.#eventReload = setTimeout(async () => {
          await this.load();
          if (this.selKey) await this.#loadParams();
        }, 250);
        break;
      }
      case 'config': if (e.origin !== CLIENT_ID) this.#applyConfig(e.id, e.data); break; // ignore our own echo
    }
  };
  /** Apply a shared config doc pushed by another UI (host↔remote). Sets local state + the localStorage cache
   *  directly — never re-saves (which would re-broadcast and loop). */
  #applyConfig = (id: string, data: unknown) => {
    const cache = (k: string) => { try { localStorage.setItem(k, JSON.stringify(data)); } catch { /* */ } };
    if (id === 'swipe' && data && typeof data === 'object') { this.swipeControls = data as Record<string, SwipeCtrl[]>; cache('axis.swipe.v1'); }
    else if (id === 'layouts' && data && typeof data === 'object') { this.customLayouts = data as Record<string, TabDef[]>; cache('axis.layouts.v1'); }
    else if (id === 'surface') surfApplyRemote(data);
    else if (id === 'savedFilters') cache('axs.pb.saved');
    else if (id === 'tags' || id === 'collections' || id === 'favs') library.applyRemoteConfig(id, data);
  };
  // pull current scene + tempo once at load (device → UI), each gated by its capability so a device
  // without the feature never eats a timeout (legacy v1: skip both on the AM4 — it ignores the frames)
  #syncTelemetry = async () => {
    if (!this.isV2 && this.isAm4) return; // legacy: gen-3 scene/tempo frames; the AM4 ignores them → 5s timeouts that clog the queue
    try {
      if (this.sceneCount > 0) { const si = (await forgefx.getScene()).index; if (si >= 0) this.scene = si + 1; } // ignore a failed read (-1)
      if (this.hasTempo) this.bpm = (await forgefx.getTempo()).bpm;
    } catch {
      /* */
    }
  };

  /** One-shot /device pull that adopts the negotiated API version + capabilities before first load. */
  #handshake = async () => {
    try {
      this.#adoptDevice(await forgefx.device());
    } catch {
      /* engine not ready — poll() keeps retrying and adopts caps when it comes up */
    }
  };
  /** Adopt a /device payload: capabilities, API version, preset-slot count. */
  #adoptDevice = (dev: import('./types').DeviceInfo | null) => {
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
        this.linkMs = Math.round(performance.now() - t0); // serial round-trip latency
        if (p && p.number >= 0) { this.preset = p; this.#histSwitch(p.number); }
      }
    } catch {
      this.conn = { state: 'offline' };
    } finally {
      this.#polling = false;
    }
  };

  /** @deprecated AM4 (model 0x15) detection — kept ONLY for the legacy v1-server fallback paths
   *  (API v2 gates everything through `caps`). Do not add new call sites. */
  get isAm4(): boolean {
    return this.detected?.modelId === 0x15;
  }

  /** Point the history store at the active device+slot (idempotent — cheap to call from poll ticks). */
  #histSwitch = (n: number) => {
    void history.switchTo(this.detected?.short ?? this.layout.model ?? 'dev', n);
  };
  /** When the edit buffer was loaded from a local Presets/ file, this remembers which one — so Save
   *  can offer writing the edits back to that file (save-to-disk) instead of a device slot. */
  bufferSource = $state<{ path: string; name: string } | null>(null);
  /** The edit buffer was wholesale replaced (audition / snapshot / file load) — undo can't cross this,
   *  and any local-file link is stale (the local load path re-sets it right after). */
  noteBufferReplaced = (label: string) => {
    this.bufferSource = null;
    history.checkpoint(label, /*barrier*/ true);
  };
  /** Save the CURRENT edit buffer back to the local file it was loaded from — no device slot touched. */
  saveLocalFile = async () => {
    const src = this.bufferSource;
    if (!src) return;
    try {
      const b = await forgefx.presetBackup(); // dump the active edit buffer (caps backupDump)
      const r = await forgefx.saveLocalPreset(src.name, b.bytes, { path: src.path, overwrite: true });
      this.saveOpen = false;
      history.checkpoint(`Saved to Presets/${r.path}`, false); // marker — undo continues past it, like a slot save
      this.showToast(`Saved to Presets/${r.path}`, '#33c46b');
      void library.refreshLocal();
    } catch (e) {
      this.showToast('Save to disk failed: ' + (e as Error).message, '#d6543f');
    }
  };

  load = async () => {
    if (!this.everLoaded) this.status = 'loading';
    // API v2: the unified /preset/grid + /preset/blocks serve EVERY device (AM4 included).
    // Legacy v1 fallback: the AM4 only answers its own /am4/grid.
    const legacyAm4 = !this.isV2 && this.isAm4;
    try {
      const [grid, blocks] = legacyAm4
        ? [await forgefx.am4Grid(), []]
        : await Promise.all([forgefx.grid(), forgefx.presetBlocks().catch(() => [])]);
      this.layout = layoutFromGrid(grid, blocks);
      // an armed link keeps pointing at a cell that may be gone after a reload (preset switch,
      // external edit) — disarm rather than complete a connect from a phantom source
      if (this.linkFrom) {
        const lf = this.linkFrom;
        const still = [...this.layout.cells, ...this.layout.shunts].some((c) => c.row === lf.row && c.col === lf.col && c.effectId === lf.effectId);
        if (!still) this.linkFrom = null;
      }
      this.sceneNames = grid.scenes ?? [];
      this.everLoaded = true;
      this.status = 'ready';
      this.fetchMeters(); // background: fill every block's level meter
      this.#invalidatePinned(); // preset changed → re-hydrate pinned custom-panel controls
      this.startLiveMeters(); // background: live audio meters (per-block monitor level → dB)
    } catch (e) {
      if (!this.everLoaded) this.status = 'offline';
      // We were connected and a (re)load failed — a real device-comm error worth a debug report. Debounced
      // + dismissible + only if upload is configured, so it never spams (see offerDebugReport).
      else this.offerDebugReport({ kind: 'device-comm', route: legacyAm4 ? '/am4/grid' : '/preset/grid', message: (e as Error)?.message?.slice(0, 200) });
    }
  };

  #watching = false;
  #contentCheckAt = 0; // last time the current slot's stored content was re-decoded (external-edit catch)
  #watchTick = 0;
  watchPreset = async () => {
    if (!this.presetLiveQuery) return; // no live current-preset query on this device — polling would just time out
    if (this.#watching) return; // skip a tick rather than queue behind an in-flight watch
    // On a slow MIDI link, background preset-watch polling competes with edits and inflates latency —
    // run it only every 4th tick (~16s instead of ~4s) so the link stays free for what the user is doing.
    if (this.slowLink && this.#watchTick++ % 4 !== 0) return;
    this.#watching = true;
    try {
      const n = (await forgefx.currentPreset()).number;
      // 0x0D is flaky on a modified edit buffer (returns -1); ignore so a transient
      // failure doesn't masquerade as a preset change (= reload flicker).
      if (n >= 0 && n !== this.lastPreset) {
        this.lastPreset = n;
        this.bufferSource = null; // slot load replaced the buffer — it no longer holds a local file
        this.#histSwitch(n); // device-side preset change → swap the history context
        await this.load();
        if (this.selKey) await this.#loadParams();
        if (library.cacheBuilt) library.refreshSlot(n); // CRC-gated sync of the navigated-to slot (catches external edits)
        this.#contentCheckAt = Date.now();
      } else if (this.status === 'offline') {
        await this.load();
      } else if (n >= 0 && library.cacheBuilt && Date.now() - this.#contentCheckAt > 60000) {
        // Same slot number, but its stored content could change under us (e.g. another editor overwrote
        // this slot while the unit stayed on it). This is a RARE safety net — device-side edits are
        // already pushed via ForgeFX's edit-watch (SSE 'changed'/'param'), and a slot switch is caught
        // by the number change above. refreshSlot re-dumps the whole preset, so keep it INFREQUENT
        // (every 60s, not 11s) to stay off the serial link; CRC-gated so an unchanged preset writes nothing.
        this.#contentCheckAt = Date.now();
        library.refreshSlot(n);
      }
    } catch {
      /* keep showing the last good grid */
    } finally {
      this.#watching = false;
    }
  };

  // ── selection ──
  // mirror the selection on the device screen (cursor-select) so the unit follows the UI
  selectCellOnDevice = (row: number, col: number) => {
    if (!this.hasCursorSelect) return; // no grid cursor-select on this device; opening a slot just reads its params
    forgefx.selectCell(this.#W(row), this.#W(col)).catch(() => {});
  };

  openCell = async (c: Cell) => {
    this.virtual = null; // leaving any rail/virtual screen — back to a real grid block
    this.selectCellOnDevice(c.row, c.col);
    if (c.kind === 'shunt') return; // shunts have no editor
    this.selKey = `${c.row},${c.col}`;
    this.editorOpen = true;
    this.editingTabs = false;
    this.activePage = this.#defaultPage();
    // Devices with caps.paramsWithoutPack serve params for any placed block (AM4 slots read by
    // pidLow from the catalog) — don't gate the editor on a gen-3 `pack` there.
    if (!c.pack && !this.paramsWithoutPack) {
      this.sheetState = 'nopack';
      this.params = [];
      this.enums = [];
      return;
    }
    await this.#loadParams();
  };
  closeEditor = () => {
    this.editorOpen = false;
  };

  // Return to the Signal Grid (Build) from any rail/virtual screen.
  openBuild = () => {
    this.virtual = null;
    this.inLibrary = false;
    this.railActive = 'build';
  };

  // Open the full Preset Browser (its own rail screen — replaces the grid/editor view).
  openLibrary = () => {
    this.virtual = null;
    this.editorOpen = false;
    this.inLibrary = true;
    this.railActive = 'library';
  };

  // Open a virtual effect (Setup=1, Controllers=2, Modifier=3, FC=199) as a rail screen. Same param
  // path as a block — "the block editor pointed at effectId N" — rendered full-view by VirtualScreen.
  openVirtual = async (eid: number, slug: string, name: string) => {
    this.virtual = { eid, slug, name };
    this.inLibrary = false;
    this.selKey = null;
    this.editorOpen = false;
    this.editingTabs = false;
    this.activePage = '';
    await this.#loadParams();
  };
  // default tab when opening a block: Ideal in Basic view, Advanced in Advanced view
  #defaultPage = () => (this.globalMode === 'basic' ? '__ideal' : '__advanced');

  #loadParams = async () => {
    const c = this.selected;
    if (!c || (!c.pack && !this.paramsWithoutPack)) return; // some devices serve params without a gen-3 pack
    this.sheetState = 'loading';
    try {
      // API v2: the unified /preset/blocks/:addr/params serves every device (AM4 addr = pidLow).
      // Legacy v1 fallback: the AM4 reads via its own /am4/blocks route. Same BlockParams DTO either
      // way, so the rest of this method is model-agnostic.
      const r = !this.isV2 && this.isAm4 ? await forgefx.am4BlockParams(c.effectId) : await forgefx.blockParams(c.effectId);
      this.params = r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase()));
      this.enums = r.enums ?? [];
      this.blockType = r.type ?? null;
      this.blockSlug = r.slug ?? null;
      if (this.blockSlug !== 'looper') this.looperWave = null; // clear stale waveform when leaving the looper
      this.blockLayout = r.layout ?? null; // device-authentic pages seed the ControlSurface Default layout
      // refresh this block's meter values from the freshly-read params (accurate fill on open)
      if (c.effectId != null) {
        const fallback = this.params[0];
        const m = this.meters[c.effectId] ?? {
          defaultId: fallback?.id ?? -1,
          defaultName: fallback?.name ?? '',
          typeName: '',
          vals: {} as Record<number, MeterVal>
        };
        if (r.type?.name) m.typeName = r.type.name;
        if (m) {
          for (const p of this.params)
            if (p.id != null && (p.id === m.defaultId || this.swipeFor(this.slugOf(c)).some((x) => x.id === p.id)))
              m.vals[p.id] = { norm: p.norm ?? 0, value: p.value ?? 0, unit: p.unit, min: p.min, max: p.max, log: p.log };
          this.meters = { ...this.meters, [c.effectId]: { ...m } };
        }
      }
      this.sheetState = 'ready';
    } catch (e) {
      this.sheetState = 'error';
      if (e instanceof ForgeError) console.warn(e.message);
    }
  };

  // ── param writes (optimistic + debounced continuous) ──
  setParam = (p: NamedParam, v: number) => {
    const from = p.norm ?? 0; // pre-optimistic value — the undo target (first call of a drag wins)
    p.norm = v;
    const c = this.selected;
    if (!c || (!c.pack && !this.paramsWithoutPack)) return;
    // mirror onto the grid meter so the block tile's level/HUD tracks the knob
    if (p.id != null && c.effectId != null) {
      const m = this.meters[c.effectId];
      if (m && m.vals[p.id]) {
        m.vals[p.id] = { ...m.vals[p.id], norm: v, value: paramValue({ norm: v, min: p.min, max: p.max, unit: p.unit, log: p.log }) };
        this.meters = { ...this.meters, [c.effectId]: { ...m } };
      }
    }
    if (p.id == null) return;
    // one gesture = one undo step: rapid same-param writes coalesce (history skips itself while applying)
    history.recordGesture({
      kind: 'param', eid: c.effectId, paramId: p.id, continuous: true, from, to: v,
      block: c.display, param: p.name, min: p.min, max: p.max, unit: p.unit, log: p.log
    });
    clearTimeout(this.#sendTimers[p.id]);
    // API v2: the unified PUT {value, continuous:true} writes every device (AM4 addr = pidLow).
    // Legacy v1 fallback: the AM4 writes via its own SET_NORM route.
    const eid = c.effectId, pid = p.id as number;
    const legacyAm4 = !this.isV2 && this.isAm4;
    this.#sendTimers[pid] = setTimeout(
      () => (legacyAm4 ? forgefx.am4SetParamNorm(eid, pid, v) : forgefx.setParam(eid, pid, v, true)).catch(() => {}),
      60
    );
  };
  // enum/discrete write: send the ordinal (continuous=false → device-confirmed)
  setEnum = (e: EnumParam, value: number) => {
    const from = e.value;
    e.value = value; // optimistic
    const c = this.selected;
    if (!c || (!c.pack && !this.paramsWithoutPack)) return;
    if (from !== value) history.record({
      kind: 'param', eid: c.effectId, paramId: e.id, continuous: false, from, to: value,
      block: c.display, param: e.name,
      fromLabel: e.options.find((o) => o.value === from)?.label, toLabel: e.options.find((o) => o.value === value)?.label
    });
    (!this.isV2 && this.isAm4 ? forgefx.am4SetParamValue(c.effectId, e.id, value) : forgefx.setParam(c.effectId, e.id, value, false)).catch(() => {});
  };
  toggleBypass = async (cell?: Cell) => {
    const c = cell ?? this.selected;
    if (!c?.pack) return;
    const next = !(c.bypassed ?? false);
    c.bypassed = next;
    try {
      await forgefx.setBypass(c.effectId, next);
      history.record({ kind: 'bypass', eid: c.effectId, block: c.display, from: !next, to: next });
      this.showToast(next ? 'Bypassed' : 'Engaged', next ? '#d6543f' : '#5fc46b');
    } catch {
      c.bypassed = !next;
    }
  };
  setChannel = async (ch: string) => {
    const c = this.selected;
    if (!c?.pack || c.channel === ch) return;
    const prev = c.channel;
    c.channel = ch;
    try {
      await forgefx.setChannel(c.effectId, ch);
      if (prev) history.record({ kind: 'channel', eid: c.effectId, block: c.display, from: prev, to: ch });
      this.#scheduleBlockStateReload();
    } catch {
      c.channel = prev;
    }
  };
  retype = async (value: number) => {
    const c = this.selected;
    if (!c?.pack) return;
    const from = this.blockType; // capture before the device swaps the model (params reset on retype)
    // value is the device-true model ordinal = the discrete-SET value
    try {
      await forgefx.setType(c.effectId, value);
      await this.#loadParams();
      if (from && from.value !== value) history.record({
        kind: 'retype', eid: c.effectId, block: c.display, from: from.value, to: value,
        fromName: from.name, toName: this.blockType?.name ?? String(value)
      });
      await this.load();
      this.showToast('Type changed', '#35c9d6');
    } catch (e) {
      this.showToast('Type change rejected by device', '#d6543f');
      if (e instanceof ForgeError) console.warn(e.message);
    }
  };

  // ── cab IR picker ──
  openCabPicker = () => {
    if (!this.selected?.pack) return;
    this.cabPickerOpen = true;
  };
  /** Apply a set of discrete cab writes (mode / bank / IR index / dyna type) then refresh params. */
  applyCab = async (writes: { paramId: number; value: number }[]) => {
    const c = this.selected;
    if (!c?.pack) return;
    for (const w of writes) await forgefx.setParam(c.effectId, w.paramId, w.value, false).catch(() => {});
    history.checkpoint(`${c.display} cab changed`, false); // logged, not undoable (old slot state isn't captured) — v1 limitation
    await this.#loadParams();
  };

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
  // optimistic: show the cell immediately, reconcile from the device in the background
  place = async (row: number, col: number, blockId: number, label?: string) => {
    const display = label ?? '…';
    const cell: Cell = {
      row,
      col,
      kind: 'block',
      effectId: blockId,
      display,
      pack: packFor(display),
      color: statusColor(display),
      fromRows: []
    };
    this.layout = { ...this.layout, cells: [...this.layout.cells.filter((c) => !(c.row === row && c.col === col)), cell] };
    try {
      await forgefx.placeCell(this.#W(row), this.#W(col), blockId);
      history.record({ kind: 'place', row, col, blockId, display });
      this.load(); // background reconcile (real name/effectId)
    } catch {
      this.load();
    }
  };
  removeAt = async (row: number, col: number) => {
    // capture the doomed cell + its wiring BEFORE the optimistic filter, so undo can restore both
    const gone = [...this.layout.cells, ...this.layout.shunts].find((c) => c.row === row && c.col === col);
    const inRows = gone?.fromRows.slice() ?? [];
    const outRows = [...this.layout.cells, ...this.layout.shunts].filter((c) => c.col === col + 1 && c.fromRows.includes(row)).map((c) => c.row);
    this.layout = {
      ...this.layout,
      cells: this.layout.cells.filter((c) => !(c.row === row && c.col === col)),
      shunts: this.layout.shunts.filter((c) => !(c.row === row && c.col === col))
    };
    try {
      await forgefx.clearCell(this.#W(row), this.#W(col));
      if (gone) history.record({ kind: 'remove', row, col, blockId: gone.effectId, display: gone.display, inRows, outRows });
      this.load(); // background reconcile
    } catch {
      this.load();
    }
  };
  removeSelected = async () => {
    const c = this.selected;
    if (!c) return;
    this.closeEditor();
    await this.removeAt(c.row, c.col);
    this.showToast('Block removed', '#d6543f');
  };

  // Move a block to any empty cell. Same-column → re-cable (preserve wires). Cross-column →
  // plain clear+place; cables drop naturally if the path breaks (matches the device default).
  // Optimistic: relocate the cell in the UI immediately, reconcile in the background.
  move = async (src: Cell, row: number, col: number) => {
    if (src.row === row && src.col === col) return;
    const sr = src.row, sc = src.col; // capture before optimistic mutation
    const sameCol = col === sc;
    // routing to preserve (same-column only) — read BEFORE we mutate the layout
    const incoming = src.fromRows.slice();
    const outgoing = [...this.layout.cells, ...this.layout.shunts]
      .filter((c) => c.col === sc + 1 && c.fromRows.includes(sr))
      .map((c) => c.row);
    // optimistic relocate — also carry the routing so wires move with the block:
    //  • the block keeps its incoming feeders on a same-col move (drops them cross-col)
    //  • downstream cells re-point from the old row to the new one (same-col), or drop it (cross-col)
    const relocate = (c: Cell): Cell => {
      if (c === src) return { ...c, row, col, fromRows: sameCol ? c.fromRows : [] };
      if (c.col === sc + 1 && c.fromRows.includes(sr)) {
        const fr = c.fromRows.filter((r) => r !== sr);
        if (sameCol) fr.push(row);
        return { ...c, fromRows: fr };
      }
      return c;
    };
    this.layout = { ...this.layout, cells: this.layout.cells.map(relocate), shunts: this.layout.shunts.map(relocate) };
    this.selKey = `${row},${col}`;
    try {
      // mirror the executed call sequence into history ops (undo replays the inverses in reverse)
      const ops: import('./history.svelte').HistoryOp[] = [];
      if (sameCol) {
        for (const dr of outgoing) await forgefx.cable(this.#W(sr), this.#W(sc), this.#W(dr), false);
        ops.push(...outgoing.map((dr) => ({ kind: 'cable', srcRow: sr, srcCol: sc, destRow: dr, connect: false }) as const));
        await forgefx.clearCell(this.#W(sr), this.#W(sc));
        // in-cables die implicitly on clear → carried on the remove op so undo restores them with the block
        ops.push({ kind: 'remove', row: sr, col: sc, blockId: src.effectId, display: src.display, inRows: incoming, outRows: [] });
        await forgefx.placeCell(this.#W(row), this.#W(col), src.effectId);
        ops.push({ kind: 'place', row, col, blockId: src.effectId, display: src.display });
        for (const fr of incoming) await forgefx.cable(this.#W(fr), this.#W(col - 1), this.#W(row), true);
        ops.push(...incoming.map((fr) => ({ kind: 'cable', srcRow: fr, srcCol: col - 1, destRow: row, connect: true }) as const));
        for (const dr of outgoing) await forgefx.cable(this.#W(row), this.#W(col), this.#W(dr), true);
        ops.push(...outgoing.map((dr) => ({ kind: 'cable', srcRow: row, srcCol: col, destRow: dr, connect: true }) as const));
      } else {
        await forgefx.clearCell(this.#W(sr), this.#W(sc));
        ops.push({ kind: 'remove', row: sr, col: sc, blockId: src.effectId, display: src.display, inRows: incoming, outRows: outgoing });
        await forgefx.placeCell(this.#W(row), this.#W(col), src.effectId);
        ops.push({ kind: 'place', row, col, blockId: src.effectId, display: src.display });
      }
      history.recordComposite(`Moved ${src.display} to r${row + 1}c${col + 1}`, ops);
      this.load(); // background reconcile
      this.showToast('Moved', '#35c9d6');
    } catch {
      this.load();
    }
  };

  // ── tap-to-connect link mode (shared by the SignalGrid and the GridMap) ──
  // Arming lives here (not in a component) so it survives mobile page swipes and works across surfaces:
  // arm on the grid, complete on the map — or vice versa. `connect()` below spans ANY later column
  // (shunts through the gaps), so a completed link is never restricted to the adjacent column.
  linkFrom = $state<Cell | null>(null);
  /** Arm link mode from a cell's output; arming the same cell again cancels (tap the port twice). */
  armLink = (c: Cell) => {
    if (this.linkFrom && this.linkFrom.row === c.row && this.linkFrom.col === c.col) {
      this.linkFrom = null;
      return;
    }
    this.linkFrom = c;
  };
  cancelLink = () => {
    this.linkFrom = null;
  };
  /** While armed: tap a destination cell. Any LATER column completes via connect() (blocks, shunts or
   *  empty cells — connect lays shunts as needed); the armed cell itself cancels; same/earlier columns
   *  keep the arm and explain, so the user can page/scroll on and pick a valid target. */
  completeLink = async (row: number, col: number) => {
    const src = this.linkFrom;
    if (!src) return;
    if (row === src.row && col === src.col) {
      this.linkFrom = null; // tapped the armed cell again → cancel
      return;
    }
    if (col <= src.col) {
      this.showToast('Connect to a later column', '#d6543f');
      return; // stay armed — the user can still pick a valid destination
    }
    this.linkFrom = null;
    await this.connect(src, row, col);
  };

  // Connect src → (destRow,destCol), spanning any number of columns. Intermediate
  // empty cells get a shunt (a routing cell — eid>1000 on FM3, base SHUNT_ID) so the
  // signal can pass through; then we chain an adjacent-column cable for each hop.
  // The straight run flows along src.row; the final hop bends to destRow.
  connect = async (src: Cell, destRow: number, destCol: number) => {
    if (destCol <= src.col) {
      this.showToast('Connect to a later column', '#d6543f');
      return;
    }
    const all = [...this.layout.cells, ...this.layout.shunts];
    const at = (r: number, c: number) => all.find((x) => x.row === r && x.col === c);
    // FM-Edit gives every shunt a UNIQUE instance id (shuntBase + n); reusing one id makes the
    // device accept the first and silently dedupe the rest — which is why a multi-cell connect
    // only ever placed one shunt. Allocate the lowest free instance for each shunt we add.
    // The base comes from the device capabilities (gen-3: 1024); SHUNT_ID is the legacy fallback.
    const shuntBase = this.caps?.shuntBase ?? SHUNT_ID;
    const usedShunts = new Set(all.filter((x) => x.effectId >= shuntBase).map((x) => x.effectId - shuntBase));
    let nextInst = 0;
    const allocShunt = () => {
      while (usedShunts.has(nextInst)) nextInst++;
      usedShunts.add(nextInst);
      return shuntBase + nextInst;
    };
    try {
      const ops: import('./history.svelte').HistoryOp[] = []; // mirror of the executed calls, for undo
      // ensure a carrier cell exists in every intermediate column (along src.row)
      for (let c = src.col + 1; c < destCol; c++) {
        const cell = at(src.row, c);
        if (!cell) {
          const sid = allocShunt();
          await forgefx.placeCell(this.#W(src.row), this.#W(c), sid);
          ops.push({ kind: 'place', row: src.row, col: c, blockId: sid, display: 'Shunt' });
        } else if (cell.kind === 'block') {
          this.showToast('Clear the cells in between to route through', '#d6543f');
          return;
        }
      }
      // ensure the destination exists (shunt if dropped on an empty cell)
      if (!at(destRow, destCol)) {
        const sid = allocShunt();
        await forgefx.placeCell(this.#W(destRow), this.#W(destCol), sid);
        ops.push({ kind: 'place', row: destRow, col: destCol, blockId: sid, display: 'Shunt' });
      }
      // chain the cables: straight along src.row, then bend into destRow on the last hop
      for (let c = src.col; c < destCol - 1; c++) {
        await forgefx.cable(this.#W(src.row), this.#W(c), this.#W(src.row), true);
        ops.push({ kind: 'cable', srcRow: src.row, srcCol: c, destRow: src.row, connect: true });
      }
      await forgefx.cable(this.#W(src.row), this.#W(destCol - 1), this.#W(destRow), true);
      ops.push({ kind: 'cable', srcRow: src.row, srcCol: destCol - 1, destRow, connect: true });
      history.recordComposite(`Connected ${src.display} → r${destRow + 1}c${destCol + 1}`, ops);
      await this.load();
      this.showToast('Connected', '#35c9d6');
    } catch {
      /* */
    }
  };
  disconnect = async (srcRow: number, srcCol: number, destRow: number) => {
    try {
      await forgefx.cable(this.#W(srcRow), this.#W(srcCol), this.#W(destRow), false);
      history.record({ kind: 'cable', srcRow, srcCol, destRow, connect: false });
      await this.load();
      this.showToast('Connection removed', '#9a9aa3');
    } catch {
      /* */
    }
  };

  // ── view mode ──
  // Basic/Advanced now picks the default tab (Ideal vs Advanced) for the open block.
  setGlobalMode = (m: ViewMode) => {
    this.globalMode = m;
    if (this.selected) this.activePage = this.#defaultPage();
    this.showToast(m === 'basic' ? 'Blocks open on Ideal' : 'Blocks open on Advanced', '#35c9d6');
  };

  // ── telemetry actions ──
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
      this.#scheduleSceneReload();
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
      await this.load(); // re-read grid → verifies the device stored the name (sceneNames refreshed)
    } catch {
      this.sceneNames = prev; // revert
      this.showToast('Scene rename failed', '#d6543f');
    }
  };
  /** Rename the working-buffer preset, then re-read to confirm the device took it. Optimistic; reverts on
   *  failure. Not persisted to flash — Save (store) writes it to the slot. */
  renamePreset = async (name: string) => {
    if (!this.canRenamePresets || !this.preset) return;
    const clean = name.replace(/[^\x20-\x7e]/g, '').slice(0, 32).trimEnd();
    const prev = this.preset;
    this.preset = { ...prev, name: clean }; // optimistic
    try {
      const r = await forgefx.setPresetName(clean);
      if (!r.ok) throw new Error('rejected');
      if (prev.name !== clean) history.record({ kind: 'presetName', from: prev.name, to: clean });
      if (typeof prev.number === 'number' && prev.number >= 0) library.applySlotName(prev.number, clean); // keep the library list in sync
      await this.poll(); // re-read preset ref → verifies the device stored the name
    } catch {
      this.preset = prev; // revert
      this.showToast('Preset rename failed', '#d6543f');
    }
  };
  /** Library rename: rename a STORED device preset by slot and persist it. Loads the slot into the edit
   *  buffer first if it isn't active (device switches to it), renames the working buffer, then stores it
   *  back — content-safe (same preset, new name). Returns true on success. */
  renameStoredPreset = async (slot: number, name: string): Promise<boolean> => {
    if (!this.canRenamePresets || slot < 0) return false;
    const clean = name.replace(/[^\x20-\x7e]/g, '').slice(0, 32).trimEnd();
    if (!clean) return false;
    const prevSlot = this.preset?.number ?? -1; // where the user was — we return here afterwards
    const switched = prevSlot !== slot;
    try {
      if (switched) await this.selectPreset(slot); // load into edit buffer (switches device)
      const r1 = await forgefx.setPresetName(clean);
      if (!r1.ok) throw new Error('name rejected');
      if (this.preset) this.preset = { ...this.preset, name: clean };
      // Deep-dump devices (gen-3) rename the EDIT BUFFER, so a store persists it to the slot. Name-scan
      // devices (AM4) rename the STORED location directly — a store here would re-save the buffer (old
      // name) over it and clobber the rename, so skip it.
      if (this.canDeepScan) {
        const r2 = await forgefx.store(slot); // persist the renamed buffer to the slot
        if (!r2.ok) throw new Error('store rejected');
      }
      library.applySlotName(slot, clean); // reflect the rename in the list immediately (no racy re-scan)
      if (this.canDeepScan) library.refreshSlot(slot); // deep-scan: reconcile the full summary/CRC
      // return to the preset the user was on before the rename
      if (switched && prevSlot >= 0) await this.selectPreset(prevSlot);
      else await this.poll();
      this.showToast(`Renamed & saved preset ${String(slot).padStart(3, '0')}`, '#33c46b');
      return true;
    } catch {
      if (switched && prevSlot >= 0) { try { await this.selectPreset(prevSlot); } catch { /* */ } } // restore on failure too
      this.showToast('Rename failed', '#d6543f');
      return false;
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
  toggleTuner = async () => {
    const next = !this.tuner.active;
    this.tuner = { active: next };
    await forgefx.setTuner(next).catch(() => {
      this.tuner = { active: !next };
    });
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
      await this.load();
      await this.loadPorts();
      this.showToast(conn ? 'Connection changed' : 'Back to auto-detect', '#35c9d6');
    } catch {
      this.showToast('Could not switch connection', '#d6543f');
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
      await this.load();
      await this.loadPorts();
      this.showToast(model === 'auto' ? 'Device profile: auto-detect' : `Device profile forced: ${model.toUpperCase()}`, '#35c9d6');
    } catch {
      this.showToast('Could not set device profile', '#d6543f');
    }
  };

  // ── preset nav ──
  selectPreset = async (n: number) => {
    if (!this.isV2 && this.isAm4) return this.loadAm4Preset(n); // legacy v1 fallback: AM4's own codec route
    try {
      await forgefx.selectPreset(n); // API v2: unified for every device (AM4 number = stored location)
      this.lastPreset = n;
      this.bufferSource = null; // slot load replaced the buffer — it no longer holds a local file
      this.#histSwitch(n);
      this.presetOpen = false;
      await this.poll();
      await this.load();
      // no live current-preset query → watchPreset can't refresh the open block after the switch
      if (!this.presetLiveQuery && this.selKey) await this.#loadParams();
    } catch {
      /* */
    }
  };
  stepPreset = (dir: number) => {
    const cur = this.preset?.number ?? this.lastPreset ?? 0;
    const n = Math.max(0, cur + dir);
    return this.selectPreset(n);
  };
  /** @deprecated legacy v1 fallback — AM4: load a stored location (0..103) into the edit buffer,
   *  then re-read the 4-slot grid. API v2 goes through the unified selectPreset(). */
  loadAm4Preset = async (location: number) => {
    try {
      await forgefx.am4SwitchPreset(location);
      this.presetOpen = false;
      await this.load();
      if (this.selKey) await this.#loadParams();
    } catch {
      this.showToast('Load failed', '#d6543f');
    }
  };

  // ── save (DESTRUCTIVE: overwrites a preset slot) ──
  saveOpen = $state(false);
  saveTarget = $state<number>(0);
  openSave = () => {
    this.saveTarget = this.preset?.number ?? this.lastPreset ?? 0;
    this.saveOpen = true;
  };
  save = async (n: number) => {
    try {
      // API v2: the unified /preset/store saves every device (AM4 number = stored location; the
      // response additionally carries its bank-letter code). Legacy v1 AM4 uses its own codec route.
      const r = !this.isV2 && this.isAm4 ? await forgefx.am4StorePreset(n) : await forgefx.store(n);
      this.saveOpen = false;
      if (r.ok) {
        history.checkpoint(`Saved to preset ${'code' in r && r.code ? r.code : n}`, false); // marker — undo continues past it
        this.showToast(`Saved to preset ${'code' in r && r.code ? r.code : n}`, '#f5a623');
        await this.poll();
        if (this.canDeepScan) library.refreshSlot(n); // library cache sync (name-scan devices re-scan on open)
      } else {
        this.showToast('Save rejected by device', '#d6543f');
      }
    } catch {
      this.showToast('Save failed', '#d6543f');
    }
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
    if (this.mobColsAuto) this.mobCols = this.fitCols(w);
  };
}

export const editor = new EditorStore();
export { baseName, packFor };
