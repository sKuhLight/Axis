import { describe, it, expect } from 'vitest';
import { buildDeviceLayoutBoard, layoutVariantSig, monitorsByFamily, packRows, type BoardCtl, type SurfaceWidget } from './deviceLayoutBoard';
import type { DeviceLayout, LayoutControl, LayoutWidget } from './types';

// ── catalog builders (mirror ControlSurface's live catalog entries) ──
const knob = (id: number): BoardCtl => ({ key: `k${id}`, kind: 'cont', id, w: 1, h: 1, view: 'knob', views: ['knob', 'fader', 'slider', 'number'] });
const select = (id: number): BoardCtl => ({ key: `e${id}`, kind: 'select', id, w: 2, h: 1, view: 'select', views: ['select'] });
const toggle = (id: number): BoardCtl => ({ key: `e${id}`, kind: 'toggle', id, w: 1, h: 1, view: 'button', views: ['button', 'switch'] });
const EQ: BoardCtl = { key: 'eq', kind: 'eq', id: -1, w: 4, h: 2, view: 'eq', views: ['eq'] };
const BYPASS: BoardCtl = { key: 'bypass', kind: 'action', id: -2, w: 2, h: 1, view: 'action', views: ['action'] };
const METER: BoardCtl = { key: 'meter', kind: 'meter', id: -3, w: 1, h: 2, view: 'meter', views: ['meter'] };

const ctl = (widget: LayoutWidget, paramId: number | null, label = '', extra: Partial<LayoutControl> = {}): LayoutControl => ({
  label,
  paramName: label || null,
  paramId,
  widget,
  ...extra
});

const layout = (pages: DeviceLayout['pages'], extra: Partial<DeviceLayout> = {}): DeviceLayout => ({
  family: 'INPUT',
  pages,
  ...extra
});

const find = (ws: SurfaceWidget[], key: string): SurfaceWidget => ws.find((w) => w.key === key)!;

