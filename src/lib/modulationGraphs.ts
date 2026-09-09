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
  /** Seconds of LFO the box spans, for graphs the device editor draws as a fixed time window rather than
   *  as a single cycle. Left unset for a graph that shows one period whatever the Rate is. */
  windowSeconds?: number;
  /** How many values a RANDOM cycle holds, for a graph whose LFO was measured. Left unset keeps the
   *  two-per-cycle staircase the block graphs have always drawn. */
  randomSteps?: number;
}

// The Controllers page draws a fixed slice of TIME, so its boxes hold more cycles the faster the LFO runs:
// counted off fm3-edit, a triangle shows two peaks at 1 Hz and about six at 4 Hz, and the LFO 1 thumbnail
// in docs/handoff (~0.5 Hz) holds 1.25. The block graphs (Tremolo, Phaser, Flanger) keep one period a box.
const CONTROLLERS_WINDOW_SECONDS = 2;

// Measured on a live FM3: with LFO 1 on RANDOM at 0.1 Hz, the value routed through a modifier holds a
// plateau and steps at 10.5 s, 20.5 s and 30.5 s — one new value per cycle, not the two we draw by default.
const CONTROLLERS_RANDOM_STEPS = 1;

const currentLabel = (value: EnumParam | undefined): string | undefined =>
  value?.options.find((option) => option.value === value.value)?.label;

export interface ModulationWaveformOptions {
  duty?: number;
  shape?: number;
  randomSeed?: number;
  /** Values a RANDOM cycle holds. Defaults to the two-step staircase. */
  randomSteps?: number;
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

/** Bend a 0..1 ramp along an exponential; 0 curvature stays linear, higher values hold longer before the drop. */
function curvedRamp(u: number, curvature: number): number {
  return Math.abs(curvature) < 0.001 ? u : Math.expm1(curvature * u) / Math.expm1(curvature);
}

// Curvature of the Exp/Log bend, fitted against LFO output sampled from a live FM3 (capture notes in
// docs/handoff/modulation-graph-shapes). The hardware curve is gentler than the base-10 shape this code
// used to apply — base 10 would be ln(10) ≈ 2.30 — and it is the same at every Shape setting.
const EXP_CURVATURE = 1.45;
const LOG_CURVATURE = -1.35;

/** Value of an FM3 LFO waveform at normalized phase `t`. */
export function modulationValue(type: string, t: number, options: ModulationWaveformOptions = {}): number {
  const phase = ((t % 1) + 1) % 1;
  const name = type.trim().toLowerCase();
  const shape = Math.max(0.01, Math.min(0.99, options.shape ?? 0.5));
  const sine = Math.sin(phase * Math.PI * 2);
  const triangle = phase < shape
    ? -1 + (2 * phase) / shape
    : 1 - (2 * (phase - shape)) / (1 - shape);

  if (name === 'sine') return sine;
  if (name === 'triangle') return triangle;
  if (name === 'square' || name === 'pulse') return phase < Math.max(0.05, Math.min(0.95, options.duty ?? 0.5)) ? 1 : -1;
  // The hardware's saw is neither straight nor fixed-curvature: Shape bends it by the triangle's own
  // fall/rise ratio, and the two directions are time-mirrors rather than negations of each other.
  const sawCurvature = (1 - shape) / shape;
  if (name === 'saw up' || name === 'ramp up') return 2 * curvedRamp(phase, -sawCurvature) - 1;
  if (name === 'saw down' || name === 'ramp down') return 1 - 2 * curvedRamp(phase, sawCurvature);
  // Exp and Log bend the Shape-controlled ramp, not a sine: curving a sine leaves the flanks rounded where
  // the hardware runs them nearly straight into a pointed apex. The two are mirrored in time as well as in
  // curvature — Log rises over Shape, Exp over the rest of the cycle.
  if (name === 'log') return 2 * curvedRamp((triangle + 1) / 2, LOG_CURVATURE) - 1;
  if (name === 'exp') {
    const mirrored = phase < 1 - shape
      ? -1 + (2 * phase) / (1 - shape)
      : 1 - (2 * (phase - (1 - shape))) / shape;
    return 2 * curvedRamp((mirrored + 1) / 2, EXP_CURVATURE) - 1;
  }
  if (name === 'trapezoid') return Math.max(-1, Math.min(1, triangle * 2));
  if (name === 'random' || name === 'noise') {
    const steps = Math.max(1, Math.round(options.randomSteps ?? 2));
    const sample = Math.floor(phase * steps) + (options.randomSeed ?? 0) * steps;
    const x = Math.sin(sample * 12.9898 + 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }
  if (name === 'astable') {
    const u = (phase % 0.5) * 2;
    const leg = curvedRamp(u, -shape * 2);
    return phase < 0.5 ? 1 - 2 * leg : -1 + 2 * leg;
  }
  return sine;
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
          center: named(/CENTER$/),
          windowSeconds: family === 'CONTROLLERS' ? CONTROLLERS_WINDOW_SECONDS : undefined,
          randomSteps: family === 'CONTROLLERS' ? CONTROLLERS_RANDOM_STEPS : undefined
        });
      }
    }
  }
  return out;
}

export { currentLabel };
