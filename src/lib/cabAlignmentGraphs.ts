import type { DeviceLayout, EnumParam, NamedParam } from './types';
import { graphKind } from './deviceWidgets';

export interface CabAlignmentGraphSpec {
  key: string;
  page: number;
  slot: number;
  delay1?: NamedParam;
  delay2?: NamedParam;
  zoom?: EnumParam;
}


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
    // The device authors up to FOUR of these on one page — `graph_cab`/`graph_cabZoom` (and their `_mm`
    // successors) all sit at the same `positionExact`, one firmware-gated pair standing in for the other
    // as the unit/zoom state changes. They are alternate renderings of ONE graph, not separate graphs —
    // `CabAlignmentGraph.svelte` already draws the zoomed span itself from the live `CABINET_ZOOM` value.
    // Binding every match produced a second, fully-duplicate "Cab Alignment" card. Bind only the page's
    // first match; a later match's slot is left unmapped, so `deviceLayoutBoard` resolves it to a gap
    // instead of a second widget.
    let pageBound = false;
    for (const control of controls) {
      if (control.widget !== 'graph') continue;
      const graphSlot = slot++;
      if (graphKind(control.rawWidget) !== 'cabAlign' || pageBound) continue;
      pageBound = true;
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
