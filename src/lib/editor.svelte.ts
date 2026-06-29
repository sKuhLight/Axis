// Central editor state + device actions for Axis. A single runes-based store the
// rail / top bar / grid / editor / palette all read and drive. Wraps the ForgeFX
// HTTP client and preserves the live-verified write wiring (place, re-cabling move,
// cables, params, bypass, channel, retype).
import { forgefx, ForgeError } from './forgefx';
import { layoutFromGrid, type Cell, type Layout } from './grid';
import { baseName, packFor, statusColor } from './blocks';
import { resolveTabs, loadLayouts, saveLayouts, newTabId, loadSwipe, saveSwipe, type SwipeCtrl } from './layouts';
import { paramValue } from './format';
import type { NamedParam, EnumParam, TabDef, ResolvedTab, MeterVal, DetectResult, ConnPick, ConnInfo } from './types';

export type ViewMode = 'basic' | 'advanced';
type Conn = { state: 'connecting' | 'online' | 'offline'; fw?: string; device?: string };
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
  update = $state<{ version: string; url: string } | null>(null); // newer release available (top-bar pill)
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
    this.#checkUpdate();
    this.#openEvents();
    // auto-detect the attached unit and warn if it isn't a model we have a live codec for
    forgefx
      .detect()
      .then((d) => {
        this.detected = d;
        if (d.connected && !d.supported) this.showToast(`${d.name} detected — not yet supported (FM3 only for now)`, '#d6543f');
      })
      .catch(() => {});
    try {
      const n = (await forgefx.currentPreset()).number;
      if (n >= 0) this.lastPreset = n;
    } catch {
      /* */
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

  // live tuner/tempo/scene/cpu pushes from the device
  #openEvents = () => {
    if (this.#events) return;
    try {
      this.#events = forgefx.events((e) => {
        if (e.type === 'tempo') this.bpm = e.bpm;
        else if (e.type === 'scene') this.scene = e.index + 1;
        else if (e.type === 'tuner') this.tuner = { ...this.tuner, freq: e.freq, note: e.note, cents: e.cents, octave: e.octave };
      });
    } catch {
      /* SSE unsupported / offline — telemetry stays at last-known */
    }
  };
  // pull current scene + tempo once at load (device → UI)
  #syncTelemetry = async () => {
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
      const t0 = performance.now();
      const p = await forgefx.currentPreset().catch(() => null);
      this.linkMs = Math.round(performance.now() - t0); // serial round-trip latency
      if (p && p.number >= 0) this.preset = p;
    } catch {
      this.conn = { state: 'offline' };
    } finally {
      this.#polling = false;
    }
  };

  load = async () => {
    if (!this.everLoaded) this.status = 'loading';
    try {
      const [grid, blocks] = await Promise.all([forgefx.grid(), forgefx.presetBlocks().catch(() => [])]);
      this.layout = layoutFromGrid(grid, blocks);
      this.everLoaded = true;
      this.status = 'ready';
      this.fetchMeters(); // background: fill every block's level meter
    } catch {
      if (!this.everLoaded) this.status = 'offline';
    }
  };

  #watching = false;
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
      } else if (this.status === 'offline') {
        await this.load();
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
    const at = (r: number, c: number) => [...this.layout.cells, ...this.layout.shunts].find((x) => x.row === r && x.col === c);
    try {
      // ensure a carrier cell exists in every intermediate column (along src.row)
      for (let c = src.col + 1; c < destCol; c++) {
        const cell = at(src.row, c);
        if (!cell) await forgefx.placeCell(this.#W(src.row), this.#W(c), SHUNT_ID);
        else if (cell.kind === 'block') {
          this.showToast('Clear the cells in between to route through', '#d6543f');
          return;
        }
      }
      // ensure the destination exists (shunt if dropped on an empty cell)
      if (!at(destRow, destCol)) await forgefx.placeCell(this.#W(destRow), this.#W(destCol), SHUNT_ID);
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
