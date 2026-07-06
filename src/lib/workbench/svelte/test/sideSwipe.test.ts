import { describe, expect, it } from 'vitest';
import {
  SIDE_SWIPE_CANCEL_SLOP,
  SIDE_SWIPE_CLOSE_DISTANCE,
  SIDE_SWIPE_CLOSE_VELOCITY,
  beginSideSwipe,
  resolveSideSwipe,
  sideSwipeStep,
  type SideSwipeSide,
  type SideSwipeState
} from '../sideSwipe';

function drag(
  side: SideSwipeSide,
  start: { x: number; y: number; t: number },
  samples: { x: number; y: number; t: number }[],
  scrollAtEdge = true
): SideSwipeState {
  let state = beginSideSwipe(side, start);
  for (const sample of samples) state = sideSwipeStep(state, sample, scrollAtEdge);
  return state;
}

describe('sideSwipe state machine — RIGHT overlay (closes rightward)', () => {
  it('starts un-engaged, un-cancelled, at zero offset', () => {
    const state = beginSideSwipe('right', { x: 100, y: 100, t: 0 });
    expect(state.engaged).toBe(false);
    expect(state.cancelled).toBe(false);
    expect(state.offset).toBe(0);
  });

  it('engages and tracks offset on a rightward drag', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [
      { x: 100 + SIDE_SWIPE_CANCEL_SLOP + 5, y: 100, t: 16 },
      { x: 160, y: 100, t: 32 }
    ]);
    expect(state.engaged).toBe(true);
    expect(state.cancelled).toBe(false);
    expect(state.offset).toBe(60);
  });

  it('clamps offset to zero so the overlay cannot be dragged inward past rest', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [
      { x: 130, y: 100, t: 16 },
      { x: 40, y: 100, t: 32 }
    ]);
    expect(state.engaged).toBe(true);
    expect(state.offset).toBe(0);
  });

  it('cancels when the content is not scrolled to the edge', () => {
    const state = drag(
      'right',
      { x: 100, y: 100, t: 0 },
      [{ x: 100 + SIDE_SWIPE_CANCEL_SLOP + 4, y: 100, t: 16 }],
      false
    );
    expect(state.cancelled).toBe(true);
    expect(state.engaged).toBe(false);
  });

  it('cancels on a dominant vertical drag', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [
      { x: 104, y: 100 + SIDE_SWIPE_CANCEL_SLOP + 6, t: 16 }
    ]);
    expect(state.cancelled).toBe(true);
  });

  it('cancels on an inward (leftward) drag', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [
      { x: 100 - SIDE_SWIPE_CANCEL_SLOP - 4, y: 100, t: 16 }
    ]);
    expect(state.cancelled).toBe(true);
  });

  it('stays undecided below the slop', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [{ x: 104, y: 102, t: 16 }]);
    expect(state.engaged).toBe(false);
    expect(state.cancelled).toBe(false);
  });

  it('ignores further samples once cancelled', () => {
    let state = beginSideSwipe('right', { x: 100, y: 100, t: 0 });
    state = sideSwipeStep(state, { x: 104, y: 200, t: 16 }, true); // cancel (vertical)
    expect(state.cancelled).toBe(true);
    const after = sideSwipeStep(state, { x: 300, y: 100, t: 32 }, true);
    expect(after).toBe(state); // unchanged reference
  });
});

describe('sideSwipe state machine — LEFT overlay (closes leftward)', () => {
  it('engages and tracks offset on a leftward drag', () => {
    const state = drag('left', { x: 200, y: 100, t: 0 }, [
      { x: 200 - SIDE_SWIPE_CANCEL_SLOP - 5, y: 100, t: 16 },
      { x: 140, y: 100, t: 32 }
    ]);
    expect(state.engaged).toBe(true);
    expect(state.offset).toBe(60);
  });

  it('cancels on an inward (rightward) drag for a left overlay', () => {
    const state = drag('left', { x: 200, y: 100, t: 0 }, [
      { x: 200 + SIDE_SWIPE_CANCEL_SLOP + 4, y: 100, t: 16 }
    ]);
    expect(state.cancelled).toBe(true);
  });
});

describe('sideSwipe resolution', () => {
  it('does not close a never-engaged gesture', () => {
    const state = beginSideSwipe('right', { x: 100, y: 100, t: 0 });
    expect(resolveSideSwipe(state, { x: 100, y: 100, t: 10 }).close).toBe(false);
  });

  it('does not close a cancelled gesture', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [{ x: 104, y: 200, t: 16 }]);
    expect(resolveSideSwipe(state, { x: 104, y: 200, t: 32 }).close).toBe(false);
  });

  it('closes past the distance threshold at low velocity (right)', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [
      { x: 130, y: 100, t: 200 },
      { x: 100 + SIDE_SWIPE_CLOSE_DISTANCE + 4, y: 100, t: 600 }
    ]);
    const res = resolveSideSwipe(state, { x: 100 + SIDE_SWIPE_CLOSE_DISTANCE + 4, y: 100, t: 700 });
    expect(res.close).toBe(true);
  });

  it('closes on a fast flick even below the distance threshold (right)', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [
      { x: 120, y: 100, t: 16 },
      { x: 150, y: 100, t: 32 }
    ]);
    const dxOut = SIDE_SWIPE_CLOSE_VELOCITY * 20 + 5;
    const res = resolveSideSwipe(state, { x: 150 + dxOut, y: 100, t: 52 });
    expect(state.offset).toBeLessThan(SIDE_SWIPE_CLOSE_DISTANCE);
    expect(res.close).toBe(true);
  });

  it('closes on a fast leftward flick for a left overlay', () => {
    const state = drag('left', { x: 300, y: 100, t: 0 }, [
      { x: 280, y: 100, t: 16 },
      { x: 250, y: 100, t: 32 }
    ]);
    const dxOut = SIDE_SWIPE_CLOSE_VELOCITY * 20 + 5;
    const res = resolveSideSwipe(state, { x: 250 - dxOut, y: 100, t: 52 });
    expect(res.close).toBe(true);
  });

  it('snaps back when neither threshold is met', () => {
    const state = drag('right', { x: 100, y: 100, t: 0 }, [
      { x: 130, y: 100, t: 200 },
      { x: 140, y: 100, t: 600 }
    ]);
    const res = resolveSideSwipe(state, { x: 141, y: 100, t: 700 });
    expect(res.close).toBe(false);
  });
});
