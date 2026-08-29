import { describe, expect, it } from 'vitest';
import { deriveModulationGraphs } from './modulationGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget?: string): LayoutControl => ({
  label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget
});
const param = (id: number, name: string): NamedParam => ({ id, name, value: 0, norm: 0.5, min: 0, max: 10 });
const type: EnumParam = { id: 1, name: 'Type', value: 0, options: [{ value: 0, label: 'Sine' }] };

describe('deriveModulationGraphs', () => {
  it('keeps two LFO graph slots on one Controllers page distinct', () => {
    const layout: DeviceLayout = {
      family: 'CONTROLLERS',
      pages: [{
        name: 'LFO 1 + 2',
        rows: [
          { controls: [control('CONTROLLERS_LFO1TYPE', 1, 'dropdown'), control('CONTROLLERS_LFO1FREQ', 2), control(null, null, 'graph', 'graph_lfo')] },
          { controls: [control('CONTROLLERS_LFO2TYPE', 3, 'dropdown'), control('CONTROLLERS_LFO2FREQ', 4), control(null, null, 'graph', 'graph_lfo')] }
        ]
      }]
    };
    const graphs = deriveModulationGraphs({ layout, params: [param(2, 'Rate 1'), param(4, 'Rate 2')], enums: [type, { ...type, id: 3 }] });

    expect(graphs.map((graph) => [graph.key, graph.slot, graph.title, graph.type?.id, graph.rate?.id])).toEqual([
      ['mod1', 0, 'LFO 1', 1, 2],
      ['mod2', 1, 'LFO 2', 3, 4]
    ]);
  });

  it('binds Tremolo waveform controls from their authored row', () => {
    const layout: DeviceLayout = {
      family: 'TREMOLO',
      pages: [{
        name: 'Tremolo',
        rows: [{ controls: [
          control('TREMOLO_LFOTYPE', 1, 'dropdown'), control('TREMOLO_RATE', 2), control('TREMOLO_DEPTH', 3),
          control('TREMOLO_DUTY', 4), control('TREMOLO_BETA', 5), control('TREMOLO_PHASE', 6),
          control(null, null, 'graph', 'graph_trem')
        ] }]
      }]
    };
    const graphs = deriveModulationGraphs({ layout, params: [2, 3, 4, 5, 6].map((id) => param(id, `p${id}`)), enums: [type] });
    expect(graphs[0]).toMatchObject({ title: 'Tremolo', rate: { id: 2 }, depth: { id: 3 }, duty: { id: 4 }, shape: { id: 5 }, phase: { id: 6 } });
  });
});
