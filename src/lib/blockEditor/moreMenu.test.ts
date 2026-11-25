import { describe, expect, it, vi } from 'vitest';
import type { WorkbenchMenuItem } from '../workbench';
import { buildMoreMenu, builtInName, canArrangeOn, isCopyProfile, navChoiceShown, resetAllToast, seedIsDevice, type MoreMenuActions, type MoreMenuState } from './moreMenu';

const actions = (): MoreMenuActions & Record<string, ReturnType<typeof vi.fn>> =>
  ({
    arrange: vi.fn(),
    nav: vi.fn(),
    density: vi.fn(),
    profile: vi.fn(),
    resetPage: vi.fn(),
    resetFixed: vi.fn(),
    resetAll: vi.fn(),
    resetDevice: vi.fn(),
    newCopy: vi.fn(),
    deleteCopy: vi.fn(),
    saveDefault: vi.fn(),
    forgetDefault: vi.fn(),
    changeType: vi.fn(),
    remove: vi.fn()
  }) as never;

const state = (over: Partial<MoreMenuState> = {}): MoreMenuState => ({
  deviceClass: 'desktop',
  editMode: false,
  nav: 'top',
  sideFits: true,
  density: 'm',
  profiles: ['Default', 'Blank'],
  profile: 'Default',
  custom: false,
  page: 'Main',
  pageCustom: false,
  pageInSeed: true,
  hasBoard: true,
  hasUserSeed: false,
  hasDeviceLayout: true,
  typeName: 'Amp',
  block: { isCab: false, canRetype: true },
  ...over
});

const ids = (items: WorkbenchMenuItem[]) => items.map((i) => i.id);
const byId = (items: WorkbenchMenuItem[], id: string) => items.find((i) => i.id === id)!;

