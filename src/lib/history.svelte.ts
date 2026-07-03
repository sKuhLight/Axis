// Preset edit history — a per-slot changelog of every edit with undo/redo by inverse API call.
//
// The EDITOR records here (editor.svelte.ts call sites, guarded by `history.applying`): only the
// editor has the display context (param names/ranges, block labels, enum options) for readable
// entries like "Amp1 · Drive 4.2 → 6.8". This module talks to `forgefx` directly for the inverse
// writes, plus a narrow host interface the editor binds at init (no editor↔history import cycle).
//
// Grain: ONE GESTURE = ONE STEP — rapid writes to the same param (a knob drag) coalesce into one
// entry holding start→end; structural ops are always their own step. History persists per
// device+slot in IndexedDB (`axs.hist.v1:*`) and survives restarts, cursor included (redo too).
// Buffer loads (audition/snapshot) insert a BARRIER — the changelog is kept, undo stops there.
import { forgefx } from './forgefx';
import { idb } from './idb';
import { fmtNumber } from './format';

export type HistoryOp =
  | { kind: 'param'; eid: number; paramId: number; continuous: boolean; from: number; to: number;
      block: string; param: string; min?: number; max?: number; unit?: string; log?: boolean;
      fromLabel?: string; toLabel?: string }
  | { kind: 'bypass'; eid: number; block: string; from: boolean; to: boolean }
  | { kind: 'channel'; eid: number; block: string; from: string; to: string }
  | { kind: 'retype'; eid: number; block: string; from: number; to: number; fromName: string; toName: string }
  | { kind: 'place'; row: number; col: number; blockId: number; display: string }         // 0-indexed rows/cols (like `layout`)
  | { kind: 'remove'; row: number; col: number; blockId: number; display: string; inRows: number[]; outRows: number[] }
  | { kind: 'cable'; srcRow: number; srcCol: number; destRow: number; connect: boolean }
  | { kind: 'scene'; from: number; to: number }                                            // 1-based UI scene numbers
  | { kind: 'sceneName'; index: number; from: string; to: string }
  | { kind: 'presetName'; from: string; to: string };

export interface HistoryEntry {
  id: string;
  t: number;              // gesture-end timestamp
  label: string;          // precomputed human-readable line
  ops: HistoryOp[];       // 1 for simple steps; N for composites (move/connect); [] for checkpoints
  undoable: boolean;      // false → marker (skipped) or barrier (stops undo)
  barrier?: boolean;      // true = the edit buffer was replaced here — undo can't cross it
}

interface HistoryDoc { v: 1; entries: HistoryEntry[]; cursor: number; updatedAt: number }

const KEY_PREFIX = 'axs.hist.v1:';
const INDEX_KEY = 'axs.hist.v1:index';
const MAX_ENTRIES = 200; // per-preset cap (oldest pruned)
const MAX_DOCS = 32;     // LRU cap on stored preset docs
const GESTURE_MS = 800;  // idle time that closes an open param gesture

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `h-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`);
const fmt = (op: Extract<HistoryOp, { kind: 'param' }>, norm: number) =>
  `${fmtNumber({ norm, min: op.min, max: op.max, unit: op.unit, log: op.log })}${op.unit ? ` ${op.unit}` : ''}`;

