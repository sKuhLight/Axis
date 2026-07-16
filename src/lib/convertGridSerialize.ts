// Commit serializer for OFFLINE grid-target conversions (META-24 · AXIS-48, Stage 3).
//
// The reverse of convertGridAdapter.ts: turn the edited in-memory `Layout` back into the converter IR so
// Save-to-library / Apply-to-device reflect grid edits. `layoutToRouting` rebuilds `routing.gridCells`
// (the authoritative gen-3 routing, round-trips through `gridLayoutFromScratch`) plus a linear
// `seriesChains` fallback; `applyGridEditsToState` folds routing + per-block position/fromRows back into
// a ScratchState so the existing pure commit path (scratchToPreset / buildApplyPlan) carries the edits.
//
// Framework-free (no runes / DOM / network) and unit-tested (convertGridSerialize.test.ts).

import type { Cell, Layout } from './grid';
import type { ScratchState, ScratchBlock } from './convertScratch';
import type { ConverterGridCell } from './convertGridAdapter';

export interface SerializedRouting {
  gridCells: ConverterGridCell[];
  seriesChains: string[][];
}

const routeFlagOf = (fromRows: number[]): number => fromRows.reduce((m, r) => (r >= 0 && r < 31 ? m | (1 << r) : m), 0);

/** Serialize a Layout back to converter routing. `gridCells` mirrors the wire shape (with the `blockKey`
 *  back-reference) so it round-trips through `gridLayoutFromScratch`; `seriesChains` is a coarse
 *  left-to-right / top-to-bottom linearization of the block keys (the linear fallback chain). */
export function layoutToRouting(layout: Layout, effectToKey: Map<number, string>): SerializedRouting {
  const all: Cell[] = [...layout.cells, ...layout.shunts];
  const gridCells: ConverterGridCell[] = all.map((c) => ({
    row: c.row,
    col: c.col,
    effectId: c.effectId,
    name: c.display,
    slug: c.pack ?? null,
    isShunt: c.kind === 'shunt',
    routeFlag: routeFlagOf(c.fromRows),
    fromRows: [...c.fromRows],
    blockKey: c.kind === 'block' ? (effectToKey.get(c.effectId) ?? null) : null
  }));

  const chain = layout.cells
    .slice()
    .sort((a, b) => a.col - b.col || a.row - b.row)
    .map((c) => effectToKey.get(c.effectId))
    .filter((k): k is string => typeof k === 'string');
  const seriesChains = chain.length ? [chain] : [];

  return { gridCells, seriesChains };
}

/** Fold the edited grid Layout back into a ScratchState: prune blocks whose cell was removed, sync each
 *  surviving block's position + routing feed-rows from its cell, and replace `base.routing`. The result
 *  drives the UNCHANGED commit path (scratchToPreset / buildApplyPlan) so both commit targets see edits. */
export function applyGridEditsToState(state: ScratchState, layout: Layout, effectToKey: Map<number, string>): ScratchState {
  // key → its block cell (position + wiring) in the edited layout
  const cellByKey = new Map<string, Cell>();
  for (const c of layout.cells) {
    const key = effectToKey.get(c.effectId);
    if (key) cellByKey.set(key, c);
  }

  const blocks: ScratchBlock[] = state.blocks
    .filter((b) => cellByKey.has(b.key))
    .map((b) => {
      const cell = cellByKey.get(b.key)!;
      return { ...b, position: { row: cell.row, col: cell.col }, fromRows: [...cell.fromRows] };
    });

  const routing = layoutToRouting(layout, effectToKey);
  const base = { ...state.base, routing: { ...state.base.routing, ...routing } };
  return { ...state, blocks, base };
}
