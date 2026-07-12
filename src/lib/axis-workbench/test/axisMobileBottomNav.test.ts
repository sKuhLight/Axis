import { describe, expect, it } from 'vitest';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { AXIS_MOBILE_PROFILE_ID, seedAxisProfiles } from '../axisWorkbenchLayoutActions';
import { ensureAxisMobileBottomNav } from '../axisWorkbenchStore.svelte';
import { createAxisLayoutPreset } from '../axisWorkbenchLayoutPresets';
import { createWorkbenchController, type WorkbenchDocument } from '../../workbench';

function docWithMobileProfile(mode: 'side' | 'bottom'): WorkbenchDocument {
  const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
  seedAxisProfiles(controller);
  const doc = JSON.parse(JSON.stringify(controller.document)) as WorkbenchDocument;
  const layoutId = doc.profiles[AXIS_MOBILE_PROFILE_ID].layoutId;
  doc.layouts[layoutId].navigation.mode = mode;
  delete doc.metadata?.axisMobileBottomNav;
  return doc;
}

describe('V14d — mobile profile defaults to persistent bottom nav', () => {
  it('the mobile preset seeds navMode bottom', () => {
    const layout = createAxisLayoutPreset('mobile', { layoutId: 'l-mobile', label: 'Mobile' });
    expect(layout.navigation.mode).toBe('bottom');
  });

  it('one-shot migration flips a persisted pre-V14d mobile profile from side to bottom', () => {
    const doc = docWithMobileProfile('side');
    const migrated = ensureAxisMobileBottomNav(doc);
    const layoutId = migrated.profiles[AXIS_MOBILE_PROFILE_ID].layoutId;
    expect(migrated.layouts[layoutId].navigation.mode).toBe('bottom');
    expect(migrated.metadata?.axisMobileBottomNav).toBe('v1');
  });

  it('never overrides a deliberate later switch back to side (marker present)', () => {
    const doc = docWithMobileProfile('side');
    ensureAxisMobileBottomNav(doc);
    const layoutId = doc.profiles[AXIS_MOBILE_PROFILE_ID].layoutId;
    doc.layouts[layoutId].navigation.mode = 'side';
    const again = ensureAxisMobileBottomNav(doc);
    expect(again.layouts[layoutId].navigation.mode).toBe('side');
  });

  it('is a safe no-op on docs without a mobile profile', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    delete doc.metadata?.axisMobileBottomNav;
    const migrated = ensureAxisMobileBottomNav(doc);
    expect(migrated.metadata?.axisMobileBottomNav).toBe('v1');
  });
});
