import { describe, it, expect } from 'vitest';
import { buildCuratedBoardV2, buildDeviceLayoutBoardV2, GAP_CELLS, hasDeviceLayoutBoard, type DeviceLayoutBoardOptions } from './deviceLayoutBoardV2';
import { headerKeys } from './headerControls';
import { buildCatalog } from './catalog';
import { bbox, MAXC, normalizeBoard, pageItems, regions, type BeBoard, type BeItem } from './boardModel';
import { layoutVariantSig } from '../deviceLayoutBoard';
import type { DeviceLayout, LayoutControl, LayoutWidget } from '../types';

const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: `o${i}` }));
const ctl = (widget: LayoutWidget, paramId: number | null, label = '', extra: Partial<LayoutControl> = {}): LayoutControl => ({
  label,
  paramName: label || null,
  paramId,
  widget,
  ...extra
});
const layout = (pages: DeviceLayout['pages'], extra: Partial<DeviceLayout> = {}): DeviceLayout => ({ family: 'INPUT', pages, ...extra });
const find = (list: BeItem[], key: string) => list.find((i) => 'key' in i && i.key === key)!;

const catalog = buildCatalog({
  params: [{ id: 0, name: 'Threshold' }, { id: 1, name: 'Ratio' }, { id: 5, name: 'Level' }],
  enums: [
    { id: 4, name: 'Impedance', options: opts(3) },
    { id: 9, name: 'Mode', options: opts(2) }
  ],
  monitors: [{ role: 'vu' }]
});

