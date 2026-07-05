import { describe, expect, it } from 'vitest';
import { axisFcLayoutLabel, createAxisFcDataView, type AxisFcModelLike } from '../fc/fcWorkbenchData';

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
  });
});
