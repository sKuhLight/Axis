import { describe, it, expect } from 'vitest';
import {
  buildDeviceLayoutBoard,
  layoutVariantSig,
  healBoardWithLayout,
  railControls,
  monitorsByFamily,
  packInto,
  packRows,
  repackWidgets,
  MAX_ROWS,
  parsePositionExact,
  clusterByCanvasRow,
  groupSectionLabels,
  type BoardCtl,
  type SurfaceWidget,
  type SurfaceBoard
} from './deviceLayoutBoard';
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

/** No two (non-rail) widgets on a board share a grid cell — rail widgets render in their own fixed
 *  sidebar zone, entirely outside this grid, so their x/y are irrelevant here. This is the actual
 *  regression check for the `positionExact` placement bugs (HEADROOM/Cab-cluster/Align-page cards
 *  literally overlapping other controls) — every fixture that carries `positionExact` controls asserts it. */
const assertNoOverlap = (ws: SurfaceWidget[]) => {
  const seen = new Set<string>();
  for (const w of ws) {
    if (w.rail) continue;
    for (let y = w.y; y < w.y + w.h; y++)
      for (let x = w.x; x < w.x + w.w; x++) {
        const key = `${x},${y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
  }
};

describe('healBoardWithLayout — self-heals a saved board against the current device layout', () => {
  const w = (key: string, x: number, y: number, wid = 1, h = 1): SurfaceWidget => ({ id: `w${key}`, key, x, y, w: wid, h, view: 'knob' });

  it('adds a widget the fresh layout has but the saved board is missing (a param reclassified knob -> toggle, e.g. Zoom)', () => {
    // saved board predates a server-side classification fix: paramId 40 used to resolve to a knob (`k40`)
    // and reconcile() already dropped it once the catalog stopped serving that key — the fresh layout now
    // places it as `e40` (a toggle) instead.
    const saved: SurfaceBoard = { pageOrder: ['Align'], page: 'Align', boards: { Align: [w('k16', 0, 0), w('k17', 1, 0)] } };
    const fresh: SurfaceBoard = { pageOrder: ['Align'], page: 'Align', boards: { Align: [w('k16', 0, 0), w('k17', 1, 0), w('e40', 2, 0)] } };
    const healed = healBoardWithLayout(saved, fresh, 8, 4);
    expect(healed.boards.Align.map((x) => x.key).sort()).toEqual(['e40', 'k16', 'k17']);
    // existing widgets keep their exact saved position — healing never reflows them
    expect(find(healed.boards.Align, 'k16')).toMatchObject({ x: 0, y: 0 });
    expect(find(healed.boards.Align, 'k17')).toMatchObject({ x: 1, y: 0 });
    assertNoOverlap(healed.boards.Align);
  });

  it('appends a page the saved board never had, when everything the fresh layout puts there is new', () => {
    const saved: SurfaceBoard = { pageOrder: ['Main'], page: 'Main', boards: { Main: [w('k1', 0, 0)] } };
    const fresh: SurfaceBoard = { pageOrder: ['Main', 'Extra'], page: 'Main', boards: { Main: [w('k1', 0, 0)], Extra: [w('e2', 0, 0)] } };
    const healed = healBoardWithLayout(saved, fresh, 8, 4);
    expect(healed.pageOrder).toEqual(['Main', 'Extra']);
    expect(healed.boards.Extra!.map((x) => x.key)).toEqual(['e2']);
  });

  it('is a no-op (same object reference) when nothing is missing', () => {
    const saved: SurfaceBoard = { pageOrder: ['Main'], page: 'Main', boards: { Main: [w('k1', 0, 0)] } };
    const fresh: SurfaceBoard = { pageOrder: ['Main'], page: 'Main', boards: { Main: [w('k1', 5, 5)] } }; // key already present — its fresh position is irrelevant
    expect(healBoardWithLayout(saved, fresh, 8, 4)).toBe(saved);
  });
});

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
    expect(a.variantSig).toMatch(/^b20\|/);
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

describe('buildDeviceLayoutBoard — extraKeysForPage (Dynacab hero graphic: no device row of its own)', () => {
  const CABMIC: BoardCtl = { key: 'cabmic1', kind: 'dynacab', id: -1, w: 8, h: 4, view: 'dynacab', views: ['dynacab'] };
  const lay = layout([
    { name: 'Cab', rows: [{ controls: [ctl('knob', 12, 'Pan 1'), ctl('knob', 20, 'Proximity 1')] }] },
    { name: 'Room/Air', rows: [{ controls: [ctl('knob', 35, 'Room Level')] }] }
  ]);
  const catalog: BoardCtl[] = [knob(12), knob(20), knob(35), CABMIC];

  it('places the extra widget at the TOP of its page, ahead of the page own rows', () => {
    const b = buildDeviceLayoutBoard(lay, catalog, 12, new Set(), () => null, (page) => (page === 0 ? ['cabmic1'] : []))!;
    expect(find(b.boards['Cab'], 'cabmic1')).toBeTruthy();
    expect(find(b.boards['Cab'], 'cabmic1').y).toBeLessThan(find(b.boards['Cab'], 'k12').y);
    expect(b.boards['Room/Air'].some((w) => w.key === 'cabmic1')).toBe(false);
  });

  it('tags the hero with row -1 so the responsive re-pack keeps it on top', () => {
    const b = buildDeviceLayoutBoard(lay, catalog, 12, new Set(), () => null, (page) => (page === 0 ? ['cabmic1'] : []))!;
    const hero = find(b.boards['Cab'], 'cabmic1');
    expect(hero.row).toBe(-1);
    const repacked = packRows(b.boards['Cab'], 8);
    expect(repacked.find((w) => w.key === 'cabmic1')!.y).toBeLessThan(repacked.find((w) => w.key === 'k12')!.y);
  });

  it('does not fall through to the trailing "More" sweep once placed', () => {
    const b = buildDeviceLayoutBoard(lay, catalog, 12, new Set(), () => null, (page) => (page === 0 ? ['cabmic1'] : []))!;
    expect(b.pageOrder).not.toContain('More');
  });

  it('falls back to the "More" sweep when no page claims the key (unchanged default behaviour)', () => {
    const b = buildDeviceLayoutBoard(lay, catalog, 12)!;
    expect(b.boards['Cab'].some((w) => w.key === 'cabmic1')).toBe(false);
    expect(find(b.boards['More'], 'cabmic1')).toBeTruthy();
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

// ── positionExact placement: canvas pages, row-level overlay, section headings ──
// Fixtures below are transcribed verbatim (widget/paramId/placement) from the amp's live FM3 layout data
// (forgefx-midi/src/gen3/fm3/layouts.generated.ts, "Amp GTE 8.00" variant) — real device shapes, not
// synthetic ones, specifically because the label-grouping rule needed two real rows that contradict each
// other under either simple heuristic alone (see `groupSectionLabels`'s doc comment).

describe('parsePositionExact', () => {
  it('parses a device "x,y" string', () => {
    expect(parsePositionExact('465,370')).toEqual({ x: 465, y: 370 });
  });
  it('returns null for missing or malformed input', () => {
    expect(parsePositionExact(undefined)).toBeNull();
    expect(parsePositionExact(null)).toBeNull();
    expect(parsePositionExact('')).toBeNull();
    expect(parsePositionExact('not-a-point')).toBeNull();
  });
});

describe('clusterByCanvasRow — turns raw positionExact scatter back into visual rows', () => {
  it('merges a small same-row spread into one row, ordered left→right — the cab Align page Bank/Type/Zoom row (max 7px apart)', () => {
    const items = [
      { xPx: 440, yPx: 223, tag: 'Type' },
      { xPx: 311, yPx: 223, tag: 'Bank' },
      { xPx: 196, yPx: 230, tag: 'Zoom' }
    ];
    const rows = clusterByCanvasRow(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((i) => i.tag)).toEqual(['Bank', 'Type', 'Zoom']);
  });

  it('splits a genuine row-to-row gap into separate rows — Scene Levels\' real Scene 1 → Scene 2 gap (34px)', () => {
    const items = [
      { xPx: 360, yPx: 77, tag: 'Scene 1' },
      { xPx: 360, yPx: 111, tag: 'Scene 2' }
    ];
    expect(clusterByCanvasRow(items).map((r) => r.map((i) => i.tag))).toEqual([['Scene 1'], ['Scene 2']]);
  });

  it('splits the cab Cab page identity cluster into its real sub-rows (Picker/M/S, then Bank/Type, then IR Length)', () => {
    const items = [
      { xPx: 376, yPx: 63, tag: 'Picker' },
      { xPx: 455, yPx: 63, tag: 'M' },
      { xPx: 491, yPx: 63, tag: 'S' },
      { xPx: 321, yPx: 105, tag: 'Bank' },
      { xPx: 440, yPx: 105, tag: 'Type' },
      { xPx: 321, yPx: 165, tag: 'IR Length' }
    ];
    const rows = clusterByCanvasRow(items).map((r) => r.map((i) => i.tag));
    expect(rows).toEqual([['Picker', 'M', 'S'], ['Bank', 'Type'], ['IR Length']]);
  });

  it('returns no rows for no items', () => {
    expect(clusterByCanvasRow([])).toEqual([]);
  });
});

describe('groupSectionLabels — verified against real amp rows', () => {
  // Preamp row 1 (pageNum 2): TWO headings on one row. SATURATION's underline stops before Low Cut/High
  // Cut Frequency in the real editor — those two knobs render with no heading above them.
  const preampRow1: LayoutControl[] = [
    ctl('label', null, 'INPUT BOOST'),
    ctl('toggle', 42, 'Boost', { placement: { col: 0 } }),
    ctl('dropdown', 125, 'Boost Type', { placement: { col: 1 } }),
    ctl('knob', 124, 'Boost Level', { placement: { col: 2 } }),
    ctl('label', null, 'SATURATION'),
    ctl('dropdown', 56, 'Saturation Switch', { placement: { col: 3 } }),
    ctl('knob', 107, 'Saturation Drive', { placement: { col: 4 } }),
    ctl('dropdown', 71, 'Preamp Tube Type', { placement: { col: 5 } }),
    ctl('spacer', null, '', { placement: { col: 6 } }),
    ctl('knob', 12, 'Low Cut Frequency', { placement: { col: 7 } }),
    ctl('knob', 13, 'High Cut Frequency', { placement: { col: 8 } })
  ];
  const isHeading = (c: LayoutControl) => c.widget === 'label';

  it('a heading that is NOT the last on its row stops at the next heading', () => {
    const spans = groupSectionLabels(preampRow1, isHeading);
    expect(spans[0]).toEqual({ ctlIndex: 0, start: 1, end: 4 }); // Boost, Boost Type, Boost Level
  });

  it('a heading that IS the last on a multi-heading row stops at the spacer, excluding trailing orphans', () => {
    const spans = groupSectionLabels(preampRow1, isHeading);
    expect(spans[1]).toEqual({ ctlIndex: 4, start: 5, end: 8 }); // Sat Switch, Sat Drive, Preamp Tube Type
    // Low Cut (9) / High Cut (10) are excluded — no heading claims them.
    expect(spans[1].end).toBeLessThan(9);
  });

  // Power Amp's TRANSFORMER row (pageNum 3): the ROW'S ONLY heading, but it does NOT extend across the
  // whole row — screenshot-confirmed against the real editor, TRANSFORMER's underline stops right after
  // XFormer Matching, at the first spacer. Speaker Impedance/PI Bias Excursion/Cathode Resistance/Cathode
  // Time Const are unrelated params (no shared `XFormer` prefix) that render with no heading over them,
  // same as SATURATION's trailing Low Cut/High Cut on a multi-heading row.
  const transformerRow: LayoutControl[] = [
    ctl('label', null, 'TRANSFORMER'),
    ctl('knob', 48, 'XFormer Drive', { placement: { col: 0 } }),
    ctl('knob', 53, 'XFormer Matching', { placement: { col: 1 } }),
    ctl('spacer', null, '', { placement: { col: 2 } }),
    ctl('knob', 129, 'Speaker Impedance', { placement: { col: 3 } }),
    ctl('spacer', null, '', { placement: { col: 4 } }),
    ctl('knob', 116, 'PI Bias Excursion', { placement: { col: 5 } }),
    ctl('spacer', null, '', { placement: { col: 6 } }),
    ctl('knob', 95, 'Cathode Resistance', { placement: { col: 7 } }),
    ctl('knob', 96, 'Cathode Time Const', { placement: { col: 8 } })
  ];

  it('a lone heading stops at its FIRST internal spacer too, same as a multi-heading row — it does not extend to the row end', () => {
    const spans = groupSectionLabels(transformerRow, isHeading);
    expect(spans).toEqual([{ ctlIndex: 0, start: 1, end: 3 }]); // XFormer Drive, XFormer Matching only
  });

  // Dynamics' real OUTPUT COMPRESSOR row (pageNum 9, firmware ≥4.00): the ROW'S ONLY heading, same shape
  // as TRANSFORMER — but here col 4 is claimed by NOTHING (not even a spacer): Gain sits at col 3, Master
  // Bias Excursion jumps straight to col 5. That is a real device-authored gap, not knob spacing, and the
  // real editor draws Master Bias Excursion clear of the compressor's underline.
  const outputCompressorRow: LayoutControl[] = [
    ctl('label', null, 'OUTPUT COMPRESSOR'),
    ctl('knob', 77, 'Out Compression', { placement: { col: 0 } }),
    ctl('knob', 78, 'Out Comp Threshold', { placement: { col: 1 } }),
    ctl('knob', 72, 'Out Comp Clarity', { placement: { col: 2 } }),
    ctl('meter', 121, 'Gain', { placement: { col: 3 } }),
    ctl('knob', 134, 'Master Bias Excursion', { placement: { col: 5 } })
  ];

  it('a single heading stops at a genuine authored-column gap, excluding what sits past it', () => {
    const spans = groupSectionLabels(outputCompressorRow, isHeading);
    expect(spans).toEqual([{ ctlIndex: 0, start: 1, end: 5 }]); // Out Compression..Gain — not Master Bias Excursion
  });
});

describe('buildDeviceLayoutBoard — a heading mid-row keeps its PRECEDING siblings above it (TONESTACK)', () => {
  // The amp's real Preamp row 2 (pageNum 2): six col-authored controls (Preamp Sag..Preamp Bias
  // Excursion) come BEFORE the TONESTACK heading, then three more (Tonestack Type/Freq/Location) AFTER
  // it. Only the trailing three are what TONESTACK actually labels (`groupSectionLabels`'s "onlyHeading"
  // rule gives it ctlIndex+1..end) — the leading six belong to no heading at all and must stay on the
  // row they were already on, not get dragged down onto TONESTACK's own line together with the controls
  // it heads (the bug: the whole row used to shift down by one grid line the instant it CONTAINED a
  // heading anywhere, not just after it).
  const preampRow2: LayoutControl[] = [
    ctl('toggle', 98, 'Preamp Sag', { placement: { col: 0 } }),
    ctl('knob', 50, 'Tube Hardness', { placement: { col: 1 } }),
    ctl('knob', 69, 'Triode 1 Plate Freq', { placement: { col: 2 } }),
    ctl('knob', 68, 'Triode 2 Plate Freq', { placement: { col: 3 } }),
    ctl('knob', 44, 'Preamp Bias', { placement: { col: 4 } }),
    ctl('knob', 108, 'Preamp Bias Excursion', { placement: { col: 5 } }),
    ctl('label', null, 'TONESTACK'),
    ctl('dropdown', 36, 'Tonestack Type', { placement: { col: 6 } }),
    ctl('knob', 14, 'Tonestack Freq', { placement: { col: 7 } }),
    ctl('dropdown', 20, 'Tonestack Location', { placement: { col: 8 } })
  ];
  const catalog: BoardCtl[] = [toggle(98), knob(50), knob(69), knob(68), knob(44), knob(108), select(36), knob(14), select(20)];
  const b = buildDeviceLayoutBoard(layout([{ name: 'Preamp', rows: [{ controls: preampRow2 }] }], { family: 'DISTORT' }), catalog, 12)!.boards['Preamp']!;

  it('places the six leading controls on the row above the heading, not below it', () => {
    expect(find(b, 'e98').y).toBe(0);
    expect(find(b, 'k50').y).toBe(0);
    expect(find(b, 'k108').y).toBe(0);
  });

  it('reserves the heading its own line below them', () => {
    expect(find(b, 'label:0:0:6').y).toBe(1);
  });

  it('places the three controls TONESTACK actually heads on the line below that, not the leading six', () => {
    expect(find(b, 'e36').y).toBe(2);
    expect(find(b, 'k14').y).toBe(2);
    expect(find(b, 'e20').y).toBe(2);
  });

  it('sizes the heading from only its trailing members, not the whole row', () => {
    expect(find(b, 'label:0:0:6').x).toBe(6); // where Tonestack Type starts, not x:0
    expect(find(b, 'label:0:0:6').w).toBe(5); // Tonestack Type (col 6, w2) .. Location (col 8, w2) ends at 11
  });

  it('does not overlap any widget', () => assertNoOverlap(b));

  // Regression: narrowing the pane (ControlSurface's responsive `repackWidgets` → `packRows`) used to
  // bucket a heading's whole source row together and reflow it as ONE naive left-to-right wrap — since
  // the heading itself never carries a `col`, that always fell out of `authoredX` and into the raw
  // flow-wrap, scrambling the heading in among controls it doesn't label (screenshot: Tonestack Type/Freq
  // wrapped ABOVE the TONESTACK line, Tonestack Location stranded alone below it).
  it('keeps the leading six on their own line, the heading on its own, and the trailing three below it — at any width', () => {
    for (const cols of [3, 6, 8, 12]) {
      const packed = packRows(b, cols);
      const at = (key: string) => packed.find((w) => w.key === key)!;
      const leadingYs = new Set(['e98', 'k50', 'k69', 'k68', 'k44', 'k108'].map((k) => at(k).y));
      const trailingYs = new Set(['e36', 'k14', 'e20'].map((k) => at(k).y));
      const headingY = at('label:0:0:6').y;
      if (cols >= 6) expect(leadingYs.size).toBe(1); // wide enough: the leading six fit on one line
      expect([...leadingYs].every((y) => y < headingY)).toBe(true);
      expect([...trailingYs].every((y) => y > headingY)).toBe(true);
      assertNoOverlap(packed);
    }
  });
});

describe('buildDeviceLayoutBoard — section headings render (not dropped as gaps)', () => {
  const preampRow1: LayoutControl[] = [
    ctl('label', null, 'INPUT BOOST'),
    ctl('toggle', 42, 'Boost', { placement: { col: 0 } }),
    ctl('dropdown', 125, 'Boost Type', { placement: { col: 1 } }),
    ctl('knob', 124, 'Boost Level', { placement: { col: 2 } }),
    ctl('label', null, 'SATURATION'),
    ctl('dropdown', 56, 'Saturation Switch', { placement: { col: 3 } }),
    ctl('knob', 107, 'Saturation Drive', { placement: { col: 4 } }),
    ctl('dropdown', 71, 'Preamp Tube Type', { placement: { col: 5 } }),
    ctl('spacer', null, '', { placement: { col: 6 } }),
    ctl('knob', 12, 'Low Cut Frequency', { placement: { col: 7 } }),
    ctl('knob', 13, 'High Cut Frequency', { placement: { col: 8 } })
  ];
  const catalog: BoardCtl[] = [knob(42), knob(125), knob(124), knob(56), knob(107), knob(71), knob(12), knob(13), BYPASS];
  const b = buildDeviceLayoutBoard(layout([{ name: 'Preamp', rows: [{ controls: preampRow1 }] }], { family: 'DISTORT' }), catalog, 12)!.boards['Preamp']!;

  it('renders each unbound heading as its own widget with the device text, instead of a dropped gap', () => {
    expect(find(b, 'label:0:0:0').text).toBe('INPUT BOOST');
    expect(find(b, 'label:0:0:4').text).toBe('SATURATION');
  });

  it('sizes and positions a heading from its resolved members’ x span', () => {
    expect(find(b, 'label:0:0:0').x).toBe(0);
    expect(find(b, 'label:0:0:0').w).toBe(3); // Boost + Boost Type + Boost Level
    expect(find(b, 'label:0:0:4').x).toBe(3);
    expect(find(b, 'label:0:0:4').w).toBe(3); // Sat Switch + Sat Drive + Preamp Tube Type
  });

  it('places headings on their own grid line above the controls they head', () => {
    expect(find(b, 'label:0:0:0').y).toBe(0);
    expect(find(b, 'k42').y).toBe(1);
  });

  it('does not extend SATURATION over the trailing unheaded Low Cut/High Cut knobs', () => {
    expect(find(b, 'k12').x).toBe(7); // Low Cut Frequency
    expect(find(b, 'k13').x).toBe(8); // High Cut Frequency
  });

  // Regression: packRows used to treat EVERY label as its own hard break, splitting INPUT BOOST and
  // SATURATION onto two separate lines (they share ONE) and sizing SATURATION from the entire trailing
  // segment — including Boost/BoostType/BoostLevel, which it doesn't label.
  it('keeps two headings sharing one line together on reflow, and their controls below it (not among them)', () => {
    for (const cols of [6, 9, 12]) {
      const packed = packRows(b, cols);
      const at = (key: string) => packed.find((w) => w.key === key)!;
      const inputBoostY = at('label:0:0:0').y;
      const saturationY = at('label:0:0:4').y;
      const controlYs = ['k42', 'k125', 'k124', 'k56', 'k107', 'k71', 'k12', 'k13'].map((k) => at(k).y);
      expect(saturationY).toBe(inputBoostY); // one shared heading line, not two
      expect(controlYs.every((y) => y > inputBoostY)).toBe(true); // every control — headed or not — below it
      if (cols >= 8) expect(new Set(controlYs).size).toBe(1); // wide enough: all eight fit on one shared line
      assertNoOverlap(packed);
    }
  });
});

describe('buildDeviceLayoutBoard — row-level outlier (HEADROOM: positionExact-only among col-authored siblings)', () => {
  // The amp's real Preamp row tail (pageNum 2): Master Vol Trim is the last col-authored control, then
  // HEADROOM sits in the SAME row with only positionExact — no col.
  const row: LayoutControl[] = [
    ctl('spacer', null, '', { placement: { col: 7 } }),
    ctl('knob', 79, 'Master Vol Trim', { placement: { col: 8 } }),
    ctl('meter', 132, 'HEADROOM', { placement: { positionExact: '465,370' } })
  ];
  const meterHCatalog: BoardCtl = { key: 'm132', kind: 'meterH', id: 132, w: 4, h: 1, view: 'meterH', views: ['meterH'] };
  const catalog: BoardCtl[] = [knob(79), meterHCatalog, BYPASS];
  const b = buildDeviceLayoutBoard(layout([{ name: 'Preamp', rows: [{ controls: row }] }], { family: 'DISTORT' }), catalog, 12)!.boards['Preamp']!;

  it('resolves HEADROOM to its meterH catalog entry, not a dropped gap', () => {
    expect(find(b, 'm132').view).toBe('meterH');
  });

  it('places HEADROOM as an ordinary grid widget on its own row below Master Vol Trim, never inheriting its column', () => {
    const headroom = find(b, 'm132');
    const trim = find(b, 'k79');
    expect(headroom.y).toBeGreaterThan(trim.y);
    expect(headroom.col).toBeUndefined();
  });

  it('leaves Master Vol Trim placed normally at its authored column (HEADROOM does not perturb the row)', () => {
    expect(find(b, 'k79').x).toBe(8);
  });

  it('does not overlap Master Vol Trim — the actual bug this replaces', () => {
    assertNoOverlap(b);
  });
});

describe('buildDeviceLayoutBoard — whole canvas-shaped page (Speaker/Align/Scene-Levels: every control positionExact, no col)', () => {
  // Shaped like the amp's real Speaker page: every control positionExact, no col, including a graph.
  const speakerLike: DeviceLayout['pages'] = [
    {
      name: 'Speaker',
      rows: [
        { controls: [ctl('graph', null, 'Speaker Response', { placement: { positionExact: '395,24' } })] },
        { section: 'parameters', controls: [ctl('knob', 10, 'Speaker Damping', { placement: { positionExact: '305,30' } })] },
        { section: 'mixer', controls: [ctl('knob', 1, 'Level', { placement: { positionExact: '1179,60' } })] }
      ]
    }
  ];
  const eqCat: BoardCtl = { key: 'eq:speaker', kind: 'eq', id: -1, w: 4, h: 2, view: 'eq', views: ['eq'] };
  const catalog: BoardCtl[] = [eqCat, knob(10), knob(1), BYPASS];
  const board = buildDeviceLayoutBoard(
    layout(speakerLike, { family: 'DISTORT' }),
    catalog,
    12,
    new Set(),
    (page, slot) => (page === 0 && slot === 0 ? 'eq:speaker' : null)
  )!;
  const b = board.boards['Speaker']!;

  it('resolves the graph slot even though the graph carries positionExact, not col (the diff this replaces passed graphKey: null here)', () => {
    expect(find(b, 'eq:speaker').view).toBe('eq');
  });

  it('places every non-rail control as an ordinary grid widget — Speaker Damping below the graph, since the fixture puts them in separate device rows', () => {
    // (`clusterByCanvasRow`'s own tests above cover same-row merging when controls DO share one device row,
    // the real Speaker page's actual shape — see e.g. its Low Freq/LF Reso/LF Q vertical stack.)
    expect(find(b, 'k10').x).toBe(0);
    expect(find(b, 'k10').y).toBeGreaterThan(find(b, 'eq:speaker').y);
  });

  it('routes the mixer-section Level to the rail, never onto the page grid, even though it carries its own positionExact', () => {
    expect(find(b, 'k1').rail).toBe(true);
  });

  it('does not overlap any two widgets on the page — the actual bug this replaces', () => {
    assertNoOverlap(b);
  });
});

// ── real-device regression: the cab "Cab" page — a dense identity CLUSTER per slot, not a lone outlier ──
// Transcribed from the cab's live CABINET block layout (forgefx-midi/src/gen3/fm3/layouts.generated.ts,
// gtet:"6,03" variant). Caught a real bug during this pass: pixel-percentage overlay (fine for a single
// outlier like HEADROOM) collapses a row's several close-together positionExact origins onto overlapping
// cards once there's more than one — this is the shape that exposed it.
describe('buildDeviceLayoutBoard — dense identity cluster (cab "Cab" page: Picker/Bank/Type/IR Length + Balance)', () => {
  const cab1Row: LayoutControl[] = [
    ctl('label', 65284, 'CAB 1', { placement: { positionExact: '315,63' }, rawWidget: 'labelBold' }),
    ctl('button', 65280, 'Picker', { placement: { positionExact: '376,63' } }),
    ctl('button', 65286, 'M', { placement: { positionExact: '455,63' } }),
    ctl('button', 65288, 'S', { placement: { positionExact: '491,63' } }),
    ctl('dropdown', 0, 'Bank', { placement: { positionExact: '321,105' } }),
    ctl('readout', 4, 'Type', { placement: { positionExact: '440,105' } }),
    ctl('label', 65282, 'Name', { placement: { positionExact: '321,135' }, rawWidget: 'labelCabName' }),
    ctl('dropdown', 70, 'IR Length', { placement: { positionExact: '321,165' } }),
    ctl('knob', 8, 'Level', { placement: { col: 3 } }),
    ctl('knob', 12, 'Pan', { placement: { col: 4 } }),
    ctl('knob', 62, 'Low Cut', { placement: { col: 5 } }),
    ctl('knob', 66, 'High Cut', { placement: { col: 6 } }),
    ctl('dropdown', 74, 'Low Slope', { placement: { col: 7 } }),
    ctl('dropdown', 78, 'High Slope', { placement: { col: 8 } }),
    ctl('knob', 20, 'Proximity', { placement: { col: 9 } })
  ];
  const balanceRow: LayoutControl[] = [
    ctl('knob', 29, 'Balance', { placement: { positionExact: '1179,185' } }),
    ctl('button', 32, 'Bypass'),
    ctl('button', 84, 'Scene Ignore')
  ];
  const catalog: BoardCtl[] = [
    toggle(65280), toggle(65286), toggle(65288), // Picker/M/S
    select(0), knob(4), // Bank/Type
    select(70), // IR Length
    knob(8), knob(12), knob(62), knob(66), select(74), select(78), knob(20), // knob row
    knob(29), toggle(32), toggle(84) // mixer rail
  ];
  const b = buildDeviceLayoutBoard(
    layout([{ name: 'Cab', rows: [{ section: 'parameters', controls: cab1Row }, { section: 'mixer', controls: balanceRow }] }], { family: 'CABINET' }),
    catalog,
    12
  )!.boards['Cab']!;

  it('routes Balance to the ordinary rail, NOT the identity-cluster machinery, despite carrying its own positionExact', () => {
    const bal = find(b, 'e29') ?? find(b, 'k29');
    expect(bal.rail).toBe(true);
  });

  it('places the identity cluster (Picker/M/S/Bank/Type/IR Length) as its own grid rows BELOW the knob row, not stacked in its leading columns', () => {
    const cluster = ['e65280', 'e65286', 'e65288', 'e0', 'k4', 'e70'].map((k) => find(b, k));
    const knobRowY = find(b, 'k8').y; // Level, the knob row's own y
    for (const w of cluster) expect(w.y).toBeGreaterThan(knobRowY);
  });

  it('does not overlap the cluster with the knob row or with itself — the actual bug this replaces', () => {
    assertNoOverlap(b);
  });

  it('does not drop the "Name" live-value field as a bogus static heading', () => {
    expect(b.some((w) => w.text === 'Name')).toBe(false);
  });

  it('leaves the col-authored knob row (Level..Proximity) at its real authored columns, unperturbed by the cluster', () => {
    expect(find(b, 'k8').col).toBe(3); // Level — first in the row, unaffected by any cascade
    // Proximity's own authored col is 9, but the two width-2 dropdowns ahead of it (Low/High Slope) push
    // the sweep cursor past it — expected `authoredX` cursor behavior (see its own doc comment), NOT
    // something the identity cluster caused. The point of this assertion is that it's a normal, coherent
    // authored-column placement at all, not stranded in flow because the cluster corrupted the row.
    expect(find(b, 'k20').col).toBeGreaterThanOrEqual(9);
  });
});

// ── real-device regression: the cab "Align" page — a whole canvas-shaped page whose rail row has NO
// placement at all on several controls (Level/Bypass/Scene Ignore carry no `placement` field whatsoever in
// the real data). Those controls must still render, in the rail, not dropped.
describe('buildDeviceLayoutBoard — canvas-shaped page with a placement-less rail row (cab "Align" page)', () => {
  const alignRow: LayoutControl[] = [
    ctl('toggle', 40, 'Zoom', { placement: { positionExact: '196,230' } }),
    ctl('graph', null, 'Graph', { placement: { positionExact: '305,18' } }),
    ctl('knob', 16, 'Delay 1', { placement: { positionExact: '416,282' } })
  ];
  const mixerLevelRow: LayoutControl[] = [ctl('knob', 28, 'Level')]; // no placement at all — real device data
  const mixerBalanceRow: LayoutControl[] = [
    ctl('knob', 29, 'Balance', { placement: { positionExact: '1179,185' } }),
    ctl('button', 32, 'Bypass'), // no placement — real device data
    ctl('button', 84, 'Scene Ignore') // no placement — real device data
  ];
  const eqCat: BoardCtl = { key: 'eq:align', kind: 'eq', id: -1, w: 4, h: 2, view: 'eq', views: ['eq'] };
  const catalog: BoardCtl[] = [eqCat, toggle(40), knob(16), knob(28), knob(29), toggle(32), toggle(84)];
  const board = buildDeviceLayoutBoard(
    layout(
      [{ name: 'Align', rows: [{ section: 'parameters', controls: alignRow }, { section: 'mixer', controls: mixerLevelRow }, { section: 'mixer', controls: mixerBalanceRow }] }],
      { family: 'CABINET' }
    ),
    catalog,
    12,
    new Set(),
    (page, slot) => (page === 0 && slot === 0 ? 'eq:align' : null)
  )!;
  const b = board.boards['Align']!;

  it('still places the positionExact-only controls as ordinary grid widgets even though its rail row has no placement on several controls', () => {
    expect(find(b, 'e40').rail).toBeUndefined(); // Zoom, a real page widget, not a rail one
  });

  it('does not drop the placement-less rail controls (Level/Bypass/Scene Ignore)', () => {
    expect(find(b, 'k28').rail).toBe(true);
    expect(find(b, 'e32').rail).toBe(true);
    expect(find(b, 'e84').rail).toBe(true);
  });

  it('never routes a rail widget onto the page grid, even Balance which carries its own positionExact', () => {
    expect(find(b, 'k29').rail).toBe(true);
  });

  it('does not overlap any two widgets on the page — the actual bug this replaces', () => {
    assertNoOverlap(b);
  });
});

// ── real-device regression: the amp's Dynamics "OUTPUT COMPRESSOR" row — a single heading whose row has
// a genuine authored-column gap, not internal spacing (contrast with the Power Amp TRANSFORMER row above,
// which needs the OPPOSITE: to extend through its spacers). Transcribed from the real FM3 layout data
// (forgefx-midi/src/gen3/fm3/layouts.generated.ts, Dynamics page, firmware ≥4.00 variant).
describe('buildDeviceLayoutBoard — single heading stops at a genuine column gap (Dynamics OUTPUT COMPRESSOR / Master Bias Excursion)', () => {
  const dynamicsRow: LayoutControl[] = [
    ctl('label', null, 'OUTPUT COMPRESSOR', { placement: { positionExact: '305,29' } }),
    ctl('knob', 77, 'Out Compression', { placement: { col: 0 } }),
    ctl('knob', 78, 'Out Comp Threshold', { placement: { col: 1 } }),
    ctl('knob', 72, 'Out Comp Clarity', { placement: { col: 2 } }),
    ctl('meter', 121, 'Gain', { placement: { col: 3 } }),
    // col 4 is claimed by NOTHING — Master Bias Excursion is firmware-gated (added in a later revision)
    // and the real editor draws it clear of the compressor group, not under its heading.
    ctl('knob', 134, 'Master Bias Excursion', { placement: { col: 5 } })
  ];
  const catalog: BoardCtl[] = [knob(77), knob(78), knob(72), knob(121), knob(134)];
  const b = buildDeviceLayoutBoard(layout([{ name: 'Dynamics', rows: [{ controls: dynamicsRow }] }], { family: 'DISTORT' }), catalog, 12)!.boards['Dynamics']!;

  it('sizes the heading from Out Compression..Gain only, not Master Bias Excursion', () => {
    const heading = find(b, 'label:0:0:0');
    expect(heading.x).toBe(0);
    expect(heading.w).toBe(4); // Out Compression(col0)..Gain(col3) — stops before the col-4 gap
    expect(heading.members).toEqual(['k77', 'k78', 'k72', 'k121']);
  });

  it('places Master Bias Excursion on the same line as the compressor knobs, just not under the heading', () => {
    expect(find(b, 'k134').y).toBe(find(b, 'k77').y);
    expect(find(b, 'k134').x).toBe(5); // its own authored column — the gap is preserved, not compacted away
  });

  it('does not overlap any widget', () => assertNoOverlap(b));

  // Regression: packRows used to resize a lone heading from EVERY widget after it on the row, with no way
  // to tell Master Bias Excursion apart from the compressor's real members — so narrowing the pane
  // re-expanded OUTPUT COMPRESSOR's underline right back over it, even after the build-time fix above.
  it('keeps Master Bias Excursion excluded from the heading at any repacked width, using the built `members` list', () => {
    for (const cols of [4, 6, 8, 12]) {
      const packed = packRows(b, cols);
      const heading = packed.find((w) => w.key === 'label:0:0:0')!;
      const bias = packed.find((w) => w.key === 'k134')!;
      if (heading.y === bias.y) expect(heading.x + heading.w).toBeLessThanOrEqual(bias.x);
      assertNoOverlap(packed);
    }
  });
});

// ── real-device regression: the amp's Power Amp "TRANSFORMER" row — screenshot-confirmed the real editor
// stops the heading at its FIRST spacer, disproving the earlier "lone heading spans the whole row" belief
// this codebase had baked in. Transcribed from the real FM3 layout data (forgefx-midi/src/gen3/fm3/
// layouts.generated.ts, Power Amp page).
describe('buildDeviceLayoutBoard — single heading stops at its first spacer, not the row end (Power Amp TRANSFORMER)', () => {
  const transformerRow: LayoutControl[] = [
    ctl('label', null, 'TRANSFORMER', { placement: { positionExact: '305,209' } }),
    ctl('knob', 48, 'XFormer Drive', { placement: { col: 0 } }),
    ctl('knob', 53, 'XFormer Matching', { placement: { col: 1 } }),
    ctl('spacer', null, '', { placement: { col: 2 } }),
    // Speaker Impedance/PI Bias Excursion/Cathode Resistance/Cathode Time Const: unrelated params (no
    // shared `XFormer` prefix) — the real editor draws no heading over them.
    ctl('knob', 129, 'Speaker Impedance', { placement: { col: 3 } }),
    ctl('spacer', null, '', { placement: { col: 4 } }),
    ctl('knob', 116, 'PI Bias Excursion', { placement: { col: 5 } }),
    ctl('spacer', null, '', { placement: { col: 6 } }),
    ctl('knob', 95, 'Cathode Resistance', { placement: { col: 7 } }),
    ctl('knob', 96, 'Cathode Time Const', { placement: { col: 8 } })
  ];
  const catalog: BoardCtl[] = [knob(48), knob(53), knob(129), knob(116), knob(95), knob(96)];
  const b = buildDeviceLayoutBoard(layout([{ name: 'Power Amp', rows: [{ controls: transformerRow }] }], { family: 'DISTORT' }), catalog, 12)!.boards['Power Amp']!;

  it('sizes the heading from XFormer Drive/XFormer Matching only', () => {
    const heading = find(b, 'label:0:0:0');
    expect(heading.x).toBe(0);
    expect(heading.w).toBe(2);
    expect(heading.members).toEqual(['k48', 'k53']);
  });

  it('places the four trailing knobs on the same line, just not under the heading', () => {
    const y = find(b, 'k48').y;
    for (const key of ['k129', 'k116', 'k95', 'k96']) expect(find(b, key).y).toBe(y);
  });

  it('does not overlap any widget', () => assertNoOverlap(b));

  it('keeps the trailing knobs excluded from the heading at any repacked width, using the built `members` list', () => {
    for (const cols of [3, 6, 9, 12]) {
      const packed = packRows(b, cols);
      const heading = packed.find((w) => w.key === 'label:0:0:0')!;
      for (const key of ['k129', 'k116', 'k95', 'k96']) {
        const w = packed.find((w) => w.key === key)!;
        if (heading.y === w.y) expect(heading.x + heading.w).toBeLessThanOrEqual(w.x);
      }
      assertNoOverlap(packed);
    }
  });
});
