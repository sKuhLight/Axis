// EQ helpers: GEQ band frequencies per type, and PEQ band-type → curve shape.

export type EQShape = 'bell' | 'lowshelf' | 'highshelf' | 'lowcut' | 'highcut';

// PEQ curve shape from the band's device-true type label (Peaking / Shelving / Blocking …) +
// whether it's a low-side band (→ low shelf/cut) or high-side (→ high shelf/cut).
export function shapeFromLabel(label: string | undefined, isLow: boolean): EQShape {
  const l = (label ?? '').toLowerCase();
  if (/block|cut/.test(l)) return isLow ? 'lowcut' : 'highcut';
  if (/shelv/.test(l)) return isLow ? 'lowshelf' : 'highshelf';
  return 'bell'; // peaking / default
}

// Standard graphic-EQ centre frequencies by GEQ model. Matched from the type name; the active
// gain params (0..N-1) map onto these in order.
const TEN = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export function geqFreqs(typeName: string, paramCount = 10): number[] {
  const n = typeName ? parseInt(typeName, 10) : paramCount;
  if (/mark/i.test(typeName)) return [80, 240, 750, 2200, 6600]; // Mesa Mark graphic
  if (/console/i.test(typeName)) return [80, 1000, 12000];
  switch (n) {
    case 10:
      return TEN;
    case 8:
      return [63, 125, 250, 500, 1000, 2000, 4000, 8000];
    case 7:
      return [100, 200, 400, 800, 1600, 3200, 6400];
    case 5:
      return [100, 330, 1000, 3300, 10000];
    case 4:
      return [80, 250, 2000, 8000];
    case 3:
      return [100, 1000, 10000];
    default: {
      // even log spacing as a fallback
      const out: number[] = [];
      for (let i = 0; i < (Number.isFinite(n) ? n : 10); i++) out.push(Math.round(31 * Math.pow(16000 / 31, i / Math.max(1, (n || 10) - 1))));
      return out;
    }
  }
}
