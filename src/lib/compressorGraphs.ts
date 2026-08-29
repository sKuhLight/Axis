// Compressor transfer graphs. Only Threshold/Ratio models receive a calculated curve; Sustain-style
// models still own a graph slot, but their nonlinear behavior cannot be inferred from one strength knob.
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';

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

const COMP_GRAPH = 'graph_comp_studio';

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
      if (control.rawWidget !== COMP_GRAPH) continue;
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
