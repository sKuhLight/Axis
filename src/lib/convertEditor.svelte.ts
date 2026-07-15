// OFFLINE editor surface for the cross-device preset converter (P4b · META-24 · AXIS-48).
//
// A drop-in `EditorSurface` (see editorSurface.ts) that drives the REAL SignalGrid / BlockEditor /
// ControlSurface from the pure `convertScratch` buffer with ZERO device I/O. A later milestone sets
// this singleton into Svelte context so those components render + edit a converted preset exactly as
// they render a live device — every mutator reroutes to `convertScratch` (never `forgefx`), and every
// device-only concern (meters, monitors, cab, telemetry, cursor-mirror) degrades to a safe stub.
//
// Reactivity rule: everything that must re-render on an edit is a GETTER over `convertScratch.state`
// (the store swaps the whole snapshot per transition), so `layout` / `selected` recompute for free.
// Only `params` / `enums` are snapshotted on `openCell` (mirroring the live store's #loadParams) — the
// open block's knobs mutate their NamedParam in place for live tracking and persist into the buffer.

import { convertScratch } from './convertScratch.svelte';
import { scratchToLayout, keyAt, EMPTY_LAYOUT } from './convertScratchAdapter';
import { gridLayoutFromScratch, effectKeyMap, isGridTarget, keyForGridCell } from './convertGridAdapter';
import { connectOnLayout, disconnectOnLayout, moveOnLayout, removeAtOnLayout, bypassOnLayout } from './convertGridEdit';
import { applyGridEditsToState } from './convertGridSerialize';
import { paramValue } from './format';
import { buildParams, buildEnums } from './convertParams';
import type { Cell, Layout } from './grid';
import type { EditorSurface } from './editorSurface';
import type { NamedParam, EnumParam, DetectResult, DeviceLayout, LiveMonitor, CabState } from './types';
import type { SwipeCtrl } from './layouts';

const SHUNT_BASE = 1024; // gen-3 routing/shunt base effect id (matches editor.svelte.ts SHUNT_ID)
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

class ConvertEditor {
  constructor() {
    // Grid-target commit hook: fold the in-memory routing/position edits back into the committed state so
    // Save-to-library / Apply-to-device reflect them (slot/chain targets pass through unchanged).
    convertScratch.commitStateFor = (s) => {
      if (!isGridTarget(s)) return s;
      const layout = this.#gridLayout ?? gridLayoutFromScratch(s);
      const map = this.#effectMap.size ? this.#effectMap : effectKeyMap(s);
      return applyGridEditsToState(s, layout, map);
    };
  }

  // ── offline grid-target editing state (gen-3 targets only) ──
  // Grid targets render the FULL converted grid (all blocks + shunts + cables) from `routing.gridCells`,
  // held as an EDITABLE Layout seeded once per conversion. Slot/chain targets (AM4/VP4) keep the tray-fill
  // `scratchToLayout` path untouched.
  #gridLayout = $state<Layout | null>(null);
  #effectMap = new Map<number, string>(); // cell effectId → ScratchBlock key (stable across moves)
  #seededEpoch = -1;

