import { describe, expect, it } from 'vitest';
import { deriveCabAlignmentGraphs } from './cabAlignmentGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from '$lib/api/types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget = ''): LayoutControl => ({
  label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget
});
const param = (id: number, name: string): NamedParam => ({ id, name, value: 0, norm: 0.5, min: 0, max: 1 });
const zoom: EnumParam = { id: 40, name: 'Zoom', value: 1, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] };

describe('deriveCabAlignmentGraphs', () => {
  it('binds an Align graph to its page-local delays and Zoom control', () => {
    const layout: DeviceLayout = {
      family: 'CABINET',
      pages: [{ name: 'Align', rows: [{ section: 'parameters', controls: [
        control('CABINET_ZOOM', 40, 'toggle'),
        control(null, null, 'graph', 'graph_cabZoom_mm'),
        control('CABINET_DELAY1', 16),
        control('CABINET_DELAY2', 17)
      ] }] }]
    };
    const [graph] = deriveCabAlignmentGraphs({ layout, params: [param(16, 'Delay 1'), param(17, 'Delay 2')], enums: [zoom] });
    expect(graph).toMatchObject({ key: 'cab-align1', page: 0, slot: 0, delay1: { id: 16 }, delay2: { id: 17 }, zoom: { id: 40 } });
  });

  it('returns nothing without a layout', () => {
    expect(deriveCabAlignmentGraphs({ layout: null, params: [], enums: [] })).toEqual([]);
  });

  it('keeps a degenerate graph when delay values are not live', () => {
    const layout: DeviceLayout = { family: 'CABINET', pages: [{ name: 'Align', rows: [{ section: 'parameters', controls: [control('CABINET_DELAY1', 16), control(null, null, 'graph', 'graph_cab_mm')] }] }] };
    expect(deriveCabAlignmentGraphs({ layout, params: [], enums: [] })[0]).toMatchObject({ delay1: undefined, delay2: undefined, zoom: undefined });
  });

  it('binds controls split across page rows', () => {
    const layout: DeviceLayout = { family: 'CABINET', pages: [{ name: 'Align', rows: [
      { section: 'parameters', controls: [control('CABINET_DELAY1', 16), control(null, null, 'graph', 'graph_cab_mm')] },
      { section: 'parameters', controls: [control('CABINET_DELAY2', 17), control('CABINET_ZOOM', 40, 'toggle')] }
    ] }] };
    expect(deriveCabAlignmentGraphs({ layout, params: [param(16, 'One'), param(17, 'Two')], enums: [zoom] })[0]).toMatchObject({ delay1: { id: 16 }, delay2: { id: 17 }, zoom: { id: 40 } });
  });

  it('produces one graph for each authored page', () => {
    const page = (name: string) => ({ name, rows: [{ section: 'parameters' as const, controls: [control(null, null, 'graph', 'graph_cab_mm')] }] });
    expect(deriveCabAlignmentGraphs({ layout: { family: 'CABINET', pages: [page('One'), page('Two')] }, params: [], enums: [] }).map((graph) => [graph.key, graph.page])).toEqual([['cab-align1', 0], ['cab-align2', 1]]);
  });

  // Real-device regression: the cab Align page's current-firmware row carries BOTH `graph_cab_mm` and
  // `graph_cabZoom_mm` at the same positionExact — firmware-gated alternates of ONE graph, not two. Binding
  // both produced two identical "Cab Alignment" cards on the page.
  it('binds only ONE graph per page even when the device authors several graph_cab variants', () => {
    const layout: DeviceLayout = {
      family: 'CABINET',
      pages: [{ name: 'Align', rows: [{ section: 'parameters', controls: [
        control('CABINET_ZOOM', 40, 'toggle'),
        control(null, null, 'graph', 'graph_cab_mm'),
        control(null, null, 'graph', 'graph_cabZoom_mm'),
        control('CABINET_DELAY1', 16),
        control('CABINET_DELAY2', 17)
      ] }] }]
    };
    const graphs = deriveCabAlignmentGraphs({ layout, params: [param(16, 'Delay 1'), param(17, 'Delay 2')], enums: [zoom] });
    expect(graphs).toHaveLength(1);
    expect(graphs[0]).toMatchObject({ key: 'cab-align1', page: 0, slot: 0 });
  });

  it('does not bind the second delay into a missing first delay', () => {
    const layout: DeviceLayout = { family: 'CABINET', pages: [{ name: 'Align', rows: [{ section: 'parameters', controls: [control('CABINET_DELAY1', 16), control('CABINET_DELAY2', 17), control(null, null, 'graph', 'graph_cab_mm')] }] }] };
    expect(deriveCabAlignmentGraphs({ layout, params: [param(17, 'Two')], enums: [] })[0]).toMatchObject({ delay1: undefined, delay2: { id: 17 } });
  });

  it('does not treat unrelated graph widgets as cabinet alignment graphs', () => {
    const layout: DeviceLayout = {
      family: 'CABINET',
      pages: [{ name: 'Align', rows: [{ section: 'parameters', controls: [control(null, null, 'graph', 'graph_adsr')] }] }]
    };
    expect(deriveCabAlignmentGraphs({ layout, params: [], enums: [] })).toEqual([]);
  });
});
