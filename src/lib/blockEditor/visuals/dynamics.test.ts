import { describe, it, expect } from 'vitest';
import {
  compCurve,
  dynamicsTrace,
  dynamicsWindow,
  GATE_FLOOR_DB,
  GATE_RATIO_NO_RATIO,
  gateCurve,
  KNEE_DB,
  kneeWidth,
  mixBlend,
  MODEL_KNEE
} from './dynamics';

const H = 1e-6;
const slope = (f: (x: number) => number, x: number, side: -1 | 1): number => (side * (f(x + side * H) - f(x))) / H;

describe('kneeWidth', () => {
  it('maps known labels', () => {
    expect(kneeWidth('HARD')).toEqual({ width: 0, label: 'HARD', assumed: false });
    expect(kneeWidth('MED-HARD')).toEqual({ width: 3, label: 'MED-HARD', assumed: false });
    expect(kneeWidth('Medium')).toEqual({ width: 6, label: 'MEDIUM', assumed: false });
    expect(kneeWidth('med soft')).toEqual({ width: 12, label: 'MED-SOFT', assumed: false });
    expect(kneeWidth('SOFT')).toEqual({ width: 18, label: 'SOFT', assumed: false });
  });

  it('falls back to MODEL_KNEE (assumed) for missing / unknown', () => {
    const fallback = { width: KNEE_DB[MODEL_KNEE], label: 'MEDIUM', assumed: true };
    expect(kneeWidth(null)).toEqual(fallback);
    expect(kneeWidth(undefined)).toEqual(fallback);
    expect(kneeWidth('SQUISHY')).toEqual(fallback);
    expect(kneeWidth('')).toEqual(fallback);
  });
});

describe('compCurve', () => {
  const T = -20;
  const R = 4;
  const W = 6;
  const f = (x: number): number => compCurve(x, T, R, W);

  it('is the identity below the knee and T + (x − T)/R above it', () => {
    expect(f(-40)).toBe(-40);
    expect(f(0)).toBe(T + 20 / R);
  });

  it('is continuous in value and slope at both knee edges', () => {
    for (const edge of [T - W / 2, T + W / 2]) {
      expect(f(edge - 1e-9)).toBeCloseTo(f(edge + 1e-9), 6);
      expect(slope(f, edge, -1)).toBeCloseTo(slope(f, edge, 1), 4);
    }
    expect(slope(f, T - W / 2, -1)).toBeCloseTo(1, 4);
    expect(slope(f, T + W / 2, 1)).toBeCloseTo(1 / R, 4);
  });

  it('approaches slope 1/R far above the threshold', () => {
    expect((f(10) - f(0)) / 10).toBeCloseTo(1 / R, 12);
  });

  it('a hard knee equals the two straight segments', () => {
    for (let x = -60; x <= 10; x += 0.5) {
      const hard = compCurve(x, T, R, 0);
      expect(hard).toBeCloseTo(x <= T ? x : T + (x - T) / R, 12);
    }
  });

  it('treats ratio ≤ 1 / NaN as identity and +Infinity as a limiter', () => {
    expect(compCurve(0, T, 1, W)).toBe(0);
    expect(compCurve(0, T, 0.5, W)).toBe(0);
    expect(compCurve(0, T, NaN, W)).toBe(0);
    expect(compCurve(0, T, Infinity, 0)).toBe(T);
    expect(compCurve(-5, T, Infinity, 0)).toBe(T);
  });
});

