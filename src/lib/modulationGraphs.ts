// Parameter-driven modulation waveforms. Graph slots are identified by their ordinal on a page because
// the Controllers layout places LFO 1 and LFO 2 on the same page.
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';
import { graphKind } from './deviceWidgets';


export interface ModulationGraphSpec {
  key: string;
  page: number;
  slot: number;
  title: string;
  type?: EnumParam;
  typeLabel?: string;
  run?: EnumParam;
  tempo?: EnumParam;
  quantize?: EnumParam;
  rate?: NamedParam;
  depth?: NamedParam;
  duty?: NamedParam;
  shape?: NamedParam;
  phase?: NamedParam;
  highCut?: NamedParam;
  width?: NamedParam;
  center?: NamedParam;
}

const currentLabel = (value: EnumParam | undefined): string | undefined =>
  value?.options.find((option) => option.value === value.value)?.label;

export interface ModulationWaveformOptions {
  duty?: number;
  shape?: number;
  randomSeed?: number;
}

/** Resolve a tempo-synced division to cycles per second, falling back to the Rate control. */
export function modulationRate(freeRate: number, tempoLabel: string | undefined, bpm: number): number {
  const label = tempoLabel?.trim().toUpperCase();
  if (!label || label === 'NONE' || label === 'OFF') return freeRate;
  const fraction = /^(\d+)\/(\d+)/.exec(label);
  if (!fraction) return freeRate;
  let beats = (4 * Number(fraction[1])) / Number(fraction[2]);
  if (label.includes('TRIP')) beats *= 2 / 3;
  if (label.includes('DOT')) beats *= 1.5;
  return bpm > 0 && beats > 0 ? bpm / 60 / beats : freeRate;
}

/** Value of an FM3 LFO waveform at normalized phase `t`. */
export function modulationValue(type: string, t: number, options: ModulationWaveformOptions = {}): number {
  const phase = ((t % 1) + 1) % 1;
  const name = type.trim().toLowerCase();
  const shape = Math.max(0.01, Math.min(0.99, options.shape ?? 0.5));
  const trianglePhase = (phase + 0.75) % 1;
  const triangle = trianglePhase < shape
    ? -1 + (2 * trianglePhase) / shape
    : 1 - (2 * (trianglePhase - shape)) / (1 - shape);

  if (name === 'sine') return Math.sin(phase * Math.PI * 2);
  if (name === 'triangle') return triangle;
  if (name === 'square' || name === 'pulse') return phase < Math.max(0.05, Math.min(0.95, options.duty ?? 0.5)) ? 1 : -1;
  if (name === 'saw up' || name === 'ramp up') return 2 * phase - 1;
  if (name === 'saw down' || name === 'ramp down') return 1 - 2 * phase;
  if (name === 'log') return 2 * Math.log10(1 + 9 * phase) - 1;
  if (name === 'exp') return (2 * (Math.pow(10, phase) - 1)) / 9 - 1;
  if (name === 'trapezoid') return Math.max(-1, Math.min(1, triangle * 2));
  if (name === 'random' || name === 'noise') {
    const sample = Math.floor(phase * 8) + (options.randomSeed ?? 0) * 8;
    const x = Math.sin(sample * 12.9898 + 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }
  if (name === 'astable') {
    const curvature = shape * 2;
    const rising = phase >= 0.25 && phase < 0.75;
    const u = rising
      ? (phase - 0.25) * 2
      : phase < 0.25 ? (phase + 0.25) * 2 : (phase - 0.75) * 2;
    const ramp = (1 - Math.exp(-curvature * u)) / (1 - Math.exp(-curvature));
    return rising ? -1 + 2 * ramp : 1 - 2 * ramp;
  }
  return Math.sin(phase * Math.PI * 2);
}

function graphTitle(rawWidget: string, row: LayoutControl[], pageName: string): string {
  if (rawWidget === 'graph_trem') return pageName || 'Tremolo LFO';
  if (rawWidget === 'graph_phaser') return 'Phaser LFO';
  const lfo = row.find((control) => /_LFO(\d)/.test(control.paramName ?? ''))?.paramName?.match(/_LFO(\d)/)?.[1];
  return lfo ? `LFO ${lfo}` : 'LFO';
}

/** Resolve each graph from its authored row, extending across an effect page when its controls are split. */
export function deriveModulationGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
}): ModulationGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const enums = new Map(input.enums.map((param) => [param.id, param]));
  const paramsBySymbol = new Map(input.params.filter((param) => param.paramName).map((param) => [param.paramName as string, param]));
  const enumsBySymbol = new Map(input.enums.filter((param) => param.paramName).map((param) => [param.paramName as string, param]));
  const out: ModulationGraphSpec[] = [];

  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    const pageControls = layoutPage.rows.flatMap((row) => row.controls ?? []);
    const family = input.layout?.family?.replace(/^OLD_/, '')
      ?? pageControls.find((control) => control.paramName)?.paramName?.replace(/^OLD_/, '').split('_')[0];
    const graphCount = pageControls.filter((control) => control.widget === 'graph' && graphKind(control.rawWidget) === 'mod').length;
    let slot = 0;
    for (const row of layoutPage.rows ?? []) {
      for (const control of row.controls ?? []) {
        if (control.widget !== 'graph') continue;
        const graphSlot = slot++;
        if (graphKind(control.rawWidget) !== 'mod') continue;
        const local = row.controls ?? [];
        // A single graph owns its full page. Multi-LFO pages keep each graph isolated to its authored row.
        const scope = graphCount === 1 ? pageControls : local;
        const named = (match: RegExp): NamedParam | undefined => {
          const control = scope.find((candidate) => match.test(candidate.paramName ?? ''));
          const bound = control?.paramName ? paramsBySymbol.get(control.paramName) : undefined;
          if (bound) return bound;
          if (control?.paramId != null) return params.get(control.paramId);
          return family
            ? input.params.find((param) => param.paramName?.replace(/^OLD_/, '').startsWith(`${family}_`) && match.test(param.paramName ?? ''))
            : undefined;
        };
        const typed = scope.find((candidate) => /_LFO\d*TYPE$/.test(candidate.paramName ?? ''));
        const type = (typed?.paramName ? enumsBySymbol.get(typed.paramName) : undefined)
          ?? (typed?.paramId == null
            ? input.enums.find((param) => param.paramName === `${family}_LFOTYPE` || param.paramName === `OLD_${family}_LFOTYPE`)
            : enums.get(typed.paramId));
        const enumParam = (match: RegExp): EnumParam | undefined => {
          const candidate = scope.find((item) => match.test(item.paramName ?? ''));
          return (candidate?.paramName ? enumsBySymbol.get(candidate.paramName) : undefined)
            ?? (candidate?.paramId == null ? undefined : enums.get(candidate.paramId));
        };
        out.push({
          key: `mod${out.length + 1}`,
          page,
          slot: graphSlot,
          title: graphTitle(control.rawWidget ?? '', local, layoutPage.name),
          type,
          typeLabel: currentLabel(type),
          run: enumParam(/RUN$/),
          tempo: enumParam(/TEMPO$/),
          quantize: enumParam(/QUANTIZE$/),
          rate: named(/(?:RATE|FREQ)$/),
          depth: named(/DEPTH$/),
          duty: named(/DUTY$/),
          shape: named(/(?:BETA|SHAPE)$/),
          phase: named(/(?<!START)PHASE$/),
          highCut: named(/(?:HICUT|LFOFILTER|LFOLPF)$/),
          width: named(/WIDTH$/),
          center: named(/CENTER$/)
        });
      }
    }
  }
  return out;
}

export { currentLabel };
