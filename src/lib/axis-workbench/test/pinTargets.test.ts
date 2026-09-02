import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  createWorkbenchController,
  type WorkbenchParameterSource
} from '../../workbench';
import { createAxisPinSelectedParametersAction } from '../axisParameterActions';
import { AXIS_PARAM_CONTROL_BINDING } from '../axisWorkbenchBindings';
import { AXIS_MY_CONTROLS_ZONE } from '../myControlsPanel';
import { createAxisSectionHeaderWidget } from '../myControlsSections';
import { axisPinTarget } from '../pinTargets';
import { buildAxisPinMenuItems } from '../pinMenu';

function source(id: string, label: string): WorkbenchParameterSource {
  return {
    id,
    label,
    preferredWidgetType: 'axis.paramControl',
    binding: {
      kind: AXIS_PARAM_CONTROL_BINDING,
      version: 1,
      target: { effectId: 10, paramId: Number(id), block: 'Amp 1', param: label, label }
    }
  };
}

function newController() {
  return createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
}

describe('axis pin target', () => {
  it('is always My Controls, with a zero count before anything is pinned', () => {
    expect(axisPinTarget(newController().document)).toEqual({ label: 'Pin to My Controls', widgetCount: 0 });
  });

  it('reports how many controls are pinned', async () => {
    const controller = newController();
    await createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]).run({
      controller,
      source: 'menu'
    });

    expect(axisPinTarget(controller.document).widgetCount).toBe(2);
  });
});

describe('axis pin menu items', () => {
  it('offers exactly one item and routes the pick to the callback', async () => {
    const controller = newController();
    await createAxisPinSelectedParametersAction(() => [source('1', 'Gain')]).run({ controller, source: 'menu' });

    const picks: (string | null)[] = [];
    const items = buildAxisPinMenuItems(controller.document, (sectionId) => picks.push(sectionId));

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('pin.myControls');
    expect(items[0].label).toBe('Pin to My Controls');
    expect(items[0].hint).toBe('1');

    items[0].run();
    expect(picks).toEqual([null]);
  });

  it('adds one item per named section, each routing its own header id', async () => {
    const controller = newController();
    const amp = createAxisSectionHeaderWidget('Amp');
    controller.dispatch({ type: 'widget.add', widget: amp, zone: AXIS_MY_CONTROLS_ZONE, index: 0 });
    await createAxisPinSelectedParametersAction(() => [source('1', 'Gain')]).run({
      controller,
      source: 'menu',
      args: { sectionId: amp.id }
    });
    // A bare divider names nothing, so it is not offered as a target.
    const divider = createAxisSectionHeaderWidget('');
    controller.dispatch({ type: 'widget.add', widget: divider, zone: AXIS_MY_CONTROLS_ZONE, index: 2 });

    const picks: (string | null)[] = [];
    const items = buildAxisPinMenuItems(controller.document, (sectionId) => picks.push(sectionId));

    expect(items.map((item) => item.label)).toEqual(['Pin to My Controls (end)', 'Amp']);
    expect(items[1].hint).toBe('1');
    expect(items[1].separatorBefore).toBe(true);

    items[1].run();
    items[0].run();
    expect(picks).toEqual([amp.id, null]);
  });
});
