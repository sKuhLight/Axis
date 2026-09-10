// Compressor transfer graphs. Threshold/Ratio models get a curve calculated from their own params —
// including COMP_KNEE, which rounds the corner the way the FM3 editor draws it, see the knee note;
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
  level?: NamedParam;
  /** `DeviceLayout.variantName` — the model whose graph this is, which the knee depends on. */
  variant?: string;
  attack?: NamedParam;
  release?: NamedParam;
}


/** ── The window the editor plots ────────────────────────────────────────────────────────────────────
 *
 *  FM3-Edit's compressor graph spans **−80 … +20 dB on both axes**, with its grid at quarters of the
 *  box (so the lines fall on −55 / −30 / −5 dB, which is why they are not round numbers).
 *
 *  Measured, not assumed: `docs/handoff/compressor-graph/measurements/knee/official-{007,013}.png` are
 *  the editor's graph for two presets whose Threshold, Ratio, Knee Type and Level are known from the
 *  device. Digitising them against their own grid gives a sub-threshold slope of 0.99 (so both axes
 *  share one span) and an above-threshold slope of 0.25 (so Ratio 4 is plotted literally); the two
 *  presets then independently place the axis floor at −79.6 and −79.9 dB. Free-fitting the window lands
 *  on −82.2 … +21.7 at 0.28 px rms; pinning the round −80 … +20 costs 0.70 px rms and 1.4 px worst
 *  case, so the round window is what ships.
 *
 *  NOT the threshold knob's own range. `COMP_THRESH` is served as −60 … +20, and Axis used to plot that
 *  window — which is the natural-looking thing to do and is wrong by up to 49 px against these captures. */
export const GRAPH_MIN_DB = -80;
export const GRAPH_MAX_DB = 20;

/** The editor draws COMP_LEVEL (the block's output level) as part of the transfer curve. Same two
 *  captures: preset 007 needs +0.55 dB of lift and preset 013 needs +6.0 dB, matching their COMP_LEVEL
 *  exactly — that difference is the whole reason 013's curve sat visibly too low before.
 *
 *  Unverified neighbours, deliberately not drawn: COMP_AUTO (Auto Makeup) was OFF on both captures, so
 *  whatever gain it adds when ON is unknown; COMP_MIX was 100% on both, and at less than that the real
 *  block blends back toward unity. Both would move this curve, and guessing at them would undo the
 *  point of measuring. */
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

/** Inverse of {@link softplus}: the input level that produces `s` of reduction, or `null` when there is
 *  no reduction to invert. Guarded at the top tail the same way — past ~40 the softplus is its own
 *  asymptote, so the inverse is the identity and `exp` would overflow to Infinity if we let it. */
function inverseSoftplus(s: number, k: number): number | null {
  if (!(s > 0)) return null;
  const ks = k * s;
  if (ks > 40) return s;
  const e = Math.exp(ks);
  if (!(e > 1)) return null; // reduction below the resolution of the inverse
  return Math.log(e - 1) / k;
}

export interface SustainTransfer {
  /** Gain applied ahead of the detector, in normalised graph units. */
  gain: number;
  /** Flat output ceiling the curve asymptotes to, in normalised graph units. */
  ceiling: number;
  knee: number;
  /** COMP_LEVEL, in normalised graph units — see the note above. */
  level: number;
}

/** Transfer parameters for a Compression setting (0..10), in normalised graph space. `level` is
 *  COMP_LEVEL already divided by the axis span. */
export function sustainTransfer(compression: number, level = 0): SustainTransfer {
  const c = Math.min(SUSTAIN_MAX, Math.max(0, compression));
  return {
    gain: SUSTAIN_GAIN_A * Math.log1p(SUSTAIN_GAIN_B * c),
    ceiling: SUSTAIN_CEIL_FLOOR + SUSTAIN_CEIL_A * Math.exp(-SUSTAIN_CEIL_B * c),
    knee: SUSTAIN_KNEE,
    level
  };
}

/** Output level for an input level, both normalised 0..1 — the curve the graph plots. */
export function sustainCurveY(x: number, transfer: SustainTransfer): number {
  const u = x + transfer.gain;
  return u - softplus(u - transfer.ceiling, transfer.knee) + transfer.level;
}

/** Where on the sustain curve the signal currently sits, from gain reduction (normalised to the same
 *  axis span as the curve). `null` when there is no reduction to place — see the note on
 *  {@link ratioDotPosition}, which this mirrors. */
export function sustainDotPosition(transfer: SustainTransfer, grNorm: number): { input: number; output: number } | null {
  const z = inverseSoftplus(grNorm, transfer.knee);
  if (z == null) return null;
  const u = transfer.ceiling + z;
  return { input: u - transfer.gain, output: u - grNorm + transfer.level };
}

