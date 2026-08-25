// Renaming a tag, in one place. A tag is not a record anywhere — it is a bare string repeated
// across every preset that carries it, plus a key in the color registry (tagColors.ts) and a key in
// the Frequent Tags usage counts (presetBrowserWorkbenchFrequentTags.ts). So a rename is three
// independent rewrites that must agree on which stored entry a tag is, which is why all of them key
// case-insensitively (the `findTagKey` idiom).
//
// These two helpers are pure so they unit-test in the `node` vitest project; `library.renameTag`
// orchestrates them and owns persistence. The counts rewrite lives with the counts, in
// presetBrowserWorkbenchFrequentTags.ts.
//
// NOT handled here, deliberately: saved filters (localStorage["axs.pb.saved"]) and the live filter
// conditions both keep the OLD tag name in their query text, so a filter on a renamed tag matches
// nothing until it is rebuilt. Rewriting stored user query strings means parsing and re-serializing
// them, with its own failure modes; the rule we ship instead is simply "renaming a tag doesn't touch
// filters", which at least applies uniformly to saved and live ones.

import { fallbackSwatch, findTagKey } from './tagColors';

/** Rewrite `from` → `to` across every preset's tag list. Matches `from` case-insensitively, so a
 *  pure recase ("crunch" → "Crunch") rewrites rather than no-ops. When a preset already carries
 *  `to`, the rename MERGES: the duplicate collapses and the first occurrence keeps its position, so
 *  renaming a typo onto the real tag cleans up instead of producing two identical pills.
 *
 *  A rename never empties a preset's tag list (it substitutes, it does not remove), so unlike
 *  `removeTag` this never has to delete a preset's key. */
export function renameTagAssignments(
  tags: Record<string, string[]>,
  from: string,
  to: string
): Record<string, string[]> {
  const lowerFrom = from.toLowerCase();
  const out: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(tags)) {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const tag of list) {
      const replaced = tag.toLowerCase() === lowerFrom ? to : tag;
      const key = replaced.toLowerCase();
      if (seen.has(key)) continue; // merged onto a tag this preset already had
      seen.add(key);
      next.push(replaced);
    }
    out[id] = next;
  }
  return out;
}

/** Move a tag's color to its new name. Three cases, all keyed case-insensitively:
 *  - recase ("crunch" → "Crunch"): the same stored entry is re-keyed, index preserved.
 *  - merge onto a tag that already has a stored color: the TARGET's color wins and the source entry
 *    is dropped. You are merging into `to`, so `to` should keep looking like itself.
 *  - plain rename: the index moves to the new key.
 *
 *  A source with NO stored entry is not left alone: `colorOf` falls back to a hash of the tag TEXT,
 *  so a rename would silently recolor the tag (the exact "same tag, two colors" confusion the single
 *  resolver exists to prevent). Pin that fallback under the new name instead, so what the user sees
 *  survives the rename whether or not the swatch had been claimed yet. */
export function renameTagColorKey(
  colors: Record<string, number>,
  from: string,
  to: string
): Record<string, number> {
  const fromKey = findTagKey(colors, from);
  const toKey = findTagKey(colors, to);

  if (toKey !== undefined && toKey !== fromKey) {
    if (fromKey === undefined) return colors; // target already committed; nothing to move
    const out = { ...colors };
    delete out[fromKey];
    return out;
  }

  const out = { ...colors };
  if (fromKey !== undefined) delete out[fromKey];
  out[to] = fromKey !== undefined ? colors[fromKey] : fallbackSwatch(from);
  return out;
}
