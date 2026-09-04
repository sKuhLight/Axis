// Frequency-response graphs for every block that has one.
//
// The device editor draws a response curve on a handful of pages — the amp's Input EQ and Speaker
// pages, the Filter block, the Reverb EQ page, the compressor's Sidechain page, Multitap EQ, Plex
// Filter, PEQ, the global output EQs. ForgeFX already tells us WHERE: the served DeviceLayout marks
// those slots as `{ widget: 'graph', rawWidget: 'graph4' | 'graph_filter' | … }` on the owning page.
// This module answers WHAT to draw there, by reading the graph page's own controls.
//
// Binding is by ForgeFX param SYMBOL (`DISTORT_INEQFREQ`), never by a param id or a display label:
//   - ids are family-scoped AND shift with the block's type/model, so a hardcoded id table would
//     mis-address the moment a variant changes (see the warning in eq.ts);
//   - display labels are not unique within a block and differ between families.
// The layout carries `paramName` → `paramId` for its own variant, so a symbol resolves to the
// device-true id for THIS block, and that id resolves to the live param. A group whose params aren't
// live is skipped, so a variant that lacks a band simply loses that band rather than half-drawing it.
//
// The tables below are deliberately explicit rather than derived from the symbol spelling: the amp's
// speaker resonance symbols (`SPKRLFREQ` / `SPKRLFQ`) do not tokenize, and a band's shape needs an
// explicit binding to its type enum anyway. Each row reads like one row of the device's own page.

import { type EQBand, type EQShape, geqBandsFromLayout, shapeFromLabel } from './eq';
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';
import { graphKind } from './deviceWidgets';

/** One graph and the pages that show it. A block can have several (the amp draws a different curve on
 *  Input EQ than on Speaker) and one graph can appear on several pages (the Filter block repeats its
 *  curve on Filter / LFO / Modulation). */
export interface EqGraphSpec {
  /** Control-surface catalog key. The first graph keeps the historical `eq` so boards users already
   *  arranged and persisted (`axs.surface3.<slug>.<profile>`) keep their widget. */
  key: string;
  /** Layout page indices that show this graph. */
  pages: number[];
  title: string;
  gainRange: number;
  bands: EQBand[];
}


interface BandSpec {
  freq: string;
  gain: string;
  q?: string;
  /** Type-enum symbol; its selected option label picks the curve shape. */
  type?: string;
  /** Low-side band of a side-agnostic type family (PEQ) — see shapeFromLabel. */
  lowSide?: boolean;
}

const series = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, k) => f(k + 1));

const BAND_GROUPS: BandSpec[] = [
  // Amp — Input EQ (one sweepable typed band) and Speaker (LF + HF resonance bells).
  { freq: 'DISTORT_INEQFREQ', q: 'DISTORT_INEQQ', gain: 'DISTORT_INEQGAIN', type: 'DISTORT_INEQTYPE' },
  { freq: 'DISTORT_SPKRLFREQ', q: 'DISTORT_SPKRLFQ', gain: 'DISTORT_SPKRLFGAIN' },
  { freq: 'DISTORT_SPKRHFREQ', q: 'DISTORT_SPKRHFQ', gain: 'DISTORT_SPKRHFGAIN' },
  // Blocks with a single typed band beside their graph.
  { freq: 'FILTER_FREQ', q: 'FILTER_Q', gain: 'FILTER_GAIN', type: 'FILTER_TYPE' },
  { freq: 'PLEX_FILTERFREQ', q: 'PLEX_FILTERQ', gain: 'PLEX_FILTERGAIN', type: 'PLEX_FILTERTYPE' },
  { freq: 'MULTITAP_FREQ', q: 'MULTITAP_Q', gain: 'MULTITAP_GAIN', type: 'MULTITAP_FILTER_TYPE' },
  { freq: 'COMP_FREQ', q: 'COMP_Q', gain: 'COMP_GAIN', type: 'COMP_EQTYPE' },
  // Reverb EQ — two peaking bands between the cuts.
  ...series(2, (i) => ({ freq: `REVERB_FREQ${i}`, q: `REVERB_Q${i}`, gain: `REVERB_GAIN${i}` })),
  // PEQ — five typed bands; 1-2 are the low side, 4-5 the high side (matches the device's own layout).
  ...series(5, (i) => ({
    freq: `PEQ_FREQ${i}`,
    q: `PEQ_Q${i}`,
    gain: `PEQ_GAIN${i}`,
    type: `PEQ_TYPE${i}`,
    lowSide: i <= 2
  })),
  // The two global output EQs — five untyped peaking bands each.
  ...[1, 2].flatMap((eq) =>
    series(5, (i) => ({
      freq: `GLOBAL_EQ${eq}_FREQ${i}`,
      q: `GLOBAL_EQ${eq}_Q${i}`,
      gain: `GLOBAL_EQ${eq}_GAIN${i}`
    }))
  )
];

