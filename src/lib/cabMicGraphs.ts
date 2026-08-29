// Dynacab mic-position graphic: one shaded speaker-cone widget per Cab mic slot (CAB 1 / CAB 2 / …),
// with a draggable dot showing where the mic sits (Position) — the client-side re-presentation
// FM3-Edit draws next to the Level/Pan/Position/Distance/Mic knobs.
//
// DynaCab is NOT a separate block or layout variant — the device serves the same Cab knob grid in both
// modes, and the only thing that changes is a live value (`CABINET_MODE` = 0 LEGACY / 1 DYNA-CAB). The
// device therefore never flags this as a graph slot (`widget: 'graph'`) the way EQ/compressor/cab-alignment
// curves are — Cab's page is an ordinary knob grid, and the DynaCab-only params (mic type, distance-in-cm)
// are NOT authored into that grid at all. So, same as `geqBandsFromLayout`, this is Axis re-presenting
// knobs the device already exposes, not drawing something the device told us to draw: offered only when
// the cab is in DynaCab mode, unconditionally per slot otherwise.
//
// Binding is by ForgeFX param SYMBOL (`CABINET_PAN1`) for the knobs that ARE in the layout, never by id or
// label, for the same reason as eqGraphs.ts — ids are family-scoped and shift with the block's variant. The
// layout's own `paramName → paramId` map resolves a symbol to the device-true id for THIS block, and that id
// resolves to the live param; a slot whose Pan/Position aren't live is skipped entirely.
//
// The DynaCab-only params are the exception: Position ("DynaCab {n}"), distance-in-cm ("Distance {n}",
// the DynaCab `CABINET_DYNACAB_Z`), and the mic enum ("DYNACAB MIC{n}") never appear in the served layout,
// so there is no symbol→id map entry for them. They resolve from the live param/enum lists by NAME instead —
// note the mic POSITION is "DynaCab {n}", NOT `CABINET_PROXIMITY{n}` ("Proximity {n}"), which is the classic
// low-end proximity effect and stays a separate (legacy-mode) knob.

import type { DeviceLayout, EnumParam, NamedParam, LayoutControl } from './types';

export interface CabMicGraphSpec {
  key: string; // 'cabmic1' | 'cabmic2' | …
  slot: number; // 1-based, matches the device's CAB n numbering
  title: string; // 'CAB 1' / 'CAB 2'
  /** Layout page the slot's own knobs live on — lets the board builder drop the graphic on that same
   *  page, right after them, instead of a separate catch-all tab. */
  page: number;
  level?: NamedParam;
  pan: NamedParam;
  position: NamedParam;
  distance?: NamedParam;
  mic?: EnumParam;
}

const MAX_SLOTS = 4; // CABINET_* params go up to 4 mic slots in the protocol tables

/** Symbol → device-true paramId, plus the first page each symbol appears on (so the graphic can sit
 *  on the same page as the knobs it re-presents). */
function paramIndex(layout: DeviceLayout | null | undefined) {
  const idOf = new Map<string, number>();
  const pageOf = new Map<string, number>();
  (layout?.pages ?? []).forEach((page, pageIndex) => {
    for (const row of page.rows ?? []) {
      for (const c of (row.controls ?? []) as LayoutControl[]) {
        if (c.paramName && c.paramId != null) {
          idOf.set(c.paramName, c.paramId);
          if (!pageOf.has(c.paramName)) pageOf.set(c.paramName, pageIndex);
        }
      }
    }
  });
  return { idOf, pageOf };
}

/** Every Dynacab mic graphic this Cab block should draw, one per live mic slot — empty ([] = none) when
 *  the cab is not currently in DynaCab mode, so legacy IR cabs never show a mic graphic. */
export function deriveCabMicGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
  dyna: boolean;
}): CabMicGraphSpec[] {
  if (!input.dyna) return [];
  const { idOf, pageOf } = paramIndex(input.layout);
  const byId = new Map(input.params.filter((p) => p.id != null).map((p) => [p.id as number, p]));
  const param = (sym: string): NamedParam | undefined => {
    const id = idOf.get(sym);
    return id == null ? undefined : byId.get(id);
  };
  /** The DynaCab distance-from-cone (cm). The device serves two params both labelled "Distance {n}" — the
   *  legacy delay knob the layout names `CABINET_DELAY{n}` (norm 0..1) and the DynaCab one (cm, max 24) —
   *  so it is the "Distance {n}" whose id is NOT the layout's legacy delay. Falls back to a cm-range
   *  heuristic when the layout carries no `CABINET_DELAY{n}` at all. */
  const dynaDistance = (n: number): NamedParam | undefined => {
    const legacyId = idOf.get(`CABINET_DELAY${n}`);
    const candidates = input.params.filter((p) => p.name?.trim() === `Distance ${n}` && p.id != null);
    if (legacyId != null) return candidates.find((p) => p.id !== legacyId);
    return candidates.find((p) => (p.max ?? 0) > 1);
  };
  /** The DynaCab mic enum, served under the name "DYNACAB MIC{n}" (never authored into the layout). */
  const mic = (n: number): EnumParam | undefined =>
    input.enums.find((e) => e.name === `DYNACAB MIC${n}` || e.name === `CABINET_DYNACAB_MIC${n}`);
  /** The DynaCab mic POSITION (spot on the cone face, 0..10) — served as a named param "DynaCab {n}", never
   *  authored into the layout. Distinct from `CABINET_PROXIMITY{n}` ("Proximity {n}"). */
  const position = (n: number): NamedParam | undefined =>
    input.params.find((p) => p.name?.trim() === `DynaCab ${n}` && p.id != null);

  const out: CabMicGraphSpec[] = [];
  for (let n = 1; n <= MAX_SLOTS; n++) {
    const pan = param(`CABINET_PAN${n}`);
    const pos = position(n);
    if (!pan || !pos) continue; // slot not on this variant — skip rather than half-draw it
    out.push({
      key: `cabmic${n}`,
      slot: n,
      title: `CAB ${n}`,
      page: pageOf.get(`CABINET_PAN${n}`) ?? 0,
      level: param(`CABINET_LEVEL${n}`),
      pan,
      position: pos,
      distance: dynaDistance(n) ?? param(`CABINET_DELAY${n}`),
      mic: mic(n)
    });
  }
  return out;
}
