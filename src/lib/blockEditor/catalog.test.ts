import { describe, it, expect } from 'vitest';
import { buildCatalog, CONT_VIEWS, meterLabel, TOG_VIEWS, viewsByKey } from './catalog';

const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: `o${i}` }));

describe('buildCatalog', () => {
  const cat = buildCatalog({
    params: [{ id: 1, name: 'Gain' }, { id: 2, name: 'Bass' }, { name: 'No id' }, { id: 9, name: 'Cab level' }],
    enums: [
      { id: 4, name: 'Bright', options: opts(2) },
      { id: 5, name: 'Mode', options: opts(4) },
      { id: 9, name: 'Hidden enum', options: opts(2) }
    ],
    eqBandCount: 8,
    eqTitle: 'Graphic EQ',
    hideIds: [9],
    monitors: [{ role: 'gainReduction' }, { role: 'vu' }],
    hasWave: true
  });

  it('keeps the previous keys and order', () => {
    expect(cat.map((c) => c.key)).toEqual(['eq', 'k1', 'k2', 'e4', 'e5', 'bypass', 'meter', 'wave']);
  });

  it('assigns kinds, views and cell sizes', () => {
    const by = new Map(cat.map((c) => [c.key, c]));
    expect(by.get('eq')).toMatchObject({ kind: 'eq', label: 'Graphic EQ', id: -1, view: 'eq', w: 8, h: 4 });
    expect(by.get('k1')).toMatchObject({ kind: 'cont', label: 'Gain', id: 1, view: 'knob', w: 2, h: 2, views: CONT_VIEWS });
    expect(by.get('e4')).toMatchObject({ kind: 'toggle', view: 'button', w: 2, h: 2, views: TOG_VIEWS });
    expect(by.get('e5')).toMatchObject({ kind: 'select', view: 'select', views: ['select'] });
    expect(by.get('bypass')).toMatchObject({ kind: 'action', id: -2, view: 'action', w: 2, h: 1 });
    expect(by.get('meter')).toMatchObject({ kind: 'meter', label: 'Gain Reduction', id: -3, w: 2, h: 4 });
    expect(by.get('wave')).toMatchObject({ kind: 'wave', label: 'Loop', id: -4, w: 8, h: 4 });
  });

  it('leaves out EQ, meter and wave when the block has none, and hidden ids', () => {
    const bare = buildCatalog({ params: [{ id: 1, name: 'A' }], enums: [], hideIds: [1] });
    expect(bare.map((c) => c.key)).toEqual(['bypass']);
  });

  it('names meters by role', () => {
    expect(meterLabel('vu')).toBe('VU');
    expect(meterLabel('level')).toBe('Meter');
    expect(meterLabel(undefined)).toBe('Meter');
  });

  it('exposes allowed views per key', () => {
    expect(viewsByKey(cat).get('k1')).toEqual(CONT_VIEWS);
  });
});
