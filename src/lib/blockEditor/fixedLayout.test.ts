import { describe, expect, it } from 'vitest';
import { CMIN, DENSITY, PHONE_END_PAD } from './boardGeometry';
import type { BeItem } from './boardModel';
import { sharedCell, type BoardPage } from './boardView';
import {
  BAND_CLEAR_W, BAND_PAD, BAND_SIDE_W, bandLayout, endPadOver, FIXED_DOCK_GUTTER, fixedColumnMax, fixedColumnW, fixedPlace,
  fixedRightPad, fixedViewportInset, layoutEditor, pageRefCols, PAGES_MIN_W, widthCell, type EditorLayoutInput
} from './fixedLayout';

const knob = (i: number, x: number, y: number): BeItem => ({ id: `i${i}`, key: `k${i}`, view: 'knob', x, y, w: 2, h: 2 });
/** A page `n` knobs wide and `rows` knob rows high. */
const page = (name: string, n: number, rows = 1): BoardPage => ({ page: name, items: Array.from({ length: n * rows }, (_, i) => knob(i, (i % n) * 2, Math.floor(i / n) * 2)) });
const area = (n: number, cols = 4) => ({ cols, items: Array.from({ length: n }, (_, i) => knob(100 + i, (i % (cols / 2)) * 2, Math.floor(i / (cols / 2)) * 2)) });
const input = (over: Partial<EditorLayoutInput> = {}): EditorLayoutInput => ({ mainW: 1382, bodyW: 1382, bodyH: 272, nav: 'top', density: 'm', editMode: false, ...over });

describe('the pages’ share of the 24 cells', () => {
  it('what the area leaves, or what the widest page needs', () => {
    expect(pageRefCols([page('A', 6), page('B', 10)], 4)).toBe(20);
    expect(pageRefCols([page('A', 12)], 4)).toBe(24); // a full page keeps its 24 cells
    expect(pageRefCols([page('A', 11)], 4)).toBe(22); // and one in between only what it needs
    expect(pageRefCols([], 8)).toBe(16);
  });
});

