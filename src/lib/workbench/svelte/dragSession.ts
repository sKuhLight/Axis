/**
 * The shared low-level pointer-drag session core.
 *
 * Every workbench drag that starts from a `pointerdown` follows the same shape:
 * remember the start point, wait until the pointer moves past a threshold before
 * treating it as a drag (so a plain tap is never a drag), then stream moves and
 * fire once on release. This module is that shape, extracted once so the
 * library drag-OUT sessions (`libraryDrag.ts`) and the list-reorder primitive
 * (`listReorderDrag.ts`) share a single implementation instead of each hand-
 * rolling the window listeners + threshold bookkeeping. (WidgetHost's in-layout
 * widget drag is the original template this was extracted from; it stays inline
 * because it interleaves group/zone/edge hit-tests mid-move, but it uses the same
 * `DRAG_THRESHOLD` + `pointerDistance` primitives and the same DragLayer state.)
 */
import { DRAG_THRESHOLD, pointerDistance, type WorkbenchPointer } from './drag';

export interface PointerDragSession {
  event: PointerEvent;
  /** Activation threshold in px (defaults to the shared `DRAG_THRESHOLD`). */
  threshold?: number;
  /** Fired once, the instant the pointer crosses the threshold. */
  onActivate?: () => void;
  /** Streamed on every move AFTER activation (never before). */
  onMove: (pointer: WorkbenchPointer, event: PointerEvent) => void;
  /** Fired once on release, only if the session actually activated (dragged). */
  onDrop: (pointer: WorkbenchPointer, event: PointerEvent) => void;
  /** Fired once on release when the pointer never crossed the threshold (a tap). */
  onTap?: (event: PointerEvent) => void;
  /**
   * Fired once on `pointercancel` (touch scroll takeover, OS/browser gesture interruption, ...)
   * — or on Escape when `cancelOnEscape` is set — INSTEAD OF `onDrop`/`onTap`, for callers that
   * need to reset state the drag set up mid-gesture.
   */
  onCancel?: (reason: 'pointercancel' | 'escape') => void;
  /**
   * Escape during an ACTIVE drag cancels it (listeners torn down, `onCancel('escape')`). The key
   * event is consumed (capture phase) so no other Escape handler also reacts. A press that has
   * not crossed the threshold yet ignores Escape.
   */
  cancelOnEscape?: boolean;
  /**
   * Asked once, the moment the pointer crosses the threshold: may this press
   * become a drag? `false` abandons the session silently (listeners torn down,
   * nothing fires) — e.g. a touch swipe that is a native scroll
   * (`sidewaysTouchDragGate`).
   */
  shouldActivate?: (from: WorkbenchPointer, to: WorkbenchPointer) => boolean;
}

/**
 * Touch / pen presses on something that sits in a vertical scroller (the Add
 * palette's card grid): only a mostly SIDEWAYS pull starts a drag; a vertical
 * swipe stays the native scroll (pair it with `touch-action: pan-y`, so the
 * browser leaves sideways moves to the page). A mouse press drags in any
 * direction (no gate).
 */
export function sidewaysTouchDragGate(pointerType: string | undefined): ((from: WorkbenchPointer, to: WorkbenchPointer) => boolean) | undefined {
  if (!pointerType || pointerType === 'mouse') return undefined;
  return (from, to) => Math.abs(to.x - from.x) > Math.abs(to.y - from.y);
}

/**
 * Begin a pointer-drag session on `window`. The listeners live on `window` (not
 * the source element) so the drag survives the source unmounting mid-drag (e.g.
 * the drawer auto-collapsing on a drag-out). Left-button only.
 */
export function beginPointerDrag(session: PointerDragSession): void {
  const { event } = session;
  if (event.button !== 0) return;
  const threshold = session.threshold ?? DRAG_THRESHOLD;
  const startedAt: WorkbenchPointer = { x: event.clientX, y: event.clientY };
  let dragging = false;

  const onMove = (ev: PointerEvent) => {
    const pointer: WorkbenchPointer = { x: ev.clientX, y: ev.clientY };
    if (!dragging && pointerDistance(startedAt, pointer) < threshold) return;
    if (!dragging) {
      if (session.shouldActivate && !session.shouldActivate(startedAt, pointer)) {
        teardown();
        return;
      }
      dragging = true;
      session.onActivate?.();
    }
    ev.preventDefault();
    session.onMove(pointer, ev);
  };

  const teardown = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    if (session.cancelOnEscape) window.removeEventListener('keydown', onKey, true);
  };

  const onUp = (ev: PointerEvent) => {
    teardown();
    if (dragging) session.onDrop({ x: ev.clientX, y: ev.clientY }, ev);
    else session.onTap?.(ev);
  };

  // pointercancel fires no pointerup, so without this the listeners above would stay attached
  // forever and a later, unrelated pointerup anywhere would run the drop/tap action — tear down and
  // bail on cancel instead, firing neither.
  const onCancel = () => {
    teardown();
    session.onCancel?.('pointercancel');
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !dragging) return;
    ev.preventDefault();
    ev.stopPropagation();
    teardown();
    session.onCancel?.('escape');
  };

  event.preventDefault();
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  if (session.cancelOnEscape) window.addEventListener('keydown', onKey, true);
}
