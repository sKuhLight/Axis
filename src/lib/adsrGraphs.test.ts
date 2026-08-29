import { describe, expect, it } from 'vitest';
import { deriveAdsrGraphs } from './adsrGraphs';
import type { DeviceLayout, LayoutControl, NamedParam } from './types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget?: string): LayoutControl => ({
  label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget
});
const param = (id: number): NamedParam => ({ id, name: `p${id}`, value: 0, norm: 0.5, min: 0, max: 1 });

describe('deriveAdsrGraphs', () => {
  it('binds ADSR 1 graph controls across its page rows', () => {
    const layout: DeviceLayout = {
      family: 'CONTROLLERS',
      pages: [{ name: 'ADSR 1', rows: [
        { controls: [
          control('CONTROLLERS_ADSR1ATTACK', 14), control('CONTROLLERS_ADSR1DECAY', 15),
          control('CONTROLLERS_ADSR1SUSTAIN', 16), control('CONTROLLERS_ADSR1RELEASE', 18),
          control(null, null, 'graph', 'graph_adsr_marker')
        ] },
        { controls: [control('CONTROLLERS_ADSR1THRESH', 19), control('CONTROLLERS_ADSR1LEVEL', 17)] }
      ] }]
    };
    const [graph] = deriveAdsrGraphs({ layout, params: [14, 15, 16, 17, 18, 19].map(param) });
    expect(graph).toMatchObject({
      key: 'adsr1', page: 0, slot: 0,
      attack: { id: 14 }, decay: { id: 15 }, sustain: { id: 16 }, level: { id: 17 }, release: { id: 18 }, threshold: { id: 19 }
    });
  });

  it('recognizes the legacy ADSR graph widget', () => {
    const layout: DeviceLayout = {
      family: 'CONTROLLERS',
      pages: [{ name: 'ADSR 2', rows: [{ controls: [control('CONTROLLERS_ADSR2ATTACK', 22), control(null, null, 'graph', 'graph_adsr')] }] }]
    };
    expect(deriveAdsrGraphs({ layout, params: [param(22)] })[0]).toMatchObject({ key: 'adsr2', page: 0, slot: 0, attack: { id: 22 } });
  });
});
