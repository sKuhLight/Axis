import { describe, expect, it } from 'vitest';
import { computeTrafficRates, formatRate } from '../widgets/telemetryTraffic';
import type { TrafficSnapshot } from '../../types';

const snap = (over: Partial<TrafficSnapshot> = {}): TrafficSnapshot => ({
  txMsgs: 0,
  txBytes: 0,
  rxMsgs: 0,
  rxBytes: 0,
  since: 0,
  loops: [],
  ...over
});

describe('computeTrafficRates', () => {
  it('derives per-second rates from the delta over the time gap', () => {
    const prev = snap({ txMsgs: 100, txBytes: 2048, rxMsgs: 50, rxBytes: 1024 });
    const next = snap({ txMsgs: 120, txBytes: 4096, rxMsgs: 60, rxBytes: 3072 });
    // dt = 2s → 20 tx msgs / 2 = 10/s; 2048 tx bytes / 1024 / 2 = 1 KB/s; 10 rx msgs /2 = 5/s; 2048 rx bytes → 1 KB/s.
    const r = computeTrafficRates(prev, 1000, next, 3000);
    expect(r).toEqual({ txMsgs: 10, rxMsgs: 5, txKB: 1, rxKB: 1 });
  });

  it('returns null without a previous or next snapshot', () => {
    expect(computeTrafficRates(null, 0, snap(), 1000)).toBeNull();
    expect(computeTrafficRates(snap(), 0, null, 1000)).toBeNull();
  });

  it('returns null for a non-positive time gap', () => {
    expect(computeTrafficRates(snap(), 1000, snap(), 1000)).toBeNull();
    expect(computeTrafficRates(snap(), 2000, snap(), 1000)).toBeNull();
  });

  it('returns null on a counter reset (a counter went backwards)', () => {
    const prev = snap({ txMsgs: 500, txBytes: 9000, rxMsgs: 300, rxBytes: 8000 });
    const next = snap({ txMsgs: 5, txBytes: 100, rxMsgs: 2, rxBytes: 50, since: 42 });
    expect(computeTrafficRates(prev, 1000, next, 2000)).toBeNull();
  });
});

describe('formatRate', () => {
  it('shows one decimal below 10 and rounds above', () => {
    expect(formatRate(0)).toBe('0.0');
    expect(formatRate(4.27)).toBe('4.3');
    expect(formatRate(12.6)).toBe('13');
  });

  it('clamps invalid values to 0', () => {
    expect(formatRate(-1)).toBe('0');
    expect(formatRate(NaN)).toBe('0');
  });
});