describe('buildDeviceLayoutBoardV2', () => {
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

  it('lays rows out in cells with view sizes and source rows', () => {
    const b = buildDeviceLayoutBoardV2(lay, catalog)!;
    expect(b.v).toBe(2);
    expect(b.pageOrder).toEqual(['Gate']);
    expect(b.page).toBe('Gate');
    const G = b.boards.Gate!;
    expect(find(G, 'k0')).toMatchObject({ id: 'w0.k0', view: 'knob', x: 0, y: 0, w: 2, h: 2, row: 0 });
    expect(find(G, 'k1')).toMatchObject({ x: 2, y: 0, row: 0 });
    // The meter spans both rows and moves right to clear the slider.
    expect(find(G, 'meter')).toMatchObject({ view: 'meter', x: 10, y: 0, w: 2, h: 4, row: 0 });
    expect(find(G, 'e4')).toMatchObject({ view: 'select', x: 0, y: 2, row: 1 });
    expect(find(G, 'e9')).toMatchObject({ view: 'switch', x: 2, y: 2, row: 1 });
    expect(find(G, 'k5')).toMatchObject({ view: 'slider', x: 4, y: 2, w: 6, h: 1, row: 1 });
    expect(G.some((i) => 'key' in i && i.key === 'bypass')).toBe(false); // the header shows it
    expect(b.variantSig).toBe(layoutVariantSig(lay));
    // as before the fixed area: the bypass button on its row
    expect(find(buildDeviceLayoutBoardV2(lay, catalog, { withoutFixed: true })!.boards.Gate!, 'bypass')).toMatchObject({ view: 'action', x: 0, y: 6, w: 2, h: 1, row: 2 });
  });

  it('wraps a row wider than 24 cells onto a new line of the same row', () => {
    const params = Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, name: `P${i}` }));
    const cat = buildCatalog({ params, enums: [] });
    const b = buildDeviceLayoutBoardV2(
      layout([{ name: 'Wide', rows: [{ controls: params.map((p) => ctl('knob', p.id)) }, { controls: [ctl('knob', 100)] }] }]),
      cat
    )!;
    const W = b.boards.Wide!;
    expect(bbox(W).C).toBeLessThanOrEqual(MAXC);
    expect(find(W, 'k111')).toMatchObject({ x: 22, y: 0, row: 0 });
    expect(find(W, 'k112')).toMatchObject({ x: 0, y: 2, row: 0 });
    // the duplicate in row 1 is skipped (a key appears once per page)
    expect(W.filter((i) => 'key' in i && i.key === 'k100')).toHaveLength(1);
  });

  it('puts unreferenced catalog entries on a trailing More page', () => {
    const b = buildDeviceLayoutBoardV2(layout([{ name: 'P', rows: [{ controls: [ctl('knob', 0)] }] }]), catalog)!;
    expect(b.pageOrder).toEqual(['P', 'More']);
    const more = b.boards.More!;
    expect(more.map((i) => ('key' in i ? i.key : ''))).toEqual(['k1', 'k5', 'e4', 'e9', 'meter']);
    expect(find(more, 'k1')).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
    expect(find(more, 'meter')).toMatchObject({ x: 8, y: 0, w: 2, h: 4 });
  });

  it('keeps overflow controls reachable in additional two-row pages', () => {
    const params = Array.from({ length: 30 }, (_, id) => ({ id, name: `P${id}` }));
    const l = layout([{ name: 'P', rows: [{ controls: [ctl('knob', 0)] }] }]);
    const b = buildDeviceLayoutBoardV2(l, buildCatalog({ params, enums: [] }))!;
    expect(b.pageOrder).toEqual(['P', 'More', 'More 2']);
    expect(bbox(b.boards.More!).R).toBe(4);
    expect(bbox(b.boards['More 2']!).R).toBe(2);
    expect([...b.boards.More!, ...b.boards['More 2']!].map((c) => 'key' in c && c.key)).toEqual(params.slice(1).map(({ id }) => `k${id}`));
  });

  it('uses the graphic EQ controls for the live gains once and keeps unrelated page choices', () => {
    const eqPage = { name: 'Output EQ', rows: [{ controls: [ctl('slider', 0), ctl('slider', 1)] }],
      pageControls: [ctl('dropdown', 4, 'Type'), ctl('graph', null, 'Output EQ', { graphKey: 'outputEq' })] };
    const c = buildCatalog({
      params: [{ id: 0, name: '120 Hz' }, { id: 1, name: '240 Hz' }], enums: [{ id: 4, name: 'Type', options: opts(4) }],
      eqBandCount: 5,
      visuals: [{ key: 'outputEq', title: 'Output EQ', kind: 'eq', mode: 'graphic', roles: {}, bands: [
        { key: 'low', centerHz: 120, gain: 0 }, { key: 'high', centerHz: 240, gain: 1 }
      ] }]
    });
    const b = buildDeviceLayoutBoardV2(layout([eqPage]), c)!;
    expect(b.pageOrder).toEqual(['Output EQ']);
    expect(b.boards['Output EQ']!.flatMap((it) => 'key' in it ? [it.key] : [])).toEqual(['e4', 'graph:outputEq']);
    expect(bbox(b.boards['Output EQ']!).R).toBe(4);
  });

  it('puts the EQ tile in the place of a graphic EQ’s faders so it never falls onto More', () => {
    const c = buildCatalog({
      params: [{ id: 0, name: '31 Hz' }, { id: 1, name: '62 Hz' }],
      enums: [],
      eqBandCount: 10,
      visuals: [{ key: 'geq', title: 'Graphic EQ', kind: 'eq', mode: 'graphic', roles: {}, bands: [
        { key: 'low', centerHz: 31, gain: 0 }, { key: 'high', centerHz: 62, gain: 1 }
      ] }]
    });
    const eqPage = { name: 'Graphic EQ', rows: [{ controls: [ctl('slider', 0, '31 Hz'), ctl('slider', 1, '62 Hz')] }] };
    const b = buildDeviceLayoutBoardV2(layout([eqPage]), c)!;

    expect(b.pageOrder).toEqual(['Graphic EQ']);
    const page = b.boards['Graphic EQ']!;
    expect(find(page, 'eq')).toMatchObject({ view: 'eq', x: 0, y: 0 });
    // the gains are drawn by the tile: neither a fader nor a second control stays on the page
    expect(page.filter((it) => 'key' in it).map((it) => (it as { key: string }).key)).toEqual(['eq']);
    // and no `eq` entry reaches a More page
    expect(b.pageOrder.some((name) => name.startsWith('More'))).toBe(false);
  });

  it('makes repeated page names unique and skips empty pages', () => {
    const b = buildDeviceLayoutBoardV2(
      layout([
        { name: 'Gate', rows: [{ controls: [ctl('knob', 0)] }] },
        { name: 'Nothing', rows: [{ controls: [ctl('label', null, 'Title')] }] },
        { name: 'Gate', rows: [{ controls: [ctl('knob', 1)] }] }
      ]),
      catalog
    )!;
    expect(b.pageOrder.slice(0, 2)).toEqual(['Gate', 'Gate 2']);
  });

  it('returns null without renderable controls', () => {
    expect(buildDeviceLayoutBoardV2(null, catalog)).toBeNull();
    expect(buildDeviceLayoutBoardV2(layout([]), catalog)).toBeNull();
    expect(buildDeviceLayoutBoardV2(layout([{ name: 'X', rows: [{ controls: [ctl('spacer', null)] }] }]), catalog)).toBeNull();
  });

  it('gives a key used on two pages page-qualified, deterministic ids', () => {
    const twoPages = layout([
      { name: 'A', rows: [{ controls: [ctl('knob', 0), ctl('knob', 1)] }] },
      { name: 'B', rows: [{ controls: [ctl('knob', 0)] }] }
    ]);
    const keys = catalog.map((c) => c.key);
    const first = normalizeBoard(buildDeviceLayoutBoardV2(twoPages, catalog)!, keys);
    const second = normalizeBoard(buildDeviceLayoutBoardV2(twoPages, catalog)!, keys);
    expect(find(first.boards.A!, 'k0').id).toBe('w0.k0');
    expect(find(first.boards.B!, 'k0').id).toBe('w1.k0');
    expect(find(first.boards.More!, 'k5').id).toBe('w2.k5');
    expect(second).toEqual(first);
    const ids = first.pageOrder.flatMap((p) => first.boards[p]!.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is already normal (normalizeBoard changes nothing)', () => {
    const b = buildDeviceLayoutBoardV2(lay, catalog)!;
    expect(normalizeBoard(b, catalog.map((c) => c.key))).toEqual(b);
  });

  // a page with exact positions (pixels, top-left), a section title and a mixer section without positions
  const at = (x: number, y: number) => ({ placement: { positionExact: `${x},${y}` } });
  const ampPage = {
    name: 'Amp',
    rows: [
      {
        section: 'parameters',
        controls: [
          ctl('label', null, 'GAIN', { rawWidget: 'sectionLabel', ...at(305, 29) }),
          ctl('knob', 0, 'Threshold', at(305, 50)),
          ctl('knob', 1, 'Ratio', at(397, 50)),
          ctl('toggle', 9, 'Mode', at(305, 210)),
          ctl('knob', 5, 'Level', at(397, 210))
        ]
      },
      { section: 'mixer', controls: [ctl('dropdown', 4, 'Impedance'), ctl('button', 6, 'Bypass', { rawWidget: 'btnBypass' })] }
    ]
  };
  // a page of four single-control rows: 8 rows high by rows, so the block's height budget is 8
  const tallPage = { name: 'Tall', rows: [0, 1, 5].map((id) => ({ controls: [ctl('knob', id, 'K')] })).concat([{ controls: [ctl('dropdown', 4, 'Impedance')] }]) };
  const positioned = layout([ampPage, tallPage]);

  it('as before the fixed area — exact positions: knob slot = 2 cells, a title line above, the mixer section below a divider', () => {
    const modes: string[] = [];
    const b = buildDeviceLayoutBoardV2(positioned, catalog, { withoutFixed: true, onPage: (p, m) => modes.push(`${p}:${m}`) })!;
    expect(b.fixed).toBeUndefined();
    expect(modes).toEqual(['Amp:positioned', 'Tall:rows']);
    expect(b.pageOrder).toEqual(['Amp', 'Tall', 'More']);
    const A = b.boards.Amp!;
    expect(A.find((i) => 'kind' in i && i.kind === 'hdiv' && i.label === 'GAIN')).toMatchObject({ x: 0, y: 0, w: 4 });
    expect(find(A, 'k0')).toMatchObject({ x: 0, y: 0 });
    expect(find(A, 'k1')).toMatchObject({ x: 2, y: 0 });
    expect(find(A, 'e9')).toMatchObject({ x: 0, y: 2, view: 'switch' });
    expect(find(A, 'k5')).toMatchObject({ x: 2, y: 2 });
    expect(A.find((i) => 'kind' in i && i.label === 'Mixer')).toMatchObject({ kind: 'hdiv', x: 0, y: 4, h: 0 });
    expect(find(A, 'e4')).toMatchObject({ x: 0, y: 4, view: 'select' });
    expect(find(A, 'bypass')).toMatchObject({ x: 2, y: 4, view: 'action' });
    expect(b.boards.More!.map((i) => ('key' in i ? i.key : ''))).toEqual(['meter']);
    expect(b.variantSig).toBe(layoutVariantSig(positioned));
    const keys = catalog.map((c) => c.key);
    expect(normalizeBoard(b, keys)).toEqual(b);
    expect(buildDeviceLayoutBoardV2(positioned, catalog, { withoutFixed: true })).toEqual(b);
  });

  it('the default: the repeated mixer control is in the fixed area, the rest keeps its positions and its title line', () => {
    const modes: string[] = [];
    const b = buildDeviceLayoutBoardV2(positioned, catalog, { onPage: (p, m) => modes.push(`${p}:${m}`) })!;
    expect(modes).toEqual(['Amp:positioned', 'Tall:rows']);
    const A = b.boards.Amp!;
    expect(find(A, 'k0')).toMatchObject({ x: 0, y: 0 });
    expect(find(A, 'k5')).toMatchObject({ x: 2, y: 2 });
    // the GAIN title stays: a two-row re-flow that dropped it would not be the device layout
    expect(A.find((i) => 'kind' in i && i.label === 'GAIN')).toMatchObject({ kind: 'hdiv', x: 0, y: 0 });
    // the mixer row is gone: no divider for it, nothing under the knobs
    expect(A.some((i) => 'kind' in i && i.label === 'Mixer')).toBe(false);
    expect(bbox(A).R).toBe(4);
    // the shared parameter controls (k0, k1, k5) would leave "Tall" empty: they stay, only the mixer's moves
    expect(b.fixed).toEqual({ cols: 2, items: [{ id: 'wf.e4', key: 'e4', view: 'select', x: 0, y: 0, w: 2, h: 2 }] });
    expect(b.boards.Tall!.map((i) => ('key' in i ? i.key : ''))).toEqual(['k0', 'k1', 'k5']);
    const keys = catalog.map((c) => c.key);
    expect(normalizeBoard(b, keys)).toEqual(b);
    expect(buildDeviceLayoutBoardV2(positioned, catalog)).toEqual(b);
  });

  it('height budget: what remains by rows only plus the title lines, never taller than rows only with everything', () => {
    const tallest = (b: ReturnType<typeof buildDeviceLayoutBoardV2>) => Math.max(...b!.pageOrder.map((p) => bbox(b!.boards[p]!).R));
    const alone = layout([ampPage]);
    const modes = (o: DeviceLayoutBoardOptions) => {
      const out: string[] = [];
      buildDeviceLayoutBoardV2(alone, catalog, { ...o, onPage: (p, m) => out.push(`${p}:${m}`) });
      return out;
    };
    // before: rows only with everything is 4 high (the Amp page and the meter on "More"), and the positioned
    // page (7 rows with its title line and divider, 6 / 6 without) gave way to plain rows
    expect(tallest(buildDeviceLayoutBoardV2(alone, catalog, { rowFlowOnly: true }))).toBe(4);
    expect(modes({ withoutFixed: true })).toEqual(['Amp:rows']);
    // now the mixer is off the page: its positions fit the same height (the title line would be a fifth row).
    // This page has no titles to lose, so the two-row re-flow applies.
    expect(modes({})).toEqual(['Amp:positioned']);
    expect(tallest(buildDeviceLayoutBoardV2(alone, catalog))).toBeLessThanOrEqual(4);
    // Amp keeps its title row. Tall needs six cells and retains its layout.
    const both = buildDeviceLayoutBoardV2(positioned, catalog)!;
    expect(bbox(both.boards.Amp!).R).toBe(4);
    expect(tallest(both)).toBe(6);
    expect(tallest(buildDeviceLayoutBoardV2(positioned, catalog, { withoutFixed: true }))).toBe(8);
  });

  it('height budget: removed mixer rows cannot leave an arbitrarily tall positioned page', () => {
    const c = buildCatalog({ params: Array.from({ length: 10 }, (_, id) => ({ id, name: `P${id}` })), enums: [] });
    const l = layout([{ name: 'Basic', rows: [
      { section: 'parameters', controls: [ctl('knob', 0, 'P0', at(305, 50)), ctl('knob', 1, 'P1', at(397, 50)), ctl('knob', 2, 'P2', at(397, 142)), ctl('knob', 3, 'P3', at(397, 234))] },
      ...[4, 5, 6, 7, 8, 9].map((id) => ({ section: 'mixer', controls: [ctl('knob', id)] }))
    ] }]);
    const previous = buildDeviceLayoutBoardV2(l, c, { rowFlowOnly: true })!;
    expect(bbox(previous.boards.Basic!).R).toBe(14);
    const board = buildDeviceLayoutBoardV2(l, c)!;
    expect(bbox(board.boards.Basic!).R).toBeLessThanOrEqual(4);
  });

  it('height budget: newly served page-level controls may make the rows-only floor taller', () => {
    const c = buildCatalog({ params: [0, 1].map((id) => ({ id, name: `P${id}` })), enums: [] });
    const l = layout([{ name: 'Main', rows: [{ section: 'parameters', controls: [ctl('knob', 0, 'P0', at(305, 50))] }], pageControls: [ctl('knob', 1, 'P1', at(305, 141))] }]);
    const modes: string[] = [];
    const board = buildDeviceLayoutBoardV2(l, c, { onPage: (_p, mode) => modes.push(mode) })!;
    expect(bbox(buildDeviceLayoutBoardV2(l, c, { rowFlowOnly: true })!.boards.Main!).R).toBe(2);
    expect(bbox(board.boards.Main!).R).toBe(4);
    expect(modes).toEqual(['positioned']);
  });

  it('rowFlowOnly builds the previous default: rows only, no positions, no dividers', () => {
    const b = buildDeviceLayoutBoardV2(positioned, catalog, { rowFlowOnly: true })!;
    const A = b.boards.Amp!;
    expect(A.some((i) => 'kind' in i)).toBe(false);
    expect(find(A, 'k0')).toMatchObject({ x: GAP_CELLS, y: 0, row: 0 }); // the title was a gap
    expect(find(A, 'e4')).toMatchObject({ x: 0, y: 2, row: 1 });
    // without placement data and sections both previous builds agree
    expect(buildDeviceLayoutBoardV2(lay, catalog, { rowFlowOnly: true })).toEqual(buildDeviceLayoutBoardV2(lay, catalog, { withoutFixed: true }));
  });

  it('hasDeviceLayoutBoard: a layout with a control the catalog shows', () => {
    expect(hasDeviceLayoutBoard(positioned, catalog)).toBe(true);
    expect(hasDeviceLayoutBoard(layout([{ name: 'X', rows: [{ controls: [ctl('spacer', null), ctl('knob', 77, 'Gone')] }] }]), catalog)).toBe(false);
    expect(hasDeviceLayoutBoard(null, catalog)).toBe(false);
  });

  // ── controls of another block (AXIS-93): never seeded onto the open block's same-numbered params ──
  describe('cross-block refs', () => {
    const xref = (paramId: number, label: string, effectId?: number): LayoutControl =>
      ctl('knob', paramId, label, {
        crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: `GLOBAL_${label.toUpperCase()}`, paramId, ...(effectId != null ? { effectId } : {}) }
      });
    // pid 0 / 5 are ALSO params of the open block (Threshold / Level): the ref must not bind to them
    const mixed = layout([
      { name: 'Main', rows: [{ controls: [ctl('knob', 1, 'Ratio'), xref(0, 'Metronome'), ctl('knob', 5, 'Level')] }] },
      { name: 'Global', rows: [{ controls: [xref(0, 'Metronome'), xref(5, 'Volume')] }] }
    ]);

    it('a ref stays a gap (keeps its slot) in the positioned and the rows-only default', () => {
      for (const b of [buildDeviceLayoutBoardV2(mixed, catalog)!, buildDeviceLayoutBoardV2(mixed, catalog, { rowFlowOnly: true })!]) {
        const M = b.boards.Main!;
        expect(find(M, 'k1')).toMatchObject({ x: 0 });
        expect(find(M, 'k5')).toMatchObject({ x: 2 + GAP_CELLS }); // the ref left its slot empty
        expect(M.some((i) => 'key' in i && i.key === 'k0')).toBe(false);
        // a page of refs only has nothing to show (k0 ends up on More with the other unplaced entries)
        expect(b.pageOrder).not.toContain('Global');
        expect(b.boards.More!.some((i) => 'key' in i && i.key === 'k0')).toBe(true);
      }
    });

    it('the open block’s effect id alone does not bind a ref without one', () => {
      expect(buildDeviceLayoutBoardV2(mixed, catalog, { effectId: 46 })!.boards.Main!.some((i) => 'key' in i && i.key === 'k0')).toBe(false);
    });

    it('a ref naming the open block by effect id binds', () => {
      const own = layout([{ name: 'Main', rows: [{ controls: [ctl('knob', 1, 'Ratio'), xref(0, 'Threshold', 46)] }] }]);
      expect(find(buildDeviceLayoutBoardV2(own, catalog, { effectId: 46 })!.boards.Main!, 'k0')).toMatchObject({ x: 2 });
      expect(buildDeviceLayoutBoardV2(own, catalog, { effectId: 47 })!.boards.Main!.some((i) => 'key' in i && i.key === 'k0')).toBe(false);
    });

    it('hasDeviceLayoutBoard ignores refs', () => {
      const refsOnly = layout([{ name: 'Global', rows: [{ controls: [xref(0, 'Metronome'), xref(5, 'Volume')] }] }]);
      expect(hasDeviceLayoutBoard(refsOnly, catalog)).toBe(false);
      expect(buildDeviceLayoutBoardV2(refsOnly, catalog)).toBeNull();
    });

    it('legacyUnguarded rebuilds a previous default exactly as before the guard (rows only and positioned)', () => {
      for (const legacy of [
        buildDeviceLayoutBoardV2(mixed, catalog, { rowFlowOnly: true, legacyUnguarded: true })!,
        buildDeviceLayoutBoardV2(mixed, catalog, { legacyUnguarded: true })!
      ]) {
        expect(find(legacy.boards.Main!, 'k0')).toMatchObject({ x: 2 });
        expect(legacy.pageOrder).toContain('Global');
      }
      // the served layout is untouched: the default board stays guarded
      expect(buildDeviceLayoutBoardV2(mixed, catalog)!.boards.Main!.some((i) => 'key' in i && i.key === 'k0')).toBe(false);
    });

    // fix round: the Foot Controller screen tags every one of its own params with ID_FOOTCONTROLLER (family FC)
    it('a layout whose controls are same-family single-instance refs (FC) builds a device-layout board', () => {
      const fcRef = (paramId: number, effect = 'ID_FOOTCONTROLLER', family = 'INPUT'): LayoutControl =>
        ctl('knob', paramId, `P${paramId}`, { crossBlock: { effect, family, paramName: `INPUT_P${paramId}`, paramId } });
      const fc = layout([{ name: 'Switch', rows: [{ controls: [fcRef(0), fcRef(1), fcRef(5, 'ID_OUTPUT1'), fcRef(9, 'ID_FOOTCONTROLLER', 'GLOBAL')] }] }]);
      expect(hasDeviceLayoutBoard(fc, catalog)).toBe(true);
      const S = buildDeviceLayoutBoardV2(fc, catalog, { effectId: 199 })!.boards.Switch!;
      expect(find(S, 'k0')).toBeTruthy();
      expect(find(S, 'k1')).toBeTruthy();
      expect(S.some((i) => 'key' in i && (i.key === 'k5' || i.key === 'e9'))).toBe(false); // multi-instance + foreign family: gaps
    });
  });
});

