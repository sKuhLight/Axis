import { describe, expect, it } from 'vitest';
import { resolveAxisPbMove, resolveAxisPbMoveBatch } from '../presetBrowser/presetBrowserWorkbenchMove';

const ok = (r: ReturnType<typeof resolveAxisPbMove>) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.plan;
};

describe('resolveAxisPbMove — swap', () => {
  it('swaps two occupied slots', () => {
    const plan = ok(resolveAxisPbMove({ selection: [1], destination: 3, slotCount: 512 }));
    expect(plan.writes).toEqual([
      { from: 3, to: 1 },
      { from: 1, to: 3 }
    ]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.cleared).toEqual([]);
  });

  it('is a no-op when the destination is the same slot', () => {
    const plan = ok(resolveAxisPbMove({ selection: [1], destination: 1, slotCount: 512 }));
    expect(plan.writes).toEqual([]);
    expect(plan.unchanged).toEqual([1]);
  });
});

describe('resolveAxisPbMove — block move', () => {
  it('permutes a block onto an overlapping destination with nothing lost', () => {
    const plan = ok(resolveAxisPbMove({ selection: [1, 2, 3], destination: 3, slotCount: 512 }));
    // 1→3, 2→4, 3→5, and the displaced 4,5 swap back into the vacated 1,2.
    expect(plan.writes).toEqual([
      { from: 4, to: 1 },
      { from: 5, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
      { from: 3, to: 5 }
    ]);
  });

  it('moves a block to a non-overlapping destination (full swap-back)', () => {
    const plan = ok(resolveAxisPbMove({ selection: [0, 1], destination: 4, slotCount: 512 }));
    expect(plan.writes).toEqual([
      { from: 4, to: 0 },
      { from: 5, to: 1 },
      { from: 0, to: 4 },
      { from: 1, to: 5 }
    ]);
  });

  it('produces a single bijection on the affected slots', () => {
    const plan = ok(resolveAxisPbMove({ selection: [1, 2, 3], destination: 3, slotCount: 512 }));
    const froms = plan.writes.map((w) => w.from).sort((a, b) => a - b);
    const tos = plan.writes.map((w) => w.to).sort((a, b) => a - b);
    // Sources and destinations are the same set = S∪D, with no duplicates.
    expect(froms).toEqual([1, 2, 3, 4, 5]);
    expect(tos).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(froms).size).toBe(froms.length);
  });

  it('reports destinations that end up empty', () => {
    // Destination 5 holds an empty preset; it swap-backs into slot 2, so 2 ends up empty.
    const isEmpty = (slot: number) => slot === 5;
    const plan = ok(resolveAxisPbMove({ selection: [1, 2, 3], destination: 3, slotCount: 512, isEmpty }));
    expect(plan.cleared).toEqual([2]);
  });
});

describe('resolveAxisPbMove — refusals', () => {
  it('rejects an empty selection', () => {
    expect(resolveAxisPbMove({ selection: [], destination: 0, slotCount: 512 })).toEqual({
      ok: false,
      reason: 'empty-selection'
    });
  });

  it('rejects a non-contiguous selection', () => {
    expect(resolveAxisPbMove({ selection: [1, 3], destination: 10, slotCount: 512 })).toEqual({
      ok: false,
      reason: 'not-contiguous'
    });
  });

  it('rejects a selection outside the slot range', () => {
    expect(resolveAxisPbMove({ selection: [1, 2, 512], destination: 10, slotCount: 512 })).toEqual({
      ok: false,
      reason: 'selection-out-of-range'
    });
  });

  it('rejects a destination run that overflows the slot range', () => {
    expect(resolveAxisPbMove({ selection: [1, 2, 3], destination: 510, slotCount: 512 })).toEqual({
      ok: false,
      reason: 'destination-out-of-range'
    });
  });
});

describe('resolveAxisPbMoveBatch — staging', () => {
  const batch = (steps: { selection: number[]; destination: number }[], isEmpty?: (n: number) => boolean) =>
    resolveAxisPbMoveBatch(steps, { slotCount: 512, isEmpty });

  const batchOk = (r: ReturnType<typeof resolveAxisPbMoveBatch>) => {
    if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
    return r.plan;
  };

  it('merges disjoint moves into ONE permutation', () => {
    // Two independent swaps the user staged one drag at a time: 3→1 and 13→11.
    const plan = batchOk(
      batch([
        { selection: [3], destination: 1 },
        { selection: [13], destination: 11 }
      ])
    );
    expect(plan.writes).toEqual([
      { from: 3, to: 1 },
      { from: 1, to: 3 },
      { from: 13, to: 11 },
      { from: 11, to: 13 }
    ]);
    // Still a bijection over the union of both moves.
    const froms = plan.writes.map((w) => w.from).sort((a, b) => a - b);
    const tos = plan.writes.map((w) => w.to).sort((a, b) => a - b);
    expect(froms).toEqual([1, 3, 11, 13]);
    expect(tos).toEqual([1, 3, 11, 13]);
  });

  it('merges a block move with a separate single move', () => {
    const plan = batchOk(
      batch([
        { selection: [1, 2], destination: 4 },
        { selection: [20], destination: 30 }
      ])
    );
    expect(plan.writes).toContainEqual({ from: 20, to: 30 });
    expect(plan.writes).toContainEqual({ from: 30, to: 20 });
    expect(plan.writes).toContainEqual({ from: 0 + 1, to: 4 });
    expect(plan.writes).toHaveLength(6);
  });

  it('reports empties landing across staged moves', () => {
    const isEmpty = (slot: number) => slot === 11;
    const plan = batchOk(
      batch(
        [
          { selection: [3], destination: 1 },
          { selection: [13], destination: 11 }
        ],
        isEmpty
      )
    );
    // Slot 11's empty preset swaps back into 13 → 13 ends up empty.
    expect(plan.cleared).toEqual([13]);
  });

  it('merges a no-op step with a real one', () => {
    const plan = batchOk(
      batch([
        { selection: [3], destination: 3 },
        { selection: [13], destination: 11 }
      ])
    );
    expect(plan.unchanged).toEqual([3]);
    expect(plan.writes).toEqual([
      { from: 13, to: 11 },
      { from: 11, to: 13 }
    ]);
  });

  it('refuses a batch with no steps', () => {
    expect(batch([])).toEqual({ ok: false, reason: 'empty-selection' });
  });

  it('refuses overlapping staged moves', () => {
    // Both target slot 1 — no unambiguous merge.
    expect(
      batch([
        { selection: [3], destination: 1 },
        { selection: [5], destination: 1 }
      ])
    ).toEqual({ ok: false, reason: 'conflicting-moves' });
  });

  it('refuses a staged move that would consume another staged move\u2019s slot', () => {
    // 1 is vacated by the first move (1→3) but re-read by the second (1→5).
    expect(
      batch([
        { selection: [3], destination: 1 },
        { selection: [1], destination: 5 }
      ])
    ).toEqual({ ok: false, reason: 'conflicting-moves' });
  });

  it('surfaces a per-step refusal', () => {
    expect(batch([{ selection: [1, 3], destination: 10 }])).toEqual({
      ok: false,
      reason: 'not-contiguous'
    });
  });
});
