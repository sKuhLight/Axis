import { describe, it, expect } from 'vitest';
import { LFO_SHAPES, lfoShapeFromLabel, lfoTrace, lfoValue, onePoleLowpass, quantize, type LfoShape } from './lfo';

const grid = (n: number): number[] => Array.from({ length: n }, (_, i) => i / n);

describe('lfoShapeFromLabel', () => {
  it('maps labels tolerant of case, spaces and hyphens', () => {
    expect(lfoShapeFromLabel('SINE')).toBe('sine');
    expect(lfoShapeFromLabel('Triangle')).toBe('triangle');
    expect(lfoShapeFromLabel('SQUARE')).toBe('square');
    expect(lfoShapeFromLabel('SAW UP')).toBe('sawUp');
    expect(lfoShapeFromLabel('saw-down')).toBe('sawDown');
    expect(lfoShapeFromLabel('RANDOM')).toBe('random');
    expect(lfoShapeFromLabel('LOG')).toBe('log');
    expect(lfoShapeFromLabel('EXP')).toBe('exp');
    expect(lfoShapeFromLabel('Trapezoid')).toBe('trapezoid');
    expect(lfoShapeFromLabel('ASTABLE')).toBe('astable');
  });

  it('returns null for unknown / missing', () => {
    expect(lfoShapeFromLabel('WOBBLE')).toBeNull();
    expect(lfoShapeFromLabel('')).toBeNull();
    expect(lfoShapeFromLabel(null)).toBeNull();
    expect(lfoShapeFromLabel(undefined)).toBeNull();
    expect(lfoShapeFromLabel('constructor')).toBeNull();
  });
});

