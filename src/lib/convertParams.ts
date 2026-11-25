// Pure mapping from a converted block's ConverterParam[] to the editor's NamedParam[] / EnumParam[].
//
// The offline convert editor drives the REAL Block Editor board (BeSurface), which renders knobs from NamedParam and
// dropdowns from EnumParam. The cross-device converter (forgefx-midi §4 param mapping) enriches each
// mapped param with display metadata when a real per-device catalog covers it: `min`/`max`/`unit`/`log`
// for a true knob sweep, `normalized` for the knob position, and `enumOptions` (ordered, index = ordinal)
// for a genuine dropdown. Where the converter had no catalog data those extras are absent and the knob
// degrades to the coarse raw-value fallback — no invented ranges.
//
// Framework-free (no runes / DOM) so it is unit-tested directly; `convertEditor.svelte.ts` is the only
// caller and simply snapshots the results into its `params` / `enums` reactive arrays on openCell.

import { catalogUnitSymbol, normFromValue } from './format';
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

/** How many ordered enum option labels the converter attached to the param (0 = none): the param renders
 *  as a dropdown, and valid ordinals are `0..count-1`. */
export function enumOptionCount(p: ConverterParam): number {
  return enumOptionsOf(p as unknown as Record<string, unknown>)?.length ?? 0;
}

/** The gen-3 preset-body value model: a param slot is a u16 raw in 0..65534, the `.syx` authoring writes
 *  `raw = round(normalized * 65534)`, and the gen-3 lift emits `normalized = raw / 65534` for EVERY param,
 *  enum ordinals included — so an enum ordinal `k` has the wire fraction `k / 65534`. Only meaningful for
 *  gen-3 IR / gen-3 targets (see `normalizedForValue`). */
export const GEN3_WIRE_MAX = 65534;

/** True when the param is a discrete selector: its `value` is the ordinal, and the device wants it as a
 *  discrete write, never a knob fraction. A param is an enum when
 *  1. it carries clean `enumOptions`, or
 *  2. the codec tags it `kind: 'enum'` (an enum without labels — e.g. a same-vocabulary gen-3 lift), or
 *  3. INTERIM, for IR that carries no `kind` at all (e.g. library docs saved before the codec tagged it),
 *     it has no display range and a `displayValue` that is either non-numeric (the gen-3 lift sets
 *     `displayValue` from the enum label on that path), or numeric ("4") while `value` is exactly the raw
 *     ordinal behind `normalized` (`value === round(normalized * 65534)`).
 *  `kind: 'float' | 'int'` is authoritative for "not an enum" and switches the interim guess off. */
export function isEnumParam(p: ConverterParam): boolean {
  const o = p as unknown as Record<string, unknown>;
  if (enumOptionsOf(o)) return true;
  const kind = o['kind'];
  if (kind === 'enum') return true;
  if (kind === 'float' || kind === 'int') return false;
  if (num(o, 'min') != null && num(o, 'max') != null) return false; // a ranged param is a knob
  const label = str(o, 'displayValue');
  if (label == null || label.trim() === '') return false;
  if (!Number.isFinite(Number(label))) return true; // a textual label can only be an enum's
  const normalized = num(o, 'normalized');
  return normalized != null && Number.isInteger(p.value) && p.value === Math.round(normalized * GEN3_WIRE_MAX);
}

/** The read-only display text for an enum param that has NO option labels (so there is no dropdown to
 *  show it in): the converter's `displayValue` when present, else the ordinal as `#<n>`. Undefined for
 *  anything else (a knob, or an enum with options — those render as a dropdown). */
export function readOnlyEnumLabel(p: ConverterParam): string | undefined {
  if (!isEnumParam(p) || enumOptionCount(p) > 0) return undefined;
  const label = str(p as unknown as Record<string, unknown>, 'displayValue')?.trim();
  return label ? label : `#${p.value}`;
}

/** Build the open block's knob params. `id` = the param's index in the block's params array so
 *  `setParam(p, v)` maps 1:1 back to `convertScratch.setParam(key, id, …)`. Enum params (see
 *  {@link isEnumParam}) are EXCLUDED here — those with `enumOptions` render as dropdowns (see
 *  buildEnums); an enum with no labels has nothing valid to edit to, so it is neither a knob nor a
 *  dropdown: it keeps its value and is listed read-only (see {@link readOnlyEnumLabel}).
 *  Range / unit / taper / knob position are taken from the IR extras when present, else the raw value
 *  renders coarse (no device-free param catalog is otherwise available offline). */
export function buildParams(params: readonly ConverterParam[]): NamedParam[] {
  const out: NamedParam[] = [];
  params.forEach((p, i) => {
    const o = p as unknown as Record<string, unknown>;
    if (isEnumParam(p)) return; // enum → dropdown (labelled) or read-only (unlabelled), never a knob
    const min = num(o, 'min');
    const max = num(o, 'max');
    // The converter names a display symbol, but route it through the shared catalog mapping so a raw
    // catalog code (percent, knob_0_10, semitones …) can never reach a knob readout; a code that names no
    // unit (knob_0_10, numeric, …) leaves the knob unitless (undefined, as when the extra is absent).
    const unit = catalogUnitSymbol(str(o, 'unit')) || undefined;
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
