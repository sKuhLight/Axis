/**
 * Keyboard rows of a palette card grid (PaletteShell ↑ / ↓). The grid is
 * `columns` cards wide, but a full-width row (a section header, a note) ends
 * the row before it early and starts a fresh one — so "one row down" is not
 * `index + columns` there. `breaks` are the item indices such a full-width row
 * sits before.
 *
 * ↓ goes to the same column of the next row (its last card when that row is
 * shorter), ↓ on the last row to the last card; ↑ mirrors it (↑ on the first
 * row: the first card). Without breaks this is exactly `index ± columns`,
 * clamped to the list.
 */
export function paletteGridRows(count: number, columns: number, breaks: readonly number[] = []): number[][] {
  const width = Math.max(1, Math.floor(columns) || 1);
  const starts = new Set(breaks);
  const rows: number[][] = [];
  for (let index = 0; index < count; index++) {
    const row = rows[rows.length - 1];
    if (!row || row.length >= width || (index > 0 && starts.has(index))) rows.push([index]);
    else row.push(index);
  }
  return rows;
}

export function paletteRowMove(index: number, count: number, columns: number, key: 'ArrowUp' | 'ArrowDown', breaks: readonly number[] = []): number {
  if (count <= 0) return 0;
  const rows = paletteGridRows(count, columns, breaks);
  const at = Math.max(0, Math.min(count - 1, index));
  const r = rows.findIndex((row) => row.includes(at));
  const c = rows[r].indexOf(at);
  if (key === 'ArrowDown') {
    const next = rows[r + 1];
    return next ? next[Math.min(c, next.length - 1)] : count - 1;
  }
  const prev = rows[r - 1];
  return prev ? prev[Math.min(c, prev.length - 1)] : 0;
}
