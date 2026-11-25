import type { DockRegionId, FloatingRect, WorkbenchCommand, WidgetZoneId } from '../core';
import type { DockDropOverlayModel } from './dockDropOverlay';

export interface WorkbenchPointer {
  x: number;
  y: number;
}

export interface WorkbenchRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The flow an insert line sits in (the line itself runs across it). */
export type InsertFlow = 'horizontal' | 'vertical';

/** Where a widget drop inserts: a thin line between units (visual px; `widgetDrop.ts` `insertLineRect`). */
export interface InsertLine {
  rect: WorkbenchRect;
  flow: InsertFlow;
}

export type WorkbenchDragState =
  | {
      kind: 'panel';
      panelId: string;
      pointer: WorkbenchPointer;
      startedAt: WorkbenchPointer;
      targetLabel?: string;
      /** Display name of the dragged panel (or library template). */
      panelLabel?: string;
      /**
       * The dock-drop overlay for this pointer position (zones, landing shape,
       * edge bars, page highlight, pointer card) — rendered by DragLayer via
       * DockDropOverlay. Absent until the session has measured the dock.
       */
      dock?: DockDropOverlayModel;
      /** Click-to-place from the Add palette (no button held): the click is the drop. */
      placement?: boolean;
    }
  | {
      kind: 'widget';
      widgetIds: string[];
      pointer: WorkbenchPointer;
      startedAt: WorkbenchPointer;
      targetLabel?: string;
      previewRect?: WorkbenchRect;
      // Overlay previews (DragLayer rects): `group` = the "Group" frame around
      // the unit a dwell armed (slice 4b); `zone` = workspace-edge new-panel
      // region. Positional inserts use `insertLine` instead.
      previewKind?: 'zone' | 'insert' | 'group';
      previewOrientation?: 'horizontal' | 'vertical';
      // Origin rect size + pointer grab offset, captured at drag start (design
      // `drag.w/h` + `offx/offy`). Sizes the in-flow slots and anchors the
      // full-size drag ghost under the pointer. Visual (client-rect) px.
      size?: { width: number; height: number };
      grabOffset?: { x: number; y: number };
      // Insertion targets (design `overZone/overIndex` and
      // `overGroup/overGroupIndex`): the hovered zone (`index` = UNIT index
      // among visible units, dragged unit excluded) or the dragged member's own
      // group (`index` among its other members). Mutually exclusive. Slice 4b:
      // nothing is spliced into the flow any more — the zone gets a drop wash,
      // the group an accent border, and `insertLine` marks the spot.
      zoneInsert?: { zone: string; index: number };
      groupInsert?: { groupId: string; index: number };
      /** The insert line (DragLayer) for `zoneInsert` / `groupInsert`. */
      insertLine?: InsertLine;
      /** Click-to-place from the Add palette (no button held): the click is the drop. */
      placement?: boolean;
    }
  | {
      // Generic LIST-REORDER drag (design nav-reorder treatment, generalised):
      // reorder an item inside an ordered list (the Customize drawer's page list
      // today). It drives the SAME machinery as the widget/panel drags — a
      // DragLayer ghost anchored at the grab offset + an in-flow dashed slot
      // spliced into the list flow — so it feels identical, instead of the R17
      // bespoke second implementation.
      kind: 'list';
      /** Which list this drag belongs to (a rendered list keys its slot on this). */
      listId: string;
      /** The dragged item's id (kept lifted/hidden in the list while travelling). */
      itemId: string;
      pointer: WorkbenchPointer;
      startedAt: WorkbenchPointer;
      targetLabel?: string;
      // Origin rect size + grab offset (design `drag.w/h` + `offx/offy`): sizes the
      // in-flow slot and anchors the full-size ghost under the pointer. Visual px.
      size?: { width: number; height: number };
      grabOffset?: { x: number; y: number };
      /**
       * Cloned DOM node of the grabbed row — DragLayer renders it as the travelling
       * ghost (the framework needs no knowledge of what a row looks like; it shows
       * whatever the caller grabbed). Transient, never persisted.
       */
      ghostEl?: HTMLElement;
      orientation?: 'horizontal' | 'vertical';
      /**
       * IN-FLOW insertion target: the list `listId` splices a dashed slot at
       * `index` — the insertion index among the list's NON-dragged items (so it
       * maps 1:1 onto a `page.move`-style filter-then-splice reorder).
       */
      listInsert?: { listId: string; index: number };
    };

/** Shared pointer-move activation threshold (px) for every workbench drag. */
export const DRAG_THRESHOLD = 5;

export interface WidgetDropIntent {
  zone: WidgetZoneId;
  index?: number;
  floatingRect?: FloatingRect;
}

export function pointerDistance(a: WorkbenchPointer, b: WorkbenchPointer): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function widgetDropCommand(widgetIds: string[], intent: WidgetDropIntent): WorkbenchCommand {
  return {
    type: 'widget.move',
    widgetIds,
    zone: intent.zone,
    index: intent.index,
    floatingRect: intent.floatingRect
  };
}

