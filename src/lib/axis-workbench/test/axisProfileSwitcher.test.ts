import { describe, expect, it } from 'vitest';
import {
  AXIS_DESKTOP_PROFILE_ID,
  AXIS_MOBILE_PROFILE_ID,
  AXIS_PROFILE_IDS,
  AXIS_PROFILE_LABELS,
  AXIS_TABLET_PROFILE_ID,
  resolveAxisProfileSwitcherState
} from '../axisWorkbenchLayoutActions';

describe('resolveAxisProfileSwitcherState', () => {
  it('emits one chip per profile in display order with the right labels', () => {
    const state = resolveAxisProfileSwitcherState(undefined, AXIS_DESKTOP_PROFILE_ID);
    expect(state.chips.map((c) => c.id)).toEqual([...AXIS_PROFILE_IDS]);
    expect(state.chips.map((c) => c.label)).toEqual([
      AXIS_PROFILE_LABELS[AXIS_DESKTOP_PROFILE_ID],
      AXIS_PROFILE_LABELS[AXIS_TABLET_PROFILE_ID],
      AXIS_PROFILE_LABELS[AXIS_MOBILE_PROFILE_ID]
    ]);
  });

  describe('auto mode (no override)', () => {
    it('reports autoMode and marks the resolved active profile autoActive (not pinned)', () => {
      const state = resolveAxisProfileSwitcherState(undefined, AXIS_TABLET_PROFILE_ID);
      expect(state.autoMode).toBe(true);
      // No chip is pinned in auto mode.
      expect(state.chips.every((c) => !c.pinned)).toBe(true);
      // Exactly the resolved active profile is autoActive.
      expect(state.chips.filter((c) => c.autoActive).map((c) => c.id)).toEqual([
        AXIS_TABLET_PROFILE_ID
      ]);
    });

    it('treats null override the same as undefined (auto)', () => {
      const state = resolveAxisProfileSwitcherState(null, AXIS_MOBILE_PROFILE_ID);
      expect(state.autoMode).toBe(true);
      expect(state.chips.find((c) => c.id === AXIS_MOBILE_PROFILE_ID)?.autoActive).toBe(true);
    });

    it('marks no chip autoActive when the active profile is unknown', () => {
      const state = resolveAxisProfileSwitcherState(undefined, 'axis.profile.ghost');
      expect(state.autoMode).toBe(true);
      expect(state.chips.some((c) => c.autoActive)).toBe(false);
    });
  });

  describe('pinned mode (override set)', () => {
    it('marks exactly the pinned chip and clears autoMode', () => {
      const state = resolveAxisProfileSwitcherState(AXIS_MOBILE_PROFILE_ID, AXIS_MOBILE_PROFILE_ID);
      expect(state.autoMode).toBe(false);
      expect(state.chips.filter((c) => c.pinned).map((c) => c.id)).toEqual([AXIS_MOBILE_PROFILE_ID]);
    });

    it('never marks a chip autoActive while pinned — even the one matching the active profile', () => {
      // Pin desktop while the resolver-active profile happens to differ.
      const state = resolveAxisProfileSwitcherState(AXIS_DESKTOP_PROFILE_ID, AXIS_DESKTOP_PROFILE_ID);
      expect(state.chips.some((c) => c.autoActive)).toBe(false);
      expect(state.chips.find((c) => c.id === AXIS_DESKTOP_PROFILE_ID)?.pinned).toBe(true);
    });
  });
});
