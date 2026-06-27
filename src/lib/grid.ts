// Demo signal-grid layout (a LAYOUT PREVIEW until func 0x20 gives the real preset routing).
// Uses real block names in a plausible chain so the design is faithful.
import { colorOf } from './blocks';

export interface Cell {
  row: number;
  col: number;
  kind: 'block' | 'shunt' | 'empty';
  block?: string;
  glyph?: string;
  type?: string;
  channel?: string;
  bypassed?: boolean;
  level?: number; // 0..1 fill (demo)
}

export const COLS = 6;
export const ROWS = 4;

const GLYPH: Record<string, string> = {
  Input: 'I', Output: 'O', Comp: '⊐', Drive: '◣', Amp: 'A', Cab: '▥',
  Reverb: '≋', Delay: '⊡', Pitch: '♯', Wah: 'W', Peq: '∿', Geq: '⊪',
  Filter: 'ƒ', Chorus: '∽', Flanger: '⌇', Phaser: 'φ', Tremolo: 'T',
  Rotary: '↻', Volume: 'V', Mixer: '⊞', Multitap: '⋮', Formant: 'ɵ', Enhancer: '✦'
};
const glyph = (b: string) => GLYPH[b] ?? b[0];
const typeOf: Record<string, string> = {
  Amp: '5153 100W', Cab: 'Legacy 4x12', Drive: 'TS9', Reverb: 'Large Hall',
  Delay: 'Digital', Comp: 'Studio'
};

// A plausible main chain + a parallel branch — a preview, not the real preset.
const MAIN = ['Input', 'Comp', 'Drive', 'Amp', 'Cab', 'Output'];
const ROW1 = ['', 'Wah', '', 'Reverb', 'Delay', ''];

function blk(row: number, col: number, b: string): Cell {
  return {
    row, col, kind: 'block', block: b, glyph: glyph(b),
    type: typeOf[b] ?? b, level: 0.55 + ((col * 7) % 30) / 100,
    channel: 'A', bypassed: b === 'Wah'
  };
}

export function demoGrid(available: string[]): Cell[] {
  const has = new Set(available);
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const src = r === 0 ? MAIN[c] : r === 1 ? ROW1[c] : '';
      if (src && has.has(src)) cells.push(blk(r, c, src));
      else if (r === 0 && c > 0) cells.push({ row: r, col: c, kind: 'shunt' });
      else cells.push({ row: r, col: c, kind: 'empty' });
    }
  return cells;
}

// straight cable paths between consecutive blocks on a row (cell-center coords)
export function demoCables(cells: Cell[], cw: number, ch: number, gap: number) {
  const paths: { d: string; stroke: string }[] = [];
  const center = (c: Cell) => ({
    x: c.col * (cw + gap) + cw / 2,
    y: c.row * (ch + gap) + ch / 2
  });
  for (let r = 0; r < ROWS; r++) {
    const row = cells.filter((c) => c.row === r && c.kind === 'block').sort((a, b) => a.col - b.col);
    for (let i = 0; i < row.length - 1; i++) {
      const a = center(row[i]);
      const b = center(row[i + 1]);
      paths.push({ d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, stroke: colorOf(row[i].block!) });
    }
  }
  return paths;
}