describe('column', () => {
  for (const nav of ['top', 'side'] as const) {
    it(`${nav}: pages and column have the same cell and share the width; the cell does not drop needlessly`, () => {
      for (const mainW of [700, 900, 1100, 1382, 1920, 3000]) {
        for (const density of ['s', 'm', 'l'] as const) {
          const inp = input({ mainW, nav, density, bodyH: 900 });
          const r = layoutEditor([page('A', 6), page('B', 4)], area(4), inp);
          expect(r.fixed!.place).toBe('column');
          expect(r.fixed!.c).toBe(sharedCell(r.layouts));
          expect(r.fixed!.width).toBe(fixedColumnW(4, r.fixed!.c, r.fixed!.g, nav));
          // 24 cells in all, as without an area: never much smaller than the plain board's cell
          const plain = sharedCell(layoutEditor([page('A', 6), page('B', 4)], null, { ...inp, bodyW: mainW }).layouts)!;
          expect(r.fixed!.c).toBeGreaterThanOrEqual(Math.min(plain, Math.max(CMIN, plain - 2)));
          // both fit side by side
          for (const L of Object.values(r.layouts)) if (!L.reflow && r.fixed!.c > CMIN) expect(L.W + r.fixed!.width).toBeLessThanOrEqual(mainW);
          expect(r.fixed!.c).toBeLessThanOrEqual(DENSITY[density].cmax);
        }
      }
    });
  }

  it('a 24-cell page keeps working: it takes a smaller cell, scrolls (top) or re-flows (side) below the minimum', () => {
    const wide = [page('A', 12)];
    const roomy = layoutEditor(wide, area(4), input({ bodyH: 900 }));
    expect(roomy.layouts.A!.overflowX).toBe(false);
    const c = Math.floor(widthCell(1382, 'top', 4, 24, 4));
    expect(roomy.fixed!.c).toBe(Math.min(40, c));
    const tight = layoutEditor(wide, area(4), input({ mainW: 640, bodyH: 900 }));
    expect(tight.fixed!).toMatchObject({ place: 'column', c: CMIN });
    expect(tight.layouts.A!.overflowX).toBe(true);
    const side = layoutEditor(wide, area(4), input({ mainW: 600, nav: 'side', bodyH: 900 }));
    expect(side.layouts.A!.reflow).toBe(true);
    expect(side.fixed!.c).toBe(CMIN);
  });

  it('the pages’ height sets the cell; taller contents of the area scroll inside it', () => {
    const r = layoutEditor([page('A', 4, 4)], area(20), input());
    expect(r.fixed!.c).toBe(sharedCell(r.layouts));
    expect(r.fixed!.c).toBeLessThan(40); // eight rows in 272 px
    expect(r.layouts.A!.overflowY).toBe(false);
    expect(r.fixed!.H).toBeGreaterThan(272);
    expect(layoutEditor([page('A', 4)], area(4), input()).fixed!.H).toBeLessThan(272);
  });

  it('only as many rows as it holds; arranging fills the height with room to drop, at the frozen cell', () => {
    expect(layoutEditor([page('A', 4)], area(4), input()).fixed!).toMatchObject({ rows: 4, cols: 4 });
    const ed = layoutEditor([page('A', 4)], area(4), input({ editMode: true, frozenCell: 31 }));
    expect(ed.fixed!.c).toBe(31);
    expect(ed.layouts.A!.c).toBe(31);
    expect(ed.fixed!.rows).toBeGreaterThanOrEqual(6); // the content and the tallest item
    const empty = layoutEditor([page('A', 4)], { cols: 4, items: [] }, input({ editMode: true, frozenCell: 31 }));
    expect(empty.fixed!).toMatchObject({ place: 'column', cols: 4 });
  });

  it('an item as tall as the area’s tallest can be dropped under a page while arranging', () => {
    const tall: BeItem = { id: 'f', key: 'k9', view: 'fader', x: 0, y: 0, w: 2, h: 8 };
    const ed = layoutEditor([page('A', 4)], { cols: 4, items: [tall] }, input({ editMode: true, frozenCell: 31, bodyH: 100 }));
    expect(ed.layouts.A!.rows).toBe(2 + 8);
  });

  it('insets an overlapping viewport above the floating dock opener with a gap, accounting for zoom', () => {
    const viewport = { left: 800, right: 1000, top: 500, bottom: 750 };
    const opener = { left: 890, right: 980, top: 650, bottom: 690 };
    expect(fixedViewportInset(viewport, opener, 1)).toBe(104);
    expect(fixedViewportInset(viewport, opener, 1.25)).toBe(84);
    expect(fixedViewportInset({ ...viewport, right: 880 }, opener, 1)).toBe(0);
    expect(fixedViewportInset({ ...viewport, bottom: 645 }, opener, 1)).toBe(0);
  });

  it('includes a right gutter for the workbench collapse button in both navigation modes', () => {
    for (const nav of ['top', 'side'] as const) {
      const r = layoutEditor([page('A', 4)], area(4), input({ nav, dockGutter: true }));
      expect(fixedRightPad(nav, true)).toBe(FIXED_DOCK_GUTTER);
      expect(r.fixed!.width).toBe(fixedColumnW(4, r.fixed!.c, r.fixed!.g, nav, true));
      expect(r.fixed!.width - fixedColumnW(4, r.fixed!.c, r.fixed!.g, nav)).toBe(FIXED_DOCK_GUTTER - fixedRightPad(nav));
    }
  });

  it('limits a column resize at the frozen cell size and keeps its presentation while arranging', () => {
    const width = 430;
    const cell = 20;
    const gap = 4;
    const cap = fixedColumnMax(width, cell, gap, 'top', true);
    expect(cap).toBe(5);
    expect(width - fixedColumnW(cap, cell, gap, 'top', true)).toBeGreaterThanOrEqual(PAGES_MIN_W);
    expect(width - fixedColumnW(cap + 1, cell, gap, 'top', true)).toBeLessThan(PAGES_MIN_W);
    const arranging = input({ mainW: width, editMode: true, frozenCell: cell, dockGutter: true });
    expect(layoutEditor([page('A', 4)], area(4), { ...arranging, arrangePlace: 'band' }).fixed!.place).toBe('band');
    expect(layoutEditor([page('A', 4)], area(4), { ...arranging, mainW: 300, arrangePlace: 'column' }).fixed!.place).toBe('column');
  });

  it('without a fixed area nothing changes', () => {
    const r = layoutEditor([page('A', 6)], null, input());
    expect(r.fixed).toBeNull();
    expect(r.layouts.A!.cols).toBe(12);
  });
});

