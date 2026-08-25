// A tag's color, in one place. Stored as an index into a hand-picked swatch table. Every render
// site (row pills, Frequent Tags chips, detail tag row, filter chips, the monolith) resolves through
// `library.colorOf`, which wraps this module — see library.svelte.ts.

// One swatch per named color family — fixed, vivid hex, the same style already proven by the block
// family palette (`CAT` in presetBrowserWorkbenchRowChips.ts): a single saturated color per category
// that reads clearly on both Midnight and Paper, no per-theme derivation needed. An earlier version
// of this table derived every swatch from one shared OKLCH lightness/chroma and only varied hue —
// it read as uniformly gray/washed-out, because a lightness/chroma pair that's legible as text on
// both a near-black and a near-white background is necessarily too conservative to also look vivid.
// Hand-picking per swatch (like CAT does) is what actually gets saturated, distinct color. No gray
// or yellow-green: both sat too close to neighboring swatches (gray to brown, yellow-green to both
// yellow and blue-green) to earn a slot on their own.
const TAG_SWATCHES: readonly string[] = [
  '#e0503f', // red
  '#dd8a2e', // orange
  '#8a5a34', // brown
  '#d0b82e', // yellow
  '#2f9a5f', // blue-green
  '#2fb0c9', // cyan
  '#4a7fe0', // blue
  '#8a6fd6', // purple
  '#d65b9e' // pink
];

export const TAG_SWATCH_COUNT = TAG_SWATCHES.length;

/** Case-insensitive key lookup: the stored casing of `tag` if `map` already has an equivalent key,
 *  else undefined. Shared by every tag-keyed operation (claim, override, read) so they agree on
 *  which stored entry a tag belongs to regardless of how it was capitalized when first seen. */
export function findTagKey(map: Record<string, number>, tag: string): string | undefined {
  return Object.keys(map).find((k) => k.toLowerCase() === tag.toLowerCase());
}

/** CSS color for a stored swatch index. */
export function tagSwatchCss(i: number): string {
  const idx = ((i % TAG_SWATCH_COUNT) + TAG_SWATCH_COUNT) % TAG_SWATCH_COUNT;
  return TAG_SWATCHES[idx];
}

/** Least-used swatch index for `tag`, ties broken by lowest index. The first `TAG_SWATCH_COUNT`
 *  distinct tags each get a distinct swatch; the next one wraps onto whichever is currently least
 *  contended. Keys case-insensitively: if `assigned` already has a key equal to `tag` ignoring case, its index is
 *  reused (same idiom as `incrementTagCount` in presetBrowserWorkbenchFrequentTags.ts). */
export function claimSwatch(assigned: Record<string, number>, tag: string): number {
  const existingKey = findTagKey(assigned, tag);
  if (existingKey !== undefined) return assigned[existingKey];
  const counts = new Array(TAG_SWATCH_COUNT).fill(0);
  for (const idx of Object.values(assigned)) {
    if (Number.isInteger(idx) && idx >= 0 && idx < TAG_SWATCH_COUNT) counts[idx]++;
  }
  let best = 0;
  for (let i = 1; i < TAG_SWATCH_COUNT; i++) if (counts[i] < counts[best]) best = i;
  return best;
}

/** Validate a persisted/pushed tag→swatch map: drop non-string keys and non-integer or
 *  out-of-range values (mirrors `loadTagCounts`'s corrupt-payload handling). */
export function normalizeTagColors(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === 'string' && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < TAG_SWATCH_COUNT) {
      out[k] = v;
    }
  }
  return out;
}

/** Deterministic hash-based swatch for a tag that has no stored assignment yet (e.g. rendered before
 *  `ensureTagColors` runs) — never colorless, never flickers, but not persisted. */
export function fallbackSwatch(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % TAG_SWATCH_COUNT;
}
