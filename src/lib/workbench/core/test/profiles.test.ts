import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import { canDeleteProfile, createProfileSnapshot, isLastProfile, isProfileReferenced } from '../profiles';

describe('workbench profile helpers', () => {
  it('reports active and last profile delete policy', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.default', layoutId: 'layout.default' });

    expect(isLastProfile(doc)).toBe(true);
    expect(isProfileReferenced(doc, 'profile.default')).toBe(true);
    expect(canDeleteProfile(doc, 'profile.default')).toBe(false);

    doc.profiles['profile.stage'] = { id: 'profile.stage', label: 'Stage', layoutId: 'layout.default' };

    expect(isLastProfile(doc)).toBe(false);
    expect(canDeleteProfile(doc, 'profile.default')).toBe(false);
    expect(canDeleteProfile(doc, 'profile.stage')).toBe(true);
    expect(canDeleteProfile(doc, 'missing')).toBe(false);
  });

  it('creates collision-safe profile snapshots from the active profile', () => {
    const doc = createEmptyWorkbenchDocument({
      profileId: 'profile.default',
      profileLabel: 'Default',
      layoutId: 'layout.default'
    });
    doc.profiles['profile.default.copy'] = { id: 'profile.default.copy', label: 'Default Copy', layoutId: 'layout.default' };
    doc.profiles['profile.default'].state = { density: 'compact' };

    const snapshot = createProfileSnapshot(doc, { breakpoint: 'tablet' });

    expect(snapshot?.id).toBe('profile.default.copy1');
    expect(snapshot?.label).toBe('Default Copy');
    expect(snapshot?.layoutId).toBe('layout.default');
    expect(snapshot?.breakpoint).toBe('tablet');
    expect(snapshot?.state).toEqual({ density: 'compact' });
    expect(snapshot?.state).not.toBe(doc.profiles['profile.default'].state);
  });
});
