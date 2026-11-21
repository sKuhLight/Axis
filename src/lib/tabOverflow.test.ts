import { describe, expect, it } from 'vitest';
import { computeTabOverflow, menuAnchorPlacement, nextMenuIndex, splitTabs, toLayoutPx } from './tabOverflow';
import { effectiveZoom, resolveMenuPlacement } from './workbench/svelte/contextMenu';

// ILLUSTRATIVE natural widths (px) in the settings dialog's order: Account, Storage, Connection, Performance, Privacy,
// About, Debug. Real label widths depend on the font, so these pin the ARITHMETIC of the split, not what a given
// dialog width shows in the browser.
const SEVEN = [67, 67, 88, 96, 67, 52, 52];
const FIVE = [67, 88, 67, 52, 52]; // no Storage, no Performance
const MORE = 33;
const GAP = 2;
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

describe('computeTabOverflow', () => {
  it('everything fits: all tabs visible and no ⋯ button', () => {
    expect(computeTabOverflow(FIVE, 366, MORE, GAP)).toEqual({ visible: 5, hasMore: false });
    // exactly full (widths + gaps) still fits — the ⋯ is only reserved when something overflows
    const exact = sum(FIVE) + GAP * (FIVE.length - 1);
    expect(computeTabOverflow(FIVE, exact, MORE, GAP)).toEqual({ visible: 5, hasMore: false });
  });

  it('one pixel short flips to the overflow layout (the ⋯ then also needs room)', () => {
    const exact = sum(FIVE) + GAP * (FIVE.length - 1);
    const r = computeTabOverflow(FIVE, exact - 1, MORE, GAP);
    expect(r.hasMore).toBe(true);
    expect(r.visible).toBeLessThan(5);
  });

  it('some overflow: the largest leading run that fits TOGETHER WITH the ⋯ button stays', () => {
    // With the illustrative widths above: k=3 -> 222 + 3 gaps*2 + 33 = 261 fits; k=4 -> 318 + 4 gaps*2 + 33 = 359
    // does not fit 357 (or 358) but fits 359.
    expect(computeTabOverflow(SEVEN, 357, MORE, GAP)).toEqual({ visible: 3, hasMore: true });
    expect(computeTabOverflow(SEVEN, 358, MORE, GAP)).toEqual({ visible: 3, hasMore: true });
    // one more pixel and the 4th tab stays
    expect(computeTabOverflow(SEVEN, 359, MORE, GAP)).toEqual({ visible: 4, hasMore: true });
    // a narrower row: the 5-tab set keeps 3 (222 + 6 + 33 = 261 <= 292 < 315), the rest are in the menu
    expect(computeTabOverflow(FIVE, 292, MORE, GAP)).toEqual({ visible: 3, hasMore: true });
  });

  it('never keeps a run whose total (tabs + gaps + ⋯) exceeds the available width', () => {
    for (let room = 1; room <= 520; room++) {
      const { visible, hasMore } = computeTabOverflow(SEVEN, room, MORE, GAP);
      if (!hasMore) {
        expect(visible).toBe(SEVEN.length);
        expect(sum(SEVEN) + GAP * (SEVEN.length - 1)).toBeLessThanOrEqual(room);
      } else {
        expect(visible).toBeLessThan(SEVEN.length);
        // k=0 is "just the ⋯ button"; it may exceed a tiny room, nothing smaller exists
        if (visible > 0) expect(sum(SEVEN.slice(0, visible)) + GAP * visible + MORE).toBeLessThanOrEqual(room);
        // maximal: one more tab would not fit
        if (visible + 1 < SEVEN.length) expect(sum(SEVEN.slice(0, visible + 1)) + GAP * (visible + 1) + MORE).toBeGreaterThan(room);
      }
    }
  });

  it('visible count only shrinks as the room shrinks', () => {
    let prev = SEVEN.length;
    for (let room = 520; room >= 0; room--) {
      const { visible } = computeTabOverflow(SEVEN, room, MORE, GAP);
      expect(visible).toBeLessThanOrEqual(prev);
      prev = visible;
    }
  });

  it('not even one tab fits next to the ⋯ button: only the ⋯ is shown', () => {
    expect(computeTabOverflow(SEVEN, 60, MORE, GAP)).toEqual({ visible: 0, hasMore: true });
    expect(computeTabOverflow(SEVEN, 33, MORE, GAP)).toEqual({ visible: 0, hasMore: true });
  });

  it('zero / negative / NaN width: nothing fits, every tab is reachable through the ⋯ menu', () => {
    for (const room of [0, -50, NaN, -Infinity]) {
      expect(computeTabOverflow(SEVEN, room, MORE, GAP)).toEqual({ visible: 0, hasMore: true });
    }
  });

  it('no tabs: nothing to show, no ⋯', () => {
    expect(computeTabOverflow([], 366, MORE, GAP)).toEqual({ visible: 0, hasMore: false });
    expect(computeTabOverflow([], 0, MORE, GAP)).toEqual({ visible: 0, hasMore: false });
  });

  it('defaults gap to 0 and treats junk widths as 0 (a not-yet-measured tab never blocks the row)', () => {
    expect(computeTabOverflow([50, 50, 50], 150, 30)).toEqual({ visible: 3, hasMore: false });
    expect(computeTabOverflow([50, NaN, 50], 100, 30)).toEqual({ visible: 3, hasMore: false });
    expect(computeTabOverflow([50, 50, 50], 149, 30)).toEqual({ visible: 2, hasMore: true });
  });
});

