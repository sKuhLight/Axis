import { describe, expect, it } from 'vitest';
import { deriveAdsrGraphs } from './adsrGraphs';
import type { DeviceLayout, LayoutControl, NamedParam } from '$lib/api/types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget = ''): LayoutControl => ({
  label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget
});
const param = (id: number): NamedParam => ({ id, name: `p${id}`, value: 0, norm: 0.5, min: 0, max: 1 });

describe('deriveAdsrGraphs', () => {
  it('binds ADSR 1 graph controls across its page rows', () => {
    const layout: DeviceLayout = {
      family: 'CONTROLLERS',
      pages: [{ name: 'ADSR 1', rows: [
        { section: 'parameters', controls: [
          control('CONTROLLERS_ADSR1ATTACK', 14), control('CONTROLLERS_ADSR1DECAY', 15),
          control('CONTROLLERS_ADSR1SUSTAIN', 16), control('CONTROLLERS_ADSR1RELEASE', 18),
          control(null, null, 'graph', 'graph_adsr_marker')
        ] },
        { section: 'parameters', controls: [control('CONTROLLERS_ADSR1THRESH', 19), control('CONTROLLERS_ADSR1LEVEL', 17)] }
      ] }]
    };
    const [graph] = deriveAdsrGraphs({ layout, params: [14, 15, 16, 17, 18, 19].map(param) });
    expect(graph).toMatchObject({
      key: 'adsr1', page: 0, slot: 0,
      attack: { id: 14 }, decay: { id: 15 }, sustain: { id: 16 }, level: { id: 17 }, release: { id: 18 }, threshold: { id: 19 }
    });
  });

  it('returns nothing without a layout', () => {
    expect(deriveAdsrGraphs({ layout: null, params: [] })).toEqual([]);
  });

  it('ignores pages without numbered ADSR controls', () => {
    const layout: DeviceLayout = { family: 'CONTROLLERS', pages: [{ name: 'Other', rows: [{ section: 'parameters', controls: [control(null, null, 'graph', 'graph_adsr')] }] }] };
    expect(deriveAdsrGraphs({ layout, params: [] })).toEqual([]);
  });

  it('ignores unrelated graph widgets', () => {
    const layout: DeviceLayout = { family: 'CONTROLLERS', pages: [{ name: 'ADSR', rows: [{ section: 'parameters', controls: [control('CONTROLLERS_ADSR1ATTACK', 1), control(null, null, 'graph', 'graph_lfo')] }] }] };
    expect(deriveAdsrGraphs({ layout, params: [param(1)] })).toEqual([]);
  });

  it('leaves controls absent when their values are not live', () => {
    const layout: DeviceLayout = { family: 'CONTROLLERS', pages: [{ name: 'ADSR', rows: [{ section: 'parameters', controls: [control('CONTROLLERS_ADSR1ATTACK', 1), control('CONTROLLERS_ADSR1DECAY', 2), control(null, null, 'graph', 'graph_adsr')] }] }] };
    expect(deriveAdsrGraphs({ layout, params: [param(1)] })[0]).toMatchObject({ attack: { id: 1 }, decay: undefined });
  });

  it('preserves page indices across multiple ADSR pages', () => {
    const page = (number: number) => ({ name: `ADSR ${number}`, rows: [{ section: 'parameters' as const, controls: [control(`CONTROLLERS_ADSR${number}ATTACK`, number), control(null, null, 'graph', 'graph_adsr')] }] });
    expect(deriveAdsrGraphs({ layout: { family: 'CONTROLLERS', pages: [page(1), page(2)] }, params: [param(1), param(2)] }).map((graph) => [graph.key, graph.page, graph.title])).toEqual([['adsr1', 0, 'ADSR 1'], ['adsr2', 1, 'ADSR 2']]);
  });

  it('binds a graph whose controls are split across rows', () => {
    const layout: DeviceLayout = { family: 'CONTROLLERS', pages: [{ name: 'ADSR', rows: [
      { section: 'parameters', controls: [control('CONTROLLERS_ADSR1ATTACK', 1)] },
      { section: 'parameters', controls: [control('CONTROLLERS_ADSR1RELEASE', 2), control(null, null, 'graph', 'graph_adsr')] }
    ] }] };
    expect(deriveAdsrGraphs({ layout, params: [param(1), param(2)] })[0]).toMatchObject({ attack: { id: 1 }, release: { id: 2 } });
  });

  it('recognizes the legacy ADSR graph widget', () => {
    const layout: DeviceLayout = {
      family: 'CONTROLLERS',
      pages: [{ name: 'ADSR 2', rows: [{ section: 'parameters', controls: [control('CONTROLLERS_ADSR2ATTACK', 22), control(null, null, 'graph', 'graph_adsr')] }] }]
    };
    expect(deriveAdsrGraphs({ layout, params: [param(22)] })[0]).toMatchObject({ key: 'adsr2', page: 0, slot: 0, attack: { id: 22 } });
  });
});
