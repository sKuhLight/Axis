// Graph tile model: one served block visual (kind + roles → param ids) and the block's live values → a
// drawable plot (SVG paths in a fixed view box, markers, ticks, caption, honesty notes, accessible name).
// The tile component only renders what this returns; all the reading and the math happen here and in the
// sibling modules. Pure (graphModel.test.ts).
//
// Own math, no editor-derived constants. Every value is the parameter's own display value (`paramValue`, the
// same number its knob shows — it follows a drag at once), so a graph never disagrees with its knob. What is assumed, and therefore said on
// the tile (caption note / tooltip) where a user could be misled:
//   - dynamics: the knee law (standard soft knee; widths per knee option are ours), "model knee, drawn
//     medium" where the type has no knee control; Auto makeup is not drawn; a static curve only (no attack
//     / release); types without a threshold + ratio get no invented curve (threshold marker + live gain
//     reduction only); a gate type without a ratio is drawn as a hard gate down to its range;
//   - LFO: textbook shapes; skew / duty semantics on non-square shapes, the tempo-division semantics and the
//     depth scale are assumptions; the playhead shows the RATE, not the device's real LFO phase; how depth
//     maps to delay time / frequency is unknown, so the scope shows normalised modulation;
//   - response: analog second-order prototypes (no sample-rate warping), 4th order = the section squared,
//     the cut knobs as 12 dB/oct Butterworth sections, tilt = shelf pair at f0; combs / envelope types are
//     not drawn; the wah sweep is log-frequency and its taper is not modelled;
//   - decay: the time parameter taken as RT60; early reflections not modelled;
//   - echo: feedback × master feedback per repeat; the stereo ratio as R = T·ratio/100; routings other than
//     mono / stereo / ping-pong / dual are drawn as mono ("simplified");
//   - ADSR: the sustain parameter is a hold time; exponential limbs with our own curvature;
//   - cab alignment: the delays in the unit the device shows; the axis is fitted to them.
// FM3 custom tapers are served linear, so a value matches its knob but may differ from the unit's display.

import type { BlockVisual, EnumParam, LiveMonitor, NamedParam } from '../../types';
import { paramValue } from '../../format';
import { formatFull } from '../valueFormat';
import { adsrCurveFromLabel, adsrTrace } from './adsr';
import { decayTrace, decayWindow, DECAY_FLOOR_DB } from './decay';
import { compCurve, DYNAMICS_WINDOW_FALLBACK, dynamicsWindow, GATE_RATIO_NO_RATIO, gateCurve, kneeWidth, mixBlend } from './dynamics';
import { echoTaps, routingFromLabel, type EchoTap } from './echo';
import { LFO_TRACE_CYCLES, lfoShapeFromLabel, lfoTrace, type LfoShape } from './lfo';
import { areaPathFrom, fmtDb, fmtHz, fmtMs, fmtSec, linMap, logMap, logTicks, niceTicks, pathFrom } from './plot';
import { filterResponse, FOURTH_ORDER_TYPES, logFreqs, typeFromLabel, wahResponse, type FilterType } from './response';
import { divisionSeconds, formatHz, formatPeriod, lfoRateHz, parseDivision } from './tempo';

// ── plot shape ─────────────────────────────────────────────────────────────────────────────────────

/** View box of every plot (the SVG scales it to the tile, strokes stay one width). */
export const VB_W = 200;
export const VB_H = 100;
/** Samples per drawn line. */
export const GRAPH_SAMPLES = 120;

// Illustrative (ours) drawing constants — layout choices, not device facts.
/** Threshold range assumed when the threshold knob serves none (dB). */
export const THRESHOLD_RANGE_FALLBACK: readonly [number, number] = [-60, 20];
/** Gain-reduction bar floor when the monitor serves no dB range: compressor / gate. */
export const GR_FALLBACK_MIN_DB = { compressor: -40, gate: -60 } as const;
/** A dynamics x tick this close to the origin (fraction of the window) is left out: it would meet the y tick there. */
export const ORIGIN_TICK_GAP = 0.15;
/** Response plot: ± this many dB. */
export const RESPONSE_RANGE_DB = 24;
/** Wah: the Q drawn when the block serves none. */
export const WAH_Q_DEFAULT = 2;
/** Random LFO shape: the seed of its sample-and-hold sequence (any fixed number: deterministic drawing). */
export const LFO_RANDOM_SEED = 7;
/** Echo train: the time axis runs this much past the last drawn repeat. */
export const ECHO_WINDOW_PAD = 1.06;
/** Cab alignment: the axis spans this multiple of the larger delay (fitted, not the device's scale). */
export const CAB_AXIS_FIT = 1.5;
/** Gain-reduction peak hold: how often a held peak is re-drawn while it falls (ms). */
export const GR_TICK_MS = 200;

