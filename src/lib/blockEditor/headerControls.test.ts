import { describe, expect, it } from 'vitest';
import type { DeviceLayout, LayoutControl } from '../types';
import { buildCatalog } from './catalog';
import { headerKeys, headerRole, namedAfterOther, pageLayoutControls } from './headerControls';

const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: `o${i}` }));
const en = (id: number, name: string, n = 4) => ({ id, name, options: opts(n) });
const ctl = (paramId: number | null, paramName: string | null, extra: Partial<LayoutControl> = {}): LayoutControl => ({ label: paramName ?? '', paramName, paramId, widget: 'button', ...extra });
const layout = (controls: LayoutControl[], extra: Partial<DeviceLayout> = {}): DeviceLayout => ({ family: 'X', pages: [{ name: 'P', rows: [{ section: 'mixer', controls }] }], ...extra });
const keys = (s: Set<string>) => [...s].sort();

describe('headerKeys', () => {
  it('always the bypass action; the params the server tags, whatever they are called and of whichever kind', () => {
    const cat = buildCatalog({ params: [{ id: 5, name: 'Odd Mode' }], enums: [en(7, 'Keep State'), en(8, 'Other')] });
    expect(keys(headerKeys(cat))).toEqual(['bypass']);
    expect(keys(headerKeys(cat, { blockState: { sceneIgnore: { paramId: 7 }, bypassMode: { paramId: 5 } } }))).toEqual(['bypass', 'e7', 'k5']);
    expect(keys(headerKeys(cat, { blockState: { sceneIgnore: null, bypassMode: { paramId: 99 } } }))).toEqual(['bypass']); // not listed: nothing
  });

  it('labels that are exactly Bypass / Bypass Mode / Scene Ignore (case, spaces, line breaks don’t count)', () => {
    const cat = buildCatalog({
      params: [],
      enums: [en(1, 'Bypass\nMode'), en(2, ' scene  IGNORE '), en(3, 'BYPASS', 2), en(4, 'Cab Bypass', 2), en(5, 'Bypass 2', 2), en(6, 'Bypass Reset'), en(7, 'Eff. Bypass Mode')]
    });
    expect(keys(headerKeys(cat))).toEqual(['bypass', 'e1', 'e2', 'e3']);
  });

  it('without a tag: the block’s own layout controls by widget or param name', () => {
    const cat = buildCatalog({ params: [], enums: [en(1, 'Modus'), en(2, 'Szene', 2), en(3, 'Aus', 2), en(4, 'Widget', 2), en(5, 'Tone')] });
    const l = layout([
      ctl(1, 'X_BYPASSMODE', { rawWidget: 'dropdown1Tight' }),
      ctl(2, 'X_SCENEIGNORE'),
      ctl(3, 'OLD_X_BYPASS', { rawWidget: 'btnBypass' }),
      ctl(4, 'X_STATE', { rawWidget: 'btnIgnoreScene' }),
      ctl(5, 'X_TONE')
    ]);
    expect(keys(headerKeys(cat, { layout: l }))).toEqual(['bypass', 'e1', 'e2', 'e3', 'e4']);
    // tagged: the tag decides about Scene Ignore and Bypass Mode; the block's own bypass flag stays the header's
    expect(keys(headerKeys(cat, { layout: l, blockState: { sceneIgnore: { paramId: 2 }, bypassMode: null } }))).toEqual(['bypass', 'e2', 'e3']);
  });

  it('the bypass of a part of the block (a cab slot, an EQ) is an ordinary control', () => {
    const cat = buildCatalog({ params: [], enums: [en(1, 'EQ Off', 2), en(2, 'Slot Off', 2)] });
    const l = layout([ctl(1, 'X_EQ_BYPASS', { label: 'EQ Bypass' }), ctl(2, 'X_SLOT1_BYPASS', { rawWidget: 'btnBypass' })]);
    expect(keys(headerKeys(cat, { layout: l }))).toEqual(['bypass']);
    expect(headerRole({ paramName: 'X_EQ_BYPASS', rawWidget: 'btnBypass' }, 'X')).toBeNull();
    expect(headerRole({ paramName: 'X_LFORESET', rawWidget: 'dropdown1' }, 'X')).toBeNull();
    expect(headerRole({ paramName: null, rawWidget: 'btnBypass' }, 'X')).toBe('bypass');
    expect(headerRole({ paramName: 'X_BYPASSMODE' }, 'X')).toBe('mode');
    expect(headerRole({ paramName: 'X_SCENEIGNORE' }, 'X')).toBe('scene');
    expect(headerRole({ paramName: 'X_OLD_BYPASS', rawWidget: 'btnBypass' }, 'X')).toBe('bypass');
  });

  it('a foreign name without crossBlock and an own bypass dropdown stay in the board', () => {
    const cat = buildCatalog({ params: [], enums: [en(1, 'Tempo 1'), en(2, 'Amp Section'), en(3, 'Toggle')] });
    const l = layout([
      ctl(1, 'OTHER_BYPASS', { rawWidget: 'btnBypass' }),
      ctl(2, 'X_BYPASS', { widget: 'dropdown', rawWidget: 'dropdown1' }),
      ctl(3, 'X_BYPASS', { rawWidget: 'btnBypass2' })
    ]);
    expect(keys(headerKeys(cat, { layout: l }))).toEqual(['bypass', 'e3']);
  });

  it('compares family tokens after normalizing case and the OLD prefix', () => {
    expect(namedAfterOther('old_oThEr_gain', 'X')).toBe(true);
    expect(namedAfterOther('old_x_gain', 'X')).toBe(false);
    expect(headerRole({ paramName: 'oThEr_gain', rawWidget: 'btnBypass' }, 'X')).toBeNull();
  });

  it('a control of another block never counts; page-level controls do', () => {
    const cat = buildCatalog({ params: [], enums: [en(1, 'A'), en(2, 'B')] });
    const foreign = ctl(1, 'GLOBAL_BYPASSMODE', { crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: 'GLOBAL_BYPASSMODE', paramId: 1 } as never });
    expect(keys(headerKeys(cat, { layout: layout([foreign]), effectId: 58 }))).toEqual(['bypass']);
    const pageLevel: DeviceLayout = { family: 'X', pages: [{ name: 'P', rows: [], pageControls: [ctl(2, 'X_SCENEIGNORE')] }] };
    expect(keys(headerKeys(cat, { layout: pageLevel }))).toEqual(['bypass', 'e2']);
    expect(pageLayoutControls(pageLevel.pages[0])).toHaveLength(1);
    expect(pageLayoutControls(null)).toEqual([]);
  });

  it('uses the effect id to recognize a header control referenced by this block instance', () => {
    const cat = buildCatalog({ params: [], enums: [en(1, 'State')] });
    const taggedRef = ctl(1, 'X_SCENEIGNORE', { crossBlock: { effect: 'ID_X1', effectId: 58, family: 'X', paramName: 'X_SCENEIGNORE', paramId: 1 } });
    expect(keys(headerKeys(cat, { layout: layout([taggedRef]), effectId: 58 }))).toEqual(['bypass', 'e1']);
    expect(keys(headerKeys(cat, { layout: layout([taggedRef]), effectId: 59 }))).toEqual(['bypass']);
  });

  it('graphs, meters and the EQ are never header controls by their title', () => {
    const cat = buildCatalog({ params: [], enums: [], eqBandCount: 2, eqTitle: 'Bypass', monitors: [{ role: 'vu' }] });
    expect(keys(headerKeys(cat))).toEqual(['bypass']);
  });
});
