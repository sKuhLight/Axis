import { describe, expect, it } from 'vitest';
import type { BlockVisual, EnumParam, NamedParam } from '../../types';
import {
  gainReductionDb,
  graphPlot,
  grPeak,
  grPeakShown,
  grScaleMinDb,
  GR_FALLBACK_MIN_DB,
  GR_PEAK_HOLD_MS,
  ORIGIN_TICK_GAP,
  playheadAt,
  VB_H,
  VB_W,
  type GraphInputs
} from './graphModel';

// a knob as the board holds it: its display value follows `norm` over min..max (format.ts paramValue)
const knob = (id: number, value: number, unit = '', min?: number, max?: number): NamedParam => ({
  id,
  name: `P${id}`,
  value,
  norm: min != null && max != null && max > min ? (value - min) / (max - min) : 0,
  unit,
  min,
  max
});
const enm = (id: number, labels: string[], value: number): EnumParam => ({ id, name: `E${id}`, value, options: labels.map((label, i) => ({ value: i, label })) });
function inputs(params: NamedParam[], enums: EnumParam[] = [], extra: Partial<GraphInputs> = {}): GraphInputs {
  const k = new Map(params.map((p) => [p.id!, p]));
  const e = new Map(enums.map((x) => [x.id, x]));
  return { knob: (id) => k.get(id), enm: (id) => e.get(id), bpm: 120, hasTempo: true, typeName: null, ...extra };
}
const vis = (kind: BlockVisual['kind'], roles: Record<string, number>, extra: Partial<BlockVisual> = {}): BlockVisual => ({ key: kind, kind, title: 'T', roles, ...extra });

describe('dynamics', () => {
  const comp = vis('dynamics', { threshold: 0, ratio: 1, knee: 5, level: 4, mix: 11, autoMakeup: 6, gainReduction: 25 }, { mode: 'compressor', title: 'Compressor curve' });
  const base = [knob(0, -18, 'dB', -60, 20), knob(1, 4, ':1', 1, 20), knob(4, 2, 'dB', -20, 20), knob(11, 100, '%', 0, 100)];
  it('draws the curve, a 1:1 reference, the threshold, and names the values', () => {
    const p = graphPlot(comp, inputs(base, [enm(5, ['HARD', 'MED-HARD', 'MEDIUM', 'MED-SOFT', 'SOFT'], 2), enm(6, ['OFF', 'ON'], 0)]));
    expect(p.empty).toBeUndefined();
    expect(p.series).toHaveLength(2);
    expect(p.series[0]!.dash).toBe(true);
    expect(p.series[1]!.d.startsWith('M')).toBe(true);
    expect(p.vlines).toHaveLength(1);
    expect(p.gr).toEqual({ minDb: -40 });
    expect(p.aria).toMatch(/^Compressor curve: threshold −?-?18/);
    expect(p.aria).toContain('ratio 4');
    expect(p.aria).toContain('knee medium');
    expect(p.badge).toBeUndefined();
  });
  it('Auto makeup on → badge; no knee control → model-knee note', () => {
    const v = { ...comp, roles: { threshold: 0, ratio: 1, autoMakeup: 6 } };
    const p = graphPlot(v, inputs(base, [enm(6, ['OFF', 'ON'], 1)]));
    expect(p.badge).toBe('Auto makeup not drawn');
    expect(p.notes.join(' ')).toContain('Model knee, drawn medium');
    expect(p.aria).toContain('knee medium (model)');
  });
  it('a type without threshold + ratio draws no invented curve (threshold2 marker, gain reduction)', () => {
    const v = vis('dynamics', { threshold2: 27, sustain: 13, gainReduction: 25 }, { mode: 'compressor', title: 'Gain reduction' });
    const p = graphPlot(v, inputs([knob(27, -20, '', -60, 20)]));
    expect(p.empty).toBe('No static curve for this type');
    expect(p.vlines).toHaveLength(1);
    expect(p.series.some((s) => s.tone === 'main')).toBe(false);
    expect(p.gr).toBeTruthy();
  });
  it('a gate without ratio is drawn (hard gate to its range) and says so', () => {
    const v = vis('dynamics', { threshold: 0, range: 15 }, { mode: 'gate', title: 'Gate curve' });
    const p = graphPlot(v, inputs([knob(0, -40, 'dB', -100, 0), knob(15, -30, '', -80, 0)]));
    expect(p.empty).toBeUndefined();
    expect(p.notes.join(' ')).toContain('hard gate');
    expect(p.gr).toBeUndefined();
    // no knee control on a gate: drawn (and named) hard
    expect(p.aria).toContain('knee hard (model)');
  });
  it('the x tick nearest the origin is left to the y axis (no two labels meet in the corner)', () => {
    // threshold range −60..20 → window −72..26: the −60 tick sits 12 % in, so only the y axis labels it
    const p = graphPlot(comp, inputs(base));
    expect(p.yTicks.map((t) => t.label)).toContain('−60');
    expect(p.xTicks.map((t) => t.label)).not.toContain('−60');
    expect(p.xTicks.length).toBeGreaterThan(0);
    for (const t of p.xTicks) expect(t.pos / VB_W).toBeGreaterThanOrEqual(ORIGIN_TICK_GAP);
  });
  it('the curve follows the threshold (a value change changes the path and the label)', () => {
    const a = graphPlot(comp, inputs(base));
    const b = graphPlot(comp, inputs([knob(0, -30, 'dB', -60, 20), ...base.slice(1)]));
    expect(a.series[1]!.d).not.toBe(b.series[1]!.d);
    expect(a.aria).not.toBe(b.aria);
  });
});

