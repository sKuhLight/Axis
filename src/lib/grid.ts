// Build the Signal Grid from the REAL decoded preset grid (/preset/grid):
// true block placement (row/col) + true routing (per-cell input mask → cables).
// Block contents/bypass/channel are layered on from /status by id where available.
import type { GridCell, PresetBlock, PresetGrid } from './types';
import { statusColor, packFor } from './blocks';

export interface Cell {
  row: number;
  col: number;
  kind: 'block' | 'shunt';
  effectId: number;
  display: string; // "Amp 1"
  pack: string | null; // editor pack key, or null
  color: string;
  fromRows: number[]; // previous-column rows that feed this cell
  bypassed?: boolean;
  channel?: string;
}

export interface Layout {
  cells: Cell[]; // placed blocks (non-shunt)
  shunts: Cell[]; // routing pass-through cells
  rows: number;
  cols: number;
  name: string;
  model: string;
  crcValid: boolean;
}

/** Map the decoded grid (+ optional placed-block state for bypass/channel) into a layout. */
export function layoutFromGrid(grid: PresetGrid, blocks: PresetBlock[] = []): Layout {
  // index placed blocks by effectId so a grid cell can pick up its live bypass/channel
  const byId = new Map<number, PresetBlock>();
  for (const b of blocks) byId.set(b.effectId, b);

  const toCell = (g: GridCell): Cell => {
    const st = byId.get(g.effectId);
    return {
      row: g.row,
      col: g.col,
      kind: g.isShunt ? 'shunt' : 'block',
      effectId: g.effectId,
      display: g.name,
      // API v2 cells may carry the catalog slug directly (AM4) — prefer it over the name lookup
      pack: g.isShunt ? null : (g.slug ?? packFor(g.name)),
      color: g.isShunt ? '#3a3a44' : statusColor(g.name),
      fromRows: g.fromRows ?? [],
      bypassed: st?.bypassed ?? undefined,
      channel: st?.channel ?? undefined
    };
  };

  const all = grid.cells.map(toCell);
  return {
    cells: all.filter((c) => c.kind === 'block'),
    shunts: all.filter((c) => c.kind === 'shunt'),
    rows: grid.rows,
    cols: grid.cols,
    name: grid.name,
    model: grid.model,
    crcValid: grid.crcValid
  };
}

/** Real routing cables: each cell is fed from its `fromRows` in the previous column. */
export function cablesFor(layout: Layout, cw: number, ch: number, gap: number) {
  const center = (row: number, col: number) => ({
    x: col * (cw + gap) + cw / 2,
    y: row * (ch + gap) + ch / 2
  });
  const all = [...layout.cells, ...layout.shunts];
  const paths: { d: string; stroke: string }[] = [];
  for (const c of all) {
    if (c.col === 0 || c.fromRows.length === 0) continue;
    const dst = center(c.row, c.col);
    for (const r of c.fromRows) {
      const src = center(r, c.col - 1);
      // gentle S-curve between columns so parallel rows read clearly
      const mx = (src.x + dst.x) / 2;
      paths.push({
        d: `M ${src.x} ${src.y} C ${mx} ${src.y} ${mx} ${dst.y} ${dst.x} ${dst.y}`,
        stroke: c.color === '#3a3a44' ? '#5a5a66' : c.color
      });
    }
  }
  return paths;
}
