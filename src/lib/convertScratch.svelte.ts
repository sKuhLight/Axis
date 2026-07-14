// Cross-device preset-converter "fake grid" scratch store (P4b · META-24 · AXIS-48).
//
// The runes shell around the pure `convertScratch.ts` core: it holds ONE ScratchState snapshot and swaps
// it wholesale through the pure transitions, caches per-family type catalogs (GET /blocks/:slug/types),
// and owns the two impure commit paths — save-to-library (PUT /store/converted/…) and the best-effort
// apply-to-connected-device plan executor. It emits ZERO device writes during editing; the ONLY writes
// happen inside the explicit commit actions. Independent module (not on `editor`) because it outlives the
// editor's per-preset reloads and has its own lifecycle, exactly like `convert.svelte.ts`.

import { forgefx } from './forgefx';
import type { BlockTypeOption, ConverterDeviceId } from './types';
import { convert } from './convert.svelte';
import {
  seedScratchFromResponse,
  remainingConflicts,
  unplacedBlocks,
  blockAt,
  canPlaceAt,
  setBlockType,
  acceptType,
  acknowledgeClamps,
  acknowledgeRouting,
  placeBlock,
  moveBlock,
  discardBlock,
  unplaceBlock,
  buildApplyPlan,
  buildLibraryDoc,
  type ScratchState,
  type ScratchBlock,
  type ApplyOp
} from './convertScratch';

/** Progress of a running apply-to-device commit. */
export interface ApplyProgress {
  running: boolean;
  total: number;
  done: number;
  applied: number;
  failed: number;
  /** set once the run finishes (or aborts) — a human summary line. */
  summary?: string;
  /** the op currently executing (for the progress caption). */
  current?: string;
}

class ConvertScratchStore {
  /** Fake-grid full-screen view visibility (mounted unconditionally in +page.svelte, gated on this). */
  open = $state(false);

  #s = $state<ScratchState | null>(null);

  /** Block the resolve panel is focused on (grid click, or the report's "focus block" hook). */
  focusKey = $state<string | null>(null);

  /** A tray block armed for placement — the next free-cell click drops it here. */
  placingKey = $state<string | null>(null);

  // per-family type catalog cache: 'loading' while in flight, an array once resolved, 'error' on failure.
  #types = $state<Record<string, BlockTypeOption[] | 'loading' | 'error'>>({});

  apply = $state<ApplyProgress>({ running: false, total: 0, done: 0, applied: 0, failed: 0 });
  #abort = false;