describe('lfoValue', () => {
  it('stays within ±1 for every shape, skew and phase (including out-of-range phases)', () => {
    for (const shape of LFO_SHAPES) {
      for (const skew of [0, 0.1, 0.5, 0.9, 1]) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = -200; i <= 400; i++) {
          const v = lfoValue(shape, i / 97, { skew, duty: skew, seed: 7 });
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
        expect(lo).toBeGreaterThanOrEqual(-1);
        expect(hi).toBeLessThanOrEqual(1);
      }
    }
  });

  it('hits the textbook landmarks', () => {
    expect(lfoValue('triangle', 0)).toBe(-1);
    expect(lfoValue('triangle', 0.5)).toBe(1);
    expect(lfoValue('triangle', 0.25)).toBe(0);
    expect(lfoValue('sine', 0)).toBe(-1);
    expect(lfoValue('sine', 0.5)).toBe(1);
    expect(lfoValue('sine', 0.25)).toBeCloseTo(0, 12);
    expect(lfoValue('sawUp', 0)).toBe(-1);
    expect(lfoValue('sawUp', 0.75)).toBe(0.5);
    expect(lfoValue('sawDown', 0.25)).toBe(0.5);
    expect(lfoValue('trapezoid', 0.5)).toBe(1);
    expect(lfoValue('trapezoid', 0)).toBe(-1);
    expect(lfoValue('log', 0)).toBeCloseTo(-1, 12);
    expect(lfoValue('log', 0.5)).toBeCloseTo(1, 12);
    expect(lfoValue('exp', 0)).toBeCloseTo(-1, 12);
    expect(lfoValue('exp', 0.5)).toBeCloseTo(1, 12);
    expect(lfoValue('astable', 0)).toBeCloseTo(-1, 12);
    expect(lfoValue('astable', 0.5)).toBeCloseTo(1, 12);
  });

  it('log bends up and exp bends down relative to the triangle', () => {
    expect(lfoValue('log', 0.125)).toBeGreaterThan(lfoValue('triangle', 0.125));
    expect(lfoValue('exp', 0.125)).toBeLessThan(lfoValue('triangle', 0.125));
  });

  it('wraps the phase', () => {
    for (const shape of ['sine', 'triangle', 'sawUp', 'astable'] as LfoShape[]) {
      expect(lfoValue(shape, 1.3)).toBeCloseTo(lfoValue(shape, 0.3), 12);
      expect(lfoValue(shape, -0.7)).toBeCloseTo(lfoValue(shape, 0.3), 12);
    }
    expect(lfoValue('sine', NaN)).toBe(-1);
  });

  it('is continuous at the skew point (triangle, sine, astable)', () => {
    for (const skew of [0.2, 0.5, 0.8]) {
      for (const shape of ['triangle', 'sine', 'astable'] as LfoShape[]) {
        const before = lfoValue(shape, skew - 1e-9, { skew });
        const at = lfoValue(shape, skew, { skew });
        expect(at).toBeCloseTo(1, 6);
        expect(before).toBeCloseTo(at, 6);
      }
      // and the peak sits at the skew point
      expect(lfoValue('triangle', skew, { skew })).toBe(1);
    }
  });

  it('duty moves the square edge (and only affects the square)', () => {
    expect(lfoValue('square', 0.2, { duty: 0.25 })).toBe(1);
    expect(lfoValue('square', 0.3, { duty: 0.25 })).toBe(-1);
    expect(lfoValue('square', 0.3, { duty: 0.5 })).toBe(1);
    expect(lfoValue('square', 0.7, { duty: 0.75 })).toBe(1);
    expect(lfoValue('triangle', 0.3, { duty: 0.1 })).toBe(lfoValue('triangle', 0.3));
    const high = grid(1000).filter((p) => lfoValue('square', p, { duty: 0.3 }) === 1).length;
    expect(high).toBe(300);
  });

  it('random is a deterministic sample-and-hold per (seed, cycle)', () => {
    const a = lfoValue('random', 0.1, { seed: 42, cycle: 3 });
    expect(lfoValue('random', 0.1, { seed: 42, cycle: 3 })).toBe(a);
    expect(lfoValue('random', 0.9, { seed: 42, cycle: 3 })).toBe(a); // held for the whole cycle
    expect(lfoValue('random', 0.1, { seed: 42, cycle: 4 })).not.toBe(a);
    expect(lfoValue('random', 0.1, { seed: 43, cycle: 3 })).not.toBe(a);
    expect(lfoValue('random', 1.1, { seed: 42, cycle: 2 })).toBe(a); // unwrapped phase walks the cycles
    const values = new Set(Array.from({ length: 64 }, (_, c) => lfoValue('random', 0, { seed: 1, cycle: c })));
    expect(values.size).toBeGreaterThan(60);
    const mean = [...values].reduce((s, v) => s + v, 0) / values.size;
    expect(Math.abs(mean)).toBeLessThan(0.3);
  });
});

describe('quantize', () => {
  it('passes through without levels', () => {
    expect(quantize(0.37, null)).toBe(0.37);
    expect(quantize(0.37, undefined)).toBe(0.37);
    expect(quantize(0.37, 1)).toBe(0.37);
    expect(quantize(NaN, 4)).toBe(0);
  });

  it('2 levels → only ±1', () => {
    for (const p of grid(50)) expect([-1, 1]).toContain(quantize(lfoValue('sine', p), 2));
  });

  it('3 levels → {−1, 0, 1}', () => {
    const seen = new Set(grid(200).map((p) => quantize(lfoValue('sine', p), 3)));
    expect([...seen].sort((a, b) => a - b)).toEqual([-1, 0, 1]);
  });

  it('includes both ends and spaces levels evenly', () => {
    expect(quantize(1, 5)).toBe(1);
    expect(quantize(-1, 5)).toBe(-1);
    expect(quantize(0.3, 5)).toBe(0.5);
    expect(quantize(0.2, 5)).toBe(0);
    expect(quantize(7, 5)).toBe(1);
  });
});

