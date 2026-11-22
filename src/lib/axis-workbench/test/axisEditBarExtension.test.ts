import { describe, expect, it } from 'vitest';
import { createWorkbenchController, type WorkbenchController } from '../../workbench';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import {
  AXIS_DESKTOP_PROFILE_ID,
  AXIS_MOBILE_PROFILE_ID,
  AXIS_TABLET_PROFILE_ID,
  applyAxisLayoutPreset,
  axisActiveLayoutPresetKind,
  axisLayoutPresetLabel,
  axisProfileSummaryLabel,
  buildAxisLayoutMenuItems,
  buildAxisProfileOptions,
  resolveAxisProfileSwitcherState,
  seedAxisProfiles
} from '../axisWorkbenchLayoutActions';

const item = (controller: WorkbenchController, id: string) =>
  buildAxisLayoutMenuItems(controller).find((entry) => entry.id === id)!;

/** A controller on the real seeded profiles, switched to `profileId`. */
function seededOn(profileId: string): WorkbenchController {
  const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
  seedAxisProfiles(controller);
  controller.setProfileOverride(profileId);
  expect(controller.document.activeProfileId).toBe(profileId);
  return controller;
}

describe('Axis LAYOUT menu items (edit bar)', () => {
  it('lists the four presets as axis-preset-tab radio rows with the active one checked, then Reset layout', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    const items = buildAxisLayoutMenuItems(controller);
    expect(items[0]).toMatchObject({ kind: 'header', label: 'Preset' });
    const presets = items.filter((entry) => entry.kind === 'radio');
    expect(presets.map((entry) => entry.label)).toEqual(['Default', 'Stage', 'Studio', 'Compact']);
    expect(presets.every((entry) => entry.className === 'axis-preset-tab')).toBe(true);
    expect(presets.map((entry) => entry.checked)).toEqual([true, false, false, false]);
    const reset = items[items.length - 1];
    expect(reset).toMatchObject({ id: 'axis.preset.reset', label: 'Reset layout', danger: true });
    expect(reset.confirm?.prompt).toContain('“Default”');
  });

  it('applies a preset from its row and re-checks the menu', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    item(controller, 'axis.preset.stage').run();
    expect(axisActiveLayoutPresetKind(controller.activeLayout)).toBe('stage');
    const checked = buildAxisLayoutMenuItems(controller).filter((entry) => entry.checked);
    expect(checked.map((entry) => entry.label)).toEqual(['Stage']);
  });

  it('the already-checked preset row is a no-op (Reset is the explicit way)', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    applyAxisLayoutPreset(controller, 'studio');
    const before = controller.activeLayout!.id;
    item(controller, 'axis.preset.studio').run();
    expect(controller.activeLayout!.id).toBe(before);
  });

  it('Reset layout re-applies the ACTIVE preset as a fresh layout', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    applyAxisLayoutPreset(controller, 'studio');
    const before = controller.activeLayout!.id;
    const reset = item(controller, 'axis.preset.reset');
    expect(reset.confirm?.prompt).toContain('“Studio”');
    reset.run();
    expect(controller.activeLayout!.id).not.toBe(before);
    expect(axisActiveLayoutPresetKind(controller.activeLayout)).toBe('studio');
  });

  for (const [profileId, kind, navMode] of [
    [AXIS_TABLET_PROFILE_ID, 'tablet', 'bottom'],
    [AXIS_MOBILE_PROFILE_ID, 'mobile', 'bottom']
  ] as const) {
    it(`on the seeded ${kind} profile: labelled ${kind}, no preset checked, Reset re-applies the ${kind} seed`, () => {
      const controller = seededOn(profileId);
      expect(axisActiveLayoutPresetKind(controller.activeLayout)).toBe(kind);
      expect(axisLayoutPresetLabel(axisActiveLayoutPresetKind(controller.activeLayout))).toBe(
        kind === 'tablet' ? 'Tablet' : 'Mobile'
      );
      expect(buildAxisLayoutMenuItems(controller).some((entry) => entry.checked)).toBe(false);

      const before = controller.activeLayout!.id;
      const reset = item(controller, 'axis.preset.reset');
      expect(reset.confirm?.prompt).toContain(kind === 'tablet' ? '“Tablet”' : '“Mobile”');
      reset.run();
      const after = controller.activeLayout!;
      expect(after.id).not.toBe(before);
      expect(controller.document.activeProfileId).toBe(profileId);
      expect(after.settings?.presetKind).toBe(kind);
      // NOT the desktop default preset with side navigation.
      expect(after.navigation.mode).toBe(navMode);
    });
  }

  it('reads presetKind first and falls back to activePreset, then Default', () => {
    expect(axisActiveLayoutPresetKind(undefined)).toBe('default');
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    const base = controller.activeLayout!;
    expect(axisActiveLayoutPresetKind({ ...base, settings: { presetKind: 'tablet', activePreset: 'default' } })).toBe('tablet');
    expect(axisActiveLayoutPresetKind({ ...base, settings: { activePreset: 'compact' } })).toBe('compact');
    expect(axisActiveLayoutPresetKind({ ...base, settings: { presetKind: 'bogus' } })).toBe('default');
  });
});

