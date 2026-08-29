import { describe, it, expect } from 'vitest';
import { buildDeviceLayoutBoard, layoutVariantSig, railControls, monitorsByFamily, packInto, packRows, repackWidgets, MAX_ROWS, type BoardCtl, type SurfaceWidget } from './deviceLayoutBoard';
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

describe('railControls — the block-level rail for layouts with no `mixer` section', () => {
  const page = (name: string, ids: number[], section = 'parameters') => ({
    name,
    rows: [{ section, controls: ids.map((id) => ctl('knob', id, `P${id}`)) }]
  });

  it('returns the controls present on every page (the FILTER shape)', () => {
    // Filter's two pages: per-page knobs differ, the block-level six repeat verbatim.
    const rail = railControls(
      layout([page('Filter', [10, 11, 20, 21, 22, 23]), page('Modifiers', [12, 13, 20, 21, 22, 23])])
    );
    expect([...rail].sort((a, b) => a - b)).toEqual([20, 21, 22, 23]);
  });

  it('defers to the `mixer` section when the layout tags one (the AMP/CAB/REVERB shape)', () => {
    // GATE is the reason this matters: it repeats THRESH/RATIO/ATTACK on every page, so the
    // intersection would sweep real page parameters into the rail. It tags its mixer rows, so it
    // never takes this path.
    const gate = layout([
      { name: 'Gate 1', rows: [{ section: 'parameters', controls: [ctl('knob', 1, 'Thresh'), ctl('knob', 2, 'Ratio')] }, { section: 'mixer', controls: [ctl('knob', 9, 'Level')] }] },
      { name: 'Gate 2', rows: [{ section: 'parameters', controls: [ctl('knob', 1, 'Thresh'), ctl('knob', 2, 'Ratio')] }, { section: 'mixer', controls: [ctl('knob', 9, 'Level')] }] }
    ]);
    expect(railControls(gate).size).toBe(0);
  });

  it('returns nothing for a single-page block (PEQ, Tremolo, GEQ… keep the current layout)', () => {
    expect(railControls(layout([page('PEQ', [1, 2, 3])])).size).toBe(0);
  });

  it('returns nothing when the pages share no control at all', () => {
    expect(railControls(layout([page('A', [1, 2]), page('B', [3, 4])])).size).toBe(0);
  });

  it('tags the intersection as rail widgets on every page', () => {
    const catalog: BoardCtl[] = [knob(10), knob(12), knob(20), knob(21)];
    const board = buildDeviceLayoutBoard(
      layout([page('One', [10, 20, 21]), page('Two', [12, 20, 21])]),
      catalog,
      12
    )!;
    for (const name of ['One', 'Two']) {
      const ws = board.boards[name]!;
      expect(find(ws, 'k20').rail).toBe(true);
      expect(find(ws, 'k21').rail).toBe(true);
    }
    expect(find(board.boards['One']!, 'k10').rail).toBeUndefined();
    expect(find(board.boards['Two']!, 'k12').rail).toBeUndefined();
  });
});

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
    expect(a.variantSig).toMatch(/^b7\|/);
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

  // Regression for the PEQ scramble: the device reports ALL band controls as ONE editor row (verified
  // live: Freq1,Type1,Gain1,Slope1,Q1,S1 | Freq2,... in a single `row 0`). That row doesn't fit the
  // build-time column count, so buildDeviceLayoutBoard wraps it onto several internal grid lines — still
  // tagged `row: 0`, `y` increasing per wrap, `x` resetting to 0 each time. A re-pack at a DIFFERENT
  // column count must reconstruct the original band order, not interleave "1st item of every wrapped
  // line" together (the old `sort by x only` bug).
  it('re-packs a source row that itself wrapped at build time back into its original order', () => {
    const catalog: BoardCtl[] = [knob(0), knob(1), knob(2), knob(3), knob(4), knob(5)];
    const oneRow = layout([{ name: 'P', rows: [{ controls: [0, 1, 2, 3, 4, 5].map((id) => ctl('knob', id, `k${id}`)) }] }]);
    // built at 2 cols: k0,k1 wrap onto line y0; k2,k3 onto y1; k4,k5 onto y2 — all still `row: 0`
    const built = buildDeviceLayoutBoard(oneRow, catalog, 2)!.boards['P'];
    expect(built.map((w) => [w.key, w.x, w.y])).toEqual([
      ['k0', 0, 0],
      ['k1', 1, 0],
      ['k2', 0, 1],
      ['k3', 1, 1],
      ['k4', 0, 2],
      ['k5', 1, 2]
    ]);
    // re-pack wide enough for one line (6 cols): must come back out in original build order k0..k5
    const wide = packRows(built, 6);
    expect(wide.map((w) => w.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
    expect(wide.map((w) => w.x)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('wraps a band set as a unit instead of stranding half of it on the previous line', () => {
    // three 2-wide bands on one source row, 5 columns: band 2 would straddle the wrap if placed control
    // by control (x=4 has room for `a2` but not `b2`), so the whole set must move down together.
    const band = (i: number): SurfaceWidget[] => [
      { id: `a${i}`, key: `ka${i}`, x: 0, y: 0, w: 1, h: 1, view: 'knob', row: 0, group: i },
      { id: `b${i}`, key: `kb${i}`, x: 0, y: 0, w: 1, h: 1, view: 'knob', row: 0, group: i }
    ];
    const out = packRows([...band(1), ...band(2), ...band(3)], 3);
    const at = (id: string) => out.find((w) => w.id === id)!;
    expect([at('a1').y, at('b1').y]).toEqual([0, 0]);
    expect([at('a2').y, at('b2').y]).toEqual([1, 1]); // whole band on the next line, not split
    expect([at('a3').y, at('b3').y]).toEqual([2, 2]);
  });

  it('falls back to per-control wrapping for a set too wide to keep whole', () => {
    const wide: SurfaceWidget[] = [0, 1, 2].map((i) => ({ id: `w${i}`, key: `k${i}`, x: i, y: 0, w: 1, h: 1, view: 'knob', row: 0, group: 7 }));
    const out = packRows(wide, 2);
    expect(out.map((w) => [w.x, w.y])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1]
    ]);
  });
});

// Regression for the PEQ band split: the device reports every band's controls as ONE editor row
// (`Frequency 1, Type 1, Gain 1, Q1, S1, <graph>, Frequency 2, …`). The band index lives in the device
// symbol, so adjacent controls sharing it are one set and must never straddle a line break.
describe('buildDeviceLayoutBoard — band sets stay together', () => {
  // 5 bands × (freq knob, 2-wide type select, gain knob, q knob) = 5 columns per band
  const bandCtls = (i: number): LayoutControl[] => [
    ctl('knob', i * 10 + 1, `Frequency ${i}`, { paramName: `PEQ_FREQ${i}` }),
    ctl('dropdown', i * 10 + 2, `Type ${i}`, { paramName: `PEQ_TYPE${i}` }),
    ctl('knob', i * 10 + 3, `Gain ${i}`, { paramName: `PEQ_GAIN${i}` }),
    ctl('knob', i * 10 + 4, `Q${i}`, { paramName: `PEQ_Q${i}` })
  ];
  const bandCatalog = (i: number): BoardCtl[] => [knob(i * 10 + 1), select(i * 10 + 2), knob(i * 10 + 3), knob(i * 10 + 4)];
  const bands = [1, 2, 3, 4, 5];
  const peq = layout([{ name: 'PEQ', rows: [{ controls: bands.flatMap(bandCtls) }] }], { family: 'PEQ' });
  const catalog = bands.flatMap(bandCatalog);
  /** grid line each band's four controls landed on — one entry per band, must be a single value each */
  const linesPerBand = (ws: SurfaceWidget[]) =>
    bands.map((i) => [...new Set(bandCtls(i).map((c) => ws.find((w) => w.key === `k${c.paramId}` || w.key === `e${c.paramId}`)!.y))]);

  it('never splits a band across a wrap at build time (12 cols fits 2 bands + change)', () => {
    const ws = buildDeviceLayoutBoard(peq, catalog, 12)!.boards['PEQ'];
    expect(linesPerBand(ws)).toEqual([[0], [0], [1], [1], [2]]);
  });

  it('never splits a band across a wrap on responsive re-pack', () => {
    const built = buildDeviceLayoutBoard(peq, catalog, 26)!.boards['PEQ']; // all five bands on one line
    expect(linesPerBand(built)).toEqual([[0], [0], [0], [0], [0]]);
    for (const cols of [7, 9, 11, 13, 17, 21]) {
      const ws = packRows(built, cols);
      // every band occupies exactly one grid line, and band order is preserved
      expect(linesPerBand(ws).map((ls) => ls.length)).toEqual([1, 1, 1, 1, 1]);
      expect(linesPerBand(ws).flat()).toEqual([...linesPerBand(ws).flat()].sort((a, b) => a - b));
    }
  });
});

describe('repackWidgets — router between packRows and packInto', () => {
  // the PEQ band case: three source rows of mixed-width widgets (2-wide dropdown among 1-wide knobs)
  // overflowing 4 cols — packInto's gravity-fill interleaves these across rows; packRows must not.
  const bandRows = [
    { id: 'a', key: 'k0', x: 0, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
    { id: 'b', key: 'k1', x: 1, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
    { id: 'c', key: 'e2', x: 2, y: 0, w: 2, h: 1, view: 'select', row: 0 },
    { id: 'd', key: 'k3', x: 4, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
    { id: 'e', key: 'k4', x: 0, y: 1, w: 1, h: 1, view: 'knob', row: 1 },
    { id: 'f', key: 'k5', x: 1, y: 1, w: 1, h: 1, view: 'knob', row: 1 }
  ];

  it('row-tagged mixed-width widgets overflowing cols: each source row stays contiguous and in order', () => {
    const out = repackWidgets(bandRows, 4);
    const at = (id: string) => out.find((w) => w.id === id)!;
    // row 0 wraps within itself (4 widgets, widths 1/1/2/1 = 5 > 4 cols) but never crosses into row 1's band
    expect(at('a')).toMatchObject({ x: 0, y: 0 });
    expect(at('b')).toMatchObject({ x: 1, y: 0 });
    expect(at('c')).toMatchObject({ x: 2, y: 0 });
    expect(at('d')).toMatchObject({ x: 0, y: 1 }); // wrapped, still source row 0
    // source row 1 starts on a fresh grid line below all of row 0's wrapped lines
    expect(at('e').y).toBe(2);
    expect(at('f')).toMatchObject({ x: 1, y: 2 });
    expect(out).toEqual(packRows(bandRows, 4)); // routed to packRows, not packInto
  });

  it('untagged widgets: output identical to packInto(list, cols, MAX_ROWS) — free-arranged path unchanged', () => {
    const free: SurfaceWidget[] = [
      { id: 'a', key: 'k0', x: 3, y: 2, w: 1, h: 1, view: 'knob' },
      { id: 'b', key: 'k1', x: 0, y: 0, w: 2, h: 1, view: 'knob' },
      { id: 'c', key: 'k2', x: 5, y: 5, w: 1, h: 1, view: 'knob' }
    ];
    expect(repackWidgets(free, 4)).toEqual(packInto(free, 4, MAX_ROWS));
  });

  it('mixed (some tagged, some not): routes to packRows, untagged land in the trailing single column', () => {
    const mixed: SurfaceWidget[] = [
      { id: 'a', key: 'k0', x: 0, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
      { id: 'b', key: 'k1', x: 1, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
      { id: 'c', key: 'k2', x: 0, y: 5, w: 1, h: 1, view: 'knob' } // no row — free-arranged extra
    ];
    const out = repackWidgets(mixed, 4);
    expect(out).toEqual(packRows(mixed, 4));
    // matches packRows' own documented behaviour: untagged widgets trail at x0, stacked below the rows
    expect(out.find((w) => w.id === 'c')).toMatchObject({ x: 0 });
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

  it('addresses multiple graph slots on one page independently', () => {
    const two = layout([{ name: 'Controllers', rows: [{ controls: [ctl('graph', null, 'Graph'), ctl('graph', null, 'Graph')] }] }]);
    const b = buildDeviceLayoutBoard(two, [EQ, EQ2], 12, new Set(), (_page, slot) => ['eq', 'eq2'][slot] ?? null)!;
    expect(b.boards['Controllers'].map((w) => w.key)).toEqual(['eq', 'eq2']);
  });
});

describe('buildDeviceLayoutBoard — device-authored columns (placement.col)', () => {
  const at = (col: number) => ({ placement: { col } });
  const catalog: BoardCtl[] = [knob(7), knob(8), knob(9), knob(10), knob(26), knob(22), knob(11), knob(41), knob(49), knob(38), knob(90), knob(82), knob(35)];

  const build = (controls: LayoutControl[], cols = 12) =>
    buildDeviceLayoutBoard(layout([{ name: 'Authentic', rows: [{ controls }] }]), catalog, cols)!.boards['Authentic']!;

  it('honours a deliberate hole: Master Volume at col 8 leaves col 7 empty', () => {
    // amp Authentic row 0 verbatim: cols [0,1,2,3,4,5,6,8,null]
    const ws = build([
      ctl('knob', 7, 'Gain', at(0)),
      ctl('knob', 8, 'Bass', at(2)),
      ctl('knob', 9, 'Mid', at(3)),
      ctl('knob', 10, 'Treble', at(4)),
      ctl('knob', 26, 'Presence', at(5)),
      ctl('knob', 22, 'Depth', at(6)),
      ctl('knob', 11, 'Master Volume', at(8))
    ]);
    expect(find(ws, 'k7').x).toBe(0);
    expect(find(ws, 'k22').x).toBe(6);
    expect(find(ws, 'k11').x).toBe(8);
    expect(ws.some((w) => w.x === 7)).toBe(false); // the gap the device asked for survives
  });

  it('array order is NOT visual order — col wins', () => {
    // amp Authentic row 1 verbatim: Bright arrives FIRST but sits at col 4; Input Trim at col 0.
    const ws = build([ctl('toggle', 41, 'Bright', at(4)), ctl('knob', 49, 'Input Trim', at(0))]);
    expect(find(ws, 'k49').x).toBe(0);
    expect(find(ws, 'k41').x).toBe(4);
  });

  it('aligns a partial row under the row above it (Cathode Follower case)', () => {
    // amp "Pwr Tubes + CF": row 0 cols [null,0,1,2,3,4,5]; row 1 cols [null,3,4].
    // The leading nulls are decorative labels — they must NOT consume col 0 and shove the row right.
    const b = buildDeviceLayoutBoard(
      layout([
        {
          name: 'CF',
          rows: [
            { controls: [ctl('label', null, 'POWER TUBES'), ctl('knob', 38, 'Grid Bias', at(0)), ctl('knob', 90, 'Hardness', at(1))] },
            { controls: [ctl('label', null, 'CATHODE FOLLOWER'), ctl('knob', 82, 'Compression', at(3)), ctl('knob', 35, 'Harmonics', at(4))] }
          ]
        }
      ]),
      catalog,
      12
    )!.boards['CF']!;
    expect(find(b, 'k38').x).toBe(0);
    expect(find(b, 'k82').x).toBe(3);
    expect(find(b, 'k35').x).toBe(4);
    expect(find(b, 'k82').y).toBeGreaterThan(find(b, 'k38').y); // still its own row
  });

  it('an un-authored control anchors after the last authored column, not at 0', () => {
    const ws = build([ctl('knob', 7, 'Gain', at(0)), ctl('knob', 8, 'Bass', at(4)), ctl('knob', 9, 'Trailing')]);
    expect(find(ws, 'k8').x).toBe(4);
    expect(find(ws, 'k9').x).toBe(5);
  });

  it('shifts right rather than overlapping when a wide widget occupies an authored column', () => {
    // Axis dropdowns are 2 cells wide; the editor grid is one control per column.
    const wide: BoardCtl[] = [select(4), knob(8)];
    const b = buildDeviceLayoutBoard(
      layout([{ name: 'P', rows: [{ controls: [ctl('dropdown', 4, 'Type', at(0)), ctl('knob', 8, 'Bass', at(1))] }] }]),
      wide,
      12
    )!.boards['P']!;
    expect(find(b, 'e4').x).toBe(0);
    expect(find(b, 'k8').x).toBe(2); // not 1 — e4 spans 0..1
  });

  it('falls back to flow when the authored extent cannot fit the pane', () => {
    const ws = build([ctl('knob', 7, 'Gain', at(0)), ctl('knob', 11, 'Master Volume', at(8))], 4);
    expect(find(ws, 'k7').x).toBe(0);
    expect(find(ws, 'k11').x).toBe(1); // flowed, never overflowing 4 columns
    expect(ws.every((w) => w.x + w.w <= 4)).toBe(true);
  });

  it('a row with no authored column anywhere is byte-identical to the flow path', () => {
    const controls = [ctl('knob', 7, 'Gain'), ctl('knob', 8, 'Bass'), ctl('knob', 9, 'Mid')];
    expect(build(controls)).toEqual([
      { id: 'wk7', key: 'k7', x: 0, y: 0, w: 1, h: 1, view: 'knob', row: 0, group: 1 },
      { id: 'wk8', key: 'k8', x: 1, y: 0, w: 1, h: 1, view: 'knob', row: 0, group: 2 },
      { id: 'wk9', key: 'k9', x: 2, y: 0, w: 1, h: 1, view: 'knob', row: 0, group: 3 }
    ]);
  });

  it('packRows replays authored columns exactly instead of re-flowing them', () => {
    const ws = build([ctl('knob', 7, 'Gain', at(0)), ctl('knob', 11, 'Master Volume', at(8))]);
    expect(packRows(ws, 12)).toEqual(ws);
  });

  it('packRows falls back to flow when the pane can no longer fit the authored extent', () => {
    const ws = build([ctl('knob', 7, 'Gain', at(0)), ctl('knob', 11, 'Master Volume', at(8))]);
    const narrow = packRows(ws, 4);
    expect(narrow.map((w) => w.x)).toEqual([0, 1]);
    expect(narrow.every((w) => w.x + w.w <= 4)).toBe(true);
  });
});

describe('buildDeviceLayoutBoard — the mixer strip is one row', () => {
  const catalog: BoardCtl[] = [knob(1), knob(2), knob(28), BYPASS];

  // cab "Cab" page verbatim: the device splits its mixer across two rows for a fixed-width canvas.
  const b = buildDeviceLayoutBoard(
    layout([
      {
        name: 'Cab',
        rows: [
          { section: 'parameters', controls: [ctl('knob', 1, 'Level 1')] },
          { section: 'mixer', controls: [ctl('knob', 28, 'Level 3')] },
          { section: 'mixer', controls: [ctl('knob', 2, 'Balance'), ctl('button', 6, 'Bypass', { rawWidget: 'btnBypass' })] }
        ]
      }
    ]),
    catalog,
    12
  )!.boards['Cab']!;

  it('coalesces consecutive mixer rows onto one grid line', () => {
    expect(find(b, 'k28').y).toBe(find(b, 'k2').y);
    expect(find(b, 'k28').row).toBe(find(b, 'k2').row);
    expect(find(b, 'k28').x).toBe(0);
    expect(find(b, 'k2').x).toBe(1);
  });

  it('keeps the strip below the parameters row it follows', () => {
    expect(find(b, 'k28').y).toBeGreaterThan(find(b, 'k1').y);
  });

  it('tags the strip widgets and leaves parameter widgets untagged', () => {
    expect(find(b, 'k28').rail).toBe(true);
    expect(find(b, 'bypass').rail).toBe(true);
    expect(find(b, 'k1').rail).toBeUndefined();
  });

  it('does not merge mixer rows that are not adjacent', () => {
    const split = buildDeviceLayoutBoard(
      layout([
        {
          name: 'P',
          rows: [
            { section: 'mixer', controls: [ctl('knob', 28, 'Level 3')] },
            { section: 'parameters', controls: [ctl('knob', 1, 'Level 1')] },
            { section: 'mixer', controls: [ctl('knob', 2, 'Balance')] }
          ]
        }
      ]),
      catalog,
      12
    )!.boards['P']!;
    expect(find(split, 'k28').row).not.toBe(find(split, 'k2').row);
  });
});
