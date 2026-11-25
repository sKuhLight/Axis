// Synthetic blocks that serve read-only graph displays (`visuals`, ForgeFX cap `blockVisuals`), for the
// graph-tile spec (45). Every id, label and range here is made up for the test: the shapes mirror what
// ForgeFX serves (named knobs with display min/max, enums with option labels, a device layout whose graph
// slots carry `graphKey`, and `visuals` whose roles are this response's param ids) — no device data.

export const COMP_EID = 110;
export const TREM_EID = 111;
export const FILTER_EID = 112;
export const GATE_EID = 113;
export const DELAY_EID = 114;
export const CTRL_EID = 115;
export const LOOPER_EID = 116;
/** An EQ block: its graphic gains on the page (dropped in favour of the eq tile) plus an Input EQ, an
 *  Output EQ and a PEQ as served EQ visuals (the eq tile's style variants). */
export const EQ_EID = 117;
/** A CAB block in DynaCab mode: the mic graphic (`dynaCab`) plus the position / distance controls. */
export const DYNACAB_EID = 118;
export const GRAPH_EIDS: ReadonlySet<number> = new Set([COMP_EID, TREM_EID, FILTER_EID, GATE_EID, DELAY_EID, CTRL_EID, LOOPER_EID, EQ_EID, DYNACAB_EID]);
/** The device tempo the mock serves (GET /tempo). */
export const GRAPH_BPM = 90;

/** Grid cells of the graph blocks. */
export const GRAPH_CELLS = [
  { row: 1, col: 0, effectId: COMP_EID, name: 'Comp 1', slug: 'Comp', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 1, col: 1, effectId: TREM_EID, name: 'Tremolo 1', slug: 'Tremolo', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 1, col: 2, effectId: FILTER_EID, name: 'Filter 1', slug: 'Filter', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 1, col: 3, effectId: GATE_EID, name: 'Gate 1', slug: 'Gate', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 1, col: 4, effectId: DELAY_EID, name: 'Delay 1', slug: 'Delay', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 1, col: 5, effectId: CTRL_EID, name: 'Controllers', slug: 'Controllers', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 2, col: 0, effectId: LOOPER_EID, name: 'Looper 1', slug: 'Looper', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 2, col: 1, effectId: EQ_EID, name: 'EQ 1', slug: 'Filter', isShunt: false, routeFlag: 0, fromRows: [] },
  { row: 2, col: 2, effectId: DYNACAB_EID, name: 'Cab 1', slug: 'Cab', isShunt: false, routeFlag: 0, fromRows: [] }
];

/** The compressor's live gain reduction while metering is on (6 dB). */
export const GRAPH_MONITORS = [{ effectId: COMP_EID, family: 'COMP', paramName: 'X_GAIN_REDUCTION', role: 'gainReduction', norm: 0.85, db: -6 }];

type Knob = { id: number; name: string; value: number; norm: number; min: number; max: number; unit?: string; log?: boolean };
/** A knob holding `value` on its min..max range (the board shows norm → value). */
const knob = (id: number, name: string, value: number, min: number, max: number, unit = '', log = false): Knob => ({
  id,
  name,
  value,
  norm: log ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min),
  min,
  max,
  unit,
  ...(log ? { log: true } : {})
});
const enm = (id: number, name: string, labels: string[], value: number) => ({ id, name, value, options: labels.map((label, i) => ({ value: i, label })) });
const c = (label: string, paramId: number | null, widget = 'knob') => ({ label, paramName: `X_${label.toUpperCase().replace(/\W+/g, '_')}`, paramId, widget, rawWidget: widget });
const slot = (graphKey: string) => ({ label: '', paramName: null, paramId: null, widget: 'graph', rawWidget: 'graph', graphKey });
const row = (...controls: object[]) => ({ section: 'parameters', controls });

const KNEE = ['HARD', 'MED-HARD', 'MEDIUM', 'MED-SOFT', 'SOFT'];
const OFF_ON = ['OFF', 'ON'];
const SHAPES = ['SINE', 'TRIANGLE', 'SQUARE', 'SAW UP', 'SAW DOWN', 'RANDOM', 'LOG', 'EXP', 'TRAPEZOID', 'ASTABLE'];
const TEMPO = ['NONE ', '1/8', '1/4', '1/2'];

/** The params response of one graph block, always with `visuals` and the slots' graph keys: whether Axis
 *  draws them is the `blockVisuals` capability's call alone (the cap tests keep them served). `sustainOnly`
 *  serves the compressor as a type without threshold / ratio. */
