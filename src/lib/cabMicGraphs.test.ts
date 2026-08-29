import { describe, it, expect } from 'vitest';
import { deriveCabMicGraphs } from './cabMicGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, LayoutPage, NamedParam } from './types';

// ── fixture builders (same shape as eqGraphs.test.ts) ──
const c = (paramName: string | null, paramId: number | null, label = ''): LayoutControl => ({
  label: label || paramName || '',
  paramName,
  paramId,
  widget: 'knob'
});
const page = (name: string, controls: LayoutControl[]): LayoutPage => ({ name, rows: [{ controls }] });
const layout = (family: string, pages: LayoutPage[]): DeviceLayout => ({ family, pages });
const p = (id: number, name: string, min = 0, max = 1): NamedParam => ({ id, name, value: 0, norm: 0.5, min, max });
const e = (id: number, name: string, labels: string[], value: number): EnumParam => ({
  id,
  name,
  value,
  options: labels.map((label, i) => ({ value: i, label }))
});

// A two-slot Cab page — CAB 1 and CAB 2 columns, as the FM3-Edit reference shows. The DynaCab-only params
// (position "DynaCab {n}", distance "Distance {n}", mic "DYNACAB MIC{n}") are NOT in the layout — the real
// device never authors them into the knob grid, it only serves them as live params/enums (see banner).
const cabPage = page('Cab', [
  c('CABINET_LEVEL1', 8, 'Level'),
  c('CABINET_PAN1', 12, 'Pan'),
  c('CABINET_LOCUT1', 62, 'Low Cut'),
  c('CABINET_HICUT1', 66, 'High Cut'),
  c('CABINET_LEVEL2', 9, 'Level'),
  c('CABINET_PAN2', 13, 'Pan'),
  c('CABINET_LOCUT2', 63, 'Low Cut'),
  c('CABINET_HICUT2', 67, 'High Cut')
]);
const alignPage = page('Align', [c('CABINET_DELAY1', 16, 'Distance'), c('CABINET_DELAY2', 17, 'Distance')]);

// Live params: the legacy delay and the DynaCab distance share the display label "Distance n" — the legacy
// one is 0..1 (norm), the DynaCab one is cm (max 24). The mic POSITION is served as "DynaCab {n}" (0..10),
// distinct from "Proximity {n}" which stays a separate legacy-effect knob. Mic enums: "DYNACAB MIC{n}".
const cabParams: NamedParam[] = [
  p(8, 'Level 1'), p(12, 'Pan 1', -100, 100), p(93, 'DynaCab 1', 0, 10), p(16, 'Distance 1', 0, 1), p(97, 'Distance 1', 0, 24),
  p(62, 'Low Cut 1', 20, 20000), p(66, 'High Cut 1', 20, 20000),
  p(9, 'Level 2'), p(13, 'Pan 2', -100, 100), p(94, 'DynaCab 2', 0, 10), p(17, 'Distance 2', 0, 1), p(98, 'Distance 2', 0, 24),
  p(63, 'Low Cut 2', 20, 20000), p(67, 'High Cut 2', 20, 20000)
];
const cabEnums: EnumParam[] = [
  e(89, 'DYNACAB MIC1', ['Dynamic 1', 'Condenser'], 1),
  e(90, 'DYNACAB MIC2', ['Dynamic 1', 'Condenser'], 0)
];

describe('deriveCabMicGraphs', () => {
  it('resolves one spec per live mic slot when in DynaCab mode', () => {
    const graphs = deriveCabMicGraphs({ layout: layout('CABINET', [cabPage, alignPage]), params: cabParams, enums: cabEnums, dyna: true });
    expect(graphs.map((g) => g.key)).toEqual(['cabmic1', 'cabmic2']);
    expect(graphs[0]).toMatchObject({ slot: 1, title: 'CAB 1', page: 0 });
    expect(graphs[0].pan.id).toBe(12);
    expect(graphs[0].position.id).toBe(93); // DynaCab position ("DynaCab 1"), not the Proximity knob
    expect(graphs[0].distance?.id).toBe(97); // DynaCab distance (cm), not the legacy delay 16
    expect(graphs[0].mic?.options[1].label).toBe('Condenser');
    expect(graphs[1]).toMatchObject({ slot: 2, title: 'CAB 2' });
  });

  it('returns nothing when the cab is not in DynaCab mode (legacy IR)', () => {
    expect(deriveCabMicGraphs({ layout: layout('CABINET', [cabPage, alignPage]), params: cabParams, enums: cabEnums, dyna: false })).toEqual([]);
  });

  it('falls back to the legacy delay knob when the DynaCab distance is not live', () => {
    const onlyDelay = page('Cab', [
      c('CABINET_PAN1', 12, 'Pan'),
      c('CABINET_DELAY1', 16, 'Distance')
    ]);
    const graphs = deriveCabMicGraphs({
      layout: layout('CABINET', [onlyDelay]),
      params: [p(12, 'Pan 1', -100, 100), p(93, 'DynaCab 1', 0, 10), p(16, 'Distance 1', 0, 1)],
      enums: [],
      dyna: true
    });
    expect(graphs[0].distance?.id).toBe(16);
  });

  it('skips a slot whose Pan/Position are not live for this variant', () => {
    const oneSlot = page('Cab', [c('CABINET_PAN1', 12, 'Pan')]);
    const graphs = deriveCabMicGraphs({
      layout: layout('CABINET', [oneSlot]),
      params: [p(12, 'Pan 1', -100, 100), p(93, 'DynaCab 1', 0, 10)],
      enums: [],
      dyna: true
    });
    expect(graphs.map((g) => g.key)).toEqual(['cabmic1']);
  });

  it('returns nothing for a non-Cab layout', () => {
    expect(deriveCabMicGraphs({ layout: layout('DISTORT', []), params: [], enums: [], dyna: true })).toEqual([]);
    expect(deriveCabMicGraphs({ layout: null, params: [], enums: [], dyna: true })).toEqual([]);
  });
});