describe('splitTabs', () => {
  const tabs = ['account', 'storage', 'device', 'performance', 'privacy', 'about', 'debug'].map((id) => ({ id }));

  it('everything visible: nothing hidden, never an active state on the ⋯', () => {
    const r = splitTabs(tabs, 7, 'debug');
    expect(r.shown.map((t) => t.id)).toEqual(tabs.map((t) => t.id));
    expect(r.hidden).toEqual([]);
    expect(r.activeHidden).toBe(false);
  });

  it('keeps the normal order on both sides of the cut', () => {
    const r = splitTabs(tabs, 3, 'account');
    expect(r.shown.map((t) => t.id)).toEqual(['account', 'storage', 'device']);
    expect(r.hidden.map((t) => t.id)).toEqual(['performance', 'privacy', 'about', 'debug']);
  });

  it('active tab visible: the ⋯ is not active', () => {
    expect(splitTabs(tabs, 3, 'device').activeHidden).toBe(false);
  });

  it('active tab hidden: the ⋯ shows the active state', () => {
    expect(splitTabs(tabs, 3, 'privacy').activeHidden).toBe(true);
    expect(splitTabs(tabs, 6, 'debug').activeHidden).toBe(true);
    expect(splitTabs(tabs, 0, 'account').activeHidden).toBe(true);
  });

  it('clamps a nonsensical visible count instead of throwing', () => {
    expect(splitTabs(tabs, -4, 'x').shown).toEqual([]);
    expect(splitTabs(tabs, 99, 'x').hidden).toEqual([]);
    expect(splitTabs(tabs, 2.9, 'x').shown.length).toBe(2);
    expect(splitTabs(tabs, NaN, 'x').shown.length).toBe(7);
  });
});

describe('nextMenuIndex', () => {
  it('moves down and up, wrapping at both ends', () => {
    expect(nextMenuIndex(0, 1, 4)).toBe(1);
    expect(nextMenuIndex(3, 1, 4)).toBe(0);
    expect(nextMenuIndex(1, -1, 4)).toBe(0);
    expect(nextMenuIndex(0, -1, 4)).toBe(3);
  });
  it('with nothing focused yet: ArrowDown goes to the first item, ArrowUp to the last', () => {
    expect(nextMenuIndex(-1, 1, 4)).toBe(0);
    expect(nextMenuIndex(-1, -1, 4)).toBe(3);
  });
  it('a single item stays put; an empty menu has no target', () => {
    expect(nextMenuIndex(0, 1, 1)).toBe(0);
    expect(nextMenuIndex(0, -1, 1)).toBe(0);
    expect(nextMenuIndex(-1, 1, 0)).toBe(-1);
  });
});

describe('toLayoutPx (UI-scale zoom)', () => {
  it('is the identity without zoom', () => {
    expect(toLayoutPx(440, 1)).toBe(440);
  });

  it('divides a zoomed (visual) getBoundingClientRect width back to layout px', () => {
    expect(toLayoutPx(572, 1.3)).toBeCloseTo(440, 6); // 130% UI scale
    expect(toLayoutPx(352, 0.8)).toBeCloseTo(440, 6); // 80% UI scale
  });

  it('treats a nonsensical zoom as 1 instead of dividing by it', () => {
    for (const z of [0, -1, NaN, Infinity]) expect(toLayoutPx(100, z)).toBe(100);
  });

  it('with effectiveZoom: every zoom in the 80-130% range measures the same layout width as 100%', () => {
    const layoutCard = 440; // offsetWidth of the card — layout px, unaffected by zoom
    const layoutTab = 62.4;
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25, 1.3]) {
      const z = effectiveZoom(layoutCard * zoom, layoutCard); // what the component calibrates from the card
      expect(z).toBeCloseTo(zoom, 9);
      expect(toLayoutPx(layoutTab * zoom, z)).toBeCloseTo(layoutTab, 9);
    }
  });

  it('without the conversion the room is over-estimated by the zoom factor (the bug it prevents)', () => {
    const zoom = 1.3;
    const barLayout = 366; // what offsetWidth / computed padding give
    const barVisualRect = barLayout * zoom; // what getBoundingClientRect gives
    expect(barVisualRect - barLayout).toBeGreaterThan(100); // ~110px too much room if mixed
    expect(toLayoutPx(barVisualRect, zoom)).toBeCloseTo(barLayout, 9);
  });
});

