/**
 * The in-layout widget drag (slice 4b) — one session for a loose widget, a
 * grouped member and a whole group (WidgetHost / WidgetGroupHost).
 *
 * Every move measures the DOM under the pointer and resolves the drop by the
 * fixed order in `widgetDrop.ts`: a dwell armed on a foreign unit groups, the
 * member's own group reorders directly, a zone inserts (insert LINE, no slot
 * box), the workspace edge opens a new custom panel. The dwell itself is the
 * pure `dwellTracker.ts`; this session only owns its deadline timer, so the
 * "Group" frame appears while the pointer rests without moving.
 *
 * One drop = one dispatch (one undo step). Escape or a pointercancel aborts.
 */
import { createCustomPanelFromWidgetsCommands, widgetZoneLabel, type DockRegionId, type WorkbenchCommand } from '../core';
import type { WorkbenchController } from './controller.svelte';
import { fullRegionHighlightRect, rectContainsPointer, widgetDropIndex, type InsertLine, type WorkbenchPointer, type WorkbenchRect } from './drag';
import { beginPointerDrag } from './dragSession';
import { createDwellTracker, type DwellConfig } from './dwellTracker';
import { groupHitArea, groupInsertIndex } from './groupInsertion';
import { measureZoneUnits, zoneFlow, zoneInsertLine } from './libraryDrag';
import {
  dwellCandidateAt,
  inflateRect,
  insertLineRect,
  reorderMemberOrder,
  resolveWidgetDropOrder,
  widgetDropLabel,
  widgetGroupWithCommand,
  widgetInsertCommand,
  widgetReorderInGroupCommand,
  widgetUnitLabel,
  widgetUnitLocked,
  type MeasuredWidgetUnit,
  type WidgetDropDecision
} from './widgetDrop';

/** The Group frame sits this far outside the unit it groups with. */
const GROUP_FRAME_INSET_PX = 6;

export interface WidgetDragSessionOptions {
  controller: WorkbenchController;
  event: PointerEvent;
  /** The widgets that travel: one widget, or every member of a dragged group. */
  widgetIds: string[];
  /**
   * The dragged unit's own key — its widget id, or its group id for a whole
   * group AND for a grouped member. Never a dwell target.
   */
  ownUnitKey: string;
  /** A grouped member's group: dropping inside it reorders directly. */
  reorderGroupId?: string | null;
  /** Origin size (layout px) and grab offset (visual px) for the ghost. */
  size: { width: number; height: number };
  grabOffset: { x: number; y: number };
  /** A press that never became a drag. */
  onTap: () => void;
  /** Host catalog labels for the chip ("Group with Tuner"). */
  typeLabel?: (type: string) => string | undefined;
  /** Clock + dwell config (tests / tuning). */
  now?: () => number;
  dwell?: DwellConfig;
}

interface Evaluation {
  decision: WidgetDropDecision | null;
  line: InsertLine | null;
  groupFrame: WorkbenchRect | null;
  edgeRect: WorkbenchRect | null;
}

function rectOf(el: Element): WorkbenchRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Workspace edge band (18 %) → new custom panel; the highlight is the whole region frame. */
function workspaceEdgeAt(x: number, y: number): { region: DockRegionId; rect: WorkbenchRect } | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const workspace = el?.closest<HTMLElement>('.aw-workspace');
  if (!workspace) return null;
  const rect = workspace.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const nx = (x - rect.left) / rect.width;
  const ny = (y - rect.top) / rect.height;
  const edge = 0.18;
  let region: DockRegionId | null = null;
  if (nx < edge) region = 'left';
  else if (nx > 1 - edge) region = 'right';
  else if (ny < edge) region = 'top';
  else if (ny > 1 - edge) region = 'bottom';
  if (!region) return null;
  return { region, rect: fullRegionHighlightRect(region) ?? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
}

