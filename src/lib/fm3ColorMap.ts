// FM3-Edit preset-color → Axis tag name + swatch mapping (replicated-purring-bachman plan). FM3-Edit's
// Preset Picker offers exactly 6 fixed colors; this table is confirmed against the user's real
// `color-assignments_iii.dat` (hex values as parsed by colorLabelsImport's `0xAARRGGBB` → `#RRGGBB`).
// Reuses Axis's existing 9-swatch tag palette (tagColors.ts) rather than storing arbitrary hex, so the
// hand-picked swatch system stays untouched.
import { TAG_SWATCH_COUNT, tagSwatchCss } from './tagColors';

export interface Fm3ColorMapping {
  name: string;
  swatchIndex: number;
}

const FM3_COLOR_TABLE: Record<string, Fm3ColorMapping> = {
  '#febcbc': { name: 'Red', swatchIndex: 0 },
  '#ffd086': { name: 'Orange', swatchIndex: 1 },
  '#fff58a': { name: 'Yellow', swatchIndex: 3 },
  '#d7f184': { name: 'Green', swatchIndex: 4 },
  '#bee0fb': { name: 'Blue', swatchIndex: 6 },
  '#f1d0fb': { name: 'Purple', swatchIndex: 7 }
};

/** Hue in [0, 360) for a `#rrggbb` hex string. */
function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Every FM3-Edit table entry's hue, precomputed once for the fallback's nearest-hue search. */
const TABLE_HUES: { hex: string; hue: number; mapping: Fm3ColorMapping }[] = Object.entries(FM3_COLOR_TABLE).map(
  ([hex, mapping]) => ({ hex, hue: hue(hex), mapping })
);

/** Map an FM3-Edit group hex to its Axis tag name + swatch. Exact table hit for the 6 known
 *  FM3-Edit colors; otherwise nearest-hue fallback (not naive RGB Euclidean, so a pastel color still
 *  maps sensibly) against the same 6 hues, named after the closest match — keeps the feature from
 *  silently doing nothing if a future FM3-Edit version changes a swatch or another editor's file has
 *  different colors. */
export function mapFm3Color(hex: string): Fm3ColorMapping {
  const key = hex.toLowerCase();
  const exact = FM3_COLOR_TABLE[key];
  if (exact) return exact;

  const h = hue(key);
  let best = TABLE_HUES[0];
  let bestDist = Infinity;
  for (const candidate of TABLE_HUES) {
    const dist = hueDistance(h, candidate.hue);
    if (dist < bestDist) { bestDist = dist; best = candidate; }
  }
  return best.mapping;
}

// Re-exported so callers can render a group's swatch without importing tagColors separately.
export { tagSwatchCss, TAG_SWATCH_COUNT };