  // ── read surface ──
  get state(): ScratchState | null { return this.#s; }
  get ready(): boolean { return !!this.#s; }
  get blocks(): ScratchBlock[] { return this.#s?.blocks ?? []; }
  get remaining(): number { return this.#s ? remainingConflicts(this.#s) : 0; }
  get canCommit(): boolean { return this.ready && this.remaining === 0; }
  get tray(): ScratchBlock[] { return this.#s ? unplacedBlocks(this.#s) : []; }

  blockAt = (row: number, col: number): ScratchBlock | undefined => (this.#s ? blockAt(this.#s, row, col) : undefined);
  canPlaceAt = (row: number, col: number, exceptKey?: string): boolean =>
    this.#s ? canPlaceAt(this.#s, row, col, exceptKey) : false;

  /** Cached type catalog for a family, or undefined until `loadTypes` runs. */
  typesFor = (family: string): BlockTypeOption[] | 'loading' | 'error' | undefined => this.#types[family];

  // ── lifecycle ──
  /** Seed from the current conversion result and open the view. No-op without a result. */
  openView = () => {
    const res = convert.result;
    const dev = convert.lastRequest?.targetDevice;
    if (!res || !dev) return;
    this.#s = seedScratchFromResponse(res, dev);
    this.focusKey = null;
    this.placingKey = null;
    this.apply = { running: false, total: 0, done: 0, applied: 0, failed: 0 };
    this.open = true;
  };

  /** Open the view focused on a specific block (the report's re-pointed onFocusBlock hook). */
  focusBlock = (blockKey: string): boolean => {
    if (!this.#s) this.openView();
    if (!this.#s) return false;
    if (!this.#s.blocks.some((b) => b.key === blockKey)) return false;
    this.open = true;
    this.focusKey = blockKey;
    return true;
  };

  /** Whether a report row's block exists in the scratch buffer (drives its clickable state). */
  hasBlock = (blockKey: string): boolean => {
    const res = convert.result;
    const dev = convert.lastRequest?.targetDevice;
    if (this.#s) return this.#s.blocks.some((b) => b.key === blockKey);
    return !!res && !!dev && res.target.blocks.some((b) => b.key === blockKey);
  };

  close = () => {
    this.open = false;
    this.focusKey = null;
    this.placingKey = null;
  };

  /** Drop the scratch buffer entirely (Discard). */
  discardAll = () => {
    this.#s = null;
    this.close();
  };

  // ── type catalog ──
  loadTypes = async (family: string): Promise<void> => {
    if (this.#types[family] && this.#types[family] !== 'error') return; // cached / in flight
    this.#types = { ...this.#types, [family]: 'loading' };
    try {
      const list = await forgefx.blockTypes(family);
      this.#types = { ...this.#types, [family]: list };
    } catch {
      this.#types = { ...this.#types, [family]: 'error' };
    }
  };

  // ── editing transitions (offline; swap the whole snapshot) ──
  #tx = (fn: (s: ScratchState) => ScratchState) => {
    if (this.#s) this.#s = fn(this.#s);
  };

  setType = (blockKey: string, type: { typeName?: string; typeValue?: number }) =>
    this.#tx((s) => setBlockType(s, blockKey, type));
  acceptType = (blockKey: string) => this.#tx((s) => acceptType(s, blockKey));
  acknowledgeClamps = (blockKey: string) => this.#tx((s) => acknowledgeClamps(s, blockKey));
  acknowledgeRouting = () => this.#tx((s) => acknowledgeRouting(s));
  discard = (blockKey: string) => {
    this.#tx((s) => discardBlock(s, blockKey));
    if (this.focusKey === blockKey) this.focusKey = null;
  };
  unplace = (blockKey: string) => this.#tx((s) => unplaceBlock(s, blockKey));
  move = (blockKey: string, row: number, col: number) => this.#tx((s) => moveBlock(s, blockKey, row, col));

  /** Arm a tray block for placement (toggle). */
  arm = (blockKey: string) => {
    this.placingKey = this.placingKey === blockKey ? null : blockKey;
  };
  /** Drop the armed block into a free cell. Returns true if it landed. */
  placeArmed = (row: number, col: number): boolean => {
    const key = this.placingKey;
    if (!key || !this.#s || !canPlaceAt(this.#s, row, col, key)) return false;
    this.#s = placeBlock(this.#s, key, row, col);
    this.placingKey = null;
    this.focusKey = key;
    return true;
  };

  // ── commit: save to library (always works, no device) ──
  saveToLibrary = async (): Promise<{ ok: boolean; id?: string; error?: string }> => {
    if (!this.#s) return { ok: false, error: 'Nothing to save.' };
    const { id, doc } = buildLibraryDoc(this.#s, Date.now());
    try {
      await forgefx.putDoc('converted', id, doc);
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || 'Could not save to the library.' };
    }
  };

  // ── commit: apply to connected device (best-effort, experimental) ──
  abortApply = () => {
    this.#abort = true;
  };

  applyToDevice = async (): Promise<void> => {
    if (!this.#s || this.apply.running) return;
    const plan = buildApplyPlan(this.#s);
    this.#abort = false;
    this.apply = { running: true, total: plan.ops.length, done: 0, applied: 0, failed: 0 };

    let applied = 0;
    let failed = 0;
    for (let i = 0; i < plan.ops.length; i++) {
      if (this.#abort) {
        this.apply = { ...this.apply, running: false, summary: `Aborted after ${applied} of ${plan.ops.length} operations.` };
        return;
      }
      const op = plan.ops[i];
      this.apply = { ...this.apply, done: i, current: describeOp(op) };
      try {
        await runOp(op);
        applied++;
        this.apply = { ...this.apply, applied };
      } catch (e) {
        failed++;
        this.apply = {
          ...this.apply,
          running: false,
          failed,
          done: i,
          summary: `Stopped on a failed operation (${describeOp(op)}): ${(e as Error)?.message || 'error'}. Applied ${applied} before it.`
        };
        return; // abort on first hard error (per spec)
      }
    }

    const skipped: string[] = [];
    if (plan.unresolvedBlocks) skipped.push(`${plan.unresolvedBlocks} block(s) with no device address`);
    if (plan.unresolvedParams) skipped.push(`${plan.unresolvedParams} parameter(s)`);
    const skipNote = skipped.length ? ` Skipped ${skipped.join(' and ')}.` : '';
    this.apply = {
      ...this.apply,
      running: false,
      done: plan.ops.length,
      applied,
      summary: `Applied ${applied} operation(s) to the device.${skipNote}`
    };
  };
}

/** Human caption for the progress bar. */
function describeOp(op: ApplyOp): string {
  switch (op.kind) {
    case 'place':
      return `Place block ${op.blockKey}`;
    case 'set-type':
      return `Set type on ${op.blockKey}`;
    case 'set-param':
      return `Write param ${op.paramId} on ${op.blockKey}`;
  }
}

/** Execute one apply op against the live ForgeFX endpoints. */
async function runOp(op: ApplyOp): Promise<void> {
  switch (op.kind) {
    case 'place':
      await forgefx.placeCell(op.row + 1, op.col + 1, op.effectId); // endpoints are 1-indexed
      return;
    case 'set-type':
      await forgefx.setType(op.effectId, op.value);
      return;
    case 'set-param':
      await forgefx.setParam(op.effectId, op.paramId, op.value);
      return;
  }
}

export const convertScratch = new ConvertScratchStore();
