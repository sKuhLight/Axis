import {
  createWorkbenchId,
  type ViewportClass,
  type WorkbenchCommandResult,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchProfile
} from '../workbench/core';
import {
  enqueueToast,
  type WorkbenchController,
  type WorkbenchEditBarProfileOption,
  type WorkbenchMenuItem
} from '../workbench';
import {
  AXIS_LAYOUT_PRESET_KINDS,
  AXIS_LAYOUT_TAB_KINDS,
  AXIS_PROFILE_SEED_KINDS,
  axisLayoutPresetLabel,
  createAxisLayoutPreset,
  type AxisLayoutPresetKind
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

/** Short display labels for the PROFILE segmented control (design §5). */
export const AXIS_PROFILE_LABELS: Record<(typeof AXIS_PROFILE_IDS)[number], string> = {
  [AXIS_DESKTOP_PROFILE_ID]: 'Desktop',
  [AXIS_TABLET_PROFILE_ID]: 'Tablet',
  [AXIS_MOBILE_PROFILE_ID]: 'Mobile'
};

/** One chip in the PROFILE switcher. */
export interface AxisProfileSwitcherChip {
  /** Profile id this chip pins when clicked. */
  id: string;
  /** Human label (Desktop / Tablet / Mobile). */
  label: string;
  /**
   * True when this profile is the *pinned* override (always wins over viewport) —
   * a solid, filled active state.
   */
  pinned: boolean;
  /**
   * True when this profile is the one the viewport resolver landed on while in
   * Auto mode (no override). Shown as a lighter "resolved" hint so the user can
   * see which profile Auto picked without it reading as a manual pin.
   */
  autoActive: boolean;
}

/** Full derived state for the PROFILE segmented control. */
export interface AxisProfileSwitcherState {
  chips: AxisProfileSwitcherChip[];
  /** True when no override is pinned — the "Auto" affordance is the active one. */
  autoMode: boolean;
}

/**
 * Pure derivation for the PROFILE switcher UI.
 *
 * `overrideId` is the persisted, still-valid pin (`controller.profileOverride`);
 * `activeProfileId` is the currently-resolved active profile
 * (`controller.document.activeProfileId`). When an override is pinned exactly one
 * chip is `pinned` (and `autoMode` is false); when nothing is pinned, `autoMode`
 * is true and the chip matching the resolved active profile is `autoActive` so the
 * viewport's choice is still visible without reading as a manual pin.
 */
export function resolveAxisProfileSwitcherState(
  overrideId: string | null | undefined,
  activeProfileId: string
): AxisProfileSwitcherState {
  const pinned = overrideId ?? undefined;
  const autoMode = !pinned;
  const chips = AXIS_PROFILE_IDS.map((id) => ({
    id,
    label: AXIS_PROFILE_LABELS[id],
    pinned: !!pinned && pinned === id,
    autoActive: autoMode && activeProfileId === id
  }));
  return { chips, autoMode };
}

/** Viewport class each Axis profile previews as (drives the edit bar's glyphs). */
export const AXIS_PROFILE_VIEWPORT_CLASS: Record<(typeof AXIS_PROFILE_IDS)[number], ViewportClass> = {
  [AXIS_DESKTOP_PROFILE_ID]: 'desktop',
  [AXIS_TABLET_PROFILE_ID]: 'tablet',
  [AXIS_MOBILE_PROFILE_ID]: 'phone'
};

/**
 * The edit bar's PROFILE options (Auto · Desktop · Tablet · Mobile) derived from
 * the switcher state: the pinned choice is `active` (Auto when nothing is
 * pinned); the profile Auto resolved to is `resolved`.
 */
export function buildAxisProfileOptions(state: AxisProfileSwitcherState): WorkbenchEditBarProfileOption[] {
  const resolved = state.chips.find((chip) => chip.autoActive);
  return [
    {
      id: null,
      label: 'Auto',
      active: state.autoMode,
      resolved: false,
      title: resolved ? `Auto — follow the viewport size (now ${resolved.label})` : 'Auto — follow the viewport size'
    },
    ...state.chips.map(
      (chip): WorkbenchEditBarProfileOption => ({
        id: chip.id,
        label: chip.label,
        viewportClass: AXIS_PROFILE_VIEWPORT_CLASS[chip.id as (typeof AXIS_PROFILE_IDS)[number]],
        active: chip.pinned,
        resolved: chip.autoActive,
        title: chip.pinned
          ? `${chip.label} — pinned`
          : chip.autoActive
            ? `${chip.label} — matched by viewport (pin to lock)`
            : `Pin ${chip.label} profile`
      })
    )
  ];
}

/** The collapsed PROFILE dropdown's value: "Auto · Desktop" or the pinned profile. */
export function axisProfileSummaryLabel(state: AxisProfileSwitcherState): string {
  if (!state.autoMode) return state.chips.find((chip) => chip.pinned)?.label ?? 'Pinned';
  const resolved = state.chips.find((chip) => chip.autoActive);
  return resolved ? `Auto · ${resolved.label}` : 'Auto';
}

const isPresetKind = (value: unknown): value is AxisLayoutPresetKind =>
  typeof value === 'string' && (AXIS_LAYOUT_PRESET_KINDS as readonly string[]).includes(value);

/**
 * The preset (any of the six kinds) the active layout was built from. The real
 * kind is `settings.presetKind`; `settings.activePreset` only records LAYOUT-tab
 * kinds (it reads `default` for the tablet / mobile seeds), so it is the legacy
 * fallback. `default` when neither names a known preset.
 */
export function axisActiveLayoutPresetKind(layout: WorkbenchLayout | undefined): AxisLayoutPresetKind {
  const presetKind = layout?.settings?.presetKind;
  if (isPresetKind(presetKind)) return presetKind;
  const activePreset = layout?.settings?.activePreset;
  if (isPresetKind(activePreset)) return activePreset;
  return 'default';
}

/**
 * Axis items for the edit bar's LAYOUT menu: the four LAYOUT-tab presets as
 * radio rows (class `axis-preset-tab`) and "Reset layout", which re-applies the
 * ACTIVE preset kind — including a tablet / mobile profile seed — after an
 * inline confirm. A row is checked only when its tab kind IS the active preset,
 * so none is checked on a tablet / mobile seed; the checked row is a no-op
 * (re-applying it silently would replace the layout — Reset is the explicit way).
 */
export function buildAxisLayoutMenuItems(controller: WorkbenchController): WorkbenchMenuItem[] {
  const active = axisActiveLayoutPresetKind(controller.activeLayout);
  const noop = (): void => {};
  return [
    { id: 'axis.preset.header', kind: 'header', label: 'Preset', run: noop },
    ...AXIS_LAYOUT_TAB_KINDS.map(
      (kind): WorkbenchMenuItem => ({
        id: `axis.preset.${kind}`,
        kind: 'radio',
        label: axisLayoutPresetLabel(kind),
        checked: kind === active,
        className: 'axis-preset-tab',
        run:
          kind === active
            ? noop
            : () => {
                applyAxisLayoutPreset(controller, kind);
              }
      })
    ),
    {
      id: 'axis.preset.reset',
      label: 'Reset layout',
      danger: true,
      confirm: {
        prompt: `Reset to the “${axisLayoutPresetLabel(active)}” preset? Undo brings it back.`,
        confirmLabel: 'Reset'
      },
      run: () => {
        applyAxisLayoutPreset(controller, active);
      }
    }
  ];
}

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
 * Apply a preset (any of the six kinds — a LAYOUT-tab preset, or a tablet /
 * mobile seed for Reset layout on those profiles) to the *active* profile — the
 * design's `onPreset(id)`: replace the active profile's layout with `preset(id)`
 * while **preserving the current `rightW`**, then set it active.
 *
 * The preset layout is minted with a fresh `layout-*` id (via `createWorkbenchId`,
 * never a hand-picked constant that could collide), saved into the document, and
 * pointed to by the active profile. The REPLACED layout is deleted in the same
 * batch when no other profile references it — no UI lists stored whole layouts,
 * so it would only be dead weight in every persisted copy. One batch = one undo
 * step, and undo restores both.
 */
export function applyAxisLayoutPreset(
  controller: WorkbenchController,
  kind: AxisLayoutPresetKind
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
  const previousId = doc.profiles[activeProfileId].layoutId;
  const previousStillUsed = Object.entries(doc.profiles).some(
    ([profileId, profile]) => profileId !== activeProfileId && profile.layoutId === previousId
  );

  const batch = controller.dispatchMany([
    { type: 'layout.save', layout },
    { type: 'profile.setLayout', profileId: activeProfileId, layoutId: layout.id },
    ...(doc.layouts[previousId] && !previousStillUsed ? [{ type: 'layout.delete' as const, layoutId: previousId }] : [])
  ]);
  if (!batch.success) return { success: false, error: batch.error };
  // Transient confirmation (design shows `Applied "<Kind>" layout`). Fired from
  // the action layer so every caller (the edit bar's LAYOUT presets and Reset
  // layout) gets it for free — no per-call-site enqueue needed.
  enqueueToast({ text: `Applied "${axisLayoutPresetLabel(kind)}" layout` });
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
  enqueueToast({ text: `Copied layout to ${target.label}` });
  return { success: true, layoutId: clone.id };
}

export { axisLayoutPresetLabel };
export type { AxisLayoutPresetKind };
