import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  reduceWorkbenchDocument,
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  type WorkbenchCommand,
  type WorkbenchDocument
} from '../../core';
import type { WorkbenchRect } from '../drag';
import {
  dwellCandidateAt,
  groupWithCandidates,
  groupWithMenuItem,
  inflateRect,
  insertLineRect,
  INSERT_LINE_PX,
  reorderMemberOrder,
  resolveWidgetDropOrder,
  unitAtPointer,
  widgetDisplayLabel,
  widgetDropLabel,
  widgetGroupWithCommand,
  widgetInsertCommand,
  widgetInLockedGroup,
  widgetReorderInGroupCommand,
  widgetUnitLabel,
  widgetUnitLocked,
  zoneWidgetOrderIndex,
  type MeasuredWidgetUnit
} from '../widgetDrop';

function run(doc: WorkbenchDocument, commands: WorkbenchCommand[]): WorkbenchDocument {
  return commands.reduce((current, command) => {
    const result = reduceWorkbenchDocument(current, command);
    if (!result.success) throw new Error(`${command.type}: ${result.error?.message}`);
    return result.next;
  }, doc);
}

const w = (id: string, zone: string, order: number, extra: Record<string, unknown> = {}): WorkbenchCommand => ({
  type: 'widget.add',
  widget: { id, type: `w.${id}`, zone, order, size: 'default', ...extra },
  zone
});

/**
 * top.right: a · b · [g: c + d] · e · locked(x)   — top.left: p   — floating: f
 */
/** The fixture with group `g` locked (no command locks a group: set it on a copy). */
function withLockedGroup(doc: WorkbenchDocument): WorkbenchDocument {
  const next = structuredClone(doc);
  selectActiveLayout(next)!.widgetGroups.g.locked = true;
  return next;
}

function fixture(): WorkbenchDocument {
  return run(createEmptyWorkbenchDocument({ profileId: 'p', layoutId: 'l' }), [
    w('a', 'top.right', 0),
    w('b', 'top.right', 1),
    w('c', 'top.right', 2),
    w('d', 'top.right', 3),
    w('e', 'top.right', 4),
    w('x', 'top.right', 5, { locked: true }),
    w('p', 'top.left', 0),
    w('f', 'floating', 0, { floatingRect: { x: 10, y: 10 } }),
    { type: 'widget.group', groupId: 'g', widgetIds: ['c', 'd'], zone: 'top.right', index: 2 }
  ]);
}

/** A zone's units in order: loose widget ids, groups as `id[member+member]`. */
function zoneOrder(doc: WorkbenchDocument, zone: string): string[] {
  const layout = selectActiveLayout(doc)!;
  const labels = selectVisibleWidgetsByZone(doc, zone).map((widget) => {
    const group = widget.groupId ? layout.widgetGroups[widget.groupId] : null;
    return group ? `${group.id}[${group.widgetIds.join('+')}]` : widget.id;
  });
  return labels.filter((label, index) => labels.indexOf(label) === index);
}

const rect = (left: number, width = 60, top = 10, height = 38): WorkbenchRect => ({ left, top, width, height });

describe('resolveWidgetDropOrder — the slice-4b drop order', () => {
  const dwell = { key: 'b', widgetIds: ['b'], zone: 'top.right' };
  const reorder = { groupId: 'g', index: 1, memberOrder: ['c', 'd'] };
  const insert = { zone: 'top.right', unitIndex: 2 };
  const edge = { region: 'left' as const };

  it('(1) an armed dwell groups — it beats everything else', () => {
    expect(resolveWidgetDropOrder({ dwell, reorder, insert, edge })).toEqual({ kind: 'group', target: dwell });
  });

  it('(2) otherwise reordering inside the own group is direct', () => {
    expect(resolveWidgetDropOrder({ reorder, insert, edge })).toEqual({ kind: 'reorder', ...reorder });
  });

  it('(3) otherwise a plain drop INSERTS (no instant grouping on a widget or group)', () => {
    expect(resolveWidgetDropOrder({ dwell: null, reorder: null, insert, edge })).toEqual({ kind: 'insert', ...insert });
  });

  it('(4) otherwise the workspace edge opens a new custom panel; nothing → null', () => {
    expect(resolveWidgetDropOrder({ edge })).toEqual({ kind: 'edge', region: 'left' });
    expect(resolveWidgetDropOrder({})).toBeNull();
  });
});

