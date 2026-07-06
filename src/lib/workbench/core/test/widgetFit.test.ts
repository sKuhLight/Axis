import { describe, expect, it } from 'vitest';
import {
  capWidgetSize,
  fitWidgetInWidth,
  fitZone,
  fitZoneSize,
  widgetSizeRank,
  type WidgetFitDescriptor
} from '../widgetFit';

const d = (key: string, estW: number, keep = false): WidgetFitDescriptor => ({ key, estW, keep });

describe('fitZoneSize (design _fit)', () => {
  it('returns default for an empty zone', () => {
    expect(fitZoneSize([], 0, 12)).toBe('default');
    expect(fitZoneSize([], 500, 12)).toBe('default');
  });

  it('picks default when the full-width sum fits', () => {
    // preset(250) + save(98) + gap(12) = 360
    expect(fitZoneSize([d('preset', 250), d('save', 98)], 360, 12)).toBe('default');
    expect(fitZoneSize([d('preset', 250), d('save', 98)], 359, 12)).toBe('compact');
  });

  it('applies the 0.62 compact factor with a 40px floor', () => {
    // compact need = max(40, round(250*.62)) + max(40, round(98*.62)) + 12
    //             = 155 + 61 + 12 = 228
    const ids = [d('preset', 250), d('save', 98)];
    expect(fitZoneSize(ids, 228, 12)).toBe('compact');
    expect(fitZoneSize(ids, 227, 12)).toBe('mini');
  });

  it('enforces the 40px per-widget floor at the compact tier', () => {
    // three tiny widgets: compact each floors to 40 → 3*40 + 2*8 = 136
    const ids = [d('a', 44), d('b', 44), d('c', 44)];
    expect(fitZoneSize(ids, 136, 8)).toBe('compact');
    expect(fitZoneSize(ids, 135, 8)).toBe('mini');
  });

  it('honors the gap between units', () => {
    const ids = [d('a', 100), d('b', 100), d('c', 100)];
    // default need = 300 + gap*2
    expect(fitZoneSize(ids, 300 + 24, 12)).toBe('default');
    expect(fitZoneSize(ids, 300 + 23, 12)).toBe('compact');
    // gap 8 → default need = 300 + 8*2 = 316
    expect(fitZoneSize(ids, 316, 8)).toBe('default');
    expect(fitZoneSize(ids, 315, 8)).toBe('compact');
  });
});

describe('fitZone (design overflow shedding)', () => {
  it('does not shed when default or compact fits', () => {
    const ids = [d('preset', 250, true), d('scenes', 240), d('save', 98, true)];
    const { size, overflow } = fitZone(ids, 2000, 12);
    expect(size).toBe('default');
    expect(overflow.size).toBe(0);
  });

  it('sheds lowest-priority units when even mini cannot fit, keeping the keep-set', () => {
    // Wide roster that only lands on mini, then must shed.
    const ids = [
      d('preset', 250, true),
      d('scenes', 240),
      d('view', 170),
      d('tuner', 78),
      d('tempo', 82),
      d('cpu', 124),
      d('save', 98, true)
    ];
    const { size, overflow } = fitZone(ids, 220, 12);
    // preset + save must always survive.
    expect(overflow.has('preset')).toBe(false);
    expect(overflow.has('save')).toBe(false);
    // Something had to be shed at this width.
    expect(overflow.size).toBeGreaterThan(0);
    expect(['mini', 'compact', 'default']).toContain(size);
  });

  it('sheds in document order (later low-priority units shed first)', () => {
    // mini widths: each estW*0.42 floored at 36, +10 spacing.
    // preset(keep): max(36,105)=105 +10 = 115
    // a: max(36,round(200*.42)=84)=84 +10 = 94  → used 115+94=209
    // b: 84 +10 = 94 → used 303
    // c: 84 +10 = 94 → used 397
    // budget = avail - 44.
    const ids = [d('preset', 250, true), d('a', 200), d('b', 200), d('c', 200)];
    // avail 350 → budget 306: a(209) ok, b(303) ok, c(397) sheds.
    const r1 = fitZone(ids, 350, 12);
    expect(r1.overflow.has('c')).toBe(true);
    expect(r1.overflow.has('a')).toBe(false);
    expect(r1.overflow.has('b')).toBe(false);
    // avail 260 → budget 216: a(209) ok, b(303) sheds, c(397) sheds.
    const r2 = fitZone(ids, 260, 12);
    expect(r2.overflow.has('a')).toBe(false);
    expect(r2.overflow.has('b')).toBe(true);
    expect(r2.overflow.has('c')).toBe(true);
  });

  it('keep-set survives even under extreme squeeze', () => {
    const ids = [d('preset', 250, true), d('save', 98, true), d('extra', 300)];
    const { overflow } = fitZone(ids, 40, 12);
    expect(overflow.has('preset')).toBe(false);
    expect(overflow.has('save')).toBe(false);
    expect(overflow.has('extra')).toBe(true);
  });

  it('handles degenerate widths (zero / negative avail)', () => {
    const ids = [d('preset', 250, true), d('a', 200)];
    const r0 = fitZone(ids, 0, 12);
    expect(r0.size).toBe('mini');
    expect(r0.overflow.has('preset')).toBe(false);
    expect(r0.overflow.has('a')).toBe(true);
    const rn = fitZone(ids, -100, 12);
    expect(rn.overflow.has('a')).toBe(true);
  });

  it('returns no overflow for an empty zone', () => {
    const { size, overflow } = fitZone([], 100, 12);
    expect(size).toBe('default');
    expect(overflow.size).toBe(0);
  });
});

describe('fitWidgetInWidth (design per-panel mkW)', () => {
  it('fits default when estW <= availMinus24', () => {
    expect(fitWidgetInWidth(120, 120)).toBe('default');
    expect(fitWidgetInWidth(120, 119)).toBe('compact');
  });

  it('falls to compact via the 0.62 factor', () => {
    // 200*0.62 = 124
    expect(fitWidgetInWidth(200, 124)).toBe('compact');
    expect(fitWidgetInWidth(200, 123)).toBe('mini');
  });

  it('falls to mini when nothing fits', () => {
    expect(fitWidgetInWidth(300, 10)).toBe('mini');
    expect(fitWidgetInWidth(120, 0)).toBe('mini');
  });
});

describe('capWidgetSize (manual density is a ceiling)', () => {
  it('never grows above the manual ceiling', () => {
    expect(capWidgetSize('default', 'compact')).toBe('compact');
    expect(capWidgetSize('default', 'mini')).toBe('mini');
    expect(capWidgetSize('compact', 'mini')).toBe('mini');
  });

  it('allows auto-fit to shrink below the ceiling', () => {
    expect(capWidgetSize('mini', 'default')).toBe('mini');
    expect(capWidgetSize('compact', 'default')).toBe('compact');
    expect(capWidgetSize('compact', 'compact')).toBe('compact');
  });

  it('ranks sizes default > compact > mini', () => {
    expect(widgetSizeRank('default')).toBeGreaterThan(widgetSizeRank('compact'));
    expect(widgetSizeRank('compact')).toBeGreaterThan(widgetSizeRank('mini'));
  });
});
