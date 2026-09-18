import { describe, expect, it } from 'vitest';
import {
  axisPbBulkTagCounts,
  axisPbBulkTargets,
  axisPbMarkedDeviceSlots,
  axisPbMarkedSummary,
  axisPbTagPresence,
  parseAxisPbDeviceSlot,
  type AxisPbBulkEntry
} from '../presetBrowser/presetBrowserWorkbenchBulk';

const entry = (id: string, over: Partial<AxisPbBulkEntry> = {}): AxisPbBulkEntry => ({
  id,
  sourceId: 'device',
  number: 0,
  fav: false,
  tags: [],
  ...over
});

describe('axisPbMarkedSummary', () => {
  it('counts only truthy marks', () => {
    const s = axisPbMarkedSummary({ a: true, b: false, c: true }, [entry('a'), entry('b'), entry('c')]);
    expect(s.selected).toBe(2);
    expect(s.taggable).toBe(2);
  });

  // A marked id whose entry is gone (filtered out / removed) still counts as "selected" but must not be
  // a tag/favorite target — otherwise a stale mark ghost-tags a non-entry.
  it('excludes ids missing from entries from taggable', () => {
    const s = axisPbMarkedSummary({ dev: true, ghost: true }, [entry('dev')]);
    expect(s.selected).toBe(2);
    expect(s.taggable).toBe(1);
  });

  it('excludes synthesized empty slots from taggable', () => {
    const s = axisPbMarkedSummary({ 'dev:0': true }, [entry('dev:0', { empty: true })]);
    expect(s.selected).toBe(1);
    expect(s.taggable).toBe(0);
  });

  it('reports allFav only when every taggable target is a favorite', () => {
    expect(axisPbMarkedSummary({ a: true, b: true }, [entry('a', { fav: true }), entry('b', { fav: true })]).allFav).toBe(true);
    expect(axisPbMarkedSummary({ a: true, b: true }, [entry('a', { fav: true }), entry('b')]).allFav).toBe(false);
    expect(axisPbMarkedSummary({}, []).allFav).toBe(false);
  });

  it('collects sorted unique marked device slots for the move seed', () => {
    const s = axisPbMarkedSummary({ 'dev:5': true, 'dev:2': true, 'file:x': true, 'dev:2x': true }, []);
    expect(s.deviceSlots).toEqual([2, 5]);
  });

  // Clear only touches real, stored device slots — an empty slot is already blank, and a file/ghost
  // mark has no device slot to erase.
  it('collects clearable slots from real device entries only', () => {
    const s = axisPbMarkedSummary(
      { 'dev:1': true, 'file:x': true, 'dev:2': true, 'ghost': true },
      [
        entry('dev:1', { number: 1 }),
        entry('file:x', { sourceId: 'file', number: null }),
        entry('dev:2', { number: 2, empty: true })
      ]
    );
    expect(s.selected).toBe(4);
    expect(s.clearableSlots).toEqual([1]);
  });
});

describe('parseAxisPbDeviceSlot', () => {
  it('parses dev:<n> and rejects everything else', () => {
    expect(parseAxisPbDeviceSlot('dev:0')).toBe(0);
    expect(parseAxisPbDeviceSlot('dev:12')).toBe(12);
    expect(parseAxisPbDeviceSlot('dev:abc')).toBeNull();
    expect(parseAxisPbDeviceSlot('file:x')).toBeNull();
  });
});

describe('axisPbMarkedDeviceSlots', () => {
  it('ignores falsy marks and non-device ids', () => {
    expect(axisPbMarkedDeviceSlots({ 'dev:3': true, 'dev:1': false, 'local:a': true })).toEqual([3]);
  });
});

describe('axisPbBulkTargets', () => {
  it('returns real marked entries in data order, skipping empties', () => {
    const targets = axisPbBulkTargets({ a: true, b: true, c: true }, [entry('b'), entry('c', { empty: true }), entry('a')]);
    expect(targets.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('axisPbTagPresence', () => {
  it('reports none / some / all across the targets', () => {
    const entries = [entry('a', { tags: ['x'] }), entry('b', { tags: ['x', 'y'] })];
    expect(axisPbTagPresence(entries, 'x')).toBe('all');
    expect(axisPbTagPresence(entries, 'y')).toBe('some');
    expect(axisPbTagPresence(entries, 'z')).toBe('none');
    expect(axisPbTagPresence([], 'x')).toBe('none');
  });
});

describe('axisPbBulkTagCounts', () => {
  it('counts each tag across the targets', () => {
    expect(axisPbBulkTagCounts([entry('a', { tags: ['x'] }), entry('b', { tags: ['x', 'y'] })])).toEqual({ x: 2, y: 1 });
  });
});
