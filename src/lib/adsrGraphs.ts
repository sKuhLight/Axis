import type { DeviceLayout, NamedParam } from './types';
import { graphKind } from './deviceWidgets';

export interface AdsrGraphSpec {
  key: string;
  page: number;
  slot: number;
  title: string;
  attack?: NamedParam;
  decay?: NamedParam;
  sustain?: NamedParam;
  level?: NamedParam;
  release?: NamedParam;
  threshold?: NamedParam;
}


/** Resolve each Controllers ADSR graph from the matching page-local ADSR-numbered controls. */
export function deriveAdsrGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
}): AdsrGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const out: AdsrGraphSpec[] = [];

  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    const controls = (layoutPage.rows ?? []).flatMap((row) => row.controls ?? []);
    const adsr = controls.find((control) => /_ADSR(\d)(?:ATTACK|DECAY|SUSTAIN|RELEASE)$/.test(control.paramName ?? ''))?.paramName?.match(/_ADSR(\d)/)?.[1];
    if (!adsr) continue;
    const param = (suffix: string): NamedParam | undefined => {
      const id = controls.find((control) => control.paramName === `CONTROLLERS_ADSR${adsr}${suffix}`)?.paramId;
      return id == null ? undefined : params.get(id);
    };
    let slot = 0;
    for (const control of controls) {
      if (control.widget !== 'graph') continue;
      const graphSlot = slot++;
      if (graphKind(control.rawWidget) !== 'adsr') continue;
      out.push({
        key: `adsr${adsr}`,
        page,
        slot: graphSlot,
        title: `ADSR ${adsr}`,
        attack: param('ATTACK'),
        decay: param('DECAY'),
        sustain: param('SUSTAIN'),
        level: param('LEVEL'),
        release: param('RELEASE'),
        threshold: param('THRESH')
      });
    }
  }
  return out;
}
