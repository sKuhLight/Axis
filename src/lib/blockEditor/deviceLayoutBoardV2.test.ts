import { describe, it, expect } from 'vitest';
import { buildCuratedBoardV2, buildDeviceLayoutBoardV2, GAP_CELLS, hasDeviceLayoutBoard } from './deviceLayoutBoardV2';
import { buildCatalog } from './catalog';
import { bbox, MAXC, normalizeBoard, type BeItem } from './boardModel';
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
    // the spacer advances one knob slot (2 cells)
    expect(find(G, 'meter')).toMatchObject({ view: 'meter', x: 4 + GAP_CELLS, y: 0, w: 2, h: 4, row: 0 });
    // the next row starts below the tallest item of the previous one (meter, 4 cells)
    expect(find(G, 'e4')).toMatchObject({ view: 'select', x: 0, y: 4, row: 1 });
    expect(find(G, 'e9')).toMatchObject({ view: 'switch', x: 2, y: 4, row: 1 });
    expect(find(G, 'k5')).toMatchObject({ view: 'slider', x: 4, y: 4, w: 6, h: 1, row: 1 });
    expect(find(G, 'bypass')).toMatchObject({ view: 'action', x: 0, y: 6, w: 2, h: 1, row: 2 });
    expect(b.variantSig).toBe(layoutVariantSig(lay));
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
    expect(more.map((i) => ('key' in i ? i.key : ''))).toEqual(['k1', 'k5', 'e4', 'e9', 'bypass', 'meter']);
    expect(find(more, 'k1')).toMatchObject({ x: 0, y: 0, w: 2, h: 2 });
    expect(find(more, 'meter')).toMatchObject({ x: 10, y: 0, w: 2, h: 4 });
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

  it('uses exact positions: knob slot = 2 cells, a title line above, the mixer section below a divider', () => {
    const modes: string[] = [];
    const b = buildDeviceLayoutBoardV2(positioned, catalog, { onPage: (p, m) => modes.push(`${p}:${m}`) })!;
    expect(modes).toEqual(['Amp:positioned', 'Tall:rows']);
    expect(b.pageOrder).toEqual(['Amp', 'Tall', 'More']);
    const A = b.boards.Amp!;
    expect(A.find((i) => 'kind' in i && i.kind === 'hdiv' && i.label === 'GAIN')).toMatchObject({ x: 0, y: 0, w: 4 });
    expect(find(A, 'k0')).toMatchObject({ x: 0, y: 1 });
    expect(find(A, 'k1')).toMatchObject({ x: 2, y: 1 });
    expect(find(A, 'e9')).toMatchObject({ x: 0, y: 3, view: 'switch' });
    expect(find(A, 'k5')).toMatchObject({ x: 2, y: 3 });
    expect(A.find((i) => 'kind' in i && i.label === 'Mixer')).toMatchObject({ kind: 'hdiv', x: 0, y: 5, h: 1 });
    expect(find(A, 'e4')).toMatchObject({ x: 0, y: 6, view: 'select' });
    expect(find(A, 'bypass')).toMatchObject({ x: 2, y: 6, view: 'action' });
    expect(b.boards.More!.map((i) => ('key' in i ? i.key : ''))).toEqual(['meter']);
    expect(b.variantSig).toBe(layoutVariantSig(positioned));
    const keys = catalog.map((c) => c.key);
    expect(normalizeBoard(b, keys)).toEqual(b);
    expect(buildDeviceLayoutBoardV2(positioned, catalog)).toEqual(b);
  });

  it('height budget: no page gets taller than the tallest page of the rows-only default (one cell size for all)', () => {
    const tallest = (b: ReturnType<typeof buildDeviceLayoutBoardV2>) => Math.max(...b!.pageOrder.map((p) => bbox(b!.boards[p]!).R));
    // without the tall page the budget is 4 (the rows-only Amp page and the meter on "More")
    const alone = layout([ampPage]);
    const modes: string[] = [];
    const b = buildDeviceLayoutBoardV2(alone, catalog, { onPage: (p, m) => modes.push(`${p}:${m}`) })!;
    const old = buildDeviceLayoutBoardV2(alone, catalog, { rowFlowOnly: true })!;
    expect(tallest(old)).toBe(4);
    expect(tallest(b)).toBeLessThanOrEqual(4);
    // the positioned page (7 rows with its title line and divider, 6 / 6 without) gave way to plain rows
    expect(modes).toEqual(['Amp:rows-plain']);
    expect(b.boards.Amp!.some((i) => 'kind' in i)).toBe(false);
    // with the tall page the full positioned page fits
    expect(tallest(buildDeviceLayoutBoardV2(positioned, catalog)!)).toBe(8);
  });

  it('rowFlowOnly builds the previous default: rows only, no positions, no dividers', () => {
    const b = buildDeviceLayoutBoardV2(positioned, catalog, { rowFlowOnly: true })!;
    const A = b.boards.Amp!;
    expect(A.some((i) => 'kind' in i)).toBe(false);
    expect(find(A, 'k0')).toMatchObject({ x: GAP_CELLS, y: 0, row: 0 }); // the title was a gap
    expect(find(A, 'e4')).toMatchObject({ x: 0, y: 2, row: 1 });
    // without placement data and sections both builds agree
    expect(buildDeviceLayoutBoardV2(lay, catalog, { rowFlowOnly: true })).toEqual(buildDeviceLayoutBoardV2(lay, catalog));
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

    it('legacyUnguarded rebuilds the previous rows-only default exactly as before the guard', () => {
      const legacy = buildDeviceLayoutBoardV2(mixed, catalog, { rowFlowOnly: true, legacyUnguarded: true })!;
      expect(find(legacy.boards.Main!, 'k0')).toMatchObject({ x: 2 });
      expect(legacy.pageOrder).toContain('Global');
      // only together with rowFlowOnly: a drawn board is always guarded
      expect(buildDeviceLayoutBoardV2(mixed, catalog, { legacyUnguarded: true })!.boards.Main!.some((i) => 'key' in i && i.key === 'k0')).toBe(false);
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
    expect(b.boards.Main!.map((i) => ('key' in i ? i.key : ''))).toEqual(['eq', 'k1', 'bypass']);
    expect(find(b.boards.Main!, 'k1')).toMatchObject({ x: 8, y: 0 });
    expect(find(b.boards.Main!, 'bypass')).toMatchObject({ x: 10, y: 0, w: 2, h: 1 });
    expect(b.boards.Advanced!.map((i) => ('key' in i ? i.key : ''))).toEqual(['k2', 'e4']);
  });
});