export type GraphTone = 'main' | 'alt' | 'ref' | 'faint';
export interface GraphSeries {
  d: string;
  tone: GraphTone;
  dash?: boolean;
  /** Closed area under the line (tinted). */
  area?: string;
}
export interface GraphVLine {
  x: number;
  tone: GraphTone;
  label?: string;
}
export interface GraphHLine {
  y: number;
  tone: GraphTone;
  label?: string;
}
export interface GraphSpike {
  x: number;
  y0: number;
  y1: number;
  tone: GraphTone;
}
export interface GraphTick {
  /** Position in view-box units along its axis. */
  pos: number;
  label: string;
}
export interface GraphPlayhead {
  /** One full sweep of the drawn trace (all its cycles), seconds. */
  sweepSec: number;
  /** The drawn main trace, y in view-box units, evenly over x. */
  ys: number[];
}
export interface GraphPlot {
  series: GraphSeries[];
  vlines: GraphVLine[];
  hlines: GraphHLine[];
  spikes: GraphSpike[];
  xTicks: GraphTick[];
  yTicks: GraphTick[];
  /** Short line under the plot ("2.0 Hz · 500 ms"). */
  caption: string;
  /** Honesty notes: shown in the tile's tooltip, the first one also as a badge where it matters. */
  notes: string[];
  /** A note important enough to show on the tile itself (e.g. "Auto makeup not drawn"). */
  badge?: string;
  /** Accessible name of the tile ("Compressor curve: threshold −18 dB, ratio 4:1, …"). */
  aria: string;
  /** Nothing to draw: the message shown instead (the frame, caption and notes stay). */
  empty?: string;
  /** Dynamics: the live gain-reduction bar is drawn (with this scale) when a monitor reports one. */
  gr?: { minDb: number };
  /** LFO: the animated playhead (the rate, not the device's real phase). */
  playhead?: GraphPlayhead;
}

/** Live values a graph reads (the same ones the board's knobs show). */
export interface GraphInputs {
  knob(id: number): NamedParam | undefined;
  enm(id: number): EnumParam | undefined;
  /** The block's type name (filter type of a FILTER block). */
  typeName?: string | null;
  bpm: number;
  hasTempo: boolean;
}

// ── reading roles ──────────────────────────────────────────────────────────────────────────────────

interface RoleReader {
  /** The role's parameter as a knob, or null. */
  knob(role: string): NamedParam | null;
  /** Numeric value: a knob's display value, else a number-like option label (a quantize "8"). */
  num(role: string): number | null;
  /** An enum role's current option label (trimmed), else null. */
  label(role: string): string | null;
  /** The role is served (a knob or an enum of this block). */
  has(role: string): boolean;
  /** A role's value as the board shows it (aria text), else null. */
  text(role: string): string | null;
}

function reader(v: BlockVisual, inp: GraphInputs): RoleReader {
  const id = (role: string): number | null => (typeof v.roles[role] === 'number' ? v.roles[role]! : null);
  const knob = (role: string): NamedParam | null => {
    const i = id(role);
    const p = i == null ? undefined : inp.knob(i);
    return p && Number.isFinite(paramValue(p)) ? p : null;
  };
  const enm = (role: string): EnumParam | null => {
    const i = id(role);
    return i == null ? null : (inp.enm(i) ?? null);
  };
  const label = (role: string): string | null => {
    const e = enm(role);
    const o = e?.options.find((x) => x.value === e.value);
    return o ? o.label.trim() : null;
  };
  return {
    knob,
    label,
    num: (role) => {
      const p = knob(role);
      if (p) return paramValue(p);
      const l = label(role);
      const n = l != null ? Number.parseFloat(l) : NaN;
      return Number.isFinite(n) ? n : null;
    },
    has: (role) => !!knob(role) || !!enm(role),
    text: (role) => {
      const p = knob(role);
      if (p) return formatFull(p);
      return label(role);
    }
  };
}

/** A knob's value as a 0..1 fraction of its own range (min/max served with it), else value/100. */
function frac(p: NamedParam | null, fallbackMax = 100): number | null {
  if (!p) return null;
  const lo = typeof p.min === 'number' ? p.min : 0;
  const hi = typeof p.max === 'number' && p.max > lo ? p.max : fallbackMax;
  return Math.max(0, Math.min(1, (paramValue(p) - lo) / (hi - lo)));
}

/** A percentage-like knob (duty, skew) as 0..1: a 0..1 range is taken as is, anything else as percent. */
function pct01(p: NamedParam | null): number | undefined {
  if (!p) return undefined;
  const v = typeof p.max === 'number' && p.max <= 1 ? paramValue(p) : paramValue(p) / 100;
  return Math.max(0, Math.min(1, v));
}

const lower = (s: string | null): string => (s ?? '').toLowerCase();
/** An OFF / STOP option label (an LFO that does not run). */
const isOffLabel = (l: string | null): boolean => l != null && /^(off|stop)/i.test(l.trim());
const join = (parts: (string | null | undefined | false)[]): string => parts.filter((p): p is string => !!p).join(', ');
const blank = (): Omit<GraphPlot, 'aria' | 'caption'> => ({ series: [], vlines: [], hlines: [], spikes: [], xTicks: [], yTicks: [], notes: [] });

// ── dynamics ───────────────────────────────────────────────────────────────────────────────────────