export function widgetDropIndex(pointer: WorkbenchPointer, itemRects: WorkbenchRect[], orientation: 'horizontal' | 'vertical'): number {
  if (itemRects.length === 0) return 0;
  const coord = orientation === 'vertical' ? pointer.y : pointer.x;
  const index = itemRects.findIndex((rect) => {
    const midpoint = orientation === 'vertical' ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    return coord < midpoint;
  });
  return index === -1 ? itemRects.length : index;
}

/**
 * Insertion index for a LIST-REORDER drag. Hit-test the pointer against the
 * item midpoints EXCLUDING the dragged item, yielding the destination index in
 * the REMAINING order — which is exactly what a filter-then-splice reorder
 * (`page.move`) consumes, and what the in-flow slot renders against (the dragged
 * row is lifted out of the flow, so the slot lives among the survivors). Passing
 * `draggedIndex < 0` (item not in the list) hit-tests against every rect.
 */
export function listReorderInsertIndex(
  pointer: WorkbenchPointer,
  itemRects: WorkbenchRect[],
  draggedIndex: number,
  orientation: 'horizontal' | 'vertical'
): number {
  const rest = draggedIndex >= 0 ? itemRects.filter((_, i) => i !== draggedIndex) : itemRects;
  return widgetDropIndex(pointer, rest, orientation);
}

/**
 * Collapse a zone's ordered widget list into UNIT widget-counts: consecutive
 * widgets sharing a `groupId` form one unit (the group module); everything else
 * is a single-widget unit. `excludeIds` (the dragged widgets) are removed first
 * — a fully-excluded unit disappears, a partially-excluded group just counts
 * fewer members. The result aligns 1:1 with the zone's rendered top-level units
 * (design `buildZone` raw-run grouping).
 */
export function zoneUnitWidgetCounts(
  widgets: { id: string; groupId?: string | null }[],
  excludeIds: Iterable<string> = []
): number[] {
  const excluded = new Set(excludeIds);
  const counts: number[] = [];
  const groupSlot = new Map<string, number>();
  for (const widget of widgets) {
    if (excluded.has(widget.id)) continue;
    if (widget.groupId) {
      const slot = groupSlot.get(widget.groupId);
      if (slot != null) counts[slot] += 1;
      else {
        groupSlot.set(widget.groupId, counts.length);
        counts.push(1);
      }
    } else {
      counts.push(1);
    }
  }
  return counts;
}

/**
 * Convert a UNIT insertion index (what the pointer hit-test over top-level zone
 * units yields, and where the in-flow gap renders) into the WIDGET-order index
 * the `widget.move` reducer expects: the number of widgets in every unit before
 * the insertion point (a 3-member group counts 3).
 */
export function widgetIndexForUnitIndex(unitWidgetCounts: number[], unitIndex: number): number {
  let widgets = 0;
  const end = Math.max(0, Math.min(unitIndex, unitWidgetCounts.length));
  for (let i = 0; i < end; i++) widgets += unitWidgetCounts[i];
  return widgets;
}

/**
 * A zone's units (member ids) from its ordered widget list — consecutive widgets
 * sharing a `groupId` form one unit — with `excludeIds` left out. The
 * document-side twin of the measured units (used when no DOM was measured).
 */
export function zoneUnitsFromWidgets(
  widgets: { id: string; groupId?: string | null }[],
  excludeIds: Iterable<string> = []
): { widgetIds: string[] }[] {
  const excluded = new Set(excludeIds);
  const units: { widgetIds: string[] }[] = [];
  const groupSlot = new Map<string, number>();
  for (const widget of widgets) {
    if (excluded.has(widget.id)) continue;
    const slot = widget.groupId ? groupSlot.get(widget.groupId) : undefined;
    if (slot != null) units[slot].widgetIds.push(widget.id);
    else {
      if (widget.groupId) groupSlot.set(widget.groupId, units.length);
      units.push({ widgetIds: [widget.id] });
    }
  }
  return units;
}

/**
 * Convert a UNIT insertion index into the zone's WIDGET-order index from the
 * units' member ids — not by counting: a zone may hold widgets it does not
 * render (a type the host gates off, e.g. a device without it), so counting the
 * rendered units would land one slot early past such a widget.
 *
 *   - before `units[i]`: the order index of its first member;
 *   - past the last unit: one past the last member of `units[i - 1]`;
 *   - a unit whose members are unknown is skipped (the next / previous one decides);
 *   - no unit to anchor to: the end of the zone.
 *
 * `orderedIds` is the zone's widget order as the reducer splices into it (moving
 * widgets already left out).
 */
export function widgetOrderIndexForUnits(
  orderedIds: readonly string[],
  units: ReadonlyArray<{ readonly widgetIds: readonly string[] }>,
  unitIndex: number
): number {
  const position = new Map(orderedIds.map((id, index) => [id, index]));
  const indices = (unit: { readonly widgetIds: readonly string[] }) =>
    unit.widgetIds.map((id) => position.get(id)).filter((index): index is number => index != null);
  const at = Math.max(0, Math.min(Math.trunc(unitIndex) || 0, units.length));
  for (let i = at; i < units.length; i++) {
    const found = indices(units[i]);
    if (found.length) return Math.min(...found);
  }
  for (let i = at - 1; i >= 0; i--) {
    const found = indices(units[i]);
    if (found.length) return Math.max(...found) + 1;
  }
  return orderedIds.length;
}

