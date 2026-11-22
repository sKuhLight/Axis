// Value display, typing and stepping for the Block Editor's knob centre.
//
// Builds on format.ts (taper, units, kHz compaction) rather than repeating it. The knob centre shows a
// device-style number: precision follows the parameter's range (0..1 → 1.000, 0..10 → 7.00,
// −80..20 dB → −14.7 dB) and negatives use a true minus sign. Pure (valueFormat.test.ts).

import { fmtValue, normFromValue, paramUnit, paramValue, withUnit, type DispRange } from '../format';

const MINUS = '−';
/** Parameters without a range show (and take typed values) on a 0..10 scale. */
const UNRANGED_SCALE = 10;

/** Decimal places for a range span: narrow ranges get more precision. */
function decimalsFor(span: number): number {
  if (span <= 2) return 3;
  if (span <= 20) return 2;
  if (span <= 200) return 1;
  return 0;
}

/** Device-style value for the knob centre, unit included (`7.00`, `−14.7 dB`, `1.000`, `1.2 kHz`). */
export function formatCentre(p: DispRange): string {
  if (p.min == null || p.max == null) return ((p.norm ?? 0) * UNRANGED_SCALE).toFixed(2);
  const unit = paramUnit(p);
  if (unit === 'Hz') return fmtValue(p).replace(/^-/, MINUS);
  const v = paramValue(p);
  const places = unit === '%' ? 0 : decimalsFor(Math.abs(p.max - p.min));
  let num = Math.abs(v).toFixed(places);
  if (v < 0 && Number(num) !== 0) num = MINUS + num;
  return withUnit(num, unit);
}

/** Full value for the hover bubble (unchanged from the previous editor). */
export const formatFull = (p: DispRange): string => fmtValue(p);

/** Keyboard / fine-drag step as a norm delta: 1 % of the range, or 0.1 % with Shift (fine). */
export function stepFor(_p: DispRange, fine: boolean): number {
  return fine ? 0.001 : 0.01;
}

/** Apply `steps` arrow-key steps to a norm, clamped to 0..1 and rounded to the step grid. */
export function stepNorm(p: DispRange, steps: number, fine: boolean): number {
  const s = stepFor(p, fine);
  const n = (p.norm ?? 0) + steps * s;
  return Math.max(0, Math.min(1, Math.round(n / s) * s));
}

const squash = (u: string): string => u.replace(/\s+/g, '').toLowerCase();

/** Parse a typed value into a norm (0..1), or null when it is not a value for this parameter.
 *  Accepts a comma as decimal separator and a true minus sign. A trailing unit is allowed only when it
 *  is the parameter's own unit (case and spaces ignored: `-3,5 dB`, `63%`); for Hz parameters `Hz`,
 *  `k` and `kHz` are accepted, the latter two multiplying by 1000. Exponent notation (`1e3`) is not
 *  accepted — the `e3` is read as an unknown unit, so the input is rejected. Parameters without a
 *  range read the number on the same 0..10 scale the knob centre shows (`formatCentre`), so the value
 *  shown parses back to the value it came from. */
export function parseTyped(p: DispRange, text: string): number | null {
  const s = text.trim().replace(/−/g, '-').replace(/\s+/g, '').replace(',', '.');
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(.*)$/.exec(s);
  if (!m) return null;
  let v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  const suffix = squash(m[2] ?? '');
  const own = squash(p.unit ?? '');
  const hzExtra = p.unit === 'Hz' ? ['k', 'khz'] : [];
  if (suffix && suffix !== own && !hzExtra.includes(suffix)) return null;
  if (hzExtra.includes(suffix)) v *= 1000;
  if (p.min == null || p.max == null) return Math.max(0, Math.min(1, v / UNRANGED_SCALE));
  return normFromValue(Math.max(Math.min(p.min, p.max), Math.min(Math.max(p.min, p.max), v)), p);
}
