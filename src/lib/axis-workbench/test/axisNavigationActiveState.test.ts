import { describe, expect, it } from 'vitest';
import { isAxisNavigationEntryActive, type AxisNavigationActiveSnapshot } from '../axisNavigationActiveState';

const CLEAN: AxisNavigationActiveSnapshot = {
  accountOpen: false
};

describe('isAxisNavigationEntryActive (ROUND 15 — ACTION entries only)', () => {
  it('tints Axis (account) purely from the editor overlay snapshot', () => {
    expect(isAxisNavigationEntryActive({ ...CLEAN, accountOpen: true }, 'account')).toBe(true);
    expect(isAxisNavigationEntryActive(CLEAN, 'account')).toBe(false);
  });

  it('resolves page-bound and unknown entries as inactive (they are handled generically)', () => {
    // The page entries resolve their tint in NavigationHost via
    // pageNavigationEntryActive, so this app provider must NOT claim them.
    for (const id of ['grid', 'library', 'fc', 'controllers', 'live', 'setup', 'theme', 'nonexistent']) {
      expect(isAxisNavigationEntryActive({ ...CLEAN, accountOpen: true }, id)).toBe(false);
    }
  });
});