describe('gateCurve', () => {
  it('expands below the threshold with slope R', () => {
    expect(gateCurve(-30, -40, 2, 0)).toBe(-30);
    expect(gateCurve(-50, -40, 2, 0)).toBe(-60);
    expect(gateCurve(-60, -40, 2, 0)).toBe(-80);
  });

  it('is continuous at both soft-knee edges', () => {
    const f = (x: number): number => gateCurve(x, -40, 3, 10);
    for (const edge of [-45, -35]) {
      expect(f(edge - 1e-9)).toBeCloseTo(f(edge + 1e-9), 6);
      expect(slope(f, edge, -1)).toBeCloseTo(slope(f, edge, 1), 4);
    }
    expect(f(-45)).toBeCloseTo(-55, 12);
  });

  it('never drops more than the range below the input', () => {
    expect(gateCurve(-70, -40, 2, 0, -20)).toBe(-90);
    expect(gateCurve(-50, -40, 2, 0, -20)).toBe(-60); // expansion is shallower than the range here
    expect(gateCurve(-70, -40, 2, 0, 20)).toBe(-90); // range sign ignored
  });

  it('R = Infinity is a hard gate: input + range below T, floor without a range', () => {
    expect(GATE_RATIO_NO_RATIO).toBe(Infinity);
    expect(gateCurve(-40, -40, Infinity, 6, -80)).toBe(-40);
    expect(gateCurve(-41, -40, Infinity, 6, -80)).toBe(-121);
    expect(gateCurve(-41, -40, Infinity, 6)).toBe(GATE_FLOOR_DB);
    expect(gateCurve(-41, -40, Infinity, 6, null)).toBe(GATE_FLOOR_DB);
  });
});

describe('mixBlend', () => {
  it('blends coherent amplitudes', () => {
    expect(mixBlend(-20, 0, 0)).toBe(0);
    expect(mixBlend(-20, 0, 1)).toBe(-20);
    expect(mixBlend(-6, -6, 0.5)).toBeCloseTo(-6, 12);
    expect(mixBlend(-20, 0, 0.5)).toBeCloseTo(20 * Math.log10(0.5 * 0.1 + 0.5), 12);
  });
});

describe('dynamicsWindow', () => {
  it('spans 12 dB below the lowest threshold to 6 dB above max(highest, 0)', () => {
    expect(dynamicsWindow(-60, -10)).toEqual([-72, 6]);
    expect(dynamicsWindow(-40, 5)).toEqual([-52, 11]);
  });

  it('falls back for unusable input', () => {
    expect(dynamicsWindow(NaN, 0)).toEqual([-72, 26]);
    expect(dynamicsWindow(-60, Infinity)).toEqual([-72, 26]);
  });
});

describe('dynamicsTrace', () => {
  const comp = { mode: 'compressor' as const, threshold: -20, ratio: 4, kneeDb: 6 };
  const win: [number, number] = [-60, 10];

  it('samples x evenly over the window with exact ends', () => {
    const { x, y } = dynamicsTrace(comp, win, 71);
    expect(x).toHaveLength(71);
    expect(y).toHaveLength(71);
    expect(x[0]).toBe(-60);
    expect(x[70]).toBe(10);
    expect(x[10]).toBeCloseTo(-50, 12);
  });

  it('mix 0 → identity (+ level), mix 1 → the curve', () => {
    const dry = dynamicsTrace({ ...comp, mix01: 0, levelDb: 3 }, win, 15);
    dry.x.forEach((x, i) => expect(dry.y[i]).toBeCloseTo(x + 3, 12));
    const wet = dynamicsTrace({ ...comp, mix01: 1 }, win, 15);
    wet.x.forEach((x, i) => expect(wet.y[i]).toBeCloseTo(compCurve(x, -20, 4, 6), 12));
    const half = dynamicsTrace({ ...comp, mix01: 0.5 }, win, 15);
    half.x.forEach((x, i) => expect(half.y[i]).toBeCloseTo(mixBlend(compCurve(x, -20, 4, 6), x, 0.5), 12));
  });

  it('draws a gate with its range floor', () => {
    const { x, y } = dynamicsTrace({ mode: 'gate', threshold: -40, ratio: Infinity, kneeDb: 0, rangeDb: -30 }, win, 71);
    x.forEach((xi, i) => expect(y[i]).toBe(xi >= -40 ? xi : xi - 30));
  });

  it('degrades on bad input', () => {
    expect(dynamicsTrace(comp, win, 1)).toEqual({ x: [], y: [] });
    const fb = dynamicsTrace(comp, [NaN, 0], 3);
    expect(fb.x).toEqual([-72, -23, 26]);
  });
});
