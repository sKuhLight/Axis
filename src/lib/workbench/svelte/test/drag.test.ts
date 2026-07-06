import { describe, expect, it } from 'vitest';
import {
  panelDropCommand,
  rectContainsPointer,
  splitIntentFromRect,
  widgetDropCommand,
  widgetDropIndex,
  zoneAtPointer
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
});
