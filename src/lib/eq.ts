// EQ helpers: band-type → curve shape, the EQ graph's band contract, and graphic-EQ band discovery
// from the device layout.

import type { DeviceLayout, NamedParam } from './types';

export type EQShape = 'bell' | 'lowshelf' | 'highshelf' | 'lowcut' | 'highcut';

/** One band of a frequency-response graph. `gain` is absent for a pure cut (a Low Cut / High Cut knob
 *  has only a frequency), `freq` for a fixed-frequency graphic-EQ band (which carries `centerHz`). */
export interface EQBand {
  key: string;
  gain?: NamedParam;
  freq?: NamedParam;
  q?: NamedParam;
  centerHz?: number;
  shape?: EQShape;
}

// SURVIVES THE LAYOUT REWORK, deliberately. Everything else Axis used to infer about a control now
// comes from the served layout, but a band's SHAPE cannot: high-pass vs shelf vs bell is a property of
// the filter type's currently selected VALUE, and the layout is value-independent — it places the same
// `Type` dropdown whatever that dropdown says. Two callers depend on it for exactly that reason:
// `eqGraphs.ts` (which curve to draw) and `deviceAlternates.ts` (a shelf/cut band shows its Slope
// dropdown where a peaking band shows its Gain knob).
//
// Curve shape from a band's device-true type label. Two label families exist and they must be read in
// this order: the Filter/Plex/Multitap/amp-input-EQ types NAME their own side (`Low-Pass`, `HIGHSHELF`,
// spelling and hyphenation vary by family), while PEQ's types are side-agnostic (`Shelving`,
// `Blocking`) and take their side from the band's position — `isLow` for the low-side bands.
export function shapeFromLabel(label: string | undefined, isLow: boolean): EQShape {
  const l = (label ?? '').toLowerCase();
  if (/high[\s-]*pass/.test(l)) return 'lowcut';
  if (/low[\s-]*pass/.test(l)) return 'highcut';
  if (/low[\s-]*shelf/.test(l)) return 'lowshelf';
  if (/high[\s-]*shelf/.test(l)) return 'highshelf';
  if (/block|cut/.test(l)) return isLow ? 'lowcut' : 'highcut';
  if (/shelv/.test(l)) return isLow ? 'lowshelf' : 'highshelf';
  return 'bell'; // peaking / notch / tilt / null → flat-or-bell default
}

// ── graphic-EQ band identification ──
// A graphic EQ is a ROW OF FREQUENCY-LABELLED SLIDERS in the block's device layout. That layout is the
// only trustworthy source: it is variant-selected by the server for the block's current type, so it
// knows the real band count and the real centre frequencies.
//
// The named-parameter list is NOT usable here, and this is not a theoretical concern — on a live FM3:
//   - the amp's output-EQ bands 62/125/250/500 Hz are named `Bass 2` / `Mid 2` / `Treble 2` /
//     `Presence 2` in the param list, so a name-based rule finds 4 of the 8 bands and mislabels them;
//   - a `7 Band Constant Q` GEQ reports SEVEN bands at 100…6400 Hz in its layout, while its param list
//     still carries ten stale names from a different model (`100, 160, 250, 800, 1.6K, 1000, …`).
// So both the band set and the band labels come from the layout, and neither is inferred from a pack
// name, a param id range, or a value range.

/** A device label that names a frequency: `100`, `1.6K`, `8K`. */
const isFreqLabel = (n: string) => /^\d+(\.\d+)?\s*k?$/i.test(n.trim());

/** Hz for a frequency label (`1.6K` → 1600), for the EQ graph's fixed band centres. */
export function hzFromLabel(label: string): number {
  const m = label.trim().match(/^(\d+(?:\.\d+)?)\s*(k?)$/i);
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : 0;
}

export interface GeqBand {
  paramId: number;
  label: string;
  hz: number;
}

/** Minimum sliders in a row before it counts as a band bank — below this it is an ordinary control row
 *  that happens to carry a numeric label.
 *
 *  ALSO SURVIVES THE LAYOUT REWORK. The rework's rule is "if the device says it, don't infer it" — and
 *  the device does NOT say it here: a graphic EQ has no `graph_*` control anywhere in its layout (see
 *  `deriveEqGraphs`'s Geq fallback), so there is nothing to read instead. What the rework DID retire is
 *  this function's effect on ARRANGEMENT: the bands used to be collapsed into one `FaderBank` widget
 *  that replaced them on the board. The device canvas draws each slider at its own coordinate, so the
 *  band set now only answers "which params share a response curve", never "where do they go". */
const MIN_BANDS = 4;

/** The graphic-EQ bands of a block, in device order, or `[]` when its layout has no band row.
 *
 *  Self-selecting: only a graphic EQ presents four-plus frequency-labelled sliders on one row, so this
 *  needs no per-pack whitelist and stays correct for any block or model that grows one. */
export function geqBandsFromLayout(layout: DeviceLayout | null | undefined): GeqBand[] {
  for (const pg of layout?.pages ?? []) {
    for (const row of pg.rows ?? []) {
      const bands: GeqBand[] = [];
      for (const c of row.controls ?? []) {
        const label = (c.label ?? '').trim();
        if (c.widget === 'slider' && c.paramId != null && isFreqLabel(label)) {
          bands.push({ paramId: c.paramId, label, hz: hzFromLabel(label) });
        }
      }
      if (bands.length >= MIN_BANDS) return bands;
    }
  }
  return [];
}
