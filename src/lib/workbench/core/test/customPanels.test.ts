import { describe, expect, it } from 'vitest';
import {
  createBoundWidgetCommand,
  createCustomPanelCommands,
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
    expect(layout.zones['panel:panel.custom']).toMatchObject({ label: 'Performance', orientation: 'free', acceptsGroups: true });
    expect(layout.dock.root.right?.kind).toBe('tabs');
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
});