describe('buildDeviceLayoutBoard — rows + widget mapping', () => {
  const catalog: BoardCtl[] = [knob(0), knob(1), select(4), toggle(9), knob(5), METER, BYPASS];
  const lay = layout([
    {
      name: 'Gate',
      rows: [
        { controls: [ctl('knob', 0, 'Threshold'), ctl('knob', 1, 'Ratio'), ctl('spacer', null), ctl('meter', 8, 'Gain', { rawWidget: 'meterGainVert' })] },
        { controls: [ctl('dropdown', 4, 'Impedance'), ctl('toggle', 9, 'Mode'), ctl('slider', 5, 'Level')] },
        { controls: [ctl('button', 6, 'Bypass', { rawWidget: 'btnBypass' })] }
      ]
    }
  ]);

  it('renders the page as a tab and lays controls left→right, rows top→bottom', () => {
    const board = buildDeviceLayoutBoard(lay, catalog, 12)!;
    expect(board).toBeTruthy();
    expect(board.pageOrder[0]).toBe('Gate');
    const ws = board.boards['Gate'];

    // row 0: knob0 @ x0, knob1 @ x1
    expect(find(ws, 'k0')).toMatchObject({ x: 0, y: 0, row: 0 });
    expect(find(ws, 'k1')).toMatchObject({ x: 1, y: 0, row: 0 });
    // spacer advances the cursor: the meter lands at x3 (not x2)
    expect(find(ws, 'meter')).toMatchObject({ x: 3, y: 0, row: 0 });

    // row 1 sits BELOW the tallest widget of row 0 (the meter is h2 → next row at y2)
    expect(find(ws, 'e4').y).toBe(2);
    expect(find(ws, 'e4')).toMatchObject({ x: 0, row: 1 });
    expect(find(ws, 'e9')).toMatchObject({ x: 2, row: 1 }); // after the w2 select
    expect(find(ws, 'k5')).toMatchObject({ x: 3, row: 1 });

    // row 2 below row 1
    expect(find(ws, 'bypass').y).toBe(3);
    expect(find(ws, 'bypass').row).toBe(2);
  });

  it('maps widget kinds to the right catalog view', () => {
    const ws = buildDeviceLayoutBoard(lay, catalog, 12)!.boards['Gate'];
    expect(find(ws, 'k0').view).toBe('knob'); // knob → knob
    expect(find(ws, 'k5').view).toBe('slider'); // slider → slider view
    expect(find(ws, 'e4').view).toBe('select'); // dropdown (enum) → select
    expect(find(ws, 'e9').view).toBe('switch'); // toggle (2-option enum) → switch
    expect(find(ws, 'meter').view).toBe('meter'); // meter (no live param) → meter catalog entry
    expect(find(ws, 'bypass').view).toBe('action'); // button + btnBypass → bypass action entry
  });

  it('unknown/unmapped widgets fall back to the catalog default (no FM3 regression)', () => {
    const board = buildDeviceLayoutBoard(
      layout([{ name: 'P', rows: [{ controls: [ctl('unknown', 0, 'Threshold')] }] }]),
      [knob(0)],
      12
    )!;
    expect(find(board.boards['P'], 'k0').view).toBe('knob');
  });

  it('meter/bypass are dropped when the block has no such catalog entry (leaves a gap, no crash)', () => {
    const board = buildDeviceLayoutBoard(
      layout([{ name: 'P', rows: [{ controls: [ctl('meter', 8, 'Gain'), ctl('knob', 0, 'Threshold')] }] }]),
      [knob(0)], // no METER entry
      12
    )!;
    // meter had no entry → gap → knob shifts one slot right
    expect(find(board.boards['P'], 'k0')).toMatchObject({ x: 1, y: 0 });
    expect(board.boards['P'].some((w) => w.key === 'meter')).toBe(false);
  });

  it('wraps a control that overflows the remaining columns onto a new grid line', () => {
    const board = buildDeviceLayoutBoard(
      layout([{ name: 'P', rows: [{ controls: [knob(0), knob(1), knob(2)].map((k) => ctl('knob', k.id, `k${k.id}`)) }] }]),
      [knob(0), knob(1), knob(2)],
      2 // only 2 cols → third knob wraps
    )!;
    const ws = board.boards['P'];
    expect(find(ws, 'k0')).toMatchObject({ x: 0, y: 0 });
    expect(find(ws, 'k1')).toMatchObject({ x: 1, y: 0 });
    expect(find(ws, 'k2')).toMatchObject({ x: 0, y: 1 }); // wrapped, still row 0
    expect(find(ws, 'k2').row).toBe(0);
  });

  it('de-duplicates a param listed twice on one page but keeps the slot', () => {
    const board = buildDeviceLayoutBoard(
      layout([{ name: 'P', rows: [{ controls: [ctl('knob', 0, 'A'), ctl('knob', 0, 'A again'), ctl('knob', 1, 'B')] }] }]),
      [knob(0), knob(1)],
      12
    )!;
    const ws = board.boards['P'];
    expect(ws.filter((w) => w.key === 'k0')).toHaveLength(1);
    expect(find(ws, 'k1').x).toBe(2); // dup advanced the cursor
  });
});

