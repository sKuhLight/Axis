import { describe, expect, it, vi } from 'vitest';
import type { WorkbenchMenuItem } from '../workbench';
import { BE_PRESETS } from './boardModel';
import { CONT_VIEWS, TOG_VIEWS } from './catalog';
import {
  buildControlMenu,
  placePinTargets,
  rowClass,
  sizeChoices,
  sizeSubmenu,
  swipeRow,
  VIEW_NAME,
  viewSubmenu,
  type ControlMenuActions,
  type ControlMenuState,
  type PinPanelPlace
} from './controlMenu';

const actions = (): ControlMenuActions & Record<string, ReturnType<typeof vi.fn>> =>
  ({
    pinNewTab: vi.fn(),
    modifier: vi.fn(),
    view: vi.fn(),
    size: vi.fn(),
    move: vi.fn(),
    swipe: vi.fn(),
    remove: vi.fn()
  }) as never;

const pinRow = (id: string, label: string, hint: string, run = vi.fn()): WorkbenchMenuItem => ({ id, label, hint, run });
const pinTargets = (): WorkbenchMenuItem[] => [
  pinRow('pin.panel.p1', 'Controls', '2'),
  { ...pinRow('pin.new', 'New custom panel', '+'), separatorBefore: true }
];

const knob = (over: Partial<ControlMenuState> = {}): ControlMenuState => ({
  ctl: { key: 'k1', kind: 'cont', label: 'Bass', views: CONT_VIEWS },
  item: { id: 'i1', view: 'knob', w: 2, h: 2 },
  page: 'Authentic',
  pageOrder: ['Authentic', 'Preamp', 'EQ'],
  pagesWithKey: new Set(['Authentic']),
  canLayout: true,
  pinTargets: pinTargets(),
  newTab: true,
  canSwipe: true,
  swipe: false,
  swipeSupported: true,
  ...over
});

const ids = (rows: WorkbenchMenuItem[]) => rows.map((r) => r.id);
const row = (rows: WorkbenchMenuItem[], id: string) => rows.find((r) => r.id === id)!;

