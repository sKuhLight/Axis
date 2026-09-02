// Frequent tags for the docked preset browser's Filters sidebar. Replaces the old hardcoded
// "Quick tags" palette (author-curated labels with zero relationship to what any given user
// actually tags their presets with) with a row driven by real usage frequency: how often the user
// has picked a tag via a tag chip or the "Pick a tag" picker. The most-used tags win the row's
// slots; they are displayed in alphabetical order, not count order (see frequentTagRow). Local-only
// (no store mirror — matches the lighter MRU idiom used by CabPicker/PresetPicker/CommandPalette
// `recents`, not the heavier saved-filters dual-write).
const AXIS_PB_FREQUENT_TAGS_KEY = 'axs.pb.frequentTags';
export const AXIS_PB_FREQUENT_TAGS_MAX = 12; // same chip count the old quick-tags row showed

export type AxisPbTagCounts = Record<string, number>;

export function loadTagCounts(): AxisPbTagCounts {
  try {
    const raw = localStorage.getItem(AXIS_PB_FREQUENT_TAGS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: AxisPbTagCounts = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function persistTagCounts(counts: AxisPbTagCounts): void {
  try {
    localStorage.setItem(AXIS_PB_FREQUENT_TAGS_KEY, JSON.stringify(counts));
  } catch {
    /* storage unavailable (private mode / SSR) */
  }
}

// Case-insensitive increment: reuses an existing key's casing if the tag was already counted
// under different case, otherwise adds a new entry.
export function incrementTagCount(counts: AxisPbTagCounts, tag: string): AxisPbTagCounts {
  const existingKey = Object.keys(counts).find((k) => k.toLowerCase() === tag.toLowerCase());
  const key = existingKey ?? tag;
  return { ...counts, [key]: (counts[key] ?? 0) + 1 };
}

// Follow a tag rename (see src/lib/tagRename.ts) so a well-used tag keeps its history instead of
// restarting at zero and dropping out of the row. Merging onto a tag that already has a count SUMS
// them: both names were the same tag in the user's head, so the survivor inherits the whole history.
// Keys case-insensitively, like incrementTagCount.
export function renameTagCount(counts: AxisPbTagCounts, from: string, to: string): AxisPbTagCounts {
  const keys = Object.keys(counts);
  const fromKey = keys.find((k) => k.toLowerCase() === from.toLowerCase());
  if (fromKey === undefined) return counts;
  const toKey = keys.find((k) => k.toLowerCase() === to.toLowerCase());

  const out = { ...counts };
  delete out[fromKey];
  if (toKey !== undefined && toKey !== fromKey) out[toKey] = (counts[toKey] ?? 0) + counts[fromKey];
  else out[to] = counts[fromKey];
  return out;
}

// Displayed row: frequency decides MEMBERSHIP, never POSITION — and membership is drawn from the
// LIBRARY's tags, never from the counts. Counts are a separate localStorage map keyed by tag text,
// so a tag stays counted long after it is removed from the last preset carrying it; seeding the row
// from the counts (as this did) left those chips on screen forever, filtering to nothing when
// clicked. Ranking the library's own tags instead makes the row a strict subset of what the presets
// actually have, which is what the last line of this comment always claimed and never delivered.
//
// Counts are deliberately NOT pruned when a tag disappears: re-adding it restores its standing,
// the same rule tag colors follow (renameTagColorKey pins rather than discards). An unused count is
// inert — it can only rank a tag the library already has.
//
// Order is alphabetical, not count order. Counts are never rendered on the chips, so a count-ordered
// row reads as arbitrary AND re-sorts under the cursor on every recordTagUsage() (chip click, and
// both tag pickers): the chip you just hit jumps and the next click lands on the wrong tag. The row
// only shifts when a tag genuinely crosses in or out of the top MAX. Never empty for a library that
// has any tags at all, and never shows a tag the user's presets don't actually have.
export function frequentTagRow(counts: AxisPbTagCounts, libraryTags: string[]): string[] {
  // Counts key case-insensitively (the incrementTagCount idiom), so resolve through lowercase.
  const byLower = new Map(Object.entries(counts).map(([k, v]) => [k.toLowerCase(), v]));
  const countOf = (t: string) => byLower.get(t.toLowerCase()) ?? 0;
  return [...libraryTags]
    .sort((a, b) => countOf(b) - countOf(a) || a.localeCompare(b)) // membership: frequency-driven
    .slice(0, AXIS_PB_FREQUENT_TAGS_MAX)
    .sort((a, b) => a.localeCompare(b)); // position: alphabetical
}
