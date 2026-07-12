import type { DockAxis, DockRegionId, DockTarget, FloatingRect, WorkbenchCommand, WidgetZoneId } from '../core';

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

export type WorkbenchDragState =
  | {
      kind: 'panel';
      panelId: string;
      pointer: WorkbenchPointer;
      startedAt: WorkbenchPointer;
      targetLabel?: string;
      previewRect?: WorkbenchRect;
      previewKind?: 'region' | 'tab' | 'split';
    }
  | {
      kind: 'widget';
      widgetIds: string[];
      pointer: WorkbenchPointer;
      startedAt: WorkbenchPointer;
      targetLabel?: string;
      previewRect?: WorkbenchRect;
      // Overlay previews (DragLayer rects): `group` = whole-target highlight for
      // group CREATE; `zone` = workspace-edge new-panel region. Positional
      // inserts do NOT use overlay rects — they render IN-FLOW via
      // `zoneInsert`/`groupInsert` below so neighbours actually reflow.
      previewKind?: 'zone' | 'insert' | 'group';
      previewOrientation?: 'horizontal' | 'vertical';
      // Origin rect size + pointer grab offset, captured at drag start (design
      // `drag.w/h` + `offx/offy`). Sizes the in-flow slots and anchors the
      // full-size drag ghost under the pointer. Visual (client-rect) px.
      size?: { width: number; height: number };
      grabOffset?: { x: number; y: number };
      // IN-FLOW insertion targets (design `overZone/overIndex` and
      // `overGroup/overGroupIndex`): the hovered zone splices a real dashed
      // spacer element at `index` (UNIT index among visible units, dragged unit
      // excluded); the hovered group splices the slot between members at
      // `index`. Mutually exclusive — a group hover suppresses the zone gap
      // (design `!drag.overGroup && !drag.overUnit`).
      zoneInsert?: { zone: string; index: number };
      groupInsert?: { groupId: string; index: number };
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

export type PanelDropIntent =
  | { kind: 'region'; region: DockRegionId; index?: number }
  | { kind: 'tab'; tabStackId: string; index?: number }
  | { kind: 'split'; region?: DockRegionId; targetPanelId?: string; axis: DockAxis; position: 'before' | 'after' };

export interface WidgetDropIntent {
  zone: WidgetZoneId;
  index?: number;
  floatingRect?: FloatingRect;
}

export function pointerDistance(a: WorkbenchPointer, b: WorkbenchPointer): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function splitIntentFromRect(
  pointer: WorkbenchPointer,
  rect: WorkbenchRect,
  targetPanelId: string,
  region?: DockRegionId
): Extract<PanelDropIntent, { kind: 'split' }> | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (pointer.x - rect.left) / rect.width;
  const y = (pointer.y - rect.top) / rect.height;
  const edge = 0.24;
  if (x < edge) return { kind: 'split', region, targetPanelId, axis: 'horizontal', position: 'before' };
  if (x > 1 - edge) return { kind: 'split', region, targetPanelId, axis: 'horizontal', position: 'after' };
  if (y < edge) return { kind: 'split', region, targetPanelId, axis: 'vertical', position: 'before' };
  if (y > 1 - edge) return { kind: 'split', region, targetPanelId, axis: 'vertical', position: 'after' };
  return null;
}

export function panelDropCommand(panelId: string, intent: PanelDropIntent): WorkbenchCommand {
  if (intent.kind === 'tab') return { type: 'panel.move', panelId, to: { kind: 'tab', tabStackId: intent.tabStackId, index: intent.index } };
  if (intent.kind === 'split') {
    return {
      type: 'panel.move',
      panelId,
      to: {
        kind: 'split',
        region: intent.region,
        targetPanelId: intent.targetPanelId,
        axis: intent.axis,
        position: intent.position
      }
    };
  }
  return { type: 'panel.move', panelId, to: { kind: 'region', region: intent.region, index: intent.index } };
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

export function dockTargetLabel(intent: PanelDropIntent): string {
  if (intent.kind === 'tab') return 'Tab panel';
  if (intent.kind === 'split') return `Split ${intent.position}`;
  return `Dock ${intent.region}`;
}
