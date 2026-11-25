import { describe, it, expect } from 'vitest';
import {
  BUTTERWORTH_Q,
  filterResponse,
  logFreqs,
  RESPONSE_FLOOR_DB,
  sectionMagSq,
  typeFromLabel,
  wahFreq,
  wahResponse,
  WAH_Q_MIN,
  type FilterSpec
} from './response';

const at = (spec: FilterSpec, f: number): number => filterResponse(spec, [f])[0]!;
const Q = BUTTERWORTH_Q;

describe('typeFromLabel', () => {
  it.each([
    ['Low-Pass', 'lowpass'],
    ['LOWPASS', 'lowpass'],
    ['Low Pass', 'lowpass'],
    ['Band-Pass', 'bandpass'],
    ['High-Pass', 'highpass'],
    ['Low-Shelf', 'lowshelf'],
    ['Low-Shelf 2', 'lowshelf'],
    ['High-Shelf', 'highshelf'],
    ['Peaking', 'peaking'],
    ['Peaking 2', 'peaking'],
    ['Notch', 'notch'],
    ['Tilt EQ', 'tilt'],
    ['All-Pass', 'allpass'],
    ['Comb 1', 'unsupported'],
    ['Null', 'unsupported'],
    ['Envelope Wah', 'unsupported'],
    ['Auto Wah', 'unsupported'],
    ['Touch Wah', 'unsupported'],
    ['', 'unsupported']
  ])('%s → %s', (label, type) => {
    expect(typeFromLabel(label)).toBe(type);
  });

  it('handles missing labels', () => {
    expect(typeFromLabel(null)).toBe('unsupported');
    expect(typeFromLabel(undefined)).toBe('unsupported');
    expect(typeFromLabel('constructor')).toBe('unsupported');
  });
});

describe('sectionMagSq / filterResponse', () => {
  it('LP / HP are −3.01 dB at f0 with Q 0.707', () => {
    expect(at({ type: 'lowpass', freq: 1000, q: Q }, 1000)).toBeCloseTo(-3.0103, 2);
    expect(at({ type: 'highpass', freq: 1000, q: Q }, 1000)).toBeCloseTo(-3.0103, 2);
    expect(at({ type: 'lowpass', freq: 1000, q: 0.707 }, 1000)).toBeGreaterThan(-3.06);
    expect(at({ type: 'lowpass', freq: 1000, q: 0.707 }, 1000)).toBeLessThan(-2.96);
    expect(at({ type: 'lowpass', freq: 1000, q: Q }, 10)).toBeCloseTo(0, 3);
    expect(at({ type: 'highpass', freq: 1000, q: Q }, 100000)).toBeCloseTo(0, 3);
  });

  it('peaking is +G at f0 and flat far away', () => {
    expect(at({ type: 'peaking', freq: 500, q: 2, gainDb: 9 }, 500)).toBeCloseTo(9, 10);
    expect(at({ type: 'peaking', freq: 500, q: 2, gainDb: -12 }, 500)).toBeCloseTo(-12, 10);
    expect(at({ type: 'peaking', freq: 500, q: 2, gainDb: 9 }, 5)).toBeCloseTo(0, 2);
  });

  it('band-pass peaks at 0 dB; all-pass is flat', () => {
    expect(at({ type: 'bandpass', freq: 800, q: 4 }, 800)).toBeCloseTo(0, 12);
    expect(at({ type: 'bandpass', freq: 800, q: 4 }, 200)).toBeLessThan(-20);
    expect(at({ type: 'allpass', freq: 800, q: 4 }, 123)).toBe(0);
  });

  it('notch is very deep at f0 (floored, never −Infinity)', () => {
    const d = at({ type: 'notch', freq: 1000, q: 2 }, 1000);
    expect(d).toBeLessThan(-60);
    expect(d).toBe(RESPONSE_FLOOR_DB);
    expect(at({ type: 'notch', freq: 1000, q: 2 }, 1010)).toBeLessThan(-20);
  });

  it('4th order falls at ≈ −24 dB/oct far above f0 (2nd order ≈ −12)', () => {
    const lp4: FilterSpec = { type: 'lowpass', freq: 1000, q: Q, order: 4 };
    const lp2: FilterSpec = { type: 'lowpass', freq: 1000, q: Q };
    expect(at(lp4, 16000) - at(lp4, 8000)).toBeGreaterThan(-25);
    expect(at(lp4, 16000) - at(lp4, 8000)).toBeLessThan(-23);
    expect(at(lp2, 16000) - at(lp2, 8000)).toBeCloseTo(-12.04, 1);
    expect(at({ ...lp4, freq: 100 }, 20000)).toBe(RESPONSE_FLOOR_DB); // −160 dB analytically → floored
    // only pass / stop types are squared: a 4th-order peaking keeps its gain (review fix)
    expect(at({ type: 'peaking', freq: 500, q: 1, gainDb: 3, order: 4 }, 500)).toBeCloseTo(3, 10);
    expect(at({ type: 'notch', freq: 500, q: 1, order: 4 }, 400)).toBeCloseTo(2 * at({ type: 'notch', freq: 500, q: 1 }, 400), 10);
  });

  it('shelves reach +G on their side and 0 dB on the other', () => {
    const ls: FilterSpec = { type: 'lowshelf', freq: 1000, q: Q, gainDb: 6 };
    const hs: FilterSpec = { type: 'highshelf', freq: 1000, q: Q, gainDb: -8 };
    expect(at(ls, 1)).toBeCloseTo(6, 3);
    expect(at(ls, 1e6)).toBeCloseTo(0, 3);
    expect(at(ls, 1000)).toBeCloseTo(3, 6); // half the gain (in dB) at f0
    expect(at(hs, 1e6)).toBeCloseTo(-8, 3);
    expect(at(hs, 1)).toBeCloseTo(0, 3);
  });

  it('tilt is antisymmetric around f0 with ±G/2 at the extremes', () => {
    const tilt: FilterSpec = { type: 'tilt', freq: 1000, q: Q, gainDb: 6 };
    expect(at(tilt, 1000)).toBeCloseTo(0, 10);
    for (const k of [1.5, 2, 4, 10]) expect(at(tilt, 1000 * k)).toBeCloseTo(-at(tilt, 1000 / k), 10);
    expect(at(tilt, 1e6)).toBeCloseTo(3, 3);
    expect(at(tilt, 1)).toBeCloseTo(-3, 3);
  });

  it('adds 12 dB/oct Butterworth low / high cuts', () => {
    const flat: FilterSpec = { type: 'allpass', freq: 1000, q: Q, lowCut: 100, highCut: 8000 };
    expect(at(flat, 100)).toBeCloseTo(-3.0103, 3);
    expect(at(flat, 8000)).toBeCloseTo(-3.0103, 3);
    expect(at(flat, 1000)).toBeCloseTo(0, 1);
    expect(at({ ...flat, lowCut: null, highCut: 0 }, 100)).toBe(0);
  });

  it('degrades to NaN for unsupported / invalid input', () => {
    expect(filterResponse({ type: 'unsupported', freq: 1000, q: 1 }, [10, 100]).every(Number.isNaN)).toBe(true);
    expect(filterResponse({ type: 'lowpass', freq: 0, q: 1 }, [10]).every(Number.isNaN)).toBe(true);
    expect(filterResponse({ type: 'lowpass', freq: 1000, q: 1 }, [-5, NaN, 0]).every(Number.isNaN)).toBe(true);
    expect(sectionMagSq('lowpass', NaN, 1, 0)).toBeNaN();
    expect(sectionMagSq('lowpass', 1, 0, 0)).toBeCloseTo(sectionMagSq('lowpass', 1, Q, 0), 12); // bad Q → Butterworth
  });
});

