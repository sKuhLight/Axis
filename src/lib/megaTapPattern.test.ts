import { describe, expect, it } from 'vitest';
import { megaTapAmpValue, megaTapTaps, megaTapTimeValue } from './megaTapPattern';

// Curves measured off a live FM3 (docs/handoff/megatap-shapes). Tap times are fractions of the
// 4000 ms window; levels are normalized to the loudest tap of their own capture.
const rms = (model: number[], measured: number[]) =>
  Math.sqrt(model.reduce((sum, value, index) => sum + (value - measured[index]) ** 2, 0) / model.length);

const times = (count: number, alpha: number) =>
  Array.from({ length: count }, (_, index) => megaTapTimeValue('EXP/LOG', index, count, alpha));

const levels = (shape: string, count: number, alpha: number) => {
  const raw = Array.from({ length: count }, (_, index) => megaTapAmpValue(shape, index, count, alpha));
  const peak = Math.max(...raw);
  return raw.map((value) => value / peak);
};

describe('megaTapTimeValue', () => {
  it('spaces taps evenly at Alpha 50%', () => {
    expect(rms(times(6, 0.5), [1, 2, 3, 4, 5, 6].map((k) => k / 6))).toBeLessThan(0.001);
  });

  it('crowds taps toward the end of the window below Alpha 50%, as measured', () => {
    // EXP/LOG, six taps, Alpha 25%: the meter separated the first four.
    expect(rms(times(6, 0.25).slice(0, 4), [0.5178, 0.7717, 0.8954, 0.9561])).toBeLessThan(0.01);
  });

  it('crowds taps toward the start of the window above Alpha 50%, as measured', () => {
    // Alpha 75%, six taps. Onsets under ~80 ms hide inside the impulse itself, so a capture can
    // start mid-train: each measured onset is scored against its nearest modelled tap.
    const model = times(6, 0.75);
    const measured = [0.0206, 0.106, 0.2296, 0.4832, 1.0002];
    const nearest = measured.map((value) => model.reduce((best, tap) => (Math.abs(tap - value) < Math.abs(best - value) ? tap : best)));
    expect(rms(nearest, measured)).toBeLessThan(0.015);
  });

  it('spreads SIGMOID taps toward both ends below Alpha 50% and toward the middle above it', () => {
    const gaps = (alpha: number) => {
      const model = Array.from({ length: 6 }, (_, index) => megaTapTimeValue('SIGMOID', index, 6, alpha));
      return model.map((value, index) => value - (index === 0 ? 0 : model[index - 1]));
    };
    const below = gaps(0.25);
    const above = gaps(0.75);
    expect(below[2]).toBeGreaterThan(below[0]); // widest gap in the middle -> taps pile up at the ends
    expect(above[2]).toBeLessThan(above[0]);
    expect(gaps(0.5).every((gap) => Math.abs(gap - 1 / 6) < 1e-9)).toBe(true);
  });

  it('leaves COSINE and SINE evenly spaced — their law is not resolved', () => {
    for (const shape of ['COSINE', 'SINE']) {
      const model = Array.from({ length: 8 }, (_, index) => megaTapTimeValue(shape, index, 8, 0.2));
      expect(model).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((k) => k / 8));
    }
  });

  it('puts the last tap at the end of the window whatever the Alpha', () => {
    for (const shape of ['EXP/LOG', 'SIGMOID', 'COSINE', 'SINE']) {
      for (const alpha of [0, 0.25, 0.5, 0.75, 1]) expect(megaTapTimeValue(shape, 7, 8, alpha)).toBeCloseTo(1, 6);
    }
  });
});

