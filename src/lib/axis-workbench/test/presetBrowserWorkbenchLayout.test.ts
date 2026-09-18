import { describe, expect, it } from 'vitest';
import {
  AXIS_PB_INITIAL_ROWS,
  AXIS_PB_SCROLL_BATCH,
  axisPbPresetReveal,
  axisPbRank,
  axisPbResultSetKey,
  electAxisPbOwner,
  nextAxisPbVisibleCount
} from '../presetBrowser/presetBrowserWorkbenchLayout';

describe('Preset Browser lazy row batching (§4.1)', () => {
  it('grows the visible window by one batch', () => {
    expect(nextAxisPbVisibleCount(AXIS_PB_INITIAL_ROWS, 512)).toBe(AXIS_PB_INITIAL_ROWS + AXIS_PB_SCROLL_BATCH);
  });

  it('clamps to the total instead of overshooting', () => {
    expect(nextAxisPbVisibleCount(500, 512)).toBe(512);
    expect(nextAxisPbVisibleCount(512, 512)).toBe(512);
  });

  it('honours an explicit batch size', () => {
    expect(nextAxisPbVisibleCount(10, 100, 5)).toBe(15);
  });
});

describe('Grid preset search reveal', () => {
  it('highlights the current preset and renders enough rows to center it', () => {
    expect(axisPbPresetReveal(512, 128, 20)).toEqual({ highlightIndex: 128, visibleCount: 139 });
  });

  it('keeps the initial batch for a current preset near the start', () => {
    expect(axisPbPresetReveal(512, 4, 20)).toEqual({ highlightIndex: 4, visibleCount: 20 });
  });

  it('falls back to the first row when there is no current preset', () => {
    expect(axisPbPresetReveal(512, -1, 20)).toEqual({ highlightIndex: 0, visibleCount: 20 });
  });
});

describe('Preset Browser result-set signature', () => {
  const base = { queryText: '', sort: 'num', sortDir: 'asc', presenceView: 'all', sourceId: 'device' };

  it('ignores selection/marking/overlay state', () => {
    // Those fields live on the same snapshot but are deliberately excluded, so a row click or
    // right-click emits a new snapshot without changing the signature — and does not reset scroll.
    const selected = { ...base, entryId: 'dev:3', anchorId: 'dev:3', marked: { 'dev:3': true }, detailOpen: true };
    expect(axisPbResultSetKey(selected)).toBe(axisPbResultSetKey(base));
  });

  it('changes when any result-set field changes', () => {
    expect(axisPbResultSetKey({ ...base, queryText: 'amp' })).not.toBe(axisPbResultSetKey(base));
    expect(axisPbResultSetKey({ ...base, sort: 'name' })).not.toBe(axisPbResultSetKey(base));
    expect(axisPbResultSetKey({ ...base, sortDir: 'desc' })).not.toBe(axisPbResultSetKey(base));
    expect(axisPbResultSetKey({ ...base, presenceView: 'device' })).not.toBe(axisPbResultSetKey(base));
    expect(axisPbResultSetKey({ ...base, sourceId: 'computer' })).not.toBe(axisPbResultSetKey(base));
  });
});

describe('Preset Browser overlay owner rank (§1)', () => {
  it('ranks list < detail < sources < full', () => {
    expect(axisPbRank('list')).toBeLessThan(axisPbRank('detail'));
    expect(axisPbRank('detail')).toBeLessThan(axisPbRank('sources'));
    expect(axisPbRank('sources')).toBeLessThan(axisPbRank('full'));
  });

  it('elects the lowest-rank mounted part as owner', () => {
    expect(electAxisPbOwner(['sources', 'list', 'detail'])).toBe('list');
    expect(electAxisPbOwner(['sources', 'detail'])).toBe('detail');
    expect(electAxisPbOwner(['sources'])).toBe('sources');
    expect(electAxisPbOwner(['full'])).toBe('full');
  });

  it('returns null when nothing is mounted', () => {
    expect(electAxisPbOwner([])).toBeNull();
  });
});
