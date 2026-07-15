// Pure bridge from the OFFLINE convert scratch model (convertScratch.ts) to the REAL editor grid
// `Layout` (grid.ts) — the shape SignalGrid / GridMap render. This lets the genuine grid draw a
// cross-device conversion result with ZERO device I/O: `convertEditor.svelte.ts` (the offline
// EditorSurface) reads `scratchToLayout(state)` for its `layout` getter, and the two reverse lookups
// map a grid coordinate / effectId back to a ScratchBlock key for the mutators.
//
// Framework-free (no runes / DOM / network) and unit-tested (convertScratchAdapter.test.ts).

import type { Cell, Layout } from './grid';
import { blockAt, blockEffectId, type ScratchState } from './convertScratch';
import { catFor } from './catalog';

/** family slug → CATALOG key, mirroring ConvertScratchView's `titleCase` so the offline grid tiles get
 *  the same accent / glyph / short label as the bespoke fake-grid view. */
export function titleCase(family: string): string {
  return (family ?? '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** A benign empty layout for the "no scratch buffer yet" case (surface `layout` getter fallback). */
export const EMPTY_LAYOUT: Layout = {
  cells: [],
  shunts: [],
  rows: 4,
  cols: 12,
  name: '',
  model: '',
  crcValid: true
};

/** Stable synthetic effectId for a placed block with no device address in the IR. Negative + keyed on
 *  the block's index in `state.blocks` (fixed across place/unplace) so it never collides with a real
 *  (positive) device effectId nor with another synthetic id. */
function effectIdFor(state: ScratchState, index: number): number {
  const b = state.blocks[index];
  return blockEffectId(b) ?? -(index + 1);
}

/** Map every PLACED ScratchBlock to a real-grid `Cell`. Tray (unplaced) blocks are excluded — they
 *  live in the convert surface's own tray, not on the grid. No shunt synthesis yet (`shunts: []`);
 *  existing per-block feed-rows are carried through so drawn cables reflect the converted routing. */
export function scratchToLayout(state: ScratchState): Layout {
  const cells: Cell[] = [];
  state.blocks.forEach((b, i) => {
    if (!b.position) return;
    const key = titleCase(b.family);
    const ce = catFor(key, key);
    cells.push({
      row: b.position.row,
      col: b.position.col,
      kind: 'block',
      effectId: effectIdFor(state, i),
      display: b.typeName ?? key,
      pack: key,
      color: ce.accent,
      fromRows: b.fromRows ?? [],
      bypassed: b.bypassed
    });
  });
  return {
    cells,
    shunts: [],
    rows: state.topology.rows,
    cols: state.topology.cols,
    name: state.name,
    model: state.targetDevice,
    crcValid: true
  };
}

/** Reverse lookup: the ScratchBlock key at a grid coordinate (reuses the pure `blockAt` selector). */
export function keyAt(state: ScratchState, row: number, col: number): string | null {
  return blockAt(state, row, col)?.key ?? null;
}

/** Reverse lookup: the ScratchBlock key for a cell's (possibly synthetic) effectId. Only placed blocks
 *  carry a cell, so the same index mapping as {@link scratchToLayout} resolves it 1:1. */
export function keyForEffectId(state: ScratchState, eid: number): string | null {
  for (let i = 0; i < state.blocks.length; i++) {
    if (!state.blocks[i].position) continue;
    if (effectIdFor(state, i) === eid) return state.blocks[i].key;
  }
  return null;
}
