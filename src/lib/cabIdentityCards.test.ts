import { describe, it, expect } from 'vitest';
import { deriveCabIdentityCards } from './cabIdentityCards';
import type { CabState, DeviceLayout, EnumParam, LayoutControl, LayoutWidget } from './types';

const ctl = (widget: LayoutWidget, paramId: number | null, paramName: string | null, label = ''): LayoutControl => ({
  label,
  paramName,
  paramId,
  widget
});

/** The real cab shape: one row per slot, each carrying that slot's IR Length + knobs. */
const cabLayout = (slots = 2): DeviceLayout => ({
  family: 'CABINET',
  pages: [
    {
      name: 'Cab',
      rows: Array.from({ length: slots }, (_, i) => ({
        section: 'parameters',
        controls: [
          ctl('dropdown', 70 + i, `CABINET_IRLENGTH${i + 1}`, 'IR Length'),
          ctl('knob', 8 + i, `CABINET_LEVEL${i + 1}`, 'Level'),
          ctl('knob', 12 + i, `CABINET_PAN${i + 1}`, 'Pan')
        ]
      }))
    },
    { name: 'Align', rows: [{ section: 'parameters', controls: [ctl('knob', 40, 'CABINET_ALIGN1', 'Align')] }] }
  ]
});

const irLengthEnum = (id: number): EnumParam => ({ id, name: 'IR Length', value: 0, options: [{ value: 0, label: 'Standard' }, { value: 1, label: 'Ultra-Res' }] });

const cabState = (): CabState => ({
  modeParam: 31,
  mode: { value: 0, label: 'LEGACY' },
  modeOptions: [],
  bankOptions: [],
  dynaOptions: [],
  slots: [
    { slot: 1, bankParam: 0, irParam: 4, dynaParam: 85, bank: { value: 2, label: 'Factory 2' }, irIndex: 706, irName: '4x12 Fractal GB 160 1', dyna: { value: 0, label: '4x12 Dyna A' } },
    { slot: 2, bankParam: 1, irParam: 5, dynaParam: 86, bank: { value: 1, label: 'Factory 1' }, irIndex: 1, irName: '1x4 Pig 57', dyna: { value: 3, label: '1x12 Dyna B' } }
  ]
});

const derive = (o: Partial<Parameters<typeof deriveCabIdentityCards>[0]> = {}) =>
  deriveCabIdentityCards({ layout: cabLayout(), enums: [irLengthEnum(70), irLengthEnum(71)], cabState: cabState(), dyna: false, ...o });

describe('deriveCabIdentityCards', () => {
  it('emits one card per slot, anchored to that slot own layout page and row', () => {
    const cards = derive();
    expect(cards.map((c) => c.key)).toEqual(['cabid1', 'cabid2']);
    expect(cards.map((c) => [c.page, c.row])).toEqual([
      [0, 0],
      [0, 1]
    ]);
    expect(cards.map((c) => c.title)).toEqual(['CAB 1', 'CAB 2']);
  });

  it('shows the live legacy selection: cabinet name, bank and IR number', () => {
    const [a, b] = derive();
    expect(a.name).toBe('4x12 Fractal GB 160 1');
    expect(a.bank).toBe('Factory 2');
    expect(a.irIndex).toBe(706);
    expect(b.name).toBe('1x4 Pig 57');
    expect(b.bank).toBe('Factory 1');
  });

  it('binds IR Length by SYMBOL, so each slot gets its own enum rather than a shared or guessed id', () => {
    const [a, b] = derive();
    expect(a.irLength?.id).toBe(70);
    expect(b.irLength?.id).toBe(71);
  });

  it('shows the DynaCab name and drops bank / IR # / IR Length in DynaCab mode', () => {
    const [a] = derive({ dyna: true });
    expect(a.name).toBe('4x12 Dyna A');
    expect(a.bank).toBeNull();
    expect(a.irIndex).toBeNull();
    expect(a.irLength).toBeNull(); // the device ignores it in dyna mode, and BlockEditor hides the param
  });

  it('still places the card before CabState arrives, with the name pending', () => {
    const cards = derive({ cabState: null });
    expect(cards).toHaveLength(2);
    expect(cards[0].name).toBeNull();
    expect(cards[0].bank).toBeNull();
    expect(cards[0].irLength?.id).toBe(70); // layout-derived, so it does not wait on the fetch
  });

  it('skips a slot the variant does not serve rather than placing it on a guessed row', () => {
    expect(deriveCabIdentityCards({ layout: cabLayout(1), enums: [irLengthEnum(70)], cabState: cabState(), dyna: false })).toHaveLength(1);
  });

  it('leaves IR Length null when the variant serves no such enum, rather than binding the wrong one', () => {
    expect(derive({ enums: [] })[0].irLength).toBeNull();
  });

  it('emits nothing for a block with no cab rows (not a Cab block, or no layout yet)', () => {
    expect(derive({ layout: null })).toEqual([]);
    expect(
      deriveCabIdentityCards({
        layout: { family: 'DISTORT', pages: [{ name: 'Drive', rows: [{ controls: [ctl('knob', 1, 'DRIVE_GAIN', 'Drive')] }] }] },
        enums: [],
        cabState: null,
        dyna: false
      })
    ).toEqual([]);
  });

  it('falls back to Pan when the variant does not author Level, so the card still finds its row', () => {
    const noLevel: DeviceLayout = {
      family: 'CABINET',
      pages: [{ name: 'Cab', rows: [{ controls: [ctl('knob', 99, 'CABINET_MISC', 'Misc')] }, { controls: [ctl('knob', 12, 'CABINET_PAN1', 'Pan')] }] }]
    };
    const [a] = deriveCabIdentityCards({ layout: noLevel, enums: [], cabState: null, dyna: false });
    expect(a.row).toBe(1);
  });
});