describe('lfo', () => {
  const trem = vis('lfo', { rate: 2, tempo: 5, shape: 1, depth: 3 }, { mode: 'tremolo', title: 'Tremolo LFO' });
  const tempo = (label: string) => enm(5, ['NONE ', '1/8', '1/4', '1/2'], ['NONE ', '1/8', '1/4', '1/2'].indexOf(label));
  it('tempo 1/4 at 90 bpm → 1.5 Hz, synced in the caption, playhead over two cycles', () => {
    const p = graphPlot(trem, inputs([knob(2, 5, 'Hz', 0.2, 20), knob(3, 50, '%', 0, 100)], [tempo('1/4'), enm(1, ['SINE', 'TRIANGLE'], 1)], { bpm: 90 }));
    expect(p.caption).toMatch(/^1\.5 Hz/);
    expect(p.caption).toContain('1/4');
    expect(p.playhead?.sweepSec).toBeCloseTo(2 / 1.5, 6);
    expect(p.aria).toContain('triangle');
    expect(p.notes.join(' ')).toContain('not the device’s real LFO phase');
  });
  it('without a device tempo a synced LFO is drawn at its Rate value and says so', () => {
    const p = graphPlot(trem, inputs([knob(2, 5, 'Hz')], [tempo('1/4')], { hasTempo: false }));
    expect(p.caption).toMatch(/^5\.0 Hz/);
    expect(p.notes.join(' ')).toContain('Tempo unknown');
  });
  it('tremolo gain stays in 0..1 of the plot; depth 0 is flat at the top', () => {
    const p = graphPlot(trem, inputs([knob(2, 2, 'Hz'), knob(3, 0, '%', 0, 100)], [tempo('NONE ')]));
    for (const y of p.playhead!.ys) expect(y).toBeCloseTo(4, 6);
  });
  it('a stopped LFO is flat and has no playhead', () => {
    const v = vis('lfo', { rate: 1, run: 70 }, { mode: 'mod', title: 'LFO 1' });
    const p = graphPlot(v, inputs([knob(1, 3, 'Hz')], [enm(70, ['RUN', 'STOP'], 1)]));
    expect(p.playhead).toBeUndefined();
    expect(p.aria).toContain('stopped');
  });
  it('no shape role → drawn as a sine with a note', () => {
    const v = vis('lfo', { rate: 1 }, { mode: 'mod', title: 'Filter LFO' });
    expect(graphPlot(v, inputs([knob(1, 1, 'Hz')])).notes.join(' ')).toContain('drawn as a sine');
  });
  it('playheadAt walks the trace and wraps', () => {
    const ph = { sweepSec: 2, ys: [10, 20, 30] };
    expect(playheadAt(ph, 0)).toEqual({ x: 0, y: 10 });
    expect(playheadAt(ph, 1)).toEqual({ x: VB_W / 2, y: 20 });
    expect(playheadAt(ph, 3)!.x).toBeCloseTo(VB_W / 2, 6);
    expect(playheadAt({ sweepSec: 0, ys: [1, 2] }, 1)).toBeNull();
  });
});

