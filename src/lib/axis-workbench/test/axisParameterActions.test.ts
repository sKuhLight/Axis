import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  createWorkbenchController,
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  type WorkbenchParameterSource
} from '../../workbench';
import {
  AXIS_PIN_SELECTED_PARAMETERS_ACTION,
  createAxisPinSelectedParametersAction
} from '../axisParameterActions';
import { AXIS_PARAM_CONTROL_BINDING } from '../axisWorkbenchBindings';
import { AXIS_MY_CONTROLS_PANEL_ID, AXIS_MY_CONTROLS_ZONE } from '../myControlsPanel';

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

const newController = () =>
  createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));

const pinnedParamIds = (controller: ReturnType<typeof newController>) =>
  selectVisibleWidgetsByZone(controller.document, AXIS_MY_CONTROLS_ZONE).map((w) => w.binding?.target.paramId);

describe('Axis parameter Workbench actions', () => {
  it('pins selected parameter sources into My Controls through reducer commands', async () => {
    const controller = newController();
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]);

    expect(action.id).toBe(AXIS_PIN_SELECTED_PARAMETERS_ACTION);
    await action.run({ controller, source: 'menu' });

    const layout = selectActiveLayout(controller.document)!;
    expect(layout.panels[AXIS_MY_CONTROLS_PANEL_ID]?.title).toBe('My Controls');
    expect(layout.zones[AXIS_MY_CONTROLS_ZONE]).toBeDefined();
    expect(Object.values(layout.widgets).map((w) => w.type)).toEqual(['axis.paramControl', 'axis.paramControl']);
    expect(pinnedParamIds(controller)).toEqual([1, 2]);
  });

  it('never creates a second pin destination — repeat pins append to the same panel', async () => {
    const controller = newController();
    await createAxisPinSelectedParametersAction(() => [source('1', 'Gain')]).run({ controller, source: 'menu' });
    const panelsAfterFirst = Object.keys(selectActiveLayout(controller.document)!.panels).length;

    await createAxisPinSelectedParametersAction(() => [source('2', 'Level')]).run({ controller, source: 'menu' });

    expect(Object.keys(selectActiveLayout(controller.document)!.panels)).toHaveLength(panelsAfterFirst);
    expect(pinnedParamIds(controller)).toEqual([1, 2]);
  });

  it('ignores panelId and title args — they cannot redirect a pin', async () => {
    const controller = newController();
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain')]);

    await action.run({ controller, source: 'menu', args: { panelId: 'somewhere.else', title: 'Quick Pin' } });

    const layout = selectActiveLayout(controller.document)!;
    expect(Object.keys(layout.panels)).toEqual([AXIS_MY_CONTROLS_PANEL_ID]);
    expect(layout.panels[AXIS_MY_CONTROLS_PANEL_ID].title).toBe('My Controls');
  });

  it('honours the source limit', async () => {
    const controller = newController();
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]);

    await action.run({ controller, source: 'menu', args: { limit: 1 } });

    expect(pinnedParamIds(controller)).toEqual([1]);
  });

  it('pins a specific parameter source by paramId', async () => {
    const controller = newController();
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]);

    await action.run({ controller, source: 'host', args: { paramId: 2 } });

    const widgets = selectVisibleWidgetsByZone(controller.document, AXIS_MY_CONTROLS_ZONE);
    expect(widgets.map((w) => w.binding?.target.paramId)).toEqual([2]);
    expect(widgets[0]?.state?.label).toBe('Level');
  });

  it('pins multiple parameter sources in requested paramId order', async () => {
    const controller = newController();
    const action = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level'), source('3', 'Bass')]);

    await action.run({ controller, source: 'host', args: { paramIds: [3, 1] } });

    expect(pinnedParamIds(controller)).toEqual([3, 1]);
  });

  it('activates the My Controls tab so the pin is visible', async () => {
    const controller = newController();
    await createAxisPinSelectedParametersAction(() => [source('1', 'Gain')]).run({ controller, source: 'menu' });

    const layout = selectActiveLayout(controller.document)!;
    const right = layout.pages[layout.activePageId].dock.root.right;
    expect(right?.kind).toBe('tabs');
    if (right?.kind === 'tabs') expect(right.activePanelId).toBe(AXIS_MY_CONTROLS_PANEL_ID);
  });

  it('does nothing when no parameter source is available', async () => {
    const controller = newController();
    const action = createAxisPinSelectedParametersAction(() => []);

    await action.run({ controller, source: 'menu' });

    expect(Object.values(selectActiveLayout(controller.document)!.panels)).toHaveLength(0);
  });
});
