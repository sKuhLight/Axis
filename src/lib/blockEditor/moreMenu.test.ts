import { describe, expect, it, vi } from 'vitest';
import type { WorkbenchMenuItem } from '../workbench';
import { buildMoreMenu, canArrangeOn, isCopyProfile, navChoiceShown, type MoreMenuActions, type MoreMenuState } from './moreMenu';

const actions = (): MoreMenuActions & Record<string, ReturnType<typeof vi.fn>> =>
  ({
    arrange: vi.fn(),
    nav: vi.fn(),
    density: vi.fn(),
    profile: vi.fn(),
    resetPage: vi.fn(),
    resetAll: vi.fn(),
    resetDevice: vi.fn(),
    newCopy: vi.fn(),
    deleteCopy: vi.fn(),
    saveDefault: vi.fn(),
    forgetDefault: vi.fn(),
    changeType: vi.fn(),
    gridMap: vi.fn(),
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
  typeName: 'Amp',
  block: { isCab: false, canRetype: true, gridMapShown: true },
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
      'save-default',
      'change-type',
      'grid-map',
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
    expect(byId(items, 'size-s').label).toBe('Compact');
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

  it('cab: "Choose cab…"; no palette to open disables it; grid map label follows its state', () => {
    const a = actions();
    const cab = buildMoreMenu(state({ block: { isCab: true, canRetype: true, gridMapShown: false } }), a);
    expect(byId(cab, 'change-type').label).toBe('Choose cab…');
    expect(byId(cab, 'grid-map').label).toBe('Show grid map');
    byId(cab, 'grid-map').run();
    expect(a.gridMap).toHaveBeenCalledWith(true);
    const none = buildMoreMenu(state({ block: { isCab: false, canRetype: false, gridMapShown: true } }), a);
    expect(byId(none, 'change-type')).toMatchObject({ label: 'Change type…', disabled: true });
    expect(byId(none, 'grid-map').label).toBe('Hide grid map');
    expect(byId(none, 'remove')).toMatchObject({ danger: true, confirm: { confirmLabel: 'Remove' } });
  });

  it('virtual screens (no block): no type, grid map or remove rows', () => {
    const items = buildMoreMenu(state({ block: null, typeName: 'Setup' }), actions());
    expect(ids(items)).not.toContain('change-type');
    expect(ids(items)).not.toContain('grid-map');
    expect(ids(items)).not.toContain('remove');
    expect(items[items.length - 1]!.id).toBe('save-default');
    expect(byId(items, 'save-default').label).toBe('Save as default for Setup');
  });

  it('without a board (no pack, reading, error) every board row is disabled; the block rows stay', () => {
    const items = buildMoreMenu(state({ hasBoard: false, custom: true, pageCustom: true, profiles: ['Default', 'Blank', 'Mine'], profile: 'Mine', hasUserSeed: true }), actions());
    for (const id of ['arrange', 'nav-top', 'nav-side', 'size-s', 'size-m', 'size-l', 'profile:Default', 'profile:Blank', 'profile:Mine', 'reset-page', 'reset-all', 'reset-device', 'new-copy', 'delete-copy', 'save-default', 'forget-default'])
      expect(byId(items, id).disabled, id).toBe(true);
    for (const id of ['change-type', 'grid-map', 'remove']) expect(byId(items, id).disabled, id).toBeFalsy();
  });

  it('a missing type name reads "this block"', () => {
    expect(byId(buildMoreMenu(state({ typeName: '' }), actions()), 'save-default').label).toBe('Save as default for this block');
  });
});
