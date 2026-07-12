/**
 * Generic LIST-REORDER drag primitive (AXIS-29 / R18).
 *
 * The R17 page reorder in the Customize drawer was a bespoke second drag
 * implementation: no travelling ghost, a drop-time-only index, its own
 * thresholds — so it FELT different from every other drag in the app, which
 * contradicts the framework goal of building an interaction ONCE. This primitive
 * replaces it by routing a list reorder through the SAME `controller.drag`
 * machinery the widget/panel drags use:
 *
 *   - it drives `controller.drag` with the `kind:'list'` state, so the
 *     `.aw-root.aw-dragging-list` body class, the DragLayer ghost (a clone of the
 *     grabbed row, anchored at the grab offset) and the in-flow dashed slot all
 *     light up exactly like a widget drag;
 *   - it shares the pointer-session core (`beginPointerDrag`) and the 5px
 *     `DRAG_THRESHOLD` with the library drag-out;
 *   - hit-testing reuses the unit-tested `listReorderInsertIndex` helper.
 *
 * The list container/rows stay the caller's concern — the caller supplies the
 * grabbed element (ghost source + geometry) and the ordered item elements to
 * hit-test, and commits the reorder with the resolved destination index.
 */
import type { WorkbenchController } from './controller.svelte';
import { listReorderInsertIndex, type WorkbenchRect } from './drag';
import { beginPointerDrag } from './dragSession';

function rectOf(el: Element): WorkbenchRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export interface ListReorderOptions {
  controller: WorkbenchController;
  event: PointerEvent;
  /** Stable id of the list (the rendered list keys its in-flow slot on this). */
  listId: string;
  /** The dragged item's id (lifted out of the flow while it travels). */
  itemId: string;
  /**
   * The grabbed row element: source of the travelling ghost (a clone) plus its
   * size (layout px, for the slot) and the pointer's grab offset (visual px, for
   * the ghost anchor). Mirrors WidgetHost's origin-rect capture.
   */
  item: HTMLElement;
  /** Ordered item elements of the list, in canonical order (dragged one included). */
  items: () => HTMLElement[];
  orientation?: 'horizontal' | 'vertical';
  /** Short label shown on the DragLayer chip while dragging. */
  targetLabel?: string;
  /** Fired once when the drag activates (e.g. to blur/close something). */
  onActivate?: () => void;
  /**
   * Commit the reorder. `toIndex` is the destination index among the list's
   * NON-dragged items — i.e. exactly what a `page.move`-style filter-then-splice
   * consumes. Not called when the item would not actually move.
   */
  commit: (toIndex: number) => void;
}

/**
 * Begin a list-reorder drag. A plain tap (never crossing the threshold) is a
 * no-op here — the caller keeps whatever click/keyboard affordance the row has.
 */
export function startListReorder(options: ListReorderOptions): void {
  const { controller, event, listId, itemId, item } = options;
  if (!controller.editMode || event.button !== 0) return;
  const orientation = options.orientation ?? 'vertical';

  // Captured at pointerdown, BEFORE the row lifts out of the flow: `size` is
  // layout px (offset*) so the in-flow slot matches the lifted row's footprint;
  // `grabOffset` is visual px (client coords) for the DragLayer ghost anchor.
  const originRect = item.getBoundingClientRect();
  const size = { width: item.offsetWidth || originRect.width, height: item.offsetHeight || originRect.height };
  const grabOffset = { x: event.clientX - originRect.left, y: event.clientY - originRect.top };
  // A static, inert visual clone of the row travels as the ghost — the framework
  // needs no knowledge of the row's markup; Svelte's scoped-style attributes ride
  // along on the clone, so it renders styled wherever DragLayer mounts it.
  const ghostEl = item.cloneNode(true) as HTMLElement;

  const resolveIndex = (x: number, y: number): number => {
    const els = options.items();
    const draggedIndex = els.indexOf(item);
    return listReorderInsertIndex({ x, y }, els.map(rectOf), draggedIndex, orientation);
  };

  beginPointerDrag({
    event,
    onActivate: options.onActivate,
    onMove: (pointer) => {
      controller.setDrag({
        kind: 'list',
        listId,
        itemId,
        startedAt: { x: event.clientX, y: event.clientY },
        pointer,
        size,
        grabOffset,
        ghostEl,
        orientation,
        targetLabel: options.targetLabel,
        listInsert: { listId, index: resolveIndex(pointer.x, pointer.y) }
      });
    },
    onDrop: (pointer) => {
      const els = options.items();
      const from = els.indexOf(item);
      const to = resolveIndex(pointer.x, pointer.y);
      controller.setDrag(null);
      // `to` is the index among survivors; `from` is the full-list index. They map
      // to the same slot only when `to === from` AND nothing before it moved —
      // for a filter-then-splice reorder, `to === from` is the identity move.
      if (from < 0 || to !== from) options.commit(to);
    }
  });
}
