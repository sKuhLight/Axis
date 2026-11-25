// EQ styles of the Block Editor's eq tile: the same footprint, three renderings — a block's Input EQ, its
// Output EQ, or a PEQ. The server tells which of them a block serves (`visuals`, kind `eq`); this module reads
// that into board view variants plus editable EQ bands (roles are param ids, resolved against the live
// parameters and enums), so the tile can switch style without moving or resizing. Pure (eqStyles.test.ts).

import type { EQBand } from '../EQGraph.svelte';
import type { BlockVisual, EnumParam, NamedParam } from '../types';
import { shapeFromLabel } from '../eq';
import type { BeView } from './boardModel';

export type EqStyle = 'input' | 'output' | 'peq';

/** Board view of each style. All three share `BE_SPEC`'s eq footprint. */
export const EQ_STYLE_VIEW: Readonly<Record<EqStyle, BeView>> = {
  input: 'eqIn',
  output: 'eqOut',
  peq: 'eqPeq'
};

/** The style a view renders, if it is one of the eq style views. */
export function eqStyleOfView(view: BeView): EqStyle | null {
  for (const [style, v] of Object.entries(EQ_STYLE_VIEW) as [EqStyle, BeView][]) if (v === view) return style;
  return null;
}

/**
 * The style a served EQ visual is. Only a visual whose key names one of the three claims a style (a block's
 * own `reverbEq` / `sidechainEq` stay what they are: the plain `eq` tile's bands).
 */
export function eqStyleForVisual(visual: BlockVisual): EqStyle | null {
  if (visual.kind !== 'eq') return null;
  const key = visual.key.toLowerCase();
  if (key.includes('input')) return 'input';
  if (key.includes('output')) return 'output';
  if (key.includes('peq') || key.includes('param')) return 'peq';
  return null;
}

/** A visual's role ids as the tile's bands: live params for gain / frequency / Q, the band's fixed centre
 *  (graphic EQ), and the curve shape from the band's type enum (parametric EQ). */
export function eqBandsFromVisual(
  visual: BlockVisual,
  params: readonly NamedParam[],
  enums: readonly EnumParam[] = []
): EQBand[] {
  const paramById = new Map(params.filter((p) => p.id != null).map((p) => [p.id as number, p]));
  const enumById = new Map(enums.map((e) => [e.id, e]));
  const calibrated = visual.mode === 'graphic';
  return (visual.bands ?? []).flatMap((band, index) => {
    const gain = band.gain != null ? paramById.get(band.gain) : undefined;
    const freq = band.freq != null ? paramById.get(band.freq) : undefined;
    const q = band.q != null ? paramById.get(band.q) : undefined;
    if (!gain && !freq) return [];
    const type = band.type != null ? enumById.get(band.type) : undefined;
    const label = type?.options.find((option) => option.value === type.value)?.label;
    const out: EQBand = {
      key: band.key,
      shape: band.shape ?? (calibrated ? 'bell' : shapeFromLabel(label, index < 2))
    };
    if (gain) out.gain = gain;
    if (freq) out.freq = freq;
    if (q) out.q = q;
    if (band.centerHz != null) out.centerHz = band.centerHz;
    return [out];
  });
}

export interface EqStyleData {
  style: EqStyle;
  view: BeView;
  /** The served visual's title ("Input EQ", "Output EQ", …). */
  title: string;
  bands: EQBand[];
  /** Vertical range of the drawing: a graphic EQ is ±12 dB, a parametric one ±20 dB. */
  gainRange: number;
}

/** One entry per EQ style the block serves, in the server's order, each with its editable bands. */
export function eqStylesFromVisuals(
  visuals: readonly BlockVisual[] | undefined,
  params: readonly NamedParam[],
  enums: readonly EnumParam[] = []
): EqStyleData[] {
  const out: EqStyleData[] = [];
  const seen = new Set<EqStyle>();
  for (const visual of visuals ?? []) {
    const style = eqStyleForVisual(visual);
    if (!style || seen.has(style)) continue;
    const bands = eqBandsFromVisual(visual, params, enums);
    if (!bands.length) continue;
    seen.add(style);
    out.push({ style, view: EQ_STYLE_VIEW[style], title: visual.title, bands, gainRange: visual.mode === 'graphic' ? 12 : 20 });
  }
  return out;
}
