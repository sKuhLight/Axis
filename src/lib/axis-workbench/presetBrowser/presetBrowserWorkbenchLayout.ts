import type { AxisPresetBrowserPart } from './types';

// Lazy row batching for the list part (§4.1): mount the first screenful so dock mounts stay fast,
// then append the next batch as the user scrolls the list. No "Show all" expander, no full-library
// DOM mount — this mirrors the Grid page's quick-search overlay (AxisPresetBrowserSearchOverlay).
export const AXIS_PB_INITIAL_ROWS = 20;
export const AXIS_PB_SCROLL_BATCH = 20;

export interface AxisPbPresetReveal {
  highlightIndex: number;
  visibleCount: number;
}

export function axisPbPresetReveal(
  totalRows: number,
  currentIndex: number,
  initialRows: number
): AxisPbPresetReveal {
  if (totalRows <= 0 || currentIndex < 0) return { highlightIndex: 0, visibleCount: initialRows };
  const highlightIndex = Math.min(currentIndex, totalRows - 1);
  const trailingRows = Math.floor(initialRows / 2);
  return {
    highlightIndex,
    visibleCount: Math.min(totalRows, Math.max(initialRows, highlightIndex + trailingRows + 1))
  };
}

// Grow the visible window by one batch, clamped to the total. Pure so the scroll-growth step is
// unit-testable without a DOM (components are never unit-mounted — see the testing convention).
export function nextAxisPbVisibleCount(visible: number, total: number, batch = AXIS_PB_SCROLL_BATCH): number {
  return Math.min(Math.max(visible, 0) + batch, total);
}

// The fields that define a RESULT SET. The list starts back at the first batch + top of the scroller
// only when one of these changes. Selection, marking, overlay and detail state all emit new controller
// snapshots too, so the list cannot key off snapshot identity — doing so reset the scroll on every
// row click/right-click and made the list jump. See PbListBody's "start a new result set" effect.
export interface AxisPbResultSetFields {
  queryText: string;
  sort: string;
  sortDir: string;
  presenceView: string;
  sourceId: string;
}

export function axisPbResultSetKey(fields: AxisPbResultSetFields): string {
  return [fields.queryText, fields.sort, fields.sortDir, fields.presenceView, fields.sourceId].join('\u0000');
}

// Overlay ownership rank (§1): the lowest-rank mounted part owns all pickers/menus/dialogs/toasts.
export const AXIS_PB_OWNER_RANK: Record<AxisPresetBrowserPart, number> = {
  list: 0,
  detail: 1,
  sources: 2,
  full: 3
};

export function axisPbRank(part: AxisPresetBrowserPart): number {
  return AXIS_PB_OWNER_RANK[part] ?? 3;
}

// Elect the owner among a set of mounted parts: the one with the lowest rank. Returns null when the
// set is empty. Ties resolve to the first-registered part (stable order preserved by the caller).
export function electAxisPbOwner(parts: Iterable<AxisPresetBrowserPart>): AxisPresetBrowserPart | null {
  let best: AxisPresetBrowserPart | null = null;
  let bestRank = Infinity;
  for (const part of parts) {
    const rank = axisPbRank(part);
    if (rank < bestRank) {
      bestRank = rank;
      best = part;
    }
  }
  return best;
}
