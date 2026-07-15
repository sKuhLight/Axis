// GRID-target bridge for the OFFLINE cross-device preset converter (META-24 · AXIS-47/48, Stage 1).
//
// Slot/chain targets (AM4/VP4) start with an EMPTY grid + a tray and the user places blocks one by one
// (convertScratchAdapter.ts `scratchToLayout`). GRID targets (gen-3: axe-fx-iii / fm9 / fm3) are the
// opposite: the converter already placed EVERY block with full 2-D routing, carried on
// `base.routing.gridCells` in the SAME shape as the live `forgefx.grid()` response. So a grid target
// renders the FULL grid (blocks + shunts + cables) by wrapping those cells into a `PresetGrid` and
// reusing the live `layoutFromGrid` (grid.ts) verbatim — no tray, no synthetic effect ids.
//
// Framework-free (no runes / DOM / network) and unit-tested (convertGridAdapter.test.ts).

import type { Cell, Layout } from './grid';
import { layoutFromGrid } from './grid';
import type { ScratchState } from './convertScratch';
import type { ConverterBlock, ConverterPreset, GridCell, PresetGrid } from './types';

/** The converter's grid cells carry a `blockKey` back-reference (the ScratchBlock they belong to) on top
 *  of the wire `GridCell` shape. `types.ts` types `routing.gridCells` as `unknown`; this is the concrete
 *  runtime shape the offline surface consumes. */
export type ConverterGridCell = GridCell & { blockKey?: string | null };

/** Read `base.routing.gridCells` as a typed array (empty when absent / malformed). */
export function gridCellsOf(state: ScratchState): ConverterGridCell[] {
  const raw = (state.base?.routing as { gridCells?: unknown } | undefined)?.gridCells;
  return Array.isArray(raw) ? (raw as ConverterGridCell[]) : [];
}

/** Whether this conversion targets a 2-D routing grid (gen-3) vs a slot/chain device (AM4/VP4). */
export function isGridTarget(state: ScratchState | null): boolean {
  return state?.topology.kind === 'grid';
}

/** Read a source {@link ConverterPreset}'s `routing.gridCells` as a typed array (empty when absent /
 *  malformed — e.g. slot/chain sources like AM4/VP4 carry no 2-D grid). Same cell shape as
 *  {@link gridCellsOf} reads off a target's scratch state. */
export function gridCellsOfPreset(preset: ConverterPreset): ConverterGridCell[] {
  const raw = (preset.routing as { gridCells?: unknown } | undefined)?.gridCells;
  return Array.isArray(raw) ? (raw as ConverterGridCell[]) : [];
}

/** Shared read-only `Layout` builder: wrap raw routing cells in a `PresetGrid` and reuse the live
 *  `layoutFromGrid` so blocks / shunts / cables render exactly as they do for a real device. */
function buildGridLayout(cells: ConverterGridCell[], rows: number, cols: number, name: string, model: string): Layout {
  const grid: PresetGrid = { model, name, crcValid: true, rows, cols, scenes: [], cells };
  return layoutFromGrid(grid);
}

/** Build the editable `Layout` for a grid TARGET from the converter's routing cells. */
export function gridLayoutFromScratch(state: ScratchState): Layout {
  return buildGridLayout(gridCellsOf(state), state.topology.rows, state.topology.cols, state.name, state.targetDevice);
}

/** Build a read-only `Layout` for the SOURCE preset's grid (the reference + drag-source rendering).
 *  Rows/cols are derived from the routing-cell extent (min 4×12). An absent/empty `gridCells` (slot/
 *  chain sources) yields an EMPTY layout — the source panel renders a block-name list instead. */
export function gridLayoutFromConverterPreset(preset: ConverterPreset): Layout {
  const cells = gridCellsOfPreset(preset);
  const rows = Math.max(4, cells.reduce((m, c) => Math.max(m, c.row + 1), 0));
  const cols = Math.max(12, cells.reduce((m, c) => Math.max(m, c.col + 1), 0));
  return buildGridLayout(cells, rows, cols, preset.name, preset.sourceDevice);
}

/** True when a ConverterBlock is placed on a 2-D grid (carries {row,col}). */
function isRowCol(p: ConverterBlock['position']): p is { row: number; col: number } {
  return !!p && typeof p === 'object' && 'row' in p && 'col' in p;
}

/** Map each SOURCE block cell's effectId → its ConverterBlock key, so the read-only source grid's drag
 *  handles can address the target equivalent (same `key` in the target scratch buffer). Prefers the
 *  cell's `blockKey` back-reference; falls back to the block sharing the cell's {row,col}. Shunts are
 *  excluded. Mirrors {@link effectKeyMap} for a decoded source preset. */
export function presetEffectKeyMap(preset: ConverterPreset): Map<number, string> {
  const out = new Map<number, string>();
  for (const c of gridCellsOfPreset(preset)) {
    if (c.isShunt) continue;
    let key = typeof c.blockKey === 'string' ? c.blockKey : null;
    if (!key) key = preset.blocks.find((b) => isRowCol(b.position) && b.position.row === c.row && b.position.col === c.col)?.key ?? null;
    if (key) out.set(c.effectId, key);
  }
  return out;
}

/** Map a cell's (stable) `effectId` → its ScratchBlock key, so the offline surface can address the block
 *  for open/param/bypass/commit even after in-memory moves relocate its cell. Prefers the cell's explicit
 *  `blockKey`; falls back to the ScratchBlock sharing the cell's seed coordinate. Shunts are excluded. */
export function effectKeyMap(state: ScratchState): Map<number, string> {
  const out = new Map<number, string>();
  for (const c of gridCellsOf(state)) {
    if (c.isShunt) continue;
    let key = typeof c.blockKey === 'string' ? c.blockKey : null;
    if (!key) key = state.blocks.find((b) => b.position && b.position.row === c.row && b.position.col === c.col)?.key ?? null;
    if (key) out.set(c.effectId, key);
  }
  return out;
}

/** Resolve the ScratchBlock key for a grid `Cell` via the effect-id map (null for shunts / unmapped). */
export function keyForGridCell(map: Map<number, string>, cell: Cell): string | null {
  return cell.kind === 'shunt' ? null : (map.get(cell.effectId) ?? null);
}
