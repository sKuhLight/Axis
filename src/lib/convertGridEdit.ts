// OFFLINE grid-editing engine for GRID-target conversions (META-24 · AXIS-48, Stage 2).
//
// Mirrors the LIVE editor's grid mutators (editor.svelte.ts move / removeAt / connect / disconnect /
// replaceShunt) but applies the result IN-MEMORY to a `Layout` instead of writing to a device. The
// routing PLANS come from the same pure planners the live editor uses (gridRouting.ts planConnect /
// planReplaceShunt), so an offline cable/move produces byte-identical topology to a real edit —
// `applyRouteOps` just folds the plan's structural ops (place / remove / cable) into a new Layout the
// way the device would, mirroring how `layoutFromGrid` decodes `fromRows` from the routing mask.
//
// Framework-free (no runes / DOM / network) and unit-tested (convertGridEdit.test.ts).

import type { Cell, Layout } from './grid';
import { packFor, statusColor } from './blocks';
import { planConnect, planReplaceShunt, type RouteCell } from './gridRouting';
import type { HistoryOp } from './history.svelte';

const SHUNT_COLOR = '#3a3a44'; // matches grid.ts layoutFromGrid shunt fill

type EditResult = { ok: boolean; error?: string; layout: Layout };

function toRouteCells(cells: Cell[]): RouteCell[] {
  return cells.map((c) => ({ row: c.row, col: c.col, kind: c.kind, effectId: c.effectId, fromRows: c.fromRows, display: c.display }));
}
const cloneCell = (c: Cell): Cell => ({ ...c, fromRows: [...c.fromRows] });
const uniqSort = (rows: number[]): number[] => [...new Set(rows)].sort((a, b) => a - b);
const split = (layout: Layout, all: Cell[]): Layout => ({
  ...layout,
  cells: all.filter((c) => c.kind === 'block'),
  shunts: all.filter((c) => c.kind === 'shunt')
});

/** Fold a routing plan's structural ops into a new `Layout`. `place` adds a block/shunt (shunt when the
 *  blockId is at/above `shuntBase`), `remove` clears a cell, `cable` sets/clears one `fromRows` bit on the
 *  cell in the NEXT column — exactly how the device realizes the same op sequence. */
export function applyRouteOps(layout: Layout, ops: HistoryOp[], shuntBase: number): Layout {
  const all: Cell[] = [...layout.cells, ...layout.shunts].map(cloneCell);
  const idx = (r: number, c: number) => all.findIndex((x) => x.row === r && x.col === c);
  for (const op of ops) {
    if (op.kind === 'place') {
      const isShunt = op.blockId >= shuntBase;
      const cell: Cell = {
        row: op.row,
        col: op.col,
        kind: isShunt ? 'shunt' : 'block',
        effectId: op.blockId,
        display: op.display,
        pack: isShunt ? null : packFor(op.display),
        color: isShunt ? SHUNT_COLOR : statusColor(op.display),
        fromRows: []
      };
      const i = idx(op.row, op.col);
      if (i >= 0) all[i] = cell;
      else all.push(cell);
    } else if (op.kind === 'remove') {
      const i = idx(op.row, op.col);
      if (i >= 0) all.splice(i, 1);
    } else if (op.kind === 'cable') {
      const i = idx(op.destRow, op.srcCol + 1);
      if (i < 0) continue;
      const fr = new Set(all[i].fromRows);
      if (op.connect) fr.add(op.srcRow);
      else fr.delete(op.srcRow);
      all[i] = { ...all[i], fromRows: uniqSort([...fr]) };
    }
  }
  return split(layout, all);
}

/** Connect `src` → `(destRow,destCol)` spanning any later column (lays shunts through gaps, chains
 *  through existing cells, bends into destRow on the last hop) — same plan as the live editor. */
