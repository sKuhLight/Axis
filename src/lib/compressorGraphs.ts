// Compressor transfer graphs. Only Threshold/Ratio models receive a calculated curve; Sustain-style
// models still own a graph slot, but their nonlinear behavior cannot be inferred from one strength knob.
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';
import { graphKind } from './deviceWidgets';

export interface CompressorGraphSpec {
  key: string;
  page: number;
  slot: number;
  threshold?: NamedParam;
  ratio?: NamedParam;
  sustain?: NamedParam;
  knee?: EnumParam;
  attack?: NamedParam;
  release?: NamedParam;
}


// Real hardware never reports bit-exact 0 dB GR at idle (detector noise floor/quantization), so a
// strict `grDb <= 0` guard almost never fires — it keeps resolving a "real" point a hair above
// threshold instead of recognizing silence. Treat anything under this as imperceptible/no reduction.
const GR_NOISE_FLOOR_DB = 0.1;

/** Invert the piecewise-linear transfer curve to find the point currently producing `grDb` of gain
 *  reduction. There's no live "input level" telemetry for compressors (the device reports gain
 *  reduction only), so this only resolves a point while gr is meaningfully above zero (input above
 *  threshold) — below threshold the real input is unknowable and callers should treat `null` as
 *  "resting/idle" rather than guessing a spot on the curve. */
export function compressorDotPosition(threshold: number, ratio: number, grDb: number): { input: number; output: number } | null {
  if (ratio <= 1 || grDb <= GR_NOISE_FLOOR_DB) return null;
  const input = threshold + (grDb * ratio) / (ratio - 1);
  return { input, output: input - grDb };
}

/** Resolve a compressor graph from its entire page because Knee may live below the Basic-row slot. */
export function deriveCompressorGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
}): CompressorGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const enums = new Map(input.enums.map((param) => [param.id, param]));
  const out: CompressorGraphSpec[] = [];

  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    const controls = (layoutPage.rows ?? []).flatMap((row) => row.controls ?? []);
    const idOf = new Map(controls.filter((control) => control.paramName && control.paramId != null).map((control) => [control.paramName!, control.paramId!]));
    const param = (name: string): NamedParam | undefined => {
      const id = idOf.get(name);
      return id == null ? undefined : params.get(id);
    };
    const enumParam = (name: string): EnumParam | undefined => {
      const id = idOf.get(name);
      return id == null ? undefined : enums.get(id);
    };
    let slot = 0;
    for (const control of controls) {
      if (control.widget !== 'graph') continue;
      const graphSlot = slot++;
      if (graphKind(control.rawWidget) !== 'comp') continue;
      out.push({
        key: `comp${out.length + 1}`,
        page,
        slot: graphSlot,
        threshold: param('COMP_THRESH') ?? param('COMP_THRESH2'),
        ratio: param('COMP_RATIO'),
        sustain: param('COMP_SUSTAIN'),
        knee: enumParam('COMP_KNEE'),
        attack: param('COMP_ATTACK'),
        release: param('COMP_RELEASE')
      });
    }
  }
  return out;
}