describe('buildDeviceLayoutBoard — pages, sweep, variant', () => {
  it('suffixes duplicate page names so the {#each} keys stay unique', () => {
    const board = buildDeviceLayoutBoard(
      layout([
        { name: 'Gate', rows: [{ controls: [ctl('knob', 0, 'A')] }] },
        { name: 'Gate', rows: [{ controls: [ctl('knob', 1, 'B')] }] }
      ]),
      [knob(0), knob(1)],
      12
    )!;
    expect(board.pageOrder).toEqual(['Gate', 'Gate 2']);
  });

  it('sweeps catalog controls the layout never referenced onto a trailing "More" page', () => {
    const board = buildDeviceLayoutBoard(
      layout([{ name: 'Gate', rows: [{ controls: [ctl('knob', 0, 'A')] }] }]),
      [knob(0), knob(99)], // k99 unreferenced
      12
    )!;
    expect(board.pageOrder).toEqual(['Gate', 'More']);
    expect(board.boards['More'].map((w) => w.key)).toEqual(['k99']);
  });

  it('returns null when no page has a renderable control (caller uses its heuristic board)', () => {
    expect(buildDeviceLayoutBoard(layout([{ name: 'P', rows: [{ controls: [ctl('spacer', null)] }] }]), [knob(0)], 12)).toBeNull();
    expect(buildDeviceLayoutBoard(null, [knob(0)], 12)).toBeNull();
    expect(buildDeviceLayoutBoard(layout([]), [knob(0)], 12)).toBeNull();
  });

  it('stamps a variantSig that changes with the served variant (drives Default re-seed)', () => {
    const pages = [{ name: 'P', rows: [{ controls: [ctl('knob', 0, 'A')] }] }] as DeviceLayout['pages'];
    const a = buildDeviceLayoutBoard(layout(pages, { variantName: 'Type', variantValue: 'A' }), [knob(0)], 12)!;
    const b = buildDeviceLayoutBoard(layout(pages, { variantName: 'Type', variantValue: 'B' }), [knob(0)], 12)!;
    expect(a.variantSig).not.toBe(b.variantSig);
    expect(a.variantSig).toBe(layoutVariantSig(layout(pages, { variantName: 'Type', variantValue: 'A' })));
    expect(layoutVariantSig(null)).toBe('');
  });
});

