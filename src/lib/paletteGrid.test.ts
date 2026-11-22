import { describe, expect, it } from 'vitest';
import { paletteGridRows, paletteRowMove } from './paletteGrid';

describe('paletteGridRows', () => {
  it('chunks by columns, restarting a row after a full-width row', () => {
    expect(paletteGridRows(7, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    // A section header before item 4 (after a partial row 3) and before item 6.
    expect(paletteGridRows(9, 3, [4, 6])).toEqual([[0, 1, 2], [3], [4, 5], [6, 7, 8]]);
    // A break at 0 changes nothing; columns below 1 count as 1.
    expect(paletteGridRows(2, 0, [0])).toEqual([[0], [1]]);
    expect(paletteGridRows(0, 3)).toEqual([]);
  });
});

describe('paletteRowMove', () => {
  it('without breaks it is index ± columns, clamped to the list (the old shell math)', () => {
    for (const columns of [1, 2, 4]) {
      for (let hi = 0; hi < 9; hi++) {
        expect(paletteRowMove(hi, 9, columns, 'ArrowDown')).toBe(Math.min(8, hi + columns));
        expect(paletteRowMove(hi, 9, columns, 'ArrowUp')).toBe(Math.max(0, hi - columns));
      }
    }
  });

  it('↓ from a partial row before a section header lands in the next section, same column', () => {
    // PANELS: 0..5 (4 columns: rows [0-3], [4,5]) · PAGES: 6..8 · WIDGETS: 9..13.
    const breaks = [6, 9];
    expect(paletteRowMove(4, 14, 4, 'ArrowDown', breaks)).toBe(6);
    expect(paletteRowMove(5, 14, 4, 'ArrowDown', breaks)).toBe(7);
    // `index + columns` would have said 8 / 9.
    expect(paletteRowMove(1, 14, 4, 'ArrowDown', breaks)).toBe(5);
    // A shorter next row: its last card.
    expect(paletteRowMove(3, 14, 4, 'ArrowDown', breaks)).toBe(5);
    expect(paletteRowMove(8, 14, 4, 'ArrowDown', breaks)).toBe(11);
  });

  it('↑ mirrors it; the first row goes to the first card, the last row ↓ to the last', () => {
    const breaks = [6, 9];
    expect(paletteRowMove(6, 14, 4, 'ArrowUp', breaks)).toBe(4);
    expect(paletteRowMove(8, 14, 4, 'ArrowUp', breaks)).toBe(5);
    expect(paletteRowMove(9, 14, 4, 'ArrowUp', breaks)).toBe(6);
    expect(paletteRowMove(2, 14, 4, 'ArrowUp', breaks)).toBe(0);
    expect(paletteRowMove(12, 14, 4, 'ArrowDown', breaks)).toBe(13);
  });

  it('an empty list or an index out of range stays in bounds', () => {
    expect(paletteRowMove(0, 0, 4, 'ArrowDown', [2])).toBe(0);
    // Rows [0, 1] · [2] · [3, 4]: the last card, one row up.
    expect(paletteRowMove(99, 5, 2, 'ArrowUp', [3])).toBe(2);
  });
});
