import { describe, expect, it } from 'vitest';
import { resolveProfileForViewport } from '../../workbench/core';
import { createWorkbenchController } from '../../workbench';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import {
  AXIS_DESKTOP_PROFILE_ID,
  AXIS_MOBILE_PROFILE_ID,
  AXIS_TABLET_PROFILE_ID,
  seedAxisProfiles,
  setAxisProfileOverride
} from '../axisWorkbenchLayoutActions';

function seededController() {
  const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
  seedAxisProfiles(controller);
  return controller;
}

describe('Axis profile resolution', () => {
  it('seeds the desktop / tablet / mobile profiles with the expected classes', () => {
    const controller = seededController();
    const doc = controller.document;

    expect(doc.profiles[AXIS_DESKTOP_PROFILE_ID]).toBeDefined();
    expect(doc.profiles[AXIS_TABLET_PROFILE_ID]?.breakpoint).toBe('tablet');
    expect(doc.profiles[AXIS_MOBILE_PROFILE_ID]?.breakpoint).toBe('phone');

    // Desktop profile leaves breakpoint unset (resolver treats it as 'desktop').
    expect(resolveProfileForViewport(doc, { width: 1920 })).toBe(AXIS_DESKTOP_PROFILE_ID);
    expect(resolveProfileForViewport(doc, { width: 1024 })).toBe(AXIS_TABLET_PROFILE_ID);
    expect(resolveProfileForViewport(doc, { width: 390 })).toBe(AXIS_MOBILE_PROFILE_ID);
  });

  it('switches the active profile by width without mutating any layout', () => {
    const controller = seededController();
    const layoutsBefore = JSON.stringify(controller.document.layouts);

    expect(controller.document.activeProfileId).toBe(AXIS_DESKTOP_PROFILE_ID);
    expect(controller.resolveProfileForWidth(390)).toBe(true);
    expect(controller.document.activeProfileId).toBe(AXIS_MOBILE_PROFILE_ID);
    expect(controller.resolveProfileForWidth(1024)).toBe(true);
    expect(controller.document.activeProfileId).toBe(AXIS_TABLET_PROFILE_ID);

    expect(JSON.stringify(controller.document.layouts)).toBe(layoutsBefore);
  });

  it('lets a manual PROFILE choice pin the profile against the viewport', () => {
    const controller = seededController();

    // On a desktop-width viewport, pin mobile.
    setAxisProfileOverride(controller, AXIS_MOBILE_PROFILE_ID, 1920);
    expect(controller.document.activeProfileId).toBe(AXIS_MOBILE_PROFILE_ID);
    expect(controller.profileOverride).toBe(AXIS_MOBILE_PROFILE_ID);

    // A resize back to desktop width must not override the pin.
    expect(controller.resolveProfileForWidth(1920)).toBe(false);
    expect(controller.document.activeProfileId).toBe(AXIS_MOBILE_PROFILE_ID);

    // Clear → re-resolves to desktop at the desktop width.
    setAxisProfileOverride(controller, null, 1920);
    expect(controller.profileOverride).toBeUndefined();
    expect(controller.document.activeProfileId).toBe(AXIS_DESKTOP_PROFILE_ID);
  });
});
