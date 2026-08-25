import { describe, expect, it, beforeEach } from 'vitest';

import {
  incrementTagCount,
  renameTagCount,
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
    expect(frequentTagRow(counts, ['Blues', 'Lead', 'Clean'])).toEqual(['Blues', 'Clean', 'Lead']);
  });

  it('frequentTagRow admits equal-count tags deterministically', () => {
    const counts: AxisPbTagCounts = { Zeta: 3, Alpha: 3 };
    expect(frequentTagRow(counts, ['Zeta', 'Alpha'])).toEqual(['Alpha', 'Zeta']);
  });

  it('frequentTagRow pads with unused library tags, interleaved alphabetically', () => {
    const counts: AxisPbTagCounts = { Lead: 1 };
    expect(frequentTagRow(counts, ['Zeta', 'Ambient', 'Lead'])).toEqual(['Ambient', 'Lead', 'Zeta']);
  });

  it('frequentTagRow shows the library casing, not the casing the count was keyed under', () => {
    const counts: AxisPbTagCounts = { lead: 1 };
    expect(frequentTagRow(counts, ['Lead', 'Bass'])).toEqual(['Bass', 'Lead']);
  });

  it('frequentTagRow caps the combined list at AXIS_PB_FREQUENT_TAGS_MAX', () => {
    const libraryTags = Array.from({ length: AXIS_PB_FREQUENT_TAGS_MAX + 5 }, (_, i) => `lib${i}`);
    expect(frequentTagRow({}, libraryTags)).toHaveLength(AXIS_PB_FREQUENT_TAGS_MAX);
  });

  // THE ghost guard: counts outlive the tags they counted. Untag a preset and its count stays in
  // localStorage forever — seeding the row from counts left the chip on screen, filtering to nothing
  // when clicked. Membership comes from the library, so a count alone can never put a tag on screen.
  it('frequentTagRow never shows a counted tag no preset carries', () => {
    expect(frequentTagRow({ Ghost: 99 }, ['Lead'])).toEqual(['Lead']);
    expect(frequentTagRow({ Ghost: 99 }, [])).toEqual([]);
    expect(frequentTagRow({ GHOST: 4, Lead: 1 }, ['Lead', 'ghost'])).toEqual(['ghost', 'Lead']);
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
    const row = frequentTagRow({ zzz: 99 }, [...libraryTags, 'zzz']);
    expect(row).toHaveLength(AXIS_PB_FREQUENT_TAGS_MAX);
    expect(row).toContain('zzz'); // survives the cap on count alone
    expect(row).not.toContain('a-lib11'); // uncounted, so cut even though it sorts before zzz
    expect(row.at(-1)).toBe('zzz'); // …and is still displayed in alphabetical position
  });

  it('renameTagCount moves a count to the new name', () => {
    expect(renameTagCount({ Cruch: 5, Clean: 1 }, 'Cruch', 'Crunch')).toEqual({ Clean: 1, Crunch: 5 });
  });

  it('renameTagCount sums both counts when merging onto an existing tag', () => {
    expect(renameTagCount({ Cruch: 5, Crunch: 2 }, 'Cruch', 'Crunch')).toEqual({ Crunch: 7 });
  });

  it('renameTagCount re-keys in place on a recase, preserving the count', () => {
    expect(renameTagCount({ crunch: 4 }, 'crunch', 'Crunch')).toEqual({ Crunch: 4 });
  });

  it('renameTagCount matches the source name case-insensitively', () => {
    expect(renameTagCount({ CRUCH: 3 }, 'cruch', 'Crunch')).toEqual({ Crunch: 3 });
  });

  it('renameTagCount leaves the map alone when the source has no count', () => {
    const counts: AxisPbTagCounts = { Clean: 1 };
    expect(renameTagCount(counts, 'Cruch', 'Crunch')).toBe(counts);
  });

  // The reason this exists: a renamed tag must keep its slot in the row rather than restarting at 0.
  it('a renamed tag keeps its place in the row', () => {
    const libraryTags = Array.from({ length: AXIS_PB_FREQUENT_TAGS_MAX }, (_, i) =>
      `a-lib${String(i).padStart(2, '0')}`
    );
    const counts: AxisPbTagCounts = { Cruch: 99 };
    expect(frequentTagRow(counts, [...libraryTags, 'Cruch'])).toContain('Cruch');
    const renamed = renameTagCount(counts, 'Cruch', 'Crunch');
    expect(frequentTagRow(renamed, [...libraryTags, 'Crunch'])).toContain('Crunch');
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
