// Lay out the current preset's real blocks (from /status) into a grid.
// Positions are a chain-ordered SNAKE layout (real routing/positions need the preset-blob
// decode later) — but the block CONTENTS, bypass and channel are real device state.
import type { StatusBlock } from './types';
import { statusColor, baseName, packFor, chainOrder } from './blocks';

export const COLS = 6;

export interface Cell {
  row: number;
  col: number;
  kind: 'block' | 'empty';
  display?: string; // label, e.g. "Compressor"
  pack?: string | null; // editor pack key, or null if none
  bypassed?: boolean;
  channel?: string;
  color?: string;
}

export interface Layout {
  cells: Cell[]; // block cells, in chain order
  empties: Cell[]; // filler cells to complete the rectangle
  rows: number;
}

export function layoutFromStatus(status: StatusBlock[]): Layout {
  const sorted = [...status].sort((a, b) => chainOrder(a.name) - chainOrder(b.name));
  const rows = Math.max(1, Math.ceil(sorted.length / COLS));
  const cells: Cell[] = [];
  const used = new Set<string>();
  sorted.forEach((b, i) => {
    const row = Math.floor(i / COLS);
    const col = row % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS); // snake
    used.add(`${row},${col}`);
    cells.push({
      row, col, kind: 'block',
      display: baseName(b.name), pack: packFor(b.name),
      bypassed: b.bypassed, channel: b.channel, color: statusColor(b.name)
    });
  });
  const empties: Cell[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < COLS; c++)
      if (!used.has(`${r},${c}`)) empties.push({ row: r, col: c, kind: 'empty' });
  return { cells, empties, rows };
}

/** Straight cable paths between consecutive blocks in the chain (cell-center coords). */
export function cablesFor(cells: Cell[], cw: number, ch: number, gap: number) {
  const center = (c: Cell) => ({ x: c.col * (cw + gap) + cw / 2, y: c.row * (ch + gap) + ch / 2 });
  const paths: { d: string; stroke: string }[] = [];
  for (let i = 0; i < cells.length - 1; i++) {
    const a = center(cells[i]);
    const b = center(cells[i + 1]);
    paths.push({ d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, stroke: cells[i].color ?? '#6e6e78' });
  }
  return paths;
}
