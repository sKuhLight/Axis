import { describe, expect, it } from 'vitest';
import { deriveMegaTapGraphs } from './megaTapGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from '$lib/api/types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget = ''): LayoutControl => ({ label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget });
const param = (id: number, paramName?: string): NamedParam => ({ id, name: `p${id}`, value: 0, norm: 0.5, min: 0, max: 100, paramName });
const shape: EnumParam = { id: 5, name: 'Shape', value: 1, options: [{ value: 1, label: 'Linear' }] };

describe('deriveMegaTapGraphs', () => {
  it('binds the Tap Control graph to its page-local tap pattern controls', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap Control', rows: [{ section: 'parameters', controls: [
      control(null, null, 'graph', 'graph_megatap'), control('MEGATAP_NUMTAPS', 3), control('MEGATAP_PREDELAY', 4),
      control('MEGATAP_TIMESHAPE', 5, 'dropdown'), control('MEGATAP_TIMEALPHA', 6), control('MEGATAP_AMPSHAPE', 7, 'dropdown'), control('MEGATAP_AMPALPHA', 8)
    ] }] }] };
    const [graph] = deriveMegaTapGraphs({ layout, params: [3, 4, 6, 8].map((id) => param(id)), enums: [shape, { ...shape, id: 7 }] });
    expect(graph).toMatchObject({ key: 'megatap1', page: 0, slot: 0, taps: { id: 3 }, predelay: { id: 4 }, timeAlpha: { id: 6 }, ampAlpha: { id: 8 }, timeShape: { id: 5 }, ampShape: { id: 7 } });
  });

  it('returns nothing without a layout', () => {
    expect(deriveMegaTapGraphs({ layout: null, params: [], enums: [] })).toEqual([]);
  });

  it('ignores unrelated graph widgets', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap', rows: [{ section: 'parameters', controls: [control(null, null, 'graph', 'graph_lfo')] }] }] };
    expect(deriveMegaTapGraphs({ layout, params: [], enums: [] })).toEqual([]);
  });

  it('keeps optional bindings absent when controls are not live', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap', rows: [{ section: 'parameters', controls: [control(null, null, 'graph', 'graph_megatap')] }] }] };
    expect(deriveMegaTapGraphs({ layout, params: [], enums: [] })[0]).toMatchObject({ taps: undefined, time: undefined, ampShape: undefined });
  });

  it('binds Number of Taps when the device serves it as an enum', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap', rows: [{ section: 'parameters', controls: [control(null, null, 'graph', 'graph_megatap'), control('MEGATAP_NUMTAPS', 3, 'dropdown')] }] }] };
    expect(deriveMegaTapGraphs({ layout, params: [], enums: [{ ...shape, id: 3 }] })[0].tapsEnum?.id).toBe(3);
  });

  it('produces stable keys for multiple authored graphs', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap', rows: [{ section: 'parameters', controls: [control(null, null, 'graph', 'graph_megatap'), control(null, null, 'graph', 'graph_megatap')] }] }] };
    expect(deriveMegaTapGraphs({ layout, params: [], enums: [] }).map((graph) => graph.key)).toEqual(['megatap1', 'megatap2']);
  });

  it('prefers the page-local device id over a symbol fallback', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap', rows: [{ section: 'parameters', controls: [control(null, null, 'graph', 'graph_megatap'), control('MEGATAP_TIME', 2)] }] }] };
    expect(deriveMegaTapGraphs({ layout, params: [param(2), param(20, 'MEGATAP_TIME')], enums: [] })[0].time?.id).toBe(2);
  });

  it('falls back to the block parameter list for Delay Time, which the Tap Control page does not author', () => {
    const layout: DeviceLayout = { family: 'MEGATAP', pages: [{ name: 'Tap Control', rows: [{ section: 'parameters', controls: [
      control(null, null, 'graph', 'graph_megatap'), control('MEGATAP_NUMTAPS', 3)
    ] }] }] };
    const [graph] = deriveMegaTapGraphs({
      layout,
      params: [param(3), param(2, 'MEGATAP_TIME'), param(30, 'MEGATAP_AMPRAND')],
      enums: [{ ...shape, id: 9, paramName: 'MEGATAP_PANSHAPE' }]
    });
    expect(graph).toMatchObject({ time: { id: 2 }, ampRandom: { id: 30 }, panShape: { id: 9 } });
  });
});
