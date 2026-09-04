import { describe, expect, it } from 'vitest';
import { deriveMegaTapGraphs } from './megaTapGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget = ''): LayoutControl => ({ label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget });
const param = (id: number): NamedParam => ({ id, name: `p${id}`, value: 0, norm: 0.5, min: 0, max: 100 });
const shape: EnumParam = { id: 5, name: 'Shape', value: 1, options: [{ value: 1, label: 'Linear' }] };

describe('deriveMegaTapGraphs', () => {
  it('binds the Tap Control graph to its page-local tap pattern controls', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap Control', rows: [{ section: 'parameters', controls: [
      control(null, null, 'graph', 'graph_megatap'), control('MEGATAP_NUMTAPS', 3), control('MEGATAP_PREDELAY', 4),
      control('MEGATAP_TIMESHAPE', 5, 'dropdown'), control('MEGATAP_TIMEALPHA', 6), control('MEGATAP_AMPSHAPE', 7, 'dropdown'), control('MEGATAP_AMPALPHA', 8)
    ] }] }] };
    const [graph] = deriveMegaTapGraphs({ layout, params: [3, 4, 6, 8].map(param), enums: [shape, { ...shape, id: 7 }] });
    expect(graph).toMatchObject({ key: 'megatap1', page: 0, slot: 0, taps: { id: 3 }, predelay: { id: 4 }, timeAlpha: { id: 6 }, ampAlpha: { id: 8 }, timeShape: { id: 5 }, ampShape: { id: 7 } });
  });
});
