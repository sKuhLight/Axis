import { describe, expect, it } from 'vitest';
import { dampedModifierSource, lfoModifierValue, lfoSourceFromName, mapModifierResponse, mapModifierSource, type LfoModifierVisualization } from './lfoModifier';
import type { EnumParam, NamedParam } from './types';

const named = (norm: number, min = 0, max = 1): NamedParam => ({ id: 1, name: '', norm, value: min + norm * (max - min), min, max });
const enm = (label: string): EnumParam => ({ id: 1, name: '', value: 0, options: [{ value: 0, label }] });
const base: LfoModifierVisualization = {
  source: { number: 1, output: 'A' },
  graph: { key: 'lfo1', page: 0, slot: 0, title: 'LFO 1', type: enm('Sine'), rate: named(0.5, 1, 1), depth: named(1) },
  mapping: { min: 0, max: 1, start: 0, mid: 0.5, end: 1, slope: 0.5, scale: 1, offset: 0 },
  attackSeconds: 0,
  releaseSeconds: 0
};

describe('LFO modifier visualization', () => {
  it('recognizes named LFO outputs without assuming device-specific ordinals', () => {
    expect(lfoSourceFromName('LFO 1A')).toEqual({ number: 1, output: 'A' });
    expect(lfoSourceFromName('LFO 2 B')).toEqual({ number: 2, output: 'B' });
    expect(lfoSourceFromName('External 1')).toBeNull();
  });

  it('maps the source through modifier range and response points', () => {
    expect(mapModifierSource(0, { ...base.mapping, min: 0.2, max: 0.8 })).toBeCloseTo(0.2);
    expect(mapModifierSource(0.5, { ...base.mapping, min: 0.2, max: 0.8 })).toBeCloseTo(0.5);
    expect(mapModifierSource(1, { ...base.mapping, min: 0.2, max: 0.8 })).toBeCloseTo(0.8);
    expect(mapModifierSource(0, { ...base.mapping, min: 0.8, max: 0.2 })).toBeCloseTo(0.8);
  });

  it('keeps response graph coordinates independent of the parameter range', () => {
    const mapping = { ...base.mapping, min: 0.3, max: 0.6, mid: 0.8 };
    expect(mapModifierResponse(0.5, mapping)).toBeCloseTo(0.8);
    expect(mapModifierSource(0.5, mapping)).toBeCloseTo(0.54);
  });

  it('samples the waveform and applies Output B phase', () => {
    // The hardware starts a waveform at its trough, so a 1 Hz sine bottoms out at t=0 and peaks at t=0.5.
    expect(lfoModifierValue(base, 0, 120)).toBeCloseTo(0);
    expect(lfoModifierValue(base, 0.5, 120)).toBeCloseTo(1);
    const outputB = { ...base, source: { number: 1 as const, output: 'B' as const }, graph: { ...base.graph, phase: named(1, 0, 180) } };
    expect(lfoModifierValue(outputB, 0, 120)).toBeCloseTo(1);
    expect(lfoModifierValue(outputB, 0.5, 120)).toBeCloseTo(0);
  });

  it('returns no visualization when the LFO is stopped', () => {
    expect(lfoModifierValue({ ...base, graph: { ...base.graph, run: enm('Stop') } }, 1, 120)).toBeNull();
  });

  it('uses attack and release as asymmetric smoothing times', () => {
    expect(dampedModifierSource(0.5, 1, 0.1, 0.5, 1)).toBeCloseTo(0.5906, 4);
    expect(dampedModifierSource(0.5, 0, 0.1, 0.5, 1)).toBeCloseTo(0.4524, 4);
    expect(dampedModifierSource(0.5, 1, 0.1, 0, 0)).toBe(1);
  });
});
