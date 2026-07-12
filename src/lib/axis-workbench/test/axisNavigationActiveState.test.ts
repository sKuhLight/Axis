import { describe, expect, it } from 'vitest';
import { isAxisNavigationEntryActive, type AxisNavigationActiveSnapshot } from '../axisNavigationActiveState';

const CLEAN: AxisNavigationActiveSnapshot = {
  themeOpen: false,
  accountOpen: false
};

describe('isAxisNavigationEntryActive (ROUND 15 — ACTION entries only)', () => {
  it('tints Theme purely from the editor overlay snapshot', () => {
    expect(isAxisNavigationEntryActive({ ...CLEAN, themeOpen: true }, 'theme')).toBe(true);
    expect(isAxisNavigationEntryActive(CLEAN, 'theme')).toBe(false);
  });

  it('tints Axis Cloud (account) purely from the editor overlay snapshot', () => {
    expect(isAxisNavigationEntryActive({ ...CLEAN, accountOpen: true }, 'account')).toBe(true);
    expect(isAxisNavigationEntryActive(CLEAN, 'account')).toBe(false);
  });

  it('resolves page-bound and unknown entries as inactive (they are handled generically)', () => {
    // The seven page entries resolve their tint in NavigationHost via
    // pageNavigationEntryActive, so this app provider must NOT claim them.
    for (const id of ['grid', 'library', 'fc', 'controllers', 'scenes', 'live', 'setup', 'nonexistent']) {
      expect(isAxisNavigationEntryActive({ ...CLEAN, themeOpen: true, accountOpen: true }, id)).toBe(false);
    }
  });
});