describe('response', () => {
  const filt = vis('response', { freq: 1, q: 2, gain: 3, order: 7 }, { mode: 'filter', title: 'Filter response' });
  it('low-pass from the block type label', () => {
    const p = graphPlot(filt, inputs([knob(1, 1000, 'Hz', 20, 20000), knob(2, 0.707, '', 0.1, 10), knob(3, 0, 'dB')], [enm(7, ['2nd', '4th'], 0)], { typeName: 'Low-Pass' }));
    expect(p.empty).toBeUndefined();
    expect(p.caption).toContain('low-pass');
    expect(p.aria).toContain('2nd order');
  });
  it('the 4th-order note only for the types drawn squared (low/high/band-pass, notch)', () => {
    const fourth = (typeName: string) =>
      graphPlot(filt, inputs([knob(1, 1000, 'Hz', 20, 20000), knob(2, 0.707, '', 0.1, 10), knob(3, 6, 'dB', -12, 12)], [enm(7, ['2nd', '4th'], 1)], { typeName })).notes.join(' ');
    expect(fourth('Low-Pass')).toContain('4th order = the section squared');
    expect(fourth('Notch')).toContain('4th order = the section squared');
    expect(fourth('Peaking')).not.toContain('section squared');
  });
  it('an unsupported type (comb) is not drawn and says so', () => {
    const p = graphPlot(filt, inputs([knob(1, 1000, 'Hz')], [], { typeName: 'Comb 1' }));
    expect(p.empty).toBe('Response not drawn for this type');
  });
  it('wah: now / min / max curves', () => {
    const v = vis('response', { freqStart: 1, freqStop: 2, q: 3, control: 5 }, { mode: 'wah', title: 'Wah response' });
    const p = graphPlot(v, inputs([knob(1, 400), knob(2, 2000), knob(3, 4, '', 0, 10), knob(5, 5, '', 0, 10)]));
    expect(p.series).toHaveLength(3);
    expect(p.caption).toContain('400–2k');
  });
});

describe('decay, echo, adsr, cab', () => {
  it('decay: RT60 caption and pre-delay marker', () => {
    const p = graphPlot(vis('decay', { time: 1, predelay: 9 }, { title: 'Reverb decay' }), inputs([knob(1, 2.4, 's'), knob(9, 40, 'ms')]));
    expect(p.caption).toBe('RT60 2.4 s, pre 40 ms');
    expect(p.vlines).toHaveLength(1);
  });
  it('echo: mono train decaying to −60 dB; ping-pong on two rows; other routings simplified', () => {
    const v = vis('echo', { time: 8, feedback: 10, routing: 7 }, { title: 'Echo train' });
    const types = ['MONO', 'STEREO', 'PING-PONG', 'DUAL', 'REVERSE'];
    const mono = graphPlot(v, inputs([knob(8, 500, 'ms'), knob(10, 50, '')], [enm(7, types, 0)]));
    expect(mono.spikes.length).toBeGreaterThan(5);
    expect(mono.yTicks).toEqual([]);
    const pp = graphPlot(v, inputs([knob(8, 500, 'ms'), knob(10, 50, '')], [enm(7, types, 2)]));
    expect(pp.yTicks.map((t) => t.label)).toEqual(['L', 'R']);
    const rev = graphPlot(v, inputs([knob(8, 500, 'ms'), knob(10, 50, '')], [enm(7, types, 4)]));
    expect(rev.badge).toBe('Simplified');
  });
  it('echo: the caption counts what is drawn, down to the stated −60 dB floor', () => {
    const v = vis('echo', { time: 8, feedback: 10, routing: 7 }, { title: 'Echo train' });
    const types = ['MONO', 'STEREO', 'PING-PONG', 'DUAL'];
    // 40 %: 1, 0.4, 0.16 … 0.4^7 (−55.7 dB) are drawn; 0.4^8 (−63.7 dB) is past the floor → 8 repeats
    const mono = graphPlot(v, inputs([knob(8, 500, 'ms'), knob(10, 40, '')], [enm(7, types, 0)]));
    expect(mono.spikes).toHaveLength(8);
    expect(mono.caption).toBe('500 ms, 8 repeats to −60 dB');
    expect(mono.aria).toContain('8 repeats to −60 dB');
    // ping-pong: one line bouncing — every drawn tap counts
    const pp = graphPlot(v, inputs([knob(8, 500, 'ms'), knob(10, 40, '')], [enm(7, types, 2)]));
    expect(pp.caption).toBe(`500 ms, ${pp.spikes.length} repeats to −60 dB`);
    // stereo: two identical lines — the left line's repeats
    const st = graphPlot(v, inputs([knob(8, 500, 'ms'), knob(10, 40, '')], [enm(7, types, 1)]));
    expect(st.caption).toBe(`500 ms, ${st.spikes.length / 2} repeats to −60 dB`);
  });
  it('echo: feedback at or above 100 % never reaches −60 dB, so the caption does not claim it', () => {
    const v = vis('echo', { time: 8, feedback: 10, routing: 7 }, { title: 'Echo train' });
    const p = graphPlot(v, inputs([knob(8, 500, 'ms'), knob(10, 100, '')], [enm(7, ['MONO'], 0)]));
    expect(p.caption).toMatch(/^500 ms, \d+\+ repeats$/);
    expect(p.caption).not.toContain('−60 dB');
    expect(p.aria).not.toContain('to −60 dB');
  });
  it('echo: a tempo division without a device tempo is drawn at the Time value and says so', () => {
    const v = vis('echo', { time: 8, tempo: 15 }, { title: 'Echo train' });
    const p = graphPlot(v, inputs([knob(8, 300, 'ms')], [enm(15, ['NONE ', '1/4'], 1)], { hasTempo: false }));
    expect(p.caption).toMatch(/^300 ms/);
    expect(p.notes.join(' ')).toContain('Tempo unknown');
    const none = graphPlot(v, inputs([knob(8, 300, 'ms')], [enm(15, ['NONE ', '1/4'], 0)], { hasTempo: false }));
    expect(none.notes.join(' ')).not.toContain('Tempo unknown');
  });
  it('echo: tempo-synced time when a division is set and the tempo is known', () => {
    const v = vis('echo', { time: 8, tempo: 15 }, { title: 'Echo train' });
    const p = graphPlot(v, inputs([knob(8, 500, 'ms')], [enm(15, ['NONE ', '1/4'], 1)], { bpm: 120 }));
    expect(p.caption).toMatch(/^1\/4 = 500 ms/);
  });
  it('adsr: an envelope with a sustain line', () => {
    const v = vis('adsr', { attack: 14, decay: 15, sustainTime: 16, release: 18, sustainLevel: 17, curve: 128 }, { title: 'ADSR 1' });
    const p = graphPlot(v, inputs([knob(14, 100), knob(15, 200), knob(16, 300), knob(18, 400), knob(17, 50, '%', 0, 100)], [enm(128, ['EXPONENTIAL', 'LINEAR'], 1)]));
    expect(p.series).toHaveLength(1);
    expect(p.hlines[0]!.y).toBeGreaterThan(0);
    expect(p.hlines[0]!.y).toBeLessThan(VB_H);
    expect(p.caption).toContain('linear');
  });
  it('cab alignment: two markers and the difference', () => {
    const p = graphPlot(vis('cabAlign', { delay1: 16, delay2: 17 }, { title: 'Cab alignment' }), inputs([knob(16, 0.1, '', 0, 1), knob(17, 0.3, '', 0, 1)]));
    expect(p.spikes).toHaveLength(2);
    expect(p.caption).toContain('Δ 0.2');
  });
  it('missing required values give an empty plot, never a throw', () => {
    for (const kind of ['dynamics', 'lfo', 'response', 'decay', 'echo', 'adsr', 'cabAlign'] as const) {
      const p = graphPlot(vis(kind, {}), inputs([]));
      expect(typeof p.aria).toBe('string');
    }
  });
});

