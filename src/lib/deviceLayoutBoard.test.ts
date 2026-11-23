import { describe, it, expect } from 'vitest';
import { layoutVariantSig, resolveControl, type BoardCtl } from './deviceLayoutBoard';
import type { DeviceLayout, LayoutControl, LayoutWidget } from './types';

// ── catalog builders (the Block Editor's live catalog entries, blockEditor/catalog.ts) ──
const knob = (id: number): BoardCtl => ({ key: `k${id}`, kind: 'cont', id, w: 2, h: 2, view: 'knob', views: ['knob', 'fader', 'slider', 'number'] });
const select = (id: number): BoardCtl => ({ key: `e${id}`, kind: 'select', id, w: 2, h: 2, view: 'select', views: ['select'] });
const toggle = (id: number): BoardCtl => ({ key: `e${id}`, kind: 'toggle', id, w: 2, h: 2, view: 'button', views: ['button', 'switch'] });
const EQ: BoardCtl = { key: 'eq', kind: 'eq', id: -1, w: 8, h: 4, view: 'eq', views: ['eq'] };
const BYPASS: BoardCtl = { key: 'bypass', kind: 'action', id: -2, w: 2, h: 1, view: 'action', views: ['action'] };
const METER: BoardCtl = { key: 'meter', kind: 'meter', id: -3, w: 2, h: 4, view: 'meter', views: ['meter'] };

const ctl = (widget: LayoutWidget, paramId: number | null, label = '', extra: Partial<LayoutControl> = {}): LayoutControl => ({
  label,
  paramName: label || null,
  paramId,
  widget,
  ...extra
});
const byKey = (...entries: BoardCtl[]) => new Map(entries.map((c) => [c.key, c]));

const layout = (pages: DeviceLayout['pages'], extra: Partial<DeviceLayout> = {}): DeviceLayout => ({
  family: 'INPUT',
  pages,
  ...extra
});

describe('resolveControl — layout widget → catalog key + view', () => {
  const cat = byKey(knob(0), knob(5), select(4), toggle(9), METER, BYPASS);

  it('maps widget kinds to the right catalog view', () => {
    expect(resolveControl(ctl('knob', 0, 'Threshold'), cat)).toEqual({ key: 'k0', view: 'knob' });
    expect(resolveControl(ctl('slider', 5, 'Level'), cat)).toEqual({ key: 'k5', view: 'slider' });
    expect(resolveControl(ctl('readout', 5, 'Level'), cat)).toEqual({ key: 'k5', view: 'number' });
    expect(resolveControl(ctl('dropdown', 4, 'Impedance'), cat)).toEqual({ key: 'e4', view: 'select' });
    expect(resolveControl(ctl('toggle', 9, 'Mode'), cat)).toEqual({ key: 'e9', view: 'switch' });
    expect(resolveControl(ctl('button', 9, 'Mode'), cat)).toEqual({ key: 'e9', view: 'button' });
  });

  it('block-level entries for controls without a live parameter: meter, bypass, EQ graph', () => {
    expect(resolveControl(ctl('meter', 8, 'Gain', { rawWidget: 'meterGainVert' }), cat)).toEqual({ key: 'meter', view: 'meter' });
    expect(resolveControl(ctl('button', 6, 'Bypass', { rawWidget: 'btnBypass' }), cat)).toEqual({ key: 'bypass', view: 'action' });
    expect(resolveControl(ctl('graph', null, 'EQ'), byKey(EQ))).toEqual({ key: 'eq', view: 'eq' });
  });

  it('unknown / unmapped widgets fall back to the catalog default (no FM3 regression)', () => {
    expect(resolveControl(ctl('unknown', 0, 'Threshold'), cat)).toEqual({ key: 'k0', view: 'knob' });
    // a view the entry does not support falls back to its own default
    expect(resolveControl(ctl('slider', 9, 'Mode'), cat)).toEqual({ key: 'e9', view: 'button' });
  });

  it('spacers, labels and controls without a catalog entry are gaps', () => {
    expect(resolveControl(ctl('spacer', null), cat)).toBe('gap');
    expect(resolveControl(ctl('label', null, 'TONE'), cat)).toBe('gap');
    expect(resolveControl(ctl('meter', 8, 'Gain'), byKey(knob(0)))).toBe('gap'); // the block has no meter entry
    expect(resolveControl(ctl('knob', 77, 'Gone'), cat)).toBe('gap');
  });
});

describe('layoutVariantSig', () => {
  it('changes with the served variant (drives the Default re-seed) and is empty without a layout', () => {
    const pages = [{ name: 'P', rows: [{ controls: [ctl('knob', 0, 'A')] }] }] as DeviceLayout['pages'];
    const a = layoutVariantSig(layout(pages, { variantName: 'Type', variantValue: 'A' }));
    const b = layoutVariantSig(layout(pages, { variantName: 'Type', variantValue: 'B' }));
    expect(a).not.toBe(b);
    expect(a).toBe(layoutVariantSig(layout(pages, { variantName: 'Type', variantValue: 'A' })));
    expect(layoutVariantSig(null)).toBe('');
  });
});