describe('hit-testing helpers', () => {
  const units: MeasuredWidgetUnit[] = [
    { key: 'a', widgetIds: ['a'], rect: rect(0) },
    { key: 'g', groupId: 'g', widgetIds: ['c', 'd'], rect: rect(80, 120) },
    { key: 'gone', widgetIds: ['z'], rect: rect(0, 0, 0, 0) }
  ];

  it('unitAtPointer: inside the rect, with ±4 px vertical slack', () => {
    expect(unitAtPointer(units, { x: 30, y: 20 })?.key).toBe('a');
    expect(unitAtPointer(units, { x: 30, y: 7 })?.key).toBe('a');
    expect(unitAtPointer(units, { x: 30, y: 5 })).toBeNull();
    expect(unitAtPointer(units, { x: 70, y: 20 })).toBeNull(); // the gap
    expect(unitAtPointer(units, { x: 150, y: 51 })?.key).toBe('g');
  });

  it('dwellCandidateAt skips the own unit and locked units', () => {
    expect(dwellCandidateAt(units, { x: 100, y: 20 }, { ownKey: 'a' })?.key).toBe('g');
    expect(dwellCandidateAt(units, { x: 100, y: 20 }, { ownKey: 'g' })).toBeNull();
    expect(dwellCandidateAt(units, { x: 10, y: 20 }, { ownKey: 'g', isLocked: (unit) => unit.key === 'a' })).toBeNull();
  });

  it('inflateRect grows every side', () => {
    expect(inflateRect(rect(10, 20, 10, 20), 6)).toEqual({ left: 4, top: 4, width: 32, height: 32 });
  });
});

