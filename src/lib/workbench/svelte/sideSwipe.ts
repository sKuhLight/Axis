/**
 * R9c — horizontal swipe-to-close for the phone-width SIDE dock overlays.
 *
 * The left/right dock regions present on phone as partial-width side overlays
 * (not bottom sheets): the right region slides in from the right edge, the left
 * from the left. This module owns the pointer-driven swipe-to-close gesture for
 * those overlays — the natural mirror of `bottomSheet.ts`:
 *   - a RIGHT overlay closes on a rightward swipe (toward the edge it came from);
 *   - a LEFT overlay closes on a leftward swipe.
 *
 * It mirrors the (unit-tested) vertical state machine in `bottomSheet.ts` rather
 * than reusing it directly: that machine is downward-only and its 13 tests pin
 * that behaviour. Keeping a small, direction-parameterised twin here leaves the
 * bottom-sheet code untouched while sharing the same shape (begin/step/resolve),
 * the same thresholds, and the same "apply the snap/close transition via the DOM
 * style PROPERTY, never CSS" rule that keeps the `paneGeometryTransitions` guard
 * satisfied for `DockWorkspace.svelte`.
 */

/** Distance (px) past which a release closes the overlay regardless of speed. */
export const SIDE_SWIPE_CLOSE_DISTANCE = 96;
/** Outward velocity (px/ms) past which a release closes the overlay (a flick). */
export const SIDE_SWIPE_CLOSE_VELOCITY = 0.55;
/** Movement (px) along the cross axis past which we treat the drag as scroll/cancel. */
export const SIDE_SWIPE_CANCEL_SLOP = 10;

/** Which edge the overlay is anchored to; the close swipe goes toward that edge. */
export type SideSwipeSide = 'left' | 'right';

export interface SideSwipeState {
  /** The edge this overlay is anchored to; fixes the close direction. */
  side: SideSwipeSide;
  /** Pointer position at gesture start. */
  startX: number;
  startY: number;
  /** Timestamp (ms) at gesture start. */
  startT: number;
  /** Current outward offset (>= 0), measured toward the anchored edge. */
  offset: number;
  /** Last sample, for velocity on release. */
  lastX: number;
  lastT: number;
  /** True once we've decided the gesture is a legitimate horizontal swipe. */
  engaged: boolean;
  /** True once we've decided it is NOT a swipe (cross-axis / wrong direction). */
  cancelled: boolean;
}

export interface SideSwipeSample {
  x: number;
  y: number;
  t: number;
}

export function beginSideSwipe(side: SideSwipeSide, sample: SideSwipeSample): SideSwipeState {
  return {
    side,
    startX: sample.x,
    startY: sample.y,
    startT: sample.t,
    offset: 0,
    lastX: sample.x,
    lastT: sample.t,
    engaged: false,
    cancelled: false
  };
}

/**
 * Signed outward delta for the given side: positive when the finger moves toward
 * the anchored edge (right overlay -> moving right; left overlay -> moving left).
 */
function outward(side: SideSwipeSide, dx: number): number {
  return side === 'right' ? dx : -dx;
}

/**
 * Advance the swipe state with a new pointer sample.
 *
 * `scrollAtEdge` reports whether the overlay's horizontally-scrollable content is
 * already at the edge the swipe would travel toward — an outward drag only counts
 * as a close gesture when the content can't scroll further that way, so a
 * mid-scroll flick inside the panel never dismisses the overlay. Panels rarely
 * scroll horizontally, so callers typically pass `true`.
 *
 * Returns the updated state (new object; pure). Read `.offset` to position the
 * overlay and `.cancelled` to know the gesture was abandoned.
 */
export function sideSwipeStep(
  state: SideSwipeState,
  sample: SideSwipeSample,
  scrollAtEdge: boolean
): SideSwipeState {
  if (state.cancelled) return state;
  const dx = sample.x - state.startX;
  const dy = sample.y - state.startY;
  const out = outward(state.side, dx);

  // Not yet committed to a direction: decide once movement exceeds the slop.
  if (!state.engaged) {
    // Vertical-dominant movement, or any inward drag, or an outward drag that
    // begins while the content is scrolled -> this is not an overlay-close swipe.
    if (Math.abs(dy) > SIDE_SWIPE_CANCEL_SLOP && Math.abs(dy) > Math.abs(dx)) {
      return { ...state, cancelled: true };
    }
    if (out < -SIDE_SWIPE_CANCEL_SLOP) {
      return { ...state, cancelled: true };
    }
    if (out > SIDE_SWIPE_CANCEL_SLOP) {
      if (!scrollAtEdge) return { ...state, cancelled: true };
      return {
        ...state,
        engaged: true,
        offset: out,
        lastX: sample.x,
        lastT: sample.t
      };
    }
    // Below slop in every direction: hold, still undecided.
    return { ...state, lastX: sample.x, lastT: sample.t };
  }

  // Engaged: track the outward offset, clamped so the overlay can't be dragged
  // inward past its resting position.
  return {
    ...state,
    offset: Math.max(0, out),
    lastX: sample.x,
    lastT: sample.t
  };
}

export interface SideSwipeResolution {
  /** Whether the release should close the overlay. */
  close: boolean;
  /** Instantaneous outward velocity (px/ms) at release; 0 when not engaged. */
  velocity: number;
}

