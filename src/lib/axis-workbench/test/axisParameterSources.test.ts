import { describe, expect, it } from 'vitest';
import { createCustomPanelFromParameterSourcesCommands, createEmptyWorkbenchDocument } from '../../workbench';
import {
  axisParameterSourceFromEnumParam,
  axisParameterSourceFromEditorParamId,
  axisParameterSourceFromNamedParam,
  axisParameterSourcesFromEditorView
} from '../axisParameterSources';
import { AXIS_PARAM_CONTROL_BINDING } from '../axisWorkbenchBindings';

describe('Axis parameter source adapter', () => {
  it('creates a parameter source from a named parameter without storing live values', () => {
    const source = axisParameterSourceFromNamedParam({
      effectId: 101,
      block: 'Amp 1',
      param: {
        id: 7,
        name: 'Input Drive',
        value: 6.2,
        norm: 0.62,
        unit: 'dB'
      }
    });

    expect(source).toMatchObject({
      id: 'axis.param.101.7',
      label: 'Input Drive',
      preferredWidgetType: 'axis.paramControl',
      binding: {
        kind: AXIS_PARAM_CONTROL_BINDING,
        version: 1,
        target: {
          effectId: 101,
          paramId: 7,
          block: 'Amp 1',
          param: 'Input Drive',
          label: 'Input Drive'
        }
      }
    });
    expect(JSON.stringify(source?.binding.target)).not.toContain('6.2');
    expect(JSON.stringify(source?.binding.target)).not.toContain('0.62');
    expect(JSON.stringify(source?.binding.target)).not.toContain('value');
    expect(JSON.stringify(source?.binding.target)).not.toContain('norm');
  });

  it('creates a parameter source from an enum parameter without storing current enum state', () => {
    const source = axisParameterSourceFromEnumParam({
      effectId: 102,
      block: 'Drive 1',
      param: {
        id: 12,
        name: 'Clip Type',
        value: 3,
        options: [{ value: 3, label: 'LED' }]
      }
    });

    expect(source.binding.target).toEqual({
      effectId: 102,
      paramId: 12,
      block: 'Drive 1',
      param: 'Clip Type',
      label: 'Clip Type'
    });
    expect(JSON.stringify(source.binding.target)).not.toContain('LED');
  });

  it('tags each source with its block category accent so the widget stays block-owned', () => {
    const sources = axisParameterSourcesFromEditorView({
      selected: { effectId: 30, display: 'Drive 1', pack: 'Drive' },
      params: [{ id: 1, name: 'Gain', value: 5, norm: 0.5 }],
      enums: [{ id: 2, name: 'Type', value: 1, options: [] }]
    });

    // Drive's catalog accent — the same hue the Block Editor tints Drive controls.
    expect(sources[0].state?.color).toBe('#d6543f');
    expect(sources[1].state?.color).toBe('#d6543f');
    // presentation-only: the identity binding target carries no color
    expect(sources[0].binding.target.color).toBeUndefined();
    // pinned params default to the touch-friendly full size
    expect(sources[0].defaultSize).toBe('default');
  });

  it('creates sources from the selected editor view in stable order', () => {
    const sources = axisParameterSourcesFromEditorView({
      selected: { effectId: 20, display: 'Delay 1' },
      params: [
        { id: 1, name: 'Mix', value: 25, norm: 0.25 },
        { id: undefined, name: 'Ignored', value: 0 }
      ],
      enums: [{ id: 2, name: 'Type', value: 1, options: [] }]
    });

    expect(sources.map((source) => source.id)).toEqual(['axis.param.20.1', 'axis.param.20.2']);
  });

  it('creates a single drag source from a selected editor param id', () => {
    const view = {
      selected: { effectId: 20, display: 'Delay 1' },
      params: [{ id: 1, name: 'Mix', value: 25, norm: 0.25 }],
      enums: [{ id: 2, name: 'Type', value: 1, options: [] }]
    };

    expect(axisParameterSourceFromEditorParamId(view, 1)?.binding.target.paramId).toBe(1);
    expect(axisParameterSourceFromEditorParamId(view, 2)?.binding.target.paramId).toBe(2);
    expect(axisParameterSourceFromEditorParamId(view, 99)).toBeNull();
  });

  it('feeds generic custom panel insertion commands', () => {
    const source = axisParameterSourceFromNamedParam({
      effectId: 101,
      block: 'Amp 1',
      param: { id: 7, name: 'Input Drive', value: 6.2, norm: 0.62 }
    });

    const commands = createCustomPanelFromParameterSourcesCommands(
      createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }),
      source ? [source] : [],
      { panelId: 'panel.param' }
    );

    expect(commands.map((command) => command.type)).toEqual(['zone.ensure', 'panel.add', 'widget.add']);
    expect(commands[2]).toMatchObject({
      type: 'widget.add',
      widget: {
        type: 'axis.paramControl',
        binding: { kind: AXIS_PARAM_CONTROL_BINDING }
      },
      zone: 'panel:panel.param'
    });
  });
});
