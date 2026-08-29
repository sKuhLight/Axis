import { describe, it, expect } from 'vitest';
import { deriveEqGraphs } from './eqGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, LayoutWidget, NamedParam, LayoutPage } from './types';

// ── fixture builders ──
// Layout controls carry the ForgeFX symbol + this variant's device-true paramId, exactly as served.
const c = (widget: LayoutWidget, paramName: string | null, paramId: number | null, label = ''): LayoutControl => ({
  label: label || paramName || '',
  paramName,
  paramId,
  widget
});
const graph = (rawWidget: string): LayoutControl => ({ label: 'Graph', paramName: null, paramId: null, widget: 'graph', rawWidget });
const page = (name: string, controls: LayoutControl[]): LayoutPage => ({ name, rows: [{ controls }] });
const layout = (family: string, pages: LayoutPage[]): DeviceLayout => ({ family, pages });

const p = (id: number, name: string, min = 0, max = 1): NamedParam => ({ id, name, value: 0, norm: 0.5, min, max });
const e = (id: number, name: string, labels: string[], value: number): EnumParam => ({
  id,
  name,
  value,
  options: labels.map((label, i) => ({ value: i, label }))
});

const derive = (
  lay: DeviceLayout | null,
  params: NamedParam[],
  enums: EnumParam[] = [],
  pack: string | null = null,
  blockTypeName: string | null = null
) => deriveEqGraphs({ layout: lay, params, enums, pack, blockTypeName });

const shapes = (bands: { shape?: string }[]) => bands.map((b) => b.shape);
const keys = (bands: { key: string }[]) => bands.map((b) => b.key);

// ── the amp: two different response graphs on two pages ──
const ampLayout = layout('DISTORT', [
  page('Input EQ', [
    c('dropdown', 'DISTORT_INEQTYPE', 104, 'Type'),
    c('knob', 'DISTORT_INEQFREQ', 74, 'Frequency'),
    c('knob', 'DISTORT_INEQQ', 73, 'Q'),
    c('knob', 'DISTORT_INEQGAIN', 75, 'Gain'),
    graph('graph4'),
    c('knob', 'DISTORT_HPFREQ', 12, 'Low Cut'),
    c('knob', 'DISTORT_HICUT', 85, 'High Cut'),
    c('knob', 'DISTORT_LEVEL', 1, 'Level')
  ]),
  page('Speaker', [
    c('knob', 'DISTORT_SPKRLFREQ', 29, 'LF Res Freq'),
    c('knob', 'DISTORT_SPKRLFQ', 43, 'LF Res Q'),
    c('knob', 'DISTORT_SPKRLFGAIN', 30, 'LF Resonance'),
    c('knob', 'DISTORT_XFHPF', 18, 'XFormer Low Freq'),
    graph('graph4'),
    c('knob', 'DISTORT_SPKRHFREQ', 45, 'HF Res Freq'),
    c('knob', 'DISTORT_SPKRHFGAIN', 46, 'HF Resonance'),
    c('knob', 'DISTORT_SPKRHFQ', 102, 'HF Slope'),
    c('knob', 'DISTORT_XFLPF', 19, 'XFormer Hi Freq')
  ])
]);
const ampParams = [74, 73, 12, 85, 1, 29, 43, 18, 45, 102, 19].map((id) => p(id, `p${id}`));
const ampGains = [p(75, 'Gain', -12, 12), p(30, 'LF Resonance', -12, 12), p(46, 'HF Resonance', -12, 12)];

describe('deriveEqGraphs — amp', () => {
  const graphs = derive(ampLayout, [...ampParams, ...ampGains], [e(104, 'Type', ['LOWSHELF', 'PEAKING', 'HIGHSHELF', 'TILT EQ'], 1)]);

  it('yields one graph per page, keeping the historical `eq` key for the first', () => {
    expect(graphs.map((g) => [g.key, g.title, g.pages])).toEqual([
      ['eq', 'Input EQ', [0]],
      ['eq2', 'Speaker', [1]]
    ]);
  });

  it('binds the Input EQ band + both cuts, and nothing else on the page', () => {
    expect(keys(graphs[0].bands)).toEqual(['DISTORT_INEQFREQ', 'DISTORT_HPFREQ', 'DISTORT_HICUT']);
    expect(shapes(graphs[0].bands)).toEqual(['bell', 'lowcut', 'highcut']);
    expect(graphs[0].bands[0].freq?.id).toBe(74);
    expect(graphs[0].bands[0].q?.id).toBe(73);
    expect(graphs[0].bands[0].gain?.id).toBe(75);
  });

  it('gives the Speaker page its own, different bands', () => {
    expect(keys(graphs[1].bands)).toEqual([
      'DISTORT_SPKRLFREQ',
      'DISTORT_SPKRHFREQ',
      'DISTORT_XFHPF',
      'DISTORT_XFLPF'
    ]);
    expect(shapes(graphs[1].bands)).toEqual(['bell', 'bell', 'lowcut', 'highcut']);
  });

  it('leaves a cut band without a gain param (its knob has no gain to drag)', () => {
    const cut = graphs[0].bands.find((b) => b.key === 'DISTORT_HPFREQ')!;
    expect(cut.gain).toBeUndefined();
    expect(cut.freq?.id).toBe(12);
  });

  it('takes the gain swing from the bands own device-true range', () => {
    expect(graphs[0].gainRange).toBe(12);
  });

  it('follows the type enum: LOWSHELF selects a low shelf', () => {
    const shelf = derive(ampLayout, [...ampParams, ...ampGains], [e(104, 'Type', ['LOWSHELF', 'PEAKING', 'HIGHSHELF', 'TILT EQ'], 0)]);
    expect(shelf[0].bands[0].shape).toBe('lowshelf');
  });
});

