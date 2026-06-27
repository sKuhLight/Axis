// Central editor state + device actions for Axis. A single runes-based store the
// rail / top bar / grid / editor / palette all read and drive. Wraps the ForgeFX
// HTTP client and preserves the live-verified write wiring (place, re-cabling move,
// cables, params, bypass, channel, retype).
import { forgefx, ForgeError } from './forgefx';
import { layoutFromGrid, type Cell, type Layout } from './grid';
import { baseName, packFor, statusColor } from './blocks';
import type { NamedParam } from './types';

export type ViewMode = 'basic' | 'advanced';
type Conn = { state: 'connecting' | 'online' | 'offline'; fw?: string; device?: string };
const EMPTY: Layout = { cells: [], shunts: [], rows: 4, cols: 12, name: '', model: '', crcValid: true };
const SHUNT_ID = 1024; // FM3 routing/shunt cell base effect id (decoder: eid > 1000)

class EditorStore {
  // ── connection / preset ──
  conn = $state<Conn>({ state: 'connecting' });
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
  sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('loading');

  // ── view + chrome ──
  globalMode = $state<ViewMode>('basic');
  blockModes = $state<Record<string, ViewMode>>({});
  activePage = $state<string>('');
  scene = $state(1);
  railActive = $state('build');
  bpm = $state(120);
  presetCount = $state(512); // FM3 preset slots
  vw = $state(1280);
  vh = $state(800);

  // ── overlays ──
  paletteOpen = $state(false);
  paletteMode = $state<'place' | 'retype'>('place');
  placeTarget = $state<{ row: number; col: number } | null>(null);
  presetOpen = $state(false);
  toast = $state<{ text: string; accent: string } | null>(null);

  #toastT: ReturnType<typeof setTimeout> | null = null;
  #sendTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  // ── derived ──
  get isMobile() {
    return this.vw < 760;
  }
  get selected(): Cell | null {
    if (!this.selKey) return null;
    return [...this.layout.cells, ...this.layout.shunts].find((c) => `${c.row},${c.col}` === this.selKey) ?? null;
  }
  get effMode(): ViewMode {
    if (this.selKey && this.blockModes[this.selKey]) return this.blockModes[this.selKey];
    return this.globalMode;
  }
  get overriding(): boolean {
    return !!(this.selKey && this.blockModes[this.selKey] && this.blockModes[this.selKey] !== this.globalMode);
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

  // ── lifecycle ──
  init = async () => {
    try {
      const n = (await forgefx.currentPreset()).number;
      if (n >= 0) this.lastPreset = n;
    } catch {
      /* */
    }
    await this.load();
  };

  poll = async () => {
    try {
      const h = await forgefx.health();
      const dev = await forgefx.device().catch(() => null);
      this.conn = { state: 'online', fw: dev?.firmware?.version, device: h.device };
      const p = await forgefx.currentPreset().catch(() => null);
      if (p && p.number >= 0) this.preset = p;
    } catch {
      this.conn = { state: 'offline' };
    }
  };

  load = async () => {
    if (!this.everLoaded) this.status = 'loading';
    try {
      const [grid, blocks] = await Promise.all([forgefx.grid(), forgefx.presetBlocks().catch(() => [])]);
      this.layout = layoutFromGrid(grid, blocks);
      this.everLoaded = true;
      this.status = 'ready';
    } catch {
      if (!this.everLoaded) this.status = 'offline';
    }
  };

  watchPreset = async () => {
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
    this.activePage = this.#defaultPage(c);
    if (!c.pack) {
      this.sheetState = 'nopack';
      this.params = [];
      return;
    }
    await this.#loadParams();
  };
  closeEditor = () => {
    this.editorOpen = false;
  };
  #defaultPage = (c: Cell) => {
    if (c.pack === 'Amp') return this.effMode === 'basic' ? 'Ideal' : 'Tone';
    return 'Controls';
  };

  #loadParams = async () => {
    const c = this.selected;
    if (!c?.pack) return;
    this.sheetState = 'loading';
    try {
      const r = await forgefx.blockParams(this.slugOf(c));
      this.params = r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase()));
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
    const slug = this.slugOf(c);
    clearTimeout(this.#sendTimers[p.name]);
    this.#sendTimers[p.name] = setTimeout(() => forgefx.setParam(slug, p.name, v).catch(() => {}), 60);
  };
  toggleBypass = async (cell?: Cell) => {
    const c = cell ?? this.selected;
    if (!c?.pack) return;
    const next = !(c.bypassed ?? false);
    c.bypassed = next;
    try {
      await forgefx.setBypass(this.slugOf(c), next);
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
      await forgefx.setChannel(this.slugOf(c), ch);
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
      await forgefx.setParam(this.slugOf(c), 'Type', value, false);
      await this.#loadParams();
      await this.load();
      this.showToast('Type changed', '#35c9d6');
    } catch (e) {
      this.showToast('Type change rejected by device', '#d6543f');
      if (e instanceof ForgeError) console.warn(e.message);
    }
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
    // optimistic relocate
    const relocate = (c: Cell): Cell => (c === src ? { ...c, row, col } : c);
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
  setGlobalMode = (m: ViewMode) => {
    this.globalMode = m;
    this.blockModes = {};
    const c = this.selected;
    if (c) this.activePage = this.#defaultPage(c);
    this.showToast(m === 'basic' ? 'All blocks → Basic view' : 'All blocks → Advanced view', '#35c9d6');
  };
  setBlockMode = (m: ViewMode) => {
    if (!this.selKey) return;
    this.blockModes = { ...this.blockModes, [this.selKey]: m };
    const c = this.selected;
    if (c) this.activePage = this.#defaultPage(c);
  };
  resetBlockMode = () => {
    if (!this.selKey) return;
    const bm = { ...this.blockModes };
    delete bm[this.selKey];
    this.blockModes = bm;
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
