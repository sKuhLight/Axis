import { describe, expect, it } from 'vitest';
import type { NavigationEntryState } from '../../core';
import {
  canHideNavigationEntry,
  canMoveNavigationEntry,
  navigationEntryIndex,
  shouldRenderRail,
  shouldRenderRailNav
} from '../navigation';

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

describe('V14c rail render rule (design §9)', () => {
  it('side mode always renders the rail and its nav', () => {
    expect(shouldRenderRail({ mode: 'side', hasRailWidgets: false, editMode: false })).toBe(true);
    expect(shouldRenderRailNav('side')).toBe(true);
  });

  it('bottom mode drops the rail when it carries no widgets and not editing', () => {
    expect(shouldRenderRail({ mode: 'bottom', hasRailWidgets: false, editMode: false })).toBe(false);
    // …and the nav is never in the rail in bottom mode (it moves to the bottom bar).
    expect(shouldRenderRailNav('bottom')).toBe(false);
  });

  it('bottom mode keeps a widgets-only rail alive for rail-zone widgets (e.g. connection)', () => {
    expect(shouldRenderRail({ mode: 'bottom', hasRailWidgets: true, editMode: false })).toBe(true);
    // Even so, the nav does not render in that widgets-only rail.
    expect(shouldRenderRailNav('bottom')).toBe(false);
  });

  it('bottom mode keeps the rail visible while editing so rail widgets can be dropped', () => {
    expect(shouldRenderRail({ mode: 'bottom', hasRailWidgets: false, editMode: true })).toBe(true);
  });
});
