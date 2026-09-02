import { describe, expect, it } from 'vitest';
import {
  createEmptyWorkbenchDocument,
  createWorkbenchController,
  selectVisibleWidgetsByZone,
  type WorkbenchController,
  type WorkbenchParameterSource
} from '../../workbench';
import { createAxisPinSelectedParametersAction } from '../axisParameterActions';
import { AXIS_PARAM_CONTROL_BINDING } from '../axisWorkbenchBindings';
import { AXIS_MY_CONTROLS_ZONE } from '../myControlsPanel';
import {
  axisMyControlsSectionInsertIndex,
  axisMyControlsSections,
  axisMyControlsWidgetCount,
  axisSectionHeaderLabel,
  createAxisSectionHeaderWidget,
  isAxisSectionHeader
} from '../myControlsSections';

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

/** Append a section marker at the end of the zone and return its widget id. */
function addSection(controller: WorkbenchController, label: string): string {
  const widget = createAxisSectionHeaderWidget(label);
  controller.dispatch({
    type: 'widget.add',
    widget,
    zone: AXIS_MY_CONTROLS_ZONE,
    index: selectVisibleWidgetsByZone(controller.document, AXIS_MY_CONTROLS_ZONE).length
  });
  return widget.id;
}

async function pin(controller: WorkbenchController, id: string, label: string, sectionId?: string) {
  await createAxisPinSelectedParametersAction(() => [source(id, label)]).run({
    controller,
    source: 'menu',
    args: sectionId ? { sectionId } : undefined
  });
}

/** Zone contents as `label` strings, in order — headers included. */
function zoneLabels(controller: WorkbenchController): string[] {
  return selectVisibleWidgetsByZone(controller.document, AXIS_MY_CONTROLS_ZONE).map((widget) =>
    isAxisSectionHeader(widget) ? `# ${axisSectionHeaderLabel(widget) || '—'}` : String(widget.state?.label ?? '?')
  );
}

describe('section header widgets', () => {
  it('spans the full grid row whatever the panel column count is', () => {
    expect(createAxisSectionHeaderWidget('Amp').state).toMatchObject({ label: 'Amp', grid: { colSpan: 'full' } });
  });

  it('treats a blank label as a divider rather than a named section', () => {
    const controller = newController();
    addSection(controller, '');

    expect(axisMyControlsSections(controller.document)).toEqual([]);
  });
});

describe('axisMyControlsWidgetCount', () => {
  it('counts controls only — headers are chrome and must not inflate the pin hint', async () => {
    const controller = newController();
    await pin(controller, '1', 'Gain');
    addSection(controller, 'Drive');
    await pin(controller, '2', 'Level');

    expect(axisMyControlsWidgetCount(controller.document)).toBe(2);
  });
});

describe('axisMyControlsSections', () => {
  it('is empty for a panel with no headers', async () => {
    const controller = newController();
    await pin(controller, '1', 'Gain');

    expect(axisMyControlsSections(controller.document)).toEqual([]);
  });

  it('reports each named section with the controls that follow it', async () => {
    const controller = newController();
    const amp = addSection(controller, 'Amp');
    await pin(controller, '1', 'Gain');
    await pin(controller, '2', 'Master');
    const drive = addSection(controller, 'Drive');
    await pin(controller, '3', 'Level');

    expect(axisMyControlsSections(controller.document)).toEqual([
      { headerWidgetId: amp, label: 'Amp', controlCount: 2, endIndex: 3 },
      { headerWidgetId: drive, label: 'Drive', controlCount: 1, endIndex: 5 }
    ]);
  });

  it('does not credit a section with controls that sit past a divider', async () => {
    const controller = newController();
    const amp = addSection(controller, 'Amp');
    await pin(controller, '1', 'Gain');
    addSection(controller, '');
    await pin(controller, '2', 'Loose');

    const sections = axisMyControlsSections(controller.document);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ headerWidgetId: amp, controlCount: 1, endIndex: 2 });
  });

  it('reports an empty section for a header with nothing under it', async () => {
    const controller = newController();
    await pin(controller, '1', 'Gain');
    const empty = addSection(controller, 'Empty');

    expect(axisMyControlsSections(controller.document)).toEqual([
      { headerWidgetId: empty, label: 'Empty', controlCount: 0, endIndex: 2 }
    ]);
  });

  it('ignores controls above the first header', async () => {
    const controller = newController();
    await pin(controller, '1', 'Loose');
    const amp = addSection(controller, 'Amp');
    await pin(controller, '2', 'Gain', amp);

    expect(axisMyControlsSections(controller.document)).toEqual([
      { headerWidgetId: amp, label: 'Amp', controlCount: 1, endIndex: 3 }
    ]);
  });
});

describe('axisMyControlsSectionInsertIndex', () => {
  it('appends to the end of the panel with no section chosen', async () => {
    const controller = newController();
    await pin(controller, '1', 'Gain');

    expect(axisMyControlsSectionInsertIndex(controller.document, null)).toBe(1);
  });

  it('falls back to the end for a header that is no longer there', async () => {
    const controller = newController();
    await pin(controller, '1', 'Gain');

    expect(axisMyControlsSectionInsertIndex(controller.document, 'widget-gone')).toBe(1);
  });

  it('lands a pin at the end of its section, before the next header', async () => {
    const controller = newController();
    const amp = addSection(controller, 'Amp');
    await pin(controller, '1', 'Gain');
    addSection(controller, 'Drive');
    await pin(controller, '2', 'Level');

    await pin(controller, '3', 'Master', amp);

    expect(zoneLabels(controller)).toEqual(['# Amp', 'Gain', 'Master', '# Drive', 'Level']);
  });
});
