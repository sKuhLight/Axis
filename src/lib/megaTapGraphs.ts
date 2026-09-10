import type { DeviceLayout, EnumParam, NamedParam } from './types';
import { graphKind, graphSlotsForPage } from './deviceWidgets';

export interface MegaTapGraphSpec {
  key: string;
  page: number;
  slot: number;
  /** Number of Taps. The FM3 serves it as a discrete param, so it can arrive on either list. */
  taps?: NamedParam;
  tapsEnum?: EnumParam;
  predelay?: NamedParam;
  /** Delay Time — the window the taps span. Authored on the Basic page, not beside the graph. */
  time?: NamedParam;
  timeAlpha?: NamedParam;
  ampAlpha?: NamedParam;
  panAlpha?: NamedParam;
  timeRandom?: NamedParam;
  ampRandom?: NamedParam;
  timeShape?: EnumParam;
  ampShape?: EnumParam;
  panShape?: EnumParam;
}

export function deriveMegaTapGraphs(input: { layout: DeviceLayout | null | undefined; params: NamedParam[]; enums: EnumParam[] }): MegaTapGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const enums = new Map(input.enums.map((param) => [param.id, param]));
  // Delay Time lives on the block's Basic page while the graph sits on Tap Control, so a page-local
  // control lookup cannot see it — fall back to the block's own parameter list by symbol.
  const paramsBySymbol = new Map(input.params.filter((param) => param.paramName).map((param) => [param.paramName as string, param]));
  const enumsBySymbol = new Map(input.enums.filter((param) => param.paramName).map((param) => [param.paramName as string, param]));
  const out: MegaTapGraphSpec[] = [];
  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    const controls = (layoutPage.rows ?? []).flatMap((row) => row.controls ?? []);
    const id = (name: string) => controls.find((control) => control.paramName === name)?.paramId;
    const slots = graphSlotsForPage(controls);
    for (const control of controls) {
      if (control.widget !== 'graph') continue;
      const graphSlot = slots.get(control)!;
      if (graphKind(control.rawWidget) !== 'megatap') continue;
      const named = (name: string) => params.get(id(name) ?? -1) ?? paramsBySymbol.get(name);
      const typed = (name: string) => enums.get(id(name) ?? -1) ?? enumsBySymbol.get(name);
      out.push({
        key: `megatap${out.length + 1}`, page, slot: graphSlot,
        taps: named('MEGATAP_NUMTAPS'), tapsEnum: typed('MEGATAP_NUMTAPS'), predelay: named('MEGATAP_PREDELAY'), time: named('MEGATAP_TIME'),
        timeAlpha: named('MEGATAP_TIMEALPHA'), ampAlpha: named('MEGATAP_AMPALPHA'), panAlpha: named('MEGATAP_PANALPHA'),
        timeRandom: named('MEGATAP_RANDOM'), ampRandom: named('MEGATAP_AMPRAND'),
        timeShape: typed('MEGATAP_TIMESHAPE'), ampShape: typed('MEGATAP_AMPSHAPE'), panShape: typed('MEGATAP_PANSHAPE')
      });
    }
  }
  return out;
}