/** Standalone cut knobs on a graph page (no gain, no Q of their own). */
const CUTS: { sym: string; shape: EQShape }[] = [
  { sym: 'DISTORT_HPFREQ', shape: 'lowcut' },
  { sym: 'DISTORT_HICUT', shape: 'highcut' },
  { sym: 'DISTORT_XFHPF', shape: 'lowcut' },
  { sym: 'DISTORT_XFLPF', shape: 'highcut' },
  { sym: 'FILTER_LOWCUT', shape: 'lowcut' },
  { sym: 'FILTER_HICUT', shape: 'highcut' },
  { sym: 'REVERB_LOWCUT', shape: 'lowcut' },
  { sym: 'REVERB_HICUT', shape: 'highcut' },
  { sym: 'MULTITAP_LOWCUT', shape: 'lowcut' },
  { sym: 'MULTITAP_HIGHCUT', shape: 'highcut' },
  { sym: 'COMP_LOWCUT', shape: 'lowcut' },
  { sym: 'COMP_HIGHCUT', shape: 'highcut' }
];

const pageControls = (pg: { rows?: { controls?: LayoutControl[] }[] }): LayoutControl[] =>
  (pg.rows ?? []).flatMap((r) => r.controls ?? []);

const hasFreqGraph = (ctls: LayoutControl[]): boolean =>
  // "log-frequency response curve" is one entry in the shared graph vocabulary (`deviceWidgets.ts`),
  // not a token list of this module's own. The device's other graph kinds (LFO, ADSR, cab align,
  // tremolo, phaser, RTA, megatap, modifier) plot something else and resolve to no graph here.
  ctls.some((c) => c.widget === 'graph' && graphKind(c.rawWidget) === 'freq');

/** The gain swing the graph should span: the widest of its own bands' device-true ranges. */
function gainRangeOf(bands: EQBand[]): number {
  let r = 0;
  for (const b of bands) {
    const { min, max } = b.gain ?? {};
    if (min != null && max != null) r = Math.max(r, Math.abs(min), Math.abs(max));
  }
  return r || 20;
}

/** Bands of one graph page, in device order: typed/peaking groups first, then the page's cut knobs. */
function bandsOnPage(ctls: LayoutControl[], params: NamedParam[], enums: EnumParam[]): EQBand[] {
  const idOf = new Map<string, number>();
  for (const c of ctls) if (c.paramName && c.paramId != null) idOf.set(c.paramName, c.paramId);
  const byId = new Map(params.filter((p) => p.id != null).map((p) => [p.id as number, p]));
  const enumById = new Map(enums.map((e) => [e.id, e]));
  const param = (sym: string | undefined): NamedParam | undefined => {
    const id = sym == null ? undefined : idOf.get(sym);
    return id == null ? undefined : byId.get(id);
  };

  const out: EQBand[] = [];
  for (const spec of BAND_GROUPS) {
    const freq = param(spec.freq);
    const gain = param(spec.gain);
    if (!freq || !gain) continue; // this group isn't on this page, or isn't live for this variant
    const te = enumById.get(idOf.get(spec.type ?? '') ?? -1);
    const label = te?.options.find((o) => o.value === te.value)?.label;
    out.push({
      key: spec.freq,
      freq,
      gain,
      q: param(spec.q),
      shape: spec.type ? shapeFromLabel(label, spec.lowSide ?? false) : 'bell'
    });
  }
  for (const cut of CUTS) {
    const freq = param(cut.sym);
    if (freq) out.push({ key: cut.sym, freq, shape: cut.shape });
  }
  return out;
}

/** Every frequency-response graph this block should draw, in page order. */
export function deriveEqGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
  pack: string | null | undefined;
  blockTypeName: string | null | undefined;
}): EqGraphSpec[] {
  const { layout, params, enums, pack, blockTypeName } = input;
  const pages = layout?.pages ?? [];
  const out: EqGraphSpec[] = [];

  for (let i = 0; i < pages.length; i++) {
    const ctls = pageControls(pages[i]);
    if (!hasFreqGraph(ctls)) continue;
    const bands = bandsOnPage(ctls, params, enums);
    if (!bands.length) continue;
    // The Filter block repeats one curve across Filter / LFO / Modulation — same bands, one widget.
    const sig = bands.map((b) => b.key).join(',');
    const same = out.find((g) => g.bands.map((b) => b.key).join(',') === sig);
    if (same) {
      same.pages.push(i);
      continue;
    }
    out.push({
      key: out.length ? `eq${out.length + 1}` : 'eq',
      pages: [i],
      title: pages[i].name?.trim() || 'EQ',
      gainRange: gainRangeOf(bands),
      bands
    });
  }
  if (out.length) return out;

  // Graphic EQs have no graph slot on the device — Axis adds one anyway, over the same fixed-frequency
  // bands the fader bank uses. Kept for GEQ blocks only (the amp's built-in output EQ shows the bank).
  if (pack === 'Geq') {
    const byId = new Map(params.filter((p) => p.id != null).map((p) => [p.id as number, p]));
    const bands: EQBand[] = geqBandsFromLayout(layout)
      .map((b) => ({ key: `g${b.paramId}`, gain: byId.get(b.paramId), centerHz: b.hz, shape: 'bell' as const }))
      .filter((b) => !!b.gain);
    if (bands.length) {
      // Sit on whichever page carries the band row, so a `label` slot there resolves to the graph.
      const bandId = bands[0].gain?.id;
      const at = pages.findIndex((pg) => pageControls(pg).some((c) => c.paramId === bandId));
      return [{ key: 'eq', pages: [Math.max(0, at)], title: blockTypeName || 'Graphic EQ', gainRange: 12, bands }];
    }
  }
  return [];
}
