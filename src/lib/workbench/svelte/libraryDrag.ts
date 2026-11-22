/**
 * Drag-OUT sessions for the Customize drawers (R17 / AXIS-26).
 *
 * The design (Axis Layout System.dc.html `startLibDrag` → `activateLibDrag`) lets
 * a library row be DRAGGED onto the layout and dropped exactly where wanted,
 * instead of only tapped to a default zone. This module ports that as a
 * self-contained, create-ON-DROP pointer session:
 *
 *   - Nothing is instantiated until the pointer is released over a valid target,
 *     so a cancelled drag never leaves an orphan widget/panel behind.
 *   - It reuses the SAME visual machinery as the in-layout drags: it drives
 *     `controller.drag` so the `.aw-root.aw-dragging-*` classes, the in-flow zone
 *     slot (WidgetZone `zoneInsert`) and the DragLayer chip light up for widgets;
 *     panels run the tab drag's dock-drop session (`panelDrag.ts`: five zones,
 *     tab bar, edges, empty regions, landing shape). The travelling widget ghost
 *     is absent (no instance exists yet) — the chip carries the feedback.
 *   - Widget hit-testing mirrors WidgetHost.widgetDropAt (elementFromPoint →
 *     closest('[data-zone]')), and the unit→widget index conversion delegates to
 *     the unit-tested helpers in `drag.ts`.
 *
 * The session lives on `window` listeners (independent of the drawer's Svelte
 * lifecycle) so the drawer can auto-collapse the instant the drag activates
 * (design closes `libOpen`) without tearing the drag down.
 */
import { selectVisibleWidgetsByZone, type DockRegionId, type DockTarget, type WorkbenchCommand } from '../core';
import type { WorkbenchController } from './controller.svelte';
import {
  widgetDropIndex,
  widgetIndexForUnitIndex,
  zoneUnitWidgetCounts,
  type WorkbenchRect
} from './drag';
import { beginPointerDrag } from './dragSession';
import { dockTargetFor } from './dockDropTarget';
import { beginDockDropSession, type DockDropCommitResult } from './panelDrag';

/** A widget id no live widget can hold — marks the drag as a not-yet-created item. */
const DRAG_OUT_WIDGET_ID = '__aw-drag-out__';
/** A panel id no live panel can hold. */
const DRAG_OUT_PANEL_ID = '__aw-drag-out__';

function rectOf(el: Element): WorkbenchRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Top-level (non-nested) widget/group unit elements inside a zone element. */
function zoneUnitEls(zoneEl: HTMLElement): HTMLElement[] {
  return Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-widget-host], [data-widget-group]')).filter((item) => {
    // A group member host is nested inside a `[data-widget-group]` — not a unit.
    return !(item.dataset.widget != null && item.closest('[data-widget-group]'));
  });
}

/**
 * Resolve the widget zone + insertion index under a pointer. Returns the UNIT
 * index (what the in-flow slot renders against) and the WIDGET-order index (what
 * a `widget.add` / `widget.move` expects). `floating`/`hidden` are not drop-out
 * targets.
 */
function resolveWidgetDrop(
  controller: WorkbenchController,
  x: number,
  y: number
): { zone: string; unitIndex: number; widgetIndex: number } | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const zoneEl = el?.closest<HTMLElement>('[data-zone]');
  const zone = zoneEl?.dataset.zone;
  if (!zone || !zoneEl || zone === 'floating' || zone === 'hidden') return null;
  const orientation = zone === 'rail' ? 'vertical' : 'horizontal';
  const unitIndex = widgetDropIndex({ x, y }, zoneUnitEls(zoneEl).map(rectOf), orientation);
  const counts = zoneUnitWidgetCounts(selectVisibleWidgetsByZone(controller.document, zone));
  return { zone, unitIndex, widgetIndex: widgetIndexForUnitIndex(counts, unitIndex) };
}

