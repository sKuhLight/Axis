import { describe, it, expect } from 'vitest';
import { deriveCabMicGraphs } from './cabMicGraphs';
import type { DeviceLayout, EnumParam, LayoutControl, LayoutPage, NamedParam } from './types';

// ── fixture builders ──
// Shaped after the REAL DynaCab page (Axe-Fx III `CABINET` variant "1", page "Cab 1+2"): the cone is a
// `dynaCabControl` control bound to `CABINET_DYNACAB_R{n}`, and every DynaCab param is authored into the
// layout by symbol with a device-true paramId. Nothing here is resolved by display name.
const c = (paramName: string | null, paramId: number | null, label = '', rawWidget = 'knob'): LayoutControl => ({
  label: label || paramName || '',
  paramName,
  paramId,
  widget: rawWidget === 'dynaCabControl' ? 'unknown' : 'knob',
  rawWidget
});
const page = (name: string, controls: LayoutControl[]): LayoutPage => ({ name, rows: [{ section: 'parameters', controls }] });
const layout = (family: string, pages: LayoutPage[]): DeviceLayout => ({ family, pages });
const p = (id: number, name: string, min = 0, max = 1): NamedParam => ({ id, name, value: 0, norm: 0.5, min, max });
const e = (id: number, name: string, labels: string[], value: number): EnumParam => ({
  id,
  name,
  value,
  options: labels.map((label, i) => ({ value: i, label }))
});

const slot = (n: number, base: number) => [
  c(`CABINET_LABEL${n}`, 65287 + n, `CAB ${n}`, 'labelBold'),
  c(`CABINET_LABEL${n}`, 65287 + n, 'Mic', 'labelBold'), // the page reuses the symbol for the caption
  c(`CABINET_DYNACAB_MIC${n}`, base + 4, '', 'dropdownCabDyna'),
  c(`CABINET_DYNACAB_R${n}`, base + 8, 'DynaCab', 'dynaCabControl'),
  c(`CABINET_PAN${n}`, 11 + n, 'Pan'),
  c(`CABINET_LEVEL${n}`, 7 + n, 'Level'),
  c(`CABINET_DYNACAB_R${n}`, base + 8, 'Position'),
  c(`CABINET_DYNACAB_Z${n}`, base + 12, 'Distance')
];
const dynaLayout = layout('CABINET', [page('Cab 1+2', [...slot(1, 85), ...slot(2, 86)])]);
const dynaParams = [
  p(8, 'Level 1'), p(9, 'Level 2'), p(12, 'Pan 1'), p(13, 'Pan 2'),
  p(93, 'DynaCab 1', 0, 10), p(94, 'DynaCab 2', 0, 10),
  p(97, 'Distance 1', 0, 24), p(98, 'Distance 2', 0, 24)
];
const dynaEnums = [e(89, 'DYNACAB MIC1', ['R121', 'SM57'], 1), e(90, 'DYNACAB MIC2', ['R121', 'SM57'], 0)];

describe('deriveCabMicGraphs', () => {
  it('draws one cone per device-authored dynaCabControl, in device order', () => {
    const out = deriveCabMicGraphs({ layout: dynaLayout, params: dynaParams, enums: dynaEnums });
    expect(out.map((g) => g.slot)).toEqual([1, 2]);
    expect(out.map((g) => g.key)).toEqual(['cabmic1', 'cabmic2']);
  });

  it('binds every control by SYMBOL to the device-true id', () => {
    const [one] = deriveCabMicGraphs({ layout: dynaLayout, params: dynaParams, enums: dynaEnums });
    expect(one.position.id).toBe(93); // CABINET_DYNACAB_R1 — the cone's own param
    expect(one.pan.id).toBe(12);
    expect(one.level?.id).toBe(8);
    expect(one.distance?.id).toBe(97); // CABINET_DYNACAB_Z1, not the legacy CABINET_DELAY1
    expect(one.mic?.id).toBe(89);
  });

  it('titles the slot from the device heading, taking the FIRST use of a reused symbol', () => {
    // `CABINET_LABEL1` names both the "CAB 1" heading and the "Mic" caption below it.
    expect(deriveCabMicGraphs({ layout: dynaLayout, params: dynaParams, enums: dynaEnums })[0].title).toBe('CAB 1');
  });

  it('draws nothing for a legacy IR cab — no dynaCabControl, no cone', () => {
    const legacy = layout('CABINET', [
      page('Cab', [c('CABINET_LEVEL1', 8, 'Level'), c('CABINET_PAN1', 12, 'Pan'), c('CABINET_DELAY1', 16, 'Distance')])
    ]);
    expect(deriveCabMicGraphs({ layout: legacy, params: dynaParams, enums: dynaEnums })).toEqual([]);
  });

  it('skips a slot whose position or pan is not live rather than half-drawing it', () => {
    const withoutPan = dynaParams.filter((x) => x.id !== 13);
    expect(deriveCabMicGraphs({ layout: dynaLayout, params: withoutPan, enums: dynaEnums }).map((g) => g.slot)).toEqual([1]);
  });

  it('still draws a slot whose optional controls are missing', () => {
    const bare = dynaParams.filter((x) => x.id !== 8 && x.id !== 97);
    const [one] = deriveCabMicGraphs({ layout: dynaLayout, params: bare, enums: [] });
    expect(one.level).toBeUndefined();
    expect(one.distance).toBeUndefined();
    expect(one.mic).toBeUndefined();
    expect(one.position.id).toBe(93);
  });

  it('is empty for a block with no layout at all', () => {
    expect(deriveCabMicGraphs({ layout: null, params: dynaParams, enums: dynaEnums })).toEqual([]);
  });
});