describe('buildCuratedBoardV2', () => {
  it('splits Main / Advanced and fills first-free', () => {
    const cat = buildCatalog({
      params: [{ id: 1, name: 'Gain' }, { id: 2, name: 'Bass' }],
      enums: [{ id: 4, name: 'Mode', options: opts(4) }],
      eqBandCount: 5
    });
    const b = buildCuratedBoardV2(cat, new Set([1]));
    expect(b.pageOrder).toEqual(['Main', 'Advanced']);
    expect(b.boards.Main!.map((i) => ('key' in i ? i.key : ''))).toEqual(['eq', 'k1']);
    expect(find(b.boards.Main!, 'k1')).toMatchObject({ x: 8, y: 0 });
    expect(b.boards.Advanced!.map((i) => ('key' in i ? i.key : ''))).toEqual(['k2', 'e4']);
    expect(b.fixed).toBeUndefined(); // no fixed area
    // as before: the bypass at the end of Main (for recognising a stored one)
    const old = buildCuratedBoardV2(cat, new Set([1]), { withHeader: true });
    expect(old.boards.Main!.map((i) => ('key' in i ? i.key : ''))).toEqual(['eq', 'k1', 'bypass']);
    expect(find(old.boards.Main!, 'bypass')).toMatchObject({ x: 10, y: 0, w: 2, h: 1 });
  });

  it('leaves the header controls out (tagged, or by label) and keeps every other one', () => {
    const cat = buildCatalog({
      params: [{ id: 1, name: 'Gain' }],
      enums: [
        { id: 3, name: 'Bypass Mode', options: opts(4) },
        { id: 4, name: 'Scene Ignore', options: opts(2) },
        { id: 5, name: 'Cab Bypass', options: opts(2) },
        { id: 6, name: 'Keep It', options: opts(2) }
      ]
    });
    const keys = (b: BeBoard) => regions(b).flatMap((p) => pageItems(b, p).flatMap((i) => ('key' in i ? [i.key] : [])));
    expect(keys(buildCuratedBoardV2(cat, new Set([1])))).toEqual(['k1', 'e5', 'e6']);
    // the server tags another param as Scene Ignore: that one is the header's too
    expect(keys(buildCuratedBoardV2(cat, new Set([1]), { blockState: { sceneIgnore: { paramId: 6 }, bypassMode: { paramId: 3 } } }))).toEqual(['k1', 'e5']);
  });

  it('nothing musician-facing left for Main: everything goes there, no empty page', () => {
    const cat = buildCatalog({ params: [{ id: 1, name: 'Odd' }], enums: [] });
    const b = buildCuratedBoardV2(cat, new Set());
    expect(b.pageOrder).toEqual(['Main']);
    expect(b.boards.Main!.map((i) => ('key' in i ? i.key : ''))).toEqual(['k1']);
  });
});

