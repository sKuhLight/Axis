export function nextOrderedIndex(currentIndex: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, currentIndex + direction));
}
