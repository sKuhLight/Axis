import { describe, expect, it } from 'vitest';
import { deriveCabAlignmentGraphs } from './cabAlignmentGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget?: string): LayoutControl => ({
  label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget
});
const param = (id: number, name: string): NamedParam => ({ id, name, value: 0, norm: 0.5, min: 0, max: 1 });
const zoom: EnumParam = { id: 40, name: 'Zoom', value: 1, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] };

describe('deriveCabAlignmentGraphs', () => {
  it('binds an Align graph to its page-local delays and Zoom control', () => {
    const layout: DeviceLayout = {
      family: 'CABINET',
      pages: [{ name: 'Align', rows: [{ controls: [
        control('CABINET_ZOOM', 40, 'toggle'),
        control(null, null, 'graph', 'graph_cabZoom_mm'),
        control('CABINET_DELAY1', 16),
        control('CABINET_DELAY2', 17)
      ] }] }]
    };
    const [graph] = deriveCabAlignmentGraphs({ layout, params: [param(16, 'Delay 1'), param(17, 'Delay 2')], enums: [zoom] });
    expect(graph).toMatchObject({ key: 'cab-align1', page: 0, slot: 0, delay1: { id: 16 }, delay2: { id: 17 }, zoom: { id: 40 } });
  });

  it('does not treat unrelated graph widgets as cabinet alignment graphs', () => {
    const layout: DeviceLayout = {
      family: 'CABINET',
      pages: [{ name: 'Align', rows: [{ controls: [control(null, null, 'graph', 'graph_adsr')] }] }]
    };
    expect(deriveCabAlignmentGraphs({ layout, params: [], enums: [] })).toEqual([]);
  });
});
