import { describe, expect, it } from 'vitest';
import { groupHitArea, groupInsertIndex } from '../groupInsertion';
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

// Reflow stability of the in-flow slot (V14 follow-up): the index is measured
// against member rects that EXCLUDE the spliced slot element. Opening the gap
// only ever pushes members AWAY from the pointer, so re-measuring after the
// reflow yields the same index — no snapshot needed, no oscillation.
describe('groupInsertIndex — stable under slot-induced reflow', () => {
  it('keeps the index after members shift right to make room at that index', () => {
    // Pointer between A and B → index 1.
    const pointer = { x: 200, y: 60 };
    expect(groupInsertIndex(pointer, members)).toBe(1);
    // Slot (90+4 wide) spliced before B pushes B and C right by 94.
    const reflowed: WorkbenchRect[] = [
      members[0],
      { ...members[1], left: members[1].left + 94 },
      { ...members[2], left: members[2].left + 94 }
    ];
    expect(groupInsertIndex(pointer, reflowed)).toBe(1);
  });

  it('keeps the append index when nothing moves for an end-of-group gap', () => {
    const pointer = { x: 400, y: 60 };
    expect(groupInsertIndex(pointer, members)).toBe(3);
    expect(groupInsertIndex(pointer, members)).toBe(3);
  });
});
