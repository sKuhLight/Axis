import { describe, expect, it, beforeEach } from 'vitest';

import {
  incrementTagCount,
  loadTagCounts,
  persistTagCounts,
  frequentTagRow,
  AXIS_PB_FREQUENT_TAGS_MAX,
  type AxisPbTagCounts
} from '../presetBrowser/presetBrowserWorkbenchFrequentTags';

// Minimal in-memory localStorage stub for the node test env.
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0
  } as Storage;
}

describe('Preset Browser frequent tags', () => {
  beforeEach(() => stubStorage());

  it('incrementTagCount adds a new tag at count 1', () => {
    expect(incrementTagCount({}, 'Lead')).toEqual({ Lead: 1 });
  });

  it('incrementTagCount increments an existing tag', () => {
    expect(incrementTagCount({ Lead: 2 }, 'Lead')).toEqual({ Lead: 3 });
  });

  it('incrementTagCount reuses the existing key casing on a case-insensitive match', () => {
    const next = incrementTagCount({ Lead: 1 }, 'LEAD');
    expect(next).toEqual({ Lead: 2 });
  });

  it('frequentTagRow returns the row alphabetically regardless of count', () => {
    const counts: AxisPbTagCounts = { Blues: 2, Lead: 5, Clean: 1 };
    expect(frequentTagRow(counts, [])).toEqual(['Blues', 'Clean', 'Lead']);
  });

  it('frequentTagRow admits equal-count tags deterministically', () => {
    const counts: AxisPbTagCounts = { Zeta: 3, Alpha: 3 };
    expect(frequentTagRow(counts, [])).toEqual(['Alpha', 'Zeta']);
  });

  it('frequentTagRow pads with unused library tags, interleaved alphabetically', () => {
    const counts: AxisPbTagCounts = { Lead: 1 };
    expect(frequentTagRow(counts, ['Zeta', 'Ambient', 'Lead'])).toEqual(['Ambient', 'Lead', 'Zeta']);
  });

  it('frequentTagRow dedupes library tags against counted tags case-insensitively', () => {
    const counts: AxisPbTagCounts = { lead: 1 };
    expect(frequentTagRow(counts, ['Lead', 'Bass'])).toEqual(['Bass', 'lead']);
  });

  it('frequentTagRow caps the combined list at AXIS_PB_FREQUENT_TAGS_MAX', () => {
    const libraryTags = Array.from({ length: AXIS_PB_FREQUENT_TAGS_MAX + 5 }, (_, i) => `lib${i}`);
    expect(frequentTagRow({}, libraryTags)).toHaveLength(AXIS_PB_FREQUENT_TAGS_MAX);
  });

  it('frequentTagRow returns an empty row for empty inputs', () => {
    expect(frequentTagRow({}, [])).toEqual([]);
  });

  // THE regression guard: counting a tag that is already in the row must not move anything. This is
  // the bug the alphabetical order exists to kill — under count-ordering the clicked chip jumped and
  // the next click landed on its neighbour.
  it.each(['Ambient', 'Lead', 'Zeta'])('frequentTagRow is unchanged after counting %s', (tag) => {
    const libraryTags = ['Zeta', 'Ambient', 'Lead', 'Motown'];
    const counts: AxisPbTagCounts = { Lead: 4, Ambient: 2, Zeta: 1 };
    const before = frequentTagRow(counts, libraryTags);
    const after = frequentTagRow(incrementTagCount(counts, tag), libraryTags);
    expect(after).toEqual(before);
  });

  // Alphabetical display must not cost the frequency selection: counts still pick the MAX members.
  it('frequentTagRow keeps a high-count tag that sorts last, and cuts a zero-count tag that sorts first', () => {
    // Zero-padded so lexicographic order matches numeric order (a-lib9 would otherwise sort last).
    const libraryTags = Array.from({ length: AXIS_PB_FREQUENT_TAGS_MAX }, (_, i) =>
      `a-lib${String(i).padStart(2, '0')}`
    );
    const row = frequentTagRow({ zzz: 99 }, libraryTags);
    expect(row).toHaveLength(AXIS_PB_FREQUENT_TAGS_MAX);
    expect(row).toContain('zzz'); // survives the cap on count alone
    expect(row).not.toContain('a-lib11'); // uncounted, so cut even though it sorts before zzz
    expect(row.at(-1)).toBe('zzz'); // …and is still displayed in alphabetical position
  });

  it('loadTagCounts returns {} when nothing is persisted', () => {
    expect(loadTagCounts()).toEqual({});
  });

  it('loadTagCounts returns {} for corrupt JSON', () => {
    localStorage.setItem('axs.pb.frequentTags', '{not json');
    expect(loadTagCounts()).toEqual({});
  });

  it('loadTagCounts returns {} for a non-object payload', () => {
    localStorage.setItem('axs.pb.frequentTags', JSON.stringify(['not', 'an', 'object']));
    expect(loadTagCounts()).toEqual({});
  });

  it('loadTagCounts drops non-numeric values', () => {
    localStorage.setItem('axs.pb.frequentTags', JSON.stringify({ Lead: 3, Bass: 'oops' }));
    expect(loadTagCounts()).toEqual({ Lead: 3 });
  });

  it('persistTagCounts round-trips through loadTagCounts', () => {
    persistTagCounts({ Lead: 2, Blues: 1 });
    expect(loadTagCounts()).toEqual({ Lead: 2, Blues: 1 });
  });
});