/**
 * Decide, on pointer release, whether the overlay should close. Closes when the
 * offset passed the distance threshold OR the release flick velocity passed the
 * velocity threshold. A cancelled or never-engaged gesture never closes.
 */
export function resolveSideSwipe(
  state: SideSwipeState,
  release: SideSwipeSample
): SideSwipeResolution {
  if (!state.engaged || state.cancelled) return { close: false, velocity: 0 };
  const dt = release.t - state.lastT;
  const dxOut = outward(state.side, release.x - state.lastX);
  const velocity = dt > 0 ? dxOut / dt : 0;
  const close = state.offset >= SIDE_SWIPE_CLOSE_DISTANCE || velocity >= SIDE_SWIPE_CLOSE_VELOCITY;
  return { close, velocity };
}

export interface SideSwipeOptions {
  /** Which edge the overlay is anchored to; sets the close direction. */
  side: SideSwipeSide;
  /** Called when the swipe crosses the close threshold. Usually the overlay's onClose. */
  onClose: () => void;
  /** When false, the action is inert (e.g. desktop-width, where overlays don't apply). */
  enabled?: boolean;
  /**
   * Optional: element whose horizontal scroll position gates the gesture.
   * Defaults to the node the action is attached to. An outward drag only becomes
   * a close swipe when this element is scrolled to the relevant edge.
   */
  scrollContainer?: () => HTMLElement | null;
}

const REST_TRANSITION = 'transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1)';
const CLOSE_TRANSITION = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';

/**
 * Svelte `use:` action for a side overlay. Attach to the overlay element:
 *   <div use:sideSwipe={{ side: 'right', onClose, enabled: isPhone }}>…</div>
 *
 * Tracks a horizontal pointer drag, translates the overlay outward toward its
 * anchored edge as the finger moves, and either closes (via `onClose`) or springs
 * back on release. Pointer capture keeps the gesture alive if the finger leaves
 * the element. All transitions are applied through the DOM style property, never
 * CSS (so the geometry-transition guard stays satisfied).
 */
export function sideSwipe(node: HTMLElement, options: SideSwipeOptions) {
  let opts = options;
  let state: SideSwipeState | null = null;
  let pointerId: number | null = null;

  function scrollHost(): HTMLElement | null {
    return opts.scrollContainer?.() ?? node;
  }

  /** True when the content can't scroll any further toward the swipe's edge. */
  function atEdge(): boolean {
    const host = scrollHost();
    if (!host) return true;
    if (opts.side === 'right') {
      // Rightward swipe: blocked only when scrolled hard against the right end.
      const max = host.scrollWidth - host.clientWidth;
      return max <= 0 || host.scrollLeft >= max - 1;
    }
    // Leftward swipe: blocked only at the left end.
    return host.scrollLeft <= 0;
  }

  /** Outward offset -> a signed translateX toward the anchored edge. */
  function translate(offset: number): string {
    if (offset <= 0) return '';
    const px = opts.side === 'right' ? offset : -offset;
    return `translateX(${px}px)`;
  }

  function apply(offset: number) {
    node.style.transition = '';
    node.style.transform = translate(offset);
  }

  function clearInline() {
    node.style.transition = '';
    node.style.transform = '';
  }

  function reset(closing: boolean) {
    if (closing) {
      node.style.transition = CLOSE_TRANSITION;
      node.style.transform = opts.side === 'right' ? 'translateX(100%)' : 'translateX(-100%)';
    } else {
      node.style.transition = REST_TRANSITION;
      node.style.transform = '';
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (opts.enabled === false) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    state = beginSideSwipe(opts.side, { x: event.clientX, y: event.clientY, t: event.timeStamp });
    pointerId = event.pointerId;
  }

  function onPointerMove(event: PointerEvent) {
    if (!state || pointerId !== event.pointerId) return;
    const next = sideSwipeStep(state, { x: event.clientX, y: event.clientY, t: event.timeStamp }, atEdge());
    if (next.engaged && !state.engaged) {
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
    }
    state = next;
    if (state.cancelled) {
      apply(0);
      return;
    }
    if (state.engaged) {
      event.preventDefault();
      apply(state.offset);
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!state || pointerId !== event.pointerId) return;
    const resolution = resolveSideSwipe(state, { x: event.clientX, y: event.clientY, t: event.timeStamp });
    const engaged = state.engaged && !state.cancelled;
    state = null;
    pointerId = null;
    try {
      node.releasePointerCapture(event.pointerId);
    } catch {
      /* no-op */
    }
    if (!engaged) {
      apply(0);
      return;
    }
    if (resolution.close) {
      reset(true);
      opts.onClose();
    } else {
      reset(false);
    }
  }

  function onPointerCancel(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    state = null;
    pointerId = null;
    reset(false);
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerCancel);

  return {
    update(next: SideSwipeOptions) {
      const wasEnabled = opts.enabled !== false;
      opts = next;
      if (opts.enabled === false) {
        if (state) {
          state = null;
          pointerId = null;
        }
        clearInline();
        return;
      }
      // Re-enabled: drop any leftover inline transform so the CSS open animation
      // plays for the next mount.
      if (!wasEnabled) clearInline();
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerCancel);
    }
  };
}
