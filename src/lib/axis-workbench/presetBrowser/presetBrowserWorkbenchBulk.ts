// Pure bulk-selection model for the preset-browser multi-select actions (tag / favorite / move).
//
// Given the controller's `marked` id map and the current data view's entries, it categorizes targets
// and derives the header/picker state. No store or component imports, so it is unit tested — the view
// owns every side effect (library mutations, opening the picker, opening the move dialog).

/** The subset of an entry the bulk model reads. `empty` marks a synthesized non-entry device slot
 *  (never taggable/favoritable); `sourceId` + `number` decide whether a slot can be cleared. */
export interface AxisPbBulkEntry {
  id: string;
  sourceId: string;
  number: number | null;
  fav: boolean;
  tags: string[];
  empty?: boolean;
}

export interface AxisPbBulkSummary {
  /** Number of truthy marked ids — what the selection header reports. */
  selected: number;
  /** Marked ids that resolve to a real (non-empty) entry — tag/favorite targets. */
  taggable: number;
  /** Marked device slot numbers (sorted, unique) — the Move seed. */
  deviceSlots: number[];
  /** The subset of `deviceSlots` that are real (non-empty) stored presets — the Clear seed. Empty
   *  slots are already blank, so they are excluded. */
  clearableSlots: number[];
  /** Every taggable target is already a favorite, so the header offers Unfavorite. */
  allFav: boolean;
}

/** Parse a `dev:<n>` id into its slot number, or null for any other id / malformed number. */
export function parseAxisPbDeviceSlot(id: string): number | null {
  if (!id.startsWith('dev:')) return null;
  const n = Number(id.slice('dev:'.length));
  return Number.isInteger(n) ? n : null;
}

/** Sorted, unique device slots among the marked ids — the same shape `controller.moveSlots()` seeds
 *  the move dialog with. */
export function axisPbMarkedDeviceSlots(marked: Readonly<Record<string, boolean>>): number[] {
  const slots: number[] = [];
  for (const id of Object.keys(marked)) {
    if (!marked[id]) continue;
    const n = parseAxisPbDeviceSlot(id);
    if (n != null) slots.push(n);
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

/**
 * Categorize the marked set against the current entries. An id that is marked but not present in
 * `entries` (filtered out, removed, or a synthesized empty slot) counts toward `selected` but is not
 * a tag/favorite target — so a stale mark can never ghost-tag a non-entry.
 */
export function axisPbMarkedSummary(
  marked: Readonly<Record<string, boolean>>,
  entries: readonly AxisPbBulkEntry[]
): AxisPbBulkSummary {
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  let selected = 0;
  let taggable = 0;
  let favCount = 0;
  const clearable: number[] = [];
  for (const id of Object.keys(marked)) {
    if (!marked[id]) continue;
    selected++;
    const entry = byId.get(id);
    if (!entry || entry.empty) continue;
    taggable++;
    if (entry.fav) favCount++;
    if (entry.sourceId === 'device' && entry.number != null && entry.number >= 0) clearable.push(entry.number);
  }
  return {
    selected,
    taggable,
    deviceSlots: axisPbMarkedDeviceSlots(marked),
    clearableSlots: [...new Set(clearable)].sort((a, b) => a - b),
    allFav: taggable > 0 && favCount === taggable
  };
}

/** Resolve the taggable marked entries (real, non-empty) in the data view's order. */
export function axisPbBulkTargets(
  marked: Readonly<Record<string, boolean>>,
  entries: readonly AxisPbBulkEntry[]
): AxisPbBulkEntry[] {
  return entries.filter((entry) => marked[entry.id] && !entry.empty);
}

export type AxisPbTagPresence = 'all' | 'some' | 'none';

/** How many of the taggable targets carry `tag`: all / some / none. A unique tag is added to every
 *  target; a shared one is removed from every target — so the picker toggles the whole selection. */
export function axisPbTagPresence(entries: readonly AxisPbBulkEntry[], tag: string): AxisPbTagPresence {
  if (!entries.length) return 'none';
  let have = 0;
  for (const entry of entries) if (entry.tags.includes(tag)) have++;
  if (have === 0) return 'none';
  return have === entries.length ? 'all' : 'some';
}

/** Count how many targets carry each tag — the picker's per-row count badge, keyed by tag. */
export function axisPbBulkTagCounts(entries: readonly AxisPbBulkEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    for (const tag of entry.tags) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}
