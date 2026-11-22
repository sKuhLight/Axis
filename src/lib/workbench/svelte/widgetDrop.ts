/**
 * Widget drops and grouping (slice 4b) — the pure half.
 *
 * Plain drops always INSERT. Grouping happens only on intent: a dwell on a
 * foreign unit (`dwellTracker.ts`) or the widget menu's "Group with ▸". The drop
 * order, checked top to bottom:
 *
 *   1. a dwell armed on a foreign unit → group with it (a group target takes the
 *      dragged widget(s) in, appended after its members);
 *   2. the pointer inside the dragged member's OWN group → reorder there, directly;
 *   3. a widget zone under the pointer → insert at the unit index (a short release
 *      on a widget inserts beside it, by its midpoint);
 *   4. the workspace edge → a new custom panel there.
 *
 * The removed instant rules (the middle 28 % of a loose widget = group, a drop
 * on or next to a foreign group = into it) are gone: both now insert.
 *
 * Everything here is DOM-free: the drag session (`widgetDragSession.ts`)
 * measures rects and feeds them in; the menus build their rows from the same
 * commands.
 */
import {
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  type DockRegionId,
  type FloatingRect,
  type WidgetInstance,
  type WidgetZoneId,
  type WorkbenchCommand,
  type WorkbenchDocument,
  type WorkbenchLayout
} from '../core';
import { labelFromWorkbenchType } from '../core/panelTemplates';
import type { WorkbenchMenuItem } from './contextMenu';
import {
  anchoredWidgetIndex,
  widgetDropCommand,
  widgetOrderIndexForUnits,
  zoneUnitsFromWidgets,
  type InsertFlow,
  type InsertLine,
  type WorkbenchPointer,
  type WorkbenchRect
} from './drag';

export type { InsertFlow, InsertLine };

/** A top-level zone unit: a loose widget (key = widget id) or a group module (key = group id). */
export interface WidgetUnitRef {
  key: string;
  groupId?: string;
  widgetIds: string[];
}

export interface MeasuredWidgetUnit extends WidgetUnitRef {
  rect: WorkbenchRect;
}

// ── Drop order ─────────────────────────────────────────────────────────────

export type WidgetDropDecision =
  | { kind: 'group'; target: WidgetUnitRef & { zone: string } }
  | { kind: 'reorder'; groupId: string; index: number; memberOrder: string[] }
  | { kind: 'insert'; zone: string; unitIndex: number; floatingRect?: FloatingRect; units?: ReadonlyArray<Pick<WidgetUnitRef, 'widgetIds'>> }
  | { kind: 'edge'; region: DockRegionId };

/** What the pointer could mean right now; the resolver picks by the drop order. */
export interface WidgetDropCandidates {
  /** A foreign unit a dwell has ARMED grouping for. */
  dwell?: (WidgetUnitRef & { zone: string }) | null;
  /** The dragged member's own group under the pointer, with the reorder index. */
  reorder?: { groupId: string; index: number; memberOrder: string[] } | null;
  /** A widget zone under the pointer, with the unit index (and the measured units it counts). */
  insert?: { zone: string; unitIndex: number; floatingRect?: FloatingRect; units?: ReadonlyArray<Pick<WidgetUnitRef, 'widgetIds'>> } | null;
  /** The workspace edge (no zone under the pointer). */
  edge?: { region: DockRegionId } | null;
}

/** The drop order: dwell → group, own group → reorder, zone → insert, workspace edge → new panel. */
export function resolveWidgetDropOrder(candidates: WidgetDropCandidates): WidgetDropDecision | null {
  if (candidates.dwell) return { kind: 'group', target: candidates.dwell };
  if (candidates.reorder) return { kind: 'reorder', ...candidates.reorder };
  if (candidates.insert) return { kind: 'insert', ...candidates.insert };
  if (candidates.edge) return { kind: 'edge', region: candidates.edge.region };
  return null;
}

// ── Hit-testing helpers ────────────────────────────────────────────────────

/** Vertical slack (px) for "on a unit" (prototype: the unit rect ±4 px). */
export const WIDGET_UNIT_HIT_PAD_PX = 4;

/** The unit whose rect (grown vertically by `padY`) holds the pointer, or null. */
export function unitAtPointer<T extends { rect: WorkbenchRect }>(units: readonly T[], pointer: WorkbenchPointer, padY = WIDGET_UNIT_HIT_PAD_PX): T | null {
  for (const unit of units) {
    const r = unit.rect;
    if (r.width <= 0 || r.height <= 0) continue;
    if (pointer.x >= r.left && pointer.x <= r.left + r.width && pointer.y >= r.top - padY && pointer.y <= r.top + r.height + padY) {
      return unit;
    }
  }
  return null;
}