describe('onePoleLowpass', () => {
  it('settles towards a step with α = 1 − e^{−2π·fc·dt}', () => {
    const out = onePoleLowpass([0, 1, 1, 1], 10, 0.01);
    const a = 1 - Math.exp(-2 * Math.PI * 10 * 0.01);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(a, 12);
    expect(out[2]).toBeCloseTo(a + a * (1 - a), 12);
  });

  it('copies on an invalid cutoff / dt', () => {
    expect(onePoleLowpass([1, -1, 1], 0, 0.01)).toEqual([1, -1, 1]);
    expect(onePoleLowpass([1, -1, 1], 10, NaN)).toEqual([1, -1, 1]);
    expect(onePoleLowpass([], 10, 0.01)).toEqual([]);
  });
});

describe('lfoTrace', () => {
  const ptp = (v: readonly number[]): number => Math.max(...v) - Math.min(...v);

  it('samples `samples` points over two cycles by default (inclusive ends)', () => {
    const { l, r } = lfoTrace({ shape: 'triangle', rateHz: 1 }, 9);
    expect(l).toHaveLength(9);
    expect(r).toBeNull();
    expect(l[0]).toBe(-1);
    expect(l[2]).toBe(1); // p = 0.5
    expect(l[4]).toBe(-1); // p = 1
  });

  it('quantizes the trace', () => {
    const { l } = lfoTrace({ shape: 'sine', rateHz: 1, quantize: 3 }, 101);
    expect(new Set(l).size).toBeLessThanOrEqual(3);
  });

  it('high-cut reduces the peak-to-peak of a square, and is skipped when far above the rate', () => {
    const raw = lfoTrace({ shape: 'square', rateHz: 1 }, 400).l;
    const cut = lfoTrace({ shape: 'square', rateHz: 1, hicutHz: 0.5 }, 400).l;
    expect(ptp(raw)).toBe(2);
    expect(ptp(cut)).toBeLessThan(1.5);
    // pre-roll: the trace starts settled, not at the raw first sample
    expect(cut[0]).not.toBe(raw[0]);
    expect(lfoTrace({ shape: 'square', rateHz: 1, hicutHz: 50 }, 400).l).toEqual(raw);
    expect(lfoTrace({ shape: 'square', rateHz: 1, hicutHz: null }, 400).l).toEqual(raw);
    expect(lfoTrace({ shape: 'square', rateHz: 1, hicutHz: 0 }, 400).l).toEqual(raw);
  });

  it('r is the same wave offset by phaseDeg/360: r(p) = l(p + offset)', () => {
    const spec = { shape: 'sine' as const, rateHz: 2, phaseDeg: 90, cycles: 2 };
    const n = 41;
    const step = 2 / (n - 1);
    const { l, r } = lfoTrace(spec, n);
    expect(r).not.toBeNull();
    for (let i = 0; i < n; i++) {
      expect(r![i]).toBeCloseTo(lfoValue('sine', i * step + 0.25), 12);
      expect(l[i]).toBeCloseTo(lfoValue('sine', i * step), 12);
    }
    // a quarter cycle = 5 samples here
    expect(r![0]).toBeCloseTo(l[5]!, 12);
    expect(lfoTrace({ ...spec, phaseDeg: 0 }, n).r).toBeNull();
    expect(lfoTrace({ ...spec, phaseDeg: null }, n).r).toBeNull();
    expect(lfoTrace({ ...spec, phaseDeg: NaN }, n).r).toBeNull();
  });

  it('is deterministic for random and degrades on bad sample counts', () => {
    const a = lfoTrace({ shape: 'random', rateHz: 1, seed: 5, cycles: 4 }, 81).l;
    expect(lfoTrace({ shape: 'random', rateHz: 1, seed: 5, cycles: 4 }, 81).l).toEqual(a);
    expect(lfoTrace({ shape: 'sine', rateHz: 1 }, 1)).toEqual({ l: [], r: null });
    expect(lfoTrace({ shape: 'sine', rateHz: 1 }, NaN)).toEqual({ l: [], r: null });
  });
});
