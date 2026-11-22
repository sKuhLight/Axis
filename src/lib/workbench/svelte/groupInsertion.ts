import type { WorkbenchPointer, WorkbenchRect } from './drag';

/**
 * Pure insertion-index math for widget groups (design `AxisGroup.dc.html` +
 * `03-groups.md` §3). Kept framework-free and DOM-free so it is exhaustively
 * unit-testable — the Svelte hosts only feed it measured rects and a pointer.
 *
 * A group renders its members in a **horizontal flow** (dividers between them).
 * The drop lands *before* the member whose midpoint the pointer has not yet
 * crossed, or after the last member when the pointer is past every midpoint.
 * This mirrors `widgetDropIndex` but is scoped to a single group's member rects
 * (the dragged member excluded). Slice 4b: used for a member reordering inside
 * its OWN group; the insert line marks the spot, nothing reflows (design
 * `_gsnap`, 03-groups §3).
 */
export function groupInsertIndex(
  pointer: WorkbenchPointer,
  memberRects: WorkbenchRect[],
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): number {
  if (memberRects.length === 0) return 0;
  const coord = orientation === 'vertical' ? pointer.y : pointer.x;
  const index = memberRects.findIndex((rect) => {
    const midpoint = orientation === 'vertical' ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    return coord < midpoint;
  });
  return index === -1 ? memberRects.length : index;
}

/**
 * The group's hit-area is the module rect expanded by 8px horizontally / 4px
 * vertically (design 03-groups §3 "Group hit-area is the module rect expanded by
 * 8px horizontally / 4px vertically"). Used to decide whether a dragged widget
 * is close enough to the module to preview an in-group insert.
 */
export function groupHitArea(moduleRect: WorkbenchRect, padX = 8, padY = 4): WorkbenchRect {
  return {
    left: moduleRect.left - padX,
    top: moduleRect.top - padY,
    width: moduleRect.width + padX * 2,
    height: moduleRect.height + padY * 2
  };
}

// NOTE (V14 follow-up → slice 4b): the first pass painted an overlay rect from
// here; V14 then spliced a widget-sized spacer into the group's / zone's flow.
// Slice 4b replaces both with a thin insert LINE (`widgetDrop.ts`
// `insertLineRect`, drawn by the DragLayer): nothing moves while dragging, and
// only a member's OWN group takes a positional insert (reorder) — a foreign
// group is grouped with by dwelling (`dwellTracker.ts`), never by a plain drop.
