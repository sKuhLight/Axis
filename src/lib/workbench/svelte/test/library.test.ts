import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument, reduceWorkbenchDocument, selectActiveLayout, type WidgetTemplate } from '../../core';
import {
  createPanelTemplateFromPanel,
  createWidgetTemplateFromGroup,
  createWidgetTemplateFromWidget,
  createWidgetTemplateFromWidgets,
  instantiatePanelTemplateCommands,
  instantiateWidgetTemplateCommands,
  labelFromWorkbenchType
} from '../library';

describe('Workbench library helpers', () => {
  it('humanizes type identifiers for compact labels', () => {
    expect(labelFromWorkbenchType('axis.presetBrowser')).toBe('Axis PresetBrowser');
    expect(labelFromWorkbenchType('axis.widget.block-size')).toBe('Block Size');
  });

  it('creates panel add commands with collision-safe ids', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'panel.add',
      panel: { id: 'panel.history', type: 'test.history', title: 'History', locked: true, closable: false },
      region: 'main'
    }).next;

    const commands = instantiatePanelTemplateCommands(doc, {
      id: 'template.history',
      title: 'History',
      panels: {
        'panel.history': { id: 'panel.history', type: 'test.history', title: 'History', locked: true, closable: false }
      }
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: 'panel.add',
      panel: { id: 'panel.history.copy1', locked: false, closable: false },
      region: 'main'
    });
  });

  it('remaps widgets in saved panel templates to the cloned panel zone', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'panel.add',
      panel: { id: 'panel.custom', type: 'test.custom', title: 'Custom' },
      region: 'main'
    }).next;

    const commands = instantiatePanelTemplateCommands(doc, {
      id: 'template.custom',
      title: 'Custom Panel',
      panels: {
        'panel.custom': { id: 'panel.custom', type: 'test.custom', title: 'Custom' }
      },
      widgets: {
        'widget.a': { id: 'widget.a', type: 'test.a', zone: 'panel:panel.custom', order: 0, size: 'default', groupId: 'group.a' },
        'widget.b': { id: 'widget.b', type: 'test.b', zone: 'panel:panel.custom', order: 1, size: 'default', groupId: 'group.a' }
      },
      widgetGroups: {
        'group.a': { id: 'group.a', widgetIds: ['widget.a', 'widget.b'] }
      }
    });

    let next = doc;
    for (const command of commands) next = reduceWorkbenchDocument(next, command).next;
    const layout = selectActiveLayout(next)!;

    expect(commands.map((command) => command.type)).toEqual(['zone.ensure', 'panel.add', 'widget.add', 'widget.add', 'widget.group']);
    expect(layout.panels['panel.custom.copy1']).toBeDefined();
    expect(layout.zones['panel:panel.custom.copy1']).toBeDefined();
    expect(layout.widgets['widget.a'].zone).toBe('panel:panel.custom.copy1');
    expect(layout.widgets['widget.b'].groupId).toBe('group.a');
  });

  it('creates an owned widget zone for empty custom panel templates', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const commands = instantiatePanelTemplateCommands(doc, {
      id: 'template.custom',
      title: 'Custom Panel',
      panels: {
        'panel.custom': { id: 'panel.custom', type: 'axis.customPanel', title: 'Custom' }
      }
    });

    let next = doc;
    for (const command of commands) next = reduceWorkbenchDocument(next, command).next;
    const layout = selectActiveLayout(next)!;

    expect(commands.map((command) => command.type)).toEqual(['zone.ensure', 'panel.add']);
    expect(layout.zones['panel:panel.custom']).toMatchObject({ orientation: 'free', acceptsGroups: true });
  });

  it('creates saved panel templates from panel-zone widgets and groups', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'panel.add',
      panel: { id: 'panel.custom', type: 'test.custom', title: 'Custom' },
      region: 'main'
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: { id: 'widget.a', type: 'test.a', zone: 'panel:panel.custom', order: 0, size: 'default' },
      zone: 'panel:panel.custom'
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: { id: 'widget.b', type: 'test.b', zone: 'panel:panel.custom', order: 1, size: 'compact' },
      zone: 'panel:panel.custom'
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.group',
      groupId: 'group.custom',
      widgetIds: ['widget.a', 'widget.b'],
      zone: 'panel:panel.custom'
    }).next;

    const template = createPanelTemplateFromPanel(doc, 'panel.custom');

    expect(template?.id).toBe('template.panel.custom');
    expect(Object.keys(template?.widgets ?? {})).toEqual(['widget.a', 'widget.b']);
    expect(template?.widgetGroups?.['group.custom'].widgetIds).toEqual(['widget.a', 'widget.b']);
  });

  it('creates saved widget templates from a single widget without leaking partial group state', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: { id: 'widget.a', type: 'test.a', zone: 'top.left', order: 0, size: 'default', groupId: 'group.a' },
      zone: 'top.left'
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: { id: 'widget.b', type: 'test.b', zone: 'top.left', order: 1, size: 'default', groupId: 'group.a' },
      zone: 'top.left'
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.group',
      groupId: 'group.a',
      widgetIds: ['widget.a', 'widget.b'],
      zone: 'top.left'
    }).next;

    const template = createWidgetTemplateFromWidget(doc, 'widget.a');

    expect(template?.id).toBe('template.widget.a');
    expect(template?.widgets['widget.a'].groupId).toBeNull();
    expect(template?.widgetGroups).toEqual({});
  });

  it('creates saved widget templates from complete groups', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: { id: 'widget.tuner', type: 'test.tuner', zone: 'top.right', order: 0, size: 'default' },
      zone: 'top.right'
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.add',
      widget: { id: 'widget.tempo', type: 'test.tempo', zone: 'top.right', order: 1, size: 'compact' },
      zone: 'top.right'
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'widget.group',
      groupId: 'group.tools',
      widgetIds: ['widget.tuner', 'widget.tempo'],
      zone: 'top.right'
    }).next;

    const groupTemplate = createWidgetTemplateFromGroup(doc, 'group.tools');
    const explicitTemplate = createWidgetTemplateFromWidgets(doc, ['widget.tempo', 'widget.tuner'], 'Tools');

    expect(groupTemplate?.title).toBe('Test Tuner + Test Tempo');
    expect(groupTemplate?.widgets['widget.tuner'].groupId).toBe('group.tools');
    expect(groupTemplate?.widgetGroups?.['group.tools'].widgetIds).toEqual(['widget.tuner', 'widget.tempo']);
    expect(explicitTemplate?.title).toBe('Tools');
    expect(Object.keys(explicitTemplate?.widgets ?? {})).toEqual(['widget.tuner', 'widget.tempo']);
  });

  // V13a: the split panel/widget browsers dropped the global TARGET dropdowns.
  // Click-to-add is now contextual — panels default to the main region and
  // widgets default to the top.right zone. These lock in the defaults the
  // browsers rely on so the split can't silently regress the drop target.
  it('adds a panel template to the main region by default (Panels browser)', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'panel.add',
      panel: { id: 'panel.seed', type: 'test.seed', title: 'Seed' },
      region: 'left'
    }).next;

    const commands = instantiatePanelTemplateCommands(doc, {
      id: 'template.custom',
      title: 'Custom',
      panels: { 'panel.custom': { id: 'panel.custom', type: 'test.custom', title: 'Custom' } }
    });

    const add = commands.find((command) => command.type === 'panel.add');
    expect(add).toMatchObject({ type: 'panel.add', region: 'main' });
  });

  it('adds a widget template to the top.right zone by default (Widgets browser)', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const template: WidgetTemplate = {
      id: 'template.solo',
      title: 'Solo',
      widgets: {
        'widget.solo': { id: 'widget.solo', type: 'test.solo', zone: 'top.left', order: 0, size: 'default' }
      }
    };

    const commands = instantiateWidgetTemplateCommands(doc, template, { zone: 'top.right' });
    let next = doc;
    for (const command of commands) next = reduceWorkbenchDocument(next, command).next;
    const layout = selectActiveLayout(next)!;

    expect(layout.widgets['widget.solo'].zone).toBe('top.right');
  });

  it('creates widget add and group commands from widget templates', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const template: WidgetTemplate = {
      id: 'template.tools',
      title: 'Tools',
      widgets: {
        'widget.tuner': { id: 'widget.tuner', type: 'test.tuner', zone: 'top.left', order: 0, size: 'default', groupId: 'group.tools' },
        'widget.tempo': { id: 'widget.tempo', type: 'test.tempo', zone: 'top.left', order: 1, size: 'compact', groupId: 'group.tools' }
      },
      widgetGroups: {
        'group.tools': { id: 'group.tools', widgetIds: ['widget.tuner', 'widget.tempo'] }
      }
    };

    const commands = instantiateWidgetTemplateCommands(doc, template, { zone: 'top.right' });
    let next = doc;
    for (const command of commands) next = reduceWorkbenchDocument(next, command).next;
    const layout = selectActiveLayout(next)!;

    expect(commands.map((command) => command.type)).toEqual(['widget.add', 'widget.add', 'widget.group']);
    expect(layout.widgets['widget.tuner'].zone).toBe('top.right');
    expect(layout.widgets['widget.tempo'].groupId).toBe('group.tools');
    expect(layout.widgetGroups['group.tools'].widgetIds).toEqual(['widget.tuner', 'widget.tempo']);
  });
});