export function graphBlockParams(eid: number, o: { sustainOnly: boolean }): Record<string, unknown> {
  const out = (base: Record<string, unknown>, layout: unknown, visuals: unknown[]) => ({ ...base, ...(layout ? { layout } : {}), visuals });
  switch (eid) {
    case LOOPER_EID:
      return out(
        { block: 'Looper', slug: 'looper', page: 1, named: [knob(5, 'Level', 0, -20, 20, 'dB')], enums: [], type: null },
        {
          family: 'LOOPER', variantName: 'Looper', pages: [{
            name: 'Looper', rows: [row(c('Level', 5))],
            pageControls: [{ label: 'Loop', paramName: null, paramId: null, widget: 'graph', rawWidget: 'graph_looper' }]
          }]
        },
        []
      );
    case EQ_EID: {
      // a graphic EQ whose ten band gains are the page's faders (the eq tile takes their place), with an
      // Input EQ, an Output EQ and a PEQ served as the tile's style variants
      const gains = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      return out(
        {
          block: 'EQ',
          slug: 'filter',
          page: 1,
          named: [
            ...gains.map((hz, i) => knob(i, `${hz} Hz`, 0, -12, 12, 'dB')),
            knob(20, 'Low Cut', 20, 20, 2000, 'Hz', true),
            knob(21, 'Peak Freq', 1000, 20, 20000, 'Hz', true),
            knob(22, 'Peak Gain', 0, -20, 20, 'dB'),
            knob(23, 'Peak Q', 1.4, 0.1, 10),
            knob(24, 'High Cut', 20000, 200, 20000, 'Hz', true),
            ...[0, 1, 2, 3, 4].flatMap((i) => [
              knob(30 + i, `P${i + 1} Freq`, 100 * 2 ** i, 20, 20000, 'Hz', true),
              knob(35 + i, `P${i + 1} Q`, 1.4, 0.1, 10),
              knob(40 + i, `P${i + 1} Gain`, 0, -20, 20, 'dB')
            ])
          ],
          enums: [],
          type: null
        },
        {
          family: 'FILTER',
          variantName: 'EQ',
          pages: [{
            name: 'Graphic EQ',
            rows: [row(...gains.map((hz, i) => c(`${hz} Hz`, i, 'slider'))), row(c('Low Cut', 20), c('High Cut', 24))]
          }]
        },
        [
          { key: 'inputEq', kind: 'eq', title: 'Input EQ', mode: 'parametric', roles: {}, bands: [
            { key: 'low', freq: 20, shape: 'lowcut' },
            { key: 'mid', freq: 21, gain: 22, q: 23, shape: 'bell' },
            { key: 'high', freq: 24, shape: 'highcut' }
          ] },
          { key: 'outputEq', kind: 'eq', title: 'Output EQ', mode: 'graphic', roles: {}, bands: gains.map((hz, i) => ({ key: `o${i}`, centerHz: hz, gain: i })) },
          { key: 'peq', kind: 'eq', title: 'PEQ', mode: 'parametric', roles: {}, bands: [0, 1, 2, 3, 4].map((i) => ({ key: `p${i}`, freq: 30 + i, q: 35 + i, gain: 40 + i, shape: 'bell' })) }
        ]
      );
    }
    case COMP_EID: {
      if (o.sustainOnly)
        return out(
          { block: 'Comp', slug: 'comp', page: 1, named: [knob(13, 'Sustain', 6, 0, 10), knob(4, 'Level', 2, -20, 20, 'dB'), knob(11, 'Mix', 100, 0, 100, '%')], enums: [], type: { value: 13, name: 'Optical Sustainer' } },
          { family: 'COMP', variantName: 'Sustainer', pages: [{ name: 'Basic', rows: [row(c('Sustain', 13), slot('dynamics')), row(c('Level', 4), c('Mix', 11))] }] },
          [{ key: 'dynamics', kind: 'dynamics', title: 'Gain reduction', mode: 'compressor', roles: { sustain: 13, level: 4, mix: 11, gainReduction: 25 } }]
        );
      return out(
        {
          block: 'Comp',
          slug: 'comp',
          page: 1,
          named: [
            knob(0, 'Threshold', -18, -60, 20, 'dB'),
            knob(1, 'Ratio', 4, 1, 20),
            knob(2, 'Attack', 10, 0.1, 100, 'ms'),
            knob(3, 'Release', 100, 2, 2000, 'ms'),
            knob(4, 'Level', 2, -20, 20, 'dB'),
            knob(11, 'Mix', 100, 0, 100, '%')
          ],
          enums: [enm(5, 'Knee', KNEE, 2), enm(6, 'Auto', OFF_ON, 0)],
          type: { value: 0, name: 'Studio Comp' }
        },
        {
          family: 'COMP',
          variantName: 'Studio',
          pages: [
            {
              name: 'Basic',
              rows: [row(c('Threshold', 0), c('Ratio', 1), c('Attack', 2), c('Release', 3), slot('dynamics')), row(c('Knee', 5, 'dropdown'), c('Auto', 6, 'toggle'), c('Level', 4), c('Mix', 11))]
            }
          ]
        },
        [{ key: 'dynamics', kind: 'dynamics', title: 'Compressor curve', mode: 'compressor', roles: { threshold: 0, ratio: 1, knee: 5, level: 4, mix: 11, autoMakeup: 6, gainReduction: 25 } }]
      );
    }
    case TREM_EID:
      return out(
        {
          block: 'Tremolo',
          slug: 'tremolo',
          page: 1,
          named: [knob(2, 'Rate', 5, 0.2, 20, 'Hz'), knob(3, 'Depth', 50, 0, 100, '%'), knob(4, 'Duty', 50, 1, 99, '%')],
          enums: [enm(1, 'LFO Type', SHAPES, 0), enm(5, 'Tempo', TEMPO, 2)],
          type: { value: 0, name: 'Bias Tremolo' }
        },
        { family: 'TREMOLO', variantName: 'Tremolo', pages: [{ name: 'Tremolo', rows: [row(c('Rate', 2), c('Tempo', 5, 'dropdown'), c('LFO Type', 1, 'dropdown'), slot('lfo')), row(c('Depth', 3), c('Duty', 4))] }] },
        [{ key: 'lfo', kind: 'lfo', title: 'Tremolo LFO', mode: 'tremolo', roles: { rate: 2, tempo: 5, shape: 1, depth: 3, duty: 4 } }]
      );
    case FILTER_EID:
      return out(
        {
          block: 'Filter',
          slug: 'filter',
          page: 1,
          named: [
            knob(1, 'Frequency', 1000, 20, 20000, 'Hz', true),
            knob(2, 'Q', 2, 0.1, 10),
            knob(3, 'Gain', 6, -20, 20, 'dB'),
            knob(12, 'Low Cut', 20, 20, 2000, 'Hz', true),
            knob(13, 'High Cut', 20000, 200, 20000, 'Hz', true),
            knob(18, 'LFO Rate', 1, 0.1, 10, 'Hz')
          ],
          enums: [enm(7, 'Order', ['2nd', '4th'], 0), enm(17, 'LFO Type', SHAPES, 0)],
          type: { value: 6, name: 'Peaking' }
        },
        {
          family: 'FILTER',
          variantName: '0..11',
          pages: [
            { name: 'Filter', rows: [row(slot('response'), c('Frequency', 1), c('Q', 2), c('Gain', 3), c('Order', 7, 'dropdown'), c('Low Cut', 12), c('High Cut', 13))] },
            { name: 'Modulation', rows: [row(slot('lfo')), row(c('LFO Type', 17, 'dropdown'), c('LFO Rate', 18))] }
          ]
        },
        [
          { key: 'response', kind: 'response', title: 'Filter response', mode: 'filter', roles: { freq: 1, q: 2, gain: 3, order: 7, lowCut: 12, highCut: 13 } },
          { key: 'lfo', kind: 'lfo', title: 'Filter LFO', mode: 'mod', roles: { rate: 18, shape: 17 } }
        ]
      );
    case DYNACAB_EID:
      return out(
        {
          block: 'Cab',
          slug: 'cab',
          page: 1,
          named: [knob(93, 'Position', 0.35, 0, 1), knob(97, 'Distance', 0.4, 0, 1)],
          enums: [enm(85, 'Cab', ['4x12 UK', '2x12 USA'], 0), enm(89, 'Mic', ['Condenser 57', 'Ribbon 121'], 0)],
          type: null
        },
        {
          family: 'CABINET',
          variantName: 'DynaCab',
          pages: [{ name: 'DynaCab', rows: [row(c('Position', 93), c('Distance', 97), slot('dynaCab'))] }]
        },
        [{ key: 'dynaCab', kind: 'dynaCab', title: 'DynaCab mic', roles: { position: 93, distance: 97, cabType: 85, mic: 89 } }]
      );
    case GATE_EID:
      return out(
        {
          block: 'Gate',
          slug: 'gate',
          page: 1,
          named: [knob(0, 'Threshold', -40, -100, 0, 'dB'), knob(4, 'Ratio', 2, 1, 20), knob(1, 'Attack', 1, 0.1, 100, 'ms'), knob(3, 'Release', 50, 2, 2000, 'ms'), knob(9, 'Level', 0, -20, 20, 'dB')],
          enums: [],
          type: { value: 0, name: 'Classic' }
        },
        { family: 'GATE', variantName: '0', pages: [{ name: 'Gate', rows: [row(c('Threshold', 0), c('Ratio', 4), c('Attack', 1), c('Release', 3)), row(c('Level', 9))] }] },
        [{ key: 'dynamics', kind: 'dynamics', title: 'Gate curve', mode: 'gate', roles: { threshold: 0, ratio: 4, level: 9, gainReduction: 13 } }]
      );
    case DELAY_EID:
      // no device layout for the delay block: the visual still comes from the catalog
      return out(
        {
          block: 'Delay',
          slug: 'delay',
          page: 1,
          named: [knob(8, 'Time', 500, 1, 16000, 'ms'), knob(10, 'Feedback', 40, -100, 100, '%'), knob(28, 'Master Feedback', 100, 0, 200, '%'), knob(0, 'Mix', 30, 0, 100, '%')],
          enums: [enm(7, 'Type', ['MONO', 'STEREO', 'PING-PONG', 'DUAL'], 2), enm(15, 'Tempo', TEMPO, 0)],
          type: { value: 0, name: 'Digital Mono' }
        },
        null,
        [{ key: 'echo', kind: 'echo', title: 'Echo train', roles: { time: 8, tempo: 15, feedback: 10, masterFeedback: 28, routing: 7 } }]
      );
    case CTRL_EID:
      return out(
        {
          block: 'Controllers',
          slug: 'controllers',
          page: 1,
          named: [
            knob(1, 'LFO 1 Rate', 2, 0.05, 30, 'Hz'),
            knob(2, 'LFO 1 Depth', 100, 0, 100, '%'),
            knob(7, 'LFO 2 Rate', 0.5, 0.05, 30, 'Hz'),
            knob(14, 'Attack', 100, 1, 10000, 'ms'),
            knob(15, 'Decay', 200, 1, 10000, 'ms'),
            knob(16, 'Sustain', 300, 1, 10000, 'ms'),
            knob(18, 'Release', 400, 1, 10000, 'ms'),
            knob(17, 'Level', 60, 0, 100, '%')
          ],
          enums: [enm(0, 'LFO 1 Type', SHAPES, 1), enm(6, 'LFO 2 Type', SHAPES, 2), enm(70, 'LFO 1 Run', ['RUN', 'STOP'], 0), enm(128, 'ADSR 1 Type', ['EXPONENTIAL', 'LINEAR'], 0)],
          type: null
        },
        {
          family: 'CONTROLLERS',
          variantName: 'Controllers',
          pages: [
            { name: 'LFO 1 + 2', rows: [row(c('LFO 1 Type', 0, 'dropdown'), c('LFO 1 Run', 70, 'toggle'), slot('lfo1'), c('LFO 1 Rate', 1), c('LFO 1 Depth', 2)), row(c('LFO 2 Type', 6, 'dropdown'), slot('lfo2'), c('LFO 2 Rate', 7))] },
            { name: 'ADSR 1', rows: [row(c('Attack', 14), c('Decay', 15), c('Sustain', 16), c('Release', 18), slot('adsr1')), row(c('ADSR 1 Type', 128, 'dropdown'), c('Level', 17))] }
          ]
        },
        [
          { key: 'lfo1', kind: 'lfo', title: 'LFO 1', mode: 'mod', roles: { rate: 1, shape: 0, depth: 2, run: 70 } },
          { key: 'lfo2', kind: 'lfo', title: 'LFO 2', mode: 'mod', roles: { rate: 7, shape: 6 } },
          { key: 'adsr1', kind: 'adsr', title: 'ADSR 1', roles: { attack: 14, decay: 15, sustainTime: 16, release: 18, sustainLevel: 17, curve: 128 } }
        ]
      );
    default:
      return {};
  }
}
