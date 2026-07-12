import { describe, expect, it } from 'vitest';
import {
  SWIPE_CANCEL_SLOP,
  SWIPE_CLOSE_DISTANCE,
  SWIPE_CLOSE_VELOCITY,
  beginSwipe,
  resolveSwipe,
  swipeStep,
  type SwipeState
} from '../bottomSheet';

function drag(
  start: { x: number; y: number; t: number },
  samples: { x: number; y: number; t: number }[],
  scrollAtTop = true
): SwipeState {
  let state = beginSwipe(start);
  for (const sample of samples) state = swipeStep(state, sample, scrollAtTop);
  return state;
}

describe('bottomSheet swipe state machine', () => {
  it('starts un-engaged, un-cancelled, at zero offset', () => {
    const state = beginSwipe({ x: 100, y: 100, t: 0 });
    expect(state.engaged).toBe(false);
    expect(state.cancelled).toBe(false);
    expect(state.offset).toBe(0);
  });

  it('engages and tracks offset on a downward drag from the top', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [
      { x: 100, y: 100 + SWIPE_CANCEL_SLOP + 5, t: 16 },
      { x: 100, y: 160, t: 32 }
    ]);
    expect(state.engaged).toBe(true);
    expect(state.cancelled).toBe(false);
    expect(state.offset).toBe(60);
  });

  it('clamps offset to zero so the sheet cannot be lifted above rest', () => {
    // Engage downward, then drag back up past the start.
    const state = drag({ x: 100, y: 100, t: 0 }, [
      { x: 100, y: 130, t: 16 },
      { x: 100, y: 40, t: 32 }
    ]);
    expect(state.engaged).toBe(true);
    expect(state.offset).toBe(0);
  });

  it('cancels when the content is not scrolled to the top', () => {
    const state = drag(
      { x: 100, y: 100, t: 0 },
      [{ x: 100, y: 100 + SWIPE_CANCEL_SLOP + 4, t: 16 }],
      false
    );
    expect(state.cancelled).toBe(true);
    expect(state.engaged).toBe(false);
  });

  it('cancels on a dominant horizontal drag', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [
      { x: 100 + SWIPE_CANCEL_SLOP + 6, y: 104, t: 16 }
    ]);
    expect(state.cancelled).toBe(true);
  });

  it('cancels on an upward drag', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [
      { x: 100, y: 100 - SWIPE_CANCEL_SLOP - 4, t: 16 }
    ]);
    expect(state.cancelled).toBe(true);
  });

  it('stays undecided below the slop', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [{ x: 102, y: 104, t: 16 }]);
    expect(state.engaged).toBe(false);
    expect(state.cancelled).toBe(false);
  });

  it('ignores further samples once cancelled', () => {
    let state = beginSwipe({ x: 100, y: 100, t: 0 });
    state = swipeStep(state, { x: 200, y: 104, t: 16 }, true); // cancel (horizontal)
    expect(state.cancelled).toBe(true);
    const after = swipeStep(state, { x: 100, y: 300, t: 32 }, true);
    expect(after).toBe(state); // unchanged reference
  });
});

describe('bottomSheet swipe resolution', () => {
  it('does not close a never-engaged gesture', () => {
    const state = beginSwipe({ x: 100, y: 100, t: 0 });
    expect(resolveSwipe(state, { x: 100, y: 100, t: 10 }).close).toBe(false);
  });

  it('does not close a cancelled gesture', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [{ x: 200, y: 104, t: 16 }]);
    expect(resolveSwipe(state, { x: 200, y: 104, t: 32 }).close).toBe(false);
  });

  it('closes past the distance threshold at low velocity', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [
      { x: 100, y: 130, t: 200 },
      { x: 100, y: 100 + SWIPE_CLOSE_DISTANCE + 4, t: 600 }
    ]);
    const res = resolveSwipe(state, { x: 100, y: 100 + SWIPE_CLOSE_DISTANCE + 4, t: 700 });
    expect(res.close).toBe(true);
  });

  it('closes on a fast flick even below the distance threshold', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [
      { x: 100, y: 120, t: 16 },
      { x: 100, y: 150, t: 32 }
    ]);
    // Release far below the distance threshold but with a fast downward flick.
    const dtY = SWIPE_CLOSE_VELOCITY * 20 + 5;
    const res = resolveSwipe(state, { x: 100, y: 150 + dtY, t: 52 });
    expect(state.offset).toBeLessThan(SWIPE_CLOSE_DISTANCE);
    expect(res.close).toBe(true);
  });

  it('snaps back when neither threshold is met', () => {
    const state = drag({ x: 100, y: 100, t: 0 }, [
      { x: 100, y: 130, t: 200 },
      { x: 100, y: 140, t: 600 }
    ]);
    const res = resolveSwipe(state, { x: 100, y: 141, t: 700 });
    expect(res.close).toBe(false);
  });
});