// ── the filter block: one curve repeated across three pages ──
const filterPage = (name: string) =>
  page(name, [
    graph('graph_filter'),
    c('dropdown', 'FILTER_TYPE', 0, 'Type'),
    c('knob', 'FILTER_FREQ', 1, 'Frequency'),
    c('knob', 'FILTER_Q', 2, 'Q'),
    c('knob', 'FILTER_GAIN', 3, 'Gain'),
    c('knob', 'FILTER_LOWCUT', 12, 'Low Cut'),
    c('knob', 'FILTER_HICUT', 13, 'High Cut')
  ]);
const filterParams = [p(1, 'Frequency'), p(2, 'Q'), p(3, 'Gain', -20, 20), p(12, 'Low Cut'), p(13, 'High Cut')];
const FILTER_TYPES = ['Null', 'Low-Pass', 'Band-Pass', 'High-Pass', 'Low-Shelf', 'High-Shelf', 'Peaking'];

describe('deriveEqGraphs — filter', () => {
  it('collapses the repeated curve into one graph listing all three pages', () => {
    const graphs = derive(
      layout('FILTER', [filterPage('Filter'), filterPage('LFO'), filterPage('Modulation')]),
      filterParams,
      [e(0, 'Type', FILTER_TYPES, 6)]
    );
    expect(graphs).toHaveLength(1);
    expect(graphs[0].pages).toEqual([0, 1, 2]);
  });

  it.each([
    ['Low-Pass', 'highcut'],
    ['High-Pass', 'lowcut'],
    ['Low-Shelf', 'lowshelf'],
    ['High-Shelf', 'highshelf'],
    ['Peaking', 'bell']
  ])('maps the device type %s to a %s curve', (label, shape) => {
    const graphs = derive(layout('FILTER', [filterPage('Filter')]), filterParams, [
      e(0, 'Type', FILTER_TYPES, FILTER_TYPES.indexOf(label))
    ]);
    expect(graphs[0].bands[0].shape).toBe(shape);
  });
});

// ── reverb EQ: two peaking bands between the cuts ──
describe('deriveEqGraphs — reverb EQ', () => {
  const lay = layout('REVERB', [
    page('EQ', [
      c('knob', 'REVERB_LOWCUT', 10, 'Low Cut'),
      c('knob', 'REVERB_FREQ1', 26, 'Freq 1'),
      c('knob', 'REVERB_Q1', 28, 'Q 1'),
      c('knob', 'REVERB_GAIN1', 30, 'Gain 1'),
      c('knob', 'REVERB_FREQ2', 27, 'Freq 2'),
      c('knob', 'REVERB_Q2', 29, 'Q 2'),
      c('knob', 'REVERB_GAIN2', 31, 'Gain 2'),
      c('knob', 'REVERB_HICUT', 2, 'High Cut'),
      graph('graph_reverb')
    ])
  ]);

  it('binds both bells and both cuts', () => {
    const graphs = derive(lay, [10, 26, 28, 27, 29, 2].map((id) => p(id, `p${id}`)).concat([p(30, 'Gain 1', -20, 20), p(31, 'Gain 2', -20, 20)]));
    expect(shapes(graphs[0].bands)).toEqual(['bell', 'bell', 'lowcut', 'highcut']);
    expect(graphs[0].gainRange).toBe(20);
  });

  it('skips a band whose params are not live for this variant', () => {
    // Freq 2 present, Gain 2 missing → band 2 is dropped rather than half-drawn.
    const graphs = derive(lay, [10, 26, 28, 27, 29, 2].map((id) => p(id, `p${id}`)).concat([p(30, 'Gain 1', -20, 20)]));
    expect(keys(graphs[0].bands)).toEqual(['REVERB_FREQ1', 'REVERB_LOWCUT', 'REVERB_HICUT']);
  });
});

