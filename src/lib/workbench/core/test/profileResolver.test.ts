import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import {
  VIEWPORT_BREAKPOINTS,
  classifyViewportWidth,
  previewFrameForClass,
  resolveProfileForViewport,
  selectProfileOverride
} from '../profiles';
import type { WorkbenchDocument, WorkbenchProfile } from '../schema';

function docWithProfiles(): WorkbenchDocument {
  // Base doc has one 'desktop' profile (breakpoint unset => desktop) + layout.
  const doc = createEmptyWorkbenchDocument({
    profileId: 'profile.desktop',
    profileLabel: 'Desktop',
    layoutId: 'layout.default'
  });
  const tablet: WorkbenchProfile = { id: 'profile.tablet', label: 'Tablet', layoutId: 'layout.default', breakpoint: 'tablet' };
  const phone: WorkbenchProfile = { id: 'profile.phone', label: 'Phone', layoutId: 'layout.default', breakpoint: 'phone' };
  doc.profiles[tablet.id] = tablet;
  doc.profiles[phone.id] = phone;
  return doc;
}

describe('previewFrameForClass', () => {
  it('returns real device-canvas sizes for tablet and phone, null for desktop', () => {
    expect(previewFrameForClass('desktop')).toBeNull();
    const tablet = previewFrameForClass('tablet');
    expect(tablet).toEqual({ width: 1024, height: 760, radius: 18 });
    const phone = previewFrameForClass('phone');
    expect(phone).toEqual({ width: 400, height: 820, radius: 28 });
    // Phone is narrower than the phone breakpoint so the shell's ResizeObserver
    // re-classifies the frame as a phone (chrome + isPhone flip together).
    expect(phone!.width).toBeLessThan(VIEWPORT_BREAKPOINTS.phone);
    // Tablet sits inside the tablet band (>= phone, < desktop).
    expect(tablet!.width).toBeGreaterThanOrEqual(VIEWPORT_BREAKPOINTS.phone);
    expect(tablet!.width).toBeLessThan(VIEWPORT_BREAKPOINTS.tablet);
  });
});

describe('classifyViewportWidth', () => {
  it('maps widths to device classes at the documented thresholds', () => {
    expect(classifyViewportWidth(390)).toBe('phone');
    expect(classifyViewportWidth(VIEWPORT_BREAKPOINTS.phone - 1)).toBe('phone');
    expect(classifyViewportWidth(VIEWPORT_BREAKPOINTS.phone)).toBe('tablet'); // 760 exclusive
    expect(classifyViewportWidth(1024)).toBe('tablet');
    expect(classifyViewportWidth(VIEWPORT_BREAKPOINTS.tablet - 1)).toBe('tablet');
    expect(classifyViewportWidth(VIEWPORT_BREAKPOINTS.tablet)).toBe('desktop'); // 1366 exclusive
    expect(classifyViewportWidth(1920)).toBe('desktop');
  });

  it('treats non-positive / unknown widths as phone (smallest, safest)', () => {
    expect(classifyViewportWidth(0)).toBe('phone');
    expect(classifyViewportWidth(-1)).toBe('phone');
    expect(classifyViewportWidth(Number.NaN)).toBe('phone');
  });
});

describe('resolveProfileForViewport — class mapping', () => {
  it('picks the profile whose breakpoint matches the viewport class', () => {
    const doc = docWithProfiles();
    expect(resolveProfileForViewport(doc, { width: 1920 })).toBe('profile.desktop');
    expect(resolveProfileForViewport(doc, { width: 1000 })).toBe('profile.tablet');
    expect(resolveProfileForViewport(doc, { width: 390 })).toBe('profile.phone');
  });

  it('defaults an unset breakpoint to the desktop class', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.only', layoutId: 'layout.default' });
    // Only a desktop-class profile exists; a desktop viewport resolves to it.
    expect(resolveProfileForViewport(doc, { width: 1440 })).toBe('profile.only');
  });
});

describe('resolveProfileForViewport — override precedence', () => {
  it('honours a valid user override over the viewport class', () => {
    const doc = docWithProfiles();
    // Desktop viewport, but the user pinned phone.
    expect(resolveProfileForViewport(doc, { width: 1920, userOverride: 'profile.phone' })).toBe('profile.phone');
  });

  it('ignores a dangling / cleared override and falls back to viewport resolution', () => {
    const doc = docWithProfiles();
    expect(resolveProfileForViewport(doc, { width: 390, userOverride: 'profile.missing' })).toBe('profile.phone');
    expect(resolveProfileForViewport(doc, { width: 390, userOverride: null })).toBe('profile.phone');
    expect(resolveProfileForViewport(doc, { width: 390, userOverride: undefined })).toBe('profile.phone');
  });
});

describe('resolveProfileForViewport — missing-profile fallback', () => {
  it('holds the current active profile when no profile owns the viewport class', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.desktop', layoutId: 'layout.default' });
    // No tablet/phone profiles → a phone viewport must NOT switch (resize never
    // mutates the layout you are on).
    expect(doc.activeProfileId).toBe('profile.desktop');
    expect(resolveProfileForViewport(doc, { width: 390 })).toBe('profile.desktop');
    expect(resolveProfileForViewport(doc, { width: 1000 })).toBe('profile.desktop');
  });

  it('falls back to any profile id when the active profile is gone', () => {
    const doc = docWithProfiles();
    doc.activeProfileId = 'profile.vanished';
    // No 'desktop'-owning profile is missing here, but force a class miss by
    // deleting the tablet profile and asking for tablet.
    delete doc.profiles['profile.tablet'];
    const resolved = resolveProfileForViewport(doc, { width: 1000 });
    expect(Object.keys(doc.profiles)).toContain(resolved);
  });
});

describe('selectProfileOverride', () => {
  it('returns a valid override id and ignores dangling ones', () => {
    const doc = docWithProfiles();
    expect(selectProfileOverride(doc)).toBeUndefined();
    doc.profileOverrideId = 'profile.phone';
    expect(selectProfileOverride(doc)).toBe('profile.phone');
    doc.profileOverrideId = 'profile.missing';
    expect(selectProfileOverride(doc)).toBeUndefined();
  });
});
