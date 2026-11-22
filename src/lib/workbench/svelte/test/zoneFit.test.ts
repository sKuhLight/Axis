import { describe, expect, it } from 'vitest';
import { fitZone, type WidgetFitDescriptor } from '../../core';
import { WIDGET_ZONE_ADD_BUTTON_PX } from '../addCatalog';
import {
  fitWidgetZones,
  WIDGET_ZONE_EDIT_GAP_PX,
  WIDGET_ZONE_EMPTY_ADD_PX,
  WIDGET_ZONE_EMPTY_PLACEHOLDER_PX,
  zoneEditChromePx
} from '../zoneFit';

const d = (key: string, estW: number, keep = false): WidgetFitDescriptor => ({ key, estW, keep });

/** The desktop default top bar (Axis estW): preset | (empty centre) | view … save. */
const TOP_BAR = [
  { zone: 'top.left', units: [d('preset', 250, true)] },
  { zone: 'top.center', units: [] as WidgetFitDescriptor[] },
  {
    zone: 'top.right',
    units: [d('view', 170), d('addBlock', 132), d('tuner', 78), d('tempo', 82), d('cpu', 124), d('meter', 60), d('save', 98, true)]
  }
];

describe('zoneEditChromePx', () => {
  it('a zone with units ends in the compact "+" plus one gap', () => {
    expect(zoneEditChromePx(3, { canAdd: true, emptyAdd: 'label', gap: 16 })).toBe(WIDGET_ZONE_ADD_BUTTON_PX + 16);
    expect(zoneEditChromePx(3, { canAdd: false, emptyAdd: 'label', gap: 16 })).toBe(0);
  });

  it('an empty zone is "+ Widget", the compact "+", or the bare placeholder without a palette', () => {
    expect(zoneEditChromePx(0, { canAdd: true, emptyAdd: 'label', gap: 16 })).toBe(WIDGET_ZONE_EMPTY_ADD_PX);
    expect(zoneEditChromePx(0, { canAdd: true, emptyAdd: 'compact', gap: 16 })).toBe(WIDGET_ZONE_ADD_BUTTON_PX);
    expect(zoneEditChromePx(0, { canAdd: false, emptyAdd: 'label', gap: 16 })).toBe(WIDGET_ZONE_EMPTY_PLACEHOLDER_PX);
  });

  it('adds the per-zone chrome (padding)', () => {
    expect(zoneEditChromePx(0, { canAdd: true, emptyAdd: 'compact', gap: 16, zoneChromePx: 10 })).toBe(WIDGET_ZONE_ADD_BUTTON_PX + 10);
  });
});

describe('fitWidgetZones (slice 4b: the fit includes the "+" buttons)', () => {
  it('outside edit mode it is exactly the design fit (with shedding)', () => {
    const units = TOP_BAR.flatMap((z) => z.units);
    for (const avail of [1400, 776, 400]) {
      const got = fitWidgetZones({ zones: TOP_BAR, avail, gap: 12, editing: false, canAdd: true });
      const want = fitZone(units, avail, 12);
      expect(got.size).toBe(want.size);
      expect([...got.overflow]).toEqual([...want.overflow]);
      expect(got).toMatchObject({ emptyAdd: 'label', reserve: 0, gap: 12 });
    }
  });

  it('1440 px desktop: editing keeps the default size (the bar has room for the "+" buttons)', () => {
    const fit = fitWidgetZones({ zones: TOP_BAR, avail: 1382, gap: 12, editing: true, canAdd: true, zoneChromePx: 10 });
    expect(fit.size).toBe('default');
    expect(fit.emptyAdd).toBe('label');
    expect(fit.gap).toBe(WIDGET_ZONE_EDIT_GAP_PX);
    // tl "+" + tr "+" (each 26 + 16) + centre "+ Widget" + 3 × 10 px padding.
    expect(fit.reserve).toBe(2 * (WIDGET_ZONE_ADD_BUTTON_PX + 16) + WIDGET_ZONE_EMPTY_ADD_PX + 30);
  });

  it('834 px: view mode fits compact, editing steps down to mini because of the "+" buttons and the wider gap', () => {
    expect(fitWidgetZones({ zones: TOP_BAR, avail: 776, gap: 12, editing: false, canAdd: true }).size).toBe('compact');
    const edit = fitWidgetZones({ zones: TOP_BAR, avail: 776, gap: 12, editing: true, canAdd: true, zoneChromePx: 10 });
    expect(edit.size).toBe('mini');
    // Edit mode never sheds: every unit stays visible to be rearranged.
    expect(edit.overflow.size).toBe(0);
  });

  it('"+ Widget" collapses to the compact "+" when its label would cost the units a size tier', () => {
    const zones = [
      { zone: 'a', units: [d('x', 200), d('y', 200)] },
      { zone: 'b', units: [] as WidgetFitDescriptor[] }
    ];
    // Default need with the edit gap: 400 + 16 = 416; "+" of zone a: 26 + 16 = 42.
    // With "+ Widget" (84): 542 → fits at 542, not at 541; compact "+" (26): 484.
    expect(fitWidgetZones({ zones, avail: 542, gap: 12, editing: true, canAdd: true })).toMatchObject({ size: 'default', emptyAdd: 'label' });
    expect(fitWidgetZones({ zones, avail: 541, gap: 12, editing: true, canAdd: true })).toMatchObject({ size: 'default', emptyAdd: 'compact' });
    expect(fitWidgetZones({ zones, avail: 484, gap: 12, editing: true, canAdd: true })).toMatchObject({ size: 'default', emptyAdd: 'compact' });
    expect(fitWidgetZones({ zones, avail: 483, gap: 12, editing: true, canAdd: true }).size).toBe('compact');
  });

  it('when even mini does not fit, the empty zones collapse too', () => {
    const zones = [
      { zone: 'a', units: [d('x', 400), d('y', 400), d('z', 400)] },
      { zone: 'b', units: [] as WidgetFitDescriptor[] }
    ];
    const fit = fitWidgetZones({ zones, avail: 200, gap: 12, editing: true, canAdd: true });
    expect(fit).toMatchObject({ size: 'mini', emptyAdd: 'compact' });
    expect(fit.overflow.size).toBe(0);
  });

  it('without an Add palette the empty placeholder is reserved, no "+"', () => {
    const fit = fitWidgetZones({ zones: TOP_BAR, avail: 1382, gap: 12, editing: true, canAdd: false });
    expect(fit.reserve).toBe(WIDGET_ZONE_EMPTY_PLACEHOLDER_PX);
  });
});
