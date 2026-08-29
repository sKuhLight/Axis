import type { DeviceLayout, EnumParam, NamedParam } from './types';

export interface MegaTapGraphSpec {
  key: string;
  page: number;
  slot: number;
  taps?: NamedParam;
  predelay?: NamedParam;
  timeAlpha?: NamedParam;
  ampAlpha?: NamedParam;
  timeShape?: EnumParam;
  ampShape?: EnumParam;
}

export function deriveMegaTapGraphs(input: { layout: DeviceLayout | null | undefined; params: NamedParam[]; enums: EnumParam[] }): MegaTapGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const enums = new Map(input.enums.map((param) => [param.id, param]));
  const out: MegaTapGraphSpec[] = [];
  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    const controls = (layoutPage.rows ?? []).flatMap((row) => row.controls ?? []);
    const id = (name: string) => controls.find((control) => control.paramName === name)?.paramId;
    let slot = 0;
    for (const control of controls) {
      if (control.widget !== 'graph') continue;
      const graphSlot = slot++;
      if (control.rawWidget !== 'graph_megatap') continue;
      const named = (name: string) => params.get(id(name) ?? -1);
      const typed = (name: string) => enums.get(id(name) ?? -1);
      out.push({ key: `megatap${out.length + 1}`, page, slot: graphSlot, taps: named('MEGATAP_NUMTAPS'), predelay: named('MEGATAP_PREDELAY'), timeAlpha: named('MEGATAP_TIMEALPHA'), ampAlpha: named('MEGATAP_AMPALPHA'), timeShape: typed('MEGATAP_TIMESHAPE'), ampShape: typed('MEGATAP_AMPSHAPE') });
    }
  }
  return out;
}
