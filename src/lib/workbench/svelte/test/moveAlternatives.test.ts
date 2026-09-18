import { describe, expect, it } from 'vitest';
import { nextOrderedIndex } from '../moveAlternatives';

describe('workbench move alternatives', () => {
  it('clamps adjacent ordered movement', () => {
    expect(nextOrderedIndex(0, -1, 3)).toBe(0);
    expect(nextOrderedIndex(1, 1, 3)).toBe(2);
    expect(nextOrderedIndex(2, 1, 3)).toBe(2);
    expect(nextOrderedIndex(0, 1, 0)).toBe(0);
  });
});
