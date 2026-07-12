import type { AxisPresetBrowserPart } from './types';

// Soft row cap for the list part (§4.1): mount a small page first so dock mounts stay fast, then the
// "Show all {N} presets" expander reveals the rest.
export const AXIS_PB_SOFT_ROW_CAP = 14;

export interface AxisPbRowCap<T> {
  rows: T[];
  totalRows: number;
  capped: boolean;
  hiddenCount: number;
}

// Apply the soft cap. When `showAll` is false and there are more than the cap, only the first
// AXIS_PB_SOFT_ROW_CAP rows are returned; `capped` flags that an expander should render.
export function applyRowCap<T>(list: T[], showAll: boolean): AxisPbRowCap<T> {
  const totalRows = list.length;
  const capped = !showAll && totalRows > AXIS_PB_SOFT_ROW_CAP;
  const rows = capped ? list.slice(0, AXIS_PB_SOFT_ROW_CAP) : list;
  return { rows, totalRows, capped, hiddenCount: capped ? totalRows - rows.length : 0 };
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
