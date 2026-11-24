// Block Editor control catalog: every control a block offers, built from its live parameters.
//
// Same keys as the previous editor (`k<id>` continuous, `e<id>` enum, `eq`, `bypass`, `meter`, `wave`)
// so stored boards stay valid; sizes are in the new cell units (one knob = 2×2), taken from BE_SPEC. Graph
// displays the server serves for the block are `graph:<visual key>` (read-only, kind `graph`).
// Pure (catalog.test.ts).

import { BE_SPEC, type BeView } from './boardModel';
import { graphCatalogKey } from '../blockVisuals';
import type { BlockVisual, EnumParam, NamedParam } from '../types';

export type BeKind = 'cont' | 'toggle' | 'select' | 'eq' | 'action' | 'meter' | 'wave' | 'graph';

export const CONT_VIEWS: readonly BeView[] = ['knob', 'fader', 'slider', 'number'];
export const TOG_VIEWS: readonly BeView[] = ['button', 'switch'];

export interface BeCtl {
  key: string;
  kind: BeKind;
  label: string;
  /** Parameter id; negative for block-level entries (eq −1, bypass −2, meter −3, wave −4, graphs −10, −11, …). */
  id: number;
  /** Default view and its default size in cells. */
  view: BeView;
  views: readonly BeView[];
  w: number;
  h: number;
  /** Graph entries: the served display (roles are param ids; values reach the tile through the host). */
  visual?: BlockVisual;
}

export interface CatalogInput {
  params: readonly Pick<NamedParam, 'id' | 'name'>[];
  enums: readonly Pick<EnumParam, 'id' | 'name' | 'options'>[];
  /** Number of EQ bands; > 0 adds the EQ graph. */
  eqBandCount?: number;
  eqTitle?: string;
  /** Parameter ids shown elsewhere (e.g. by the cab picker) and left out here. */
  hideIds?: readonly number[];
  /** Level meters the block reports; the first one names the meter entry. */
  monitors?: readonly { role: string }[];
  /** The block has live loop waveform data (looper). */
  hasWave?: boolean;
  /** Read-only graph displays served for the block (cap `blockVisuals`). */
  visuals?: readonly BlockVisual[];
}

const entry = (key: string, kind: BeKind, label: string, id: number, view: BeView, views: readonly BeView[]): BeCtl => ({
  key,
  kind,
  label,
  id,
  view,
  views,
  w: BE_SPEC[view].w,
  h: BE_SPEC[view].h
});

/** Label of the meter entry for a monitor role. */
export function meterLabel(role: string | undefined): string {
  return role === 'gainReduction' ? 'Gain Reduction' : role === 'vu' ? 'VU' : 'Meter';
}

/** First id of the graph entries (−10, −11, … in served order). */
export const GRAPH_ID_BASE = -10;

/** Build the catalog. Order: EQ, graph displays, continuous params, enums (two options or fewer = toggle,
 *  else select), bypass, meter, loop waveform. */
export function buildCatalog(input: CatalogInput): BeCtl[] {
  const hidden = new Set(input.hideIds ?? []);
  const out: BeCtl[] = [];
  if ((input.eqBandCount ?? 0) > 0) out.push(entry('eq', 'eq', input.eqTitle || 'EQ', -1, 'eq', ['eq']));
  (input.visuals ?? []).forEach((v, i) => out.push({ ...entry(graphCatalogKey(v.key), 'graph', v.title, GRAPH_ID_BASE - i, 'graph', ['graph']), visual: v }));
  for (const p of input.params) {
    if (p.id == null || hidden.has(p.id)) continue;
    out.push(entry(`k${p.id}`, 'cont', p.name, p.id, 'knob', CONT_VIEWS));
  }
  for (const e of input.enums) {
    if (hidden.has(e.id)) continue;
    const tog = e.options.length <= 2;
    out.push(tog ? entry(`e${e.id}`, 'toggle', e.name, e.id, 'button', TOG_VIEWS) : entry(`e${e.id}`, 'select', e.name, e.id, 'select', ['select']));
  }
  out.push(entry('bypass', 'action', 'Bypass', -2, 'action', ['action']));
  const mon = input.monitors?.[0];
  if (mon) out.push(entry('meter', 'meter', meterLabel(mon.role), -3, 'meter', ['meter']));
  if (input.hasWave) out.push(entry('wave', 'wave', 'Loop', -4, 'wave', ['wave']));
  return out;
}

/** Allowed views per key, for normalizeBoard's `viewsByKey`. */
export function viewsByKey(catalog: readonly BeCtl[]): Map<string, readonly BeView[]> {
  return new Map(catalog.map((c) => [c.key, c.views]));
}