/**
 * The unit a dwell may arm: the one under the pointer, unless it is the dragged
 * unit itself (a member's own group counts as its own unit — reordering there
 * is direct) or it cannot be grouped (locked).
 */
export function dwellCandidateAt<T extends MeasuredWidgetUnit>(
  units: readonly T[],
  pointer: WorkbenchPointer,
  options: { ownKey: string; isLocked?: (unit: T) => boolean }
): T | null {
  const unit = unitAtPointer(units, pointer);
  if (!unit || unit.key === options.ownKey) return null;
  if (options.isLocked?.(unit)) return null;
  return unit;
}

/**
 * True when a widget belongs to a LOCKED group: the group cannot change, so the
 * member can neither leave it (drag, move, group elsewhere) nor join another.
 */
export function widgetInLockedGroup(layout: WorkbenchLayout | undefined, widgetId: string): boolean {
  const groupId = layout?.widgets[widgetId]?.groupId;
  return !!groupId && !!layout?.widgetGroups[groupId]?.locked;
}

/** True when the unit (or any member, a member's group, or its group) is locked — it cannot be grouped. */
export function widgetUnitLocked(layout: WorkbenchLayout | undefined, unit: Pick<WidgetUnitRef, 'groupId' | 'widgetIds'>): boolean {
  if (!layout) return true;
  if (unit.groupId && layout.widgetGroups[unit.groupId]?.locked) return true;
  return unit.widgetIds.some((id) => !!layout.widgets[id]?.locked || widgetInLockedGroup(layout, id));
}

/** `rect` grown by `by` px on every side (the Group frame sits just outside the unit). */
export function inflateRect(rect: WorkbenchRect, by: number): WorkbenchRect {
  return { left: rect.left - by, top: rect.top - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

// ── Commands ───────────────────────────────────────────────────────────────

/** A group's member sequence with `movingIds` taken out and re-inserted at `index` (among the rest). */
export function reorderMemberOrder(memberIds: readonly string[], movingIds: readonly string[], index: number): string[] {
  const moving = new Set(movingIds);
  const rest = memberIds.filter((id) => !moving.has(id));
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), ...movingIds, ...rest.slice(at)];
}

/** The members of a unit as the layout has them now (a group's live member list). */
function unitMembers(layout: WorkbenchLayout, target: Pick<WidgetUnitRef, 'groupId' | 'widgetIds'>): WidgetInstance[] {
  const ids = target.groupId ? (layout.widgetGroups[target.groupId]?.widgetIds ?? target.widgetIds) : target.widgetIds;
  return ids.map((id) => layout.widgets[id]).filter((widget): widget is WidgetInstance => !!widget);
}

export interface GroupWithOptions {
  /**
   * `append` (dwell drops, the default): the moving widgets join AFTER the
   * target's members and the result sits where the target sits.
   * `zone` (the menu): two loose widgets of one zone keep their on-screen order
   * and the group sits where the first of them sits. A group target always
   * appends.
   */
  order?: 'append' | 'zone';
}

/**
 * Group `movingIds` with `target` as ONE `widget.group`: a group target takes
 * them in (its id is kept), a loose target forms a new group with them. The
 * zone is the target's; the index keeps the result anchored where the target
 * sits (`anchoredWidgetIndex`). Null when nothing would change or something is
 * locked (the reducer would refuse it).
 */
export function widgetGroupWithCommand(
  doc: WorkbenchDocument,
  movingIds: readonly string[],
  target: Pick<WidgetUnitRef, 'groupId' | 'widgetIds'>,
  options: GroupWithOptions = {}
): WorkbenchCommand | null {
  const layout = selectActiveLayout(doc);
  if (!layout) return null;
  const members = unitMembers(layout, target);
  if (!members.length) return null;
  const memberIds = members.map((widget) => widget.id);
  const moving = movingIds.filter((id) => !memberIds.includes(id) && !!layout.widgets[id]);
  if (!moving.length) return null;
  if (widgetUnitLocked(layout, target) || widgetUnitLocked(layout, { widgetIds: moving })) return null;
  const groupId = target.groupId && layout.widgetGroups[target.groupId] ? target.groupId : undefined;
  const sortedTarget = [...members].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const zone = sortedTarget[0].zone;
  let memberOrder = [...memberIds, ...moving];
  let anchorOrder = sortedTarget[0].order;
  if (options.order === 'zone' && !groupId) {
    const all = [...members, ...moving.map((id) => layout.widgets[id])];
    if (all.every((widget) => widget.zone === zone)) {
      const byOrder = [...all].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      memberOrder = byOrder.map((widget) => widget.id);
      anchorOrder = byOrder[0].order;
    }
  }
  return {
    type: 'widget.group',
    ...(groupId ? { groupId } : {}),
    widgetIds: memberOrder,
    memberOrder,
    zone,
    index: anchoredWidgetIndex(selectVisibleWidgetsByZone(doc, zone), memberOrder, anchorOrder)
  };
}

