import { describe, expect, it, vi } from 'vitest';
import { arrangeSelection, BAR_DROP, barParts, buildBarOverflow, fitBar, type BarActions, type BarPart } from './arrangeBar';
import type { BeItem } from './boardModel';
import { CONT_VIEWS } from './catalog';

const knob: BeItem = { id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 };
const ctl = { key: 'k1', kind: 'cont' as const, label: 'Drive', views: CONT_VIEWS };
const hdiv: BeItem = { id: 'd', kind: 'hdiv', x: 0, y: 4, w: 6, h: 1, label: 'Tone' };

const actions = (): BarActions & Record<string, ReturnType<typeof vi.fn>> =>
  ({
    view: vi.fn(),
    size: vi.fn(),
    pin: vi.fn(),
    swipe: vi.fn(),
    remove: vi.fn(),
    label: vi.fn(),
    rotate: vi.fn(),
    undo: vi.fn(),
    add: vi.fn(),
    divider: vi.fn(),
    closeGaps: vi.fn(),
    tidy: vi.fn(),
    autoPack: vi.fn(),
    addFixed: vi.fn()
  }) as never;

describe('arrangeSelection', () => {
  it('a control: its views, S / M / L of the current view, pin and the swipe control', () => {
    const s = arrangeSelection({ item: knob, ctl, canPin: true, canSwipe: true, swipe: false });
    expect(s).toMatchObject({ kind: 'control', id: 'a', name: 'Drive', view: 'knob', views: CONT_VIEWS, pinnable: true, swipe: false });
    expect(s?.kind === 'control' && s.sizes.map((z) => [z.label, z.checked])).toEqual([
      ['S', true],
      ['M', false],
      ['L', false]
    ]);
    const custom = arrangeSelection({ item: { ...knob, w: 5, h: 5 }, ctl, canPin: false, canSwipe: false, swipe: false });
    expect(custom?.kind === 'control' && custom.sizes.at(-1)).toMatchObject({ label: null, w: 5, h: 5, checked: true });
    expect(custom).toMatchObject({ pinnable: false, swipe: null });
  });

  it('a divider: its name and label; nothing selected or an unknown control: null', () => {
    expect(arrangeSelection({ item: hdiv, ctl: undefined, canPin: true, canSwipe: true, swipe: true })).toEqual({ kind: 'divider', id: 'd', name: 'Horizontal divider', dkind: 'hdiv', label: 'Tone', w: 6, h: 1 });
    expect(arrangeSelection({ item: null, ctl, canPin: true, canSwipe: false, swipe: false })).toBeNull();
    expect(arrangeSelection({ item: knob, ctl: undefined, canPin: true, canSwipe: false, swipe: false })).toBeNull();
  });
});

describe('barParts', () => {
  it('no selection: the hint; a control: its tools; a divider: label, rotate, remove; Done last', () => {
    expect(barParts(null)).toEqual(['tag', 'hint', 'undo', 'add', 'divider', 'close-gaps', 'tidy', 'autopack', 'page', 'done']);
    const c = arrangeSelection({ item: knob, ctl, canPin: true, canSwipe: true, swipe: false });
    expect(barParts(c)).toEqual(['tag', 'sel-name', 'sel-view', 'sel-size', 'sel-pin', 'sel-swipe', 'sel-remove', 'undo', 'add', 'divider', 'close-gaps', 'tidy', 'autopack', 'page', 'done']);
    const one = arrangeSelection({ item: { ...knob, key: 'bypass', view: 'action', w: 2, h: 1 }, ctl: { key: 'bypass', kind: 'action', label: 'Bypass', views: ['action'] }, canPin: false, canSwipe: false, swipe: false });
    expect(barParts(one).slice(0, 4)).toEqual(['tag', 'sel-name', 'sel-size', 'sel-remove']);
    const d = arrangeSelection({ item: hdiv, ctl: undefined, canPin: false, canSwipe: false, swipe: false });
    expect(barParts(d).slice(0, 6)).toEqual(['tag', 'sel-name', 'div-label', 'div-rotate', 'sel-remove', 'undo']);
  });
  it('"Add fixed area" only while the board has none', () => {
    expect(barParts(null, true)).toEqual(['tag', 'hint', 'undo', 'add', 'divider', 'close-gaps', 'tidy', 'autopack', 'fixed', 'page', 'done']);
    expect(barParts(null, false)).not.toContain('fixed');
    expect(BAR_DROP.fixed.menu).toBe(true);
    const a = actions();
    const rows = buildBarOverflow(['close-gaps', 'tidy', 'fixed'], { sel: null, canUndo: false, autoPack: false, pageItems: [], page: 'P', target: 'Fixed area', selFixed: false }, a);
    expect(rows.map((r) => [r.id, r.hint])).toEqual([['close-gaps', 'Fixed area'], ['tidy', 'Fixed area'], ['fixed', undefined]]);
    rows[2]!.run();
    expect(a.addFixed).toHaveBeenCalled();
  });
  it('a selection in the fixed area: Remove names it', () => {
    const sel = arrangeSelection({ item: knob, ctl, canPin: false, canSwipe: false, swipe: false });
    const label = (selFixed: boolean) => buildBarOverflow(['sel-remove'], { sel, canUndo: false, autoPack: false, pageItems: [], page: 'P', target: 'P', selFixed }, actions())[0]!.label;
    expect(label(true)).toBe('Remove from the fixed area');
    expect(label(false)).toBe('Remove from page');
  });
});

