// Block-move planner for the device preset grid (the unit-testable heart of "move presets to
// another location"). Pure: given a CONTIGUOUS selection of device slots and a destination start
// slot, it returns the exact permutation the executor must apply. No device access, no DOM.
//
// Why this is lossless (see `.lavish/move-presets-to-locations.html` → Correctness):
//   • Selection S and destination D = [d, d+n-1] are the SAME SIZE n, so
//     |D\S| = n − |S∩D| = |S\D|. The move is therefore a bijection on S∪D: every item gets exactly
//     one slot, every slot exactly one item. Nothing is created or destroyed.
//   • All source bytes are snapshotted BEFORE the first write, so each write reads a snapshot, never
//     a live slot. Write order cannot clobber a value still needed — which is why the overlapping
//     case S∩D needs no special handling at all.
//   • On gen-3 an empty device slot is a real, CRC-valid `<EMPTY>` preset (library.svelte.ts), i.e.
//     just another item. Empty cells therefore ride the permutation like any other preset and the
//     vacated source slot ends up empty with no clear/erase primitive. `cleared` reports which
//     destinations end up empty (the `from` item there was an empty preset).

/** One snapshot→store op: snapshot slot `from`, load into the edit buffer, store to slot `to`. */
export interface AxisPbMoveWrite {
  from: number;
  to: number;
}

export interface AxisPbMovePlan {
  /** Ordered writes, sorted by `to` ascending. `from === to` no-ops are excluded (see `unchanged`). */
  writes: AxisPbMoveWrite[];
  /** Affected slots that already land on themselves — no device op needed. */
  unchanged: number[];
  /** Destinations that end up empty because the preset written there is an empty slot. */
  cleared: number[];
}

export type AxisPbMoveFailure =
  | 'empty-selection'
  | 'not-contiguous'
  | 'selection-out-of-range'
  | 'destination-out-of-range'
  /** Two staged moves touch the same slot, so they cannot be merged into one permutation. */
  | 'conflicting-moves';

export type AxisPbMoveResult = { ok: true; plan: AxisPbMovePlan } | { ok: false; reason: AxisPbMoveFailure };

export interface AxisPbMoveInput {
  /** Device slot numbers of the selected run. Any order — sorted ascending internally. */
  selection: readonly number[];
  /** First target slot; the destination run is [destination, destination + selection.length - 1]. */
  destination: number;
  /** Total addressable device slots (0..slotCount-1). */
  slotCount: number;
  /** Whether a slot is an empty preset — used only to report `cleared`. Omit to skip that report. */
  isEmpty?: (slot: number) => boolean;
}

/**
 * Resolve a block move into a concrete permutation. Returns a failure reason for any input the
 * executor must never attempt (it must refuse rather than guess), or the plan to apply.
 *
 * Destination length always equals selection length — a free-form multi-cell drop is deliberately
 * not expressible here, because that would break the |D\S| = |S\D| balance.
 */
export function resolveAxisPbMove(input: AxisPbMoveInput): AxisPbMoveResult {
  const { destination, slotCount, isEmpty } = input;
  if (!input.selection.length) return { ok: false, reason: 'empty-selection' };

  const selection = [...input.selection].sort((a, b) => a - b);
  const n = selection.length;

  for (let i = 0; i < n; i++) {
    const slot = selection[i]!;
    if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount) {
      return { ok: false, reason: 'selection-out-of-range' };
    }
    if (i > 0 && slot !== selection[i - 1]! + 1) return { ok: false, reason: 'not-contiguous' };
  }

  if (!Number.isInteger(destination) || destination < 0 || destination + n - 1 >= slotCount) {
    return { ok: false, reason: 'destination-out-of-range' };
  }

  const inSelection = new Set(selection);
  const destinationSlots = Array.from({ length: n }, (_, i) => destination + i);
  const inDestination = new Set(destinationSlots);

  // Forward map: block member i moves to the i-th destination slot.
  const entries: AxisPbMoveWrite[] = selection.map((from, i) => ({ from, to: destinationSlots[i]! }));

  // Swap-backs: the destination occupants outside the block move into the vacated source slots.
  // Both sets have the same size (the overlap cancels), paired ascending↔ascending so the result is
  // deterministic. They are already sorted because selection/destination are built in ascending order.
  const displaced = destinationSlots.filter((slot) => !inSelection.has(slot));
  const vacated = selection.filter((slot) => !inDestination.has(slot));
  for (let j = 0; j < displaced.length; j++) entries.push({ from: displaced[j]!, to: vacated[j]! });

  const unchanged: number[] = [];
  const writes: AxisPbMoveWrite[] = [];
  const cleared: number[] = [];
  for (const entry of entries) {
    if (entry.from === entry.to) {
      unchanged.push(entry.from);
      continue;
    }
    writes.push(entry);
    if (isEmpty?.(entry.from)) cleared.push(entry.to);
  }
  writes.sort((a, b) => a.to - b.to);

  return { ok: true, plan: { writes, unchanged, cleared } };
}

/** One staged move: a (contiguous) selection and the destination run's first slot. */
export interface AxisPbMoveStep {
  selection: readonly number[];
  destination: number;
}

export interface AxisPbMoveBatchInput {
  slotCount: number;
  isEmpty?: (slot: number) => boolean;
}

export type AxisPbMoveBatchResult =
  | { ok: true; plan: AxisPbMovePlan }
  | { ok: false; reason: AxisPbMoveFailure };

/**
 * Resolve SEVERAL staged moves into the ONE permutation the executor applies.
 *
 * Each step is a valid single move on its own; the merge only needs the affected slot sets to be
 * DISJOINT. When they are, each step's writes stay a bijection on its own slots, so their union is a
 * bijection on the union — exactly what the server's snapshot-first executor expects. Overlapping
 * steps have no unambiguous merge (slot 1 cannot both keep `3`'s content and receive `5`'s), so they
 * are refused as `conflicting-moves` rather than silently ordered.
 */
export function resolveAxisPbMoveBatch(
  steps: readonly AxisPbMoveStep[],
  opts: AxisPbMoveBatchInput
): AxisPbMoveBatchResult {
  if (!steps.length) return { ok: false, reason: 'empty-selection' };

  const writes: AxisPbMoveWrite[] = [];
  const unchanged: number[] = [];
  const cleared: number[] = [];
  const claimed = new Set<number>();

  for (const step of steps) {
    const resolved = resolveAxisPbMove({ ...step, slotCount: opts.slotCount, isEmpty: opts.isEmpty });
    if (!resolved.ok) return { ok: false, reason: resolved.reason };

    // Every slot a step reads or writes must belong to that step alone (no-ops included). A slot
    // repeats WITHIN a step by design (it's a permutation cycle), so compare as a set and only claim
    // it once the whole step is in — otherwise a single two-way swap would conflict with itself.
    const touched = new Set<number>([
      ...resolved.plan.writes.flatMap((w) => [w.from, w.to]),
      ...resolved.plan.unchanged
    ]);
    for (const slot of touched) if (claimed.has(slot)) return { ok: false, reason: 'conflicting-moves' };
    for (const slot of touched) claimed.add(slot);

    writes.push(...resolved.plan.writes);
    unchanged.push(...resolved.plan.unchanged);
    cleared.push(...resolved.plan.cleared);
  }

  writes.sort((a, b) => a.to - b.to);
  unchanged.sort((a, b) => a - b);
  cleared.sort((a, b) => a - b);
  return { ok: true, plan: { writes, unchanged, cleared } };
}
