import type { DeviceLayout, EnumParam, NamedParam } from './types';

export interface CabAlignmentGraphSpec {
  key: string;
  page: number;
  slot: number;
  delay1?: NamedParam;
  delay2?: NamedParam;
  zoom?: EnumParam;
}

const CAB_GRAPHS = new Set(['graph_cab', 'graph_cabZoom', 'graph_cab_mm', 'graph_cabZoom_mm']);

/** Resolve Cabinet Align slots from the active served layout and its page-local timing controls. */
export function deriveCabAlignmentGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
}): CabAlignmentGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const enums = new Map(input.enums.map((param) => [param.id, param]));
  const out: CabAlignmentGraphSpec[] = [];

  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    const controls = (layoutPage.rows ?? []).flatMap((row) => row.controls ?? []);
    const ids = new Map(controls.filter((control) => control.paramName && control.paramId != null).map((control) => [control.paramName!, control.paramId!]));
    let slot = 0;
    for (const control of controls) {
      if (control.widget !== 'graph') continue;
      const graphSlot = slot++;
      if (!CAB_GRAPHS.has(control.rawWidget ?? '')) continue;
      out.push({
        key: `cab-align${out.length + 1}`,
        page,
        slot: graphSlot,
        delay1: params.get(ids.get('CABINET_DELAY1') ?? -1),
        delay2: params.get(ids.get('CABINET_DELAY2') ?? -1),
        zoom: enums.get(ids.get('CABINET_ZOOM') ?? -1)
      });
    }
  }
  return out;
}