describe('buildMoreMenu', () => {
  it('desktop block: arrange, navigation, control size, layout, block rows in order', () => {
    const items = buildMoreMenu(state(), actions());
    expect(ids(items)).toEqual([
      'arrange',
      'nav-head',
      'nav-top',
      'nav-side',
      'size-head',
      'size-s',
      'size-m',
      'size-l',
      'layout-head',
      'profile:Default',
      'profile:Blank',
      'reset-page',
      'reset-all',
      'new-copy',
      'reset-all-layouts',
      'save-default',
      'change-type',
      'remove'
    ]);
    // each section starts with a separator (not the first row)
    expect(items.filter((i) => i.separatorBefore).map((i) => i.id)).toEqual(['nav-head', 'size-head', 'layout-head', 'change-type']);
    expect(items.every((i) => i.className?.startsWith('be-mi be-mi-'))).toBe(true);
  });

  it('phone: no Arrange (F12); a phone too narrow for the side list gets no navigation choice', () => {
    const items = buildMoreMenu(state({ deviceClass: 'phone', sideFits: false }), actions());
    expect(ids(items)).not.toContain('arrange');
    expect(ids(items)).not.toContain('nav-top');
    expect(ids(items)).not.toContain('nav-side');
    expect(items[0]!.id).toBe('size-head');
    expect(items[0]!.separatorBefore).toBeUndefined();
    expect(canArrangeOn('tablet')).toBe(true);
    expect(canArrangeOn('phone')).toBe(false);
  });

  it('a stored side choice keeps the navigation rows even where the side list cannot show', () => {
    expect(navChoiceShown({ nav: 'side', sideFits: false })).toBe(true);
    const items = buildMoreMenu(state({ nav: 'side', sideFits: false }), actions());
    expect(byId(items, 'nav-side')).toMatchObject({ kind: 'radio', checked: true, hint: 'too narrow' });
    expect(byId(items, 'nav-top').checked).toBe(false);
  });

  it('radio rows reflect and set navigation, control size and profile', () => {
    const a = actions();
    const items = buildMoreMenu(state({ density: 'l', profiles: ['Default', 'Blank', 'Layout 1'], profile: 'Layout 1' }), a);
    expect(['size-s', 'size-m', 'size-l'].map((id) => byId(items, id).checked)).toEqual([false, false, true]);
    expect(byId(items, 'size-s').label).toBe('Small');
    expect(byId(items, 'size-m').label).toBe('Medium');
    byId(items, 'size-s').run();
    expect(a.density).toHaveBeenCalledWith('s');
    byId(items, 'nav-side').run();
    expect(a.nav).toHaveBeenCalledWith('side');
    expect(byId(items, 'profile:Layout 1').checked).toBe(true);
    byId(items, 'profile:Blank').run();
    expect(a.profile).toHaveBeenCalledWith('Blank');
    expect(byId(items, 'profile:Default').hint).toBe('device');
  });

  it('arrange toggles; its label follows the mode', () => {
    const a = actions();
    buildMoreMenu(state(), a)[0]!.run();
    expect(a.arrange).toHaveBeenCalledWith(true);
    const on = buildMoreMenu(state({ editMode: true }), a);
    expect(on[0]!.label).toBe('Finish arranging');
    on[0]!.run();
    expect(a.arrange).toHaveBeenLastCalledWith(false);
  });

  it('layout status: Default disables the resets; Custom enables them and marks the header', () => {
    const plain = buildMoreMenu(state(), actions());
    expect(byId(plain, 'layout-head').label).toBe('Layout · Default');
    expect(byId(plain, 'reset-page').disabled).toBe(true);
    expect(byId(plain, 'reset-all').disabled).toBe(true);
    const custom = buildMoreMenu(state({ custom: true }), actions());
    expect(byId(custom, 'layout-head')).toMatchObject({ label: 'Layout · Custom', className: 'be-mi be-mi-layout-head custom' });
    expect(byId(custom, 'reset-all')).toMatchObject({ disabled: false, confirm: { prompt: 'Reset every page to the device layout?', confirmLabel: 'Reset' } });
  });

  it('reset this page: only when the current page differs, always asked, and it says what happens', () => {
    // another page changed, this one did not
    expect(byId(buildMoreMenu(state({ custom: true, pageCustom: false }), actions()), 'reset-page').disabled).toBe(true);
    const a = actions();
    const changed = byId(buildMoreMenu(state({ custom: true, pageCustom: true, page: 'Preamp' }), a), 'reset-page');
    expect(changed).toMatchObject({ label: 'Reset this page', disabled: false, confirm: { prompt: 'Reset “Preamp” to the device layout?', confirmLabel: 'Reset' } });
    changed.run();
    expect(a.resetPage).toHaveBeenCalled();
    // a page the seed does not have is cleared — the row and the prompt say so
    const own = byId(buildMoreMenu(state({ custom: true, pageCustom: true, pageInSeed: false, page: 'Mine' }), a), 'reset-page');
    expect(own).toMatchObject({ label: 'Clear this page', confirm: { prompt: '“Mine” is not in the device layout — clear it?', confirmLabel: 'Clear' } });
    // with a saved default the seed is that default
    const saved = byId(buildMoreMenu(state({ custom: true, pageCustom: true, hasUserSeed: true, page: 'Preamp' }), a), 'reset-page');
    expect(saved.confirm?.prompt).toBe('Reset “Preamp” to your saved default?');
  });

  it('Reset fixed area: next to "Reset this page", only where the board or its seed has one, only when it differs', () => {
    expect(ids(buildMoreMenu(state(), actions()))).not.toContain('reset-fixed');
    const a = actions();
    const same = buildMoreMenu(state({ fixed: { inSeed: true, custom: false } }), a);
    expect(ids(same).slice(ids(same).indexOf('reset-page'), ids(same).indexOf('reset-all') + 1)).toEqual(['reset-page', 'reset-fixed', 'reset-all']);
    expect(byId(same, 'reset-fixed')).toMatchObject({ label: 'Reset fixed area', disabled: true });
    const changed = byId(buildMoreMenu(state({ custom: true, fixed: { inSeed: true, custom: true } }), a), 'reset-fixed');
    expect(changed).toMatchObject({ disabled: false, confirm: { prompt: 'Reset the fixed area to the device layout?', confirmLabel: 'Reset' } });
    changed.run();
    expect(a.resetFixed).toHaveBeenCalled();
    expect(byId(buildMoreMenu(state({ custom: true, hasUserSeed: true, fixed: { inSeed: true, custom: true } }), a), 'reset-fixed').confirm?.prompt).toBe('Reset the fixed area to your saved default?');
    // the seed has none: the reset takes it away, and says so
    const own = byId(buildMoreMenu(state({ custom: true, fixed: { inSeed: false, custom: true } }), a), 'reset-fixed');
    expect(own).toMatchObject({ label: 'Remove fixed area', confirm: { prompt: 'The device layout has no fixed area — remove it?', confirmLabel: 'Remove' } });
    expect(byId(buildMoreMenu(state({ custom: true, hasDeviceLayout: false, fixed: { inSeed: false, custom: true } }), a), 'reset-fixed').confirm?.prompt).toBe('The default layout has no fixed area — remove it?');
    expect(byId(buildMoreMenu(state({ profile: 'Blank', custom: true, fixed: { inSeed: false, custom: true } }), a), 'reset-fixed')).toMatchObject({ label: 'Remove fixed area', confirm: { confirmLabel: 'Remove' } });
    // without a board it is disabled like the other layout rows
    expect(byId(buildMoreMenu(state({ hasBoard: false, custom: true, fixed: { inSeed: true, custom: true } }), a), 'reset-fixed').disabled).toBe(true);
  });

  it('Blank: resets clear, and no device-layout / saved-default rows', () => {
    const items = buildMoreMenu(state({ profile: 'Blank', custom: true, pageCustom: true, hasUserSeed: true, page: 'Page 1' }), actions());
    expect(byId(items, 'reset-all')).toMatchObject({ label: 'Clear all pages', confirm: { prompt: 'Clear every page?', confirmLabel: 'Clear' } });
    expect(byId(items, 'reset-page')).toMatchObject({ label: 'Clear this page', confirm: { prompt: 'Clear “Page 1”?', confirmLabel: 'Clear' } });
    expect(ids(items)).not.toContain('reset-device');
    expect(ids(items)).not.toContain('forget-default');
    expect(ids(items)).toContain('save-default');
  });

  it('a copy can be deleted (with confirm); built-ins cannot', () => {
    expect(isCopyProfile('Layout 1')).toBe(true);
    expect(isCopyProfile('Default')).toBe(false);
    expect(isCopyProfile('Blank')).toBe(false);
    expect(ids(buildMoreMenu(state({ profile: 'Blank' }), actions()))).not.toContain('delete-copy');
    const a = actions();
    const items = buildMoreMenu(state({ profiles: ['Default', 'Blank', 'Mine'], profile: 'Mine' }), a);
    const del = byId(items, 'delete-copy');
    expect(del).toMatchObject({ label: 'Delete “Mine”', danger: true });
    expect(del.confirm?.prompt).toContain('Mine');
    del.run();
    expect(a.deleteCopy).toHaveBeenCalledWith('Mine');
  });

  it('a saved default for the type adds "Reset to device layout" and "Forget saved default"', () => {
    const a = actions();
    const items = buildMoreMenu(state({ hasUserSeed: true, custom: true }), a);
    expect(ids(items)).toContain('reset-device');
    expect(ids(items)).toContain('forget-default');
    expect(byId(items, 'reset-all').confirm?.prompt).toBe('Reset every page to your saved default?');
    expect(byId(items, 'profile:Default').hint).toBe('yours');
    expect(byId(items, 'save-default').label).toBe('Save as default for Amp');
    byId(items, 'forget-default').run();
    expect(a.forgetDefault).toHaveBeenCalled();
    expect(ids(buildMoreMenu(state(), a))).not.toContain('reset-device');
  });

  it('F10: with the device layout as the seed the whole-layout reset reads "Reset to device layout"', () => {
    const a = actions();
    // Default (and a copy) without a saved default: one row, worded after the device layout
    for (const profile of ['Default', 'Mine']) {
      const items = buildMoreMenu(state({ profiles: ['Default', 'Blank', 'Mine'], profile, custom: true }), a);
      expect(byId(items, 'reset-all')).toMatchObject({ label: 'Reset to device layout', disabled: false, confirm: { prompt: 'Reset every page to the device layout?' } });
      expect(ids(items)).not.toContain('reset-device'); // no second row saying the same
    }
    byId(buildMoreMenu(state({ custom: true }), a), 'reset-all').run();
    expect(a.resetAll).toHaveBeenCalled();
    // unchanged: nothing to reset
    expect(byId(buildMoreMenu(state(), a), 'reset-all')).toMatchObject({ label: 'Reset to device layout', disabled: true });
    // a saved default is the seed: "Reset all pages" goes back to it, "Reset to device layout" stays reachable
    const saved = buildMoreMenu(state({ hasUserSeed: true, custom: true }), a);
    expect(byId(saved, 'reset-all').label).toBe('Reset all pages');
    expect(byId(saved, 'reset-device').label).toBe('Reset to device layout');
    expect(seedIsDevice('Default', false)).toBe(true);
    expect(seedIsDevice('Default', true)).toBe(false);
    expect(seedIsDevice('Blank', false)).toBe(false);
    // the toast says what happened, worded like the row
    expect(resetAllToast('Default', false)).toBe('Reset to the device layout');
    expect(resetAllToast('Default', true)).toBe('All pages reset to your saved default');
    expect(resetAllToast('Blank', false)).toBe('All pages cleared');
  });

  it('without a device layout (curated fallback, virtual screens without one): "Reset all pages" and "the default layout"', () => {
    const items = buildMoreMenu(state({ hasDeviceLayout: false, custom: true, pageCustom: true, page: 'Main' }), actions());
    expect(byId(items, 'reset-all')).toMatchObject({ label: 'Reset all pages', confirm: { prompt: 'Reset every page to the default layout?' } });
    expect(byId(items, 'reset-page').confirm?.prompt).toBe('Reset “Main” to the default layout?');
    const withFixed = buildMoreMenu(state({ custom: true, pageCustom: true, page: 'Main', pageReset: { toFixed: ['Mix'], addsFixed: true, lost: ['Drive'] } }), actions());
    expect(byId(withFixed, 'reset-page').confirm?.prompt).toContain('Mix moves to the fixed area, which is added.');
    expect(byId(withFixed, 'reset-page').confirm?.prompt).toContain('Drive');
    expect(byId(items, 'profile:Default').hint).toBe('built-in');
    // with a saved default the extra row names the default layout too
    const saved = buildMoreMenu(state({ hasDeviceLayout: false, hasUserSeed: true, custom: true }), actions());
    expect(byId(saved, 'reset-device')).toMatchObject({ label: 'Reset to default layout', confirm: { prompt: 'Replace this layout with the default layout?' } });
    expect(seedIsDevice('Default', false, false)).toBe(false);
    expect(resetAllToast('Default', false, false)).toBe('All pages reset to the default layout');
    expect(builtInName(false)).toBe('the default layout');
    expect(builtInName(true)).toBe('the device layout');
  });

  it('cab: "Choose cab…"; no palette to open disables it; there is no grid map row', () => {
    const a = actions();
    const cab = buildMoreMenu(state({ block: { isCab: true, canRetype: true } }), a);
    expect(byId(cab, 'change-type').label).toBe('Choose cab…');
    expect(ids(cab)).not.toContain('grid-map');
    const none = buildMoreMenu(state({ block: { isCab: false, canRetype: false } }), a);
    expect(byId(none, 'change-type')).toMatchObject({ label: 'Change type…', disabled: true });
    expect(ids(none)).not.toContain('grid-map');
    expect(byId(none, 'remove')).toMatchObject({ danger: true, confirm: { confirmLabel: 'Remove' } });
  });

  it('virtual screens (no block): no type or remove rows', () => {
    const items = buildMoreMenu(state({ block: null, typeName: 'Setup' }), actions());
    expect(ids(items)).not.toContain('change-type');
    expect(ids(items)).not.toContain('remove');
    expect(items[items.length - 1]!.id).toBe('save-default');
    expect(byId(items, 'save-default').label).toBe('Save as default for Setup');
  });

  it('without a board (no pack, reading, error) every board row is disabled; the block rows stay', () => {
    const items = buildMoreMenu(state({ hasBoard: false, custom: true, pageCustom: true, profiles: ['Default', 'Blank', 'Mine'], profile: 'Mine', hasUserSeed: true }), actions());
    for (const id of ['arrange', 'nav-top', 'nav-side', 'size-s', 'size-m', 'size-l', 'profile:Default', 'profile:Blank', 'profile:Mine', 'reset-page', 'reset-all', 'reset-device', 'new-copy', 'delete-copy', 'save-default', 'forget-default'])
      expect(byId(items, id).disabled, id).toBe(true);
    for (const id of ['change-type', 'remove']) expect(byId(items, id).disabled, id).toBeFalsy();
  });

  it('a missing type name reads "this block"', () => {
    expect(byId(buildMoreMenu(state({ typeName: '' }), actions()), 'save-default').label).toBe('Save as default for this block');
  });

  it('a phone-width header moves Bypass mode in here: a submenu first in the block rows (disabled with its reason)', () => {
    const rows: WorkbenchMenuItem[] = [{ id: 'bm:0', kind: 'radio', label: 'Thru', checked: true, run: () => {} }];
    const items = buildMoreMenu(state({ block: { isCab: false, canRetype: true, bypassMode: { label: 'Thru', reason: null, muting: false, rows } } }), actions());
    expect(ids(items).slice(-3)).toEqual(['bypass-mode', 'change-type', 'remove']);
    expect(byId(items, 'bypass-mode')).toMatchObject({ kind: 'submenu', label: 'Bypass mode', hint: 'Thru', disabled: false, items: rows, separatorBefore: true });
    expect(byId(items, 'change-type').separatorBefore).toBeFalsy();
    const muting = buildMoreMenu(state({ block: { isCab: false, canRetype: true, bypassMode: { label: 'Mute Out', reason: null, muting: true, rows } } }), actions());
    expect(byId(muting, 'bypass-mode').className).toBe('be-mi be-mi-bypass-mode muting');
    const off = buildMoreMenu(
      state({ block: { isCab: false, canRetype: true, bypassMode: { label: '', reason: 'Not available on VP4', muting: false, rows: [] } } }),
      actions()
    );
    expect(byId(off, 'bypass-mode')).toMatchObject({ disabled: true, hint: 'Not available on VP4', items: [] });
    // a wider header keeps the control: no row
    expect(ids(buildMoreMenu(state(), actions()))).not.toContain('bypass-mode');
  });
});