describe('megaTapAmpValue', () => {
  // Every case below is one measured eight-tap capture, normalized to its own loudest tap. The
  // tolerance is loose where the curve goes silent: the VU floor reads a silent tap as about 0.1.
  const cases: [string, number, number[]][] = [
    ['CONSTANT', 0, [0.0, 0.143, 0.286, 0.428, 0.57, 0.714, 0.859, 1.0]],
    ['CONSTANT', 0.5, [1.0, 0.999, 0.998, 0.998, 0.997, 0.999, 0.999, 0.995]],
    ['CONSTANT', 1, [1.0, 0.853, 0.709, 0.566, 0.424, 0.284, 0.142, 0.031]],
    ['INCREASING', 0, [0.711, 0.913, 0.977, 0.985, 0.997, 1.0, 0.994, 0.999]],
    ['INCREASING', 0.25, [0.466, 0.716, 0.849, 0.923, 0.962, 0.983, 0.994, 1.0]],
    ['INCREASING', 0.75, [0.006, 0.017, 0.037, 0.076, 0.147, 0.282, 0.533, 1.0]],
    ['DECREASING', 0, [1.0, 0.332, 0.109, 0.036, 0.012, 0.004, 0.001, 0.0]],
    ['DECREASING', 0.75, [1.0, 0.989, 0.974, 0.946, 0.903, 0.822, 0.681, 0.432]],
    ['UP / DOWN', 0.25, [0.716, 0.92, 0.983, 1.0, 1.0, 0.983, 0.925, 0.718]],
    ['UP / DOWN', 0.75, [0.017, 0.076, 0.281, 1.0, 0.999, 0.278, 0.076, 0.017]],
    ['DOWN / UP', 0.25, [1.0, 0.356, 0.119, 0.032, 0.032, 0.119, 0.355, 1.0]],
    ['DOWN / UP', 0.75, [0.999, 0.972, 0.88, 0.644, 0.646, 0.88, 0.968, 1.0]],
    ['COSINE', 0, [0.998, 0.998, 1.0, 1.0, 0.999, 1.0, 0.998, 1.0]],
    ['COSINE', 0.25, [0.84, 0.499, 0.145, 0.032, 0.145, 0.493, 0.846, 1.0]],
    ['SINE', 0.25, [0.856, 1.0, 0.854, 0.501, 0.146, 0.032, 0.147, 0.502]],
    ['SINE', 1, [0.998, 1.0, 1.0, 1.0, 0.999, 1.0, 1.0, 0.998]]
  ];

  for (const [shape, alpha, measured] of cases) {
    it(`matches the measured ${shape} curve at Alpha ${alpha * 100}%`, () => {
      expect(rms(levels(shape, 8, alpha), measured)).toBeLessThan(0.06);
    });
  }

  it('reads CONSTANT as a tilt, not a flat level — Alpha 0% ramps up out of silence', () => {
    expect(megaTapAmpValue('CONSTANT', 0, 8, 0)).toBeCloseTo(0, 6);
    expect(megaTapAmpValue('CONSTANT', 7, 8, 0)).toBeCloseTo(1, 6);
    expect(megaTapAmpValue('CONSTANT', 3, 8, 0.5)).toBeCloseTo(1, 6);
  });
});

describe('megaTapTaps', () => {
  it('spans the delay window, last tap on the end', () => {
    const taps = megaTapTaps({ count: 8, timeMs: 2000, timeAlpha: 0.5, ampAlpha: 0.5 });
    expect(taps).toHaveLength(8);
    expect(taps[0].ms).toBeCloseTo(250, 6);
    expect(taps[7].ms).toBeCloseTo(2000, 6);
  });

  it('handles a single tap', () => {
    const [tap] = megaTapTaps({ count: 1, timeMs: 1000, timeAlpha: 0.2, ampAlpha: 0.9 });
    expect(tap.ms).toBeCloseTo(1000, 6);
    expect(tap.amp).toBeGreaterThan(0);
  });

  it('is deterministic under Randomize and keeps taps inside the window', () => {
    const input = { count: 12, timeMs: 3000, timeRandom: 1, ampRandom: 1 };
    const first = megaTapTaps(input);
    expect(megaTapTaps(input)).toEqual(first);
    for (const tap of first) {
      expect(tap.ms).toBeGreaterThanOrEqual(0);
      expect(tap.ms).toBeLessThanOrEqual(3000);
      expect(tap.amp).toBeGreaterThanOrEqual(0);
      expect(tap.amp).toBeLessThanOrEqual(1);
    }
  });
});
