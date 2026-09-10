import { describe, expect, it } from 'vitest';
import { deriveModulationGraphs, modulationRate, modulationValue } from './modulationGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';

const control = (paramName: string | null, paramId: number | null, widget: LayoutControl['widget'] = 'knob', rawWidget = ''): LayoutControl => ({
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
          { section: 'parameters', controls: [control('CONTROLLERS_LFO1TYPE', 1, 'dropdown'), control('CONTROLLERS_LFO1FREQ', 2), control(null, null, 'graph', 'graph_lfo')] },
          { section: 'parameters', controls: [control('CONTROLLERS_LFO2TYPE', 3, 'dropdown'), control('CONTROLLERS_LFO2FREQ', 4), control(null, null, 'graph', 'graph_lfo')] }
        ]
      }]
    };
    const graphs = deriveModulationGraphs({ layout, params: [param(2, 'Rate 1'), param(4, 'Rate 2')], enums: [type, { ...type, id: 3 }] });

    expect(graphs.map((graph) => [graph.key, graph.slot, graph.title, graph.type?.id, graph.rate?.id])).toEqual([
      ['mod1', 0, 'LFO 1', 1, 2],
      ['mod2', 1, 'LFO 2', 3, 4]
    ]);
  });

  it('gives Controllers LFO graphs a time window and leaves block graphs on one cycle', () => {
    const controllers: DeviceLayout = {
      family: 'CONTROLLERS',
      pages: [{
        name: 'LFO 1 + 2',
        rows: [{ section: 'parameters', controls: [control('CONTROLLERS_LFO1TYPE', 1, 'dropdown'), control(null, null, 'graph', 'graph_lfo')] }]
      }]
    };
    const tremolo: DeviceLayout = {
      family: 'TREMOLO',
      pages: [{
        name: 'Tremolo',
        rows: [{ section: 'parameters', controls: [control('TREMOLO_LFOTYPE', 1, 'dropdown'), control(null, null, 'graph', 'graph_trem')] }]
      }]
    };
    expect(deriveModulationGraphs({ layout: controllers, params: [], enums: [type] })[0]).toMatchObject({ windowSeconds: 2, randomSteps: 1, live: true });
    // The Tremolo box is a static shape preview in the FM3 editor, not a running scope.
    expect(deriveModulationGraphs({ layout: tremolo, params: [], enums: [type] })[0]).toMatchObject({ windowSeconds: undefined, randomSteps: undefined, live: false });
  });

  it('binds Tremolo waveform controls from their authored row', () => {
    const layout: DeviceLayout = {
      family: 'TREMOLO',
      pages: [{
        name: 'Tremolo',
        rows: [{ section: 'parameters', controls: [
          control('TREMOLO_LFOTYPE', 1, 'dropdown'), control('TREMOLO_RATE', 2), control('TREMOLO_DEPTH', 3),
          control('TREMOLO_DUTY', 4), control('TREMOLO_BETA', 5), control('TREMOLO_PHASE', 6),
          control(null, null, 'graph', 'graph_trem')
        ] }]
      }]
    };
    const graphs = deriveModulationGraphs({ layout, params: [2, 3, 4, 5, 6].map((id) => param(id, `p${id}`)), enums: [type] });
    expect(graphs[0]).toMatchObject({ title: 'Tremolo', rate: { id: 2 }, depth: { id: 3 }, duty: { id: 4 }, shape: { id: 5 }, phase: { id: 6 } });
  });

  it('binds Tremolo controls split below the graph row', () => {
    const layout: DeviceLayout = {
      family: 'TREMOLO',
      pages: [{
        name: 'Tremolo',
        rows: [
          { section: 'parameters', controls: [control('TREMOLO_LFOTYPE', 1, 'dropdown'), control('TREMOLO_DUTY', 4), control('TREMOLO_BETA', 5), control(null, null, 'graph', 'graph_trem')] },
          { section: 'parameters', controls: [control('TREMOLO_DEPTH', 3), control('TREMOLO_PHASE', 6)] }
        ]
      }]
    };

    const [graph] = deriveModulationGraphs({ layout, params: [param(3, 'Depth'), param(4, 'Duty'), param(5, 'Shape'), param(6, 'Phase')], enums: [type] });

    expect(graph).toMatchObject({ depth: { id: 3 }, duty: { id: 4 }, shape: { id: 5 }, phase: { id: 6 } });
  });

  it('binds a flanger graph to controls split across its page', () => {
    const layout: DeviceLayout = {
      family: 'FLANGER',
      pages: [{
        name: 'Expert 1',
        rows: [
          { section: 'parameters', controls: [control('FLANGER_RATE', 1), control('FLANGER_DEPTH', 2)] },
          { section: 'parameters', controls: [control('FLANGER_LFOTYPE', 3, 'dropdown'), control('FLANGER_LFOPHASE', 4), control(null, null, 'graph', 'graph_lfo')] }
        ]
      }]
    };
    const graphs = deriveModulationGraphs({ layout, params: [param(1, 'Rate'), param(2, 'Depth'), param(4, 'Phase')], enums: [{ ...type, id: 3 }] });

    expect(graphs[0]).toMatchObject({ type: { id: 3 }, typeLabel: 'Sine', rate: { id: 1 }, depth: { id: 2 }, phase: { id: 4 } });
  });

  it('binds by symbol when current and legacy flanger enums share a wire id', () => {
    const layout: DeviceLayout = {
      family: 'FLANGER',
      pages: [{
        name: 'Expert 1',
        rows: [{ section: 'parameters', controls: [
          control('FLANGER_LFOTYPE', 8, 'dropdown'),
          control(null, null, 'graph', 'graph_lfo')
        ] }]
      }]
    };
    const current = { ...type, id: 8, paramName: 'FLANGER_LFOTYPE' };
    const legacy = { ...type, id: 8, paramName: 'OLD_FLANGER_LFOTYPE' };

    const [graph] = deriveModulationGraphs({ layout, params: [], enums: [current, legacy] });

    expect(graph.type).toBe(current);
  });

  it('binds a phaser graph to controls split across its page', () => {
    const layout: DeviceLayout = {
      family: 'PHASER',
      pages: [{
        name: 'Basic',
        rows: [
          { section: 'parameters', controls: [control('PHASER_RATE', 1), control('PHASER_DEPTH', 2), control(null, null, 'graph', 'graph_lfo')] },
          { section: 'parameters', controls: [control('PHASER_LFOPHASE', 4)] }
        ]
      }]
    };
    const graphs = deriveModulationGraphs({ layout, params: [param(1, 'Rate'), param(2, 'Depth'), param(4, 'Phase')], enums: [{ ...type, id: 3, paramName: 'PHASER_LFOTYPE', options: [{ value: 0, label: 'Astable' }] }] });

    expect(graphs[0]).toMatchObject({ type: { id: 3 }, typeLabel: 'Astable', rate: { id: 1 }, depth: { id: 2 }, phase: { id: 4 } });
  });

  it('binds Controllers run, tempo, high-cut, and quantize to the correct LFO row', () => {
    const layout: DeviceLayout = {
      family: 'CONTROLLERS',
      pages: [{
        name: 'LFO 1 + 2',
        rows: [
          { section: 'parameters', controls: [control('CONTROLLERS_LFO1TYPE', 1, 'dropdown'), control('CONTROLLERS_LFO1RUN', 2, 'dropdown'), control(null, null, 'graph', 'graph_lfo'), control('CONTROLLERS_LFO1TEMPO', 3, 'dropdown'), control('CONTROLLERS_LFO1HICUT', 4), control('CONTROLLERS_LFO1QUANTIZE', 5, 'dropdown')] },
          { section: 'parameters', controls: [control('CONTROLLERS_LFO2TYPE', 6, 'dropdown'), control('CONTROLLERS_LFO2RUN', 7, 'dropdown'), control(null, null, 'graph', 'graph_lfo'), control('CONTROLLERS_LFO2TEMPO', 8, 'dropdown'), control('CONTROLLERS_LFO2HICUT', 9), control('CONTROLLERS_LFO2QUANTIZE', 10, 'dropdown')] }
        ]
      }]
    };
    const enums = [1, 2, 3, 5, 6, 7, 8, 10].map((id) => ({ ...type, id }));
    const graphs = deriveModulationGraphs({ layout, params: [param(4, 'High Cut 1'), param(9, 'High Cut 2')], enums });

    expect(graphs[0]).toMatchObject({ type: { id: 1 }, run: { id: 2 }, tempo: { id: 3 }, highCut: { id: 4 }, quantize: { id: 5 } });
    expect(graphs[1]).toMatchObject({ type: { id: 6 }, run: { id: 7 }, tempo: { id: 8 }, highCut: { id: 9 }, quantize: { id: 10 } });
  });
});

