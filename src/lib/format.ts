// Display formatting for device params, shared by knobs, the grid meter HUD, and readouts.
// Computes the device-true value from the knob position (norm) + range, so it tracks live drags.
export interface DispRange {
  norm?: number;
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
  log?: boolean;
}

/** The display value (number) at the current norm, using the device-true range + taper.
 *  Taper: `log:true` interpolates geometrically, otherwise linearly. NOTE: captured 'custom'
 *  taper shapes are served by ForgeFX as `log:false` for now, so Axis maps them linearly here
 *  (a deliberate initial approximation, not a true custom curve). */
export function paramValue(p: DispRange): number {
  const norm = p.norm ?? 0;
  if (p.min == null || p.max == null) return p.value ?? norm * 10;
  return p.log && p.min > 0 ? p.min * Math.pow(p.max / p.min, norm) : p.min + norm * (p.max - p.min);
}

/** Inverse of paramValue: a display value → knob position (norm 0..1), respecting the taper. */
export function normFromValue(value: number, p: { min?: number; max?: number; log?: boolean }): number {
  if (p.min == null || p.max == null || p.max === p.min) return 0;
  const n = p.log && p.min > 0 ? Math.log(value / p.min) / Math.log(p.max / p.min) : (value - p.min) / (p.max - p.min);
  return Math.max(0, Math.min(1, n));
}

/** Unit symbol for a readout ('' when none). */
export function paramUnit(p: DispRange): string {
  return p.min == null || p.max == null ? '' : p.unit ?? '';
}

/** Compact readout for a knob face (unit folded in: 1.2k, 63%, 5.1). */
export function fmtCompact(p: DispRange): string {
  if (p.min == null || p.max == null) return ((p.norm ?? 0) * 10).toFixed(1);
  const v = paramValue(p);
  if (p.unit === 'Hz') return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(v));
  if (p.unit === '%') return Math.round(v) + '%';
  return Math.abs(v) >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1);
}

/** Big number for the HUD (no inline unit; unit shown separately via paramUnit). */
export function fmtNumber(p: DispRange): string {
  if (p.min == null || p.max == null) return Math.round((p.norm ?? 0) * 100) + '';
  const v = paramValue(p);
  if (p.unit === 'Hz' && Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.abs(v) >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1);
}

/** Join an already-formatted number with its unit token for a readout.
 *  Device-true: tokens render verbatim (casing kept, e.g. `dB/OCT`, `SECONDS`) separated by a
 *  single space — except `%`, which attaches with no space by convention (63%, not 63 %).
 *  An empty/absent unit yields just the number: never a trailing space, double space, or `undefined`. */
export function withUnit(num: string, unit?: string): string {
  if (!unit) return num;
  return unit === '%' ? num + unit : num + ' ' + unit;
}

/** Full, readable value for the value bubble — device-true value at the current norm, unit folded in.
 *  Hz ≥ 1000 compacts to kHz (the ONLY conversion; new tokens like dB/OCT or SECONDS pass through
 *  verbatim). Uses withUnit() for spacing so every token renders consistently. */
export function fmtValue(p: DispRange): string {
  const v = paramValue(p);
  if (p.unit === 'Hz' && Math.abs(v) >= 1000) {
    return (v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' kHz';
  }
  const num = Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  return withUnit(num, paramUnit(p));
}