function dynamicsPlot(v: BlockVisual, r: RoleReader): GraphPlot {
  const gate = v.mode === 'gate';
  const thr = r.knob('threshold');
  const ratio = r.num('ratio');
  const range = r.num('range');
  const level = r.num('level') ?? 0;
  const mixP = r.knob('mix');
  const mix01 = mixP ? frac(mixP) : null;
  const out = blank();
  const grRole = typeof v.roles.gainReduction === 'number';
  if (grRole) out.gr = { minDb: gate ? GR_FALLBACK_MIN_DB.gate : GR_FALLBACK_MIN_DB.compressor };
  const kneeLabel = r.label('knee');
  const knee = kneeWidth(kneeLabel);
  const curve = !!thr && (ratio != null || (gate && range != null));
  if (!curve) {
    // no invented curve: a threshold marker where one exists, plus the live gain reduction
    const t2 = r.knob('threshold2');
    const [lo, hi] = t2 ? dynamicsWindow(t2.min ?? THRESHOLD_RANGE_FALLBACK[0], t2.max ?? THRESHOLD_RANGE_FALLBACK[1]) : DYNAMICS_WINDOW_FALLBACK;
    if (t2) {
      out.series.push({ d: pathFrom([0, VB_W], [VB_H, 0]), tone: 'ref', dash: true });
      out.vlines.push({ x: linMap(paramValue(t2), lo, hi, 0, VB_W), tone: 'main', label: 'threshold' });
    }
    out.empty = 'No static curve for this type';
    out.notes.push('This type has no threshold + ratio pair: only its threshold (if any) and the live gain reduction are shown.');
    return {
      ...out,
      caption: t2 ? `threshold ${formatFull(t2)}` : 'gain reduction',
      aria: `${v.title}: ${join([t2 && `threshold ${formatFull(t2)}`, r.has('sustain') && `sustain ${r.text('sustain')}`, 'no static curve'])}`
    };
  }
  const [lo, hi] = dynamicsWindow(thr!.min ?? THRESHOLD_RANGE_FALLBACK[0], thr!.max ?? THRESHOLD_RANGE_FALLBACK[1]);
  const xs: number[] = [];
  const ys: number[] = [];
  const W = r.has('knee') ? knee.width : gate ? 0 : knee.width;
  for (let i = 0; i < GRAPH_SAMPLES; i++) {
    const x = lo + ((hi - lo) * i) / (GRAPH_SAMPLES - 1);
    let y = gate
      ? gateCurve(x, paramValue(thr!), ratio ?? GATE_RATIO_NO_RATIO, W, range)
      : compCurve(x, paramValue(thr!), ratio ?? 1, W);
    if (mix01 != null && mix01 < 1) y = mixBlend(y, x, mix01);
    y += level;
    xs.push(linMap(x, lo, hi, 0, VB_W));
    ys.push(linMap(Math.max(lo, Math.min(hi, y)), lo, hi, VB_H, 0));
  }
  out.series.push({ d: pathFrom([0, VB_W], [VB_H, 0]), tone: 'ref', dash: true });
  out.series.push({ d: pathFrom(xs, ys), tone: 'main', area: areaPathFrom(xs, ys, VB_H) });
  out.vlines.push({ x: linMap(paramValue(thr!), lo, hi, 0, VB_W), tone: 'faint', label: 'T' });
  const ticks = niceTicks(lo, hi, 4).filter((t) => t > lo && t < hi);
  const tickLabel = (t: number) => String(Math.round(t)).replace('-', '−');
  // the x labels leave the corner to the y labels (the same value would meet itself at the origin)
  out.xTicks = ticks.filter((t) => (t - lo) / (hi - lo) >= ORIGIN_TICK_GAP).map((t) => ({ pos: linMap(t, lo, hi, 0, VB_W), label: tickLabel(t) }));
  out.yTicks = ticks.map((t) => ({ pos: linMap(t, lo, hi, VB_H, 0), label: tickLabel(t) }));
  if (!r.has('knee') && !gate) out.notes.push('Model knee, drawn medium (this type has no knee control).');
  if (!r.has('knee') && gate) out.notes.push('Drawn with a hard knee (this type has no knee control).');
  if (r.has('knee')) out.notes.push(`Knee widths are illustrative (${knee.label.toLowerCase()} = ${knee.width} dB).`);
  if (gate && ratio == null) out.notes.push('No ratio on this type: drawn as a hard gate down to its range.');
  const autoOn = r.has('autoMakeup') && !isOffLabel(r.label('autoMakeup'));
  if (autoOn) {
    out.badge = 'Auto makeup not drawn';
    out.notes.push('Auto makeup is on: its gain is not drawn.');
  }
  out.notes.push('Static curve only (no attack / release).');
  const ratioText = ratio == null ? null : r.text('ratio');
  return {
    ...out,
    caption: join([`T ${formatFull(thr!)}`, ratioText && `${gate ? 'ratio' : 'R'} ${ratioText}`, range != null && gate ? `range ${r.text('range')}` : null]),
    aria: `${v.title}: ${join([
      `threshold ${formatFull(thr!)}`,
      ratioText && `ratio ${ratioText}`,
      gate && range != null ? `range ${r.text('range')}` : null,
      `knee ${r.has('knee') ? lower(kneeLabel) : gate ? 'hard (model)' : 'medium (model)'}`,
      r.has('level') ? `level ${r.text('level')}` : null,
      mixP ? `mix ${formatFull(mixP)}` : null
    ])}`
  };
}

// ── LFO ────────────────────────────────────────────────────────────────────────────────────────────

