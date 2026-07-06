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

/**
 * Compute the widget-sized dashed placeholder rect for an in-group insert at
 * `index` (design `indStyle`: a **ghost-sized** slot, not a thin line). The slot
 * sits *before* member[index], or after the last member when `index ===
 * members.length`. Its position follows the neighbouring member's rect; its size
 * is the dragged unit's own rect (`ghost`) so the preview reads as "the widget
 * lands here" (03-groups §3).
 *
 * Returns null when there is nothing to anchor against (empty group).
 */
export function groupPlaceholderRect(
  index: number,
  memberRects: WorkbenchRect[],
  ghost: { width: number; height: number },
  gap = 4
): WorkbenchRect | null {
  const width = ghost.width > 0 ? ghost.width : 90;
  const height = ghost.height > 0 ? ghost.height : 38;
  if (memberRects.length === 0) return null;

  if (index <= 0) {
    const first = memberRects[0];
    return {
      left: first.left - gap - width,
      top: first.top + first.height / 2 - height / 2,
      width,
      height
    };
  }
  if (index >= memberRects.length) {
    const last = memberRects[memberRects.length - 1];
    return {
      left: last.left + last.width + gap,
      top: last.top + last.height / 2 - height / 2,
      width,
      height
    };
  }
  // Between member[index-1] and member[index]: centre the slot on the gap
  // midpoint so it reads as "here, between these two".
  const before = memberRects[index - 1];
  const after = memberRects[index];
  const mid = (before.left + before.width + after.left) / 2;
  return {
    left: mid - width / 2,
    top: after.top + after.height / 2 - height / 2,
    width,
    height
  };
}
