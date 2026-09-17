import { describe, expect, it } from 'vitest';
import {
  AXIS_PB_INITIAL_ROWS,
  AXIS_PB_SCROLL_BATCH,
  axisPbPresetReveal,
  axisPbRank,
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
