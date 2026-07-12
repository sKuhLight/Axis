import { describe, expect, it } from 'vitest';
import {
  createCustomPanelFromParameterSourcesCommands,
  createEmptyWorkbenchDocument,
  createParameterWidgetCommand,
  createParameterWidgetsForZoneCommands,
  parseWorkbenchParameterSource,
  reduceWorkbenchDocument,
  selectActiveLayout,
  serializeWorkbenchParameterSource,
  type WorkbenchParameterSource
} from '../index';

const source = (id: string, label = id): WorkbenchParameterSource => ({
  id,
  label,
  preferredWidgetType: 'test.parameter',
  defaultSize: 'compact',
  binding: {
    kind: 'test.binding',
    version: 1,
    target: {
      id
    }
  },
  state: {
    color: 'blue'
  }
});

describe('Workbench parameter source helpers', () => {
  it('creates a bound widget command for an existing zone', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const command = createParameterWidgetCommand(doc, source('gain', 'Gain'), { zone: 'top.right', index: 2 });

    expect(command).toMatchObject({
      type: 'widget.add',
      zone: 'top.right',
      index: 2,
      widget: {
        type: 'test.parameter',
        zone: 'top.right',
        order: 2,
        size: 'compact',
        binding: { kind: 'test.binding', version: 1, target: { id: 'gain' } },
        state: { label: 'Gain', sourceId: 'gain', color: 'blue' }
      }
    });
  });

  it('creates stable ordered widget commands for multiple sources', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const commands = createParameterWidgetsForZoneCommands(doc, [source('a'), source('b'), source('c')], {
      zone: 'panel:panel.custom',
      index: 4
    });

    expect(commands.map((command) => (command.type === 'widget.add' ? command.index : null))).toEqual([4, 5, 6]);
  });

  it('creates a custom panel and inserts parameter widgets into the owned zone', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const commands = createCustomPanelFromParameterSourcesCommands(doc, [source('gain', 'Gain'), source('level', 'Level')], {
      panelId: 'panel.params',
      panelType: 'test.customPanel',
      region: 'right'
    });

    let next = doc;
    for (const command of commands) next = reduceWorkbenchDocument(next, command).next;
    const layout = selectActiveLayout(next)!;

    expect(commands.map((command) => command.type)).toEqual(['zone.ensure', 'panel.add', 'widget.add', 'widget.add']);
    expect(layout.panels['panel.params']).toBeDefined();
    expect(layout.panels['panel.params'].state).toMatchObject({
      acceptsParameters: true,
      grid: { columns: 4, rowHeight: 42, gap: 8 }
    });
    expect(layout.zones['panel:panel.params']).toBeDefined();
    expect(Object.values(layout.widgets).map((widget) => widget.zone)).toEqual(['panel:panel.params', 'panel:panel.params']);
    expect(Object.values(layout.widgets).map((widget) => widget.binding?.target.id)).toEqual(['gain', 'level']);
  });

  it('serializes and validates parameter source drag payloads', () => {
    const payload = serializeWorkbenchParameterSource(source('gain', 'Gain'));
    expect(parseWorkbenchParameterSource(payload)).toMatchObject({
      id: 'gain',
      label: 'Gain',
      preferredWidgetType: 'test.parameter',
      binding: { kind: 'test.binding', version: 1, target: { id: 'gain' } }
    });
    expect(parseWorkbenchParameterSource('{ nope')).toBeNull();
    expect(parseWorkbenchParameterSource(JSON.stringify({ id: 'bad', label: 'Bad' }))).toBeNull();
  });

  it('does not include live values unless caller explicitly adds them', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const liveishSource: WorkbenchParameterSource = {
      id: 'param',
      label: 'Param',
      binding: {
        kind: 'test.binding',
        version: 1,
        target: {
          effectId: 1,
          paramId: 2
        }
      }
    };
    const command = createParameterWidgetCommand(doc, liveishSource, { zone: 'top.left' });

    expect(command?.type).toBe('widget.add');
    if (command?.type === 'widget.add') {
      expect(JSON.stringify(command.widget)).not.toContain('value');
      expect(JSON.stringify(command.widget)).not.toContain('normalized');
    }
  });
});
