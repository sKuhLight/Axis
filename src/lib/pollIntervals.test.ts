import { describe, expect, it } from 'vitest';
import { pollIntervalsFor } from './pollIntervals';

describe('pollIntervalsFor', () => {
  it('returns the per-mode base intervals in local (non-remote) mode', () => {
    expect(pollIntervalsFor('performance', false)).toEqual({ pollMs: 5000, watchMs: 4000 });
    expect(pollIntervalsFor('balanced', false)).toEqual({ pollMs: 8000, watchMs: 6000 });
    expect(pollIntervalsFor('reduced', false)).toEqual({ pollMs: 15000, watchMs: 12000 });
  });

  it('takes the max of the remote floor and the mode intervals when remote is active', () => {
    // performance is faster than the remote floor → floor wins on both loops.
    expect(pollIntervalsFor('performance', true)).toEqual({ pollMs: 20000, watchMs: 25000 });
    // balanced is also below the floor → floor wins.
    expect(pollIntervalsFor('balanced', true)).toEqual({ pollMs: 20000, watchMs: 25000 });
    // reduced's poll (15000) is below the floor (20000) but its watch (12000) is below the
    // watch floor (25000) too → floor wins on both.
    expect(pollIntervalsFor('reduced', true)).toEqual({ pollMs: 20000, watchMs: 25000 });
  });

  it('never polls faster than the relay floor under any mode when remote', () => {
    for (const mode of ['performance', 'balanced', 'reduced'] as const) {
      const { pollMs, watchMs } = pollIntervalsFor(mode, true);
      expect(pollMs).toBeGreaterThanOrEqual(20000);
      expect(watchMs).toBeGreaterThanOrEqual(25000);
    }
  });

  it('falls back to balanced for an unknown mode', () => {
    expect(pollIntervalsFor('bogus' as never, false)).toEqual({ pollMs: 8000, watchMs: 6000 });
  });

  it('returns a fresh object each call (never leaks the internal table)', () => {
    const a = pollIntervalsFor('balanced', false);
    a.pollMs = 1;
    expect(pollIntervalsFor('balanced', false).pollMs).toBe(8000);
  });
});