function labelFor(op: HistoryOp): string {
  switch (op.kind) {
    case 'param':
      return op.continuous
        ? `${op.block} · ${op.param} ${fmt(op, op.from)} → ${fmt(op, op.to)}`
        : `${op.block} · ${op.param} ${op.fromLabel ?? op.from} → ${op.toLabel ?? op.to}`;
    case 'bypass': return `${op.block} ${op.to ? 'bypassed' : 'engaged'}`;
    case 'channel': return `${op.block} channel ${op.from || '?'} → ${op.to}`;
    case 'retype': return `${op.block} type ${op.fromName} → ${op.toName} (params not restored on undo)`;
    case 'place': return `Placed ${op.display} at r${op.row + 1}c${op.col + 1}`;
    case 'remove': return `Removed ${op.display} (r${op.row + 1}c${op.col + 1})`;
    case 'cable': return op.connect
      ? `Cable r${op.srcRow + 1}c${op.srcCol + 1} → r${op.destRow + 1}`
      : `Cable removed r${op.srcRow + 1}c${op.srcCol + 1} → r${op.destRow + 1}`;
    case 'scene': return `Scene ${op.from} → ${op.to}`;
    case 'sceneName': return `Scene ${op.index + 1} renamed “${op.from}” → “${op.to}”`;
    case 'presetName': return `Preset renamed “${op.from}” → “${op.to}”`;
  }
}

interface HistoryHost {
  load(): Promise<void>;
  reloadParams(): Promise<void>;
  echoParam(eid: number, paramId: number, norm: number): void;
  toast(text: string, accent?: string): void;
  isLegacyAm4(): boolean;
}

class HistoryStore {
  entries = $state<HistoryEntry[]>([]);
  /** Index of the next entry to undo (== entries.length when nothing is undone). */
  cursor = $state(0);
  panelOpen = $state(false);
  /** True while an undo/redo is replaying ops — the editor's recording sites skip themselves. */
  applying = $state(false);
  key = ''; // current IDB doc key ('' = no preset context yet)

  #host: HistoryHost | null = null;
  #gesture: { key: string; entry: HistoryEntry; timer: ReturnType<typeof setTimeout> } | null = null;
  #persistT: ReturnType<typeof setTimeout> | null = null;

