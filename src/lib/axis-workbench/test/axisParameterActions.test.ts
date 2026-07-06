import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  createWorkbenchController,
  selectActiveLayout,
  serializeWorkbenchParameterSource,
  type WorkbenchParameterSource
} from '../../workbench';
import {
  AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION,
  AXIS_PIN_SELECTED_PARAMETERS_ACTION,
  createAxisParameterSourceEdgeDropAction,
  createAxisPinSelectedParametersAction
} from '../axisParameterActions';
import { AXIS_PARAM_CONTROL_BINDING } from '../axisWorkbenchBindings';

const source = (id: string, label: string): WorkbenchParameterSource => ({
  id,
  label,
  preferredWidgetType: 'axis.paramControl',
  binding: {
    kind: AXIS_PARAM_CONTROL_BINDING,
    version: 1,
    target: {
      effectId: 10,
      paramId: Number(id),
      block: 'Amp 1',
      param: label,
      label
    }
  }
});

describe('Axis parameter Workbench actions', () => {
  it('pins selected parameter sources into a custom panel through reducer commands', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]);

    expect(action.id).toBe(AXIS_PIN_SELECTED_PARAMETERS_ACTION);
    await action.run({ controller, source: 'menu' });

    const layout = selectActiveLayout(controller.document)!;
    const panel = Object.values(layout.panels).find((item) => item.type === 'axis.customPanel');
    const widgets = Object.values(layout.widgets);

    expect(panel?.title).toBe('Pinned Parameters');
    expect(panel ? layout.zones[`panel:${panel.id}`] : undefined).toBeDefined();
    expect(widgets.map((widget) => widget.type)).toEqual(['axis.paramControl', 'axis.paramControl']);
    expect(widgets.map((widget) => widget.binding?.target.paramId)).toEqual([1, 2]);
  });

  it('supports action args for title and source limit', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]);

    await action.run({ controller, source: 'menu', args: { title: 'Quick Pin', limit: 1 } });

    const layout = selectActiveLayout(controller.document)!;
    const panel = Object.values(layout.panels).find((item) => item.type === 'axis.customPanel');

    expect(panel?.title).toBe('Quick Pin');
    expect(Object.values(layout.widgets)).toHaveLength(1);
  });

  it('pins a specific parameter source by paramId', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]);

    await action.run({ controller, source: 'host', args: { paramId: 2 } });

    const widgets = Object.values(selectActiveLayout(controller.document)!.widgets);
    expect(widgets.map((widget) => widget.binding?.target.paramId)).toEqual([2]);
    expect(widgets[0]?.state?.label).toBe('Level');
  });

  it('pins multiple parameter sources in requested paramId order', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level'), source('3', 'Bass')]);

    await action.run({ controller, source: 'host', args: { paramIds: [3, 1] } });

    expect(Object.values(selectActiveLayout(controller.document)!.widgets).map((widget) => widget.binding?.target.paramId)).toEqual([3, 1]);
  });

  it('does nothing when no parameter source is available', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const action = createAxisPinSelectedParametersAction(() => []);

    await action.run({ controller, source: 'menu' });

    expect(Object.values(selectActiveLayout(controller.document)!.panels)).toHaveLength(0);
  });

  it('creates an Axis custom panel from a serialized parameter edge drop', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const action = createAxisParameterSourceEdgeDropAction();

    expect(action.id).toBe(AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION);
    await action.run({
      controller,
      source: 'host',
      args: {
        source: serializeWorkbenchParameterSource(source('7', 'Treble')),
        region: 'left'
      }
    });

    const layout = selectActiveLayout(controller.document)!;
    const panel = Object.values(layout.panels).find((item) => item.type === 'axis.customPanel');
    const widgets = Object.values(layout.widgets);

    expect(layout.dock.root.left?.kind).toBe('tabs');
    expect(panel?.title).toBe('Treble');
    expect(widgets).toHaveLength(1);
    expect(widgets[0]?.binding?.target.paramId).toBe(7);
  });

  it('ignores malformed serialized parameter edge drops', async () => {
    const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
    const action = createAxisParameterSourceEdgeDropAction();

    await action.run({ controller, source: 'host', args: { source: '{ nope', region: 'left' } });

    expect(Object.values(selectActiveLayout(controller.document)!.panels)).toHaveLength(0);
  });
});