export function connectOnLayout(layout: Layout, src: Cell, destRow: number, destCol: number, shuntBase: number): EditResult {
  const plan = planConnect(
    toRouteCells(layout.cells),
    toRouteCells(layout.shunts),
    { row: src.row, col: src.col, display: src.display },
    destRow,
    destCol,
    shuntBase
  );
  if (!plan.ok) return { ok: false, error: plan.error, layout };
  return { ok: true, layout: applyRouteOps(layout, plan.ops, shuntBase) };
}

/** Replace a SHUNT with a block, moving the shunt's cable topology onto it (add-block or move-onto). */
export function replaceShuntOnLayout(
  layout: Layout,
  target: Cell,
  block: { blockId: number; display: string; src?: Cell },
  shuntBase: number
): EditResult {
  const plan = planReplaceShunt(toRouteCells(layout.cells), toRouteCells(layout.shunts), toRouteCells([target])[0], {
    blockId: block.blockId,
    display: block.display,
    src: block.src
      ? { row: block.src.row, col: block.src.col, effectId: block.src.effectId, display: block.src.display, fromRows: block.src.fromRows }
      : undefined
  });
  if (!plan.ok) return { ok: false, error: plan.error, layout };
  return { ok: true, layout: applyRouteOps(layout, plan.ops, shuntBase) };
}

/** Move a placed block to another cell. Dropping onto a shunt replaces it (cables move onto the block);
 *  a same-column move preserves the block's wiring (feeders + downstream taps re-point to the new row);
 *  a cross-column move drops cables that no longer reach (device default). Mirrors editor.svelte.ts. */
export function moveOnLayout(layout: Layout, src: Cell, row: number, col: number, shuntBase: number): EditResult {
  if (src.row === row && src.col === col) return { ok: true, layout };
  const dest = [...layout.cells, ...layout.shunts].find((c) => c.row === row && c.col === col);
  if (dest?.kind === 'shunt') return replaceShuntOnLayout(layout, dest, { blockId: src.effectId, display: src.display, src }, shuntBase);
  if (dest) return { ok: false, error: 'Cell occupied', layout };

  const sr = src.row;
  const sc = src.col;
  const sameCol = col === sc;
  const relocate = (c: Cell): Cell => {
    if (c.row === sr && c.col === sc) return { ...c, row, col, fromRows: sameCol ? [...c.fromRows] : [] };
    if (c.col === sc + 1 && c.fromRows.includes(sr)) {
      const fr = c.fromRows.filter((r) => r !== sr);
      if (sameCol) fr.push(row);
      return { ...c, fromRows: uniqSort(fr) };
    }
    return cloneCell(c);
  };
  return { ok: true, layout: { ...layout, cells: layout.cells.map(relocate), shunts: layout.shunts.map(relocate) } };
}

/** Remove the cell at (row,col), also stripping its now-dangling feed from the immediate next column. */
export function removeAtOnLayout(layout: Layout, row: number, col: number): Layout {
  const strip = (c: Cell): Cell =>
    c.col === col + 1 && c.fromRows.includes(row) ? { ...c, fromRows: c.fromRows.filter((r) => r !== row) } : cloneCell(c);
  return {
    ...layout,
    cells: layout.cells.filter((c) => !(c.row === row && c.col === col)).map(strip),
    shunts: layout.shunts.filter((c) => !(c.row === row && c.col === col)).map(strip)
  };
}

/** Remove one cable `(srcRow,srcCol) → (destRow, srcCol+1)` from the layout. */
export function disconnectOnLayout(layout: Layout, srcRow: number, srcCol: number, destRow: number, shuntBase: number): Layout {
  return applyRouteOps(layout, [{ kind: 'cable', srcRow, srcCol, destRow, connect: false }], shuntBase);
}

/** Toggle a block's bypass in-memory (grid targets render bypass off the layout, not convertScratch). */
export function bypassOnLayout(layout: Layout, row: number, col: number): Layout {
  const flip = (c: Cell): Cell => (c.row === row && c.col === col && c.kind === 'block' ? { ...c, bypassed: !c.bypassed } : cloneCell(c));
  return { ...layout, cells: layout.cells.map(flip), shunts: layout.shunts.map(cloneCell) };
}
