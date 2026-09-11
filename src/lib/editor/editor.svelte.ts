// Central editor state + device actions for Axis. A single runes-based store the
// rail / top bar / grid / editor / palette all read and drive. Wraps the ForgeFX
// HTTP client and preserves the live-verified write wiring (place, re-cabling move,
// cables, params, bypass, channel, retype).
import { forgefx, ForgeError, setRequestFailureReporter } from '$lib/api/forgefx';
import { library } from '$lib/preset/library.svelte';
import { appSettings } from '$lib/platform/appSettings.svelte';
import { defaultBlockLibraryPath } from './blockLibraryPath';
import { blockLibrary } from './blockLibrary.svelte';
import { deviceDefs } from '$lib/device/deviceDefs.svelte';
import { history } from './history.svelte';
import { onMutation, notifyMutation } from './syncBus';
import { layoutFromGrid, type Cell, type Layout } from '$lib/device/grid';
import { planConnect, planReplaceShunt } from '$lib/device/gridRouting';
import { baseName, packFor, statusColor } from '$lib/device/blocks';
import { resolveTabs, loadLayouts, saveLayouts, newTabId, loadSwipe, saveSwipe, type SwipeCtrl } from './layouts';
import { geqBandsFromLayout } from '$lib/graphs/eq';
import { isWebBuild } from '$lib/platform/buildMode';
import { paramValue } from '$lib/ui/format';
import { presetRecency } from '$lib/preset/presetRecency.svelte';
import { gridHover } from './gridHover.svelte';
import type { NamedParam, EnumParam, TabDef, ResolvedTab, MeterVal, ConnPick, ProfileKey, DeviceLayout, DebugReport, DeviceEvent, TelemetryMode, DecodedBlockFile } from '$lib/api/types';
import type { EditorSurface } from './editorSurface';
import { monitorsByFamily } from '$lib/device/deviceMonitors';
import { overlays } from '$lib/overlay/overlays.svelte';
import { TelemetryStore, isTelemetryMode, type TelemetryHost, type ReportTrigger } from './telemetry.svelte';
import { DeviceSessionStore, type DeviceSessionHost } from './deviceSession.svelte';

