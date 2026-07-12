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
      dragging = true;
      session.onActivate?.();
    }
    ev.preventDefault();
    session.onMove(pointer, ev);
  };

  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (dragging) session.onDrop({ x: ev.clientX, y: ev.clientY }, ev);
    else session.onTap?.(ev);
  };

  event.preventDefault();
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