describe('applyAxisLayoutPreset — replaced layouts do not pile up', () => {
  it('deletes the replaced layout when no other profile uses it; one undo restores both', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    const previous = controller.activeLayout!.id;
    const count = Object.keys(controller.document.layouts).length;

    const result = applyAxisLayoutPreset(controller, 'stage');
    expect(result.success).toBe(true);
    expect(controller.document.layouts[previous]).toBeUndefined();
    expect(Object.keys(controller.document.layouts)).toHaveLength(count);

    // Applying again replaces (and drops) the stage layout too.
    const second = applyAxisLayoutPreset(controller, 'compact');
    expect(controller.document.layouts[result.layoutId!]).toBeUndefined();
    expect(Object.keys(controller.document.layouts)).toHaveLength(count);

    expect(controller.undoLayout()).toBe(true);
    expect(controller.activeLayout!.id).toBe(result.layoutId);
    expect(controller.document.layouts[second.layoutId!]).toBeUndefined();
    expect(controller.undoLayout()).toBe(true);
    expect(controller.activeLayout!.id).toBe(previous);
    expect(controller.document.layouts[previous]).toBeDefined();
  });

  it('keeps the replaced layout when another profile still references it', () => {
    const controller = createWorkbenchController(createAxisWorkbenchDefaultDocument());
    seedAxisProfiles(controller);
    const shared = controller.activeLayout!.id;
    // The tablet profile now shares the desktop layout.
    controller.dispatch({ type: 'profile.setLayout', profileId: AXIS_TABLET_PROFILE_ID, layoutId: shared });

    const result = applyAxisLayoutPreset(controller, 'studio');
    expect(result.success).toBe(true);
    expect(controller.document.layouts[shared]).toBeDefined();
    expect(controller.document.profiles[AXIS_TABLET_PROFILE_ID].layoutId).toBe(shared);
    expect(controller.document.profiles[AXIS_DESKTOP_PROFILE_ID].layoutId).toBe(result.layoutId);
  });
});

describe('Axis PROFILE options (edit bar)', () => {
  it('Auto first (text), then Desktop / Tablet / Mobile with viewport-class glyphs', () => {
    const options = buildAxisProfileOptions(resolveAxisProfileSwitcherState(undefined, AXIS_TABLET_PROFILE_ID));
    expect(options.map((o) => [o.id, o.label, o.viewportClass])).toEqual([
      [null, 'Auto', undefined],
      [AXIS_DESKTOP_PROFILE_ID, 'Desktop', 'desktop'],
      [AXIS_TABLET_PROFILE_ID, 'Tablet', 'tablet'],
      [AXIS_MOBILE_PROFILE_ID, 'Mobile', 'phone']
    ]);
    // Auto mode: Auto is the active choice, the resolved profile carries the marker.
    expect(options.map((o) => o.active)).toEqual([true, false, false, false]);
    expect(options.map((o) => o.resolved)).toEqual([false, false, true, false]);
    expect(options[0].title).toContain('now Tablet');
  });

  it('a pin makes that profile the active choice', () => {
    const state = resolveAxisProfileSwitcherState(AXIS_MOBILE_PROFILE_ID, AXIS_MOBILE_PROFILE_ID);
    const options = buildAxisProfileOptions(state);
    expect(options.filter((o) => o.active).map((o) => o.label)).toEqual(['Mobile']);
    expect(options.some((o) => o.resolved)).toBe(false);
    expect(options[3].title).toContain('pinned');
  });

  it('summarises the choice for the collapsed dropdown', () => {
    expect(axisProfileSummaryLabel(resolveAxisProfileSwitcherState(undefined, AXIS_DESKTOP_PROFILE_ID))).toBe('Auto · Desktop');
    expect(axisProfileSummaryLabel(resolveAxisProfileSwitcherState(AXIS_TABLET_PROFILE_ID, AXIS_TABLET_PROFILE_ID))).toBe('Tablet');
    expect(axisProfileSummaryLabel(resolveAxisProfileSwitcherState(undefined, 'unknown'))).toBe('Auto');
  });
});