describe('fitBar: one row, the rest into ⋯', () => {
  const parts = barParts(null);
  const widths = Object.fromEntries(parts.map((p) => [p, 100])) as Record<BarPart, number>;
  const total = parts.length * 100 + (parts.length - 1) * 6;

  it('everything fits: nothing hidden, no ⋯', () => {
    const f = fitBar(total, parts, widths, 6, 30);
    expect(f.hidden.size).toBe(0);
    expect(f.overflow).toEqual([]);
  });

  it('parts go in drop order: the hint and the tag just disappear, tools move into ⋯ (with room for it)', () => {
    const f1 = fitBar(total - 50, parts, widths, 6, 30);
    expect([...f1.hidden]).toEqual(['hint']);
    expect(f1.overflow).toEqual([]);
    const f2 = fitBar(total - 250, parts, widths, 6, 30);
    expect([...f2.hidden]).toEqual(['hint', 'tag', 'autopack']);
    expect(f2.overflow).toEqual(['autopack']);
    // the ⋯ button needs its room too: one more part goes
    const f3 = fitBar(total - 300, parts, widths, 6, 30);
    expect(f3.overflow).toEqual(['tidy', 'autopack']);
  });

  it('Done never goes, the overflow keeps row order, and an unmeasured part counts as nothing', () => {
    const f = fitBar(0, parts, widths, 6, 30);
    expect(f.hidden.has('done')).toBe(false);
    expect(f.overflow).toEqual(parts.filter((p) => p !== 'done' && BAR_DROP[p].menu));
    expect(fitBar(10 + 6 * (parts.length - 1), parts, { done: 10 }, 6, 30).hidden.size).toBe(0);
  });
});

describe('buildBarOverflow', () => {
  it('turns the hidden parts into rows (selection first, then the board) and runs the actions', () => {
    const a = actions();
    const sel = arrangeSelection({ item: knob, ctl, canPin: true, canSwipe: true, swipe: true });
    const pageItems = [{ id: 'head', label: 'P', run: () => {} }];
    const rows = buildBarOverflow(['sel-view', 'sel-size', 'sel-pin', 'sel-swipe', 'sel-remove', 'undo', 'add', 'divider', 'close-gaps', 'tidy', 'autopack', 'page'], { sel, canUndo: false, autoPack: true, pageItems, page: 'P', target: 'P', selFixed: false }, a);
    expect(rows.map((r) => r.id)).toEqual(['view', 'size', 'pin', 'swipe', 'remove', 'undo', 'add', 'hdiv', 'vdiv', 'close-gaps', 'tidy', 'autopack', 'page']);
    expect(rows.find((r) => r.id === 'undo')).toMatchObject({ disabled: true, separatorBefore: true });
    expect(rows.find((r) => r.id === 'swipe')).toMatchObject({ hint: 'on' });
    expect(rows.find((r) => r.id === 'autopack')).toMatchObject({ hint: 'on' });
    expect(rows.find((r) => r.id === 'page')).toMatchObject({ kind: 'submenu', items: pageItems });
    rows.find((r) => r.id === 'view')!.items!.find((r) => r.id === 'view.fader')!.run();
    expect(a.view).toHaveBeenCalledWith('fader');
    rows.find((r) => r.id === 'size')!.items!.find((r) => r.id === 'size.L')!.run();
    expect(a.size).toHaveBeenCalledWith(4, 4);
    rows.find((r) => r.id === 'autopack')!.run();
    expect(a.autoPack).toHaveBeenCalledWith(false);
    rows.find((r) => r.id === 'hdiv')!.run();
    expect(a.divider).toHaveBeenCalledWith('hdiv');
    for (const r of rows) expect(r.className).toMatch(/\bbe-ab-/);
  });

  it('a divider: its label as an inline field and Rotate', () => {
    const a = actions();
    const sel = arrangeSelection({ item: hdiv, ctl: undefined, canPin: false, canSwipe: false, swipe: false });
    const rows = buildBarOverflow(['div-label', 'div-rotate', 'sel-remove'], { sel, canUndo: true, autoPack: false, pageItems: [], page: 'P', target: 'P', selFixed: false }, a);
    expect(rows.map((r) => r.id)).toEqual(['label', 'rotate', 'remove']);
    expect(rows[0]).toMatchObject({ kind: 'input', value: 'Tone' });
    rows[0]!.onSubmit!('Character');
    expect(a.label).toHaveBeenCalledWith('d', 'Character'); // bound to the divider it was built for
    expect(rows[2]!.label).toBe('Remove divider');
  });
});