// ── PEQ: five typed bands, low side vs high side ──
describe('deriveEqGraphs — PEQ', () => {
  const lay = layout('PEQ', [
    page(
      'PEQ',
      [1, 2, 3, 4, 5]
        .flatMap((i) => [
          c('knob', `PEQ_FREQ${i}`, i - 1, `Frequency ${i}`),
          c('dropdown', `PEQ_TYPE${i}`, 14 + i, `Type ${i}`),
          c('knob', `PEQ_GAIN${i}`, 9 + i, `Gain ${i}`),
          c('knob', `PEQ_Q${i}`, 4 + i, `Q${i}`)
        ])
        .concat(graph('graph_peq'))
    )
  ]);
  const params = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => p(id, `p${id}`)).concat([10, 11, 12, 13, 14].map((id) => p(id, `Gain`, -20, 20)));
  const shelving = [15, 16, 17, 18, 19].map((id) => e(id, 'Type', ['Shelving', 'Peaking', 'Blocking'], 0));

  it('binds five bands off the layout, with no hardcoded param ids', () => {
    const graphs = derive(lay, params, shelving, 'Peq');
    expect(graphs).toHaveLength(1);
    expect(keys(graphs[0].bands)).toEqual(['PEQ_FREQ1', 'PEQ_FREQ2', 'PEQ_FREQ3', 'PEQ_FREQ4', 'PEQ_FREQ5']);
    expect(graphs[0].bands[0].freq?.id).toBe(0);
    expect(graphs[0].bands[0].gain?.id).toBe(10);
    expect(graphs[0].bands[0].q?.id).toBe(5);
  });

  it('reads the side-agnostic PEQ types off the band position: 1-2 low, 3-5 high', () => {
    expect(shapes(derive(lay, params, shelving, 'Peq')[0].bands)).toEqual([
      'lowshelf',
      'lowshelf',
      'highshelf',
      'highshelf',
      'highshelf'
    ]);
    const blocking = [15, 16, 17, 18, 19].map((id) => e(id, 'Type', ['Shelving', 'Peaking', 'Blocking'], 2));
    expect(shapes(derive(lay, params, blocking, 'Peq')[0].bands)).toEqual([
      'lowcut',
      'lowcut',
      'highcut',
      'highcut',
      'highcut'
    ]);
  });
});

// ── graphic EQ: no graph slot on the device, so Axis adds one over the fader bank's bands ──
describe('deriveEqGraphs — graphic EQ fallback', () => {
  const lay = layout('GEQ', [
    { name: 'GEQ', rows: [{ controls: [63, 125, 250, 500].map((hz, i) => c('slider', `GEQ_BAND${i}`, i, String(hz))) }] }
  ]);
  const params = [0, 1, 2, 3].map((id) => p(id, `band${id}`, -12, 12));

  it('draws the layout band row for a GEQ block', () => {
    const graphs = derive(lay, params, [], 'Geq', '10 Band');
    expect(graphs).toHaveLength(1);
    expect(graphs[0].title).toBe('10 Band');
    expect(graphs[0].gainRange).toBe(12);
    expect(graphs[0].bands.map((b) => b.centerHz)).toEqual([63, 125, 250, 500]);
  });

  it('does not add one for a non-GEQ block that happens to have a band row', () => {
    expect(derive(lay, params, [], 'Amp')).toEqual([]);
  });
});

describe('deriveEqGraphs — blocks with no response graph', () => {
  it('returns nothing without a layout', () => {
    expect(derive(null, ampParams)).toEqual([]);
  });

  it('returns nothing when the page has no graph slot', () => {
    const lay = layout('DISTORT', [page('Input EQ', [c('knob', 'DISTORT_INEQFREQ', 74, 'Frequency'), c('knob', 'DISTORT_INEQGAIN', 75, 'Gain')])]);
    expect(derive(lay, [p(74, 'Frequency'), p(75, 'Gain', -12, 12)])).toEqual([]);
  });

  it('ignores graph kinds that plot something other than frequency response', () => {
    const lay = layout('DISTORT', [page('LFO', [graph('graph_lfo'), c('knob', 'DISTORT_INEQFREQ', 74, 'Frequency'), c('knob', 'DISTORT_INEQGAIN', 75, 'Gain')])]);
    expect(derive(lay, [p(74, 'Frequency'), p(75, 'Gain', -12, 12)])).toEqual([]);
  });
});
