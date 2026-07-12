import type { BindingRef, JsonObject, WorkbenchBindingRegistry } from '../workbench';
import type { EnumParam, NamedParam } from '../types';

export const AXIS_PARAM_CONTROL_BINDING = 'axis.paramControl';

export interface AxisParamControlValue {
  kind: typeof AXIS_PARAM_CONTROL_BINDING;
  block: string;
  label: string;
  effectId?: number;
  paramId?: number;
  normalized?: number;
  value?: number | string;
  unit?: string;
  min?: number;
  max?: number;
  log?: boolean;
  writable: boolean;
  source: 'open-block' | 'meter' | 'metadata';
}

export interface AxisWorkbenchBindingEditorView {
  selected?: { effectId: number; display?: string } | null;
  params: NamedParam[];
  enums: EnumParam[];
  meters: Record<number, { vals: Record<number, { norm?: number; value?: number; unit?: string; min?: number; max?: number; log?: boolean }> }>;
}

export interface AxisWorkbenchBindingOptions {
  getEditor?: () => AxisWorkbenchBindingEditorView | null | undefined | Promise<AxisWorkbenchBindingEditorView | null | undefined>;
}

async function defaultEditorView(): Promise<AxisWorkbenchBindingEditorView | null> {
  const module = await import('../editor.svelte');
  return module.editor;
}

function readString(target: JsonObject, key: string): string | undefined {
  const value = target[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumber(target: JsonObject, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = target[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function labelFromBinding(binding: BindingRef): Pick<AxisParamControlValue, 'block' | 'label' | 'effectId' | 'paramId'> {
  const target = binding.target;
  return {
    block: readString(target, 'block') ?? readString(target, 'blockLabel') ?? readString(target, 'family') ?? 'Block',
    label: readString(target, 'param') ?? readString(target, 'label') ?? readString(target, 'paramLabel') ?? 'Parameter',
    effectId: readNumber(target, 'effectId', 'eid'),
    paramId: readNumber(target, 'paramId', 'pid')
  };
}

async function resolveAxisParamControl(binding: BindingRef, options: AxisWorkbenchBindingOptions): Promise<AxisParamControlValue> {
  const base = labelFromBinding(binding);
  const editor = (await (options.getEditor ? options.getEditor() : defaultEditorView())) ?? null;
  if (!editor) {
    return {
      kind: AXIS_PARAM_CONTROL_BINDING,
      ...base,
      writable: base.effectId != null && base.paramId != null,
      source: 'metadata'
    };
  }

  const selected = editor.selected;
  const targetMatchesSelected = base.effectId == null || selected?.effectId === base.effectId;

  if (base.paramId != null && targetMatchesSelected) {
    const named = editor.params.find((param) => param.id === base.paramId);
    if (named) {
      return {
        kind: AXIS_PARAM_CONTROL_BINDING,
        ...base,
        block: selected?.display ?? base.block,
        label: named.name || base.label,
        normalized: named.norm,
        value: named.value,
        unit: named.unit,
        min: named.min,
        max: named.max,
        log: named.log,
        writable: true,
        source: 'open-block'
      };
    }

    const discrete = editor.enums.find((param) => param.id === base.paramId);
    if (discrete) {
      return {
        kind: AXIS_PARAM_CONTROL_BINDING,
        ...base,
        block: selected?.display ?? base.block,
        label: discrete.name || base.label,
        value: discrete.options.find((option) => option.value === discrete.value)?.label ?? discrete.value,
        writable: true,
        source: 'open-block'
      };
    }
  }

  if (base.effectId != null && base.paramId != null) {
    const meter = editor.meters[base.effectId]?.vals[base.paramId];
    if (meter) {
      return {
        kind: AXIS_PARAM_CONTROL_BINDING,
        ...base,
        normalized: meter.norm,
        value: meter.value,
        unit: meter.unit,
        min: meter.min,
        max: meter.max,
        log: meter.log,
        writable: true,
        source: 'meter'
      };
    }
  }

  return {
    kind: AXIS_PARAM_CONTROL_BINDING,
    ...base,
    writable: base.effectId != null && base.paramId != null,
    source: 'metadata'
  };
}

export function registerAxisWorkbenchBindings(registry: WorkbenchBindingRegistry, options: AxisWorkbenchBindingOptions = {}): () => void {
  return registry.register<AxisParamControlValue>({
    kind: AXIS_PARAM_CONTROL_BINDING,
    version: 1,
    resolve: (binding) => resolveAxisParamControl(binding, options)
  });
}
