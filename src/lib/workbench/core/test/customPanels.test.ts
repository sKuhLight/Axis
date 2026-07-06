import { describe, expect, it } from 'vitest';
import {
  createBoundWidgetCommand,
  createCustomPanelCommands,
  createCustomPanelFromWidgetsCommands,
  customPanelGridSettings,
  createEmptyWorkbenchDocument,
  isPanelWidgetZone,
  panelIdFromWidgetZone,
  panelWidgetZoneId,
  reduceWorkbenchDocument,
  selectActiveLayout
} from '../index';

describe('custom panel helpers', () => {
  it('maps panel ids and panel widget zones', () => {
    expect(panelWidgetZoneId('panel.a')).toBe('panel:panel.a');
    expect(panelIdFromWidgetZone('panel:panel.a')).toBe('panel.a');
    expect(panelIdFromWidgetZone('top.left')).toBeNull();
    expect(isPanelWidgetZone('panel:panel.a')).toBe(true);
    expect(isPanelWidgetZone('hidden')).toBe(false);
  });

  it('creates reducer commands for a panel and owned widget zone', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const commands = createCustomPanelCommands(doc, {
      id: 'panel.custom',
      type: 'test.customPanel',
      title: 'Performance',
      region: 'right'
    });

    let next = doc;
    for (const command of commands) next = reduceWorkbenchDocument(next, command).next;
    const layout = selectActiveLayout(next)!;

    expect(commands.map((command) => command.type)).toEqual(['zone.ensure', 'panel.add']);
    expect(layout.panels['panel.custom']).toMatchObject({ type: 'test.customPanel', title: 'Performance' });
    expect(layout.panels['panel.custom'].state?.grid).toEqual({ columns: 4, rowHeight: 42, gap: 8 });
    expect(layout.zones['panel:panel.custom']).toMatchObject({ label: 'Performance', orientation: 'free', acceptsGroups: true });
    expect(layout.dock.root.right?.kind).toBe('tabs');
  });

  it('normalizes custom panel grid settings from persisted panel state', () => {
    expect(customPanelGridSettings({ grid: { columns: 12, rowHeight: 56, gap: 10 } })).toEqual({
      columns: 12,
      rowHeight: 56,
      gap: 10
    });
    expect(customPanelGridSettings({ grid: { columns: 99, rowHeight: 2, gap: -4 } })).toEqual({
      columns: 24,
      rowHeight: 24,
      gap: 0
    });
  });

  it('creates collision-safe bound widget add commands', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: {
        id: 'widget.param',
        type: 'test.param',
        zone: 'top.left',
        order: 0,
        size: 'default'
      },
      zone: 'top.left'
    }).next;

    const command = createBoundWidgetCommand(doc, {
      id: 'widget.param',
      type: 'test.param',
      zone: 'panel:panel.custom',
      binding: {
        kind: 'test.binding',
        version: 1,
        target: { id: 'gain' }
      },
      size: 'compact'
    });

    expect(command).toMatchObject({
      type: 'widget.add',
      widget: {
        id: 'widget.param.copy1',
        binding: { kind: 'test.binding', version: 1, target: { id: 'gain' } },
        size: 'compact'
      },
      zone: 'panel:panel.custom'
    });
  });

  it('creates a custom panel and moves existing widgets into its owned zone', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: {
        id: 'widget.gain',
        type: 'test.param',
        zone: 'top.left',
        order: 0,
        size: 'default'
      },
      zone: 'top.left'
    }).next;

    const commands = createCustomPanelFromWidgetsCommands(doc, {
      widgetIds: ['widget.gain'],
      id: 'panel.widgets',
      type: 'test.customPanel',
      title: 'Widget Panel',
      region: 'left'
    });

    let next = doc;
    for (const command of commands) next = reduceWorkbenchDocument(next, command).next;
    const layout = selectActiveLayout(next)!;

    expect(commands.map((command) => command.type)).toEqual(['zone.ensure', 'panel.add', 'widget.move']);
    expect(layout.panels['panel.widgets'].state).toMatchObject({
      acceptsWidgets: true,
      grid: { columns: 4, rowHeight: 42, gap: 8 }
    });
    expect(layout.widgets['widget.gain'].zone).toBe('panel:panel.widgets');
  });
});
