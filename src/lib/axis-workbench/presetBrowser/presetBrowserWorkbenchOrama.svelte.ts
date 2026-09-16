import {
  buildPresetBrowserOramaIndex,
  rankPresetBrowserOramaMatches,
  type AxisPbOramaDb
} from './presetBrowserWorkbenchOrama';
import type { AxisPbPreparedEntry } from './presetBrowserWorkbenchData';

/**
 * Reactive wrapper around the pure Orama module, following the same rune-in-a-plain-function idiom as
 * `presetBrowserWorkbenchIndex.svelte.ts`. The index is built in IDLE time off the prepared haystacks
 * (never on the open/keystroke path — an eager build over every preset was the monolith's ~2s open
 * lag), and the free-text term is re-searched whenever it changes.
 *
 * Returns a `rank` getter: a Map of entry id → relevance rank while the index is ready and a term is
 * present, otherwise null. Consumers pass it to `createAxisPresetBrowserDataView` as `freeTextRank`;
 * null means "fall back to substring matching", so search works before the index finishes building.
 */
export function createPresetBrowserOramaIndex(
  prepared: () => Map<string, AxisPbPreparedEntry>,
  query: () => string
) {
  let db = $state.raw<AxisPbOramaDb | null>(null);
  let rank = $state.raw<Map<string, number> | null>(null);
  let indexedCount = -1;

  // Rebuild only when the library SIZE changes (add/remove, e.g. a scan or import) — matching the
  // monolith. Content-only edits (a rename) refresh on the next rebuild rather than per keystroke.
  $effect(() => {
    const count = prepared().size;
    if (count === indexedCount) return;
    let alive = true;
    const build = async () => {
      // Read the haystacks at build time (idle), not schedule time, so a change that landed while the
      // callback was queued is still reflected.
      const docs = [...prepared()].map(([id, entry]) => ({ id, text: entry.hay }));
      if (!docs.length) {
        if (alive) { db = null; indexedCount = count; }
        return;
      }
      const next = await buildPresetBrowserOramaIndex(docs);
      if (alive) { db = next; indexedCount = count; }
    };
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    const id = ric ? ric(() => void build(), { timeout: 1500 }) : (setTimeout(() => void build(), 250) as unknown as number);
    return () => { alive = false; if (ric && cic) cic(id); else clearTimeout(id); };
  });

  // Free-text → ranked id set. Null while there is no term OR the index isn't ready yet.
  $effect(() => {
    const term = query().trim();
    const current = db;
    if (!term || !current) { rank = null; return; }
    let alive = true;
    void (async () => {
      const next = await rankPresetBrowserOramaMatches(current, term);
      if (alive) rank = next;
    })();
    return () => { alive = false; };
  });

  return {
    get rank() {
      return rank;
    }
  };
}