describe('modulationValue', () => {
  it('renders every FM3 LFO type with its defining shape', () => {
    expect(modulationValue('SINE', 0.5)).toBeCloseTo(1);
    expect(modulationValue('TRIANGLE', 0)).toBeCloseTo(-1);
    expect(modulationValue('TRIANGLE', 0.5)).toBeCloseTo(1);
    expect(modulationValue('SQUARE', 0.25)).toBe(1);
    expect(modulationValue('SQUARE', 0.75)).toBe(-1);
    expect(modulationValue('SAW UP', 0)).toBeCloseTo(-1);
    expect(modulationValue('SAW UP', 1)).toBeCloseTo(-1);
    expect(modulationValue('SAW DOWN', 0)).toBeCloseTo(1);
    expect(modulationValue('LOG', 0)).toBeCloseTo(-1);
    expect(modulationValue('LOG', 0.5)).toBeCloseTo(1);
    expect(modulationValue('EXP', 0)).toBeCloseTo(-1);
    expect(modulationValue('EXP', 0.5)).toBeCloseTo(1);
    expect(modulationValue('TRAPEZOID', 0)).toBe(-1);
    expect(modulationValue('TRAPEZOID', 0.5)).toBe(1);
    expect(modulationValue('RANDOM', 0.1)).toBe(modulationValue('RANDOM', 0.49));
    expect(modulationValue('RANDOM', 0.51)).toBe(modulationValue('RANDOM', 0.99));
    expect(modulationValue('RANDOM', 0.49)).not.toBe(modulationValue('RANDOM', 0.51));
  });

  it('curves Saw by Shape, mirroring the two directions in time', () => {
    // Sampled FM3 output: neither direction is a straight line, and both are still monotonic.
    expect(modulationValue('SAW DOWN', 0.25)).toBeGreaterThan(modulationValue('SAW DOWN', 0.75));
    expect(modulationValue('SAW UP', 0.25)).toBeLessThan(modulationValue('SAW UP', 0.75));

    // A straight saw sits at zero halfway through. Saw Down holds above zero past the midpoint;
    // Saw Up has already climbed past it — the two are time-mirrors, not negations.
    expect(modulationValue('SAW DOWN', 0.5)).toBeGreaterThan(0);
    expect(modulationValue('SAW UP', 0.5)).toBeGreaterThan(0);

    // Curvature tracks Shape (the triangle's fall/rise ratio), so a lower Shape bends it harder.
    const mid = modulationValue('SAW DOWN', 0.5, { shape: 0.5 });
    const skewed = modulationValue('SAW DOWN', 0.5, { shape: 0.242 });
    expect(skewed).toBeGreaterThan(mid);
  });

  it('starts Sine at the trough and skews it by Shape, like the hardware', () => {
    // Measured on a live FM3 by stopping LFO 1 and restarting it: at LFO Phase 0 the output leaves the
    // trough, and at Shape 0.242 it crests 0.30 of the way through the cycle — the same fraction the
    // triangle takes. Folded captures in docs/handoff/modulation-graph-shapes.
    expect(modulationValue('SINE', 0, { shape: 0.5 })).toBeCloseTo(-1);
    expect(modulationValue('SINE', 0.5, { shape: 0.5 })).toBeCloseTo(1);
    expect(modulationValue('SINE', 0.25, { shape: 0.5 })).toBeCloseTo(0);

    const shape = 0.242;
    expect(modulationValue('SINE', shape, { shape })).toBeCloseTo(1);
    expect(modulationValue('SINE', 0, { shape })).toBeCloseTo(-1);
    // The rise is over well before the halfway point, where an unskewed sine would still be climbing.
    expect(modulationValue('SINE', 0.5, { shape })).toBeLessThan(0.5);
  });

  it('mirrors Exp and Log in both time and curvature around the Shape ramp', () => {
    const shape = 0.242;

    // Measured off the fm3-edit thumbnails: Log rises over Shape, Exp over the remainder of the cycle.
    expect(modulationValue('LOG', shape, { shape })).toBeCloseTo(1);
    expect(modulationValue('EXP', 1 - shape, { shape })).toBeCloseTo(1);
    expect(modulationValue('LOG', 0, { shape })).toBeCloseTo(-1);
    expect(modulationValue('EXP', 0, { shape })).toBeCloseTo(-1);

    // Both track Shape rather than sitting on a fixed sine.
    expect(modulationValue('EXP', 0.5, { shape })).not.toBeCloseTo(modulationValue('EXP', 0.5, { shape: 0.5 }));
    expect(modulationValue('LOG', 0.5, { shape })).not.toBeCloseTo(modulationValue('LOG', 0.5, { shape: 0.5 }));

    // Halfway up its own ramp Exp lags below the line and Log rides above it: pointed crest vs flat crest.
    expect(modulationValue('EXP', (1 - shape) / 2, { shape })).toBeLessThan(0);
    expect(modulationValue('LOG', shape / 2, { shape })).toBeGreaterThan(0);
  });

  it('holds Trapezoid at each extreme for a quarter of the cycle', () => {
    const shape = 0.242;

    // Rise saturates at a quarter of the way up the leg, so each plateau is 25% of the period.
    expect(modulationValue('TRAPEZOID', shape * 0.75 + 0.001, { shape })).toBeCloseTo(1);
    expect(modulationValue('TRAPEZOID', shape * 0.75 - 0.02, { shape })).toBeLessThan(1);
    expect(modulationValue('TRAPEZOID', shape * 0.25 - 0.001, { shape })).toBeCloseTo(-1);
    expect(modulationValue('TRAPEZOID', shape * 0.25 + 0.02, { shape })).toBeGreaterThan(-1);
  });

  it('uses Shape to skew Triangle rise and fall times', () => {
    const shape = 0.242;
    const trough = 0;
    const peak = shape;

    expect(modulationValue('TRIANGLE', trough, { shape })).toBeCloseTo(-1);
    expect(modulationValue('TRIANGLE', peak, { shape })).toBeCloseTo(1);
    expect(peak - trough).toBeCloseTo(shape);
    expect(1 - shape).toBeGreaterThan(shape);
  });

  it('makes Astable curved, distinct from Triangle, and responsive to Shape', () => {
    expect(modulationValue('ASTABLE', 0.125, { shape: 0.242 })).not.toBeCloseTo(modulationValue('TRIANGLE', 0.125));
    expect(modulationValue('ASTABLE', 0.125, { shape: 0.1 })).not.toBeCloseTo(modulationValue('ASTABLE', 0.125, { shape: 0.9 }));
    expect(modulationValue('ASTABLE', 0, { shape: 0.242 })).toBeCloseTo(1);
    expect(modulationValue('ASTABLE', 0.5, { shape: 0.242 })).toBeCloseTo(-1);
    expect(modulationValue('ASTABLE', 0.75, { shape: 0.462 })).toBeGreaterThan(0);
    expect(modulationValue('ASTABLE', 0.25, { shape: 0.958 })).toBeLessThan(0);
  });
});

