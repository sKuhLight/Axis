// Pure grid-routing planners — given the current layout + a source/target, compute the
// list of mutation ops (place/cable, mirrored as history ops) that realize the edit.
//
// Kept free of any runes/DOM/network so it is unit-testable in the node-env vitest and
// reused verbatim by BOTH the executor (editor.svelte.ts) and the drag PREVIEW
// (SignalGrid.svelte) — the preview highlights exactly the cells/cables a drop commits.
//
// Coordinates are 0-indexed (like `Layout`); the editor's `#W` shifts them to the
// 1-indexed write API. `HistoryOp` is imported type-only so this stays a plain module.
import type { HistoryOp } from './history.svelte';

/** Minimal projection of a grid cell the planners need (positions + wiring + identity). */
export interface RouteCell {
  row: number;
  col: number;
  kind: 'block' | 'shunt';
  effectId: number;
  fromRows: number[];
  display: string;
}

/** A cable segment `(srcRow,srcCol) → (destRow, srcCol+1)` — used for preview drawing. */
export interface CableSeg {
  srcRow: number;
  srcCol: number;
  destRow: number;
}

export interface RoutePlan {
  ok: boolean;
  /** Present when `ok === false` — a short user-facing reason. */
  error?: string;
  /** Executed forward; recorded as a composite and undone in reverse. */
  ops: HistoryOp[];
  /** Human-readable composite label. */
  label: string;
  /** Cells that gain a NEW shunt (preview highlight + optimistic layout add). */
  newShunts: { row: number; col: number; blockId: number }[];
  /** All cables the plan creates (preview drawing + optimistic layout wiring). */
  cables: CableSeg[];
}

const err = (error: string): RoutePlan => ({ ok: false, error, ops: [], label: '', newShunts: [], cables: [] });

/** Lowest-free-instance shunt allocator over the existing routing cells. FM-Edit gives every
 *  shunt a unique instance id (`shuntBase + n`); reusing one makes the device silently dedupe. */
function shuntAllocator(cells: RouteCell[], shuntBase: number): () => number {
  const used = new Set(cells.filter((c) => c.effectId >= shuntBase).map((c) => c.effectId - shuntBase));
  let next = 0;
  return () => {
    while (used.has(next)) next++;
    used.add(next);
    return shuntBase + next;
  };
}

/**
 * Connect `src` → `(destRow,destCol)`, spanning any number of columns.
 *
 * Straight run flows along `src.row`; empty intermediate cells get a fresh shunt, existing
 * blocks on that row are CHAINED through (output→input), existing shunts are reused. The
 * final hop bends into `destRow` (diagonal) — so a cross-row target routes on the source row
 * until the target column, then a single diagonal cable. Blocks that sit OFF `src.row` in an
 * intermediate column are left alone (the shunt on src.row routes around them).
 */
export function planConnect(
  cells: RouteCell[],
  shunts: RouteCell[],
  src: { row: number; col: number; display: string },
  destRow: number,
  destCol: number,
  shuntBase: number,
): RoutePlan {
  if (destCol <= src.col) return err('Connect to a later column');
  const all = [...cells, ...shunts];
  const at = (r: number, c: number) => all.find((x) => x.row === r && x.col === c);
  const alloc = shuntAllocator(all, shuntBase);

  const ops: HistoryOp[] = [];
  const newShunts: { row: number; col: number; blockId: number }[] = [];

  // ensure a carrier cell exists in every intermediate column along src.row
  for (let c = src.col + 1; c < destCol; c++) {
    const cell = at(src.row, c);
    if (!cell) {
      const sid = alloc();
      ops.push({ kind: 'place', row: src.row, col: c, blockId: sid, display: 'Shunt' });
      newShunts.push({ row: src.row, col: c, blockId: sid });
    }
    // else: block → chain through it; shunt → reuse. Either way no placement.
  }
  // ensure the destination cell exists (shunt if dropped on empty)
  if (!at(destRow, destCol)) {
    const sid = alloc();
    ops.push({ kind: 'place', row: destRow, col: destCol, blockId: sid, display: 'Shunt' });
    newShunts.push({ row: destRow, col: destCol, blockId: sid });
  }

  // chain the cables: straight along src.row, then bend into destRow on the last hop
  const cables: CableSeg[] = [];
  for (let c = src.col; c < destCol - 1; c++) {
    ops.push({ kind: 'cable', srcRow: src.row, srcCol: c, destRow: src.row, connect: true });
    cables.push({ srcRow: src.row, srcCol: c, destRow: src.row });
  }
  ops.push({ kind: 'cable', srcRow: src.row, srcCol: destCol - 1, destRow, connect: true });
  cables.push({ srcRow: src.row, srcCol: destCol - 1, destRow });

  return { ok: true, ops, label: `Connected ${src.display} → r${destRow + 1}c${destCol + 1}`, newShunts, cables };
}