/**
 * Widget-order index that keeps a re-placed block ANCHORED where it currently
 * sits (design: "whole zone re-numbered with the group block anchored where it
 * currently sits"). The reducer's `placeWidgets` splices the moved ids into the
 * zone's remaining widgets at this index — so the anchor is the count of
 * non-moving widgets ordered before the block's first member.
 */
export function anchoredWidgetIndex(
  zoneWidgets: { id: string; order: number }[],
  movingIds: Iterable<string>,
  anchorOrder: number
): number {
  const moving = new Set(movingIds);
  return zoneWidgets.filter((widget) => !moving.has(widget.id) && widget.order < anchorOrder).length;
}

export function rectContainsPointer(rect: WorkbenchRect, pointer: WorkbenchPointer): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  );
}

/**
 * Resolve which widget zone a pointer is over, given each candidate zone's client
 * rect. This mirrors the DOM path (`elementFromPoint(...).closest('[data-zone]')`)
 * as a pure, testable decision: a zone is only reachable if its rect actually
 * covers the pointer. A bar zone that shrank to its content height (leaving a
 * dead strip of un-zoned bar above/below) will NOT contain a pointer aimed at
 * that strip — which is exactly the V13h bottom-bar drop regression. The zone
 * section must stretch to fill its bar for the whole visible strip to hit-test.
 * Later entries win ties so a more specific/last-painted zone takes precedence.
 */
export function zoneAtPointer(zones: { zone: WidgetZoneId; rect: WorkbenchRect }[], pointer: WorkbenchPointer): WidgetZoneId | null {
  let found: WidgetZoneId | null = null;
  for (const candidate of zones) {
    if (rectContainsPointer(candidate.rect, pointer)) found = candidate.zone;
  }
  return found;
}

/**
 * Full-region drop-highlight rect for an edge (new-panel) drop, given the
 * workspace's own client rect (T21 directive #1: the "DOCK LEFT/RIGHT/…"
 * indicator must highlight the WHOLE region frame, not a small labelled box).
 * This is the fallback the parameter-source and widget edge drops use when the
 * target region isn't docked yet, so there is no live `[data-region]` element to
 * measure — it mirrors the design's dock-preview geometry (`Axis Layout System`
 * dropStyle): left/right run the FULL height at a sensible column width;
 * top/bottom span the FULL width at a sensible band height; main fills the
 * workspace. Pure (rect-in → rect-out) so the geometry is unit-tested; the live
 * region rect, when present, is preferred by the caller.
 */
export function defaultRegionBand(region: DockRegionId, workspace: WorkbenchRect): WorkbenchRect {
  const columnWidth = Math.max(180, Math.min(workspace.width * 0.28, 340));
  const bandHeight = Math.max(140, Math.min(workspace.height * 0.32, 260));
  switch (region) {
    case 'left':
      return { left: workspace.left, top: workspace.top, width: columnWidth, height: workspace.height };
    case 'right':
      return { left: workspace.left + workspace.width - columnWidth, top: workspace.top, width: columnWidth, height: workspace.height };
    case 'top':
      return { left: workspace.left, top: workspace.top, width: workspace.width, height: bandHeight };
    case 'bottom':
      return { left: workspace.left, top: workspace.top + workspace.height - bandHeight, width: workspace.width, height: bandHeight };
    default:
      return { left: workspace.left, top: workspace.top, width: workspace.width, height: workspace.height };
  }
}

/**
 * DOM helper: the full-region highlight rect for an edge drop. Prefers the live
 * docked region element (`.aw-workspace [data-region="…"]`) so the highlight
 * exactly wraps the region already on screen; falls back to `defaultRegionBand`
 * (a full-cross-axis band on the target edge) when that region has no panels
 * yet (an empty side region is only a slim edit-mode strip). Shared by the parameter-source edge drop (DockWorkspace) and the widget
 * new-panel edge drop (WidgetHost) so both read identically. Returns null only
 * when the workspace itself can't be measured.
 */
export function fullRegionHighlightRect(region: DockRegionId): WorkbenchRect | null {
  if (typeof document === 'undefined') return null;
  const workspaceEl = document.querySelector<HTMLElement>('.aw-workspace');
  if (!workspaceEl) return null;
  const ws = workspaceEl.getBoundingClientRect();
  if (ws.width <= 0 || ws.height <= 0) return null;
  const workspace: WorkbenchRect = { left: ws.left, top: ws.top, width: ws.width, height: ws.height };
  const regionEl = workspaceEl.querySelector<HTMLElement>(`[data-region="${region}"]`);
  // An EMPTY side region renders as a slim edit-mode strip: its rect is not the
  // area a new panel will get, so fall back to the default band for it.
  if (regionEl && !(region !== 'main' && regionEl.classList.contains('empty'))) {
    const r = regionEl.getBoundingClientRect();
    if (r.width > 8 && r.height > 8) return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return defaultRegionBand(region, workspace);
}
