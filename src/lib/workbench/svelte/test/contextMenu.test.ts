import { describe, expect, it } from 'vitest';
import { clampMenuPosition } from '../contextMenu';

describe('context menu helpers', () => {
  it('keeps menus inside the viewport with a small margin', () => {
    expect(clampMenuPosition({ x: 390, y: 290 }, { width: 400, height: 300 }, { width: 120, height: 80 })).toEqual({
      x: 272,
      y: 212
    });
    expect(clampMenuPosition({ x: -20, y: -10 }, { width: 400, height: 300 }, { width: 120, height: 80 })).toEqual({
      x: 8,
      y: 8
    });
  });
});