const LOCAL_AUTOSYNC_KEY = 'axs.local.autosync';
const loadLocalAutoSync = (): boolean => { try { return localStorage.getItem(LOCAL_AUTOSYNC_KEY) !== '0'; } catch { return true; } }; // default on
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
const EMPTY: Layout = { cells: [], shunts: [], rows: 4, cols: 12, name: '', model: '', crcValid: true };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const SHUNT_ID = 1024; // FM3 routing/shunt cell base effect id (decoder: eid > 1000)

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
  sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('loading');
  /** effectId the currently-held params/enums/layout were read for, so #loadParams can tell a FIRST
   *  read of a block (blank the surface) from a refresh of the one already on screen (update in place). */
  #paramsEid: number | null = null;
  /** Device-authentic editor pages for the open block/virtual effect — the BlockEditor renders the
   *  device's own pixel-exact canvas from these. */
  blockLayout = $state<DeviceLayout | null>(null);
  /** Active virtual effect (Setup=1, Controllers=2, Modifier=3, FC=199) when a rail screen is open, else null. */
  virtual = $state<{ eid: number; slug: string; name: string } | null>(null);
  /** True when the full Preset Browser rail screen is open (replaces the grid/editor view). */
  inLibrary = $state(false);

  // ── view + chrome ──
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
  /** Per-preset monitor (meter) param table (GET /preset/monitors): device token → pid + role + dB
   *  range. This is how we know which paramIds are read-only MONITORS rather than editable params —
   *  the device also surfaces several of them in the ordinary block param list (amp `HEADROOM`/`B+`/
   *  `Gain`, cab `VU`, comp/input/output `Gain`…), where they would otherwise render as writable knobs.
   *
   *  Deliberately NOT gated on `meteringOn`/`canMeterBlocks`: it drives suppression of those phantom
   *  params, which has to hold even when live metering is switched off. */
  monitorParams = $state<import('$lib/api/types').MonitorParams | null>(null);
  #monitorParamsLoad: Promise<void> | null = null;
  /** Load the monitor table once (deduped, best-effort — on failure we fall back to the previous
   *  behaviour rather than blocking the editor). */
  loadMonitorParams = (): Promise<void> => {
    if (this.monitorParams) return Promise.resolve();
    this.#monitorParamsLoad ??= forgefx
      .monitors()
      .then((t) => { this.monitorParams = t ?? {}; })
      .catch(() => { this.monitorParams = {}; }) // treat "no table" as "no monitors"
      .finally(() => { this.#monitorParamsLoad = null; });
    return this.#monitorParamsLoad;
  };
  /** Monitor rows for ONE device family (e.g. `DISTORT`), keyed by device-true pid.
   *  MUST be family-scoped: pids repeat across families, so matching on pid alone would turn the amp's
   *  `Bass 1` (pid 8) into `INPUT_GAINMONITOR`'s level meter. */
  monitorsByPid = (family: string | null | undefined): Map<number, import('$lib/api/types').MonitorEntry> =>
    monitorsByFamily(this.monitorParams, family);
  /** Monitor rows for the OPEN block, keyed by pid — family comes from its device layout
   *  (`DeviceLayout.family` is the DEVICE family `DISTORT`, unlike `familyKey` which is the pack slug). */
  get openBlockMonitors(): Map<number, import('$lib/api/types').MonitorEntry> {
    return this.monitorsByPid(this.blockLayout?.family);
  }
  /** Toggle a looper transport control (record/play/stop/overdub/undo/once/reverse/half) on the open block. */
  looperControl = async (action: string, on: boolean) => {
    const eid = this.selected?.effectId;
    if (eid == null) return;
    try { await forgefx.looperControl(eid, action, on); } catch { /* best-effort */ }
  };
  railActive = $state('build');

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
      applyParamEcho: (effectId, paramId, norm) => e.#applyParamEcho(effectId, paramId, norm),
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
  /** The cell a Quick Build (or other external) drag is currently over + whether the drop is valid. */
  externalDrop = $state<{ row: number; col: number; valid: boolean } | null>(null);
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
      // same param/load/write machinery (and the BlockEditor) work unchanged.
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
    // amp exposes a built-in graphic EQ on a dedicated EQ tab; its bands come from the device layout
    // (the param list names them `Bass 2`/`Mid 2`/… — see geqBandsFromLayout).
    const eqIds = this.selected?.pack === 'Amp' ? geqBandsFromLayout(this.blockLayout).map((b) => b.paramId) : [];
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
    setRequestFailureReporter(this.#telemetry.onReqFailure); // auto-report every 5xx/network failure to Faro
    this.loadPorts(); // know the transport early (drives slowLink → meter throttling over MIDI)
    // Desktop-only first-run + update flows: the remote web app has no desktop to update, and the tour /
    // telemetry-consent / Ko-fi first-run popups belong to the PC install (the host handles telemetry), so
    // skip them in the remote build — otherwise every browser session nags with banners it can't act on.
    if (!isWebBuild()) {
      this.#initUpdater();
      this.#telemetry.init();
    }
    this.#initLocalSync();
    this.#initLocal();
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

  // ── local folder sync ──
  #autoSyncT: ReturnType<typeof setTimeout> | null = null;
  #initLocalSync = async () => {
    // Any local config/version mutation (tags, collections, layouts, snapshots…) nudges a debounced sync
    // of the local Sync/ folder.
    onMutation(() => this.scheduleAutoSync());
    await this.#loadProfile();
  };
  /** Debounced background sync after a local change — batches rapid edits, skips if off/in-flight.
   *  Drives the local Sync/ folder mirror (configured + auto). */
  scheduleAutoSync = () => {
    const doLocal = this.local.configured && this.local.exists && this.local.autoSync;
    if (!doLocal) return;
    if (this.#autoSyncT) clearTimeout(this.#autoSyncT);
    this.#autoSyncT = setTimeout(() => {
      if (!this.local.syncing) this.localSync();
    }, 8000);
  };

  // ── local storage folder (Presets/ library + Sync/ version mirror) ──
  #initLocal = async () => {
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
  /** Full device backup → the LOCAL version store, then mirror into the Sync/ folder when configured.
   *  Minutes on a full unit (the client override raises the request timeout accordingly). */
  fullDeviceBackup = async () => {
    if (this.local.syncing) return;
    this.showToast('Backing up the whole device — this can take a few minutes…', '#f5a623');
    try {
      const r = await forgefx.backupDevice();
      this.showToast(`Backed up ${r.count} presets`, '#33c46b');
      if (this.local.configured) void this.localSync(); // land the backup in the local folder immediately
    } catch (e) {
      this.showToast('Backup failed: ' + ((e as Error).message || ''), '#d6543f');
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
    if (!st || !Array.isArray(st)) {
      // no lightweight path (AM4: /preset/scene-state is 501) → full reload. load() only refreshes
      // grid+blocks, so the open block's per-channel params (incl. blockType — the Type row) must be
      // re-read here too, exactly like the lightweight path below does.
      await this.load();
      if (this.selKey) await this.#loadParams();
      return;
    }
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
  // ── device-event hooks (called by the telemetry slice, which owns the single event switch) ──
  /** Another UI moved a knob — reflect it live if that block is open (cheap: update the arc), and keep
   *  the on-grid block level indicator (meter fill) in sync too, since it reads from `meters`, which the
   *  open-block knob update doesn't touch. */
  #applyParamEcho = (effectId: number, paramId: number, norm: number) => {
    if (this.selected?.effectId === effectId) {
      const p = this.params.find((x) => x.id === paramId);
      if (p && p.norm !== norm) { p.norm = norm; this.params = [...this.params]; }
    }
    const m = this.meters[effectId];
    if (m) {
      const prev = m.vals[paramId];
      const value = prev ? paramValue({ norm, min: prev.min, max: prev.max, unit: prev.unit, log: prev.log }) : 0;
      m.vals = { ...m.vals, [paramId]: { ...(prev ?? { value: 0 }), norm, value } };
      this.meters = { ...this.meters, [effectId]: { ...m } };
    }
  };
  /** A structural change elsewhere (block placed/removed, preset switched, or a device-side edit the unit
   *  doesn't push — AM4 front-panel / AM4-Edit). Reload, debounced on the SHARED `#eventReload` timer so a
   *  burst coalesces into one refresh. Also re-read the open block's knobs: load() only refreshes the grid
   *  + blocks, so without this a front-panel knob turn on the open block would leave its arcs stale. */
  #scheduleStructuralReload = () => {
    if (this.#eventReload) clearTimeout(this.#eventReload);
    this.#eventReload = setTimeout(async () => {
      await this.load();
      if (this.selKey) await this.#loadParams();
    }, 250);
  };

  /** Apply a shared config doc pushed by another UI (host↔remote). Sets local state + the localStorage cache
   *  directly — never re-saves (which would re-broadcast and loop). */
  #applyConfig = (id: string, data: unknown) => {
    const cache = (k: string) => { try { localStorage.setItem(k, JSON.stringify(data)); } catch { /* */ } };
    if (id === 'swipe' && data && typeof data === 'object') { this.swipeControls = data as Record<string, SwipeCtrl[]>; cache('axis.swipe.v1'); }
    else if (id === 'layouts' && data && typeof data === 'object') { this.customLayouts = data as Record<string, TabDef[]>; cache('axis.layouts.v1'); }
    else if (id === 'savedFilters') cache('axs.pb.saved');
    else if (id === 'tags' || id === 'collections' || id === 'favs' || id === 'tagColors') library.applyRemoteConfig(id, data);
  };
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
      if (!legacyAm4) {
        const layout = this.layout;
        // The FM3 live grid returns defaults on a cold label cache. Fetch names only after the canvas
        // is ready, and discard a response from an earlier preset reload.
        void forgefx.sceneNames().then(({ names }) => {
          if (this.layout === layout) this.sceneNames = names;
        }).catch(() => {});
      }
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
    // A definitions walk/import owns the exclusive transport — interleaved preset reads during the
    // 3ms-paced query stream have frozen an FM3 (FORGEFX-32). Skip ticks until it finishes.
    if (deviceDefs.building || deviceDefs.importing) return;
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
    if (c.kind === 'shunt') {
      // shunts have no editor, but they are selectable so Backspace can remove them
      this.selKey = `${c.row},${c.col}`;
      this.editorOpen = false;
      return;
    }
    this.selKey = `${c.row},${c.col}`;
    this.editorOpen = true;
    this.editingTabs = false;
    this.activePage = '__ideal'; // blocks always open on the Ideal tab; Advanced is one click away
    // Devices with caps.paramsWithoutPack serve params for any placed block (AM4 slots read by
    // pidLow from the catalog) — don't gate the editor on a gen-3 `pack` there.
    if (!c.pack && !this.paramsWithoutPack) {
      this.sheetState = 'nopack';
      this.#paramsEid = null; // surface is blank now — the next real read must repaint from scratch
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

  #loadParams = async () => {
    const c = this.selected;
    if (!c || (!c.pack && !this.paramsWithoutPack)) return; // some devices serve params without a gen-3 pack
    // Blank the surface ONLY when nothing on screen belongs to this block. The loading state swaps the
    // BlockEditor out, which wipes its component
    // state — live search, open dropdowns, measured width, scroll position, active page.
    // The background refresh paths (#refreshScene, the SSE 'changed' debounce, the preset-watch tick)
    // re-read the block ALREADY open, so there they must update the values in place instead.
    if (this.#paramsEid !== c.effectId) {
      this.#paramsEid = null;
      this.sheetState = 'loading';
    }
    try {
      // API v2: the unified /preset/blocks/:addr/params serves every device (AM4 addr = pidLow).
      // Legacy v1 fallback: the AM4 reads via its own /am4/blocks route. Same BlockParams DTO either
      // way, so the rest of this method is model-agnostic.
      // Fetch the monitor table alongside the params (deduped after the first block open) so the very
      // first render already knows which paramIds are read-only monitors — otherwise they flash as
      // editable knobs before the table lands.
      const [r] = await Promise.all([
        !this.isV2 && this.isAm4 ? forgefx.am4BlockParams(c.effectId) : forgefx.blockParams(c.effectId),
        this.loadMonitorParams()
      ]);
      this.params = r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase()));
      this.enums = r.enums ?? [];
      this.blockType = r.type ?? null;
      this.blockSlug = r.slug ?? null;
      if (this.blockSlug !== 'looper') this.looperWave = null; // clear stale waveform when leaving the looper
      this.blockLayout = r.layout ?? null; // device-authentic pages drive the BlockEditor's pixel-exact canvas
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
      this.#paramsEid = c.effectId ?? null;
      this.sheetState = 'ready';
    } catch (e) {
      this.#paramsEid = null; // nothing trustworthy on screen — the next attempt blanks and re-reads
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

  /** Apply the exact saved-block data previewed in the library picker. The device writes are not safely undoable. */
  applyBlockLibrarySource = async (block: DecodedBlockFile): Promise<boolean> => {
    const c = this.selected;
    if (!c?.pack || block.slug.toLowerCase() !== c.pack.toLowerCase()) return false;
    try {
      await forgefx.applyBlockLibrarySource(c.effectId, block);
      history.checkpoint(`${block.name} applied to ${c.display}`, false);
      await this.#loadParams();
      await this.load();
      this.showToast(`${block.name} applied`, '#5fc46b');
      return true;
    } catch (e) {
      const message = e instanceof ForgeError ? e.message.replace(/^POST \/preset\/blocks\/\d+\/apply → \d+:?\s*/, '') : 'Block apply rejected by device';
      this.showToast(message || 'Block apply rejected by device', '#d6543f');
      if (e instanceof ForgeError) console.warn(e.message);
      return false;
    }
  };

  // ── cab IR picker ──
  /** Read a block's current cab/IR state. Routed through the store (not called on `forgefx` directly by
   *  components) so the editor surface owns it — an offline surface can override with a buffer read. */
  cabState = (eid: number) => forgefx.cabState(eid);
  openCabPicker = (slot = 0) => {
    if (!this.selected?.pack) return;
    this.cabPickerSlot = Math.max(0, slot);
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

  // ── external drop preview (Quick Build sidecar → grid) ──
  // Dumb setter: the writer (QuickBuild) computes validity from the layout. Coalesced so a steady
  // hover over one cell doesn't churn $state on every pointermove.
  setExternalDrop = (row: number, col: number, valid: boolean) => {
    const cur = this.externalDrop;
    if (!cur || cur.row !== row || cur.col !== col || cur.valid !== valid) this.externalDrop = { row, col, valid };
  };
  clearExternalDrop = () => {
    if (this.externalDrop) this.externalDrop = null;
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
    // Dropping onto an existing SHUNT replaces it in place, moving its cables onto the new block —
    // no manual shunt removal first (routes through replaceShunt for one undoable step).
    const existing = [...this.layout.cells, ...this.layout.shunts].find((c) => c.row === row && c.col === col);
    if (existing?.kind === 'shunt') {
      await this.replaceShunt(existing, { blockId, display });
      return;
    }
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
  /** Backspace: remove the hovered cell when the pointer is over one, else the selected cell. */
  removeHoveredOrSelected = async () => {
    if (this.virtual) return; // a virtual screen has no removable grid cell
    const h = gridHover.cell;
    const target =
      (h && [...this.layout.cells, ...this.layout.shunts].find((c) => c.row === h.row && c.col === h.col)) ??
      this.selected;
    if (!target || target.row < 0 || target.col < 0) return;
    const wasSelected = this.selected && this.selected.row === target.row && this.selected.col === target.col;
    if (wasSelected) this.closeEditor();
    await this.removeAt(target.row, target.col);
    this.showToast(target.kind === 'shunt' ? 'Shunt removed' : 'Block removed', target.kind === 'shunt' ? '#9a9aa3' : '#d6543f');
  };

  // Move a block to any empty cell. Same-column → re-cable (preserve wires). Cross-column →
  // plain clear+place; cables drop naturally if the path breaks (matches the device default).
  // Optimistic: relocate the cell in the UI immediately, reconcile in the background.
  move = async (src: Cell, row: number, col: number) => {
    if (src.row === row && src.col === col) return;
    // Dropping onto a SHUNT replaces it, moving the shunt's cables onto the block (see replaceShunt).
    const dest = [...this.layout.cells, ...this.layout.shunts].find((c) => c.row === row && c.col === col);
    if (dest?.kind === 'shunt') {
      await this.replaceShunt(dest, { blockId: src.effectId, display: src.display, src });
      return;
    }
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

  /** Routing/shunt cell base effect id (gen-3: 1024). SHUNT_ID is the legacy fallback. */
  get shuntBase(): number { return this.caps?.shuntBase ?? SHUNT_ID; }

  // Execute ONE routing op forward against the device (mirror of history's redo direction — so a
  // freshly-run op and its recorded undo/redo stay in lock-step). Only the structural kinds a
  // routing plan emits are handled here.
  #runOp = async (op: import('./history.svelte').HistoryOp) => {
    switch (op.kind) {
      case 'place': return void (await forgefx.placeCell(this.#W(op.row), this.#W(op.col), op.blockId));
      case 'remove': return void (await forgefx.clearCell(this.#W(op.row), this.#W(op.col)));
      case 'cable': return void (await forgefx.cable(this.#W(op.srcRow), this.#W(op.srcCol), this.#W(op.destRow), op.connect));
      default: return;
    }
  };

  // Connect src → (destRow,destCol), spanning any number of columns. Intermediate empty cells get
  // a shunt (a routing cell — eid ≥ shuntBase) so the signal can pass through; existing blocks on
  // the source row are CHAINED through (output→input); then we chain an adjacent-column cable for
  // each hop. The straight run flows along src.row; the final hop bends to destRow. Plan is pure
  // (gridRouting.planConnect) so the SignalGrid drag preview highlights the exact same path.
  connect = async (src: Cell, destRow: number, destCol: number) => {
    const plan = planConnect(this.layout.cells, this.layout.shunts, src, destRow, destCol, this.shuntBase);
    if (!plan.ok) {
      this.showToast(plan.error ?? 'Cannot connect', '#d6543f');
      return;
    }
    try {
      for (const op of plan.ops) await this.#runOp(op);
      history.recordComposite(plan.label, plan.ops);
      await this.load();
      this.showToast('Connected', '#35c9d6');
    } catch {
      this.load();
    }
  };

  // Replace a SHUNT with a block, preserving the shunt's cable topology (inputs/outputs move onto
  // the block). Shared by the add-block flow (place onto a shunt) and block-move-onto-shunt. One
  // composite step; plan is pure (gridRouting.planReplaceShunt) → same optimistic/undo path.
  replaceShunt = async (
    target: Cell,
    block: { blockId: number; display: string; src?: Cell },
  ) => {
    const plan = planReplaceShunt(this.layout.cells, this.layout.shunts, target, {
      blockId: block.blockId,
      display: block.display,
      src: block.src ? { row: block.src.row, col: block.src.col, effectId: block.src.effectId, display: block.src.display, fromRows: block.src.fromRows } : undefined
    });
    if (!plan.ok) {
      this.showToast(plan.error ?? 'Cannot place here', '#d6543f');
      return;
    }
    try {
      for (const op of plan.ops) await this.#runOp(op);
      history.recordComposite(plan.label, plan.ops);
      await this.load();
      this.showToast(block.src ? 'Moved' : `Placed ${block.display}`, '#35c9d6');
    } catch {
      this.load();
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

  // ── preset rename actions ──
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
      if (switched) await this.selectPreset(slot, { recency: false }); // load into edit buffer (switches device)
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
      if (switched && prevSlot >= 0) await this.selectPreset(prevSlot, { recency: false });
      else await this.poll();
      this.showToast(`Renamed & saved preset ${String(slot).padStart(3, '0')}`, '#33c46b');
      return true;
    } catch {
      if (switched && prevSlot >= 0) { try { await this.selectPreset(prevSlot, { recency: false }); } catch { /* */ } } // restore on failure too
      this.showToast('Rename failed', '#d6543f');
      return false;
    }
  };

  // ── preset nav ──
  /** Open the preset picker in "pick a slot" mode: `onPick` receives the chosen slot number + name and
   *  the picker closes WITHOUT loading the preset (used by the converter save dialog to reuse the real
   *  device-preset list as a slot chooser). */
  openSlotPicker = (onPick: (slot: number, name: string) => void) => {
    this.presetPick = onPick;
    this.presetOpen = true;
  };
  /** `recency: false` marks an internal slot hop (the rename round-trip) that must not count as a user
   *  load — see renameStoredPreset. Optional so every existing single-arg call site is unchanged. */
  selectPreset = async (n: number, opts?: { recency?: boolean }) => {
    if (!this.isV2 && this.isAm4) return this.loadAm4Preset(n, opts); // legacy v1 fallback: AM4's own codec route
    try {
      await forgefx.selectPreset(n); // API v2: unified for every device (AM4 number = stored location)
      this.lastPreset = n;
      if (opts?.recency !== false) presetRecency.record(`dev:${n}`);
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
  loadAm4Preset = async (location: number, opts?: { recency?: boolean }) => {
    try {
      await forgefx.am4SwitchPreset(location);
      if (opts?.recency !== false) presetRecency.record(`dev:${location}`);
      this.presetOpen = false;
      await this.load();
      if (this.selKey) await this.#loadParams();
    } catch {
      this.showToast('Load failed', '#d6543f');
    }
  };

  // ── save (DESTRUCTIVE: overwrites a preset slot) ──
  get saveOpen() { return overlays.isOpen('save'); }
  set saveOpen(v: boolean) { if (v) overlays.open('save'); else overlays.close('save'); }
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
}

export const editor = new EditorStore();
export { baseName, packFor };

// Compile-time guard: the live singleton MUST satisfy the data-source seam consumed by the
// editor-backed grid components (SignalGrid / GridMap / BlockEditor / EQGraph /
// CabPicker). If this stops typechecking, reconcile EditorSurface to the singleton's real signatures
// (the interface is a subset the singleton satisfies) — never the reverse.
export const _editorSatisfiesSurface: EditorSurface = editor;
