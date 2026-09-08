import type { EnumParam } from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function enumKnobIndex(param: EnumParam): number {
  const index = param.options.findIndex((option) => option.value === param.value);
  return index < 0 ? 0 : index;
}

export function enumKnobNorm(param: EnumParam): number {
  return param.options.length > 1 ? enumKnobIndex(param) / (param.options.length - 1) : 0;
}

export function enumKnobLabel(param: EnumParam): string {
  return param.options[enumKnobIndex(param)]?.label ?? '–';
}

export function enumKnobValueAt(param: EnumParam, norm: number): number | undefined {
  if (param.options.length === 0) return undefined;
  const index = Math.round(clamp01(norm) * (param.options.length - 1));
  return param.options[index]?.value;
}
