// Pure mapping from a converted block's ConverterParam[] to the editor's NamedParam[] / EnumParam[].
//
// The offline convert editor drives the REAL ControlSurface, which renders knobs from NamedParam and
// dropdowns from EnumParam. The cross-device converter (forgefx-midi §4 param mapping) enriches each
// mapped param with display metadata when a real per-device catalog covers it: `min`/`max`/`unit`/`log`
// for a true knob sweep, `normalized` for the knob position, and `enumOptions` (ordered, index = ordinal)
// for a genuine dropdown. Where the converter had no catalog data those extras are absent and the knob
// degrades to the coarse raw-value fallback — no invented ranges.
//
// Framework-free (no runes / DOM) so it is unit-tested directly; `convertEditor.svelte.ts` is the only
// caller and simply snapshots the results into its `params` / `enums` reactive arrays on openCell.

import { normFromValue } from './format';
import type { NamedParam, EnumParam, ConverterParam } from './types';

/** Read a finite numeric extra off a loosely-typed ConverterParam (IR carries display range / unit). */
function num(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function str(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === 'string' ? v : undefined;
}

/** The converter's ordered enum option labels, when present and clean (index = ordinal). */
function enumOptionsOf(o: Record<string, unknown>): string[] | undefined {
  const opts = o['enumOptions'];
  if (Array.isArray(opts) && opts.length > 0 && opts.every((x) => typeof x === 'string')) {
    return opts as string[];
  }
  return undefined;
}

/** Build the open block's knob params. `id` = the param's index in the block's params array so
 *  `setParam(p, v)` maps 1:1 back to `convertScratch.setParam(key, id, …)`. Params the converter tagged
 *  as enums (they carry `enumOptions`) are EXCLUDED here — they render as dropdowns (see buildEnums).
 *  Range / unit / taper / knob position are taken from the IR extras when present, else the raw value
 *  renders coarse (no device-free param catalog is otherwise available offline). */
export function buildParams(params: readonly ConverterParam[]): NamedParam[] {
  const out: NamedParam[] = [];
  params.forEach((p, i) => {
    const o = p as unknown as Record<string, unknown>;
    if (enumOptionsOf(o)) return; // enum → dropdown
    const min = num(o, 'min');
    const max = num(o, 'max');
    const unit = str(o, 'unit');
    const log = o['log'] === true;
    const value = p.value;
    const norm =
      num(o, 'norm') ??
      num(o, 'normalized') ??
      (min != null && max != null ? normFromValue(value, { min, max, log }) : undefined);
    out.push({ id: i, name: p.nativeName, value, min, max, unit, log: log || undefined, norm });
  });
  return out;
}

/** Build the open block's enum (dropdown) params from any ConverterParam carrying `enumOptions`. `id` =
 *  the param's index in the block's params array so `setEnum(e, v)` persists back cleanly. Options are
 *  ordered by ordinal (index = value). Empty when the converter attached no enum metadata. */
export function buildEnums(params: readonly ConverterParam[]): EnumParam[] {
  const out: EnumParam[] = [];
  params.forEach((p, i) => {
    const o = p as unknown as Record<string, unknown>;
    const opts = enumOptionsOf(o);
    if (!opts) return;
    out.push({
      id: i,
      name: p.nativeName,
      value: p.value,
      options: opts.map((label, value) => ({ value, label })),
    });
  });
  return out;
}