/** Scope y range per mode: modulation ±1, tremolo gain 0..1, panner −1 (L) … +1 (R). */
function lfoPlot(v: BlockVisual, r: RoleReader, inp: GraphInputs): GraphPlot {
  const out = blank();
  const tempoLabel = r.label('tempo');
  const rate = lfoRateHz(r.num('rate'), tempoLabel, inp.bpm, inp.hasTempo);
  const shapeLabel = r.label('shape');
  const shape: LfoShape = lfoShapeFromLabel(shapeLabel) ?? 'sine';
  if (!r.has('shape')) out.notes.push('Shape not adjustable on this type: drawn as a sine (assumption).');
  else if (!lfoShapeFromLabel(shapeLabel)) out.notes.push(`Shape “${shapeLabel ?? '?'}” not modelled: drawn as a sine.`);
  const stopped = r.has('run') && isOffLabel(r.label('run'));
  if (!rate) {
    return { ...out, empty: 'No rate', caption: '', aria: `${v.title}: no rate` };
  }
  if (rate.note) out.notes.push(`Tempo unknown: drawn at the Rate value.`);
  const skewP = r.knob('skew');
  const dutyP = r.knob('duty');
  const quant = r.num('quantize');
  const trace = lfoTrace(
    {
      shape,
      rateHz: rate.hz,
      skew: pct01(skewP),
      duty: pct01(dutyP),
      quantize: quant != null && quant >= 2 ? quant : null,
      hicutHz: r.num('hicut'),
      phaseDeg: r.num('phase'),
      seed: LFO_RANDOM_SEED
    },
    GRAPH_SAMPLES
  );
  const mode = v.mode === 'tremolo' || v.mode === 'panner' ? v.mode : 'mod';
  const depth = r.has('depth') ? (frac(r.knob('depth')) ?? 1) : 1;
  const width = r.num('width');
  const center = r.num('center');
  const map = (s: number): number => {
    if (stopped) s = 0;
    if (mode === 'tremolo') return 1 - depth * (1 - (s + 1) / 2); // gain 0..1
    if (mode === 'panner') return Math.max(-1, Math.min(1, (center ?? 0) / 100 + ((width ?? 100) / 100) * s));
    return depth * s;
  };
  const [y0, y1] = mode === 'tremolo' ? [0, 1] : [-1, 1];
  const xs = trace.l.map((_, i) => (VB_W * i) / Math.max(1, trace.l.length - 1));
  const yOf = (s: number) => linMap(map(s), y0, y1, VB_H - 4, 4);
  const ysL = trace.l.map(yOf);
  if (mode !== 'tremolo') out.hlines.push({ y: linMap(0, y0, y1, VB_H - 4, 4), tone: 'faint' });
  out.series.push({ d: pathFrom(xs, ysL), tone: 'main' });
  if (trace.r && !stopped) out.series.push({ d: pathFrom(xs, trace.r.map(yOf)), tone: 'alt', dash: true });
  const cycles = LFO_TRACE_CYCLES;
  out.vlines.push({ x: VB_W / cycles, tone: 'faint' });
  if (!stopped) out.playhead = { sweepSec: cycles / rate.hz, ys: ysL };
  if (stopped) out.notes.push('The LFO is stopped / off.');
  out.notes.push('The moving dot shows the rate, not the device’s real LFO phase.');
  if (mode === 'mod') out.notes.push('Normalised modulation (how depth maps to time / frequency is not modelled).');
  if (rate.synced) out.notes.push('Tempo division drawn as a fraction of a whole note at the device tempo (assumption).');
  if (r.has('skew') || (r.has('duty') && shape !== 'square')) out.notes.push('Shape / duty drawn with our own textbook shape laws.');
  out.yTicks =
    mode === 'tremolo'
      ? [{ pos: linMap(1, 0, 1, VB_H - 4, 4), label: '100%' }, { pos: linMap(0, 0, 1, VB_H - 4, 4), label: '0' }]
      : mode === 'panner'
        ? [{ pos: 4, label: 'R' }, { pos: VB_H - 4, label: 'L' }]
        : [];
  const sync = rate.synced && tempoLabel ? ` · ${tempoLabel}` : '';
  const caption = `${formatHz(rate.hz)} · ${formatPeriod(1 / rate.hz)}${sync}`;
  return {
    ...out,
    caption,
    aria: `${v.title}: ${join([
      shapeLabel ? lower(shapeLabel) : 'sine',
      `${formatHz(rate.hz)}${rate.synced && tempoLabel ? ` (${tempoLabel} at ${Math.round(inp.bpm)} bpm)` : ''}`,
      mode === 'panner' ? `width ${r.text('width') ?? '100%'}` : r.has('depth') ? `depth ${r.text('depth')}` : null,
      trace.r ? `phase ${r.text('phase')}` : null,
      stopped ? 'stopped' : null
    ])}`
  };
}

// ── response ───────────────────────────────────────────────────────────────────────────────────────

const freqX = (f: number) => logMap(f, 20, 20000, 0, VB_W);
const dbY = (db: number) => linMap(Math.max(-RESPONSE_RANGE_DB, Math.min(RESPONSE_RANGE_DB, db)), -RESPONSE_RANGE_DB, RESPONSE_RANGE_DB, VB_H, 0);
function responseAxes(out: Omit<GraphPlot, 'aria' | 'caption'>): void {
  out.xTicks = logTicks(20, 20000)
    .filter((f) => f > 20 && f < 20000 && [100, 1000, 10000].includes(f))
    .map((f) => ({ pos: freqX(f), label: fmtHz(f) }));
  out.yTicks = [12, 0, -12].map((d) => ({ pos: dbY(d), label: d === 0 ? '0' : fmtDb(d).replace(' dB', '') }));
  out.hlines.push({ y: dbY(0), tone: 'faint' });
}
const FILTER_NAMES: Readonly<Record<FilterType, string>> = {
  lowpass: 'low-pass',
  highpass: 'high-pass',
  bandpass: 'band-pass',
  notch: 'notch',
  peaking: 'peaking',
  lowshelf: 'low shelf',
  highshelf: 'high shelf',
  tilt: 'tilt EQ',
  allpass: 'all-pass',
  unsupported: 'not modelled'
};

