// Block Editor ⋯ menu: the rows of the "More" menu as workbench menu items (rendered by the workbench
// ContextMenu: radio rows, headers, inline confirm). The same builder serves the Block Editor header
// and the compact row of the virtual-effect screens (Setup / Controllers / Modifier), which leave out
// the block-only rows. Pure (moreMenu.test.ts).

import type { WorkbenchMenuItem } from '../workbench';
import type { BeDensity, BeNav } from './boardGeometry';
import { BLANK_PROFILE, DEFAULT_PROFILE, type DeviceClass } from './boardPersistence';

export interface MoreMenuBlock {
  isCab: boolean;
  /** The block has a model palette / cab picker to open. */
  canRetype: boolean;
  /** The grid map strip is shown. */
  gridMapShown: boolean;
}

export interface MoreMenuState {
  deviceClass: DeviceClass;
  editMode: boolean;
  /** Stored navigation choice. */
  nav: BeNav;
  /** The editor is wide enough for the side navigation. */
  sideFits: boolean;
  density: BeDensity;
  profiles: readonly string[];
  profile: string;
  /** The active layout differs from its seed (status "Custom"). */
  custom: boolean;
  /** The current page, and whether it differs from / exists in the seed (Reset this page). */
  page: string;
  pageCustom: boolean;
  pageInSeed: boolean;
  /** A board is loaded (the layout actions need one). */
  hasBoard: boolean;
  /** A "default for this type" is saved for the block family. */
  hasUserSeed: boolean;
  /** The built-in seed comes from the device layout (false: the curated fallback of a block or screen
   *  without one — the rows then speak of "the default layout"). */
  hasDeviceLayout: boolean;
  /** Name in "Save as default for …" (the block family, or the screen). */
  typeName: string;
  /** Rows that only a grid block has (change type, grid map, remove); absent on virtual screens. */
  block?: MoreMenuBlock | null;
}

export interface MoreMenuActions {
  arrange(on: boolean): void;
  nav(nav: BeNav): void;
  density(density: BeDensity): void;
  profile(name: string): void;
  resetPage(): void;
  resetAll(): void;
  resetDevice(): void;
  newCopy(): void;
  deleteCopy(name: string): void;
  saveDefault(): void;
  forgetDefault(): void;
  changeType(): void;
  gridMap(show: boolean): void;
  remove(): void;
}

export const DENSITY_LABEL: Readonly<Record<BeDensity, string>> = { s: 'Compact', m: 'Normal', l: 'Large' };

/** A custom layout profile (a copy): not one of the built-ins. */
export const isCopyProfile = (name: string): boolean => name !== DEFAULT_PROFILE && name !== BLANK_PROFILE;

/** Arrange is offered on desktop and tablet, never on a phone (F12). */
export const canArrangeOn = (cls: DeviceClass): boolean => cls !== 'phone';

/** The Top / Side choice is offered where the side list can take effect, or when it is the stored choice. */
export const navChoiceShown = (s: Pick<MoreMenuState, 'nav' | 'sideFits'>): boolean => s.sideFits || s.nav === 'side';

/** The profile's seed is the device layout (not Blank, no saved "default for this type", and the block has
 *  a device layout): its whole-layout reset is "Reset to device layout" (F10). */
export const seedIsDevice = (profile: string, hasUserSeed: boolean, hasDeviceLayout = true): boolean =>
  profile !== BLANK_PROFILE && !hasUserSeed && hasDeviceLayout;

/** How the rows and toasts name the built-in seed. */
export const builtInName = (hasDeviceLayout: boolean): string => (hasDeviceLayout ? 'the device layout' : 'the default layout');

/** Toast after the whole-layout reset, worded like its row. */
export function resetAllToast(profile: string, hasUserSeed: boolean, hasDeviceLayout = true): string {
  if (profile === BLANK_PROFILE) return 'All pages cleared';
  if (seedIsDevice(profile, hasUserSeed, hasDeviceLayout)) return 'Reset to the device layout';
  return hasUserSeed ? 'All pages reset to your saved default' : 'All pages reset to the default layout';
}

const cls = (id: string, extra = ''): string => `be-mi be-mi-${id}${extra ? ' ' + extra : ''}`;

