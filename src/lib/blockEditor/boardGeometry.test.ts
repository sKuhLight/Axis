import { describe, it, expect } from 'vitest';
import { availableArea, CMIN, DENSITY, effectiveNav, layoutForPage, minimumBoardHeight, PAD_X, PAD_Y, PHONE_PAD_X, phoneCell, SEC_HEAD, visiblePages, type PageLayoutInput } from './boardGeometry';
import { PHONE_COLS, type BeControl, type BeItem } from './boardModel';

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
    expect(availableArea(1000, 400, 'top')).toEqual({ Wa: 1000 - 2 * PAD_X, Ha: 400 - 2 * PAD_Y });
    expect(availableArea(1000, 400, 'side')).toEqual({ Wa: 972, Ha: 400 - 2 * PAD_Y - SEC_HEAD });
    expect(availableArea(0, 0, 'top')).toEqual({ Wa: 772, Ha: 360 - 2 * PAD_Y }); // unmeasured → defaults
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
    expect(L.c).toBe(DENSITY.m.cmin);
    expect(L.reflow).toBe(false);
    expect(L.overflowX).toBe(true);
  });

  it('the gap costs width: a full page fits from about 1000 px at the Normal scale', () => {
    const fits = (w: number) => layoutForPage(input(w, 360), fullPage).overflowX === false;
    expect(fits(1000)).toBe(true);
    expect(fits(900)).toBe(false);
    const L = layoutForPage(input(1000, 360), fullPage);
    expect(L.c).toBe(Math.max(DENSITY.m.cmin, Math.floor((1000 - 2 * PAD_X - 23 * DENSITY.m.gap) / 24 * DENSITY.m.scale)));
    expect(L.overflowY).toBe(false);
  });

  it('1366 and 1920 px: the reference width or density cap fits the page', () => {
    for (const w of [1366, 1920]) {
      const L = layoutForPage(input(w, 360), fullPage);
      expect(L.c).toBe(Math.min(DENSITY.m.cmax, Math.floor((w - 28 - 23 * DENSITY.m.gap) / 24 * DENSITY.m.scale)));
      expect(L.overflowX || L.overflowY).toBe(false);
    }
  });

  it('uses the selected scale on ultrawide screens', () => {
    const a = layoutForPage(input(2560, 300), fullPage);
    expect(a.c).toBe(DENSITY.m.cmax);
    expect(a.overflowX).toBe(false);
    const b = layoutForPage(input(5120, 600, { density: 'l' }), fullPage);
    expect(b.c).toBe(DENSITY.l.cmax);
    expect(b.overflowX).toBe(false);
    expect(Math.floor(5120 / layoutForPage(input(5120, 600), fullPage).W)).toBeGreaterThanOrEqual(3);
  });

  it('every page shares the reference scale: a small page gets the same cell as a full one', () => {
    for (const w of [768, 1366, 2560]) {
      expect(layoutForPage(input(w, 360), smallPage).c).toBe(layoutForPage(input(w, 360), fullPage).c);
    }
  });

  it('a tall page scrolls at the same scale as the two-row reference', () => {
    const tall = knobs(2, 6); // 12 cells high
    const L = layoutForPage(input(1920, 360), tall);
    expect(L.c).toBe(layoutForPage(input(1920, 360), fullPage).c);
    expect(L.overflowY).toBe(true);
  });

  it('top navigation, page taller than the reference: vertical overflow, no reflow', () => {
    const L = layoutForPage(input(1920, 360), knobs(2, 10));
    expect(L.c).toBe(DENSITY.m.cmax);
    expect(L.reflow).toBe(false);
    expect(L.overflowY).toBe(true);
  });

  it('side navigation below the minimum: reflow into fewer columns', () => {
    const L = layoutForPage(input(500, 400, { nav: 'side' }), fullPage);
    expect(L.reflow).toBe(true);
    expect(L.cols).toBe(Math.floor((472 + DENSITY.m.gap) / (DENSITY.m.cmin + DENSITY.m.gap)));
    expect(L.c).toBeGreaterThanOrEqual(CMIN);
    expect(L.pos).toBeDefined();
    expect(Object.keys(L.pos!)).toHaveLength(24);
    for (const p of Object.values(L.pos!)) expect(p.x + p.w).toBeLessThanOrEqual(L.cols);
  });

  it('side navigation, width fine but page too tall: no reflow', () => {
    const L = layoutForPage(input(1920, 360, { nav: 'side' }), knobs(2, 10));
    expect(L.reflow).toBe(false);
    expect(L.c).toBe(DENSITY.m.cmax);
  });

  it('scales all three sizes in a shallow dock and retains the selected minimum', () => {
    const sizes = (['s', 'm', 'l'] as const).map((density) => {
      const shallow = layoutForPage(input(1740, 230, { nav: 'side', density }), fullPage);
      const minimum = minimumBoardHeight(density, 'side');
      const atMinimum = layoutForPage(input(1740, minimum, { nav: 'side', density }), fullPage);
      expect(atMinimum.c).toBe(DENSITY[density].cmin);
      expect(atMinimum.overflowY).toBe(false);
      expect(shallow.overflowY).toBe(false);
      return shallow.c;
    });
    expect(sizes[0]).toBeLessThan(sizes[1]!);
    expect(sizes[1]).toBeLessThan(sizes[2]!);
  });

  it('arrange mode shows the full 24-cell surface plus a spare row, at the frozen cell', () => {
    const L = layoutForPage(input(1920, 360, { editMode: true, frozenCell: 33 }), smallPage);
    expect(L.c).toBe(33);
    expect(L.cols).toBe(24);
    expect(L.rows).toBeGreaterThanOrEqual(3);
    const unfrozen = layoutForPage(input(375, 320, { editMode: true }), fullPage);
    expect(unfrozen.c).toBe(DENSITY.m.cmin);
    expect(unfrozen.reflow).toBe(false);
  });
});

