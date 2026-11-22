import { describe, it, expect } from 'vitest';
import { availableArea, CMIN, DENSITY, effectiveNav, layoutForPage, PAD_X, SEC_HEAD, visiblePages, type PageLayoutInput } from './boardGeometry';
import type { BeControl, BeItem } from './boardModel';

const knobs = (cols: number, rows: number): BeItem[] => {
  const out: BeControl[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ id: `k${r}_${c}`, key: `k${r * 100 + c}`, view: 'knob', x: c * 2, y: r * 2, w: 2, h: 2 });
  return out;
};
const fullPage = knobs(12, 2); // 24 cells wide, 4 cells high
const smallPage = knobs(2, 1); // 4 cells wide, 2 cells high
const input = (bodyW: number, bodyH: number, extra: Partial<PageLayoutInput> = {}): PageLayoutInput => ({
  bodyW,
  bodyH,
  nav: 'top',
  density: 'm',
  editMode: false,
  ...extra
});

describe('effectiveNav', () => {
  it('uses the side navigation only from 560 px', () => {
    expect(effectiveNav('side', 560)).toBe('side');
    expect(effectiveNav('side', 559)).toBe('top');
    expect(effectiveNav('side', 375)).toBe('top');
    expect(effectiveNav('top', 1920)).toBe('top');
  });
});

describe('availableArea', () => {
  it('subtracts padding and, in the side navigation, the section heading', () => {
    expect(availableArea(1000, 400, 'top')).toEqual({ Wa: 1000 - 2 * PAD_X, Ha: 380 });
    expect(availableArea(1000, 400, 'side')).toEqual({ Wa: 972, Ha: 380 - SEC_HEAD });
    expect(availableArea(0, 0, 'top')).toEqual({ Wa: 772, Ha: 340 }); // unmeasured → defaults
  });
});

describe('layoutForPage across viewports', () => {
  const widths: [string, number, number][] = [
    ['phone 375', 375, 320],
    ['tablet 768', 768, 360],
    ['laptop 1366', 1366, 360],
    ['desktop 1920', 1920, 400],
    ['ultrawide 2560×720', 2560, 300],
    ['32:9 5120×1440', 5120, 600]
  ];
  for (const [name, w, h] of widths) {
    it(`${name}: cell never below the minimum, capped by density`, () => {
      for (const density of ['s', 'm', 'l'] as const) {
        const L = layoutForPage(input(w, h, { density }), fullPage);
        expect(L.c).toBeGreaterThanOrEqual(CMIN);
        expect(L.c).toBeLessThanOrEqual(DENSITY[density].cmax);
        expect(L.g).toBe(DENSITY[density].gap);
        expect(L.W).toBe(L.cols * (L.c + L.g) - L.g);
      }
    });
  }

  it('375 px: the 24-cell page scrolls sideways at the minimum cell (top navigation)', () => {
    const L = layoutForPage(input(375, 320), fullPage);
    expect(L.c).toBe(CMIN);
    expect(L.reflow).toBe(false);
    expect(L.overflowX).toBe(true);
  });

  it('768 px: a full page fits the width exactly (cell from the 24-cell reference)', () => {
    const L = layoutForPage(input(768, 360), fullPage);
    expect(L.c).toBe(Math.floor((768 - 28 - 23 * 4) / 24)); // 27
    expect(L.overflowX).toBe(false);
    expect(L.overflowY).toBe(false);
  });

  it('1366 and 1920 px: density cap applies, no scrolling', () => {
    for (const w of [1366, 1920]) {
      const L = layoutForPage(input(w, 360), fullPage);
      expect(L.c).toBe(40);
      expect(L.overflowX || L.overflowY).toBe(false);
    }
  });

  it('2560×720 and 5120×1440: several full pages fit side by side', () => {
    const a = layoutForPage(input(2560, 300), fullPage);
    expect(a.c).toBe(40);
    expect(Math.floor(2560 / a.W)).toBeGreaterThanOrEqual(2);
    const b = layoutForPage(input(5120, 600, { density: 'l' }), fullPage);
    expect(b.c).toBe(50);
    expect(Math.floor(5120 / b.W)).toBeGreaterThanOrEqual(3);
    expect(Math.floor(5120 / layoutForPage(input(5120, 600), fullPage).W)).toBeGreaterThanOrEqual(4);
  });

  it('every page shares the reference scale: a small page gets the same cell as a full one', () => {
    for (const w of [768, 1366, 2560]) {
      expect(layoutForPage(input(w, 360), smallPage).c).toBe(layoutForPage(input(w, 360), fullPage).c);
    }
  });

  it('the height still fits per page', () => {
    const tall = knobs(2, 6); // 12 cells high
    const L = layoutForPage(input(1920, 360), tall);
    expect(L.c).toBe(Math.floor((340 - 11 * 4) / 12)); // 24
    expect(L.overflowY).toBe(false);
  });

  it('top navigation, page too tall even at the minimum: vertical overflow, no reflow', () => {
    const L = layoutForPage(input(1920, 360), knobs(2, 10));
    expect(L.c).toBe(CMIN);
    expect(L.reflow).toBe(false);
    expect(L.overflowY).toBe(true);
  });

  it('side navigation below the minimum: reflow into fewer columns', () => {
    const L = layoutForPage(input(500, 400, { nav: 'side' }), fullPage);
    expect(L.reflow).toBe(true);
    expect(L.cols).toBe(Math.floor((472 + 4) / (CMIN + 4))); // 19
    expect(L.c).toBeGreaterThanOrEqual(CMIN);
    expect(L.pos).toBeDefined();
    expect(Object.keys(L.pos!)).toHaveLength(24);
    for (const p of Object.values(L.pos!)) expect(p.x + p.w).toBeLessThanOrEqual(L.cols);
  });

  it('side navigation, width fine but page too tall: no reflow', () => {
    const L = layoutForPage(input(1920, 360, { nav: 'side' }), knobs(2, 10));
    expect(L.reflow).toBe(false);
    expect(L.c).toBe(CMIN);
  });

  it('arrange mode shows the full 24-cell surface plus a spare row, at the frozen cell', () => {
    const L = layoutForPage(input(1920, 360, { editMode: true, frozenCell: 33 }), smallPage);
    expect(L.c).toBe(33);
    expect(L.cols).toBe(24);
    expect(L.rows).toBeGreaterThanOrEqual(3);
    const unfrozen = layoutForPage(input(375, 320, { editMode: true }), fullPage);
    expect(unfrozen.c).toBe(CMIN);
    expect(unfrozen.reflow).toBe(false);
  });
});

describe('visiblePages', () => {
  const sections = [
    { page: 'A', start: 0, size: 500 },
    { page: 'B', start: 500, size: 500 },
    { page: 'C', start: 1000, size: 500 },
    { page: 'Empty', start: 1500, size: 0 }
  ];
  it('reports pages at least half in view', () => {
    expect(visiblePages(sections, { start: 0, size: 800 })).toEqual(['A', 'B']); // B is 300/500 in view
    expect(visiblePages(sections, { start: 0, size: 700 })).toEqual(['A']); // B is 200/500
    expect(visiblePages(sections, { start: 250, size: 1000 })).toEqual(['A', 'B', 'C']);
  });
  it('a page larger than the viewport counts when it fills half the viewport', () => {
    expect(visiblePages([{ page: 'Big', start: 0, size: 3000 }], { start: 1000, size: 400 })).toEqual(['Big']);
  });
  it('skips zero-size sections', () => {
    expect(visiblePages(sections, { start: 1400, size: 400 })).toEqual([]);
  });
});