/** Reorder inside a group: the explicit member sequence, the block anchored where it sits. */
export function widgetReorderInGroupCommand(doc: WorkbenchDocument, groupId: string, memberOrder: readonly string[]): WorkbenchCommand | null {
  const layout = selectActiveLayout(doc);
  const group = layout?.widgetGroups[groupId];
  if (!layout || !group) return null;
  const anchor = group.widgetIds
    .map((id) => layout.widgets[id])
    .filter((widget): widget is WidgetInstance => !!widget)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];
  if (!anchor) return null;
  return {
    type: 'widget.group',
    groupId,
    widgetIds: [...memberOrder],
    memberOrder: [...memberOrder],
    zone: anchor.zone,
    index: anchoredWidgetIndex(selectVisibleWidgetsByZone(doc, anchor.zone), memberOrder, anchor.order)
  };
}

/**
 * The WIDGET-order index (what `widget.add` / `widget.move` splice at) for an
 * insert at a UNIT index of a zone — the one conversion every widget drop path
 * shares (in-layout drag, library drag-out, click-to-place by pointer and by
 * keyboard). `units` are the units as rendered (measured member ids); a zone
 * widget the host does not render (gated off) is not among them, so the index
 * is resolved from the members' ids, not by counting units. Without measured
 * units the zone's units come from the document. `movingIds` are left out of
 * the zone's order, like the reducer's `placeWidgets`.
 */
export function zoneWidgetOrderIndex(
  doc: WorkbenchDocument,
  zone: string,
  unitIndex: number,
  options: { units?: ReadonlyArray<Pick<WidgetUnitRef, 'widgetIds'>>; movingIds?: readonly string[] } = {}
): number {
  const moving = new Set(options.movingIds ?? []);
  const widgets = selectVisibleWidgetsByZone(doc, zone);
  const orderedIds = widgets.filter((widget) => !moving.has(widget.id)).map((widget) => widget.id);
  const units = options.units ?? zoneUnitsFromWidgets(widgets, moving);
  return widgetOrderIndexForUnits(orderedIds, units, unitIndex);
}

/**
 * Insert at a UNIT index of a zone (what the pointer hit-test and the insert
 * line use), converted to the widget-order index `widget.move` expects
 * (`zoneWidgetOrderIndex`: against the zone minus the moving widgets, like the
 * reducer's `placeWidgets`). `units`: the measured units the index counts.
 * A member moved on its own leaves its group (the reducer detaches it).
 */
export function widgetInsertCommand(
  doc: WorkbenchDocument,
  movingIds: readonly string[],
  zone: string,
  unitIndex: number,
  floatingRect?: FloatingRect,
  units?: ReadonlyArray<Pick<WidgetUnitRef, 'widgetIds'>>
): WorkbenchCommand {
  const index = zoneWidgetOrderIndex(doc, zone, unitIndex, { units, movingIds });
  return widgetDropCommand([...movingIds], { zone: zone as WidgetZoneId, index, floatingRect });
}

// ── Insert line ────────────────────────────────────────────────────────────

/** Thickness of the insert line (px). */
export const INSERT_LINE_PX = 3;
/** How far the line reaches past the units it sits between (px). */
export const INSERT_LINE_OVERHANG_PX = 4;
/** Gap assumed when the units give none to measure (one unit, wrapped rows). */
export const INSERT_LINE_DEFAULT_GAP_PX = 8;

/** Where an empty zone's units would start (its `justify-content`). */
export type InsertAlign = 'start' | 'center' | 'end';

function sameRow(a: WorkbenchRect, b: WorkbenchRect, flow: InsertFlow): boolean {
  return flow === 'horizontal'
    ? Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < Math.max(a.height, b.height) / 2
    : Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) < Math.max(a.width, b.width) / 2;
}

