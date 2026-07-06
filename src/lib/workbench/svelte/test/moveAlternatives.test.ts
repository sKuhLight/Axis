import { describe, expect, it } from 'vitest';
import { nextOrderedIndex, PANEL_REGION_MOVE_OPTIONS, WIDGET_ZONE_MOVE_OPTIONS } from '../moveAlternatives';

describe('workbench move alternatives', () => {
  it('declares keyboard and menu panel move targets for every dock region', () => {
    expect(PANEL_REGION_MOVE_OPTIONS.map((option) => option.id)).toEqual(['left', 'right', 'top', 'bottom', 'main']);
  });

  it('declares widget move targets for visible, floating, and hidden zones', () => {
    expect(WIDGET_ZONE_MOVE_OPTIONS.map((option) => option.id)).toEqual([
      'top.left',
      'top.center',
      'top.right',
      'rail',
      'bottom',
      'floating',
      'hidden'
    ]);
  });

  it('clamps adjacent ordered movement', () => {
    expect(nextOrderedIndex(0, -1, 3)).toBe(0);
    expect(nextOrderedIndex(1, 1, 3)).toBe(2);
    expect(nextOrderedIndex(2, 1, 3)).toBe(2);
    expect(nextOrderedIndex(0, 1, 0)).toBe(0);
  });
});
