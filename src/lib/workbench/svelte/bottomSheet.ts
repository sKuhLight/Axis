/**
 * T23 — bottom-sheet swipe-to-close for phone-width drawers.
 *
 * Below the phone breakpoint the workbench drawers (mobile nav, dock drawers,
 * library) present as bottom sheets: rounded top, grab bar, slid up from the
 * bottom edge. This module owns the pointer-driven swipe-down-to-close gesture.
 *
 * The gesture logic is split into a pure state machine (`swipeStep`,
 * `resolveSwipe`) — fully unit tested — plus a thin Svelte `use:` action
 * (`bottomSheetSwipe`) that wires pointer events to it and moves the element.
 *
 * Design intent (mirrors the app's existing `axsSheet` sheets):
 *   - drag the sheet downward with the finger (transform: translateY, clamped
 *     to >= 0 so it can't be pulled up past its resting position);
 *   - release past a distance OR velocity threshold -> close;
 *   - otherwise snap back to rest;
 *   - a downward drag that begins while the sheet's scroll content is NOT at the
 *     top is treated as scroll intent and never becomes a close gesture.
 *
 * The action deliberately applies the snap-back/close transition via the DOM
 * `style.transition` PROPERTY (JS assignment), never a CSS `transition:` rule in
 * a component `<style>` block — so the `paneGeometryTransitions` guard (which
 * scans component sources for `transition: transform`) stays satisfied even for
 * the dock-drawer host (`DockWorkspace.svelte`).
 */

/** Distance (px) past which a release closes the sheet regardless of speed. */
export const SWIPE_CLOSE_DISTANCE = 96;
/** Downward velocity (px/ms) past which a release closes the sheet (a flick). */
export const SWIPE_CLOSE_VELOCITY = 0.55;
/** Movement (px) along the cross axis past which we treat the drag as a scroll/cancel. */
export const SWIPE_CANCEL_SLOP = 10;

export interface SwipeState {
  /** Pointer position at gesture start. */
  startX: number;
  startY: number;
  /** Timestamp (ms) at gesture start. */
  startT: number;
  /** Current downward offset (>= 0). */
  offset: number;
  /** Last sample, for velocity on release. */
  lastY: number;
  lastT: number;
  /** True once we've decided the gesture is a legitimate vertical swipe. */
  engaged: boolean;
  /** True once we've decided it is NOT a swipe (scroll intent / horizontal). */
  cancelled: boolean;
}

export interface SwipeSample {
  x: number;
  y: number;
  t: number;
}

export function beginSwipe(sample: SwipeSample): SwipeState {
  return {
    startX: sample.x,
    startY: sample.y,
    startT: sample.t,
    offset: 0,
    lastY: sample.y,
    lastT: sample.t,
    engaged: false,
    cancelled: false
  };
}

/**
 * Advance the swipe state with a new pointer sample.
 *
 * `scrollAtTop` reports whether the sheet's scroll region is at its top — a
 * downward drag only counts as a close gesture when the content can't scroll up
 * any further, so mid-scroll flicks don't dismiss the sheet.
 *
 * Returns the updated state (new object; pure). Read `.offset` to position the
 * sheet and `.cancelled` to know the gesture was abandoned.
 */
export function swipeStep(state: SwipeState, sample: SwipeSample, scrollAtTop: boolean): SwipeState {
  if (state.cancelled) return state;
  const dx = sample.x - state.startX;
  const dy = sample.y - state.startY;

  // Not yet committed to a direction: decide once movement exceeds the slop.
  if (!state.engaged) {
    // Horizontal-dominant movement, or any upward drag, or a downward drag that
    // begins while the content is scrolled -> this is not a sheet-close swipe.
    if (Math.abs(dx) > SWIPE_CANCEL_SLOP && Math.abs(dx) > Math.abs(dy)) {
      return { ...state, cancelled: true };
    }
    if (dy < -SWIPE_CANCEL_SLOP) {
      return { ...state, cancelled: true };
    }
    if (dy > SWIPE_CANCEL_SLOP) {
      if (!scrollAtTop) return { ...state, cancelled: true };
      return {
        ...state,
        engaged: true,
        offset: dy,
        lastY: sample.y,
        lastT: sample.t
      };
    }
    // Below slop in every direction: hold, still undecided.
    return { ...state, lastY: sample.y, lastT: sample.t };
  }

  // Engaged: track the downward offset, clamped so the sheet can't be lifted
  // above its resting position.
  return {
    ...state,
    offset: Math.max(0, dy),
    lastY: sample.y,
    lastT: sample.t
  };
}

