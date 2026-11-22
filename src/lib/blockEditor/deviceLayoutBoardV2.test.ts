import { describe, it, expect } from 'vitest';
import { buildCuratedBoardV2, buildDeviceLayoutBoardV2, GAP_CELLS } from './deviceLayoutBoardV2';
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
