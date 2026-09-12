import { describe, expect, it } from 'vitest';
import { pollIntervalsFor } from './pollIntervals';

describe('pollIntervalsFor', () => {
  it('returns the per-mode base intervals', () => {
    expect(pollIntervalsFor('performance')).toEqual({ pollMs: 5000, watchMs: 4000 });
    expect(pollIntervalsFor('balanced')).toEqual({ pollMs: 8000, watchMs: 6000 });
    expect(pollIntervalsFor('reduced')).toEqual({ pollMs: 15000, watchMs: 12000 });
  });

  it('orders the modes from fastest to slowest on both loops', () => {
    const perf = pollIntervalsFor('performance');
    const bal = pollIntervalsFor('balanced');
    const red = pollIntervalsFor('reduced');
    expect(perf.pollMs).toBeLessThan(bal.pollMs);
    expect(bal.pollMs).toBeLessThan(red.pollMs);
    expect(perf.watchMs).toBeLessThan(bal.watchMs);
    expect(bal.watchMs).toBeLessThan(red.watchMs);
  });

  it('falls back to balanced for an unknown mode', () => {
    expect(pollIntervalsFor('bogus' as never)).toEqual({ pollMs: 8000, watchMs: 6000 });
  });

  it('returns a fresh object each call (never leaks the internal table)', () => {
    const a = pollIntervalsFor('balanced');
    a.pollMs = 1;
    expect(pollIntervalsFor('balanced').pollMs).toBe(8000);
  });
});
