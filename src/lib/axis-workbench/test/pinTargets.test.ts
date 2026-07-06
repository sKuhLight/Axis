import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  createWorkbenchController,
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  panelWidgetZoneId,
  type WorkbenchParameterSource
} from '../../workbench';
import { createAxisPinSelectedParametersAction } from '../axisParameterActions';
import { AXIS_PARAM_CONTROL_BINDING } from '../axisWorkbenchBindings';
import { axisCustomPanelPinTargets, axisPinTargets, NEW_CUSTOM_PANEL_TARGET } from '../pinTargets';
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

describe('axis pin targets', () => {
  it('returns only the new-panel sentinel when no custom panels exist', () => {
    const controller = newController();
    expect(axisCustomPanelPinTargets(controller.document)).toEqual([]);
    expect(axisPinTargets(controller.document)).toEqual([NEW_CUSTOM_PANEL_TARGET]);
  });

  it('lists existing custom panels with widget counts, new-panel last', async () => {
    const controller = newController();
    const pin = createAxisPinSelectedParametersAction(() => [source('1', 'Gain'), source('2', 'Level')]);
    await pin.run({ controller, source: 'menu', args: { title: 'My Panel' } });

    const targets = axisPinTargets(controller.document);
    expect(targets).toHaveLength(2);
    expect(targets[0].panelId).not.toBeNull();
    expect(targets[0].label).toBe('My Panel');
    expect(targets[0].widgetCount).toBe(2);
    expect(targets[1]).toEqual(NEW_CUSTOM_PANEL_TARGET);
  });
});

describe('axis pin menu items', () => {
  it('separates the new-panel entry and routes picks to the callback', async () => {
    const controller = newController();
    const pin = createAxisPinSelectedParametersAction(() => [source('1', 'Gain')]);
    await pin.run({ controller, source: 'menu', args: { title: 'Panel A' } });

    const picked: (string | null)[] = [];
    const items = buildAxisPinMenuItems(controller.document, (t) => picked.push(t.panelId));

    expect(items.map((i) => i.label)).toEqual(['Panel A', 'New custom panel']);
    expect(items[0].separatorBefore).toBeFalsy();
    expect(items[1].separatorBefore).toBe(true);
    expect(items[1].id).toBe('pin.new');

    items[0].run();
    items[1].run();
    expect(picked).toHaveLength(2);
    expect(picked[0]).not.toBeNull();
    expect(picked[1]).toBeNull();
  });
});

describe('pin action appends into an existing custom panel', () => {
  it('adds widgets to the named panel zone instead of creating a new panel', async () => {
    const controller = newController();
    const seed = createAxisPinSelectedParametersAction(() => [source('1', 'Gain')]);
    await seed.run({ controller, source: 'menu', args: { title: 'Target' } });

    const layout0 = selectActiveLayout(controller.document)!;
    const panel = Object.values(layout0.panels).find((p) => p.type === 'axis.customPanel')!;
    const panelCountBefore = Object.values(layout0.panels).length;

    const append = createAxisPinSelectedParametersAction(() => [source('2', 'Level')]);
    await append.run({ controller, source: 'menu', args: { paramId: 2, panelId: panel.id } });

    const layout1 = selectActiveLayout(controller.document)!;
    // no new panel created
    expect(Object.values(layout1.panels)).toHaveLength(panelCountBefore);
    const widgets = selectVisibleWidgetsByZone(controller.document, panelWidgetZoneId(panel.id));
    expect(widgets.map((w) => w.binding?.target.paramId)).toEqual([1, 2]);
  });

  it('falls back to a new panel when the named panel is not a custom panel', async () => {
    const controller = newController();
    const append = createAxisPinSelectedParametersAction(() => [source('3', 'Bass')]);
    await append.run({ controller, source: 'menu', args: { paramId: 3, panelId: 'does.not.exist' } });

    const layout = selectActiveLayout(controller.document)!;
    expect(Object.values(layout.panels).filter((p) => p.type === 'axis.customPanel')).toHaveLength(1);
  });
});
