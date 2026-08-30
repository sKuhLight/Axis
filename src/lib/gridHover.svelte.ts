// Transient "which grid cell is under the pointer" — used by the Backspace keybinding to remove the
// hovered cell (block or shunt) in addition to the selected one. Lives here (not on `editor`) so the
// shared SignalGrid/GridMap components can write it regardless of which EditorSurface (live or convert)
// drives them, without widening the EditorSurface contract.
export const gridHover = $state({ cell: null as { row: number; col: number } | null });

export function setGridHover(row: number, col: number): void {
  gridHover.cell = { row, col };
}
export function clearGridHover(row: number, col: number): void {
  if (gridHover.cell?.row === row && gridHover.cell?.col === col) gridHover.cell = null;
}
