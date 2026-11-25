/** Convert persisted placement to bounded CSS. A full row always follows the panel's current width. */
export function widgetGridPlacement(value: unknown, columns: number): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const p = value as Record<string, unknown>;
  const n = (value: unknown, min = 1): number | null => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.round(value)) : null;
  const cols = Math.max(1, Math.round(columns) || 1);
  const col = n(p.column) ?? (n(p.x, 0) != null ? n(p.x, 0)! + 1 : null);
  const column = col == null ? null : Math.min(cols, col);
  const row = n(p.row) ?? (n(p.y, 0) != null ? n(p.y, 0)! + 1 : null);
  const w = n(p.colSpan ?? p.w);
  const width = w == null ? null : Math.min(w, cols - (column ?? 1) + 1);
  const h = n(p.rowSpan ?? p.h);
  const rules: string[] = [];
  if (p.fullRow === true) rules.push('grid-column: 1 / -1');
  else if (column != null) rules.push(`grid-column: ${column} / span ${width ?? 1}`);
  else if (width != null) rules.push(`grid-column: span ${width}`);
  if (row != null) rules.push(`grid-row: ${row} / span ${h ?? 1}`);
  else if (h != null) rules.push(`grid-row: span ${h}`);
  if (h != null && h > 1) rules.push('align-self: stretch');
  return rules.join('; ');
}