function responsePlot(v: BlockVisual, r: RoleReader, inp: GraphInputs): GraphPlot {
  const out = blank();
  responseAxes(out);
  const freqs = logFreqs(GRAPH_SAMPLES);
  const xs = freqs.map(freqX);
  if (v.mode === 'wah') {
    const fs = r.num('freqStart');
    const fe = r.num('freqStop');
    if (fs == null || fe == null) return { ...out, empty: 'No sweep range', caption: '', aria: `${v.title}: no sweep range` };
    const control01 = frac(r.knob('control'), 10) ?? 0;
    const resp = wahResponse({ fStart: fs, fStop: fe, q: r.num('q') ?? WAH_Q_DEFAULT, control01 }, freqs);
    out.series.push({ d: pathFrom(xs, resp.min.map(dbY)), tone: 'faint' });
    out.series.push({ d: pathFrom(xs, resp.max.map(dbY)), tone: 'faint' });
    out.series.push({ d: pathFrom(xs, resp.now.map(dbY)), tone: 'main', area: areaPathFrom(xs, resp.now.map(dbY), VB_H) });
    out.notes.push('Idealised resonant band-pass; the sweep is drawn log-frequency (the taper is not modelled).');
    const f = fs * Math.pow(fe / fs, control01);
    return {
      ...out,
      caption: `${fmtHz(f)} Hz · ${fmtHz(fs)}–${fmtHz(fe)} Hz`,
      aria: `${v.title}: ${join([`${fmtHz(f)} Hz now`, `sweep ${fmtHz(fs)} to ${fmtHz(fe)} Hz`, r.has('q') ? `Q ${r.text('q')}` : null])}`
    };
  }
  const typeLabel = v.roles.filterType != null ? r.label('filterType') : inp.typeName ?? null;
  const type = typeFromLabel(typeLabel);
  const freq = r.num('freq');
  if (freq == null) return { ...out, empty: 'No frequency', caption: '', aria: `${v.title}: no frequency` };
  if (type === 'unsupported') {
    out.notes.push('The response of this filter type is not modelled.');
    return { ...out, empty: 'Response not drawn for this type', caption: typeLabel ?? '', aria: `${v.title}: ${typeLabel ?? 'this type'}, not drawn` };
  }
  const orderLabel = r.label('order');
  const order: 2 | 4 = orderLabel != null && /4/.test(orderLabel) ? 4 : 2;
  const lowCut = r.num('lowCut');
  const highCut = r.num('highCut');
  const db = filterResponse({ type, freq, q: r.num('q') ?? Math.SQRT1_2, gainDb: r.num('gain') ?? 0, order, lowCut, highCut }, freqs);
  const ys = db.map(dbY);
  out.series.push({ d: pathFrom(xs, ys), tone: 'main', area: areaPathFrom(xs, ys, dbY(0)) });
  out.vlines.push({ x: freqX(freq), tone: 'faint' });
  const fourth = order === 4 && FOURTH_ORDER_TYPES.has(type);
  out.notes.push('Analog second-order prototype' + (fourth ? ' (4th order = the section squared)' : '') + '.');
  if (lowCut != null || highCut != null) out.notes.push('Low / high cut drawn as 12 dB/oct (assumption).');
  if (type === 'allpass') out.notes.push('All-pass: flat magnitude (it shifts phase only).');
  if (type === 'tilt') out.notes.push('Tilt drawn as a low / high shelf pair at the frequency (assumption).');
  return {
    ...out,
    caption: join([FILTER_NAMES[type], `${fmtHz(freq)} Hz`, r.has('gain') && (type === 'peaking' || type.endsWith('shelf') || type === 'tilt') ? r.text('gain') : null]),
    aria: `${v.title}: ${join([FILTER_NAMES[type], `frequency ${r.text('freq')}`, r.has('q') ? `Q ${r.text('q')}` : null, r.has('gain') ? `gain ${r.text('gain')}` : null, orderLabel ? `${lower(orderLabel)} order` : null])}`
  };
}

// ── reverb decay ───────────────────────────────────────────────────────────────────────────────────

function decayPlot(v: BlockVisual, r: RoleReader): GraphPlot {
  const out = blank();
  const rt = r.num('time');
  const pd = r.num('predelay') ?? 0;
  if (rt == null || rt <= 0) return { ...out, empty: 'No decay time', caption: '', aria: `${v.title}: no decay time` };
  const win = decayWindow(rt, pd);
  const tr = decayTrace(rt, pd, GRAPH_SAMPLES);
  const xs = tr.t.map((t) => linMap(t, 0, win, 0, VB_W));
  const ys = tr.db.map((d) => linMap(d, DECAY_FLOOR_DB, 0, VB_H, 4));
  out.series.push({ d: pathFrom(xs, ys), tone: 'main', area: areaPathFrom(xs, ys, VB_H) });
  if (pd > 0) out.vlines.push({ x: linMap(pd / 1000, 0, win, 0, VB_W), tone: 'faint', label: 'pre' });
  const early = r.num('earlyLevel');
  if (early != null) out.hlines.push({ y: linMap(Math.max(DECAY_FLOOR_DB, Math.min(0, early)), DECAY_FLOOR_DB, 0, VB_H, 4), tone: 'faint', label: 'early' });
  out.xTicks = niceTicks(0, win, 4)
    .filter((t) => t > 0 && t < win)
    .map((t) => ({ pos: linMap(t, 0, win, 0, VB_W), label: fmtSec(t) }));
  out.yTicks = [0, -30, -60].map((d) => ({ pos: linMap(d, DECAY_FLOOR_DB, 0, VB_H, 4), label: String(d).replace('-', '−') }));
  out.notes.push('The time parameter is taken as RT60 (−60 dB); early reflections are not modelled.');
  return {
    ...out,
    caption: join([`RT60 ${fmtSec(rt)}`, pd > 0 ? `pre ${fmtMs(pd)}` : null]),
    aria: `${v.title}: ${join([`time ${r.text('time')}`, r.has('predelay') ? `pre-delay ${r.text('predelay')}` : null, early != null ? `early level ${r.text('earlyLevel')}` : null])}`
  };
}

