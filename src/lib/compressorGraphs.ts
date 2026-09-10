// Compressor transfer graphs. Threshold/Ratio models get a curve calculated from their own two params;
// Sustain-style models (Pedal, Pedal1, JFET2 — a "Compression" knob and no Threshold/Ratio) get the
// curve below, fitted to the FM3 editor's own drawing. See SUSTAIN_* for why it is fitted, not derived.
import type { DeviceLayout, EnumParam, LayoutControl, NamedParam } from './types';
import { graphKind, graphSlotsForPage } from './deviceWidgets';

export interface CompressorGraphSpec {
  key: string;
  page: number;
  slot: number;
  threshold?: NamedParam;
  ratio?: NamedParam;
  sustain?: NamedParam;
  knee?: EnumParam;
  attack?: NamedParam;
  release?: NamedParam;
}


// Real hardware never reports bit-exact 0 dB GR at idle (detector noise floor/quantization), so a
// strict `grDb <= 0` guard almost never fires — it keeps resolving a "real" point a hair above
// threshold instead of recognizing silence. Treat anything under this as imperceptible/no reduction.
const GR_NOISE_FLOOR_DB = 0.1;

/** ── Sustain-style ("pedal") compressors ────────────────────────────────────────────────────────────
 *
 *  These models (Pedal, Pedal1, JFET2) author a single "Compression" knob and no Threshold/Ratio, and
 *  the device gives us NOTHING to compute a curve from: a live FM3 (preset 348, Econo-Dyno-Comp) reports
 *  COMP_THRESH frozen at -40 dB and COMP_RATIO at 2.0 across the entire Compression sweep AND across all
 *  19 Comp Types, while it does reload Attack/Release/Drive on a type change. Those two params are inert
 *  for these models — binding them would draw a curve that never moves.
 *
 *  So this is FITTED TO THE FM3 EDITOR'S OWN DRAWING, not derived from the device and not measured from
 *  audio. The editor computes its curve client-side from Compression (it has no more device access than
 *  we do), so matching its picture is the goal; this is deliberately NOT a claim about the block's real
 *  DSP. Captures + the digitiser and fit are in `docs/handoff/compressor-graph/`.
 *
 *  What the editor draws is a pure LIMITER, in a graph whose axes span the same range (proved by
 *  Compression 0 being the identity line): unity gain, then a soft knee onto a flat ceiling. Compression
 *  moves exactly two things — a gain applied ahead of the detector, and the ceiling. Fitting the six
 *  captures (Compression 0/2/4/6/8/10) with the shape locked reproduces every one to 0.44 px in a 344 px
 *  box; the two laws below hold to ~1.1 px.
 *
 *  Coordinates here are NORMALISED graph space (0..1 on both axes, y up), which is what the editor's own
 *  quartered grid is drawn in — the caller maps it onto whatever dB window it plots. */
const SUSTAIN_KNEE = 12; // knee sharpness; fitted constant across every capture (higher = harder corner)
const SUSTAIN_GAIN_A = 0.0845; // gain(c) = A*ln(1 + B*c) — max error 0.56 px over the six captures
const SUSTAIN_GAIN_B = 1.7;
const SUSTAIN_CEIL_FLOOR = 0.606; // ceiling(c) = FLOOR + A*exp(-B*c) — max error 1.14 px
const SUSTAIN_CEIL_A = 0.34;
const SUSTAIN_CEIL_B = 1.6;
/** The device's Compression knob range (COMP_SUSTAIN is served 0..10). */
const SUSTAIN_MAX = 10;

/** ln(1 + e^(kz))/k — a softplus, the smooth "how much reduction at this level" term. Guarded at both
 *  tails so a large |kz| cannot overflow: past ~40 the function is its own asymptote to double precision. */
function softplus(z: number, k: number): number {
  const kz = k * z;
  if (kz > 40) return z;
  if (kz < -40) return Math.exp(kz) / k;
  return Math.log1p(Math.exp(kz)) / k;
}

export interface SustainTransfer {
  /** Gain applied ahead of the detector, in normalised graph units. */
  gain: number;
  /** Flat output ceiling the curve asymptotes to, in normalised graph units. */
  ceiling: number;
  knee: number;
}

