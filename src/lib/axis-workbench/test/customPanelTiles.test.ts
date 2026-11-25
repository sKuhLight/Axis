import { describe, expect, it } from 'vitest';
import type { WidgetInstance } from '../../workbench';
import { customPanelAutoSort, customPanelGrouping, customPanelTileInfo, customPanelTiles } from '../customPanelTiles';

const widget = (id: string, extra: Partial<WidgetInstance> = {}): WidgetInstance => ({
  id,
  type: 'axis.paramControl',
  zone: 'panel:p1',
  order: 0,
  size: 'default',
  binding: {
    kind: 'axis.paramControl',
    version: 1,
    target: { effectId: 100, paramId: 7, block: 'Amp 1', param: 'Gain' }
  },
  state: { block: 'Amp 1', label: 'Gain', color: '#d98a2b' },
  ...extra
});

describe('custom panel tiles', () => {
  it('reads the block (the group) and the label off a pinned parameter', () => {
    expect(customPanelTileInfo(widget('w1'))).toEqual({
      widgetId: 'w1',
      effectId: 100,
      paramId: 7,
      label: 'Gain',
      blockLabel: 'Amp 1',
      blockKey: 'amp 1',
      color: '#d98a2b',
      foreign: false
    });
  });

  it('falls back to the widget state when the binding carries no names', () => {
    const info = customPanelTileInfo(
      widget('w1', {
        binding: { kind: 'axis.paramControl', version: 1, target: { effectId: 3, paramId: 2 } }
      })
    );
    expect(info.blockLabel).toBe('Amp 1');
    expect(info.label).toBe('Gain');
  });

  it('keeps non-parameter widgets in their own group', () => {
    const info = customPanelTileInfo(widget('tuner', { type: 'axis.widget.tuner', binding: undefined, state: { label: 'Tuner' } }));
    expect(info.foreign).toBe(true);
    expect(info.blockKey).toBe('widgets');
    expect(info.label).toBe('Tuner');
  });

  it('reads the grouping / auto-sort options with their defaults', () => {
    expect(customPanelGrouping(undefined)).toBe(true);
    expect(customPanelGrouping({})).toBe(true);
    expect(customPanelGrouping({ groupByBlock: false })).toBe(false);
    expect(customPanelAutoSort(undefined)).toBe(true);
    expect(customPanelAutoSort({ autoSort: false })).toBe(false);
  });

  it('maps a zone list in order', () => {
    expect(customPanelTiles([widget('a'), widget('b')]).map((info) => info.widgetId)).toEqual(['a', 'b']);
  });
});
