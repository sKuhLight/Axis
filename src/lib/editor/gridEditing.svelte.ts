// Decoded grid state and structural editing. The parameter slice is a sibling, so every crossing
// goes through GridEditingHost and EditorStore rather than importing another slice.
import { forgefx } from '$lib/api/forgefx';
import { layoutFromGrid, type Cell, type Layout } from '$lib/device/grid';
import { planConnect, planReplaceShunt } from '$lib/device/gridRouting';
import { packFor, statusColor } from '$lib/device/blocks';
import { gridHover } from './gridHover.svelte';
import { history, type HistoryOp } from './history.svelte';

const EMPTY: Layout = { cells: [], shunts: [], rows: 4, cols: 12, name: '', model: '', crcValid: true };
const SHUNT_ID = 1024;

export interface GridEditingHost {
  readonly legacyAm4: boolean;
  readonly capabilityShuntBase: number | undefined;
  readonly selected: Cell | null;
  readonly virtualActive: boolean;
  closeEditor: () => void;
  setSelectionKey: (key: string | null) => void;
  setSceneNames: (names: string[]) => void;
  onGridLoaded: () => void;
  startLiveMeters: () => void;
  showToast: (text: string, accent?: string) => void;
  offerLoadFailure: (route: string, message: string | undefined) => void;
}

