import { describe, expect, it } from 'vitest';
import {
  axisFcActionLabel,
  axisFcBoardCols,
  axisFcCategoryColor,
  axisFcDeviceForSwitchCount,
  axisFcLayoutLabel,
  axisFcSlotBounds,
  createAxisFcDataView,
  type AxisFcModelLike
} from '../fc/fcWorkbenchData';

const liveModel: AxisFcModelLike = {
  effectId: 199,
  paramsWidth: 6,
  configs: 24,
  liveState: true,
  layouts: 3,
  views: 2,
  switches: 4,
  configsPerLayout: 8,
  labelLen: 10,
  fields: {
    tapParams: { width: 4 },
    holdParams: { width: 5 }
  },
  categories: {
    '0': 'Unassigned',
    '1': 'Preset',
    '2': 'Scene'
  },
  functions: {
    '1': [{ ord: 1, name: 'Select', slots: [{ i: 0, role: 'Preset', type: 'preset' }], labels: ['Name'] }],
    '2': [{ ord: 1, name: 'Scene', slots: [{ i: 0, role: 'Scene', type: 'scene' }], labels: ['Number'] }]
  },
  labelModes: {
    '0': 'Default',
    '1': 'Custom'
  },
  colors: {
    '1': { name: 'Red', hex: '#ff0000' },
    '2': { name: 'Blue', hex: '#0000ff' }
  },
  channels: ['A', 'B', 'C', 'D']
};

