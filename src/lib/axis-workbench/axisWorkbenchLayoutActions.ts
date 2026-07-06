import { createWorkbenchId, type WorkbenchCommandResult, type WorkbenchDocument, type WorkbenchProfile } from '../workbench/core';
import type { WorkbenchController } from '../workbench';
import {
  AXIS_PROFILE_SEED_KINDS,
  axisLayoutPresetLabel,
  createAxisLayoutPreset,
  type AxisLayoutPresetKind,
  type AxisLayoutTabKind
} from './axisWorkbenchLayoutPresets';

/** Profile ids seeded from the tablet / mobile presets. */
export const AXIS_TABLET_PROFILE_ID = 'axis.profile.tablet';
export const AXIS_MOBILE_PROFILE_ID = 'axis.profile.mobile';
/** The default desktop profile id (created by `createAxisWorkbenchDefaultDocument`). */
export const AXIS_DESKTOP_PROFILE_ID = 'axis.profile.desktop';

/** Axis device-profile ids in display order, for a PROFILE switcher. */
export const AXIS_PROFILE_IDS = [
  AXIS_DESKTOP_PROFILE_ID,
  AXIS_TABLET_PROFILE_ID,
  AXIS_MOBILE_PROFILE_ID
] as const;

/**
 * Manually pin the active Axis device profile (PROFILE switcher). Persists the
 * choice as the document override so it survives reloads and wins over the
 * viewport resolver until cleared. Pass `null` to clear the override and hand
 * control back to the viewport-based resolver; supply the current viewport
 * `width` so clearing re-resolves against the live viewport.
 */
export function setAxisProfileOverride(
  controller: WorkbenchController,
  profileId: string | null,
  width?: number
): void {
  controller.setProfileOverride(profileId, width);
}

const SEED_PROFILE_ID: Record<(typeof AXIS_PROFILE_SEED_KINDS)[number], string> = {
  tablet: AXIS_TABLET_PROFILE_ID,
  mobile: AXIS_MOBILE_PROFILE_ID
};

const SEED_PROFILE_BREAKPOINT: Record<(typeof AXIS_PROFILE_SEED_KINDS)[number], WorkbenchProfile['breakpoint']> = {
  tablet: 'tablet',
  mobile: 'phone'
};

function activeRightW(doc: WorkbenchDocument): number | undefined {
  const profile = doc.profiles[doc.activeProfileId];
  const layout = profile ? doc.layouts[profile.layoutId] : undefined;
  const rightW = layout?.settings?.rightW;
  return typeof rightW === 'number' ? rightW : undefined;
}

export interface ApplyAxisLayoutPresetResult {
  success: boolean;
  layoutId?: string;
  error?: WorkbenchCommandResult['error'];
}

/**
 * Apply a LAYOUT-tab preset (default/stage/studio/compact) to the *active*
 * profile — the design's `onPreset(id)`: replace the active profile's layout with
 * `preset(id)` while **preserving the current `rightW`**, then set it active.
 *
 * The preset layout is minted with a fresh `layout-*` id (via `createWorkbenchId`,
 * never a hand-picked constant that could collide), saved into the document, and
 * pointed to by the active profile. The previous layout is left in place unless it
 * was itself a generated preset layout no other profile references (kept simple:
 * we do not garbage-collect here; `repairWorkbenchDocument` tolerates orphans).
 */
export function applyAxisLayoutPreset(
  controller: WorkbenchController,
  kind: AxisLayoutTabKind
): ApplyAxisLayoutPresetResult {
  const doc = controller.document;
  const activeProfileId = doc.activeProfileId;
  if (!doc.profiles[activeProfileId]) {
    return { success: false, error: { code: 'missing-profile', message: `Active profile ${activeProfileId} does not exist.` } };
  }
  const layout = createAxisLayoutPreset(kind, {
    layoutId: createWorkbenchId('layout'),
    rightW: activeRightW(doc)
  });

  const batch = controller.dispatchMany([
    { type: 'layout.save', layout },
    { type: 'profile.setLayout', profileId: activeProfileId, layoutId: layout.id }
  ]);
  if (!batch.success) return { success: false, error: batch.error };
  return { success: true, layoutId: layout.id };
}

/**
 * Ensure the tablet and mobile profiles exist, each seeded from its preset layout.
 * Idempotent: profiles/layouts already present are left untouched. Used once at
 * boot so the PROFILE tabs (desktop/tablet/mobile) always have a layout to show;
 * each profile then keeps its own independent layout object.
 */
export function seedAxisProfiles(controller: WorkbenchController): void {
  for (const kind of AXIS_PROFILE_SEED_KINDS) {
    const profileId = SEED_PROFILE_ID[kind];
    if (controller.document.profiles[profileId]) continue;

    const layout = createAxisLayoutPreset(kind, {
      layoutId: createWorkbenchId('layout'),
      label: `Axis ${axisLayoutPresetLabel(kind)}`
    });
    const profile: WorkbenchProfile = {
      id: profileId,
      label: axisLayoutPresetLabel(kind),
      layoutId: layout.id,
      breakpoint: SEED_PROFILE_BREAKPOINT[kind]
    };
    controller.dispatchMany([
      { type: 'layout.save', layout },
      { type: 'profile.add', profile }
    ]);
  }
}

/**
 * Copy the active profile's layout into a target profile (design `copyLayoutFrom`):
 * deep-clone the source layout under a fresh id and point the target profile at it.
 */
export function copyAxisLayoutToProfile(
  controller: WorkbenchController,
  targetProfileId: string
): ApplyAxisLayoutPresetResult {
  const doc = controller.document;
  const source = doc.profiles[doc.activeProfileId];
  const target = doc.profiles[targetProfileId];
  if (!source) return { success: false, error: { code: 'missing-profile', message: 'No active profile to copy from.' } };
  if (!target) return { success: false, error: { code: 'missing-profile', message: `Profile ${targetProfileId} does not exist.` } };
  const sourceLayout = doc.layouts[source.layoutId];
  if (!sourceLayout) return { success: false, error: { code: 'missing-layout', message: 'Active layout is missing.' } };

  const clone = JSON.parse(JSON.stringify(sourceLayout)) as typeof sourceLayout;
  clone.id = createWorkbenchId('layout');
  clone.label = `${target.label} Layout`;

  const batch = controller.dispatchMany([
    { type: 'layout.save', layout: clone },
    { type: 'profile.setLayout', profileId: targetProfileId, layoutId: clone.id }
  ]);
  if (!batch.success) return { success: false, error: batch.error };
  return { success: true, layoutId: clone.id };
}

export { axisLayoutPresetLabel };
export type { AxisLayoutPresetKind };