describe('buildControlMenu', () => {
  it('a knob on desktop: header, pin, modifier, view, size, move, swipe, remove', () => {
    const rows = buildControlMenu(knob(), actions());
    expect(ids(rows)).toEqual(['head', 'pin', 'modifier', 'view', 'size', 'move', 'swipe', 'remove']);
    expect(row(rows, 'head')).toMatchObject({ kind: 'header', label: 'Bass · Authentic' });
    // sections: layout, swipe and remove start new groups
    expect(row(rows, 'pin').separatorBefore).toBeFalsy();
    expect(row(rows, 'view').separatorBefore).toBe(true);
    expect(row(rows, 'swipe').separatorBefore).toBe(true);
    expect(row(rows, 'remove')).toMatchObject({ separatorBefore: true, danger: true });
    for (const r of rows) expect(r.className).toMatch(/^be-ci be-ci-/);
  });

  it('pin targets: the workbench panels, "New tab" beside the editor, then "New custom panel"', () => {
    const a = actions();
    const t = pinTargets();
    const pin = row(buildControlMenu(knob({ pinTargets: t }), a), 'pin');
    expect(pin.kind).toBe('submenu');
    expect(pin.items!.map((r) => [r.id, r.label, r.hint])).toEqual([
      ['pin.panel.p1', 'Controls', '2'],
      ['pin.tab', 'New tab beside the editor', '+'],
      ['pin.new', 'New custom panel', '+']
    ]);
    expect(pin.items!.map((r) => !!r.separatorBefore)).toEqual([false, true, false]);
    pin.items![0]!.run();
    expect(t[0]!.run).toHaveBeenCalled();
    pin.items![1]!.run();
    expect(a.pinNewTab).toHaveBeenCalled();
  });

  it('pin targets without a tab stack keep their own grouping; no workbench = no pin row', () => {
    const pin = row(buildControlMenu(knob({ newTab: false }), actions()), 'pin');
    expect(pin.items!.map((r) => [r.id, !!r.separatorBefore])).toEqual([
      ['pin.panel.p1', false],
      ['pin.new', true]
    ]);
    const solo = row(buildControlMenu(knob({ newTab: false, pinTargets: [pinRow('pin.new', 'New custom panel', '+')] }), actions()), 'pin');
    expect(solo.items!.map((r) => [r.id, !!r.separatorBefore])).toEqual([['pin.new', false]]);
    expect(ids(buildControlMenu(knob({ pinTargets: null }), actions()))).not.toContain('pin');
  });

  it('view: the views of the kind as radios, the current one checked; picking it again does nothing', () => {
    const a = actions();
    const view = row(buildControlMenu(knob(), a), 'view');
    expect(view).toMatchObject({ kind: 'submenu', hint: 'Knob' });
    expect(view.items!.map((r) => [r.label, r.kind, r.checked])).toEqual(CONT_VIEWS.map((v) => [VIEW_NAME[v], 'radio', v === 'knob']));
    view.items!.find((r) => r.label === 'Fader')!.run();
    expect(a.view).toHaveBeenCalledWith('fader');
    view.items!.find((r) => r.label === 'Knob')!.run();
    expect(a.view).toHaveBeenCalledTimes(1);
  });

  it('view: a toggle offers button / switch; a select (one view) has no view row', () => {
    const tog = buildControlMenu(knob({ ctl: { key: 'e10', kind: 'toggle', label: 'Bright', views: TOG_VIEWS }, item: { id: 'i2', view: 'switch', w: 2, h: 2 } }), actions());
    expect(row(tog, 'view').items!.map((r) => [r.label, r.checked])).toEqual([
      ['Button', false],
      ['Switch', true]
    ]);
    const sel = buildControlMenu(knob({ ctl: { key: 'e11', kind: 'select', label: 'Input', views: ['select'] }, item: { id: 'i3', view: 'select', w: 2, h: 2 } }), actions());
    expect(ids(sel)).not.toContain('view');
    expect(ids(sel)).toContain('size');
  });

  it('modifier and swipe only for continuous controls', () => {
    const tog = buildControlMenu(knob({ ctl: { key: 'e10', kind: 'toggle', label: 'Bright', views: TOG_VIEWS }, canSwipe: false }), actions());
    expect(ids(tog)).not.toContain('modifier');
    expect(ids(tog)).not.toContain('swipe');
    const a = actions();
    const rows = buildControlMenu(knob(), a);
    row(rows, 'modifier').run();
    expect(a.modifier).toHaveBeenCalled();
  });

  it('size: the presets of the current view, checked when they match; a custom size is listed', () => {
    const a = actions();
    const size = row(buildControlMenu(knob(), a), 'size');
    expect(size.hint).toBe('2×2');
    expect(size.items!.map((r) => [r.label, r.hint, r.checked])).toEqual([
      ['Small', '2×2', true],
      ['Medium', '3×3', false],
      ['Large', '4×4', false]
    ]);
    size.items![2]!.run();
    expect(a.size).toHaveBeenCalledWith(4, 4);
    size.items![0]!.run(); // the current size: nothing to do
    expect(a.size).toHaveBeenCalledTimes(1);
    const custom = row(buildControlMenu(knob({ item: { id: 'i1', view: 'knob', w: 5, h: 5 } }), actions()), 'size');
    expect(custom.items!.map((r) => [r.label, r.hint, r.checked])).toEqual([
      ['Small', '2×2', false],
      ['Medium', '3×3', false],
      ['Large', '4×4', false],
      ['Custom', '5×5', true]
    ]);
  });

  it('move: the other pages; a page that already holds the control is disabled', () => {
    const a = actions();
    const move = row(buildControlMenu(knob({ pagesWithKey: new Set(['Authentic', 'EQ']) }), a), 'move');
    expect(move.items!.map((r) => [r.label, !!r.disabled, r.hint])).toEqual([
      ['Preamp', false, undefined],
      ['EQ', true, 'already there']
    ]);
    move.items![0]!.run();
    expect(a.move).toHaveBeenCalledWith('Preamp');
    const single = row(buildControlMenu(knob({ pageOrder: ['Authentic'] }), actions()), 'move');
    expect(single.disabled).toBe(true);
    expect(single.items).toEqual([]);
  });

  it('swipe control: on / off state and its own class', () => {
    const off = row(buildControlMenu(knob(), actions()), 'swipe');
    expect(off).toMatchObject({ label: 'Grid swipe control', hint: 'off', className: 'be-ci be-ci-swipe' });
    const a = actions();
    const on = row(buildControlMenu(knob({ swipe: true }), a), 'swipe');
    expect(on).toMatchObject({ hint: 'on', className: 'be-ci be-ci-swipe on' });
    on.run();
    expect(a.swipe).toHaveBeenCalled();
  });

  it('swipe control: no row where the editor keeps none (the offline convert buffer, no block family)', () => {
    expect(ids(buildControlMenu(knob({ swipeSupported: false }), actions()))).not.toContain('swipe');
    // a non-continuous control never, whatever it is told
    expect(ids(buildControlMenu(knob({ ctl: { key: 'e10', kind: 'toggle', label: 'Bright', views: TOG_VIEWS } }), actions()))).not.toContain('swipe');
  });

  it('remove', () => {
    const a = actions();
    row(buildControlMenu(knob(), a), 'remove').run();
    expect(a.remove).toHaveBeenCalled();
  });

  it('phone (no Arrange): no view / size / move / remove — pin, modifier and swipe stay', () => {
    const rows = buildControlMenu(knob({ canLayout: false }), actions());
    expect(ids(rows)).toEqual(['head', 'pin', 'modifier', 'swipe']);
    expect(row(rows, 'swipe').separatorBefore).toBe(true);
  });

  it('a tile that is not on the board (search results): no layout rows, header without a page', () => {
    const rows = buildControlMenu(knob({ item: null, page: '' }), actions());
    expect(ids(rows)).toEqual(['head', 'pin', 'modifier', 'swipe']);
    expect(row(rows, 'head').label).toBe('Bass');
  });

  it('nothing to do = no menu (a meter on a phone, or without a workbench)', () => {
    const meter = knob({ ctl: { key: 'meter', kind: 'meter', label: 'Meter', views: ['meter'] }, item: { id: 'm', view: 'meter', w: 2, h: 4 }, pinTargets: null, canSwipe: false });
    expect(buildControlMenu({ ...meter, canLayout: false }, actions())).toEqual([]);
    // on desktop a meter still has size / move / remove
    expect(ids(buildControlMenu(meter, actions()))).toEqual(['head', 'size', 'move', 'remove']);
  });

  it('a graph: its notes under the header (the tooltip does not reach touch); notes alone still open the menu', () => {
    const notes = ['Static curve only (no attack / release).', 'Model knee, drawn medium.'];
    const g = knob({ ctl: { key: 'graph:dynamics', kind: 'graph', label: 'Compressor curve', views: ['graph'] }, item: { id: 'g', view: 'graph', w: 8, h: 4 }, pinTargets: null, canSwipe: false, notes });
    const rows = buildControlMenu(g, actions());
    expect(ids(rows)).toEqual(['head', 'note.0', 'note.1', 'size', 'move', 'remove']);
    expect(row(rows, 'note.0')).toMatchObject({ kind: 'header', label: notes[0], className: 'be-ci be-ci-note' });
    expect(row(rows, 'size').separatorBefore).toBe(true);
    // a phone: nothing to arrange, the notes are the menu
    expect(ids(buildControlMenu({ ...g, canLayout: false }, actions()))).toEqual(['head', 'note.0', 'note.1']);
    expect(buildControlMenu({ ...g, canLayout: false, notes: [] }, actions())).toEqual([]);
  });
});