describe('FC Workbench data view', () => {
  it('labels the master layout consistently with the production FC editor', () => {
    expect(axisFcLayoutLabel(0)).toBe('1');
    expect(axisFcLayoutLabel(8)).toBe('Master');
  });

  it('builds live model layout, view, switch, side, and config summaries', () => {
    const view = createAxisFcDataView({
      model: liveModel,
      layout: 1,
      view: 1,
      switchIndex: 2,
      side: 'hold'
    });

    expect(view.mode).toBe('live');
    expect(view.selectedConfig).toBe(14);
    expect(view.layouts.map((layout) => [layout.label, layout.active])).toEqual([
      ['1', false],
      ['2', true],
      ['3', false]
    ]);
    expect(view.views.map((item) => item.active)).toEqual([false, true]);
    expect(view.switches.map((sw) => [sw.config, sw.active])).toEqual([
      [12, false],
      [13, false],
      [14, true],
      [15, false]
    ]);
    expect(view.sides.find((side) => side.side === 'hold')).toMatchObject({
      categoryCount: 3,
      functionCount: 2,
      slotCount: 5,
      labelModeCount: 2
    });
    expect(view.colors.map((color) => color.name)).toEqual(['Red', 'Blue']);
  });

  it('supports geometry models without live read-back', () => {
    const view = createAxisFcDataView({
      model: { ...liveModel, liveState: false, colors: undefined },
      layout: 2,
      view: 0,
      switchIndex: 3,
      side: 'tap'
    });

    expect(view.mode).toBe('geometry');
    expect(view.selectedConfig).toBe(19);
    expect(view.colors).toEqual([]);
    expect(view.note).toContain('blind writes');
  });

  it('falls back to flat config selection when no geometry is decoded', () => {
    const view = createAxisFcDataView({
      model: {
        effectId: 199,
        paramsWidth: 6,
        configs: 4,
        liveState: false
      },
      layout: 99,
      view: 99,
      switchIndex: 9,
      side: 'tap'
    });

    expect(view.mode).toBe('flat');
    expect(view.layouts).toEqual([]);
    expect(view.switches).toEqual([]);
    expect(view.selectedConfig).toBe(3);
    expect(view.configs.map((config) => config.active)).toEqual([false, false, false, true]);
    expect(view.board).toEqual([]);
  });

  it('maps switch counts to the design device chips and board columns', () => {
    expect(axisFcDeviceForSwitchCount(3)).toBe('FM3');
    expect(axisFcDeviceForSwitchCount(6)).toBe('FC-6');
    expect(axisFcDeviceForSwitchCount(12)).toBe('FC-12');
    expect(axisFcBoardCols(3)).toBe(3);
    expect(axisFcBoardCols(6)).toBe(3);
    expect(axisFcBoardCols(12)).toBe(6);
    expect(axisFcBoardCols(1)).toBe(1);
  });

  it('derives the board header device note and hero layout name', () => {
    const view = createAxisFcDataView({
      model: liveModel,
      layout: 1,
      view: 1,
      switchIndex: 0,
      side: 'tap'
    });
    expect(view.device).toBe('FM3');
    expect(view.deviceNote).toBe('4 switches · FM3 · View 2/2');
    expect(view.boardCols).toBe(3);
    expect(view.boardMaxWidth).toBe(620);
    expect(view.layoutName).toBe('LAYOUT 2');
    expect(
      createAxisFcDataView({
        model: { ...liveModel, layouts: 9 },
        layout: 8,
        view: 0,
        switchIndex: 0,
        side: 'tap'
      }).layoutName
    ).toBe('MASTER');
  });

  it('maps design category colors by decoded category name', () => {
    expect(axisFcCategoryColor('Preset')).toBe('#f5a623');
    expect(axisFcCategoryColor('Scene')).toBe('#35c9d6');
    expect(axisFcCategoryColor('Effect Block')).toBe('#33c46b');
    expect(axisFcCategoryColor('Tap Tempo')).toBe('#c084fc');
    expect(axisFcCategoryColor('Unassigned')).toBeNull();
    expect(axisFcCategoryColor(undefined)).toBeNull();
    expect(axisFcCategoryColor('Mystery')).toBeNull();
  });

  it('labels a side action from the model vocabularies via the edits ordinals', () => {
    const edits = { 'tapCategory:14': 1, 'tapFunction:14': 1, 'holdCategory:14': 0 };
    expect(axisFcActionLabel(liveModel, 'tap', 14, edits)).toBe('Preset · Select');
    expect(axisFcActionLabel(liveModel, 'hold', 14, edits)).toBe('—');
    expect(axisFcActionLabel(liveModel, 'hold', 14, edits, 'Empty')).toBe('Empty');
    expect(axisFcActionLabel(liveModel, 'tap', 14, { 'tapCategory:14': 2 })).toBe('Scene');
  });

  it('builds board tiles with custom labels, LED colors, and on-unit flags', () => {
    const view = createAxisFcDataView({
      model: liveModel,
      layout: 1,
      view: 1,
      switchIndex: 2,
      side: 'tap',
      edits: {
        'tapCategory:12': 1,
        'tapFunction:12': 1,
        'color:12': 2,
        'tapCategory:14': 2,
        'holdCategory:15': 1
      },
      labelText: { 'tapLabel:14': 'Rhythm' },
      present: { 12: true }
    });

    const [first, second, third, fourth] = view.board;
    // configured with explicit color ordinal → the model color wins
    expect(first).toMatchObject({
      config: 12,
      label: 'Preset · Select',
      empty: false,
      onDevice: true,
      ledHex: '#0000ff',
      tapText: 'Preset · Select'
    });
    // untouched switch → empty tile
    expect(second).toMatchObject({ config: 13, label: '—', empty: true, ledHex: null, onDevice: false });
    // custom tap label beats the auto label; LED falls back to the category color
    expect(third).toMatchObject({ config: 14, label: 'Rhythm', active: true, ledHex: '#35c9d6' });
    // hold-only assignment still counts as non-empty
    expect(fourth).toMatchObject({ config: 15, empty: false, holdText: 'Preset' });
  });

  it('clamps slot steppers to the function-slot range and flags the bounds (§3.5)', () => {
    // default range: preset 0–511, everything else 0–127
    expect(axisFcSlotBounds({ i: 0, role: 'Preset', type: 'preset' }, 600)).toMatchObject({
      value: 511,
      lo: 0,
      hi: 511,
      atMin: false,
      atMax: true
    });
    expect(axisFcSlotBounds({ i: 0, role: 'Value', type: 'number' }, 200)).toMatchObject({ value: 127, atMax: true });
    expect(axisFcSlotBounds({ i: 0, role: 'Value', type: 'number' }, -5)).toMatchObject({ value: 0, atMin: true, atMax: false });
    // explicit min/max from the decoded slot def wins
    expect(axisFcSlotBounds({ i: 0, role: 'Low', type: 'number', min: 4, max: 8 }, 3)).toMatchObject({
      value: 4,
      lo: 4,
      hi: 8,
      atMin: true
    });
    expect(axisFcSlotBounds({ i: 0, role: 'Low', type: 'number', min: 4, max: 8 }, 6)).toMatchObject({
      atMin: false,
      atMax: false
    });
    // non-finite input falls back to the low bound instead of NaN
    expect(axisFcSlotBounds({ i: 0, role: 'Value', type: 'number' }, Number.NaN).value).toBe(0);
  });

  it('flags assigned layouts and views from read-back and session edits', () => {
    const view = createAxisFcDataView({
      model: liveModel,
      layout: 1,
      view: 0,
      switchIndex: 0,
      side: 'tap',
      edits: { 'tapCategory:12': 1 },
      present: { 0: true }
    });

    // layout 0 assigned via present[0]; layout 1 assigned via the config-12 edit (view 1 range)
    expect(view.layouts.map((layout) => layout.assigned)).toEqual([true, true, false]);
    // selected layout 1: view 0 spans configs 8..11 (unassigned), view 1 spans 12..15 (assigned)
    expect(view.views.map((item) => item.assigned)).toEqual([false, true]);
  });
});