describe('commands', () => {
  it('group with a loose widget: a new group, appended after the target, anchored at the target', () => {
    const doc = fixture();
    const command = widgetGroupWithCommand(doc, ['a'], { widgetIds: ['e'] })!;
    expect(command).toMatchObject({ type: 'widget.group', widgetIds: ['e', 'a'], memberOrder: ['e', 'a'], zone: 'top.right' });
    expect((command as { groupId?: string }).groupId).toBeUndefined();
    const next = run(doc, [command]);
    const order = zoneOrder(next, 'top.right');
    expect(order[0]).toBe('b');
    expect(order[1]).toBe('g[c+d]');
    expect(order[2]).toMatch(/\[e\+a\]$/);
    expect(order[3]).toBe('x');
  });

  it('group with a group: the target group takes the widget in (its id is kept)', () => {
    const doc = fixture();
    const command = widgetGroupWithCommand(doc, ['p'], { key: 'g', groupId: 'g', widgetIds: ['c', 'd'] } as never)!;
    expect(command).toMatchObject({ groupId: 'g', widgetIds: ['c', 'd', 'p'], zone: 'top.right' });
    const next = run(doc, [command]);
    expect(zoneOrder(next, 'top.right')).toEqual(['a', 'b', 'g[c+d+p]', 'e', 'x']);
    expect(zoneOrder(next, 'top.left')).toEqual([]);
  });

  it('a member grouped elsewhere leaves its group (a group below two members dissolves)', () => {
    const doc = fixture();
    const next = run(doc, [widgetGroupWithCommand(doc, ['d'], { widgetIds: ['a'] })!]);
    const layout = selectActiveLayout(next)!;
    expect(layout.widgetGroups.g).toBeUndefined();
    expect(layout.widgets.c.groupId).toBeNull();
    expect(zoneOrder(next, 'top.right')[0]).toMatch(/\[a\+d\]$/);
  });

  it('a whole group grouped with a loose widget merges into one group at the target', () => {
    const doc = fixture();
    const next = run(doc, [widgetGroupWithCommand(doc, ['c', 'd'], { widgetIds: ['a'] })!]);
    const order = zoneOrder(next, 'top.right');
    expect(order[0]).toMatch(/\[a\+c\+d\]$/);
    expect(selectActiveLayout(next)!.widgetGroups.g).toBeUndefined();
  });

  it("menu order 'zone' keeps two loose widgets of one zone in their on-screen order", () => {
    const doc = fixture();
    const command = widgetGroupWithCommand(doc, ['a'], { widgetIds: ['b'] }, { order: 'zone' })!;
    expect(command).toMatchObject({ widgetIds: ['a', 'b'], index: 0 });
    // A group target always appends.
    expect(widgetGroupWithCommand(doc, ['a'], { groupId: 'g', widgetIds: ['c', 'd'] }, { order: 'zone' })).toMatchObject({
      widgetIds: ['c', 'd', 'a']
    });
  });

  it('nothing to do or locked → null', () => {
    const doc = fixture();
    expect(widgetGroupWithCommand(doc, ['a'], { widgetIds: ['x'] })).toBeNull();
    expect(widgetGroupWithCommand(doc, ['x'], { widgetIds: ['a'] })).toBeNull();
    expect(widgetGroupWithCommand(doc, ['c'], { groupId: 'g', widgetIds: ['c', 'd'] })).toBeNull();
    expect(widgetGroupWithCommand(doc, ['a'], { widgetIds: ['nope'] })).toBeNull();
  });

  it('a member of a LOCKED group is locked too: it cannot be grouped elsewhere (dwell or menu), nor taken in', () => {
    const doc = withLockedGroup(fixture());
    const layout = selectActiveLayout(doc)!;
    expect(widgetInLockedGroup(layout, 'c')).toBe(true);
    expect(widgetInLockedGroup(layout, 'a')).toBe(false);
    expect(widgetUnitLocked(layout, { widgetIds: ['c'] })).toBe(true);
    expect(widgetUnitLocked(layout, { widgetIds: ['a'] })).toBe(false);
    // The member as the MOVING widget (the dwell drop / its "Group with ▸" row) …
    expect(widgetGroupWithCommand(doc, ['c'], { widgetIds: ['a'] })).toBeNull();
    // … and the locked group as the target.
    expect(widgetGroupWithCommand(doc, ['a'], { groupId: 'g', widgetIds: ['c', 'd'] })).toBeNull();
    // The member's menu row is disabled.
    const item = groupWithMenuItem({ doc: () => doc, self: { key: 'g', widgetIds: ['c'] }, movingIds: ['c'], locked: widgetUnitLocked(layout, { widgetIds: ['c'] }), dispatch: () => {} });
    expect(item.disabled).toBe(true);
    // The reducer refuses it as well (the widget would sit in two groups).
    const result = reduceWorkbenchDocument(doc, { type: 'widget.group', widgetIds: ['a', 'c'], zone: 'top.right' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('locked-widget-group');
    expect(selectActiveLayout(result.next)!.widgetGroups.g.widgetIds).toEqual(['c', 'd']);
  });

  it('reorder inside a group keeps the block where it sits', () => {
    const doc = fixture();
    const memberOrder = reorderMemberOrder(['c', 'd'], ['d'], 0);
    expect(memberOrder).toEqual(['d', 'c']);
    const next = run(doc, [widgetReorderInGroupCommand(doc, 'g', memberOrder)!]);
    expect(zoneOrder(next, 'top.right')).toEqual(['a', 'b', 'g[d+c]', 'e', 'x']);
    expect(widgetReorderInGroupCommand(doc, 'missing', ['c'])).toBeNull();
  });

  it('reorderMemberOrder clamps and moves several ids together', () => {
    expect(reorderMemberOrder(['a', 'b', 'c'], ['a'], 5)).toEqual(['b', 'c', 'a']);
    expect(reorderMemberOrder(['a', 'b', 'c'], ['c'], -1)).toEqual(['c', 'a', 'b']);
  });

  it('insert converts the unit index (a group counts as one unit) and pulls a member out of its group', () => {
    const doc = fixture();
    // Units without 'a': b · g · e · x → unit index 2 = before e → widget index 3 (b, c, d).
    expect(widgetInsertCommand(doc, ['a'], 'top.right', 2)).toEqual({ type: 'widget.move', widgetIds: ['a'], zone: 'top.right', index: 3, floatingRect: undefined });
    const next = run(doc, [widgetInsertCommand(doc, ['a'], 'top.right', 2)]);
    expect(zoneOrder(next, 'top.right')).toEqual(['b', 'g[c+d]', 'a', 'e', 'x']);
    // A short release beside a FOREIGN group inserts next to it — never into it.
    const beside = run(doc, [widgetInsertCommand(doc, ['p'], 'top.right', 3)]);
    expect(zoneOrder(beside, 'top.right')).toEqual(['a', 'b', 'g[c+d]', 'p', 'e', 'x']);
    // A member dropped in the zone leaves its group (which dissolves).
    const out = run(doc, [widgetInsertCommand(doc, ['d'], 'top.left', 0)]);
    expect(zoneOrder(out, 'top.left')).toEqual(['d', 'p']);
    expect(selectActiveLayout(out)!.widgetGroups.g).toBeUndefined();
  });

  it('with the MEASURED units a drop past a widget the zone does not render lands where the line was', () => {
    const doc = fixture();
    // The zone renders a · b · g · x — `e` is gated off (not on screen). Drop `p` before x (unit index 3).
    const units = [{ widgetIds: ['a'] }, { widgetIds: ['b'] }, { widgetIds: ['c', 'd'] }, { widgetIds: ['x'] }];
    expect(zoneWidgetOrderIndex(doc, 'top.right', 3, { units })).toBe(5);
    // Counting units would say 4 (= before e, i.e. before the hidden widget, one slot early).
    expect(zoneWidgetOrderIndex(doc, 'top.right', 3)).toBe(4);
    const next = run(doc, [widgetInsertCommand(doc, ['p'], 'top.right', 3, undefined, units)]);
    expect(zoneOrder(next, 'top.right')).toEqual(['a', 'b', 'g[c+d]', 'e', 'p', 'x']);
    // The moving widgets are left out of the order (a drag inside the zone).
    expect(zoneWidgetOrderIndex(doc, 'top.right', 1, { units: units.slice(1), movingIds: ['a'] })).toBe(1);
  });
});

describe('insertLineRect', () => {
  const three = [rect(0, 60), rect(76, 60), rect(152, 60)]; // 16 px gaps

  it('sits centred in the gap before the unit at the index, a bit longer than the units', () => {
    const line = insertLineRect(three, 1, 'horizontal')!;
    expect(line.left + INSERT_LINE_PX / 2).toBe(68);
    expect(line.width).toBe(INSERT_LINE_PX);
    expect(line.top).toBe(6);
    expect(line.height).toBe(46);
  });

  it('before the first / after the last unit: half a measured gap outside', () => {
    expect(insertLineRect(three, 0, 'horizontal')!.left + INSERT_LINE_PX / 2).toBe(-8);
    expect(insertLineRect(three, 3, 'horizontal')!.left + INSERT_LINE_PX / 2).toBe(220);
    expect(insertLineRect(three, 99, 'horizontal')!.left + INSERT_LINE_PX / 2).toBe(220);
  });

  it('a wrapped row: the line goes before the next row’s first unit', () => {
    const wrapped = [rect(0, 60, 0), rect(76, 60, 0), rect(0, 60, 60)];
    const line = insertLineRect(wrapped, 2, 'horizontal')!;
    expect(line.left + INSERT_LINE_PX / 2).toBe(-8);
    expect(line.top).toBe(56);
  });

  it('vertical flow (rail): a horizontal line between stacked units', () => {
    const stack = [rect(0, 40, 0, 40), rect(0, 40, 56, 40)];
    const line = insertLineRect(stack, 1, 'vertical')!;
    expect(line.top + INSERT_LINE_PX / 2).toBe(48);
    expect(line.height).toBe(INSERT_LINE_PX);
    expect(line.width).toBe(48);
  });

  it('an empty zone: where its first unit lands (justify start / center / end); none without a zone', () => {
    const zone = { left: 100, top: 0, width: 200, height: 58 };
    expect(insertLineRect([], 0, 'horizontal')).toBeNull();
    expect(insertLineRect([], 0, 'horizontal', { zone, align: 'start' })!.left + INSERT_LINE_PX / 2).toBe(104);
    expect(insertLineRect([], 0, 'horizontal', { zone, align: 'center' })!.left + INSERT_LINE_PX / 2).toBe(200);
    expect(insertLineRect([], 0, 'horizontal', { zone, align: 'end' })!.left + INSERT_LINE_PX / 2).toBe(296);
    const tall = insertLineRect([], 0, 'horizontal', { zone: { left: 0, top: 0, width: 300, height: 400 }, align: 'start' })!;
    expect(tall.height).toBe(48);
  });
});

describe('"Group with ▸"', () => {
  const NAMES: Record<string, string> = { 'w.a': 'Alpha', 'w.b': 'Bravo', 'w.c': 'Charlie', 'w.d': 'Delta', 'w.e': 'Echo', 'w.x': 'Xray' };
  const typeLabel = (type: string) => NAMES[type];

  it('lists every other unit of the zone in zone order; a member’s own group is left out', () => {
    const doc = fixture();
    expect(groupWithCandidates(doc, { key: 'a', widgetIds: ['a'] }, typeLabel).map((c) => [c.key, c.label, c.isGroup, c.locked])).toEqual([
      ['b', 'Bravo', false, false],
      ['g', 'Charlie + Delta', true, false],
      ['e', 'Echo', false, false],
      ['x', 'Xray', false, true]
    ]);
    expect(groupWithCandidates(doc, { key: 'g', widgetIds: ['c'] }).map((c) => c.key)).toEqual(['a', 'b', 'e', 'x']);
    // Floating widgets never group; a lone widget has nobody.
    expect(groupWithCandidates(doc, { key: 'f', widgetIds: ['f'] })).toEqual([]);
    expect(groupWithCandidates(doc, { key: 'p', widgetIds: ['p'] })).toEqual([]);
  });

  it('builds a submenu: a row per neighbour, groups hinted, locked disabled; a row runs ONE group command', () => {
    const doc = fixture();
    const dispatch = vi.fn();
    const item = groupWithMenuItem({ doc: () => doc, self: { key: 'a', widgetIds: ['a'] }, movingIds: ['a'], typeLabel, dispatch, separatorBefore: true });
    expect(item).toMatchObject({ id: 'group-with', label: 'Group with', kind: 'submenu', disabled: false, separatorBefore: true });
    expect(item.items!.map((row) => [row.label, row.hint, !!row.disabled])).toEqual([
      ['Bravo', undefined, false],
      ['Charlie + Delta', 'Add to group', false],
      ['Echo', undefined, false],
      ['Xray', 'Locked', true]
    ]);
    item.items![0].run();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'widget.group', widgetIds: ['a', 'b'] });
    item.items![1].run();
    expect(dispatch.mock.calls[1][0]).toMatchObject({ type: 'widget.group', groupId: 'g', widgetIds: ['c', 'd', 'a'] });
  });

  it('offers only what the zone renders: unavailable types (e.g. the device lacks them) are left out', () => {
    const doc = fixture();
    const keys = (available: (type: string) => boolean) => groupWithCandidates(doc, { key: 'a', widgetIds: ['a'] }, typeLabel, available).map((c) => c.key);
    expect(keys((type) => type !== 'w.b')).toEqual(['g', 'e', 'x']);
    // A group whose members are all unavailable is not on screen either.
    expect(keys((type) => type !== 'w.c' && type !== 'w.d')).toEqual(['b', 'e', 'x']);
    const item = groupWithMenuItem({ doc: () => doc, self: { key: 'p', widgetIds: ['p'] }, movingIds: ['p'], isAvailable: () => false, dispatch: () => {} });
    expect(item.items!.map((row) => row.label)).toEqual(['No other widget in this zone']);
  });

  it('a lone or locked owner: a disabled note / a disabled row', () => {
    const doc = fixture();
    const lone = groupWithMenuItem({ doc: () => doc, self: { key: 'p', widgetIds: ['p'] }, movingIds: ['p'], dispatch: () => {} });
    expect(lone.items).toEqual([expect.objectContaining({ label: 'No other widget in this zone', disabled: true })]);
    const locked = groupWithMenuItem({ doc: () => doc, self: { key: 'x', widgetIds: ['x'] }, movingIds: ['x'], locked: true, dispatch: () => {} });
    expect(locked.disabled).toBe(true);
  });

  it('a group’s own menu merges all its members with the neighbour', () => {
    const doc = fixture();
    const dispatch = vi.fn();
    const item = groupWithMenuItem({ doc: () => doc, self: { key: 'g', widgetIds: ['c', 'd'] }, movingIds: ['c', 'd'], typeLabel, dispatch });
    item.items!.find((row) => row.label === 'Echo')!.run();
    expect(zoneOrder(run(doc, [dispatch.mock.calls[0][0]]), 'top.right')).toEqual(['a', 'b', expect.stringMatching(/\[c\+d\+e\]$/), 'x']);
  });
});