// ── delay echo train ───────────────────────────────────────────────────────────────────────────────

/** A delay time in ms: tempo-synced when the division is set and the tempo is known, else the knob
 *  (`unknownTempo`: a division is set but the device reports no tempo). */
function delayMs(
  r: RoleReader,
  timeRole: string,
  tempoRole: string,
  inp: GraphInputs
): { ms: number | null; synced: boolean; label: string | null; unknownTempo: boolean } {
  const label = r.label(tempoRole);
  const division = parseDivision(label) != null;
  if (division && inp.hasTempo) {
    const s = divisionSeconds(label, inp.bpm);
    if (s != null) return { ms: s * 1000, synced: true, label, unknownTempo: false };
  }
  return { ms: r.num(timeRole), synced: false, label: null, unknownTempo: division && !inp.hasTempo };
}

function echoPlot(v: BlockVisual, r: RoleReader, inp: GraphInputs): GraphPlot {
  const out = blank();
  const t = delayMs(r, 'time', 'tempo', inp);
  if (t.ms == null || t.ms <= 0) return { ...out, empty: 'No delay time', caption: '', aria: `${v.title}: no delay time` };
  const tr = delayMs(r, 'timeR', 'tempoR', inp);
  const routingLabel = r.label('routing');
  const routing = r.has('routing') ? routingFromLabel(routingLabel) : 'mono';
  const res = echoTaps({
    timeMs: t.ms,
    feedbackPct: r.num('feedback') ?? 0,
    masterPct: r.num('masterFeedback') ?? 100,
    routing,
    ratioPct: r.num('timeRatio'),
    timeRMs: tr.ms,
    feedbackRPct: r.num('feedbackR')
  });
  const taps: EchoTap[] = res.taps;
  const end = Math.max(t.ms / 1000, ...taps.map((x) => x.t)) * ECHO_WINDOW_PAD;
  const twoRows = taps.some((x) => x.ch === 'L') && taps.some((x) => x.ch === 'R');
  const row = (ch: EchoTap['ch']): [number, number] => (!twoRows ? [VB_H - 2, 6] : ch === 'R' ? [VB_H - 2, VB_H / 2 + 4] : [VB_H / 2 - 4, 6]);
  for (const tap of taps) {
    const [base, top] = row(tap.ch);
    const h = Math.min(1, Math.abs(tap.amp));
    out.spikes.push({ x: linMap(tap.t, 0, end, 0, VB_W), y0: base, y1: base - (base - top) * h, tone: tap.amp < 0 ? 'alt' : 'main' });
  }
  if (twoRows) {
    out.hlines.push({ y: VB_H / 2, tone: 'faint' });
    out.yTicks = [{ pos: VB_H / 4, label: 'L' }, { pos: (3 * VB_H) / 4, label: 'R' }];
  }
  out.xTicks = niceTicks(0, end, 4)
    .filter((x) => x > 0 && x < end)
    .map((x) => ({ pos: linMap(x, 0, end, 0, VB_W), label: fmtSec(x) }));
  if (res.simplified) {
    out.badge = 'Simplified';
    out.notes.push(`${routingLabel ?? 'This'} routing is drawn as a mono echo train (simplified).`);
  }
  if (res.infinite) out.notes.push('Feedback at or above 100 %: the repeats do not die away (the first ones are drawn).');
  out.notes.push('Repeats fall by feedback × master feedback each; drawn down to −60 dB.');
  if (routing === 'stereo') out.notes.push('Right time = left time × ratio (assumption).');
  // the caption counts exactly what is drawn: one line (mono, ping-pong) every tap down to the floor; two
  // independent lines (stereo / dual) the left line's
  const repeats = routing === 'stereo' || routing === 'dual' ? taps.filter((x) => x.ch !== 'R').length : taps.length;
  if (t.unknownTempo || tr.unknownTempo) out.notes.push('Tempo unknown: drawn at the Time value.');
  return {
    ...out,
    caption: join([t.synced && t.label ? `${t.label} = ${fmtMs(t.ms)}` : fmtMs(t.ms), res.infinite ? `${repeats}+ repeats` : `${repeats} repeats to −60 dB`]),
    aria: `${v.title}: ${join([
      `time ${t.synced && t.label ? `${t.label} (${fmtMs(t.ms)})` : fmtMs(t.ms)}`,
      r.has('feedback') ? `feedback ${r.text('feedback')}` : null,
      routingLabel ? lower(routingLabel) : null,
      res.infinite ? `${repeats}+ repeats` : `${repeats} repeats to −60 dB`
    ])}`
  };
}

// ── ADSR ───────────────────────────────────────────────────────────────────────────────────────────

