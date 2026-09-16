import { create, insertMultiple, search } from '@orama/orama';

// Orama-backed free-text search for the workbench Preset Browser — the ranked, typo-tolerant path the
// legacy monolith has always had (src/lib/preset/PresetBrowser.svelte). The pure machine lives here so
// it runs in the `node` vitest project; the idle-build + keystroke reactivity lives in the sibling
// `presetBrowserWorkbenchOrama.svelte.ts` rune store.
//
// Index schema mirrors the monolith exactly: one `{ id, text }` doc per entry, `text` being the SAME
// `entryHaystack` string the substring fallback uses, so ranked and fallback results can never
// disagree about what is searchable — only about ordering and fuzzy matching.

export interface AxisPbOramaDoc {
  id: string;
  text: string;
}

type AxisPbOramaSchema = { id: 'string'; text: 'string' };

export type AxisPbOramaDb = Awaited<ReturnType<typeof create<AxisPbOramaSchema>>>;

/** Build a fresh Orama index over the given docs. Batched insert (100/run) so a large library yields
 *  to the main thread instead of hitching it — the monolith's build does the same. */
export async function buildPresetBrowserOramaIndex(docs: Iterable<AxisPbOramaDoc>): Promise<AxisPbOramaDb> {
  const db = await create({ schema: { id: 'string', text: 'string' } });
  await insertMultiple(db, [...docs], 100);
  return db;
}

/**
 * Ranked free-text search: returns a Map of entry id → 0-based relevance rank (lowest = best match),
 * in Orama's own score order. `tolerance: 1` allows a single edit-distance mismatch, so a near-miss
 * spelling still resolves (the ranked analogue of the substring path's exactness).
 *
 * An empty term returns an empty Map — callers treat "no term" as "not searching" rather than as
 * "no matches" (so an empty query never blanks the list).
 */
export async function rankPresetBrowserOramaMatches(
  db: AxisPbOramaDb,
  term: string,
  limit = 2000
): Promise<Map<string, number>> {
  const q = term.trim();
  const rank = new Map<string, number>();
  if (!q) return rank;
  const result = await search(db, { term: q, tolerance: 1, limit });
  result.hits.forEach((hit, index) => rank.set(String(hit.document.id), index));
  return rank;
}