describe('menuAnchorPlacement', () => {
  const VIEWPORT = { height: 900 };
  const MENU = { width: 156, height: 149 };

  it('desktop card: right edge aligned with the anchor, `gap` below it', () => {
    expect(menuAnchorPlacement({ top: 14, right: 386, bottom: 48 }, MENU, VIEWPORT, 4)).toEqual({ x: 230, y: 52, side: 'below' });
  });

  it('opens ABOVE when it does not fit below but fits above (the bottom sheet case)', () => {
    // 375x812 sheet: the ⋯ sits at y 681-715, a 149px menu below would end at 868 > 804
    const r = menuAnchorPlacement({ top: 681, right: 321, bottom: 715 }, MENU, { height: 812 }, 4);
    expect(r.side).toBe('above');
    expect(r.y).toBe(681 - 4 - 149); // menu bottom = anchor top - gap
    expect(r.y + MENU.height + 4).toBe(681);
    expect(r.x).toBe(321 - 156); // right edge still aligned
  });

  it('stays below when it fits below, even if it would also fit above', () => {
    expect(menuAnchorPlacement({ top: 400, right: 300, bottom: 434 }, MENU, VIEWPORT, 4).side).toBe('below');
  });

  it('fit boundary: the last pixel that still fits below keeps it below, one more flips it above', () => {
    const margin = 8;
    const top = VIEWPORT.height - margin - MENU.height - 4 - 34; // bottom + gap + height == viewport - margin
    expect(menuAnchorPlacement({ top, right: 300, bottom: top + 34 }, MENU, VIEWPORT, 4).side).toBe('below');
    expect(menuAnchorPlacement({ top: top + 1, right: 300, bottom: top + 35 }, MENU, VIEWPORT, 4).side).toBe('above');
  });

  it('fits neither below nor above (tiny viewport): falls back to below for the caller to clamp', () => {
    const r = menuAnchorPlacement({ top: 100, right: 300, bottom: 134 }, MENU, { height: 200 }, 4);
    expect(r.side).toBe('below');
    expect(r.y).toBe(138);
    // the shared clamp then pins it on screen instead of leaving it off the bottom edge
    const p = resolveMenuPlacement(r, { width: 400, height: 200 }, MENU, 1);
    expect(p.y).toBeGreaterThanOrEqual(8);
    expect(p.y + MENU.height).toBeLessThanOrEqual(200 - 8);
  });

  it('above is only taken when the menu really fits there with the margin (not a clipped flip)', () => {
    // anchor near the top of a short viewport: above would start at y < margin
    expect(menuAnchorPlacement({ top: 100, right: 300, bottom: 134 }, MENU, { height: 260 }, 4).side).toBe('below');
  });

  it('through the shared zoom-aware placement the fixed menu lands on the anchor at any UI scale, both sides', () => {
    const viewport = { width: 1600, height: 900 };
    for (const zoom of [0.8, 1, 1.3]) {
      const m = { width: 156 * zoom, height: 149 * zoom }; // visual box of the menu
      // below: anchor near the top
      const top = { top: 14 * zoom + 60, right: 386 * zoom + 300, bottom: 48 * zoom + 60 };
      const b = menuAnchorPlacement(top, m, viewport, 4 * zoom);
      expect(b.side).toBe('below');
      const pb = resolveMenuPlacement(b, viewport, m, zoom);
      expect(pb.x * zoom).toBeCloseTo(top.right - m.width, 6);
      expect(pb.y * zoom).toBeCloseTo(top.bottom + 4 * zoom, 6);
      // above: anchor near the bottom
      const bottom = { top: 800, right: 600, bottom: 834 };
      const a = menuAnchorPlacement(bottom, m, viewport, 4 * zoom);
      expect(a.side).toBe('above');
      const pa = resolveMenuPlacement(a, viewport, m, zoom);
      expect(pa.x * zoom).toBeCloseTo(bottom.right - m.width, 6);
      expect(pa.y * zoom + m.height + 4 * zoom).toBeCloseTo(bottom.top, 6); // menu bottom + gap = anchor top
    }
  });

  it('clamps into the viewport instead of opening off-screen (⋯ close to the left edge)', () => {
    const m = { width: 156, height: 140 };
    const r = menuAnchorPlacement({ top: 14, right: 53, bottom: 48 }, m, { height: 300 }, 4);
    const p = resolveMenuPlacement(r, { width: 400, height: 300 }, m, 1);
    expect(p.x).toBeGreaterThanOrEqual(8);
  });
});