  get #isGrid(): boolean {
    return isGridTarget(convertScratch.state);
  }
  /** (Re)seed the editable grid Layout when a NEW conversion has been seeded. Idempotent + epoch-guarded
   *  so it is safe to call from a panel `$effect` (runs outside render → free to mutate `$state`). */
  syncGrid = (): void => {
    const ep = convertScratch.seedEpoch;
    if (this.#seededEpoch === ep) return;
    const s = convertScratch.state;
    if (s && isGridTarget(s)) {
      this.#gridLayout = gridLayoutFromScratch(s);
      this.#effectMap = effectKeyMap(s);
    } else {
      this.#gridLayout = null;
      this.#effectMap = new Map();
    }
    this.#seededEpoch = ep;
  };
  /** The live editable grid Layout in an event handler, building + persisting it on first touch. */
  #ensureGrid(): Layout | null {
    const s = convertScratch.state;
    if (!s || !isGridTarget(s)) return null;
    if (!this.#gridLayout || this.#seededEpoch !== convertScratch.seedEpoch) {
      this.#gridLayout = gridLayoutFromScratch(s);
      this.#effectMap = effectKeyMap(s);
      this.#seededEpoch = convertScratch.seedEpoch;
    }
    return this.#gridLayout;
  }

  // ── grid reads (getters over the live scratch snapshot) ──
  get layout(): Layout {
    const s = convertScratch.state;
    if (!s) return EMPTY_LAYOUT;
    if (!isGridTarget(s)) return scratchToLayout(s);
    // Prefer the seeded editable layout; on a fresh conversion frame (epoch not yet synced) build a
    // read-only one from the routing cells — never WRITE state here (this runs inside render).
    if (this.#gridLayout && this.#seededEpoch === convertScratch.seedEpoch) return this.#gridLayout;
    return gridLayoutFromScratch(s);
  }
  get status(): 'loading' | 'ready' | 'offline' {
    return 'ready';
  }
  get shuntBase(): number {
    return SHUNT_BASE;
  }
  // Grid targets support full in-memory cabling (connect/disconnect/move over the editable Layout using
  // the live routing planners). Slot/chain targets have no 2-D routing → stays false there.
  get canGridRoute(): boolean {
    return this.#isGrid;
  }

  // ── selection / editor state ──
  selKey = $state<string | null>(null);
  editorOpen = $state(false);
  editorH = $state(380);
  sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('ready');
  blockType = $state<{ value: number; name: string } | null>(null);
  linkFrom = $state<Cell | null>(null);
  paletteMode = $state<'place' | 'retype'>('place');
  paletteOpen = $state(false);
  placeTarget = $state<{ row: number; col: number } | null>(null);
  cabPickerOpen = $state(false);
  params = $state<NamedParam[]>([]);
  enums = $state<EnumParam[]>([]);

  get blockLayout(): DeviceLayout | null {
    return null;
  }
  get selected(): Cell | null {
    if (!this.selKey) return null;
    const l = this.layout;
    return [...l.cells, ...l.shunts].find((c) => `${c.row},${c.col}` === this.selKey) ?? null;
  }

  // ── responsive / mobile grid (plain local state, like the live store) ──
  vw = $state(1280);
  vh = $state(800);
  mobCols = $state(4);
  gridPage = $state(0);
  get isMobile(): boolean {
    return this.vw < 1366;
  }
  get pageCount(): number {
    return Math.ceil(12 / Math.max(3, Math.min(12, this.mobCols)));
  }
  changeCols = (d: number) => {
    this.mobCols = clamp(this.mobCols + d, 3, 12);
    this.gridPage = Math.min(this.gridPage, this.pageCount - 1);
  };
  setCols = (n: number) => {
    this.mobCols = clamp(n, 3, 12);
    this.gridPage = Math.min(this.gridPage, this.pageCount - 1);
  };
  colsFit = () => {
    this.mobCols = this.mobCols >= 12 ? 4 : 12;
    this.gridPage = 0;
  };
  changePage = (d: number) => {
    this.gridPage = clamp(this.gridPage + d, 0, this.pageCount - 1);
  };
  setPage = (p: number) => {
    this.gridPage = clamp(p, 0, this.pageCount - 1);
  };

  // ── hints / toasts (real, over local state — placement feedback works) ──
  hint = $state<string | null>(null);
  toast = $state<{ text: string; accent: string } | null>(null);
  #toastT: ReturnType<typeof setTimeout> | null = null;
  setHint = (text: string) => {
    this.hint = text;
  };
  clearHint = () => {
    this.hint = null;
  };
  showToast = (text: string, accent = '#33c46b') => {
    this.toast = { text, accent };
    if (this.#toastT) clearTimeout(this.#toastT);
    this.#toastT = setTimeout(() => {
      this.toast = null;
    }, 2600);
  };

  // ── helpers ──
  // Grid targets address a ScratchBlock by the cell's STABLE effectId (survives in-memory moves); slot
  // targets look it up by the cell's current coordinate (positions live in the scratch buffer there).
  #keyForCell(cell: Cell): string | null {
    if (this.#isGrid) return keyForGridCell(this.#effectMap, cell);
    const s = convertScratch.state;
    return s ? keyAt(s, cell.row, cell.col) : null;
  }
  #cellAt(row: number, col: number): Cell | null {
    const l = this.layout;
    return [...l.cells, ...l.shunts].find((c) => c.row === row && c.col === col) ?? null;
  }
  /** PUBLIC: the ScratchBlock key at a displayed grid cell (grid targets address by the stable effectId,
   *  slot targets by the coordinate). The convert grid panel uses this to attach per-cell conflict
   *  decorations without reaching into the private #effectMap. */
  blockKeyAt = (row: number, col: number): string | null => {
    const cell = this.#cellAt(row, col);
    return cell ? this.#keyForCell(cell) : null;
  };

  // ── source→target drag drop-preview (Phase 2) ──
  // The cell a SOURCE-grid drag is currently over + whether the drop is valid. The source panel sets it
  // during the drag (setExternalDrop) and clears it on drop/cancel; the grid panel feeds it straight to
  // SignalGrid's `externalDropPreview` prop so the target grid shows the same ＋/✕ preview a native move
  // does. Null while nothing is being dragged from the source grid.
  externalDrop = $state<{ row: number; col: number; valid: boolean } | null>(null);
  /** Set the drop-preview for a source block hovering (row,col). Validity mirrors what a real drop would
   *  do: grid targets accept an empty cell, a shunt (replaced), or the block's own cell; slot/chain
   *  targets defer to convertScratch.canPlaceAt. */
  setExternalDrop = (sourceKey: string, row: number, col: number): void => {
    let valid: boolean;
    if (this.#isGrid) {
      const occ = this.#cellAt(row, col);
      valid = !occ || occ.kind === 'shunt' || this.#keyForCell(occ) === sourceKey;
    } else {
      valid = convertScratch.canPlaceAt(row, col, sourceKey);
    }
    const cur = this.externalDrop;
    if (!cur || cur.row !== row || cur.col !== col || cur.valid !== valid) this.externalDrop = { row, col, valid };
  };
  clearExternalDrop = (): void => {
    if (this.externalDrop) this.externalDrop = null;
  };
  #selectedKey(): string | null {
    if (!this.selKey) return null;
    const [r, c] = this.selKey.split(',').map(Number);
    if (this.#isGrid) {
      const cell = this.#cellAt(r, c);
      return cell ? keyForGridCell(this.#effectMap, cell) : null;
    }
    const s = convertScratch.state;
    return s ? keyAt(s, r, c) : null;
  }

  // ── editor actions ──
  load = async (): Promise<void> => {
    /* offline — nothing to fetch */
  };
  openCell = async (c: Cell): Promise<void> => {
    const s = convertScratch.state;
    if (!s) return;
    const key = this.#keyForCell(c);
    this.selKey = `${c.row},${c.col}`;
    this.editorOpen = true;
    this.sheetState = 'ready';
    convertScratch.focusKey = key;
    const block = key ? s.blocks.find((b) => b.key === key) : undefined;
    this.blockType = block ? { value: block.typeValue ?? 0, name: block.typeName ?? '' } : null;
    this.params = block ? buildParams(block.params) : [];
    // Dropdowns render when the converter attached ordered enum-option labels (offline param catalog).
    this.enums = block ? buildEnums(block.params) : [];
  };
  closeEditor = () => {
    this.editorOpen = false;
  };

  // ── grid mutators (in-memory for grid targets; convertScratch for slot/chain; NO forgefx, NO load) ──
  move = async (src: Cell, row: number, col: number): Promise<void> => {
    if (this.#isGrid) {
      const layout = this.#ensureGrid();
      if (!layout) return;
      const r = moveOnLayout(layout, src, row, col, this.shuntBase);
      if (!r.ok) {
        this.showToast(r.error ?? 'Cannot move here', '#d6543f');
        return;
      }
      this.#gridLayout = r.layout;
      this.selKey = `${row},${col}`;
      this.showToast('Moved', '#35c9d6');
      return;
    }
    const key = this.#keyForCell(src);
    if (key) convertScratch.move(key, row, col);
  };

  /** Place/move the TARGET equivalent of a SOURCE block onto (row,col) — the source-grid drag drop.
   *  Best-effort + honest: toasts on the cases that can't apply (no equivalent / off-grid). The source
   *  block and its converted equivalent share the same `key` in `convertScratch.blocks`. */
  placeSourceBlock = (sourceKey: string, row: number, col: number): void => {
    const equiv = convertScratch.blocks.find((b) => b.key === sourceKey);
    if (!equiv) {
      this.showToast('No target equivalent for this block', '#f5a623');
      return;
    }
    if (this.#isGrid) {
      // GRID target: move the equivalent's existing cell (reuses move() → moveOnLayout + its toasts).
      const layout = this.#ensureGrid();
      if (!layout) return;
      const cell = layout.cells.find((c) => keyForGridCell(this.#effectMap, c) === sourceKey);
      if (!cell) {
        this.showToast('That block is not on the target grid', '#f5a623');
        return;
      }
      void this.move(cell, row, col);
      return;
    }
    // SLOT/CHAIN target: arm+place from the tray, or move a placed block.
    if (convertScratch.tray.some((b) => b.key === sourceKey)) {
      convertScratch.arm(sourceKey);
      const ok = convertScratch.placeArmed(row, col);
      this.showToast(ok ? 'Placed' : 'Cannot place here', ok ? '#33c46b' : '#d6543f');
    } else {
      convertScratch.move(sourceKey, row, col);
      this.showToast('Moved', '#35c9d6');
    }
  };
  removeAt = async (row: number, col: number): Promise<void> => {
    if (this.#isGrid) {
      const layout = this.#ensureGrid();
      if (!layout) return;
      const cell = this.#cellAt(row, col);
      const key = cell ? keyForGridCell(this.#effectMap, cell) : null;
      this.#gridLayout = removeAtOnLayout(layout, row, col);
      if (key) convertScratch.discard(key); // drop the block from the commit + clear its conflicts
      return;
    }
    const s = convertScratch.state;
    const key = s ? keyAt(s, row, col) : null;
    if (key) convertScratch.unplace(key);
  };
  removeSelected = async (): Promise<void> => {
    const key = this.#selectedKey();
    if (key) convertScratch.discard(key);
  };
  openPaletteAt = (row: number, col: number) => {
    if (convertScratch.placingKey) convertScratch.placeArmed(row, col);
  };
  openRetype = () => {
    this.paletteMode = 'retype';
  };
  openCabPicker = () => {
    /* cab editing disabled offline */
  };
  applyCab = async (_writes: { paramId: number; value: number }[]): Promise<void> => {
    /* cab editing disabled offline */
  };
  toggleBypass = async (cell?: Cell): Promise<void> => {
    if (this.#isGrid) {
      const layout = this.#ensureGrid();
      if (!layout) return;
      const target = cell ?? (this.selKey ? this.#cellAt(...(this.selKey.split(',').map(Number) as [number, number])) : null);
      if (target && target.kind === 'block') this.#gridLayout = bypassOnLayout(layout, target.row, target.col);
      return;
    }
    const key = cell ? this.#keyForCell(cell) : this.#selectedKey();
    if (key) convertScratch.bypass(key);
  };
  setChannel = async (_ch: string): Promise<void> => {
    /* channel switching not modeled offline */
  };

  // ── cables (in-memory for grid targets; gated for slot/chain — see canGridRoute) ──
  armLink = (c: Cell) => {
    this.linkFrom = this.linkFrom && this.linkFrom.row === c.row && this.linkFrom.col === c.col ? null : c;
  };
  cancelLink = () => {
    this.linkFrom = null;
  };
  connect = async (src: Cell, destRow: number, destCol: number): Promise<void> => {
    if (!this.#isGrid) {
      this.showToast('Cable editing coming soon', '#f5a623');
      return;
    }
    const layout = this.#ensureGrid();
    if (!layout) return;
    const r = connectOnLayout(layout, src, destRow, destCol, this.shuntBase);
    if (!r.ok) {
      this.showToast(r.error ?? 'Cannot connect', '#d6543f');
      return;
    }
    this.#gridLayout = r.layout;
    this.showToast('Connected', '#35c9d6');
  };
  completeLink = async (row: number, col: number): Promise<void> => {
    const src = this.linkFrom;
    if (!src) return;
    if (row === src.row && col === src.col) {
      this.linkFrom = null; // tapped the armed cell again → cancel
      return;
    }
    if (!this.#isGrid) {
      this.linkFrom = null;
      this.showToast('Cable editing coming soon', '#f5a623');
      return;
    }
    if (col <= src.col) {
      this.showToast('Connect to a later column', '#d6543f'); // stay armed — pick a valid destination
      return;
    }
    this.linkFrom = null;
    await this.connect(src, row, col);
  };
  disconnect = async (srcRow: number, srcCol: number, destRow: number): Promise<void> => {
    if (!this.#isGrid) {
      this.showToast('Cable editing coming soon', '#f5a623');
      return;
    }
    const layout = this.#ensureGrid();
    if (!layout) return;
    this.#gridLayout = disconnectOnLayout(layout, srcRow, srcCol, destRow, this.shuntBase);
    this.showToast('Connection removed', '#9a9aa3');
  };

  // ── block / param writes → convertScratch (offline) ──
  setParam = (p: NamedParam, v: number) => {
    p.norm = v; // in-place → the open block's knob tracks live (params is a $state array)
    const key = convertScratch.focusKey;
    if (!key || p.id == null) return;
    const stored =
      p.min != null && p.max != null
        ? paramValue({ norm: v, value: p.value, min: p.min, max: p.max, unit: p.unit, log: p.log })
        : v;
    p.value = stored;
    convertScratch.setParam(key, p.id, stored);
  };
  setEnum = (e: EnumParam, value: number) => {
    e.value = value;
    const key = convertScratch.focusKey;
    if (key) convertScratch.setParam(key, e.id, value);
  };
  cabState = async (_eid: number): Promise<CabState> => null as unknown as CabState;

  // ── device-only concerns — safe stubs (components already degrade) ──
  get levels(): { out1L: number; out1R: number; out2L: number; out2R: number } | null {
    return null;
  }
  get looperWave(): { wave: number[]; position: number | null; level: number | null } | null {
    return null;
  }
  looperControl = async (_action: string, _on: boolean): Promise<void> => {};
  typeNameFor = (_effectId: number): string => '';
  monitorFor = (_effectId: number): LiveMonitor | null => null;
  monitorsFor = (_effectId: number): LiveMonitor[] => [];
  controlsFor = (_cell: Cell): SwipeCtrl[] => [];
  meterFor = (
    _cell: Cell
  ): {
    norm: number;
    value: number;
    unit?: string;
    min?: number;
    max?: number;
    log?: boolean;
    count: number;
    active: number;
    name: string;
  } | null => null;
  cycleControl = (_cell: Cell, _dir: number) => {};
  adjustSwipe = (_cell: Cell, _deltaNorm: number) => {};
  isSwipeControl = (_paramId: number): boolean => false;
  toggleSwipeControl = (_p: NamedParam) => {};

  // ── device-mirror — no device attached offline ──
  get detected(): DetectResult | null {
    return null;
  }
  selectCellOnDevice = (_row: number, _col: number) => {};
}

// The explicit annotation forces full compile-time conformance to EditorSurface; `syncGrid` and
// `placeSourceBlock` are the convert-only extras (the grid panel's `$effect` (re)seeds the editable
// Layout; the source panel's drag drop places a source block's converted equivalent on the target grid).
export const convertEditor: EditorSurface & {
  syncGrid: () => void;
  placeSourceBlock: (sourceKey: string, row: number, col: number) => void;
  blockKeyAt: (row: number, col: number) => string | null;
  externalDrop: { row: number; col: number; valid: boolean } | null;
  setExternalDrop: (sourceKey: string, row: number, col: number) => void;
  clearExternalDrop: () => void;
} = new ConvertEditor();