describe('gain reduction', () => {
  it('reads the gain-reduction monitor (dB, inverted level)', () => {
    const m = (db: number | null, norm: number) => ({ effectId: 1, family: 'COMP', paramName: 'X', role: 'gainReduction', db, norm });
    expect(gainReductionDb([m(-6, 0.85)], -40)).toBe(6);
    expect(gainReductionDb([m(null, 0.75)], -40)).toBe(10);
    expect(gainReductionDb([{ ...m(-6, 1), role: 'level' }], -40)).toBeNull();
  });
  it('peak hold: holds, then falls, and follows a higher reading at once', () => {
    let p = grPeak(null, 0, 10);
    p = grPeak(p, 100, 4);
    expect(grPeakShown(p, 100)).toBe(10);
    expect(grPeakShown(p, GR_PEAK_HOLD_MS + 500)!).toBeLessThan(10);
    p = grPeak(p, 200, 12);
    expect(grPeakShown(p, 200)).toBe(12);
    expect(grPeak(p, 300, null)).toBeNull();
  });
  it('the bar scale is the served monitor range, else the labelled fallback', () => {
    const m = (minDb?: number) => ({ effectId: 1, family: 'COMP', paramName: 'X', role: 'gainReduction', db: -6, norm: 0.85, ...(minDb !== undefined ? { minDb } : {}) });
    expect(grScaleMinDb([m(-30)], GR_FALLBACK_MIN_DB.compressor)).toBe(-30);
    expect(grScaleMinDb([m()], GR_FALLBACK_MIN_DB.compressor)).toBe(-40);
    expect(grScaleMinDb([m(0)], GR_FALLBACK_MIN_DB.gate)).toBe(-60);
    expect(grScaleMinDb([], GR_FALLBACK_MIN_DB.gate)).toBe(-60);
  });
});