describe('sizeChoices', () => {
  it('lists every preset of each view, with a custom size last', () => {
    for (const [view, presets] of Object.entries(BE_PRESETS)) {
      const p = presets[0]!;
      const choices = sizeChoices(view as keyof typeof BE_PRESETS, p.w, p.h);
      expect(choices.map((c) => c.label)).toEqual(presets.map((q) => q.label));
      expect(choices.filter((c) => c.checked)).toHaveLength(1);
    }
    expect(sizeChoices('switch', 3, 3).map((c) => [c.label, c.w, c.h, c.checked])).toEqual([
      ['S', 2, 1, false],
      ['M', 2, 2, false],
      [null, 3, 3, true]
    ]);
  });
});

describe('shared rows (the control menu and the Arrange bar’s ⋯)', () => {
  it('View ▸ / Size ▸ / the swipe row carry the given class prefix and run their picks', () => {
    const c = rowClass('be-ab');
    expect(c('swipe', 'on')).toBe('be-ab be-ab-swipe on');
    const view = vi.fn();
    const v = viewSubmenu('knob', CONT_VIEWS, view, c);
    expect(v).toMatchObject({ id: 'view', kind: 'submenu', hint: 'Knob', className: 'be-ab be-ab-view' });
    v.items!.find((r) => r.id === 'view.knob')!.run();
    v.items!.find((r) => r.id === 'view.fader')!.run();
    expect(view.mock.calls).toEqual([['fader']]);
    expect(v.items!.every((r) => r.className === 'be-ab be-ab-view-opt')).toBe(true);
    const size = vi.fn();
    const z = sizeSubmenu('knob', 2, 2, size, rowClass('be-ci'));
    expect(z.items!.map((r) => [r.label, r.checked])).toEqual([
      ['Small', true],
      ['Medium', false],
      ['Large', false]
    ]);
    z.items!.find((r) => r.id === 'size.L')!.run();
    z.items!.find((r) => r.id === 'size.S')!.run();
    expect(size.mock.calls).toEqual([[4, 4]]);
    const toggle = vi.fn();
    const s = swipeRow(true, toggle, c);
    expect(s).toMatchObject({ hint: 'on', className: 'be-ab be-ab-swipe on' });
    s.run();
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});

describe('placePinTargets', () => {
  const rows = (): WorkbenchMenuItem[] => [
    pinRow('pin.panel.a', 'Custom Panel', '0'),
    pinRow('pin.panel.b', 'Custom Panel', '2'),
    pinRow('pin.panel.c', 'Controls', '1'),
    pinRow('pin.panel.d', 'Drums', '3'),
    { ...pinRow('pin.new', 'New custom panel', '+'), separatorBefore: true }
  ];
  const places: Record<string, PinPanelPlace> = {
    a: { kind: 'here', region: 'top' },
    b: { kind: 'page', page: 'Stage' },
    c: { kind: 'here', region: 'right' },
    d: { kind: 'parked' }
  };
  it('a panel elsewhere says where it is; a panel here with its own name keeps the plain count', () => {
    const out = placePinTargets(rows(), (id) => places[id]!);
    expect(out.map((r) => [r.label, r.hint])).toEqual([
      ['Custom Panel', '0 · top'],
      ['Custom Panel', '2 · Stage'],
      ['Controls', '1'],
      ['Drums', '3 · not on a page'],
      ['New custom panel', '+']
    ]);
    // the rows keep their ids, actions and grouping
    expect(out.map((r) => r.id)).toEqual(rows().map((r) => r.id));
    expect(out[4]!.separatorBefore).toBe(true);
  });
  it('two panels of one name on this page: their dock regions (else "this page")', () => {
    const out = placePinTargets(rows().slice(0, 2), (id) => (id === 'a' ? { kind: 'here', region: 'top' } : { kind: 'here' }));
    expect(out.map((r) => r.hint)).toEqual(['0 · top', '2 · this page']);
  });
});
