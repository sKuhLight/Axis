import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import {
  canDeleteProfile,
  createProfileSnapshot,
  isLastProfile,
  isProfileReferenced,
  previewFrameForClass,
  previewFrameLabel
} from '../profiles';

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

describe('previewFrameLabel', () => {
  const tablet = previewFrameForClass('tablet')!;

  it('names the profile and the device frame size', () => {
    expect(previewFrameLabel('Tablet', tablet)).toBe('Tablet · 1024 × 760');
    expect(previewFrameLabel('Tablet', tablet, { width: 1024, height: 760 })).toBe('Tablet · 1024 × 760');
    // Sub-pixel rounding is not a fit.
    expect(previewFrameLabel('Tablet', tablet, { width: 1024.4, height: 759.2 })).toBe('Tablet · 1024 × 760');
  });

  it('shows the rendered size, marked fitted, when the stage caps the frame', () => {
    expect(previewFrameLabel('Tablet', tablet, { width: 1024, height: 724 })).toBe('Tablet · 1024 × 724 (fitted)');
    expect(previewFrameLabel('Mobile', previewFrameForClass('phone')!, { width: 400, height: 700.6 })).toBe(
      'Mobile · 400 × 701 (fitted)'
    );
  });
});
