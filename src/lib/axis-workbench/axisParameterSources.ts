import type { WorkbenchParameterSource } from '../workbench';
import type { EnumParam, NamedParam } from '../types';
import { AXIS_PARAM_CONTROL_BINDING } from './axisWorkbenchBindings';
import { catFor } from '../catalog';
import { baseName } from '../blocks';

export interface AxisParameterSourceBase {
  effectId: number;
  block: string;
  /**
   * Category accent for the source block (the SAME hue the Block Editor tints
   * that block's controls with). Carried into the pinned widget's `state.color`
   * so a collected control stays visibly owned by its block. Optional — falls
   * back to the workbench accent token when a caller can't supply one.
   */
  color?: string;
}

export interface AxisNamedParameterSourceInput extends AxisParameterSourceBase {
  param: NamedParam;
}

export interface AxisEnumParameterSourceInput extends AxisParameterSourceBase {
  param: EnumParam;
}

export interface AxisParameterSourceEditorView {
  selected?: { effectId: number; display?: string; pack?: string | null; color?: string } | null;
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

/** The Block-Editor accent for a block, from its pack/display via the shared catalog. */
export function axisBlockAccent(pack: string | null | undefined, display: string | undefined): string {
  return catFor(pack ?? null, baseName(display ?? '')).accent;
}

/** Presentation state shared by both source kinds — never live values. */
function sourceState(block: string, label: string, color?: string): Record<string, string> {
  const state: Record<string, string> = { block, label };
  if (color) state.color = color;
  return state;
}

export function axisParameterSourceFromNamedParam(input: AxisNamedParameterSourceInput): WorkbenchParameterSource | null {
  if (input.param.id == null) return null;
  const label = cleanLabel(input.param.name, 'Parameter');
  const block = cleanLabel(input.block, 'Block');
  return {
    id: sourceId(input.effectId, input.param.id),
    label,
    preferredWidgetType: 'axis.paramControl',
    defaultSize: 'default',
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
    state: sourceState(block, label, input.color)
  };
}

export function axisParameterSourceFromEnumParam(input: AxisEnumParameterSourceInput): WorkbenchParameterSource {
  const label = cleanLabel(input.param.name, 'Parameter');
  const block = cleanLabel(input.block, 'Block');
  return {
    id: sourceId(input.effectId, input.param.id),
    label,
    preferredWidgetType: 'axis.paramControl',
    defaultSize: 'default',
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
    state: sourceState(block, label, input.color)
  };
}

export function axisParameterSourcesFromEditorView(view: AxisParameterSourceEditorView): WorkbenchParameterSource[] {
  const selected = view.selected;
  if (!selected) return [];
  const block = selected.display ?? 'Block';
  const color = axisBlockAccent(selected.pack, selected.display);
  return [
    ...view.params
      .map((param) => axisParameterSourceFromNamedParam({ effectId: selected.effectId, block, color, param }))
      .filter((source): source is WorkbenchParameterSource => !!source),
    ...view.enums.map((param) => axisParameterSourceFromEnumParam({ effectId: selected.effectId, block, color, param }))
  ];
}

export function axisParameterSourceFromEditorParamId(
  view: AxisParameterSourceEditorView,
  paramId: number
): WorkbenchParameterSource | null {
  const selected = view.selected;
  if (!selected) return null;
  const block = selected.display ?? 'Block';
  const color = axisBlockAccent(selected.pack, selected.display);
  const named = view.params.find((param) => param.id === paramId);
  if (named) return axisParameterSourceFromNamedParam({ effectId: selected.effectId, block, color, param: named });
  const enumParam = view.enums.find((param) => param.id === paramId);
  return enumParam ? axisParameterSourceFromEnumParam({ effectId: selected.effectId, block, color, param: enumParam }) : null;
}

export async function axisParameterSourcesFromCurrentEditor(): Promise<WorkbenchParameterSource[]> {
  const { editor } = await import('../editor.svelte');
  return axisParameterSourcesFromEditorView({
    selected: editor.selected,
    params: editor.params,
    enums: editor.enums
  });
}
