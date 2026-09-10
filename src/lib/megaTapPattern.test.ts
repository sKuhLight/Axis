import { describe, expect, it } from 'vitest';
import { megaTapAmpValue, megaTapTaps, megaTapTimeValue } from './megaTapPattern';

// Curves measured off a live FM3 (docs/handoff/megatap-shapes). Levels are normalized to the loudest
// tap of their own capture; tap times are fractions of the delay window.
const rms = (model: number[], measured: number[]) =>
  Math.sqrt(model.reduce((sum, value, index) => sum + (value - measured[index]) ** 2, 0) / model.length);

const times = (count: number, alpha: number) =>
  Array.from({ length: count }, (_, index) => megaTapTimeValue('EXP/LOG', index, count, alpha));

const train = (shape: string, count: number, alpha: number) =>
  Array.from({ length: count }, (_, index) => megaTapTimeValue(shape, index, count, alpha));

// A capture can lose a tap — two taps landing under a millisecond apart merge into one spike — so a
// measured onset is scored against its nearest modelled tap rather than against a fixed index.
const nearestRms = (model: number[], measured: number[]) =>
  Math.sqrt(
    measured.reduce((sum, value) => sum + Math.min(...model.map((tap) => (tap - value) ** 2)), 0) / measured.length
  );

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
    // EXP/LOG, six taps, Alpha 25%: the VU meter separated the first four.
    expect(rms(times(6, 0.25).slice(0, 4), [0.5178, 0.7717, 0.8954, 0.9561])).toBeLessThan(0.01);
  });

  it('crowds taps toward the start of the window above Alpha 50%, as measured', () => {
    // Alpha 75%, six taps. Onsets under ~80 ms hid inside the VU rig's impulse, so this capture
    // starts mid-train.
    expect(nearestRms(times(6, 0.75), [0.0206, 0.106, 0.2296, 0.4832, 1.0002])).toBeLessThan(0.015);
  });

  // Trains recorded by noise correlation (fm3-megatap-times-xcorr.json), which resolves taps about
  // a millisecond apart and so settles the three shapes the VU rig could not. Positions are
  // fractions of a 3000 ms window.
  const measuredTrains: [string, number, number, number[]][] = [
    ['EXP/LOG', 0.25, 8, [0.4312, 0.6787, 0.8208, 0.9022, 0.949, 0.9758, 0.9912, 1.0]],
    ['EXP/LOG', 0.75, 16, [0.0031, 0.0073, 0.0129, 0.0205, 0.0306, 0.0442, 0.0623, 0.0868, 0.1197, 0.1637, 0.2228, 0.302, 0.4085, 0.5512, 0.7428, 1.0]],
    ['SIGMOID', 0.25, 8, [0.0069, 0.0281, 0.0923, 0.2874, 0.7195, 0.9146, 0.9787, 1.0]],
    ['SIGMOID', 0.75, 16, [0.2885, 0.4485, 0.5376, 0.5869, 0.6143, 0.6296, 0.638, 0.6427, 0.6457, 0.6503, 0.6588, 0.6741, 0.7015, 0.7509, 0.8398, 1.0]],
    ['SIGMOID', 0.875, 32, [0.2235, 0.3655, 0.4555, 0.5128, 0.549, 0.5721, 0.5867, 0.596, 0.6019, 0.6056, 0.608, 0.6095, 0.6105, 0.6114, 0.612, 0.6126, 0.6131, 0.614, 0.6156, 0.618, 0.6217, 0.6276, 0.6368, 0.6515, 0.6745, 0.7108, 0.768, 0.858, 1.0]],
    ['COSINE', 0, 32, [0.0283, 0.0509, 0.0679, 0.08, 0.0876, 0.0918, 0.0936, 0.0943, 0.095, 0.0982, 0.1037, 0.1134, 0.1278, 0.1475, 0.173, 0.2043, 0.2415, 0.2845, 0.3329, 0.3857, 0.4426, 0.5025, 0.5642, 0.6268, 0.6891, 0.75, 0.8085, 0.8635, 0.9142, 0.9598, 1.0]],
    ['COSINE', 0.25, 32, [0.0255, 0.0359, 0.0374, 0.039, 0.0493, 0.0749, 0.1179, 0.1762, 0.2434, 0.3104, 0.3688, 0.4117, 0.4374, 0.4478, 0.4493, 0.4508, 0.4611, 0.4867, 0.5298, 0.5881, 0.6552, 0.7223, 0.7806, 0.8237, 0.8493, 0.8596, 0.8611, 0.8627, 0.873, 0.8986, 0.9417, 1.0]],
    ['COSINE', 0.75, 32, [0.0148, 0.0174, 0.0437, 0.1002, 0.1552, 0.1788, 0.1808, 0.198, 0.2481, 0.3075, 0.3408, 0.3457, 0.3551, 0.3967, 0.4575, 0.5005, 0.5109, 0.5151, 0.5471, 0.6061, 0.6573, 0.6756, 0.6775, 0.6999, 0.7539, 0.8111, 0.839, 0.8416, 0.8553, 0.902, 0.9624, 1.0]],
    ['SINE', 0, 32, [0.0644, 0.1275, 0.1884, 0.2459, 0.2993, 0.3476, 0.3903, 0.4272, 0.458, 0.4826, 0.5015, 0.515, 0.5239, 0.5292, 0.5315, 0.5322, 0.5328, 0.5352, 0.5403, 0.5492, 0.5628, 0.5817, 0.6064, 0.637, 0.6739, 0.7168, 0.765, 0.8184, 0.876, 0.9369, 1.0]],
    ['SINE', 0.25, 32, [0.0644, 0.1205, 0.1618, 0.1863, 0.1964, 0.1978, 0.1992, 0.2091, 0.2336, 0.275, 0.331, 0.3954, 0.4599, 0.5158, 0.5572, 0.5818, 0.5917, 0.5931, 0.5946, 0.6045, 0.629, 0.6705, 0.7265, 0.7909, 0.8553, 0.9113, 0.9527, 0.9772, 0.9872, 0.9886, 0.99, 1.0]],
    ['SINE', 0.75, 32, [0.0551, 0.0798, 0.082, 0.0978, 0.1462, 0.2053, 0.2397, 0.2451, 0.2536, 0.2935, 0.3534, 0.3971, 0.4085, 0.4121, 0.4423, 0.5001, 0.5516, 0.5711, 0.5729, 0.5937, 0.6462, 0.7034, 0.7322, 0.7354, 0.7478, 0.7928, 0.8526, 0.8911, 0.8987, 0.9047, 0.9405, 1.0]]
  ];

  for (const [shape, alpha, count, measured] of measuredTrains) {
    it(`matches the measured ${shape} train at Alpha ${alpha * 100}%, ${count} taps`, () => {
      expect(nearestRms(train(shape, count, alpha), measured)).toBeLessThan(0.005);
    });
  }

  it('bends SIGMOID at the same curvature as EXP/LOG, folded about the middle of the train', () => {
    // Each half of a SIGMOID train is an EXP/LOG bend of the opposite sign over half the taps, so
    // the first half mirrors onto the second.
    const model = train('SIGMOID', 16, 0.25);
    const span = model[15] + model[0];
    for (let k = 0; k < 8; k++) expect(model[k] + model[15 - k]).toBeCloseTo(span, 6);
  });

  it('spreads SIGMOID taps toward both ends below Alpha 50% and toward the middle above it', () => {
    const gaps = (alpha: number) => {
      const model = train('SIGMOID', 6, alpha);
      return model.map((value, index) => value - (index === 0 ? 0 : model[index - 1]));
    };
    const below = gaps(0.25);
    const above = gaps(0.75);
    expect(below[2]).toBeGreaterThan(below[0]); // widest gap in the middle -> taps pile up at the ends
    expect(above[2]).toBeLessThan(above[0]);
    expect(gaps(0.5).every((gap) => Math.abs(gap - 1 / 6) < 1e-9)).toBe(true);
  });

  it('sweeps COSINE and SINE from one cycle of gap modulation across the train to eight', () => {
    // The gap between taps runs from roughly nothing to twice the even spacing, and Alpha sets how
    // many times it does that across the train. Count the local minima to read the frequency off.
    const troughs = (shape: string, alpha: number) => {
      const model = train(shape, 64, alpha);
      const gaps = model.map((value, index) => value - (index === 0 ? 0 : model[index - 1]));
      return gaps.filter((gap, index) => index > 0 && index < gaps.length - 1 && gap < gaps[index - 1] && gap <= gaps[index + 1]).length;
    };
    expect(troughs('SINE', 0)).toBe(1);
    expect(troughs('SINE', 0.5)).toBe(4);
    expect(troughs('SINE', 1)).toBe(8);
    expect(troughs('COSINE', 1)).toBe(8);
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