describe('beside a fixed area', () => {
  const list = [{ id: 'a', key: 'k1', view: 'knob' as const, x: 0, y: 0, w: 2, h: 2 }];
  const inp = { bodyW: 628, bodyH: 900, nav: 'side' as const, density: 'l' as const, editMode: false };
  it('uses the cell fitted to the combined width', () => {
    expect(layoutForPage(inp, list).c).toBe(DENSITY.l.cmin);
    expect(layoutForPage({ ...inp, sharedCell: 33 }, list).c).toBe(33);
  });
});

describe('phone layout (8 cells wide, cell = width / 8)', () => {
  const row12 = knobs(12, 1); // one 12-knob row
  const phone = (bodyW: number, extra: Partial<PageLayoutInput> = {}) => input(bodyW, 600, { nav: 'side', phone: true, ...extra });
  const knobPx = (c: number, g: number) => 2 * c + g;

  it('re-wraps every page to 8 cells: a 12-knob row becomes three rows of four', () => {
    const L = layoutForPage(phone(390), row12);
    expect(L.phone).toBe(true);
    expect(L.reflow).toBe(false); // not the side navigation's "compact view"
    expect(L.cols).toBe(PHONE_COLS);
    expect(L.rows).toBe(6);
    expect(L.pos).toBeDefined();
    const lines = new Map<number, number>();
    for (const p of Object.values(L.pos!)) lines.set(p.y, (lines.get(p.y) ?? 0) + 1);
    expect([...lines.values()]).toEqual([4, 4, 4]);
  });

  it('the cell is the available width / 8 within the minimum and the control size', () => {
    // 390: (390 − 16 − 7·gap) / 8 = 34 → the width decides (the cap is higher)
    expect(phoneCell(390, 'm')).toBe(Math.floor((390 - 2 * PHONE_PAD_X - 7 * DENSITY.m.gap) / 8));
    expect(knobPx(phoneCell(390, 'm'), DENSITY.m.gap)).toBe(2 * phoneCell(390, 'm') + DENSITY.m.gap);
    // 360: the same width rule → a knob of two cells and the gap
    expect(phoneCell(360, 'm')).toBe(Math.floor((360 - 2 * PHONE_PAD_X - 7 * DENSITY.m.gap) / 8));
    expect(knobPx(phoneCell(360, 'm'), DENSITY.m.gap)).toBeGreaterThanOrEqual(72);
    expect(phoneCell(360, 'l')).toBe(Math.floor((360 - 2 * PHONE_PAD_X - 7 * DENSITY.l.gap) / 8));
    expect(phoneCell(390, 's')).toBe(DENSITY.s.phoneMax);
    expect(phoneCell(160, 'm')).toBe(CMIN); // a very narrow board keeps the minimum cell (and scrolls sideways)
    expect(layoutForPage(phone(160), row12).overflowX).toBe(true);
    // a phone profile in a wide window: the cap keeps normal knobs, still eight cells
    const wide = layoutForPage(phone(1200), row12);
    expect(wide.c).toBe(DENSITY.m.phoneMax);
    expect(wide.W).toBe(8 * (DENSITY.m.phoneMax + DENSITY.m.gap) - DENSITY.m.gap);
    expect(wide.overflowX).toBe(false);
  });

  it('the height does not shrink the cell: a tall page scrolls', () => {
    const tall = layoutForPage(input(390, 300, { nav: 'side', phone: true }), knobs(12, 4));
    expect(tall.c).toBe(phoneCell(390, 'm'));
    expect(tall.rows).toBe(24);
    expect(tall.overflowY).toBe(true);
  });

  it('never applies while arranging (arrange is not offered on the phone anyway)', () => {
    const L = layoutForPage(phone(390, { editMode: true, frozenCell: 30 }), row12);
    expect(L.phone).toBeUndefined();
    expect(L.cols).toBe(24);
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