describe('packRows — row-preserving responsive reflow', () => {
  it('re-lays each source row on its own grid line, wrapping within the row', () => {
    // three widgets on row 0, one on row 1; narrow to 2 cols
    const widgets = [
      { id: 'a', key: 'k0', x: 0, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
      { id: 'b', key: 'k1', x: 1, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
      { id: 'c', key: 'k2', x: 2, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
      { id: 'd', key: 'k3', x: 0, y: 1, w: 1, h: 1, view: 'knob', row: 1 }
    ];
    const out = packRows(widgets, 2);
    const at = (id: string) => out.find((w) => w.id === id)!;
    expect(at('a')).toMatchObject({ x: 0, y: 0 });
    expect(at('b')).toMatchObject({ x: 1, y: 0 });
    expect(at('c')).toMatchObject({ x: 0, y: 1 }); // wrapped within row 0 onto a new line
    expect(at('d').y).toBe(2); // row 1 starts strictly below everything from row 0
  });
});

// ── monitors (read-only meters) ──────────────────────────────────────────────
// The device surfaces some MONITORS in the ordinary block param list too (amp `HEADROOM`/`B+`/`Gain`,
// cab `VU`/gain, comp/input/output `Gain`), where they used to resolve to editable knobs/steppers.
const meterH = (pid: number): BoardCtl => ({ key: `m${pid}`, kind: 'meterH', id: pid, w: 4, h: 1, view: 'meterH', views: ['meterH'] });

describe('monitorsByFamily — pid scoping', () => {
  // Shape mirrors GET /preset/monitors.
  const table = {
    INPUT_GAINMONITOR: { family: 'INPUT', pid: 8, role: 'level', minDb: -60, maxDb: 0, widgetConfirmed: true },
    DISTORT_VCCMON: { family: 'DISTORT', pid: 120, role: 'supply', widgetConfirmed: true },
    DISTORT_VPLATEMON: { family: 'DISTORT', pid: 132, role: 'headroom', minDb: -20, maxDb: 0, widgetConfirmed: true },
    CABINET_VUMETER: { family: 'CABINET', pid: 61, role: 'vu', minDb: -40, maxDb: 20, widgetConfirmed: true }
  };

  it('returns only the requested family, keyed by pid, carrying the device token', () => {
    const m = monitorsByFamily(table, 'DISTORT');
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([120, 132]);
    expect(m.get(132)!.token).toBe('DISTORT_VPLATEMON');
    expect(m.get(132)!.role).toBe('headroom');
  });

  // THE regression that matters: pids repeat across families. Amp pid 8 is `Bass 1`; INPUT pid 8 is a
  // level monitor. A pid-only match would render Bass as a read-only meter.
  it('does NOT leak another family pid (amp pid 8 is `Bass 1`, not INPUT_GAINMONITOR)', () => {
    expect(monitorsByFamily(table, 'DISTORT').has(8)).toBe(false);
    expect(monitorsByFamily(table, 'INPUT').has(8)).toBe(true);
    // pid 61 is CABINET_VUMETER in CABINET but `Freq 1` in the delay block.
    expect(monitorsByFamily(table, 'DELAY').has(61)).toBe(false);
  });

  it('is empty for an unknown family or a missing table', () => {
    expect(monitorsByFamily(table, 'REVERB').size).toBe(0);
    expect(monitorsByFamily(null, 'DISTORT').size).toBe(0);
    expect(monitorsByFamily(table, null).size).toBe(0);
  });

  it('keeps a null dB range intact (5 of 16 monitors report none)', () => {
    const supply = monitorsByFamily(table, 'DISTORT').get(120)!;
    expect(supply.minDb).toBeUndefined();
    expect(supply.maxDb).toBeUndefined();
  });
});

describe('buildDeviceLayoutBoard — monitor pids resolve to meters, not knobs', () => {
  const authentic = (controls: LayoutControl[]) =>
    layout([{ name: 'Authentic', rows: [{ controls }] }], { family: 'DISTORT' });

  it('prefers the meterH entry over a same-pid knob entry', () => {
    // amp HEADROOM: pid 132 is BOTH a named param (min 0 / max 1) and DISTORT_VPLATEMON.
    const board = buildDeviceLayoutBoard(authentic([ctl('readout', 132, 'HEADROOM')]), [knob(132), meterH(132), BYPASS], 12)!;
    const ws = board.boards['Authentic'];
    expect(find(ws, 'm132').view).toBe('meterH');
    expect(ws.some((w) => w.key === 'k132')).toBe(false);
  });

  it('routes the `meter` hint the same way (cab VU, comp gain reduction)', () => {
    const board = buildDeviceLayoutBoard(authentic([ctl('meter', 120, 'B+')]), [knob(120), meterH(120), BYPASS], 12)!;
    expect(find(board.boards['Authentic'], 'm120').view).toBe('meterH');
  });

  it('gives the meter its wide/short footprint instead of the knob 1x1', () => {
    const board = buildDeviceLayoutBoard(authentic([ctl('readout', 132, 'HEADROOM')]), [knob(132), meterH(132), BYPASS], 12)!;
    const w = find(board.boards['Authentic'], 'm132');
    expect([w.w, w.h]).toEqual([4, 1]);
  });

  it('leaves an ordinary param a knob when the block has no monitor for that pid', () => {
    // Same pid 8 as INPUT_GAINMONITOR, but the amp catalog carries no `m8` — must stay editable.
    const board = buildDeviceLayoutBoard(authentic([ctl('knob', 8, 'Bass 1')]), [knob(8), meterH(132), BYPASS], 12)!;
    expect(find(board.boards['Authentic'], 'k8').view).toBe('knob');
  });
});

describe('buildDeviceLayoutBoard — graphic-EQ band collapse', () => {
  const GEQ: BoardCtl = { key: 'geq', kind: 'geq', id: -5, w: 8, h: 2, view: 'geq', views: ['geq'] };
  const bandIds = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const lay = layout([
    {
      name: 'EQ',
      rows: [
        { controls: [...[...bandIds].map((id) => ctl('slider', id, `${id * 100}`))] },
        { controls: [ctl('knob', 20, 'Balance'), ctl('knob', 21, 'Level')] }
      ]
    }
  ]);
  // ControlSurface suppresses the band params from the catalog and offers `geq` in their place.
  const catalog: BoardCtl[] = [GEQ, knob(20), knob(21), BYPASS];

  it('collapses a row of band sliders into one bank widget', () => {
    const ws = buildDeviceLayoutBoard(lay, catalog, 12, bandIds)!.boards['EQ'];
    expect(ws.filter((w) => w.key === 'geq')).toHaveLength(1);
    expect(find(ws, 'geq')).toMatchObject({ x: 0, y: 0, w: 8, h: 2, view: 'geq', row: 0 });
  });

  it('leaves the non-band controls of later rows intact', () => {
    const ws = buildDeviceLayoutBoard(lay, catalog, 12, bandIds)!.boards['EQ'];
    expect(find(ws, 'k20')).toMatchObject({ row: 1 });
    expect(find(ws, 'k21')).toMatchObject({ row: 1 });
    expect(ws.some((w) => w.key === 'k0')).toBe(false);
  });

  it("re-pack closes the collapsed bands' column advances", () => {
    const ws = packRows(buildDeviceLayoutBoard(lay, catalog, 12, bandIds)!.boards['EQ'], 12);
    expect(find(ws, 'geq')).toMatchObject({ x: 0, y: 0 });
    expect(find(ws, 'k20')).toMatchObject({ x: 0, y: 2 });
    expect(find(ws, 'k21')).toMatchObject({ x: 1, y: 2 });
  });

  it('without band ids the sliders resolve normally (no bank)', () => {
    const plain: BoardCtl[] = [knob(0), knob(1), knob(20)];
    const ws = buildDeviceLayoutBoard(lay, plain, 12)!.boards['EQ'];
    expect(find(ws, 'k0')).toMatchObject({ x: 0, view: 'slider' });
    expect(ws.some((w) => w.key === 'geq')).toBe(false);
  });
});

describe('buildDeviceLayoutBoard — response graph slots', () => {
  const EQ2: BoardCtl = { key: 'eq2', kind: 'eq', id: -1, w: 4, h: 2, view: 'eq', views: ['eq'] };
  const lay = layout([
    { name: 'Input EQ', rows: [{ controls: [ctl('knob', 0, 'Frequency'), ctl('graph', null, 'Graph', { rawWidget: 'graph4' })] }] },
    { name: 'Speaker', rows: [{ controls: [ctl('knob', 1, 'LF Res Freq'), ctl('graph', null, 'Graph', { rawWidget: 'graph4' })] }] }
  ]);
  const catalog: BoardCtl[] = [knob(0), knob(1), EQ, EQ2, BYPASS];
  const perPage = (page: number) => ['eq', 'eq2'][page] ?? null;

  it('resolves each page graph slot to that page own graph', () => {
    const b = buildDeviceLayoutBoard(lay, catalog, 12, new Set(), perPage)!;
    expect(find(b.boards['Input EQ'], 'eq')).toBeTruthy();
    expect(b.boards['Input EQ'].some((w) => w.key === 'eq2')).toBe(false);
    expect(find(b.boards['Speaker'], 'eq2')).toBeTruthy();
  });

  it('gaps the slot when the page has no graph (the default)', () => {
    const b = buildDeviceLayoutBoard(lay, catalog, 12)!;
    expect(b.boards['Input EQ'].some((w) => w.key.startsWith('eq'))).toBe(false);
  });

  it('gaps the slot when the named graph is not in the catalog', () => {
    const b = buildDeviceLayoutBoard(lay, [knob(0), knob(1), BYPASS], 12, new Set(), perPage)!;
    expect(b.boards['Input EQ'].some((w) => w.key.startsWith('eq'))).toBe(false);
  });
});