export interface WidgetDragOutOptions {
  controller: WorkbenchController;
  event: PointerEvent;
  /** Ghost/slot size (design library widget = 150×40). */
  size?: { width: number; height: number };
  /** Fired once when the drag crosses the threshold (e.g. collapse the drawer). */
  onActivate?: () => void;
  /** Commands to run on a valid drop — the caller instantiates at the target. */
  commit: (drop: { zone: string; index: number }) => WorkbenchCommand[] | null;
}

/**
 * Begin a widget drag-OUT. A plain tap (never crossing the threshold) does
 * nothing here — the row's own `onclick` handles the tap-to-add fallback.
 */
export function startWidgetDragOut(options: WidgetDragOutOptions): void {
  const { controller, event, commit } = options;
  if (!controller.editMode || event.button !== 0) return;
  const size = options.size ?? { width: 150, height: 40 };
  const startedAt = { x: event.clientX, y: event.clientY };

  beginPointerDrag({
    event,
    onActivate: options.onActivate,
    onMove: (pointer) => {
      const drop = resolveWidgetDrop(controller, pointer.x, pointer.y);
      controller.setDrag({
        kind: 'widget',
        widgetIds: [DRAG_OUT_WIDGET_ID],
        startedAt,
        pointer,
        size,
        targetLabel: drop ? drop.zone : undefined,
        zoneInsert: drop ? { zone: drop.zone, index: drop.unitIndex } : undefined
      });
    },
    onDrop: (pointer) => {
      const drop = resolveWidgetDrop(controller, pointer.x, pointer.y);
      if (drop) {
        const commands = commit({ zone: drop.zone, index: drop.widgetIndex });
        if (commands && commands.length) controller.dispatchMany(commands);
      }
      controller.setDrag(null);
    },
    // An interrupted gesture (pointercancel) must not leave the drag ghost stuck on screen.
    onCancel: () => controller.setDrag(null)
  });
}

export interface PanelDragOutOptions {
  controller: WorkbenchController;
  event: PointerEvent;
  onActivate?: () => void;
  /** Template title for the pointer card / landing label. */
  label?: string;
  /**
   * Commands to run on a valid drop. `target` is the exact dock placement (a
   * zone split, a tab at an index, an edge / empty region); `region` is the
   * region it lands in (kept for callers that only place by region).
   */
  commit: (drop: { region: DockRegionId; target: DockTarget }) => WorkbenchCommand[] | null;
}

/**
 * Begin a panel drag-OUT. Same targets as a tab drag (five zones, tab bar,
 * edges, empty regions — nav pages are skipped) and the same overlay, but
 * nothing is lifted: the source is a template, instantiated only on drop.
 * Tap fallback is the row's onclick.
 */
export function startPanelDragOut(options: PanelDragOutOptions): void {
  const { controller, event, commit } = options;
  if (!controller.editMode || event.button !== 0) return;
  beginDockDropSession({
    controller,
    event,
    draggedPanelId: DRAG_OUT_PANEL_ID,
    panelLabel: options.label ?? 'Panel',
    lift: false,
    pages: false,
    onActivate: options.onActivate,
    commit: (target) => {
      const to = dockTargetFor(target);
      if (!to || target.kind === 'page') return false;
      return commitPanelDragOut(controller, commit({ region: target.region, target: to }));
    }
  });
}

/**
 * Dispatch a drag-out drop's commands as ONE batch. Nothing to run counts as
 * cancelled (`false`); a batch the reducer refuses keeps its error on
 * `lastResult` — the edit bar shows it — and reports `'refused'` (not "Drag
 * cancelled"). The panel catalog cannot produce a refusal any more (single
 * instances are moved, never copied), so this path is covered by unit tests.
 */
export function commitPanelDragOut(controller: WorkbenchController, commands: WorkbenchCommand[] | null): DockDropCommitResult {
  if (!commands || !commands.length) return false;
  return controller.dispatchMany(commands).success ? true : 'refused';
}
