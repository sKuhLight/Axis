import { describe, expect, it } from 'vitest';
import { compressorDotPosition, deriveCompressorGraphs } from './compressorGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget?: string): LayoutControl => ({
  label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget
});
const param = (id: number, name: string): NamedParam => ({ id, name, value: 0, norm: 0.5, min: 0, max: 10 });
const knee: EnumParam = { id: 5, name: 'Knee Type', value: 1, options: [{ value: 1, label: 'Soft' }] };

describe('deriveCompressorGraphs', () => {
  it('binds the threshold/ratio transfer controls and a Knee on a later row', () => {
    const layout: DeviceLayout = {
      family: 'COMP',
      pages: [{ name: 'Basic', rows: [
        { controls: [control('COMP_THRESH', 0), control('COMP_RATIO', 1), control(null, null, 'graph', 'graph_comp_studio')] },
        { controls: [control('COMP_KNEE', 5, 'dropdown'), control('COMP_ATTACK', 2), control('COMP_RELEASE', 3)] }
      ] }]
    };
    const [graph] = deriveCompressorGraphs({ layout, params: [0, 1, 2, 3].map((id) => param(id, `p${id}`)), enums: [knee] });
    expect(graph).toMatchObject({ key: 'comp1', page: 0, slot: 0, threshold: { id: 0 }, ratio: { id: 1 }, knee: { id: 5 }, attack: { id: 2 }, release: { id: 3 } });
  });

  it('keeps Sustain-style compressor slots without inventing a ratio', () => {
    const layout: DeviceLayout = {
      family: 'COMP',
      pages: [{ name: 'Basic', rows: [{ controls: [control('COMP_SUSTAIN', 13), control(null, null, 'graph', 'graph_comp_studio')] }] }]
    };
    const [graph] = deriveCompressorGraphs({ layout, params: [param(13, 'Compression')], enums: [] });
    expect(graph).toMatchObject({ sustain: { id: 13 } });
    expect(graph.ratio).toBeUndefined();
  });
});

describe('compressorDotPosition', () => {
  it('inverts the transfer curve to the point producing the given gain reduction', () => {
    const pos = compressorDotPosition(-10, 4, 6);
    expect(pos).not.toBeNull();
    expect(pos!.input).toBeCloseTo(-2);
    expect(pos!.output).toBeCloseTo(-8);
    expect(pos!.input - pos!.output).toBeCloseTo(6); // reproduces the gain reduction it was given
  });

  it('returns null for a sustain-style compressor (ratio <= 1)', () => {
    expect(compressorDotPosition(-10, 1, 6)).toBeNull();
  });

  it('returns null when there is no reduction to place (idle, or a makeup-gain-flavored reading)', () => {
    expect(compressorDotPosition(-10, 4, 0)).toBeNull();
    expect(compressorDotPosition(-10, 4, -3)).toBeNull();
    // real hardware's idle GR noise floor (never bit-exact 0) shouldn't resolve to a point either
    expect(compressorDotPosition(-10, 4, 0.04)).toBeNull();
  });
});
