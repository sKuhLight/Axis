import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  createWorkbenchController,
  type WorkbenchParameterSource
} from '../../workbench';
import { createAxisPinSelectedParametersAction } from '../axisParameterActions';
import { AXIS_PARAM_CONTROL_BINDING } from '../axisWorkbenchBindings';
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

    let picks = 0;
    const items = buildAxisPinMenuItems(controller.document, () => { picks += 1; });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('pin.myControls');
    expect(items[0].label).toBe('Pin to My Controls');
    expect(items[0].hint).toBe('1');

    items[0].run();
    expect(picks).toBe(1);
  });
});
