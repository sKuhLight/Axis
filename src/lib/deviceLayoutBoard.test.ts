import { describe, it, expect } from 'vitest';
import { isForeignControl, isLayoutPageSelector, layoutVariantSig, resolveControl, sameLayoutVariant, withoutCrossBlockRefs, type BoardCtl } from './deviceLayoutBoard';
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

describe('selected layout pages', () => {
  const a = { name: 'Authentic', selectorParamName: 'X_TYPE', value: '1', rows: [{ controls: [ctl('knob', 4)] }] };
  const b = { ...a, value: '2', rows: [{ controls: [ctl('knob', 5)] }] };

  it('recognizes a new page choice even with the same page names and control count, and keeps legacy identity', () => {
    const old = layout([{ ...a, selectorParamName: undefined, value: undefined }]);
    const first = layoutVariantSig(layout([a]));
    const next = layoutVariantSig(layout([b]));
    expect(sameLayoutVariant(first, next)).toBe(false);
    expect(sameLayoutVariant(layoutVariantSig(old), first)).toBe(true);
  });

  it('reloads only a selector of the open block, including page-level selectors', () => {
    const select = ctl('dropdown', 7, 'Type', { paramName: 'X_TYPE' });
    expect(isLayoutPageSelector(layout([{ ...a, pageControls: [select] }]), 7, 42)).toBe(true);
    expect(isLayoutPageSelector(layout([{ ...a, pageControls: [select] }]), 4, 42)).toBe(false);
    const foreign = { ...select, crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: 'X_TYPE', paramId: 7, effectId: 1 } };
    expect(isLayoutPageSelector(layout([{ ...a, pageControls: [foreign] }]), 7, 42)).toBe(false);
  });
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

describe('resolveControl — controls of another block (cross-block refs, AXIS-93)', () => {
  const cat = byKey(knob(0), select(4), METER, BYPASS, EQ);
  // what the server sends today: the owner as an editor token only (no effect id)
  const foreign = (widget: LayoutWidget, paramId: number | null, extra: Partial<LayoutControl['crossBlock'] & object> = {}) =>
    ctl(widget, paramId, 'Source', {
      crossBlock: { effect: 'ID_MODIFIER1', family: 'MOD', paramName: 'MOD_CTRLID', paramId, ...extra }
    });

  it('a ref whose paramId exists in the open block stays a gap (no binding by the bare number)', () => {
    expect(resolveControl(foreign('knob', 0), cat)).toBe('gap');
    expect(resolveControl(foreign('dropdown', 4), cat)).toBe('gap');
    expect(resolveControl(foreign('knob', 0), cat, { effectId: 2 })).toBe('gap');
    expect(isForeignControl(foreign('knob', 0), { effectId: 2 })).toBe(true);
  });

  it('never falls back to the open block’s meter / bypass / EQ entries either', () => {
    expect(resolveControl(foreign('meter', null), cat)).toBe('gap');
    expect(resolveControl(ctl('button', null, 'Bypass', { rawWidget: 'btnBypass', crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: null, paramId: null } }), cat)).toBe('gap');
    expect(resolveControl(foreign('graph', null), cat)).toBe('gap');
  });

  it('binds when the server names the open block as the owner (matching effect id)', () => {
    expect(resolveControl(foreign('knob', 0, { effectId: 46 }), cat, { effectId: 46 })).toEqual({ key: 'k0', view: 'knob' });
    expect(isForeignControl(foreign('knob', 0, { effectId: 46 }), { effectId: 46 })).toBe(false);
  });

  it('a different owner, or an unknown open block, stays a gap', () => {
    expect(resolveControl(foreign('knob', 0, { effectId: 1 }), cat, { effectId: 46 })).toBe('gap');
    expect(resolveControl(foreign('knob', 0, { effectId: 46 }), cat)).toBe('gap');
    expect(resolveControl(foreign('knob', 0, { effectId: 46 }), cat, { effectId: null })).toBe('gap');
  });

  it('controls without a crossBlock are unchanged (a null crossBlock counts as none)', () => {
    expect(resolveControl(ctl('knob', 0, 'Threshold'), cat, { effectId: 46 })).toEqual({ key: 'k0', view: 'knob' });
    expect(resolveControl(ctl('knob', 0, 'Threshold', { crossBlock: null as unknown as undefined }), cat)).toEqual({ key: 'k0', view: 'knob' });
    expect(isForeignControl(ctl('knob', 0, 'Threshold'))).toBe(false);
  });

  it('withoutCrossBlockRefs resolves as before the guard (only for recognising old stored seeds)', () => {
    const lay = layout([{ name: 'P', rows: [{ controls: [foreign('knob', 0)] }] }]);
    const plain = withoutCrossBlockRefs(lay).pages[0]!.rows[0]!.controls[0]!;
    expect(resolveControl(plain, cat)).toEqual({ key: 'k0', view: 'knob' });
    expect(lay.pages[0]!.rows[0]!.controls[0]!.crossBlock).toBeTruthy(); // the served layout is untouched
  });

  // fix round: refs to the open layout's own family and a single-instance effect are the block's own params
  const own = (effect: string, family: string | null, paramId: number) =>
    ctl('knob', paramId, 'Own', { crossBlock: { effect, family, paramName: 'X', paramId } });
  it('a same-family ref to a single-instance effect binds (the Foot Controller screen’s own params)', () => {
    expect(resolveControl(own('ID_FOOTCONTROLLER', 'FC', 0), cat, { family: 'FC' })).toEqual({ key: 'k0', view: 'knob' });
    expect(isForeignControl(own('ID_FOOTCONTROLLER', 'FC', 0), { effectId: 199, family: 'FC' })).toBe(false);
  });
  it('a same-family ref to one instance of a multi-instance effect stays a gap', () => {
    expect(resolveControl(own('ID_OUTPUT1', 'OUTPUT', 0), cat, { family: 'OUTPUT' })).toBe('gap');
    expect(resolveControl(own('ID_DISTORT1', 'DISTORT', 0), cat, { family: 'DISTORT' })).toBe('gap');
  });
  it('a ref to another family, or without a family (AM4), stays a gap', () => {
    expect(resolveControl(own('ID_GLOBAL', 'GLOBAL', 0), cat, { family: 'FC' })).toBe('gap');
    expect(resolveControl(own('ID_FOOTCONTROLLER', null, 0), cat, { family: 'FC' })).toBe('gap');
    expect(resolveControl(own('ID_FOOTCONTROLLER', 'FC', 0), cat)).toBe('gap'); // open layout family unknown
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