function adsrPlot(v: BlockVisual, r: RoleReader): GraphPlot {
  const out = blank();
  const a = r.num('attack');
  const d = r.num('decay');
  const s = r.num('sustainTime');
  const rel = r.num('release');
  if (a == null || d == null || s == null || rel == null) return { ...out, empty: 'No envelope', caption: '', aria: `${v.title}: no envelope` };
  const level01 = frac(r.knob('sustainLevel')) ?? 1;
  const curveLabel = r.label('curve');
  const tr = adsrTrace({ attackMs: a, decayMs: d, sustainMs: s, releaseMs: rel, level01, curve: adsrCurveFromLabel(curveLabel) });
  const total = Math.max(1, tr.t[tr.t.length - 1] ?? 1);
  const xs = tr.t.map((x) => linMap(x, 0, total, 0, VB_W));
  const ys = tr.v.map((x) => linMap(x, 0, 1, VB_H - 2, 6));
  out.series.push({ d: pathFrom(xs, ys), tone: 'main', area: areaPathFrom(xs, ys, VB_H - 2) });
  for (const seg of tr.segments.slice(1)) out.vlines.push({ x: linMap(seg.t0, 0, total, 0, VB_W), tone: 'faint' });
  out.hlines.push({ y: linMap(level01, 0, 1, VB_H - 2, 6), tone: 'faint', label: 'S' });
  out.notes.push('Sustain is a hold time at the sustain level; the exponential curvature is illustrative.');
  const mode = r.label('mode');
  return {
    ...out,
    caption: join([`${fmtMs(a)} / ${fmtMs(d)} / ${fmtMs(s)} / ${fmtMs(rel)}`, curveLabel ? lower(curveLabel) : null, mode ? lower(mode) : null]),
    aria: `${v.title}: ${join([
      `attack ${r.text('attack')}`,
      `decay ${r.text('decay')}`,
      `sustain ${r.text('sustainTime')} at ${r.text('sustainLevel') ?? '100%'}`,
      `release ${r.text('release')}`,
      curveLabel ? lower(curveLabel) : null,
      r.has('threshold') ? `threshold ${r.text('threshold')}` : null
    ])}`
  };
}

// ── cab alignment ──────────────────────────────────────────────────────────────────────────────────

function cabAlignPlot(v: BlockVisual, r: RoleReader): GraphPlot {
  const out = blank();
  const p1 = r.knob('delay1');
  const p2 = r.knob('delay2');
  if (!p1 || !p2) return { ...out, empty: 'No delays', caption: '', aria: `${v.title}: no delays` };
  const rangeMax = Math.max(p1.max ?? 1, p2.max ?? 1);
  const most = Math.max(paramValue(p1), paramValue(p2));
  const span = most > 0 ? Math.min(rangeMax, most * CAB_AXIS_FIT) : rangeMax;
  const x = (val: number) => linMap(Math.max(0, Math.min(span, val)), 0, span, 6, VB_W - 6);
  out.hlines.push({ y: VB_H / 2, tone: 'faint' });
  out.spikes.push({ x: x(paramValue(p1)), y0: VB_H - 10, y1: 12, tone: 'main' });
  out.spikes.push({ x: x(paramValue(p2)), y0: VB_H - 10, y1: 12, tone: 'alt' });
  out.vlines.push({ x: x(paramValue(p1)), tone: 'main', label: '1' }, { x: x(paramValue(p2)), tone: 'alt', label: '2' });
  out.xTicks = niceTicks(0, span, 4)
    .filter((t) => t > 0 && t < span)
    .map((t) => ({ pos: x(t), label: String(Math.round(t * 1000) / 1000) }));
  out.notes.push('Delays in the unit the device shows; the axis is fitted to them.');
  const diff = Math.abs(paramValue(p1) - paramValue(p2));
  return {
    ...out,
    caption: `1: ${formatFull(p1)} · 2: ${formatFull(p2)} · Δ ${Math.round(diff * 1000) / 1000}`,
    aria: `${v.title}: cab 1 ${formatFull(p1)}, cab 2 ${formatFull(p2)}`
  };
}

// ── entry ──────────────────────────────────────────────────────────────────────────────────────────

// -- dynaCab -------------------------------------------------------------------------------------

/** The cab silhouette the DynaCab mic graphic sketches, in view-box units. */
export const DYNACAB = { left: 10, right: 88, top: 14, bottom: 90, micNear: 100, micFar: 176 } as const;

function roundRectPath(l: number, t: number, r: number, b: number, rad: number): string {
  return `M${l + rad},${t} H${r - rad} Q${r},${t} ${r},${t + rad} V${b - rad} Q${r},${b} ${r - rad},${b} H${l + rad} Q${l},${b} ${l},${b - rad} V${t + rad} Q${l},${t} ${l + rad},${t} Z`;
}
function circlePath(cx: number, cy: number, rad: number): string {
  return `M${(cx - rad).toFixed(1)},${cy.toFixed(1)} a${rad},${rad} 0 1,0 ${2 * rad},0 a${rad},${rad} 0 1,0 ${-2 * rad},0 Z`;
}

/** The DynaCab mic on the cab: the mic climbs from the speaker's centre (position 0) to its edge (1) and
 *  moves away from the grille as the distance grows. The silhouette is a sketch; the two values are the
 *  device's own. */
