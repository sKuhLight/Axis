import type { WorkbenchParameterSource } from '../workbench';
import type { EnumParam, NamedParam } from '../types';
import { AXIS_PARAM_CONTROL_BINDING } from './axisWorkbenchBindings';

export interface AxisParameterSourceBase {
  effectId: number;
  block: string;
}

export interface AxisNamedParameterSourceInput extends AxisParameterSourceBase {
  param: NamedParam;
}

export interface AxisEnumParameterSourceInput extends AxisParameterSourceBase {
  param: EnumParam;
}

export interface AxisParameterSourceEditorView {
  selected?: { effectId: number; display?: string } | null;
  params: NamedParam[];
  enums: EnumParam[];
}

function cleanLabel(value: string | undefined, fallback: string): string {
  const label = value?.trim();
  return label ? label : fallback;
}

function sourceId(effectId: number, paramId: number): string {
  return `axis.param.${effectId}.${paramId}`;
}

export function axisParameterSourceFromNamedParam(input: AxisNamedParameterSourceInput): WorkbenchParameterSource | null {
  if (input.param.id == null) return null;
  const label = cleanLabel(input.param.name, 'Parameter');
  const block = cleanLabel(input.block, 'Block');
  return {
    id: sourceId(input.effectId, input.param.id),
    label,
    preferredWidgetType: 'axis.paramControl',
    defaultSize: 'compact',
    binding: {
      kind: AXIS_PARAM_CONTROL_BINDING,
      version: 1,
      target: {
        effectId: input.effectId,
        paramId: input.param.id,
        block,
        param: label,
        label
      }
    },
    state: {
      block,
      label
    }
  };
}

export function axisParameterSourceFromEnumParam(input: AxisEnumParameterSourceInput): WorkbenchParameterSource {
  const label = cleanLabel(input.param.name, 'Parameter');
  const block = cleanLabel(input.block, 'Block');
  return {
    id: sourceId(input.effectId, input.param.id),
    label,
    preferredWidgetType: 'axis.paramControl',
    defaultSize: 'compact',
    binding: {
      kind: AXIS_PARAM_CONTROL_BINDING,
      version: 1,
      target: {
        effectId: input.effectId,
        paramId: input.param.id,
        block,
        param: label,
        label
      }
    },
    state: {
      block,
      label
    }
  };
}

export function axisParameterSourcesFromEditorView(view: AxisParameterSourceEditorView): WorkbenchParameterSource[] {
  const selected = view.selected;
  if (!selected) return [];
  const block = selected.display ?? 'Block';
  return [
    ...view.params
      .map((param) => axisParameterSourceFromNamedParam({ effectId: selected.effectId, block, param }))
      .filter((source): source is WorkbenchParameterSource => !!source),
    ...view.enums.map((param) => axisParameterSourceFromEnumParam({ effectId: selected.effectId, block, param }))
  ];
}

export async function axisParameterSourcesFromCurrentEditor(): Promise<WorkbenchParameterSource[]> {
  const { editor } = await import('../editor.svelte');
  return axisParameterSourcesFromEditorView({
    selected: editor.selected,
    params: editor.params,
    enums: editor.enums
  });
}
