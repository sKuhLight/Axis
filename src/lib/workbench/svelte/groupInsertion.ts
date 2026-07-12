import type { WorkbenchPointer, WorkbenchRect } from './drag';

/**
 * Pure insertion-index math for widget groups (design `AxisGroup.dc.html` +
 * `03-groups.md` §3). Kept framework-free and DOM-free so it is exhaustively
 * unit-testable — the Svelte hosts only feed it measured rects and a pointer.
 *
 * A group renders its members in a **horizontal flow** (dividers/placeholder
 * spliced between them). The drop lands *before* the member whose midpoint the
 * pointer has not yet crossed, or after the last member when the pointer is past
 * every midpoint. This mirrors `widgetDropIndex` but is scoped to a single
 * group's member rects and resolved against a **stable snapshot** so the
 * placeholder reflowing the members can never feed back and cause jitter (design
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

// NOTE (V14 follow-up): the first pass painted an overlay placeholder rect from
// here into DragLayer — it drew ON TOP of members without moving them apart. The
// design instead splices a REAL spacer element into the group's / zone's flex
// flow (AxisGroup `indStyle` span, shell `isGap` div) so neighbours physically
// reflow. The overlay helper was removed; the in-flow slots in
// WidgetGroupHost/WidgetZone are driven by `drag.groupInsert` /
// `drag.zoneInsert` plus the index math above.