describe('logFreqs', () => {
  it('spaces n points logarithmically with exact ends', () => {
    const f = logFreqs(4);
    expect(f).toHaveLength(4);
    expect(f[0]).toBe(20);
    expect(f[3]).toBe(20000);
    expect(f[1]).toBeCloseTo(200, 9);
    expect(f[2]).toBeCloseTo(2000, 9);
    expect(logFreqs(3, 100, 10000)).toEqual([100, expect.closeTo(1000, 9), 10000]);
  });

  it('handles degenerate counts', () => {
    expect(logFreqs(0)).toEqual([]);
    expect(logFreqs(NaN)).toEqual([]);
    expect(logFreqs(1)).toEqual([20]);
    expect(logFreqs(2, -1, 0)).toEqual([20, 20000]);
  });
});

describe('wah', () => {
  it('wahFreq follows a log taper between its endpoints', () => {
    expect(wahFreq(450, 2000, 0)).toBe(450);
    expect(wahFreq(450, 2000, 1)).toBe(2000);
    expect(wahFreq(450, 2000, 0.5)).toBeCloseTo(Math.sqrt(450 * 2000), 9);
    expect(wahFreq(450, 2000, -1)).toBe(450);
    expect(wahFreq(450, 2000, 7)).toBe(2000);
    expect(wahFreq(0, 2000, 0.5)).toBeNaN();
  });

  it('wahResponse peaks at 0 dB on the current, min and max centre frequencies', () => {
    const spec = { fStart: 400, fStop: 1600, q: 5, control01: 0.5 };
    const freqs = [400, 800, 1600];
    const r = wahResponse(spec, freqs);
    expect(r.min[0]).toBeCloseTo(0, 12);
    expect(r.now[1]).toBeCloseTo(0, 12);
    expect(r.max[2]).toBeCloseTo(0, 12);
    expect(r.min[2]).toBeLessThan(-10);
  });

  it('never draws a Q below WAH_Q_MIN', () => {
    const lowQ = wahResponse({ fStart: 1000, fStop: 1000, q: 0.01, control01: 0 }, [250]).now[0]!;
    const minQ = wahResponse({ fStart: 1000, fStop: 1000, q: WAH_Q_MIN, control01: 0 }, [250]).now[0]!;
    expect(lowQ).toBeCloseTo(minQ, 12);
  });
});
