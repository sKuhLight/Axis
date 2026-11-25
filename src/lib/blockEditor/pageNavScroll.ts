/** Reveal a tab with minimal movement; a tab wider than the viewport aligns its leading edge. */
export function revealOffset(scroll: number, viewport: number, start: number, size: number): number {
  if (viewport <= 0) return scroll;
  if (start < scroll || size > viewport) return Math.max(0, start - 3);
  if (start + size > scroll + viewport) return Math.max(0, start + size - viewport + 3);
  return scroll;
}