/** Transfer parameters for a Compression setting (0..10), in normalised graph space. */
export function sustainTransfer(compression: number): SustainTransfer {
  const c = Math.min(SUSTAIN_MAX, Math.max(0, compression));
  return {
    gain: SUSTAIN_GAIN_A * Math.log1p(SUSTAIN_GAIN_B * c),
    ceiling: SUSTAIN_CEIL_FLOOR + SUSTAIN_CEIL_A * Math.exp(-SUSTAIN_CEIL_B * c),
    knee: SUSTAIN_KNEE
  };
}

/** Output level for an input level, both normalised 0..1 — the curve the graph plots. */
export function sustainCurveY(x: number, transfer: SustainTransfer): number {
  const u = x + transfer.gain;
  return u - softplus(u - transfer.ceiling, transfer.knee);
}

/** Where on the sustain curve the signal currently sits, from gain reduction (normalised to the same
 *  axis span as the curve). The softplus inverts exactly, so unlike the Threshold/Ratio path this is a
 *  closed form rather than a search. `null` when there is no reduction to place — see the note on
 *  {@link compressorDotPosition}, which this mirrors. */
export function sustainDotPosition(transfer: SustainTransfer, grNorm: number): { input: number; output: number } | null {
  if (!(grNorm > 0)) return null;
  const e = Math.exp(transfer.knee * grNorm);
  if (!(e > 1)) return null; // reduction below the resolution of the inverse
  const u = transfer.ceiling + Math.log(e - 1) / transfer.knee;
  return { input: u - transfer.gain, output: u - grNorm };
}

/** Invert the piecewise-linear transfer curve to find the point currently producing `grDb` of gain
 *  reduction. There's no live "input level" telemetry for compressors (the device reports gain
 *  reduction only), so this only resolves a point while gr is meaningfully above zero (input above
 *  threshold) — below threshold the real input is unknowable and callers should treat `null` as
 *  "resting/idle" rather than guessing a spot on the curve. */
export function compressorDotPosition(threshold: number, ratio: number, grDb: number): { input: number; output: number } | null {
  if (ratio <= 1 || grDb <= GR_NOISE_FLOOR_DB) return null;
  const input = threshold + (grDb * ratio) / (ratio - 1);
  return { input, output: input - grDb };
}

/** Resolve a compressor graph from its entire page because Knee may live below the Basic-row slot. */
export function deriveCompressorGraphs(input: {
  layout: DeviceLayout | null | undefined;
  params: NamedParam[];
  enums: EnumParam[];
}): CompressorGraphSpec[] {
  const params = new Map(input.params.filter((param) => param.id != null).map((param) => [param.id as number, param]));
  const enums = new Map(input.enums.map((param) => [param.id, param]));
  const out: CompressorGraphSpec[] = [];

  for (const [page, layoutPage] of (input.layout?.pages ?? []).entries()) {
    const controls = (layoutPage.rows ?? []).flatMap((row) => row.controls ?? []);
    const idOf = new Map(controls.filter((control) => control.paramName && control.paramId != null).map((control) => [control.paramName!, control.paramId!]));
    const param = (name: string): NamedParam | undefined => {
      const id = idOf.get(name);
      return id == null ? undefined : params.get(id);
    };
    const enumParam = (name: string): EnumParam | undefined => {
      const id = idOf.get(name);
      return id == null ? undefined : enums.get(id);
    };
    const slots = graphSlotsForPage(controls);
    for (const control of controls) {
      if (control.widget !== 'graph') continue;
      const graphSlot = slots.get(control)!;
      if (graphKind(control.rawWidget) !== 'comp') continue;
      out.push({
        key: `comp${out.length + 1}`,
        page,
        slot: graphSlot,
        threshold: param('COMP_THRESH') ?? param('COMP_THRESH2'),
        ratio: param('COMP_RATIO'),
        sustain: param('COMP_SUSTAIN'),
        knee: enumParam('COMP_KNEE'),
        attack: param('COMP_ATTACK'),
        release: param('COMP_RELEASE')
      });
    }
  }
  return out;
}
