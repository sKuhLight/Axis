import { describe, expect, it } from 'vitest';
import type { NavigationEntryState } from '../../core';
import { canHideNavigationEntry, canMoveNavigationEntry, navigationEntryIndex } from '../navigation';

const nav = (entry: Partial<NavigationEntryState> & { id: string }): NavigationEntryState => ({
  hidden: false,
  ...entry
});

describe('navigation renderer policy', () => {
  it('keeps locked and fixed entries from menu move/hide actions', () => {
    expect(canMoveNavigationEntry(nav({ id: 'grid' }))).toBe(true);
    expect(canHideNavigationEntry(nav({ id: 'grid' }))).toBe(true);
    expect(canMoveNavigationEntry(nav({ id: 'account', locked: true }))).toBe(false);
    expect(canHideNavigationEntry(nav({ id: 'account', locked: true }))).toBe(false);
    expect(canMoveNavigationEntry(nav({ id: 'account', fixedSlot: 'rail.footer' }))).toBe(false);
    expect(canHideNavigationEntry(nav({ id: 'account', fixedSlot: 'rail.footer' }))).toBe(false);
  });

  it('finds visible navigation entry order for menu move actions', () => {
    const entries = [nav({ id: 'grid' }), nav({ id: 'library' }), nav({ id: 'account', fixedSlot: 'rail.footer' })];
    expect(navigationEntryIndex(entries, 'library')).toBe(1);
    expect(navigationEntryIndex(entries, 'missing')).toBe(-1);
  });
});