// ── the fixed area, the header's controls and page-level controls (AXIS-94) ──
describe('the default board with a fixed area', () => {
  const cat = buildCatalog({
    params: [0, 1, 2, 3, 10, 11, 12, 20].map((id) => ({ id, name: { 10: 'Mix', 11: 'Level', 12: 'Balance', 20: 'Tracking Mode Amount' }[id as 10] ?? `P${id}` })),
    enums: [
      { id: 30, name: 'Bypass Mode', options: opts(4) },
      { id: 31, name: 'Scene Ignore', options: opts(2) },
      { id: 32, name: 'Tracking Mode', options: opts(4) },
      { id: 33, name: 'Cab Bypass', options: opts(2) }
    ],
    monitors: [{ role: 'vu' }]
  });
  const keysOf = (list: readonly BeItem[]) => list.flatMap((i) => ('key' in i ? [i.key] : []));
  const allKeys = (b: BeBoard) => regions(b).flatMap((p) => keysOf(pageItems(b, p)));
  const mixer = { section: 'mixer', controls: [ctl('knob', 10, 'Mix'), ctl('knob', 11, 'Level'), ctl('knob', 12, 'Balance'), ctl('dropdown', 30, 'Bypass\nMode', { paramName: 'X_BYPASSMODE' }), ctl('button', 99, 'Bypass', { rawWidget: 'btnBypass', paramName: 'X_BYPASS' }), ctl('button', 31, 'Scene\nIgnore', { rawWidget: 'btnIgnoreScene', paramName: 'X_SCENEIGNORE' })] };
  const page = (name: string, ids: number[], extra: object = {}) => ({ name, rows: [{ section: 'parameters', controls: ids.map((id) => ctl('knob', id, `P${id}`)) }, mixer], ...extra });
  const three = layout([page('Voice 1', [0, 1]), page('Voice 2', [2]), page('Voice 3', [3])]);

  it('the repeated mixer moves once, in editor order, two knobs a row; the pages keep their own controls only', () => {
    const b = buildDeviceLayoutBoardV2(three, cat)!;
    expect(b.fixed!.cols).toBe(4);
    expect(b.fixed!.items).toEqual([
      { id: 'wf.k10', key: 'k10', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
      { id: 'wf.k11', key: 'k11', view: 'knob', x: 2, y: 0, w: 2, h: 2 },
      { id: 'wf.k12', key: 'k12', view: 'knob', x: 0, y: 2, w: 2, h: 2 }
    ]);
    expect(keysOf(b.boards['Voice 1']!)).toEqual(['k0', 'k1']);
    expect(keysOf(b.boards['Voice 2']!)).toEqual(['k2']);
    expect(b.pageOrder).toEqual(['Voice 1', 'Voice 2', 'Voice 3', 'More']);
    expect(keysOf(b.boards.More!)).toEqual(['k20', 'e32', 'e33', 'meter']); // not the header's, not the fixed ones
    expect(normalizeBoard(b, cat.map((c) => c.key))).toEqual(b);
    expect(buildDeviceLayoutBoardV2(three, cat)).toEqual(b); // deterministic
  });

  it('every non-graph control outside the expected header keys is on the board', () => {
    const withGraph = buildCatalog({ params: cat.filter((c) => c.kind === 'cont').map((c) => ({ id: c.id, name: c.label })), enums: [{ id: 30, name: 'Bypass Mode', options: opts(4) }], visuals: [{ key: 'lfo', kind: 'lfo', title: 'LFO', roles: {} } as never] });
    for (const [c, l, header] of [
      [cat, three, ['bypass', 'e30', 'e31']],
      [withGraph, three, ['bypass', 'e30']],
      [cat, layout([page('Only', [0, 1])]), ['bypass', 'e30', 'e31']],
      [cat, positionedWithPageControls(), ['bypass', 'e30', 'e31']]
    ] as const) {
      const b = buildDeviceLayoutBoardV2(l, c)!;
      expect(headerKeys(c, { layout: l })).toEqual(new Set(header));
      const excluded = new Set<string>(header);
      expect(new Set(allKeys(b))).toEqual(new Set(c.filter((x) => x.kind !== 'graph' && !excluded.has(x.key)).map((x) => x.key)));
      const fixedKeys = keysOf(b.fixed?.items ?? []);
      for (const p of b.pageOrder) expect(keysOf(b.boards[p]!).filter((k) => fixedKeys.includes(k))).toEqual([]);
    }
  });

  it('keeps a misfiled MultiDelay control on its pages and keeps Amp Section as a regular select', () => {
    const c = buildCatalog({
      params: [{ id: 0, name: 'Rate' }, { id: 1, name: 'Depth' }, { id: 2, name: 'Mix' }],
      enums: [{ id: 3, name: 'Tempo 1', options: opts(4) }, { id: 4, name: 'Amp Section', options: opts(4) }]
    });
    const tempo = ctl('button', 3, 'Tempo 1', { paramName: 'DeLaY_BYPASS', rawWidget: 'btnBypass' });
    const blend = ctl('knob', 2, 'Mix', { paramName: 'MULTITAP_MIX' });
    const multi = layout([0, 1].map((id) => ({ name: `Tap ${id + 1}`, rows: [{ controls: [ctl('knob', id), tempo] }, { section: 'mixer', controls: [blend] }] })), { family: 'MULTITAP' });
    const b = buildDeviceLayoutBoardV2(multi, c)!;
    expect(headerKeys(c, { layout: multi })).toEqual(new Set(['bypass']));
    expect(keysOf(b.fixed!.items)).toEqual(['k2']);
    expect(keysOf(b.boards['Tap 1']!)).toEqual(['k0', 'e3']);
    expect(keysOf(b.boards['Tap 2']!)).toEqual(['k1', 'e3']);
    const amp = layout([{ name: 'Amp', rows: [{ controls: [ctl('dropdown', 4, 'Amp Section', { paramName: 'DISTORT_BYPASS', rawWidget: 'dropdown1' })] }] }], { family: 'DISTORT' });
    expect(headerKeys(c, { layout: amp })).toEqual(new Set(['bypass']));
    expect(find(buildDeviceLayoutBoardV2(amp, c)!.boards.Amp!, 'e4')).toMatchObject({ view: 'select' });
  });

  it('uses served block-state ids even when their labels and widgets give no role', () => {
    const tagged = { blockState: { sceneIgnore: { paramId: 0 }, bypassMode: { paramId: 20 } } };
    expect(hasDeviceLayoutBoard(layout([{ name: 'A', rows: [{ controls: [ctl('knob', 0)] }] }]), cat, tagged)).toBe(false);
    const b = buildDeviceLayoutBoardV2(three, cat, tagged)!;
    expect(allKeys(b)).not.toContain('k0');
    expect(allKeys(b)).not.toContain('k20');
  });

  it('packs twelve knobs into a row of More beside Fixed', () => {
    const c = buildCatalog({ params: Array.from({ length: 14 }, (_, id) => ({ id, name: `P${id}` })), enums: [] });
    const l = layout([{ name: 'Main', rows: [{ controls: [ctl('knob', 0)] }, { section: 'mixer', controls: [ctl('knob', 1)] }] }]);
    const b = buildDeviceLayoutBoardV2(l, c)!;
    expect(b.fixed?.cols).toBe(2);
    expect(bbox(b.boards.More!)).toMatchObject({ C: 24, R: 2 });
    expect(find(b.boards.More!, 'k13')).toMatchObject({ x: 22, y: 0 });
  });

  it('a page of header controls only goes away; a part’s own bypass stays in the layout', () => {
    const l = layout([
      { name: 'Main', rows: [{ section: 'parameters', controls: [ctl('knob', 0, 'P0'), ctl('toggle', 33, 'Cab Bypass', { paramName: 'X_EQ_BYPASS' })] }] },
      { name: 'State', rows: [{ section: 'mixer', controls: mixer.controls.slice(3) }] }
    ]);
    const b = buildDeviceLayoutBoardV2(l, cat)!;
    expect(b.pageOrder).toEqual(['Main', 'More']);
    expect(keysOf(b.boards.Main!)).toEqual(['k0', 'e33']);
    expect(b.fixed).toBeUndefined(); // only one page shows controls, and none of them is a mixer's
    expect(allKeys(b)).not.toContain('bypass');
    // nothing but header controls: no device board at all
    const only = layout([{ name: 'State', rows: [{ section: 'mixer', controls: mixer.controls.slice(3) }] }]);
    expect(buildDeviceLayoutBoardV2(only, cat)).toBeNull();
    expect(hasDeviceLayoutBoard(only, cat)).toBe(false);
    expect(buildDeviceLayoutBoardV2(only, cat, { withoutFixed: true })).not.toBeNull();
  });

  it('a header control in the middle of a row leaves no hole', () => {
    const l = layout([{ name: 'A', rows: [{ section: 'parameters', controls: [ctl('button', 31, 'Scene Ignore', { rawWidget: 'btnIgnoreScene' }), ctl('spacer', null), ctl('knob', 0, 'P0'), ctl('dropdown', 30, 'Bypass Mode'), ctl('knob', 1, 'P1')] }] }]);
    const A = buildDeviceLayoutBoardV2(l, cat)!.boards.A!;
    expect(find(A, 'k0')).toMatchObject({ x: 0, y: 0 });
    expect(find(A, 'k1')).toMatchObject({ x: 2, y: 0 });
  });

  it('rows-only fallback drops removed slots and leading gaps while preserving internal gaps', () => {
    const c = buildCatalog({ params: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }], enums: [{ id: 2, name: 'Bypass Mode', options: opts(4) }] });
    const nudged = { placement: { offsetY: 120 } };
    const l = layout([{ name: 'A', rows: [{ controls: [
      ctl('dropdown', 2), ctl('spacer', null), ctl('knob', 0, 'A', nudged), ctl('spacer', null), ctl('knob', 1, 'B', nudged)
    ] }] }]);
    const modes: string[] = [];
    const board = buildDeviceLayoutBoardV2(l, c, { onPage: (_p, mode) => modes.push(mode) })!;
    expect(modes).toEqual(['rows-only']);
    expect(find(board.boards.A!, 'k0')).toMatchObject({ x: 0, y: 0 });
    expect(find(board.boards.A!, 'k1')).toMatchObject({ x: 4, y: 0 });
  });

  it('exactly one page: its mixer moves, unless that would leave the page empty', () => {
    const one = buildDeviceLayoutBoardV2(layout([page('Only', [0, 1])]), cat)!;
    expect(keysOf(one.fixed!.items)).toEqual(['k10', 'k11', 'k12']);
    expect(keysOf(one.boards.Only!)).toEqual(['k0', 'k1']);
    const mixerOnly = buildDeviceLayoutBoardV2(layout([{ name: 'Only', rows: [mixer] }]), cat)!;
    expect(mixerOnly.fixed).toBeUndefined();
    expect(keysOf(mixerOnly.boards.Only!)).toEqual(['k10', 'k11', 'k12']);
  });

  it('nothing on every page: no fixed area, the mixer of two of three pages stays where it is', () => {
    const l = layout([page('A', [0]), page('B', [1]), { name: 'C', rows: [{ section: 'parameters', controls: [ctl('knob', 2, 'P2')] }] }]);
    const b = buildDeviceLayoutBoardV2(l, cat)!;
    expect(b.fixed).toBeUndefined();
    expect(keysOf(b.boards.A!)).toEqual(['k0', 'k10', 'k11', 'k12']);
    expect(keysOf(b.boards.B!)).toEqual(['k1', 'k10', 'k11', 'k12']);
    expect(keysOf(b.boards.C!)).toEqual(['k2']);
  });

  // ── page-level controls (pageControls) ──
  const at = (x: number, y: number) => ({ placement: { positionExact: `${x},${y}` } });
  const tracking = ctl('dropdown', 32, 'Tracking Mode', { paramName: 'X_TRACKING', ...at(120, 200) });
  const deco = [ctl('label', null, 'VOICE', { rawWidget: 'sectionLabel', ...at(305, 10) }), ctl('label', null, '', { rawWidget: 'labelSeperator', ...at(200, 10) })];
  function positionedWithPageControls(): DeviceLayout {
    const pos = (ids: number[]) => ({ section: 'parameters', controls: ids.map((id, i) => ctl('knob', id, `P${id}`, at(305 + 92 * i, 50))) });
    return layout([
      { name: 'Voice 1', rows: [pos([0, 1]), mixer], pageControls: [...deco, tracking] },
      { name: 'Voice 2', rows: [pos([2, 3]), mixer], pageControls: [tracking, ctl('knob', 20, 'Own', at(305 + 92 * 2, 50))] }
    ], { family: 'X' });
  }

  it('a page-level control on every page leads the fixed area (a long select label takes two knob columns)', () => {
    const b = buildDeviceLayoutBoardV2(positionedWithPageControls(), cat)!;
    // 4 wide: 2 (select) + 2 + 2 = 6 rows > max(2, 4) → 6 wide: the select, then Mix beside it, Level / Balance below
    expect(b.fixed).toEqual({
      cols: 6,
      items: [
        { id: 'wf.e32', key: 'e32', view: 'select', x: 0, y: 0, w: 4, h: 2 },
        { id: 'wf.k10', key: 'k10', view: 'knob', x: 4, y: 0, w: 2, h: 2 },
        { id: 'wf.k11', key: 'k11', view: 'knob', x: 0, y: 2, w: 2, h: 2 },
        { id: 'wf.k12', key: 'k12', view: 'knob', x: 2, y: 2, w: 2, h: 2 }
      ]
    });
    // section titles and separators of the page level are not used
    expect(b.boards['Voice 1']!.some((i) => 'kind' in i)).toBe(false);
  });

  it('a page-level control of one page takes its exact position there', () => {
    const b = buildDeviceLayoutBoardV2(positionedWithPageControls(), cat)!;
    expect(find(b.boards['Voice 2']!, 'k20')).toMatchObject({ x: 4, y: 0, view: 'knob' });
    expect(b.pageOrder).toEqual(['Voice 1', 'Voice 2', 'More']); // k20 is on its page, not on More
    expect(keysOf(b.boards.More!)).not.toContain('k20');
  });

  it('without usable positions page-level controls flow below the parameters and a local mixer can fit beside them', () => {
    const l = layout([
      { name: 'A', rows: [{ section: 'parameters', controls: [ctl('knob', 0, 'P0'), ctl('knob', 1, 'P1'), ctl('knob', 2, 'P2')] }, { section: 'mixer', controls: [ctl('knob', 10, 'Mix')] }], pageControls: [ctl('knob', 20, 'Own', at(10, 10)), ctl('knob', 77, 'Unknown', at(20, 10)), ctl('knob', 0, 'Again', at(30, 10)), ctl('knob', 10, 'Mix', at(40, 10))] },
      { name: 'B', rows: [{ section: 'parameters', controls: [ctl('knob', 3, 'P3')] }] }
    ]);
    const A = buildDeviceLayoutBoardV2(l, cat)!.boards.A!;
    expect(keysOf(A)).toEqual(['k0', 'k1', 'k2', 'k20', 'k10']);
    expect(find(A, 'k20')).toMatchObject({ x: 0, y: 2 });
    expect(find(A, 'k10')).toMatchObject({ x: 7, y: 0 });
    expect(A).toContainEqual(expect.objectContaining({ kind: 'vdiv', label: 'Mixer', x: 6 }));
  });

  it('the cross-block guard holds for page-level controls; a page of page-level controls only is a page', () => {
    const foreign = ctl('knob', 0, 'P0', { crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: 'GLOBAL_X', paramId: 0 } as never });
    const l = layout([
      { name: 'A', rows: [{ section: 'parameters', controls: [ctl('knob', 1, 'P1')] }], pageControls: [foreign] },
      { name: 'B', rows: [], pageControls: [ctl('knob', 2, 'P2', at(10, 10))] }
    ]);
    const b = buildDeviceLayoutBoardV2(l, cat)!;
    expect(keysOf(b.boards.A!)).toEqual(['k1']);
    expect(keysOf(b.boards.B!)).toEqual(['k2']);
    expect(hasDeviceLayoutBoard(layout([l.pages[1]!]), cat)).toBe(true);
  });

  it('servers without pageControls build the same board as with an empty list; the variant signature ignores them', () => {
    const bare = positionedWithPageControls();
    const without: DeviceLayout = { ...bare, pages: bare.pages.map(({ pageControls: _pc, ...p }) => p) };
    const empty: DeviceLayout = { ...bare, pages: bare.pages.map((p) => ({ ...p, pageControls: [] })) };
    expect(buildDeviceLayoutBoardV2(empty, cat)).toEqual(buildDeviceLayoutBoardV2(without, cat));
    expect(layoutVariantSig(bare)).toBe(layoutVariantSig(without)); // a newer server never drops a user's board
    // the previous defaults never saw them
    expect(buildDeviceLayoutBoardV2(bare, cat, { withoutFixed: true })).toEqual(buildDeviceLayoutBoardV2(without, cat, { withoutFixed: true }));
  });
});