/** Build the ⋯ menu. Every row carries a stable `be-mi-<id>` class (e2e / styling hooks). */
export function buildMoreMenu(s: MoreMenuState, a: MoreMenuActions): WorkbenchMenuItem[] {
  const out: WorkbenchMenuItem[] = [];
  let sep = false;
  const push = (item: WorkbenchMenuItem) => {
    out.push(sep && out.length ? { ...item, separatorBefore: true } : item);
    sep = false;
  };
  const section = () => (sep = true);
  // without a board (no pack, reading, error) nothing below can take effect
  const off = !s.hasBoard;
  const blank = s.profile === BLANK_PROFILE;
  const seedName = s.hasUserSeed ? 'your saved default' : builtInName(s.hasDeviceLayout);

  if (canArrangeOn(s.deviceClass)) {
    push({
      id: 'arrange',
      label: s.editMode ? 'Finish arranging' : 'Arrange controls',
      hint: s.editMode ? 'Done' : undefined,
      disabled: off,
      className: cls('arrange'),
      run: () => a.arrange(!s.editMode)
    });
    section();
  }

  if (navChoiceShown(s)) {
    push({ id: 'nav-head', kind: 'header', label: 'Navigation', className: cls('nav-head'), run: () => {} });
    out.push({ id: 'nav-top', kind: 'radio', label: 'Top tabs', checked: s.nav === 'top', disabled: off, className: cls('nav-top'), run: () => a.nav('top') });
    out.push({
      id: 'nav-side',
      kind: 'radio',
      label: 'Side list',
      hint: s.sideFits ? undefined : 'too narrow',
      checked: s.nav === 'side',
      disabled: off,
      className: cls('nav-side'),
      run: () => a.nav('side')
    });
    section();
  }

  push({ id: 'size-head', kind: 'header', label: 'Control size', className: cls('size-head'), run: () => {} });
  for (const d of ['s', 'm', 'l'] as const) {
    out.push({ id: `size-${d}`, kind: 'radio', label: DENSITY_LABEL[d], checked: s.density === d, disabled: off, className: cls(`size-${d}`), run: () => a.density(d) });
  }
  section();

  push({
    id: 'layout-head',
    kind: 'header',
    label: `Layout · ${s.custom ? 'Custom' : 'Default'}`,
    className: cls('layout-head', s.custom ? 'custom' : ''),
    run: () => {}
  });
  for (const name of s.profiles) {
    out.push({
      id: `profile:${name}`,
      kind: 'radio',
      label: name,
      hint: name === DEFAULT_PROFILE ? (s.hasUserSeed ? 'yours' : s.hasDeviceLayout ? 'device' : 'built-in') : name === BLANK_PROFILE ? 'empty' : undefined,
      checked: name === s.profile,
      disabled: off,
      className: cls('profile'),
      run: () => a.profile(name)
    });
  }
  // the current page only, and only when it differs from its seed page; Blank's seed is empty
  const pagePrompt = blank
    ? `Clear “${s.page}”?`
    : s.pageInSeed
      ? `Reset “${s.page}” to ${seedName}?`
      : `“${s.page}” is not in ${seedName} — clear it?`;
  out.push({
    id: 'reset-page',
    label: blank || !s.pageInSeed ? 'Clear this page' : 'Reset this page',
    disabled: off || !s.pageCustom,
    className: cls('reset-page'),
    confirm: { prompt: pagePrompt, confirmLabel: blank || !s.pageInSeed ? 'Clear' : 'Reset' },
    run: () => a.resetPage()
  });
  // the whole layout back to its seed: with the device layout as the seed (the Default profile, F10) the
  // row says so; with a saved default it resets to that one and "Reset to device layout" follows; without
  // a device layout (curated fallback) it stays "Reset all pages"
  out.push({
    id: 'reset-all',
    label: blank ? 'Clear all pages' : seedIsDevice(s.profile, s.hasUserSeed, s.hasDeviceLayout) ? 'Reset to device layout' : 'Reset all pages',
    disabled: off || !s.custom,
    className: cls('reset-all'),
    confirm: blank ? { prompt: 'Clear every page?', confirmLabel: 'Clear' } : { prompt: `Reset every page to ${seedName}?`, confirmLabel: 'Reset' },
    run: () => a.resetAll()
  });
  if (s.hasUserSeed && !blank) {
    out.push({
      id: 'reset-device',
      label: s.hasDeviceLayout ? 'Reset to device layout' : 'Reset to default layout',
      disabled: off,
      className: cls('reset-device'),
      confirm: { prompt: `Replace this layout with ${builtInName(s.hasDeviceLayout)}?`, confirmLabel: 'Reset' },
      run: () => a.resetDevice()
    });
  }
  out.push({ id: 'new-copy', label: 'New copy', disabled: off, className: cls('new-copy'), run: () => a.newCopy() });
  if (isCopyProfile(s.profile)) {
    const name = s.profile;
    out.push({
      id: 'delete-copy',
      label: `Delete “${name}”`,
      danger: true,
      disabled: off,
      className: cls('delete-copy'),
      confirm: { prompt: `Delete the layout “${name}” on every device?`, confirmLabel: 'Delete' },
      run: () => a.deleteCopy(name)
    });
  }
  out.push({ id: 'save-default', label: `Save as default for ${s.typeName || 'this block'}`, disabled: off, className: cls('save-default'), run: () => a.saveDefault() });
  if (s.hasUserSeed && !blank) {
    out.push({ id: 'forget-default', label: 'Forget saved default', disabled: off, className: cls('forget-default'), run: () => a.forgetDefault() });
  }

  const b = s.block;
  if (b) {
    section();
    push({ id: 'change-type', label: b.isCab ? 'Choose cab…' : 'Change type…', disabled: !b.canRetype, className: cls('change-type'), run: () => a.changeType() });
    out.push({ id: 'grid-map', label: b.gridMapShown ? 'Hide grid map' : 'Show grid map', className: cls('grid-map'), run: () => a.gridMap(!b.gridMapShown) });
    out.push({
      id: 'remove',
      label: 'Remove block from grid',
      danger: true,
      className: cls('remove'),
      confirm: { prompt: 'Remove this block from the grid?', confirmLabel: 'Remove' },
      run: () => a.remove()
    });
  }
  return out;
}
