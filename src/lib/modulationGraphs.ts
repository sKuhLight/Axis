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
  rate?: NamedParam;
  depth?: NamedParam;
  duty?: NamedParam;
  shape?: NamedParam;
  phase?: NamedParam;
}

const currentLabel = (value: EnumParam | undefined): string | undefined =>
  value?.options.find((option) => option.value === value.value)?.label;

function graphTitle(rawWidget: string, row: LayoutControl[], pageName: string): string {
  if (rawWidget === 'graph_trem') return pageName || 'Tremolo LFO';
  if (rawWidget === 'graph_phaser') return 'Phaser LFO';
  const lfo = row.find((control) => /_LFO(\d)/.test(control.paramName ?? ''))?.paramName?.match(/_LFO(\d)/)?.[1];
  return lfo ? `LFO ${lfo}` : 'LFO';
}

/** Resolve each graph from the controls in its own authored row, never from guessed parameter ids. */
export function deriveModulationGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
}): ModulationGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const enums = new Map(input.enums.map((param) => [param.id, param]));
  const out: ModulationGraphSpec[] = [];

  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    let slot = 0;
    for (const row of layoutPage.rows ?? []) {
      for (const control of row.controls ?? []) {
        if (control.widget !== 'graph') continue;
        const graphSlot = slot++;
        if (graphKind(control.rawWidget) !== 'mod') continue;
        const local = row.controls ?? [];
        const named = (match: RegExp): NamedParam | undefined => {
          const id = local.find((candidate) => match.test(candidate.paramName ?? ''))?.paramId;
          return id == null ? undefined : params.get(id);
        };
        const typed = local.find((candidate) => /_LFO\d*TYPE$/.test(candidate.paramName ?? ''));
        const type = typed?.paramId == null ? undefined : enums.get(typed.paramId);
        out.push({
          key: `mod${out.length + 1}`,
          page,
          slot: graphSlot,
          title: graphTitle(control.rawWidget ?? '', local, layoutPage.name),
          type,
          rate: named(/(?:RATE|FREQ)$/),
          depth: named(/DEPTH$/),
          duty: named(/DUTY$/),
          shape: named(/(?:BETA|SHAPE)$/),
          phase: named(/PHASE$/)
        });
      }
    }
  }
  return out;
}

export { currentLabel };