  get canUndo(): boolean {
    for (let i = this.cursor - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.barrier) return false;
      if (e.undoable) return true;
    }
    return false;
  }
  get canRedo(): boolean {
    for (let i = this.cursor; i < this.entries.length; i++) if (this.entries[i].undoable) return true;
    return false;
  }

  bindHost(h: HistoryHost) { this.#host = h; }

  /** Switch the history context to another device+slot: flush the old doc, load the new one. */
  switchTo = async (deviceShort: string, preset: number) => {
    const key = `${KEY_PREFIX}${deviceShort}:${preset}`;
    if (key === this.key) return;
    this.endGesture();
    this.#flushPersist();
    this.key = key;
    this.entries = [];
    this.cursor = 0;
    if (!idb.available()) return;
    const doc = await idb.get<HistoryDoc>(key);
    if (this.key !== key) return; // switched again while loading
    if (doc?.v === 1 && Array.isArray(doc.entries)) {
      this.entries = doc.entries;
      this.cursor = Math.max(0, Math.min(doc.cursor ?? doc.entries.length, doc.entries.length));
    }
  };

  /** Record a discrete/structural op — always its own step. */
  record = (op: HistoryOp) => {
    if (this.applying) return;
    this.endGesture();
    this.#push({ id: uid(), t: Date.now(), label: labelFor(op), ops: [op], undoable: true });
  };
  /** Record a composite step (move/connect): primitive ops in execution order, undone in reverse. */
  recordComposite = (label: string, ops: HistoryOp[]) => {
    if (this.applying || !ops.length) return;
    this.endGesture();
    this.#push({ id: uid(), t: Date.now(), label, ops, undoable: true });
  };
  /** Non-undoable marker (save = skippable) or barrier (buffer replaced = undo stops here). */
  checkpoint = (label: string, barrier: boolean) => {
    if (this.applying) return;
    this.endGesture();
    this.#push({ id: uid(), t: Date.now(), label, ops: [], undoable: false, barrier });
  };

  /** Coalescing path for continuous params: one open gesture per (eid,paramId); rapid same-key
   *  writes update `to` in place; ~800 ms idle (or any other record) closes the step. */
  recordGesture = (op: Extract<HistoryOp, { kind: 'param' }>) => {
    if (this.applying) return;
    const gkey = `${op.eid}:${op.paramId}`;
    if (this.#gesture?.key === gkey) {
      const g = this.#gesture;
      const first = g.entry.ops[0] as Extract<HistoryOp, { kind: 'param' }>;
      first.to = op.to;
      g.entry.t = Date.now();
      g.entry.label = labelFor(first);
      clearTimeout(g.timer);
      g.timer = setTimeout(() => this.endGesture(), GESTURE_MS);
      return;
    }
    this.endGesture();
    const entry: HistoryEntry = { id: uid(), t: Date.now(), label: labelFor(op), ops: [op], undoable: true };
    this.#push(entry, /*persist*/ false); // panel updates live; persisted when the gesture closes
    this.#gesture = { key: gkey, entry, timer: setTimeout(() => this.endGesture(), GESTURE_MS) };
  };
  /** Close any open param gesture now (no-op drags are dropped). */
  endGesture = () => {
    const g = this.#gesture;
    if (!g) return;
    this.#gesture = null;
    clearTimeout(g.timer);
    const op = g.entry.ops[0] as Extract<HistoryOp, { kind: 'param' }>;
    if (op.from === op.to) {
      const i = this.entries.indexOf(g.entry);
      if (i >= 0) { this.entries.splice(i, 1); this.cursor = Math.min(this.cursor, this.entries.length); }
      return;
    }
    this.#schedulePersist();
  };

  #push = (entry: HistoryEntry, persist = true) => {
    if (this.cursor < this.entries.length) this.entries.splice(this.cursor); // truncate the redo tail
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    this.cursor = this.entries.length;
    if (persist) this.#schedulePersist();
  };

  undo = async (): Promise<boolean> => {
    this.endGesture();
    for (let i = this.cursor - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.barrier) { this.#host?.toast('Buffer was replaced — can’t undo past this point', '#f5a623'); return false; }
      if (!e.undoable) continue; // skip markers (saves)
      const ok = await this.#apply(e, 'undo');
      if (ok) { this.cursor = i; this.#schedulePersist(); this.#host?.toast(`Undo — ${e.label}`, '#35c9d6'); }
      return ok;
    }
    return false;
  };
  redo = async (): Promise<boolean> => {
    this.endGesture();
    for (let i = this.cursor; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (!e.undoable) continue; // markers/barriers are skipped forward
      const ok = await this.#apply(e, 'redo');
      if (ok) { this.cursor = i + 1; this.#schedulePersist(); this.#host?.toast(`Redo — ${e.label}`, '#35c9d6'); }
      return ok;
    }
    return false;
  };
  /** Revert to just before entry `index` — sequential undo, aborting on the first failure. */
  revertTo = async (index: number) => {
    while (this.cursor > index) { if (!(await this.undo())) return; }
  };
  clear = () => {
    this.endGesture();
    this.entries = [];
    this.cursor = 0;
    this.#schedulePersist();
  };

  /** Replay one entry's ops (undo = inverses in reverse order; redo = forward), then refresh the UI
   *  by op kind. Failure (device offline, stale target) leaves the cursor unchanged — retryable. */
  #apply = async (entry: HistoryEntry, dir: 'undo' | 'redo'): Promise<boolean> => {
    const host = this.#host;
    this.applying = true;
    try {
      const ops = dir === 'undo' ? [...entry.ops].reverse() : entry.ops;
      for (const op of ops) await this.#applyOp(op, dir);
      // UI refresh: structural → grid reload; channel/retype/scene/discrete → param re-read too
      const kinds = new Set(entry.ops.map((o) => o.kind));
      const structural = ['bypass', 'place', 'remove', 'cable', 'retype', 'channel', 'scene', 'sceneName'].some((k) => kinds.has(k as HistoryOp['kind']));
      if (structural) await host?.load();
      if (['channel', 'retype', 'scene'].some((k) => kinds.has(k as HistoryOp['kind'])) || entry.ops.some((o) => o.kind === 'param' && !o.continuous)) {
        await host?.reloadParams();
      }
      return true;
    } catch {
      host?.toast(`${dir === 'undo' ? 'Undo' : 'Redo'} failed — device offline?`, '#d6543f');
      return false;
    } finally {
      this.applying = false;
    }
  };

  #applyOp = async (op: HistoryOp, dir: 'undo' | 'redo'): Promise<void> => {
    const W = (n: number) => n + 1; // write API is 1-indexed; ops store the 0-indexed layout coords
    const legacyAm4 = this.#host?.isLegacyAm4() ?? false;
    switch (op.kind) {
      case 'param': {
        const v = dir === 'undo' ? op.from : op.to;
        if (op.continuous) {
          await (legacyAm4 ? forgefx.am4SetParamNorm(op.eid, op.paramId, v) : forgefx.setParam(op.eid, op.paramId, v, true));
          this.#host?.echoParam(op.eid, op.paramId, v);
        } else {
          await (legacyAm4 ? forgefx.am4SetParamValue(op.eid, op.paramId, v) : forgefx.setParam(op.eid, op.paramId, v, false));
        }
        return;
      }
      case 'bypass': return void await forgefx.setBypass(op.eid, dir === 'undo' ? op.from : op.to);
      case 'channel': return void await forgefx.setChannel(op.eid, dir === 'undo' ? op.from : op.to);
      case 'retype': return void await forgefx.setType(op.eid, dir === 'undo' ? op.from : op.to);
      case 'place': {
        if (dir === 'undo') await forgefx.clearCell(W(op.row), W(op.col));
        else await forgefx.placeCell(W(op.row), W(op.col), op.blockId);
        return;
      }
      case 'remove': {
        if (dir === 'undo') {
          // restore the block AND its cables (in from col-1, out to col+1)
          await forgefx.placeCell(W(op.row), W(op.col), op.blockId);
          for (const fr of op.inRows) await forgefx.cable(W(fr), W(op.col - 1), W(op.row), true);
          for (const dr of op.outRows) await forgefx.cable(W(op.row), W(op.col), W(dr), true);
        } else {
          await forgefx.clearCell(W(op.row), W(op.col));
        }
        return;
      }
      case 'cable': {
        const connect = dir === 'undo' ? !op.connect : op.connect;
        return void await forgefx.cable(W(op.srcRow), W(op.srcCol), W(op.destRow), connect);
      }
      case 'scene': {
        const ui = dir === 'undo' ? op.from : op.to;
        return void await (legacyAm4 ? forgefx.am4SetScene(ui - 1) : forgefx.setScene(ui - 1));
      }
      case 'sceneName': return void await forgefx.setSceneName(op.index, dir === 'undo' ? op.from : op.to);
      case 'presetName': return void await forgefx.setPresetName(dir === 'undo' ? op.from : op.to);
    }
  };

  // ── persistence (debounced; flushed on context switch) ──
  #schedulePersist = () => {
    if (!this.key || !idb.available()) return;
    if (this.#persistT) clearTimeout(this.#persistT);
    this.#persistT = setTimeout(() => this.#flushPersist(), 500);
  };
  #flushPersist = () => {
    if (this.#persistT) { clearTimeout(this.#persistT); this.#persistT = null; }
    if (!this.key || !idb.available()) return;
    const doc: HistoryDoc = { v: 1, entries: $state.snapshot(this.entries) as HistoryEntry[], cursor: this.cursor, updatedAt: Date.now() };
    const key = this.key;
    void idb.set(key, doc).then(async () => {
      // LRU index: keep the MAX_DOCS most recently touched preset docs
      const index = (await idb.get<Record<string, number>>(INDEX_KEY)) ?? {};
      index[key] = doc.updatedAt;
      const keys = Object.entries(index).sort((a, b) => b[1] - a[1]);
      for (const [k] of keys.slice(MAX_DOCS)) { delete index[k]; void idb.del(k); }
      void idb.set(INDEX_KEY, index);
    });
  };
}

export const history = new HistoryStore();