function dynaCabPlot(v: BlockVisual, r: RoleReader): GraphPlot {
  const out = blank();
  const pos = r.knob('position');
  const dist = r.knob('distance');
  const pos01 = frac(pos);
  const dist01 = frac(dist);
  if (pos01 == null && dist01 == null) return { ...out, empty: 'No DynaCab', caption: '', aria: `${v.title}: no mic position or distance` };
  const p = pos01 ?? 0.5;
  const d = dist01 ?? 0.3;
  const { left, right, top, bottom, micNear, micFar } = DYNACAB;
  const w = right - left;
  const h = bottom - top;
  const midY = (top + bottom) / 2;
  const micY = midY - (p - 0.5) * h * 0.72;
  const micX = micNear + d * (micFar - micNear);
  const cab = roundRectPath(left, top, right, bottom, 7);
  out.series.push({ d: cab, tone: 'faint', area: cab });
  const speaker = Math.min(17, w * 0.23);
  out.series.push({ d: circlePath(left + w * 0.5, top + h * 0.31, speaker), tone: 'ref' });
  out.series.push({ d: circlePath(left + w * 0.5, top + h * 0.71, speaker), tone: 'ref' });
  // the mic: a dashed line from the grille, a head at the position / distance, a short stand
  out.series.push({ d: `M${right + 3},${micY.toFixed(1)} H${(micX - 6).toFixed(1)}`, tone: 'faint', dash: true });
  out.series.push({ d: circlePath(micX, micY, 5.5), tone: 'main', area: circlePath(micX, micY, 5.5) });
  out.series.push({ d: `M${(micX + 5).toFixed(1)},${(micY + 3).toFixed(1)} l13,7`, tone: 'main' });
  out.hlines.push({ y: micY, tone: 'faint' });
  out.notes.push('The cab outline is a sketch; the mic sits where the block puts it (position 0 = cone centre, 1 = edge).');
  if (pos01 == null || dist01 == null) out.notes.push('One of the mic controls is not served: the other is drawn as it is.');
  const cabName = r.label('cabType');
  const micName = r.label('mic');
  const values = join([pos ? `position ${r.text('position')}` : null, dist ? `distance ${r.text('distance')}` : null]);
  return {
    ...out,
    caption: join([cabName, micName, values]),
    aria: `${v.title}: ${join([cabName, micName, values])}`
  };
}

/** The drawable plot of one served visual with the block's current values. */
export function graphPlot(v: BlockVisual, inp: GraphInputs): GraphPlot {
  const r = reader(v, inp);
  switch (v.kind) {
    case 'dynamics':
      return dynamicsPlot(v, r);
    case 'lfo':
      return lfoPlot(v, r, inp);
    case 'response':
      return responsePlot(v, r, inp);
    case 'decay':
      return decayPlot(v, r);
    case 'echo':
      return echoPlot(v, r, inp);
    case 'adsr':
      return adsrPlot(v, r);
    case 'cabAlign':
      return cabAlignPlot(v, r);
    case 'dynaCab':
      return dynaCabPlot(v, r);
    default:
      return { ...blank(), empty: 'Not drawn', caption: '', aria: `${(v as BlockVisual).title}: not drawn` };
  }
}

/** Playhead position at time `tSec` (seconds on the shared clock): x and y in view-box units. */
export function playheadAt(ph: GraphPlayhead, tSec: number): { x: number; y: number } | null {
  const n = ph.ys.length;
  if (n < 2 || !(ph.sweepSec > 0) || !Number.isFinite(tSec)) return null;
  const f = (((tSec % ph.sweepSec) + ph.sweepSec) % ph.sweepSec) / ph.sweepSec;
  const pos = f * (n - 1);
  const i = Math.min(n - 2, Math.floor(pos));
  const k = pos - i;
  return { x: f * VB_W, y: ph.ys[i]! * (1 - k) + ph.ys[i + 1]! * k };
}

/** The gain-reduction bar's floor (dB, < 0): the served gain-reduction monitor's own `minDb` where it has
 *  one, else `fallbackMinDb` (GR_FALLBACK_MIN_DB, illustrative). */
export function grScaleMinDb(mons: readonly LiveMonitor[], fallbackMinDb: number): number {
  const m = mons.find((x) => x.role === 'gainReduction');
  const served = m?.minDb;
  return typeof served === 'number' && Number.isFinite(served) && served < 0 ? served : fallbackMinDb;
}

/** Live gain reduction (dB, ≥ 0) from a block's monitors: the gain-reduction monitor's dB reading (0 dB =
 *  no reduction, so the reduction is its negative), else from its inverted normalised level. */
export function gainReductionDb(mons: readonly LiveMonitor[], minDb: number): number | null {
  const m = mons.find((x) => x.role === 'gainReduction');
  if (!m) return null;
  if (typeof m.db === 'number' && Number.isFinite(m.db)) return Math.max(0, Math.min(-minDb, -m.db));
  if (typeof m.norm === 'number' && Number.isFinite(m.norm)) return Math.max(0, Math.min(1, 1 - m.norm)) * -minDb;
  return null;
}

/** Peak hold of the gain-reduction bar: the held peak follows a higher reading at once and falls back at
 *  `fallDbPerSec` after `holdMs` (illustrative, ours). */
export const GR_PEAK_HOLD_MS = 1200;
export const GR_PEAK_FALL_DB_PER_SEC = 20;
export interface GrPeak {
  /** The peak reduction (dB) and when it was reached (ms). */
  db: number;
  at: number;
}
/** The held peak as shown at `now`: the peak for `GR_PEAK_HOLD_MS`, then falling. */
export function grPeakShown(p: GrPeak | null, now: number): number | null {
  if (!p) return null;
  const since = now - p.at;
  if (since <= GR_PEAK_HOLD_MS) return p.db;
  return Math.max(0, p.db - ((since - GR_PEAK_HOLD_MS) / 1000) * GR_PEAK_FALL_DB_PER_SEC);
}
/** Next peak state for a new reading (null reading = no meter: no peak). */
export function grPeak(prev: GrPeak | null, now: number, db: number | null): GrPeak | null {
  if (db == null) return null;
  const shown = grPeakShown(prev, now);
  return shown == null || db >= shown ? { db, at: now } : prev;
}
