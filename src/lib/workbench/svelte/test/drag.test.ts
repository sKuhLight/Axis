import { describe, expect, it } from 'vitest';
import { panelDropCommand, splitIntentFromRect, widgetDropCommand, widgetDropIndex } from '../drag';

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
});