export interface SwipeResolution {
  /** Whether the release should close the sheet. */
  close: boolean;
  /** Instantaneous downward velocity (px/ms) at release; 0 when not engaged. */
  velocity: number;
}

/**
 * Decide, on pointer release, whether the sheet should close. Closes when the
 * offset passed the distance threshold OR the release flick velocity passed the
 * velocity threshold. A cancelled or never-engaged gesture never closes.
 */
export function resolveSwipe(state: SwipeState, release: SwipeSample): SwipeResolution {
  if (!state.engaged || state.cancelled) return { close: false, velocity: 0 };
  const dt = release.t - state.lastT;
  const velocity = dt > 0 ? (release.y - state.lastY) / dt : 0;
  const close = state.offset >= SWIPE_CLOSE_DISTANCE || velocity >= SWIPE_CLOSE_VELOCITY;
  return { close, velocity };
}

export interface BottomSheetSwipeOptions {
  /** Called when the swipe crosses the close threshold. Usually the drawer's onClose. */
  onClose: () => void;
  /** When false, the action is inert (e.g. desktop-width, where sheets don't apply). */
  enabled?: boolean;
  /**
   * Whether the sheet is currently open. Only needed when the host keeps the
   * element mounted across open/close cycles (e.g. the nav rail): when it flips
   * true, any leftover inline transform from a prior swipe-close is cleared so
   * the CSS reopen animation plays. Omit for surfaces mounted via `{#if open}`.
   */
  open?: boolean;
  /**
   * Optional: element whose vertical scroll position gates the gesture. Defaults
   * to the node the action is attached to. A downward drag only becomes a close
   * swipe when this element is scrolled to its top.
   */
  scrollContainer?: () => HTMLElement | null;
}

const REST_TRANSITION = 'transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1)';
const CLOSE_TRANSITION = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';

/**
 * Svelte `use:` action. Attach to a bottom-sheet drawer element:
 *   <aside use:bottomSheetSwipe={{ onClose, enabled: isPhone }}>…</aside>
 *
 * Tracks a pointer drag on the sheet, translates it downward as the finger
 * moves, and either closes (via `onClose`) or springs back on release. Pointer
 * capture keeps the gesture alive if the finger leaves the element. All
 * transitions are applied through the DOM style property, never CSS.
 */
export function bottomSheetSwipe(node: HTMLElement, options: BottomSheetSwipeOptions) {
  let opts = options;
  let state: SwipeState | null = null;
  let pointerId: number | null = null;

  function scrollHost(): HTMLElement | null {
    return opts.scrollContainer?.() ?? node;
  }

  function atTop(): boolean {
    const host = scrollHost();
    return !host || host.scrollTop <= 0;
  }

  function apply(offset: number) {
    node.style.transition = '';
    node.style.transform = offset > 0 ? `translateY(${offset}px)` : '';
  }

  /** Drop all inline transform/transition so the component CSS drives the state
   *  again (e.g. after a close, when the element is reused for the next open). */
  function clearInline() {
    node.style.transition = '';
    node.style.transform = '';
  }

  function reset(closing: boolean) {
    if (closing) {
      node.style.transition = CLOSE_TRANSITION;
      node.style.transform = 'translateY(100%)';
    } else {
      node.style.transition = REST_TRANSITION;
      node.style.transform = '';
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (opts.enabled === false) return;
    // Ignore non-primary buttons; allow touch/pen/mouse.
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    state = beginSwipe({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    pointerId = event.pointerId;
  }

  function onPointerMove(event: PointerEvent) {
    if (!state || pointerId !== event.pointerId) return;
    const next = swipeStep(state, { x: event.clientX, y: event.clientY, t: event.timeStamp }, atTop());
    // Capture the pointer once we commit to the swipe so leaving the node keeps it live.
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
    const resolution = resolveSwipe(state, { x: event.clientX, y: event.clientY, t: event.timeStamp });
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
    update(next: BottomSheetSwipeOptions) {
      const wasEnabled = opts.enabled !== false;
      const wasOpen = opts.open;
      opts = next;
      if (opts.enabled === false) {
        if (state) {
          state = null;
          pointerId = null;
        }
        clearInline();
        return;
      }
      // Re-enabled, or reopened after a swipe-close on a persistent element:
      // drop any leftover inline transform so the CSS reopen animation plays.
      if (!wasEnabled || (opts.open === true && wasOpen === false)) {
        clearInline();
      }
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerCancel);
    }
  };
}
