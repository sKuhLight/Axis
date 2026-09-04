// DynaCab mic-position graphic: the shaded speaker cone with a draggable mic dot that the official
// editor draws in the middle of each DynaCab slot.
//
// THE DEVICE AUTHORS THIS. It is a control named `dynaCabControl` in the served layout, at its own
// `positionExact`, bound to the slot's `CABINET_DYNACAB_R{n}` (mic position on the cone). Eight
// occurrences across FM3 / FM9 / Axe-Fx III, all 254x199 device px. So this module resolves the graphic
// from the layout like every other widget — there is no mode flag to pass in, no page/row anchor to
// guess, and no slot ceiling: a slot exists exactly when the device drew a cone for it.
//
// (The module previously believed the opposite — "the device never authors the DynaCab params, resolve
// them from the live list by display NAME" — and matched `Distance {n}` / `DynaCab {n}` / `DYNACAB
// MIC{n}` with a range heuristic to break the tie between the legacy delay knob and the DynaCab one.
// That was reading the LEGACY variant's page. The DynaCab variant carries `CABINET_DYNACAB_MIC{n}`,
// `_R{n}` and `_Z{n}` with device-true paramIds, so all of that guessing is gone.)
//
// Binding is by ForgeFX param SYMBOL, never by id or display label: ids are family-scoped and shift with
// the block's variant, and `Distance 1` names two different params. The layout's own `paramName →
// paramId` map resolves a symbol to the device-true id for THIS block; a slot whose position or pan
// isn't live is skipped rather than half-drawn.

import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';

export interface CabMicGraphSpec {
  key: string; // 'cabmic1' | 'cabmic2' | …
  slot: number; // 1-based, matches the device's CAB n numbering
  /** The device's own heading for the slot (`CABINET_LABEL{n}`), used for the graphic's aria labels. */
  title: string;
  level?: NamedParam;
  pan: NamedParam;
  position: NamedParam;
  distance?: NamedParam;
  mic?: EnumParam;
}

/** The editor token that IS this graphic. */
export const DYNACAB_WIDGET = 'dynaCabControl';

/** Slot number off a `CABINET_DYNACAB_R2`-style symbol. */
const slotOf = (paramName: string | null | undefined): number | null => {
  const m = /(\d+)$/.exec(paramName ?? '');
  return m ? Number(m[1]) : null;
};

/** Every DynaCab mic graphic this block should draw, in the device's own order. Empty when the served
 *  layout has no `dynaCabControl` — a legacy IR cab, or a block that is not a cab at all. */
export function deriveCabMicGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
}): CabMicGraphSpec[] {
  const byId = new Map(input.params.filter((p) => p.id != null).map((p) => [p.id as number, p]));
  const enumById = new Map(input.enums.map((e) => [e.id, e]));
  const out: CabMicGraphSpec[] = [];

  for (const page of input.layout?.pages ?? []) {
    const controls: LayoutControl[] = (page.rows ?? []).flatMap((r) => r.controls ?? []);
    // First occurrence wins: the Axe-Fx page binds `CABINET_LABEL1` to BOTH the "CAB 1" heading and the
    // "Mic" caption beneath it, and the heading is authored first.
    const idOf = new Map<string, number>();
    const labelOf = new Map<string, string>();
    for (const c of controls) {
      if (!c.paramName) continue;
      if (c.paramId != null && !idOf.has(c.paramName)) idOf.set(c.paramName, c.paramId);
      if (c.label && !labelOf.has(c.paramName)) labelOf.set(c.paramName, c.label);
    }
    const param = (sym: string) => byId.get(idOf.get(sym) ?? -1);
    const enm = (sym: string) => enumById.get(idOf.get(sym) ?? -1);

    for (const anchor of controls) {
      if (anchor.rawWidget !== DYNACAB_WIDGET) continue;
      const n = slotOf(anchor.paramName);
      if (n == null) continue;
      const position = param(`CABINET_DYNACAB_R${n}`);
      const pan = param(`CABINET_PAN${n}`);
      if (!position || !pan) continue;
      out.push({
        key: `cabmic${n}`,
        slot: n,
        title: labelOf.get(`CABINET_LABEL${n}`)?.trim() || `Cab ${n}`,
        level: param(`CABINET_LEVEL${n}`),
        pan,
        position,
        distance: param(`CABINET_DYNACAB_Z${n}`),
        mic: enm(`CABINET_DYNACAB_MIC${n}`)
      });
    }
  }
  return out;
}