/** The measured gap between neighbouring units of one row, else the default. */
function measuredGap(rects: readonly WorkbenchRect[], flow: InsertFlow): number {
  for (let i = 1; i < rects.length; i++) {
    const a = rects[i - 1];
    const b = rects[i];
    if (!sameRow(a, b, flow)) continue;
    const gap = flow === 'horizontal' ? b.left - (a.left + a.width) : b.top - (a.top + a.height);
    if (gap > 0) return gap;
  }
  return INSERT_LINE_DEFAULT_GAP_PX;
}

/**
 * The insert line for an insertion at `index` among the units' rects (visual
 * px, flow order): centred in the gap before unit `index`, or after the last
 * unit, a bit longer than the units it sits between. An empty zone gets a line
 * where its first unit would land (`empty.align`, inset by half a gap), 20–48 px
 * long. Null when there is nothing to anchor it to.
 */
export function insertLineRect(
  rects: readonly WorkbenchRect[],
  index: number,
  flow: InsertFlow,
  empty?: { zone: WorkbenchRect; align: InsertAlign }
): WorkbenchRect | null {
  const half = INSERT_LINE_PX / 2;
  const across = (start: number, length: number) => ({ start: start - INSERT_LINE_OVERHANG_PX, length: length + INSERT_LINE_OVERHANG_PX * 2 });
  if (!rects.length) {
    if (!empty) return null;
    const z = empty.zone;
    const inset = INSERT_LINE_DEFAULT_GAP_PX / 2;
    if (flow === 'horizontal') {
      const x = empty.align === 'center' ? z.left + z.width / 2 : empty.align === 'end' ? z.left + z.width - inset : z.left + inset;
      const length = Math.min(48, Math.max(20, z.height * 0.7));
      return { left: x - half, top: z.top + (z.height - length) / 2, width: INSERT_LINE_PX, height: length };
    }
    const y = empty.align === 'center' ? z.top + z.height / 2 : empty.align === 'end' ? z.top + z.height - inset : z.top + inset;
    const length = Math.min(48, Math.max(20, z.width * 0.7));
    return { left: z.left + (z.width - length) / 2, top: y - half, width: length, height: INSERT_LINE_PX };
  }
  const n = rects.length;
  const i = Math.max(0, Math.min(index, n));
  const gap = measuredGap(rects, flow);
  const before = i > 0 ? rects[i - 1] : null;
  const after = i < n ? rects[i] : null;
  // Between two units of one row: centred in their gap, as long as the taller.
  // At a row start (or before the first unit): half a gap before it. Past the
  // last unit: half a gap after it.
  const span: WorkbenchRect[] = before && after && sameRow(before, after, flow) ? [before, after] : after ? [after] : [before!];
  if (flow === 'horizontal') {
    const x = span.length === 2 ? (before!.left + before!.width + after!.left) / 2 : after ? after.left - gap / 2 : before!.left + before!.width + gap / 2;
    const top = Math.min(...span.map((r) => r.top));
    const bottom = Math.max(...span.map((r) => r.top + r.height));
    const { start, length } = across(top, bottom - top);
    return { left: x - half, top: start, width: INSERT_LINE_PX, height: length };
  }
  const y = span.length === 2 ? (before!.top + before!.height + after!.top) / 2 : after ? after.top - gap / 2 : before!.top + before!.height + gap / 2;
  const left = Math.min(...span.map((r) => r.left));
  const right = Math.max(...span.map((r) => r.left + r.width));
  const { start, length } = across(left, right - left);
  return { left: start, top: y - half, width: length, height: INSERT_LINE_PX };
}

// ── Labels ─────────────────────────────────────────────────────────────────

/** A widget's display name: its `state.label`, else the host's catalog label for its type, else one from the type. */
export function widgetDisplayLabel(widget: Pick<WidgetInstance, 'type' | 'state'>, typeLabel?: (type: string) => string | undefined): string {
  const label = widget.state?.label;
  if (typeof label === 'string' && label.trim()) return label;
  return typeLabel?.(widget.type) ?? labelFromWorkbenchType(widget.type);
}

/** A unit's display name: the widget's, or a group's members joined with " + ". */
export function widgetUnitLabel(layout: WorkbenchLayout | undefined, unit: Pick<WidgetUnitRef, 'groupId' | 'widgetIds'>, typeLabel?: (type: string) => string | undefined): string {
  if (!layout) return 'Widget';
  const members = unitMembers(layout, unit);
  if (!members.length) return 'Widget';
  return members.map((widget) => widgetDisplayLabel(widget, typeLabel)).join(' + ');
}

// ── "Group with ▸" (widget and group menus) ────────────────────────────────