describe('labels', () => {
  it('widgetDisplayLabel: state.label, then the catalog label, then one from the type', () => {
    expect(widgetDisplayLabel({ type: 'axis.cpu', state: { label: 'Load' } }, () => 'CPU load')).toBe('Load');
    expect(widgetDisplayLabel({ type: 'axis.cpu' }, () => 'CPU load')).toBe('CPU load');
    expect(widgetDisplayLabel({ type: 'axis.cpu' })).toBe('Axis Cpu');
  });

  it('widgetUnitLabel joins a group’s members', () => {
    const layout = selectActiveLayout(fixture());
    expect(widgetUnitLabel(layout, { groupId: 'g', widgetIds: [] })).toBe('W C + W D');
    expect(widgetUnitLabel(undefined, { widgetIds: ['a'] })).toBe('Widget');
  });

  it('widgetDropLabel names what a release does', () => {
    const names = { zone: (zone: string) => (zone === 'top.right' ? 'Top right' : zone), unit: () => 'Tuner' };
    expect(widgetDropLabel({ kind: 'group', target: { key: 't', widgetIds: ['t'], zone: 'top.right' } }, names)).toBe('Group with Tuner');
    expect(widgetDropLabel({ kind: 'reorder', groupId: 'g', index: 0, memberOrder: [] }, names)).toBe('Reorder in group');
    expect(widgetDropLabel({ kind: 'insert', zone: 'top.right', unitIndex: 0 }, names)).toBe('Insert · Top right');
    expect(widgetDropLabel({ kind: 'edge', region: 'left' }, names)).toBe('New panel in left');
    expect(widgetDropLabel(null)).toBeUndefined();
  });
});