describe('band', () => {
  it('always on the phone; elsewhere when a column would leave the pages less than 240 px', () => {
    const at = (mainW: number, cols = 4, phone = false) => fixedPlace({ mainW, nav: 'top', density: 'm', phone, refCols: 24 - cols, cols });
    expect(at(1382, 4, true)).toBe('band');
    expect(at(1382)).toBe('column');
    const w = fixedColumnW(4, CMIN, 4, 'top');
    expect(at(PAGES_MIN_W + w)).toBe('column');
    expect(at(PAGES_MIN_W + w - 1)).toBe('band');
    expect(at(500, 8)).toBe('column');
    expect(at(460, 8)).toBe('band');
  });

  it('the place depends on the width only: a lower board never flips it', () => {
    for (const bodyH of [40, 120, 300, 900]) {
      expect(layoutEditor([page('A', 4)], area(4), input({ mainW: 300, bodyW: 300, bodyH })).fixed!.place).toBe('band');
      expect(layoutEditor([page('A', 4)], area(4), input({ mainW: 420, bodyW: 420, bodyH })).fixed!.place).toBe('column');
    }
  });

  it('at most four knobs a row, in reading order; the first line shows, the rest counts as more', () => {
    const items: BeItem[] = [{ id: 's', key: 'e1', view: 'select', x: 0, y: 0, w: 4, h: 2 }, ...area(5).items.map((it) => ({ ...it, y: it.y + 2 }))];
    const b = bandLayout(items, 390 - BAND_PAD - BAND_CLEAR_W, 'm');
    expect(b.cols).toBe(8);
    expect(b.c).toBeGreaterThanOrEqual(CMIN);
    expect(b.W).toBeLessThanOrEqual(390 - BAND_PAD - BAND_CLEAR_W);
    expect(b.pos!.s).toMatchObject({ x: 0, y: 0, w: 4 });
    expect(b.pos!.i100).toMatchObject({ x: 4, y: 0 });
    expect(b.pos!.i101).toMatchObject({ x: 6, y: 0 });
    expect(b.pos!.i102).toMatchObject({ x: 0, y: 2 });
    expect(b).toMatchObject({ firstRows: 2, more: 3, rows: 4 });
    expect(bandLayout(area(4).items, 300, 'm')).toMatchObject({ more: 0, rows: 2 });
  });

  it('a first line with a tall control: what stands beside it and ends with it shows too', () => {
    const items: BeItem[] = [{ id: 'f', key: 'k1', view: 'fader', x: 0, y: 0, w: 2, h: 4 }, ...[0, 1, 2, 3, 4, 5, 6].map((i) => knob(i, 2 + (i % 3) * 2, Math.floor(i / 3) * 2))];
    expect(bandLayout(items, 400, 'm')).toMatchObject({ firstRows: 4, more: 1 });
  });

  it('too narrow for eight smallest cells: fewer columns, never an overflow', () => {
    const b = bandLayout(area(4).items, 150, 'm');
    expect(b.cols).toBe(6);
    expect(b.W).toBeLessThanOrEqual(150);
  });

  it('the phone keeps its controls clear of the dock opener (workbench only) and its pages full width', () => {
    const phone = (over: Partial<EditorLayoutInput>) => layoutEditor([page('A', 6)], area(6), input({ mainW: 390, bodyW: 390, bodyH: 500, nav: 'side', phone: true, ...over }));
    const wb = phone({ clearCorner: true });
    expect(wb.fixed!.side).toBe(BAND_CLEAR_W);
    expect(BAND_PAD + wb.fixed!.W).toBeLessThanOrEqual(390 - BAND_CLEAR_W);
    expect(wb.fixed!.c * 2 + wb.fixed!.g).toBeGreaterThanOrEqual(40);
    expect(phone({}).fixed!.side).toBe(BAND_SIDE_W);
    expect(wb.layouts.A!).toMatchObject({ phone: true, cols: 8 });
    expect(layoutEditor([page('A', 6)], area(6), input({ mainW: 360, bodyW: 360, nav: 'side', phone: true, clearCorner: true })).fixed!.c * 2 + 4).toBeGreaterThanOrEqual(40);
  });

  it('arranging (never on the phone): the area’s own grid, not re-packed', () => {
    const ed = layoutEditor([page('A', 4)], area(6), input({ mainW: 300, bodyW: 300, editMode: true, frozenCell: 24 }));
    expect(ed.fixed!).toMatchObject({ place: 'band', c: 24, cols: 4, more: 0 });
    expect(ed.fixed!.pos).toBeUndefined();
    expect(ed.fixed!.rows).toBeGreaterThanOrEqual(6 + 2);
  });

  it('above a band the phone’s pages keep only what it leaves of the corner clearance', () => {
    expect(endPadOver(PHONE_END_PAD, 0)).toBe(PHONE_END_PAD);
    expect(endPadOver(PHONE_END_PAD, 80)).toBe(PHONE_END_PAD - 80);
    expect(endPadOver(PHONE_END_PAD, 300)).toBe(0);
  });
});