export class GridEditingStore {
  #host: GridEditingHost;
  constructor(host: GridEditingHost) { this.#host = host; }

  status = $state<'loading' | 'ready' | 'offline'>('loading');
  layout = $state<Layout>(EMPTY);
  everLoaded = $state(false);
  mobCols = $state(4);
  mobColsAuto = $state(true);
  gridPage = $state(0);
  externalDrop = $state<{ row: number; col: number; valid: boolean } | null>(null);
  linkFrom = $state<Cell | null>(null);

  #W = (n: number) => n + 1;
  fitCols = (w: number) => Math.max(3, Math.min(12, Math.round((w - 24) / 96)));
  get pageCount() { return Math.ceil(12 / Math.max(3, Math.min(12, this.mobCols))); }
  get firstEmptyCell(): { row: number; col: number } | null {
    const filled = new Set([...this.layout.cells, ...this.layout.shunts].map((c) => `${c.row},${c.col}`));
    for (let col = 0; col < this.layout.cols; col++)
      for (let row = 0; row < this.layout.rows; row++) if (!filled.has(`${row},${col}`)) return { row, col };
    return null;
  }
  get shuntBase(): number { return this.#host.capabilityShuntBase ?? SHUNT_ID; }

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
    this.mobCols = this.mobCols >= 12 ? 4 : 12;
    this.gridPage = 0;
    this.#host.showToast(this.mobCols >= 12 ? 'Overview' : 'Edit view', '#35c9d6');
  };
  changePage = (d: number) => { this.gridPage = Math.max(0, Math.min(this.pageCount - 1, this.gridPage + d)); };
  setPage = (p: number) => { this.gridPage = Math.max(0, Math.min(this.pageCount - 1, p)); };
  applyViewportWidth = (w: number) => { if (this.mobColsAuto) this.mobCols = this.fitCols(w); };

  load = async () => {
    if (!this.everLoaded) this.status = 'loading';
    const legacyAm4 = this.#host.legacyAm4;
    try {
      const [grid, blocks] = legacyAm4
        ? [await forgefx.am4Grid(), []]
        : await Promise.all([forgefx.grid(), forgefx.presetBlocks().catch(() => [])]);
      this.layout = layoutFromGrid(grid, blocks);
      if (this.linkFrom) {
        const lf = this.linkFrom;
        const still = [...this.layout.cells, ...this.layout.shunts].some((c) => c.row === lf.row && c.col === lf.col && c.effectId === lf.effectId);
        if (!still) this.linkFrom = null;
      }
      this.#host.setSceneNames(grid.scenes ?? []);
      this.everLoaded = true;
      this.status = 'ready';
      if (!legacyAm4) {
        const layout = this.layout;
        void forgefx.sceneNames().then(({ names }) => {
          if (this.layout === layout) this.#host.setSceneNames(names);
        }).catch(() => {});
      }
      this.#host.onGridLoaded();
      this.#host.startLiveMeters();
    } catch (e) {
      if (!this.everLoaded) this.status = 'offline';
      else this.#host.offerLoadFailure(legacyAm4 ? '/am4/grid' : '/preset/grid', (e as Error)?.message?.slice(0, 200));
    }
  };

  applySceneState = (rows: { effectId: number; bypassed?: boolean | null; channel?: string | null }[]) => {
    const byId = new Map(rows.map((b) => [b.effectId, b]));
    const apply = (c: Cell): Cell => {
      const s = byId.get(c.effectId);
      return s ? { ...c, bypassed: s.bypassed ?? undefined, channel: s.channel ?? undefined } : c;
    };
    this.layout = { ...this.layout, cells: this.layout.cells.map(apply), shunts: this.layout.shunts.map(apply) };
  };

  setExternalDrop = (row: number, col: number, valid: boolean) => {
    const cur = this.externalDrop;
    if (!cur || cur.row !== row || cur.col !== col || cur.valid !== valid) this.externalDrop = { row, col, valid };
  };
  clearExternalDrop = () => { if (this.externalDrop) this.externalDrop = null; };

  place = async (row: number, col: number, blockId: number, label?: string) => {
    const display = label ?? '…';
    const existing = [...this.layout.cells, ...this.layout.shunts].find((c) => c.row === row && c.col === col);
    if (existing?.kind === 'shunt') {
      await this.replaceShunt(existing, { blockId, display });
      return;
    }
    const cell: Cell = { row, col, kind: 'block', effectId: blockId, display, pack: packFor(display), color: statusColor(display), fromRows: [] };
    this.layout = { ...this.layout, cells: [...this.layout.cells.filter((c) => !(c.row === row && c.col === col)), cell] };
    try {
      await forgefx.placeCell(this.#W(row), this.#W(col), blockId);
      history.record({ kind: 'place', row, col, blockId, display });
      this.load();
    } catch { this.load(); }
  };
  removeAt = async (row: number, col: number) => {
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
      this.load();
    } catch { this.load(); }
  };
  removeSelected = async () => {
    const c = this.#host.selected;
    if (!c) return;
    this.#host.closeEditor();
    await this.removeAt(c.row, c.col);
    this.#host.showToast('Block removed', '#d6543f');
  };
  removeHoveredOrSelected = async () => {
    if (this.#host.virtualActive) return;
    const h = gridHover.cell;
    const target = (h && [...this.layout.cells, ...this.layout.shunts].find((c) => c.row === h.row && c.col === h.col)) ?? this.#host.selected;
    if (!target || target.row < 0 || target.col < 0) return;
    const selected = this.#host.selected;
    if (selected && selected.row === target.row && selected.col === target.col) this.#host.closeEditor();
    await this.removeAt(target.row, target.col);
    this.#host.showToast(target.kind === 'shunt' ? 'Shunt removed' : 'Block removed', target.kind === 'shunt' ? '#9a9aa3' : '#d6543f');
  };

  move = async (src: Cell, row: number, col: number) => {
    if (src.row === row && src.col === col) return;
    const dest = [...this.layout.cells, ...this.layout.shunts].find((c) => c.row === row && c.col === col);
    if (dest?.kind === 'shunt') {
      await this.replaceShunt(dest, { blockId: src.effectId, display: src.display, src });
      return;
    }
    const sr = src.row, sc = src.col;
    const sameCol = col === sc;
    const incoming = src.fromRows.slice();
    const outgoing = [...this.layout.cells, ...this.layout.shunts].filter((c) => c.col === sc + 1 && c.fromRows.includes(sr)).map((c) => c.row);
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
    this.#host.setSelectionKey(`${row},${col}`);
    try {
      const ops: HistoryOp[] = [];
      if (sameCol) {
        for (const dr of outgoing) await forgefx.cable(this.#W(sr), this.#W(sc), this.#W(dr), false);
        ops.push(...outgoing.map((dr) => ({ kind: 'cable', srcRow: sr, srcCol: sc, destRow: dr, connect: false }) as const));
        await forgefx.clearCell(this.#W(sr), this.#W(sc));
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
      this.load();
      this.#host.showToast('Moved', '#35c9d6');
    } catch { this.load(); }
  };

  armLink = (c: Cell) => {
    if (this.linkFrom && this.linkFrom.row === c.row && this.linkFrom.col === c.col) { this.linkFrom = null; return; }
    this.linkFrom = c;
  };
  cancelLink = () => { this.linkFrom = null; };
  completeLink = async (row: number, col: number) => {
    const src = this.linkFrom;
    if (!src) return;
    if (row === src.row && col === src.col) { this.linkFrom = null; return; }
    if (col <= src.col) { this.#host.showToast('Connect to a later column', '#d6543f'); return; }
    this.linkFrom = null;
    await this.connect(src, row, col);
  };
  #runOp = async (op: HistoryOp) => {
    switch (op.kind) {
      case 'place': return void (await forgefx.placeCell(this.#W(op.row), this.#W(op.col), op.blockId));
      case 'remove': return void (await forgefx.clearCell(this.#W(op.row), this.#W(op.col)));
      case 'cable': return void (await forgefx.cable(this.#W(op.srcRow), this.#W(op.srcCol), this.#W(op.destRow), op.connect));
      default: return;
    }
  };
  connect = async (src: Cell, destRow: number, destCol: number) => {
    const plan = planConnect(this.layout.cells, this.layout.shunts, src, destRow, destCol, this.shuntBase);
    if (!plan.ok) { this.#host.showToast(plan.error ?? 'Cannot connect', '#d6543f'); return; }
    try {
      for (const op of plan.ops) await this.#runOp(op);
      history.recordComposite(plan.label, plan.ops);
      await this.load();
      this.#host.showToast('Connected', '#35c9d6');
    } catch { this.load(); }
  };
  replaceShunt = async (target: Cell, block: { blockId: number; display: string; src?: Cell }) => {
    const plan = planReplaceShunt(this.layout.cells, this.layout.shunts, target, {
      blockId: block.blockId,
      display: block.display,
      src: block.src ? { row: block.src.row, col: block.src.col, effectId: block.src.effectId, display: block.src.display, fromRows: block.src.fromRows } : undefined
    });
    if (!plan.ok) { this.#host.showToast(plan.error ?? 'Cannot place here', '#d6543f'); return; }
    try {
      for (const op of plan.ops) await this.#runOp(op);
      history.recordComposite(plan.label, plan.ops);
      await this.load();
      this.#host.showToast(block.src ? 'Moved' : `Placed ${block.display}`, '#35c9d6');
    } catch { this.load(); }
  };
  disconnect = async (srcRow: number, srcCol: number, destRow: number) => {
    try {
      await forgefx.cable(this.#W(srcRow), this.#W(srcCol), this.#W(destRow), false);
      history.record({ kind: 'cable', srcRow, srcCol, destRow, connect: false });
      await this.load();
      this.#host.showToast('Connection removed', '#9a9aa3');
    } catch { /* */ }
  };
}
