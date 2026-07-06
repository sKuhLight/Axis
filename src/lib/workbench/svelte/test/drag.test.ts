import { describe, expect, it } from 'vitest';
import {
  anchoredWidgetIndex,
  panelDropCommand,
  rectContainsPointer,
  splitIntentFromRect,
  widgetDropCommand,
  widgetDropIndex,
  widgetIndexForUnitIndex,
  zoneAtPointer,
  zoneUnitWidgetCounts
} from '../drag';

describe('Workbench drag helpers', () => {
  it('maps panel drop intents to reducer commands', () => {
    expect(panelDropCommand('panel.a', { kind: 'region', region: 'right' })).toEqual({
      type: 'panel.move',
      panelId: 'panel.a',
      to: { kind: 'region', region: 'right' }
    });
    expect(panelDropCommand('panel.a', { kind: 'tab', tabStackId: 'tabs.main', index: 1 })).toEqual({
      type: 'panel.move',
      panelId: 'panel.a',
      to: { kind: 'tab', tabStackId: 'tabs.main', index: 1 }
    });
  });

  it('derives split intent from pointer position near panel edges', () => {
    const rect = { left: 100, top: 100, width: 400, height: 300 };

    expect(splitIntentFromRect({ x: 110, y: 220 }, rect, 'panel.b', 'main')).toEqual({
      kind: 'split',
      region: 'main',
      targetPanelId: 'panel.b',
      axis: 'horizontal',
      position: 'before'
    });
    expect(splitIntentFromRect({ x: 300, y: 220 }, rect, 'panel.b', 'main')).toBeNull();
  });

  it('computes widget insertion index by zone orientation', () => {
    const rects = [
      { left: 0, top: 0, width: 50, height: 30 },
      { left: 60, top: 0, width: 50, height: 30 }
    ];

    expect(widgetDropIndex({ x: 10, y: 10 }, rects, 'horizontal')).toBe(0);
    expect(widgetDropIndex({ x: 55, y: 10 }, rects, 'horizontal')).toBe(1);
    expect(widgetDropIndex({ x: 130, y: 10 }, rects, 'horizontal')).toBe(2);
  });

  it('maps widget drop intents to reducer commands', () => {
    expect(widgetDropCommand(['widget.a'], { zone: 'top.right', index: 2 })).toEqual({
      type: 'widget.move',
      widgetIds: ['widget.a'],
      zone: 'top.right',
      index: 2,
      floatingRect: undefined
    });
  });

  it('detects whether a pointer falls inside a rect (degenerate rects reject)', () => {
    const rect = { left: 10, top: 100, width: 200, height: 40 };
    expect(rectContainsPointer(rect, { x: 50, y: 120 })).toBe(true);
    expect(rectContainsPointer(rect, { x: 50, y: 90 })).toBe(false);
    // A zero-height rect (a bar zone shrunk to no cross-axis size) contains nothing.
    expect(rectContainsPointer({ left: 10, top: 100, width: 200, height: 0 }, { x: 50, y: 100 })).toBe(false);
  });

  // Regression (V13h): the bottom widget BAR must be a widget drop target. The
  // bug was that the bottom zone shrank to its content height, leaving a dead
  // strip of un-zoned bar; a pointer aimed at that strip resolved to no zone and
  // the drop fell through to the workspace edge (new dock panel) instead.
  describe('bottom bar drop-target reachability (V13h)', () => {
    // A footer bar spanning y 700–760. The pointer aims near the top of the
    // visible bar strip (y=706) — inside the bar, but in the dead strip above a
    // content-height zone.
    const pointerOnBar = { x: 300, y: 706 };

    it('does NOT resolve to the bottom zone when it shrank to its content height', () => {
      // Broken: zone section only 30px tall, centred in the 60px bar (y 715–745)
      // → the top of the visible bar strip is above the zone content box.
      const brokenBottom = { left: 120, top: 715, width: 800, height: 30 };
      expect(zoneAtPointer([{ zone: 'bottom', rect: brokenBottom }], pointerOnBar)).toBeNull();
    });

    it('resolves to the bottom zone once it stretches to fill the bar', () => {
      // Fixed: zone section stretches to the full 60px bar height.
      const stretchedBottom = { left: 120, top: 700, width: 800, height: 60 };
      expect(zoneAtPointer([{ zone: 'bottom', rect: stretchedBottom }], pointerOnBar)).toBe('bottom');
    });

    it('prefers the last matching (top-most) zone on overlap', () => {
      const back = { left: 0, top: 0, width: 1000, height: 800 };
      const bottom = { left: 120, top: 700, width: 800, height: 60 };
      expect(zoneAtPointer([{ zone: 'top.left', rect: back }, { zone: 'bottom', rect: bottom }], pointerOnBar)).toBe('bottom');
    });
  });

  // V14 follow-up: zone drops hit-test TOP-LEVEL units (loose widgets + group
  // modules), and the unit index converts to the reducer's widget-order index by
  // summing the widget counts of the units before the gap.
  describe('unit ↔ widget index conversion (in-flow zone gap)', () => {
    // Zone order: loose A · group G(g1,g2,g3) · loose B.
    const zoneWidgets = [
      { id: 'a', groupId: null },
      { id: 'g1', groupId: 'G' },
      { id: 'g2', groupId: 'G' },
      { id: 'g3', groupId: 'G' },
      { id: 'b', groupId: null }
    ];

    it('collapses consecutive same-group widgets into one unit count', () => {
      expect(zoneUnitWidgetCounts(zoneWidgets)).toEqual([1, 3, 1]);
    });

    it('excludes the dragged widget — a partially dragged group counts fewer members', () => {
      expect(zoneUnitWidgetCounts(zoneWidgets, ['g2'])).toEqual([1, 2, 1]);
    });

    it('drops a unit entirely when every widget in it is dragged (whole-group drag)', () => {
      expect(zoneUnitWidgetCounts(zoneWidgets, ['g1', 'g2', 'g3'])).toEqual([1, 1]);
      expect(zoneUnitWidgetCounts(zoneWidgets, ['a'])).toEqual([3, 1]);
    });

    it('converts a unit index to the widget-order index (groups count all members)', () => {
      const counts = zoneUnitWidgetCounts(zoneWidgets); // [1, 3, 1]
      expect(widgetIndexForUnitIndex(counts, 0)).toBe(0); // before A
      expect(widgetIndexForUnitIndex(counts, 1)).toBe(1); // between A and the group
      expect(widgetIndexForUnitIndex(counts, 2)).toBe(4); // after the 3-member group
      expect(widgetIndexForUnitIndex(counts, 3)).toBe(5); // append
    });

    it('clamps an out-of-range unit index to the end', () => {
      expect(widgetIndexForUnitIndex([1, 3, 1], 99)).toBe(5);
      expect(widgetIndexForUnitIndex([1, 3, 1], -2)).toBe(0);
      expect(widgetIndexForUnitIndex([], 2)).toBe(0);
    });
  });

  // V14 follow-up: `widget.group` re-places its whole member block via
  // `placeWidgets(zone, index)` — the index must keep the block ANCHORED where
  // it sits (design zone re-numbering), counted against the zone's NON-moving
  // widgets (the reducer splices into the zone minus the moved ids).
  describe('anchoredWidgetIndex (group block stays put on insert/reorder)', () => {
    // Zone order: a(0) · g1(1) g2(2) [group G, anchor order 1] · b(3).
    const zone = [
      { id: 'a', order: 0 },
      { id: 'g1', order: 1 },
      { id: 'g2', order: 2 },
      { id: 'b', order: 3 }
    ];

    it('anchors a same-group reorder at the group block position', () => {
      // Moving {g1,g2} (reorder): one non-moving widget (a) before order 1.
      expect(anchoredWidgetIndex(zone, ['g1', 'g2'], 1)).toBe(1);
    });

    it('does not count a moving widget that sat before the anchor', () => {
      // Loose `a` dragged INTO the group: a is moving, so nothing non-moving
      // precedes the block — the grown group keeps its slot at the zone start.
      expect(anchoredWidgetIndex(zone, ['g1', 'g2', 'a'], 1)).toBe(0);
    });

    it('counts widgets from before the anchor that are not moving', () => {
      // `b` dragged into the group: a (order 0) still precedes the block.
      expect(anchoredWidgetIndex(zone, ['g1', 'g2', 'b'], 1)).toBe(1);
    });
  });
});
