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

/** The display value (number) at the current norm, using the device-true range + taper. */
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