/** Begin a widget drag from a pointerdown on a widget's drag surface or a group grip. */
export function beginWidgetDrag(options: WidgetDragSessionOptions): void {
  const { controller, widgetIds } = options;
  if (!controller.editMode) return;
  const now = options.now ?? (() => performance.now());
  const dwell = createDwellTracker({ now, config: options.dwell });
  const startedAt: WorkbenchPointer = { x: options.event.clientX, y: options.event.clientY };
  let last: WorkbenchPointer | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let live = true;

  const clearTimer = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };

  /** The member's own group under the pointer (its hit area is ±8 / ±4 px). */
  const reorderAt = (pointer: WorkbenchPointer): { decision: { groupId: string; index: number; memberOrder: string[] }; line: InsertLine | null } | null => {
    const groupId = options.reorderGroupId;
    const group = groupId ? controller.activeLayout?.widgetGroups[groupId] : undefined;
    if (!groupId || !group || group.locked) return null;
    const groupEl = document.querySelector<HTMLElement>(`[data-widget-group="${CSS.escape(groupId)}"]`);
    if (!groupEl) return null;
    const moduleRect = rectOf(groupEl);
    if (moduleRect.width <= 0 || moduleRect.height <= 0) return null;
    if (!rectContainsPointer(groupHitArea(moduleRect), pointer)) return null;
    const moving = new Set(widgetIds);
    const members = group.widgetIds
      .filter((id) => !moving.has(id))
      .map((id) => {
        const el = groupEl.querySelector<HTMLElement>(`[data-widget="${CSS.escape(id)}"]`);
        return el ? rectOf(el) : null;
      })
      .filter((rect): rect is WorkbenchRect => !!rect && rect.width > 0);
    const index = groupInsertIndex(pointer, members, 'horizontal');
    const rect = insertLineRect(members, index, 'horizontal');
    return {
      decision: { groupId, index, memberOrder: reorderMemberOrder(group.widgetIds, widgetIds, index) },
      line: rect ? { rect, flow: 'horizontal' } : null
    };
  };

  const evaluate = (pointer: WorkbenchPointer): Evaluation => {
    const layout = controller.activeLayout;
    const el = document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>('[data-zone]') ?? null;
    const zone = zoneEl?.dataset.zone ?? null;
    const inZone = !!zoneEl && !!zone && zone !== 'hidden';
    const units: MeasuredWidgetUnit[] = inZone ? measureZoneUnits(zoneEl!, widgetIds) : [];

    // (1) Dwell on a foreign unit (never on the free canvas).
    const candidate =
      inZone && zone !== 'floating'
        ? dwellCandidateAt(units, pointer, { ownKey: options.ownUnitKey, isLocked: (unit) => widgetUnitLocked(layout, unit) })
        : null;
    const state = dwell.move(candidate?.key ?? null, pointer);
    const armed = state.armed ? units.find((unit) => unit.key === state.armed) ?? null : null;

    // (2) Reorder in the member's own group.
    const reorder = reorderAt(pointer);

    // (3) Insert into the zone under the pointer.
    let insert: { zone: string; unitIndex: number; floatingRect?: { x: number; y: number }; units: MeasuredWidgetUnit[] } | null = null;
    let insertLine: InsertLine | null = null;
    if (inZone) {
      const unitIndex = widgetDropIndex(pointer, units.map((unit) => unit.rect), zoneFlow(zone!));
      if (zone === 'floating') {
        const root = zoneEl!.getBoundingClientRect();
        insert = { zone, unitIndex, floatingRect: { x: pointer.x - root.left, y: pointer.y - root.top }, units };
      } else {
        insert = { zone: zone!, unitIndex, units };
        insertLine = zoneInsertLine(zoneEl!, zone!, units, unitIndex);
      }
    }

    // (4) The workspace edge (only off every zone).
    const edge = zoneEl ? null : workspaceEdgeAt(pointer.x, pointer.y);

    const decision = resolveWidgetDropOrder({
      dwell: armed && zone ? { key: armed.key, groupId: armed.groupId, widgetIds: armed.widgetIds, zone } : null,
      reorder: reorder?.decision ?? null,
      insert,
      edge: edge ? { region: edge.region } : null
    });
    return {
      decision,
      line: decision?.kind === 'reorder' ? reorder?.line ?? null : decision?.kind === 'insert' ? insertLine : null,
      groupFrame: decision?.kind === 'group' && armed ? inflateRect(armed.rect, GROUP_FRAME_INSET_PX) : null,
      edgeRect: decision?.kind === 'edge' && edge ? edge.rect : null
    };
  };

  const publish = (pointer: WorkbenchPointer) => {
    const { decision, line, groupFrame, edgeRect } = evaluate(pointer);
    const layout = controller.activeLayout;
    controller.setDrag({
      kind: 'widget',
      widgetIds,
      startedAt,
      pointer,
      size: options.size,
      grabOffset: options.grabOffset,
      targetLabel: widgetDropLabel(decision, {
        zone: (zone) => widgetZoneLabel(layout, zone),
        unit: (unit) => widgetUnitLabel(layout, unit, options.typeLabel)
      }),
      previewRect: groupFrame ?? edgeRect ?? undefined,
      previewKind: groupFrame ? 'group' : edgeRect ? 'zone' : undefined,
      groupInsert: decision?.kind === 'reorder' ? { groupId: decision.groupId, index: decision.index } : undefined,
      zoneInsert: decision?.kind === 'insert' ? { zone: decision.zone, index: decision.unitIndex } : undefined,
      insertLine: line ?? undefined
    });
    // A rest that has not armed yet re-checks at its deadline, so the Group
    // frame appears while the pointer is perfectly still.
    clearTimer();
    const remaining = dwell.remaining();
    if (remaining != null) {
      timer = setTimeout(() => {
        timer = null;
        if (live && last && controller.drag?.kind === 'widget') publish(last);
      }, remaining + 1);
    }
  };

  const commandFor = (decision: WidgetDropDecision): WorkbenchCommand[] => {
    const doc = controller.document;
    switch (decision.kind) {
      case 'group': {
        const command = widgetGroupWithCommand(doc, widgetIds, decision.target);
        return command ? [command] : [];
      }
      case 'reorder': {
        const command = widgetReorderInGroupCommand(doc, decision.groupId, decision.memberOrder);
        return command ? [command] : [];
      }
      case 'insert':
        return [widgetInsertCommand(doc, widgetIds, decision.zone, decision.unitIndex, decision.floatingRect, decision.units)];
      case 'edge':
        return createCustomPanelFromWidgetsCommands(doc, { widgetIds, title: 'Custom Panel', region: decision.region });
    }
  };

  const end = () => {
    live = false;
    clearTimer();
    controller.setDrag(null);
  };

  beginPointerDrag({
    event: options.event,
    cancelOnEscape: true,
    onMove: (pointer) => {
      last = pointer;
      publish(pointer);
    },
    onDrop: (pointer) => {
      try {
        const { decision } = evaluate(pointer);
        if (!decision) return;
        const commands = commandFor(decision);
        if (commands.length === 1) controller.dispatch(commands[0]);
        else if (commands.length) controller.dispatchMany(commands);
      } finally {
        end();
      }
    },
    onTap: () => {
      live = false;
      options.onTap();
    },
    onCancel: end
  });
}
