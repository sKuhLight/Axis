// Central editor state + device actions for Axis. A single runes-based store the
// rail / top bar / grid / editor / palette all read and drive. Wraps the ForgeFX
// HTTP client and preserves the live-verified write wiring (place, re-cabling move,
// cables, params, bypass, channel, retype).
import { forgefx, ForgeError } from './forgefx';
import { library } from './library.svelte';
import { cloud } from './cloud.svelte';
import { onMutation } from './syncBus';
import { layoutFromGrid, type Cell, type Layout } from './grid';
import { baseName, packFor, statusColor } from './blocks';
import { resolveTabs, loadLayouts, saveLayouts, newTabId, loadSwipe, saveSwipe, type SwipeCtrl } from './layouts';
import { paramValue } from './format';
import type { NamedParam, EnumParam, TabDef, ResolvedTab, MeterVal, DetectResult, ConnPick, ConnInfo, DeviceLayout, DebugReport } from './types';

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
  /** Current model/type name of a placed block (for the grid tile sub-label). */
  typeNameFor = (effectId: number): string => this.meters[effectId]?.typeName ?? '';
  scene = $state(1);
  railActive = $state('build');
  bpm = $state(120);
  presetCount = $state(512); // FM3 preset slots
  /** Live CPU% (decoded from the device meters frame), null until first reading. FM3-family only. */
  cpu = $state<number | null>(null);
  /** Live audio level meters (0..1). Labels provisional (input/outL/outR) pending live verification. */
  levels = $state<{ input: number; outL: number; outR: number } | null>(null);

  // ── mobile grid: column density (3–12) + horizontal paging through the 12 columns ──
  mobCols = $state(4);
  gridPage = $state(0);
  get pageCount() {
    return Math.ceil(12 / Math.max(3, Math.min(12, this.mobCols)));
  }
  changeCols = (d: number) => {
    const nc = Math.max(3, Math.min(12, this.mobCols + d));
    if (nc === this.mobCols) return;
    this.mobCols = nc;
    this.gridPage = Math.min(this.gridPage, this.pageCount - 1);
  };
  setCols = (n: number) => {
    this.mobCols = Math.max(3, Math.min(12, n));
    this.gridPage = Math.min(this.gridPage, this.pageCount - 1);
  };
  colsFit = () => {
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
    scopes: { presets: boolean; scenes: boolean; fc: boolean; settings: boolean };
    fullBackup: boolean;
    autoSync: boolean;
    pendingEmail: string | null;
  }>({ enabled: false, user: null, syncing: false, lastSync: null, note: null, plan: 'Free', scopes: loadScopes(), fullBackup: false, autoSync: loadAutoSync(), pendingEmail: null });
  cloudOpen = $state(false);
  // ── telemetry / diagnostics ── `enabled` = live RUM gate (AXIS_TELEMETRY); `uploadEnabled` = on-demand
  // debug-report upload available; `consent` = user opted into live telemetry (default OFF). The on-demand
  // upload is per-incident consent and works even when `consent` is false.
  telemetry = $state<{ enabled: boolean; uploadEnabled: boolean; consent: boolean; instanceId: string; sending: boolean }>(
    { enabled: false, uploadEnabled: false, consent: loadTelemetryConsent(), instanceId: loadInstanceId(), sending: false }
  );
  telemetryOpen = $state(false);
  #recentEvents: { t: number; kind: string; text: string }[] = []; // recent-events ring for the debug report
  // ── connection picker (serial + MIDI ports) ──
  portsOpen = $state(false);
  ports = $state<ConnInfo[]>([]);
  portChosen = $state<ConnPick | null>(null);
  portOverride = $state<ConnPick | null>(null);
  paletteOpen = $state(false);
  paletteMode = $state<'place' | 'retype'>('place');
  placeTarget = $state<{ row: number; col: number } | null>(null);
  presetOpen = $state(false);
  cabPickerOpen = $state(false);
  toast = $state<{ text: string; accent: string } | null>(null);

  #toastT: ReturnType<typeof setTimeout> | null = null;
  #sendTimers: Record<string | number, ReturnType<typeof setTimeout>> = {};

  // ── derived ──
  get isMobile() {
    return this.vw < 760;
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
  fetchMeters = () => {
    if (this.isAm4) return; // AM4 has no gen-3 meters; firing them sends FM3 frames the AM4 ignores (timeouts)
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

  // ── lifecycle ──
  init = async () => {
    this.customLayouts = loadLayouts();
    this.swipeControls = loadSwipe();
    this.#initUpdater();
    this.#initCloud();
    this.#initTelemetry();
    this.#openEvents();
    // auto-detect the attached unit FIRST (so load() knows whether to use the AM4 4-slot path), and
    // warn if it isn't a model we have a live codec for
    try {
      this.detected = await forgefx.detect();
      if (this.detected.connected && !this.detected.supported) this.showToast(`${this.detected.name} detected — not yet supported`, '#d6543f');
    } catch {
      /* detect failed — proceed; load() falls back to the gen-3 path */
    }
    if (!this.isAm4) {
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
      if (e.channel === 'available') this.autoUpdate = { state: 'available', version: e.version };
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
      this.cloud = { ...this.cloud, enabled: s.enabled, user: s.user ? { email: s.user.email } : null };
      if (s.user) { await this.cloudSync(); cloud.refresh(); } // pull latest + sync-state index on launch
    } catch {
      /* cloud disabled / engine not ready */
    }
  };
  /** Debounced background sync after a local change — batches rapid edits, skips if signed-out/off/in-flight. */
  scheduleAutoSync = () => {
    if (!this.cloud.enabled || !this.cloud.user || !this.cloud.autoSync) return;
    if (this.#autoSyncT) clearTimeout(this.#autoSyncT);
    this.#autoSyncT = setTimeout(() => { if (!this.cloud.syncing) this.cloudSync(); }, 8000);
  };
  setAutoSync = (on: boolean) => {
    this.cloud = { ...this.cloud, autoSync: on };
    try { localStorage.setItem(AUTOSYNC_KEY, on ? '1' : '0'); } catch { /* */ }
    if (on) this.scheduleAutoSync();
  };

  // ── telemetry / diagnostics ──
  #initTelemetry = async () => {
    try {
      const s = await forgefx.telemetryStatus();
      this.telemetry = { ...this.telemetry, enabled: s.enabled, uploadEnabled: s.uploadEnabled };
      // Live Faro RUM init lands here in a later phase — gated by (s.enabled && this.telemetry.consent),
      // dynamic-imported so it stays out of builds where the operator didn't enable telemetry.
    } catch { /* telemetry disabled / engine not ready */ }
  };
  setTelemetryConsent = (on: boolean) => {
    this.telemetry = { ...this.telemetry, consent: on };
    try { localStorage.setItem(TELEMETRY_KEY, on ? '1' : '0'); } catch { /* */ }
  };
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
      await this.cloudSync();
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
      else if (r.user) { this.cloud = { ...this.cloud, user: { email: r.user.email }, pendingEmail: null }; await this.cloudSync(); cloud.refresh(); }
    } catch (e) {
      this.cloud.note = (e as Error).message || 'Sign-up failed';
    }
  };
  cloudLogout = async () => {
    try { await forgefx.cloudLogout(); } catch { /* */ }
    this.cloud = { ...this.cloud, user: null, lastSync: null, pendingEmail: null };
    cloud.clear();
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
      const s = this.cloud.scopes;
      // server scopes are coarser than the UI: presets→version blobs; everything else lives in `config`.
      const r = await forgefx.cloudSync({ presets: s.presets, config: s.settings || s.fc || s.scenes });
      const up = r.config.pushed + r.versions.pushed, down = r.config.pulled + r.versions.pulled;
      this.cloud = { ...this.cloud, lastSync: Date.now(), note: `Synced · ↑${up} ↓${down}` };
      cloud.refresh();
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
      await this.cloudSync();
    } catch (e) {
      this.cloud.note = (e as Error).message || 'Backup failed';
    } finally {
      this.cloud = { ...this.cloud, syncing: false };
    }
  };

  // live tuner/tempo/scene/cpu pushes from the device
  #openEvents = () => {
    if (this.#events) return;
    try {
      this.#events = forgefx.events((e) => {
        if (e.type === 'tempo') this.bpm = e.bpm;
        else if (e.type === 'scene') this.scene = e.index + 1;
        else if (e.type === 'tuner') this.tuner = { ...this.tuner, freq: e.freq, note: e.note, cents: e.cents, octave: e.octave };
        else if (e.type === 'cpu') this.cpu = e.percent;
        else if (e.type === 'meters') this.levels = { input: e.input, outL: e.outL, outR: e.outR };
      });
    } catch {
      /* SSE unsupported / offline — telemetry stays at last-known */
    }
  };
  // pull current scene + tempo once at load (device → UI)
  #syncTelemetry = async () => {
    if (this.isAm4) return; // gen-3 scene/tempo frames; the AM4 ignores them → 5s timeouts that clog the queue
    try {
      this.scene = (await forgefx.getScene()).index + 1;
      this.bpm = (await forgefx.getTempo()).bpm;
    } catch {
      /* */
    }
  };

  #polling = false;
  poll = async () => {
    if (this.#polling) return; // never let interval ticks stack serial ops on a slow link
    this.#polling = true;
    try {
      const h = await forgefx.health();
      const dev = await forgefx.device().catch(() => null);
      this.conn = { state: 'online', fw: dev?.firmware?.version, device: h.device };
      if (!this.isAm4) {
        const t0 = performance.now();
        const p = await forgefx.currentPreset().catch(() => null);
        this.linkMs = Math.round(performance.now() - t0); // serial round-trip latency
        if (p && p.number >= 0) this.preset = p;
      }
    } catch {
      this.conn = { state: 'offline' };
    } finally {
      this.#polling = false;
    }
  };

  /** AM4 (model 0x15) — flat 4-slot device; render its slots on the same Signal Grid via /am4/grid. */
  get isAm4(): boolean {
    return this.detected?.modelId === 0x15;
  }

  load = async () => {
    if (!this.everLoaded) this.status = 'loading';
    try {
      const [grid, blocks] = this.isAm4
        ? [await forgefx.am4Grid(), []]
        : await Promise.all([forgefx.grid(), forgefx.presetBlocks().catch(() => [])]);
      this.layout = layoutFromGrid(grid, blocks);
      this.everLoaded = true;
      this.status = 'ready';
      this.fetchMeters(); // background: fill every block's level meter
    } catch {
      if (!this.everLoaded) this.status = 'offline';
    }
  };

  #watching = false;
  #contentCheckAt = 0; // last time the current slot's stored content was re-decoded (external-edit catch)
  watchPreset = async () => {
    if (this.#watching) return; // skip a tick rather than queue behind an in-flight watch
    this.#watching = true;
    try {
      const n = (await forgefx.currentPreset()).number;
      // 0x0D is flaky on a modified edit buffer (returns -1); ignore so a transient
      // failure doesn't masquerade as a preset change (= reload flicker).
      if (n >= 0 && n !== this.lastPreset) {
        this.lastPreset = n;
        await this.load();
        if (this.selKey) await this.#loadParams();
        if (library.cacheBuilt) library.refreshSlot(n); // CRC-gated sync of the navigated-to slot (catches external edits)
        this.#contentCheckAt = Date.now();
      } else if (this.status === 'offline') {
        await this.load();
      } else if (n >= 0 && library.cacheBuilt && Date.now() - this.#contentCheckAt > 11000) {
        // Same slot number, but its stored content can change under us (e.g. FM3-Edit overwrote
        // this slot while the unit stayed on it). Number-gated detection misses that, so re-decode
        // the current slot periodically. refreshSlot is CRC-gated — an unchanged preset is a cheap
        // no-op (no cache write, no UI churn).
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
  // mirror the selection on the FM3 screen (cursor-select) so the unit follows the UI
  selectCellOnDevice = (row: number, col: number) => {
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
    if (!c.pack) {
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
    if (!c?.pack) return;
    this.sheetState = 'loading';
    try {
      const r = await forgefx.blockParams(c.effectId);
      this.params = r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase()));
      this.enums = r.enums ?? [];
      this.blockType = r.type ?? null;
      this.blockLayout = r.layout ?? null; // device-authentic pages seed the ControlSurface Default layout
      // refresh this block's meter values from the freshly-read params (accurate fill on open)
      if (c.effectId != null) {
        const m = this.meters[c.effectId];
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
    p.norm = v;
    const c = this.selected;
    if (!c?.pack) return;
    // mirror onto the grid meter so the block tile's level/HUD tracks the knob
    if (p.id != null && c.effectId != null) {
      const m = this.meters[c.effectId];
      if (m && m.vals[p.id]) {
        m.vals[p.id] = { ...m.vals[p.id], norm: v, value: paramValue({ norm: v, min: p.min, max: p.max, unit: p.unit, log: p.log }) };
        this.meters = { ...this.meters, [c.effectId]: { ...m } };
      }
    }
    if (p.id == null) return;
    clearTimeout(this.#sendTimers[p.id]);
    this.#sendTimers[p.id] = setTimeout(() => forgefx.setParam(c.effectId, p.id as number, v, true).catch(() => {}), 60);
  };
  // enum/discrete write: send the ordinal (continuous=false → device-confirmed)
  setEnum = (e: EnumParam, value: number) => {
    e.value = value; // optimistic
    const c = this.selected;
    if (!c?.pack) return;
    forgefx.setParam(c.effectId, e.id, value, false).catch(() => {});
  };
  toggleBypass = async (cell?: Cell) => {
    const c = cell ?? this.selected;
    if (!c?.pack) return;
    const next = !(c.bypassed ?? false);
    c.bypassed = next;
    try {
      await forgefx.setBypass(c.effectId, next);
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
      await this.#loadParams();
    } catch {
      c.channel = prev;
    }
  };
  retype = async (value: number) => {
    const c = this.selected;
    if (!c?.pack) return;
    // value is the device-true model ordinal = the discrete-SET value
    try {
      await forgefx.setType(c.effectId, value);
      await this.#loadParams();
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
      this.load(); // background reconcile (real name/effectId)
    } catch {
      this.load();
    }
  };
  removeAt = async (row: number, col: number) => {
    this.layout = {
      ...this.layout,
      cells: this.layout.cells.filter((c) => !(c.row === row && c.col === col)),
      shunts: this.layout.shunts.filter((c) => !(c.row === row && c.col === col))
    };
    try {
      await forgefx.clearCell(this.#W(row), this.#W(col));
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
      if (sameCol) {
        for (const dr of outgoing) await forgefx.cable(this.#W(sr), this.#W(sc), this.#W(dr), false);
        await forgefx.clearCell(this.#W(sr), this.#W(sc));
        await forgefx.placeCell(this.#W(row), this.#W(col), src.effectId);
        for (const fr of incoming) await forgefx.cable(this.#W(fr), this.#W(col - 1), this.#W(row), true);
        for (const dr of outgoing) await forgefx.cable(this.#W(row), this.#W(col), this.#W(dr), true);
      } else {
        await forgefx.clearCell(this.#W(sr), this.#W(sc));
        await forgefx.placeCell(this.#W(row), this.#W(col), src.effectId);
      }
      this.load(); // background reconcile
      this.showToast('Moved', '#35c9d6');
    } catch {
      this.load();
    }
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
    // FM3-Edit gives every shunt a UNIQUE instance id (SHUNT_ID + n); reusing one id makes the
    // device accept the first and silently dedupe the rest — which is why a multi-cell connect
    // only ever placed one shunt. Allocate the lowest free instance for each shunt we add.
    const usedShunts = new Set(all.filter((x) => x.effectId >= SHUNT_ID).map((x) => x.effectId - SHUNT_ID));
    let nextInst = 0;
    const allocShunt = () => {
      while (usedShunts.has(nextInst)) nextInst++;
      usedShunts.add(nextInst);
      return SHUNT_ID + nextInst;
    };
    try {
      // ensure a carrier cell exists in every intermediate column (along src.row)
      for (let c = src.col + 1; c < destCol; c++) {
        const cell = at(src.row, c);
        if (!cell) await forgefx.placeCell(this.#W(src.row), this.#W(c), allocShunt());
        else if (cell.kind === 'block') {
          this.showToast('Clear the cells in between to route through', '#d6543f');
          return;
        }
      }
      // ensure the destination exists (shunt if dropped on an empty cell)
      if (!at(destRow, destCol)) await forgefx.placeCell(this.#W(destRow), this.#W(destCol), allocShunt());
      // chain the cables: straight along src.row, then bend into destRow on the last hop
      for (let c = src.col; c < destCol - 1; c++) await forgefx.cable(this.#W(src.row), this.#W(c), this.#W(src.row), true);
      await forgefx.cable(this.#W(src.row), this.#W(destCol - 1), this.#W(destRow), true);
      await this.load();
      this.showToast('Connected', '#35c9d6');
    } catch {
      /* */
    }
  };
  disconnect = async (srcRow: number, srcCol: number, destRow: number) => {
    try {
      await forgefx.cable(this.#W(srcRow), this.#W(srcCol), this.#W(destRow), false);
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
    this.scene = ui; // optimistic
    try {
      await forgefx.setScene(ui - 1);
      await this.load();
      if (this.selKey) await this.#loadParams();
    } catch {
      this.scene = prev;
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
    } catch {
      /* offline */
    }
  };
  // pick a port (or null to clear back to auto-detect); reconnect + re-detect + reload
  pickPort = async (conn: ConnPick | null) => {
    this.portsOpen = false;
    try {
      await forgefx.selectPort(conn);
      this.conn = { state: 'connecting' };
      await this.poll();
      const d = await forgefx.detect().catch(() => null);
      if (d) this.detected = d;
      await this.load();
      this.showToast(conn ? 'Connection changed' : 'Back to auto-detect', '#35c9d6');
    } catch {
      this.showToast('Could not switch connection', '#d6543f');
    }
  };

  // ── preset nav ──
  selectPreset = async (n: number) => {
    try {
      await forgefx.selectPreset(n);
      this.lastPreset = n;
      this.presetOpen = false;
      await this.poll();
      await this.load();
    } catch {
      /* */
    }
  };
  stepPreset = (dir: number) => {
    const cur = this.preset?.number ?? this.lastPreset ?? 0;
    const n = Math.max(0, cur + dir);
    return this.selectPreset(n);
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
      const r = await forgefx.store(n);
      this.saveOpen = false;
      if (r.ok) {
        this.showToast(`Saved to preset ${n}`, '#f5a623');
        await this.poll();
        library.refreshSlot(n); // keep the library cache in sync with the just-saved slot
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
  };
}

export const editor = new EditorStore();
export { baseName, packFor };