describe('modulationValue random', () => {
  it('holds one value a cycle when the graph says so, and two by default', () => {
    const at = (t: number, randomSteps?: number) => modulationValue('random', t, { randomSteps });
    expect(at(0.1)).not.toBe(at(0.6));
    expect(at(0.1, 1)).toBe(at(0.6, 1));
  });
});

describe('modulationRate', () => {
  it('uses free rate when tempo is disabled', () => {
    expect(modulationRate(3.5, 'NONE ', 120)).toBe(3.5);
  });

  it('follows straight, dotted, and triplet tempo divisions', () => {
    expect(modulationRate(1, '1/4', 120)).toBeCloseTo(2);
    expect(modulationRate(1, '1/4 DOT', 120)).toBeCloseTo(4 / 3);
    expect(modulationRate(1, '1/4 TRIP', 120)).toBeCloseTo(3);
  });
});

describe('LFO Duty Cycle', () => {
  const aboveMidline = (type: string, duty: number, shape = 0.613) => {
    let above = 0;
    for (let i = 0; i < 2000; i++) if (modulationValue(type, i / 2000, { duty, shape }) > 0) above++;
    return above / 2000;
  };
  const flatTop = (type: string, duty: number, shape = 0.613) => {
    let top = 0;
    for (let i = 0; i < 2000; i++) if (modulationValue(type, i / 2000, { duty, shape }) > 0.999) top++;
    return top / 2000;
  };

  it('leaves every waveform alone at 50%', () => {
    for (const type of ['sine', 'triangle', 'exp', 'log', 'trapezoid']) {
      for (const phase of [0, 0.13, 0.37, 0.5, 0.74, 0.91]) {
        expect(modulationValue(type, phase, { duty: 0.5, shape: 0.37 }))
          .toBeCloseTo(modulationValue(type, phase, { shape: 0.37 }), 10);
      }
    }
  });

  // Read off fm3-edit at Shape 61.3%: Duty is the share of the cycle spent above the midline.
  it('sets the share of the cycle a sine spends above the midline', () => {
    expect(aboveMidline('sine', 0.129)).toBeCloseTo(0.129, 2);
    expect(aboveMidline('sine', 0.627)).toBeCloseTo(0.627, 2);
    expect(aboveMidline('sine', 0.761)).toBeCloseTo(0.761, 2);
  });

  it('narrows a sine to a spike below 50% and flattens its top above', () => {
    expect(flatTop('sine', 0.129)).toBeLessThan(0.02); // a rounded apex, not a plateau
    expect(flatTop('sine', 0.627)).toBeCloseTo(0.27, 1);
    expect(flatTop('sine', 0.761)).toBeCloseTo(0.55, 1);
  });

  it('keeps the crest where Shape puts it', () => {
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      if (modulationValue('sine', i / 2000, { duty: 0.129, shape: 0.613 }) > modulationValue('sine', peak / 2000, { duty: 0.129, shape: 0.613 })) peak = i;
    }
    expect(peak / 2000).toBeCloseTo(0.613, 2);
  });

  it('still cuts a square at its pulse width', () => {
    expect(aboveMidline('square', 0.2)).toBeCloseTo(0.2, 2);
    expect(aboveMidline('square', 0.8)).toBeCloseTo(0.8, 2);
  });
});