/** Rows of column `col+1` that are currently fed from `(row,col)` — a cell's downstream taps. */
function outgoingRows(cells: RouteCell[], shunts: RouteCell[], row: number, col: number): number[] {
  return [...cells, ...shunts].filter((c) => c.col === col + 1 && c.fromRows.includes(row)).map((c) => c.row);
}

/**
 * Replace the SHUNT at `target` with a block, preserving the shunt's exact cable topology
 * (its inputs and outputs move onto the block). Two entry shapes:
 *   - move: `src` is an existing block being relocated onto the shunt (its own cell is cleared,
 *     its wires captured for undo, then dropped — cross-cell move default).
 *   - place: `src` omitted, `blockId`/`display` given for an add-block-onto-shunt.
 *
 * Ops (forward): remove src? → remove shunt → place block → re-cable inputs → re-cable outputs.
 * Recorded as one composite; undo restores the shunt (with its cables) and the source block.
 */
export function planReplaceShunt(
  cells: RouteCell[],
  shunts: RouteCell[],
  target: RouteCell,
  block: { blockId: number; display: string; src?: { row: number; col: number; effectId: number; display: string; fromRows: number[] } },
): RoutePlan {
  if (target.kind !== 'shunt') return err('Target is not a shunt');
  const shuntInputs = target.fromRows.slice();
  const shuntOutputs = outgoingRows(cells, shunts, target.row, target.col);

  const ops: HistoryOp[] = [];
  const src = block.src;
  if (src) {
    if (src.row === target.row && src.col === target.col) return err('Same cell');
    const srcOutputs = outgoingRows(cells, shunts, src.row, src.col);
    // clearing the source drops its own wires — carried on the remove op so undo restores them
    ops.push({ kind: 'remove', row: src.row, col: src.col, blockId: src.effectId, display: src.display, inRows: src.fromRows.slice(), outRows: srcOutputs });
  }
  // clear the shunt (drops its cables) — carried so undo restores the shunt intact
  ops.push({ kind: 'remove', row: target.row, col: target.col, blockId: target.effectId, display: 'Shunt', inRows: shuntInputs, outRows: shuntOutputs });
  // drop the block into the shunt's cell
  ops.push({ kind: 'place', row: target.row, col: target.col, blockId: block.blockId, display: block.display });
  // re-wire the block exactly as the shunt was wired
  const cables: CableSeg[] = [];
  for (const fr of shuntInputs) {
    ops.push({ kind: 'cable', srcRow: fr, srcCol: target.col - 1, destRow: target.row, connect: true });
    cables.push({ srcRow: fr, srcCol: target.col - 1, destRow: target.row });
  }
  for (const dr of shuntOutputs) {
    ops.push({ kind: 'cable', srcRow: target.row, srcCol: target.col, destRow: dr, connect: true });
    cables.push({ srcRow: target.row, srcCol: target.col, destRow: dr });
  }

  const label = src
    ? `Moved ${block.display} onto shunt r${target.row + 1}c${target.col + 1}`
    : `Placed ${block.display} on shunt r${target.row + 1}c${target.col + 1}`;
  return { ok: true, ops, label, newShunts: [], cables };
}
