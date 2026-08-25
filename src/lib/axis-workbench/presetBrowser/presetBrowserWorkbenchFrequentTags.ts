// Frequent tags for the docked preset browser's Filters sidebar. Replaces the old hardcoded
// "Quick tags" palette (author-curated labels with zero relationship to what any given user
// actually tags their presets with) with a row driven by real usage frequency: how often the
// user has picked a tag via a tag chip or the "Pick a tag" picker. The most-used tags win the row's
// slots; they are displayed in alphabetical order, not count order (see frequentTagRow). Local-only
// (no cloud mirror — matches the lighter MRU idiom used by CabPicker/PresetPicker/CommandPalette
// `recents`, not the heavier saved-filters dual-write).
const AXIS_PB_FREQUENT_TAGS_KEY = 'axs.pb.frequentTags';
export const AXIS_PB_FREQUENT_TAGS_MAX = 12; // same chip count the old quick-tags row showed

// App color tokens (src/app.css), not hex literals — axis-workbench components must use tokens.
// 7 distinct hues for chip variety, no per-label curation (color is assigned by hashing the tag
// text, see frequentTagColor).
export const AXIS_PB_FREQUENT_TAG_PALETTE = [
  'var(--accent)',
  'var(--accentbright)',
  'var(--amber)',
  'var(--blue)',
  'var(--danger)',
  'var(--ok)',
  'var(--accentdim)'
];

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

// Displayed row: frequency decides MEMBERSHIP, never POSITION. Candidates are counted tags ranked
// by count desc (ties broken alphabetically for determinism), padded with any library tags that
// have no count yet, capped at MAX — then the surviving row is sorted alphabetically for display.
// Counts are never rendered on the chips, so a count-ordered row reads as arbitrary AND re-sorts
// under the cursor every time a tag is used: the chip you just hit jumps and the next click lands
// on the wrong tag. Alphabetical is scannable and stable; the row only shifts when a tag genuinely
// crosses in or out of the top MAX. Never empty for a library that has any tags at all, and never
// shows a tag the user's presets don't actually have.
export function frequentTagRow(counts: AxisPbTagCounts, libraryTags: string[]): string[] {
  const counted = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const seen = new Set(counted.map((t) => t.toLowerCase()));
  const padding = libraryTags
    .filter((t) => !seen.has(t.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return [...counted, ...padding]
    .slice(0, AXIS_PB_FREQUENT_TAGS_MAX) // membership: frequency-driven
    .sort((a, b) => a.localeCompare(b)); // position: alphabetical
}

// Color hashed off the tag text (not chip position): membership changes can shift a chip's index,
// so an index-based color would flicker between colors as tags enter and leave the row.
export function frequentTagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h + tag.charCodeAt(i)) | 0;
  return AXIS_PB_FREQUENT_TAG_PALETTE[Math.abs(h) % AXIS_PB_FREQUENT_TAG_PALETTE.length];
}
