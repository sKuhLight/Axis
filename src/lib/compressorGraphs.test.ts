import { describe, expect, it } from 'vitest';
import { compressorDotPosition, deriveCompressorGraphs, sustainCurveY, sustainDotPosition, sustainTransfer } from './compressorGraphs';
import type { BlockParams, DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';
import compFixture from './fixtures/blockParams/comp.json';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget = '', render?: LayoutControl['render']): LayoutControl => ({
  label: paramName ?? 'Graph', paramName, paramId, widget, rawWidget, ...(render ? { render } : {})
});
const param = (id: number, name: string): NamedParam => ({ id, name, value: 0, norm: 0.5, min: 0, max: 10 });
const knee: EnumParam = { id: 5, name: 'Knee Type', value: 1, options: [{ value: 1, label: 'Soft' }] };

describe('deriveCompressorGraphs', () => {
  it('binds the threshold/ratio transfer controls and a Knee on a later row', () => {
    const layout: DeviceLayout = {
      family: 'COMP',
      pages: [{ name: 'Basic', rows: [
        { section: 'parameters', controls: [control('COMP_THRESH', 0), control('COMP_RATIO', 1), control(null, null, 'graph', 'graph_comp_studio')] },
        { section: 'parameters', controls: [control('COMP_KNEE', 5, 'dropdown'), control('COMP_ATTACK', 2), control('COMP_RELEASE', 3)] }
      ] }]
    };
    const [graph] = deriveCompressorGraphs({ layout, params: [0, 1, 2, 3].map((id) => param(id, `p${id}`)), enums: [knee] });
    expect(graph).toMatchObject({ key: 'comp1', page: 0, slot: 0, threshold: { id: 0 }, ratio: { id: 1 }, knee: { id: 5 }, attack: { id: 2 }, release: { id: 3 } });
  });

  it('keeps Sustain-style compressor slots without inventing a ratio', () => {
    const layout: DeviceLayout = {
      family: 'COMP',
      pages: [{ name: 'Basic', rows: [{ section: 'parameters', controls: [control('COMP_SUSTAIN', 13), control(null, null, 'graph', 'graph_comp_studio')] }] }]
    };
    const [graph] = deriveCompressorGraphs({ layout, params: [param(13, 'Compression')], enums: [] });
    expect(graph).toMatchObject({ sustain: { id: 13 } });
    expect(graph.ratio).toBeUndefined();
  });

  it('takes its slot from the device-authored graphIndex, not the layout ordinal', () => {
    // The FM3 authors the compressor's transfer curve as graphIndex '1' (its Sidechain EQ is '0'), so a
    // Basic page holding only the transfer graph still binds at slot 1 — ordinal counting would say 0.
    const layout: DeviceLayout = {
      family: 'COMP',
      pages: [{ name: 'Basic', rows: [{ section: 'parameters', controls: [
        control('COMP_THRESH', 0), control('COMP_RATIO', 1),
        control(null, null, 'graph', 'graph_comp_studio', { graphIndex: '1', graphMarkerX: 'COMP_XMARK' })
      ] }] }]
    };
    const [graph] = deriveCompressorGraphs({ layout, params: [0, 1].map((id) => param(id, `p${id}`)), enums: [] });
    expect(graph.slot).toBe(1);
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

// Points digitised from FM3-Edit's own compressor graph (Econo-Dyno-Comp / Pedal1), one capture per
// Compression setting, in normalised graph space. Captures and the digitiser live in
// `docs/handoff/compressor-graph/`. The box is 344 px tall, so 0.0029 here is one pixel on screen —
// these assert the drawn curve still matches the editor, which is the whole point of the fitted model.
const EDITOR_CURVE: [number, [number, number][]][] = [
  [0, [[0.1003, 0.1003], [0.2006, 0.202], [0.3009, 0.3009], [0.4012, 0.4012], [0.4985, 0.5], [0.5988, 0.6003], [0.6991, 0.6977], [0.7994, 0.7892], [0.8997, 0.8619]]],
  [2, [[0.1003, 0.2253], [0.2006, 0.3241], [0.3009, 0.4172], [0.4012, 0.5015], [0.4985, 0.5625], [0.5988, 0.5974], [0.6991, 0.6119], [0.7994, 0.6177], [0.8997, 0.6177]]],
  [4, [[0.1003, 0.2718], [0.2006, 0.3692], [0.3009, 0.4578], [0.4012, 0.532], [0.4985, 0.577], [0.5988, 0.5974], [0.6991, 0.6061], [0.7994, 0.609], [0.8997, 0.609]]],
  [6, [[0.1003, 0.3023], [0.2006, 0.3968], [0.3009, 0.4826], [0.4012, 0.5465], [0.4985, 0.5828], [0.5988, 0.5974], [0.6991, 0.6032], [0.7994, 0.6061], [0.8997, 0.6061]]],
  [8, [[0.1003, 0.3241], [0.2006, 0.4172], [0.3009, 0.4985], [0.4012, 0.5552], [0.4985, 0.5858], [0.5988, 0.5974], [0.6991, 0.6032], [0.7994, 0.6032], [0.8997, 0.6032]]],
  [10, [[0.1003, 0.3416], [0.2006, 0.4331], [0.3009, 0.5102], [0.4012, 0.561], [0.4985, 0.5887], [0.5988, 0.5974], [0.6991, 0.6003], [0.7994, 0.6032], [0.8997, 0.6032]]]
];
const PX = 1 / 344; // one pixel of the captured graph box

describe('sustain-style transfer curve', () => {
  it('reproduces the FM3 editor curve at every captured Compression setting', () => {
    for (const [compression, points] of EDITOR_CURVE) {
      const transfer = sustainTransfer(compression);
      for (const [x, y] of points) {
        expect(Math.abs(sustainCurveY(x, transfer) - y)).toBeLessThan(2.5 * PX);
      }
    }
  });

  it('is the identity line at Compression 0 — the anchor that says both axes span the same range', () => {
    const transfer = sustainTransfer(0);
    for (const x of [0.1, 0.3, 0.5]) expect(sustainCurveY(x, transfer)).toBeCloseTo(x, 2);
  });

  it('raises the low-level end and holds the ceiling as Compression rises', () => {
    const quiet = (c: number) => sustainCurveY(0.1, sustainTransfer(c));
    const loud = (c: number) => sustainCurveY(0.95, sustainTransfer(c));
    expect(quiet(10)).toBeGreaterThan(quiet(5));
    expect(quiet(5)).toBeGreaterThan(quiet(0));
    // the ceiling is what stops the curve; past Compression 2 it barely moves
    expect(Math.abs(loud(10) - loud(4))).toBeLessThan(0.01);
  });

  it('never lets the curve fall as the input rises', () => {
    for (const c of [0, 1, 5, 10]) {
      const transfer = sustainTransfer(c);
      let prev = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const y = sustainCurveY(i / 100, transfer);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = y;
      }
    }
  });

  it('clamps Compression to the knob\'s served 0..10 range', () => {
    expect(sustainTransfer(-5)).toEqual(sustainTransfer(0));
    expect(sustainTransfer(99)).toEqual(sustainTransfer(10));
  });
});

describe('sustainDotPosition', () => {
  it('inverts the curve so the dot rides it exactly', () => {
    const transfer = sustainTransfer(6);
    const gr = 0.05;
    const pos = sustainDotPosition(transfer, gr);
    expect(pos).not.toBeNull();
    // the point it resolves is on the curve, and it reproduces the reduction it was given
    expect(sustainCurveY(pos!.input, transfer)).toBeCloseTo(pos!.output, 6);
    expect(pos!.input + transfer.gain - pos!.output).toBeCloseTo(gr, 6);
  });

  it('has nothing to place when there is no reduction', () => {
    expect(sustainDotPosition(sustainTransfer(6), 0)).toBeNull();
    expect(sustainDotPosition(sustainTransfer(6), -0.2)).toBeNull();
  });
});

// A REAL served response, captured from a live FM3 (preset 348, Comp 1) — the exact case that used to
// render "transfer curve unavailable". See fixtures/blockParams/README.md for provenance.
describe('a live sustain-style compressor (fixtures/blockParams/comp.json)', () => {
  const dto = compFixture as unknown as BlockParams;
  const graphs = deriveCompressorGraphs({ layout: dto.layout, params: dto.named, enums: dto.enums });

  it('binds the Compression knob and finds no Threshold/Ratio on the page', () => {
    expect(dto.type).toMatchObject({ name: 'Econo-Dyno-Comp' });
    expect(dto.layout?.variantName).toBe('Pedal1');
    expect(graphs).toHaveLength(1);
    expect(graphs[0].sustain?.paramName).toBe('COMP_SUSTAIN');
    expect(graphs[0].threshold).toBeUndefined();
    expect(graphs[0].ratio).toBeUndefined();
  });

  it("takes the device's own graphIndex for its slot", () => {
    // The Basic page holds ONE graph, but the device calls it graph 1 (the Sidechain EQ is graph 0).
    expect(graphs[0]).toMatchObject({ page: 0, slot: 1 });
  });

  it('produces a drawable, rising, ceilinged curve for the live Compression value', () => {
    const compression = graphs[0].sustain!.value;
    expect(compression).toBeGreaterThan(0);
    const transfer = sustainTransfer(compression);
    const ys = Array.from({ length: 21 }, (_, i) => sustainCurveY(i / 20, transfer));
    expect(ys.every((y) => Number.isFinite(y))).toBe(true);
    expect(ys[20]).toBeGreaterThan(ys[0]); // it rises
    expect(ys[20] - ys[19]).toBeLessThan(0.01); // and flattens onto its ceiling
  });
});