export interface GroupWithCandidate extends WidgetUnitRef {
  label: string;
  isGroup: boolean;
  locked: boolean;
}

/** Zones whose units never group (free canvas, hidden). */
const NO_GROUP_ZONES = new Set(['floating', 'hidden']);

/**
 * The neighbours `self` can be grouped with: every other top-level unit in its
 * zone, in zone order (a member's own group is its own unit and is left out).
 * Floating and hidden widgets have none. `isAvailable` mirrors the zone's
 * rendering: a widget type the app cannot show right now (e.g. the device
 * lacks it) is not on screen, so it is not offered either.
 */
export function groupWithCandidates(
  doc: WorkbenchDocument,
  self: Pick<WidgetUnitRef, 'key' | 'widgetIds'>,
  typeLabel?: (type: string) => string | undefined,
  isAvailable: (type: string) => boolean = () => true
): GroupWithCandidate[] {
  const layout = selectActiveLayout(doc);
  const first = layout?.widgets[self.widgetIds[0]];
  if (!layout || !first || NO_GROUP_ZONES.has(first.zone)) return [];
  const out: GroupWithCandidate[] = [];
  const seen = new Set<string>();
  for (const widget of selectVisibleWidgetsByZone(doc, first.zone).filter((item) => isAvailable(item.type))) {
    const groupId = widget.groupId && layout.widgetGroups[widget.groupId] ? widget.groupId : undefined;
    const key = groupId ?? widget.id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (key === self.key) continue;
    const widgetIds = groupId ? layout.widgetGroups[groupId].widgetIds : [widget.id];
    const unit = { key, groupId, widgetIds };
    out.push({ ...unit, label: widgetUnitLabel(layout, unit, typeLabel), isGroup: !!groupId, locked: widgetUnitLocked(layout, unit) });
  }
  return out;
}

export interface GroupWithMenuOptions {
  /** The live document (read when a row runs, not when the menu was built). */
  doc: () => WorkbenchDocument;
  /** The unit the menu belongs to (`key` = widget id, or the group id for a group / member). */
  self: Pick<WidgetUnitRef, 'key' | 'widgetIds'>;
  /** What joins the chosen neighbour: the widget, or every member of the group. */
  movingIds: readonly string[];
  /** The menu's owner is locked (nothing can be grouped). */
  locked?: boolean;
  typeLabel?: (type: string) => string | undefined;
  /** Widget types the zone renders right now (others are not offered). */
  isAvailable?: (type: string) => boolean;
  dispatch: (command: WorkbenchCommand) => void;
  separatorBefore?: boolean;
}

/**
 * The "Group with ▸" submenu row: one row per neighbour in the same zone (a
 * group neighbour takes the widget(s) in — hint "add to group"), locked
 * neighbours disabled, and a disabled note when the zone has nobody else.
 */
export function groupWithMenuItem(options: GroupWithMenuOptions): WorkbenchMenuItem {
  const candidates = groupWithCandidates(options.doc(), options.self, options.typeLabel, options.isAvailable);
  const rows: WorkbenchMenuItem[] = candidates.length
    ? candidates.map((candidate) => ({
        id: `group-with:${candidate.key}`,
        label: candidate.label,
        hint: candidate.locked ? 'Locked' : candidate.isGroup ? 'Add to group' : undefined,
        disabled: candidate.locked,
        run: () => {
          const command = widgetGroupWithCommand(options.doc(), options.movingIds, candidate, { order: 'zone' });
          if (command) options.dispatch(command);
        }
      }))
    : [{ id: 'group-with:none', label: 'No other widget in this zone', disabled: true, run: () => {} }];
  return {
    id: 'group-with',
    label: 'Group with',
    kind: 'submenu',
    separatorBefore: options.separatorBefore,
    disabled: !!options.locked,
    items: rows,
    run: () => {}
  };
}

// ── Drag chip text ─────────────────────────────────────────────────────────

/** The DragLayer chip text for a decision (zone / unit names come from the caller). */
export function widgetDropLabel(
  decision: WidgetDropDecision | null,
  names: { zone?: (zone: string) => string; unit?: (unit: WidgetUnitRef) => string } = {}
): string | undefined {
  if (!decision) return undefined;
  switch (decision.kind) {
    case 'group':
      return `Group with ${names.unit?.(decision.target) ?? 'widget'}`;
    case 'reorder':
      return 'Reorder in group';
    case 'insert':
      return `Insert · ${names.zone?.(decision.zone) ?? decision.zone}`;
    case 'edge':
      return `New panel in ${decision.region}`;
  }
}