/** ── Threshold/Ratio compressors: the knee ──────────────────────────────────────────────────────────
 *
 *  The Studio / Analog / JFET1 variants compute their curve from their own Threshold and Ratio, so
 *  unlike the sustain models above there is nothing to fit — except the corner. Axis used to draw the
 *  textbook two-segment curve (unity below threshold, `T + (x-T)/R` above) and got a hard corner where
 *  the FM3 editor draws a rounded one, which is the whole visible difference on a preset like 007.
 *
 *  The rounding is the same shape as the sustain curve's: `y = x - slope * softplus(x - T, k)`, which
 *  is unity gain far below threshold and `T + (x-T)/R` far above, joined smoothly. That is not a
 *  coincidence — the sustain fit landed on exactly this form with `slope = 1` (a limiter), so treating
 *  the editor as drawing one softplus-kneed curve for every compressor makes the two paths one model.
 *
 *  `COMP_KNEE` picks the sharpness where the variant authors the dropdown (Studio FF, Studio FB, Pedal,
 *  JFET2). Its five options are HARD / MED-HARD / MEDIUM / MED-SOFT / SOFT (device enum 0..4, default
 *  MEDIUM). MED-HARD is measured at 0.36/dB, from FM3-Edit's graph on presets 007 and 013.
 *
 *  Where the variant authors NO dropdown, the knee is the model's own and `COMP_KNEE` is ignored —
 *  proved by preset 376 (Analog), which stores MED-HARD like 007 and 013 but is drawn far softer at
 *  0.111/dB. So this is a per-variant table, not a fallback to the device's default option.
 *
 *  PARTLY PROVISIONAL: MED-HARD (0.36), Analog (0.111) and JFET1 (hard — 0.58 and up all fit equally,
 *  so the table takes the HARD value) are measured. The other four COMP_KNEE options halve and double
 *  from MED-HARD, which is an interpolation: every captured preset that authors the dropdown happened
 *  to be MED-HARD, so the spacing between options is unmeasured. See the "Known gap" section of
 *  `docs/handoff/compressor-graph/README.md`. */
const KNEE_SHARPNESS_PER_DB = [0.72, 0.36, 0.18, 0.09, 0.045];
const KNEE_DEFAULT_OPTION = 2; // MEDIUM — the device's own default for COMP_KNEE

/** Layout variants with no Knee Type control, keyed by `DeviceLayout.variantName`. */
const VARIANT_KNEE_SHARPNESS: Record<string, number> = {
  Analog: 0.111, // preset 376, VCA "Analog Compressor" — 0.8 px worst case
  JFET1: 0.72 // preset 018, "JFET Studio Compressor" — measured only as "hard", see above
};

/** The knee for a variant with no control and no measurement of its own. Deliberately the same value
 *  the sustain limiter fit landed on (k = 12 in normalised units over this 100 dB window = 0.12/dB) —
 *  which is also, independently, within 8% of Analog's measured 0.111. Two unrelated fits agreeing is
 *  the reason this is a considered default rather than a shrug. */
const DEFAULT_KNEE_SHARPNESS = 0.115;

/** Knee sharpness in 1/dB. `COMP_KNEE` wins when the variant authors it; otherwise the variant's own. */
export function kneeSharpness(knee: EnumParam | null | undefined, variant?: string | null): number {
  if (knee) {
    const option = Math.round(knee.value);
    return KNEE_SHARPNESS_PER_DB[option] ?? KNEE_SHARPNESS_PER_DB[KNEE_DEFAULT_OPTION];
  }
  const byVariant = variant == null ? undefined : VARIANT_KNEE_SHARPNESS[variant];
  return byVariant ?? DEFAULT_KNEE_SHARPNESS;
}

export interface RatioTransfer {
  /** dB. */
  threshold: number;
  ratio: number;
  /** Knee sharpness in 1/dB — higher is a tighter corner. */
  knee: number;
  /** COMP_LEVEL, dB. The editor plots the block's output level as part of the curve — see the note above. */
  level: number;
}

export function ratioTransfer(input: {
  threshold: number;
  ratio: number;
  knee?: EnumParam | null;
  /** COMP_LEVEL in dB. */
  level?: number;
  /** `DeviceLayout.variantName`, which decides the knee when the variant authors no Knee control. */
  variant?: string | null;
}): RatioTransfer {
  return {
    threshold: input.threshold,
    ratio: Math.max(1, input.ratio),
    knee: kneeSharpness(input.knee, input.variant),
    level: input.level ?? 0
  };
}

/** Output dB for an input dB — the curve the graph plots. */
export function ratioCurveY(inputDb: number, transfer: RatioTransfer): number {
  return inputDb + transfer.level - (1 - 1 / transfer.ratio) * softplus(inputDb - transfer.threshold, transfer.knee);
}

/** Invert the curve to find the point currently producing `grDb` of gain reduction. There's no live
 *  "input level" telemetry for compressors (the device reports gain reduction only), so this only
 *  resolves a point while gr is meaningfully above zero (input above threshold) — below threshold the
 *  real input is unknowable and callers should treat `null` as "resting/idle" rather than guessing a
 *  spot on the curve. */
export function ratioDotPosition(transfer: RatioTransfer, grDb: number): { input: number; output: number } | null {
  const slope = 1 - 1 / transfer.ratio;
  if (slope <= 0 || grDb <= GR_NOISE_FLOOR_DB) return null;
  const z = inverseSoftplus(grDb / slope, transfer.knee);
  if (z == null) return null;
  const input = transfer.threshold + z;
  return { input, output: input - grDb + transfer.level };
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
        level: param('COMP_LEVEL'),
        variant: input.layout?.variantName,
        attack: param('COMP_ATTACK'),
        release: param('COMP_RELEASE')
      });
    }
  }
  return out;
}
