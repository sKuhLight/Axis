import { describe, expect, it } from 'vitest';
import { groupHitArea, groupInsertIndex, groupPlaceholderRect } from '../groupInsertion';
import type { WorkbenchRect } from '../drag';

// Three members in a horizontal group, each 90×38, 4px apart:
//   A: 100..190   B: 194..284   C: 288..378
const members: WorkbenchRect[] = [
  { left: 100, top: 50, width: 90, height: 38 },
  { left: 194, top: 50, width: 90, height: 38 },
  { left: 288, top: 50, width: 90, height: 38 }
];

describe('groupInsertIndex — midpoint insertion within a group (V14b)', () => {
  it('inserts before the first member when left of its midpoint', () => {
    // A's midpoint is 145.
    expect(groupInsertIndex({ x: 110, y: 60 }, members)).toBe(0);
  });

  it('inserts between two members when past the first midpoint', () => {
    // Past A's midpoint (145), before B's (239) → index 1.
    expect(groupInsertIndex({ x: 200, y: 60 }, members)).toBe(1);
  });

  it('inserts before the last member when just past the middle midpoint', () => {
    // Past B's midpoint (239), before C's (333) → index 2.
    expect(groupInsertIndex({ x: 300, y: 60 }, members)).toBe(2);
  });

  it('appends after the last member when past every midpoint', () => {
    expect(groupInsertIndex({ x: 400, y: 60 }, members)).toBe(3);
  });

  it('returns 0 for an empty member set', () => {
    expect(groupInsertIndex({ x: 400, y: 60 }, [])).toBe(0);
  });

  it('uses the vertical axis for rail-oriented groups', () => {
    const stacked: WorkbenchRect[] = [
      { left: 0, top: 0, width: 50, height: 40 },
      { left: 0, top: 44, width: 50, height: 40 }
    ];
    expect(groupInsertIndex({ x: 25, y: 10 }, stacked, 'vertical')).toBe(0);
    expect(groupInsertIndex({ x: 25, y: 50 }, stacked, 'vertical')).toBe(1);
    expect(groupInsertIndex({ x: 25, y: 200 }, stacked, 'vertical')).toBe(2);
  });
});

describe('groupHitArea — module rect expanded ±8/±4 (design 03-groups §3)', () => {
  it('expands the module rect by 8px horizontally and 4px vertically', () => {
    expect(groupHitArea({ left: 100, top: 50, width: 200, height: 38 })).toEqual({
      left: 92,
      top: 46,
      width: 216,
      height: 46
    });
  });

  it('honours explicit padding overrides', () => {
    expect(groupHitArea({ left: 0, top: 0, width: 10, height: 10 }, 2, 3)).toEqual({
      left: -2,
      top: -3,
      width: 14,
      height: 16
    });
  });
});

describe('groupPlaceholderRect — widget-sized dashed slot (design indStyle)', () => {
  const ghost = { width: 90, height: 38 };

  it('sits before the first member for index 0', () => {
    const rect = groupPlaceholderRect(0, members, ghost)!;
    // Left of A (100) by gap(4)+width(90).
    expect(rect.left).toBe(100 - 4 - 90);
    expect(rect.width).toBe(90);
    expect(rect.height).toBe(38);
  });

  it('sits after the last member for the append index', () => {
    const rect = groupPlaceholderRect(3, members, ghost)!;
    // Right of C (288+90) by gap(4).
    expect(rect.left).toBe(288 + 90 + 4);
  });

  it('centres on the gap between two members for an interior index', () => {
    const rect = groupPlaceholderRect(1, members, ghost)!;
    // Gap midpoint between A.right(190) and B.left(194) = 192; slot centred there.
    expect(rect.left).toBe(192 - 90 / 2);
  });

  it('uses the ghost size verbatim', () => {
    const rect = groupPlaceholderRect(1, members, { width: 120, height: 34 })!;
    expect(rect.width).toBe(120);
    expect(rect.height).toBe(34);
  });

  it('falls back to a sane slot size when the ghost has no measured rect', () => {
    const rect = groupPlaceholderRect(1, members, { width: 0, height: 0 })!;
    expect(rect.width).toBe(90);
    expect(rect.height).toBe(38);
  });

  it('returns null for an empty group (nothing to anchor against)', () => {
    expect(groupPlaceholderRect(0, [], ghost)).toBeNull();
  });
});
