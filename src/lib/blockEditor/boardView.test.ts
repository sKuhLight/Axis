import { describe, it, expect } from 'vitest';
import {
  activeAfterScroll,
  anchorKey,
  autoScrollDelta,
  AUTOSCROLL_STEP,
  dialSize,
  dragNorm,
  dropCell,
  fitFont,
  fitValueText,
  grabCell,
  highlightedPages,
  hoverActionPx,
  hoverActionsFit,
  isFlatMeter,
  isPinnableKind,
  keySteps,
  labelPx,
  layoutBoardPages,
  meterFill,
  meterTag,
  meterText,
  meterTone,
  offsetInPage,
  onDrawnItems,
  pagePinIds,
  pxOf,
  resizeBy,
  scrollAtOffset,
  scrollTargetFor,
  sectionExtents,
  sharedCell,
  spareRowsFor,
  SPINE_GAP,
  SPINE_W,
  STRIP_EXTRA,
  STRIP_PAD_FIRST,
  STRIP_PAD_LEFT,
  STRIP_PAD_RIGHT,
  stripChrome,
  tileContentBox,
  visiblePages,
  waveBars,
  wheelToStrip
} from './boardView';
import { CMIN, DENSITY, PAD_Y, SEC_HEAD } from './boardGeometry';
import { addControl, isDivider, MAXC, moveItem, normalizeBoard, tidy, type BeBoard, type BeControl, type BeItem } from './boardModel';
import { stepNorm } from './valueFormat';

const knobs = (cols: number, rows: number, prefix = 'k'): BeItem[] => {
  const out: BeControl[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ id: `${prefix}${r}_${c}`, key: `${prefix}${r * 100 + c}`, view: 'knob', x: c * 2, y: r * 2, w: 2, h: 2 });
  return out;
};

describe('strip chrome', () => {
  it('reserves room for the spine so one full page fits the board exactly', () => {
    expect(stripChrome(true)).toBe(STRIP_PAD_FIRST + SPINE_W + SPINE_GAP + STRIP_PAD_RIGHT);
    expect(stripChrome(false)).toBe(STRIP_PAD_LEFT + SPINE_W + SPINE_GAP + STRIP_PAD_RIGHT);
    const bodyW = 1400;
    const L = layoutBoardPages([{ page: 'A', items: knobs(12, 1) }], { bodyW, bodyH: 600, nav: 'top', density: 'l', editMode: false });
    // the reference width leaves the first section's chrome inside the board
    expect(L.A!.W + stripChrome(true)).toBeLessThanOrEqual(bodyW);
    expect(STRIP_EXTRA).toBeGreaterThan(0);
  });
});

describe('layoutBoardPages', () => {
  const base = { bodyW: 1600, bodyH: 300, nav: 'top' as const, density: 'm' as const, editMode: false };

  it('gives every page the same cell (the smallest per-page fit)', () => {
    const L = layoutBoardPages(
      [
        { page: 'Short', items: knobs(3, 1) },
        { page: 'Tall', items: knobs(3, 3) }
      ],
      base
    );
    expect(L.Short!.c).toBe(L.Tall!.c);
    // the tall page is the limiting one: 6 rows of cells fit the height
    const fh = Math.floor((300 - 2 * PAD_Y - 5 * DENSITY.m.gap) / 6);
    expect(L.Tall!.c).toBe(Math.min(DENSITY.m.cmax, fh));
    expect(L.Short!.W).toBe(6 * (L.Short!.c + DENSITY.m.gap) - DENSITY.m.gap);
    expect(L.Short!.overflowY).toBe(false);
    expect(L.Tall!.overflowY).toBe(false);
  });

  it('caps the cell by density on a wide, tall board', () => {
    const L = layoutBoardPages([{ page: 'A', items: knobs(2, 1) }], { ...base, bodyW: 5120, bodyH: 1400, density: 's' });
    expect(L.A!.c).toBe(DENSITY.s.cmax);
  });

  it('re-flows a too-narrow page in the side navigation and leaves it out of the shared cell', () => {
    const L = layoutBoardPages(
      [
        { page: 'Wide', items: knobs(12, 1) },
        { page: 'Small', items: knobs(2, 1) }
      ],
      { bodyW: 560, bodyH: 900, nav: 'side', density: 'm', editMode: false }
    );
    expect(L.Wide!.reflow).toBe(true);
    expect(L.Wide!.pos).toBeTruthy();
    expect(L.Small!.reflow).toBe(false);
    expect(sharedCell(L)).toBe(L.Small!.c);
  });

  it('scrolls sideways (no reflow) below the minimum cell in the strip', () => {
    const L = layoutBoardPages([{ page: 'Wide', items: knobs(12, 1) }], { bodyW: 400, bodyH: 900, nav: 'top', density: 'm', editMode: false });
    expect(L.Wide!.reflow).toBe(false);
    expect(L.Wide!.c).toBe(CMIN);
    expect(L.Wide!.overflowX).toBe(true);
  });

  it('uses the frozen cell in arrange mode and shows the full 24-cell width', () => {
    const L = layoutBoardPages([{ page: 'A', items: knobs(2, 1) }], { ...base, editMode: true, frozenCell: 31 });
    expect(L.A!.c).toBe(31);
    expect(L.A!.cols).toBe(MAXC);
    expect(L.A!.rows).toBeGreaterThanOrEqual(3);
  });

  it('returns nothing for no pages', () => {
    expect(layoutBoardPages([], base)).toEqual({});
    expect(sharedCell({})).toBeNull();
  });
});

describe('sectionExtents', () => {
  const secs = [
    { page: 'A', W: 300, H: 100 },
    { page: 'B', W: 200, H: 500 },
    { page: 'C', W: 100, H: 50 }
  ];

  it('lays strip sections side by side with their spine chrome', () => {
    const s = sectionExtents('top', secs, 400);
    expect(s.map((x) => x.page)).toEqual(['A', 'B', 'C']);
    expect(s[0]).toEqual({ page: 'A', start: 0, size: stripChrome(true) + 300 });
    expect(s[1]).toEqual({ page: 'B', start: stripChrome(true) + 300, size: stripChrome(false) + 200 });
    expect(s[2]!.start).toBe(s[1]!.start + s[1]!.size);
  });

  it('stacks side sections, each at least one board high', () => {
    const s = sectionExtents('side', secs, 400);
    expect(s[0]).toEqual({ page: 'A', start: 0, size: 400 });
    expect(s[1]).toEqual({ page: 'B', start: 400, size: PAD_Y * 2 + SEC_HEAD + 500 });
    expect(s[2]!.start).toBe(400 + PAD_Y * 2 + SEC_HEAD + 500);
  });
});

describe('scrollTargetFor', () => {
  const s = [
    { page: 'A', start: 0, size: 500 },
    { page: 'B', start: 500, size: 500 },
    { page: 'C', start: 1000, size: 300 }
  ];
  it('brings a page to the start, clamped to the scroll range', () => {
    expect(scrollTargetFor(s, 'A', 600)).toBe(0);
    expect(scrollTargetFor(s, 'B', 600)).toBe(500);
    expect(scrollTargetFor(s, 'C', 600)).toBe(700); // total 1300 − viewport 600
    expect(scrollTargetFor(s, 'Nope', 600)).toBeNull();
  });
});

describe('keeping a page in place across an arrange edit', () => {
  it('restores the viewport offset into the page after the sections moved', () => {
    const before = [
      { page: 'A', start: 0, size: 600 },
      { page: 'B', start: 600, size: 400 }
    ];
    // the viewport starts 120 px into B; A grows by 80 px (an item dropped onto it in the side stack)
    const off = offsetInPage(before, 'B', 720);
    expect(off).toBe(120);
    const after = [
      { page: 'A', start: 0, size: 680 },
      { page: 'B', start: 680, size: 400 }
    ];
    expect(scrollAtOffset(after, 'B', off!)).toBe(800);
    // a viewport that started before the page (the first page, clamped scroll) never goes below 0
    expect(scrollAtOffset(after, 'A', -30)).toBe(0);
    expect(offsetInPage(before, 'Nope', 0)).toBeNull();
    expect(scrollAtOffset(after, 'Nope', 0)).toBeNull();
  });
});

describe('visible and active pages', () => {
  const s = [
    { page: 'A', start: 0, size: 500 },
    { page: 'B', start: 500, size: 500 },
    { page: 'C', start: 1000, size: 500 }
  ];

  it('reports every page at least half in view', () => {
    expect(visiblePages(s, { start: 0, size: 1600 })).toEqual(['A', 'B', 'C']);
    expect(visiblePages(s, { start: 300, size: 600 })).toEqual(['B']);
    expect(visiblePages(s, { start: 250, size: 800 })).toEqual(['A', 'B']);
  });

  it('keeps the current page while it is visible, else takes the first visible one', () => {
    expect(activeAfterScroll(['A', 'B'], 'B', 10, 0)).toBeNull();
    expect(activeAfterScroll(['B', 'C'], 'A', 10, 0)).toBe('B');
    expect(activeAfterScroll([], 'A', 10, 0)).toBeNull();
  });

  it('changes nothing while a programmatic scroll holds the lock', () => {
    expect(activeAfterScroll(['C'], 'A', 100, 900)).toBeNull();
    expect(activeAfterScroll(['C'], 'A', 900, 900)).toBe('C');
  });

  it('highlights the visible pages, or the active one before the first measure', () => {
    expect([...highlightedPages(['A', 'B'], 'A')]).toEqual(['A', 'B']);
    expect([...highlightedPages([], 'C')]).toEqual(['C']);
  });
});

describe('wheelToStrip', () => {
  const wide = { scrollWidth: 2000, clientWidth: 1000, scrollHeight: 300, clientHeight: 300 };
  it('turns a vertical wheel into a sideways scroll in the strip', () => {
    expect(wheelToStrip('top', { deltaX: 0, deltaY: 40, deltaMode: 0 }, wide)).toBe(40);
    expect(wheelToStrip('top', { deltaX: 0, deltaY: 3, deltaMode: 1 }, wide)).toBe(48);
  });
  it('keeps the default wheel otherwise', () => {
    expect(wheelToStrip('side', { deltaX: 0, deltaY: 40, deltaMode: 0 }, wide)).toBeNull();
    expect(wheelToStrip('top', { deltaX: 50, deltaY: 40, deltaMode: 0 }, wide)).toBeNull();
    expect(wheelToStrip('top', { deltaX: 0, deltaY: 40, deltaMode: 0 }, { ...wide, scrollWidth: 1000 })).toBeNull();
    expect(wheelToStrip('top', { deltaX: 0, deltaY: 40, deltaMode: 0 }, { ...wide, scrollHeight: 600 })).toBeNull();
  });
});

describe('value keys and drags', () => {
  it('maps arrow and page keys to steps', () => {
    expect(keySteps('ArrowUp')).toBe(1);
    expect(keySteps('ArrowRight')).toBe(1);
    expect(keySteps('ArrowDown')).toBe(-1);
    expect(keySteps('ArrowLeft')).toBe(-1);
    expect(keySteps('PageUp')).toBe(10);
    expect(keySteps('PageDown')).toBe(-10);
    expect(keySteps('Enter')).toBeNull();
    expect(keySteps('a')).toBeNull();
  });

  it('steps 1 % per key, 0.1 % with Shift, clamped', () => {
    const p = { norm: 0.5, min: 0, max: 10 };
    expect(stepNorm(p, keySteps('ArrowUp')!, false)).toBeCloseTo(0.51, 6);
    expect(stepNorm(p, keySteps('ArrowDown')!, true)).toBeCloseTo(0.499, 6);
    expect(stepNorm({ ...p, norm: 0.995 }, keySteps('PageUp')!, false)).toBe(1);
  });

  it('drags 0.005 per px, ten times finer with Shift, clamped to 0..1', () => {
    expect(dragNorm(0.5, 20, false)).toBeCloseTo(0.6, 6);
    expect(dragNorm(0.5, 20, true)).toBeCloseTo(0.51, 6);
    expect(dragNorm(0.5, -200, false)).toBe(0);
    expect(dragNorm(0.9, 200, false)).toBe(1);
  });
});

describe('tile sizes', () => {
  it('fits the dial into the tile, leaving room for the label', () => {
    expect(dialSize(84, 84, 12)).toBe(66);
    expect(dialSize(400, 84, 12)).toBe(66);
    expect(dialSize(10, 10, 12)).toBe(22);
    expect(dialSize(900, 900, 12)).toBe(220);
  });
  it('fits a read-out: full text when it fits, else the number alone', () => {
    expect(fitValueText('7.00', 80, 16)).toEqual({ text: '7.00', font: 16 });
    expect(fitValueText('−15.0 dB', 60, 16)).toEqual({ text: '−15.0 dB', font: 12 });
    expect(fitValueText('−15.0 dB', 26, 16)).toEqual({ text: '−15.0', font: 8 });
    expect(fitValueText('−15.0 dB', 20, 16, 8)).toEqual({ text: '−15.0', font: 8 });
  });
  it('fits UI text (option names, on / off states) into narrow tiles down to a minimum size', () => {
    expect(fitFont('Off', 80, 12.5)).toBe(12.5);
    // 7 glyphs × 0.6 em: 42 px wide → 10 px
    expect(fitFont('Sum L+R', 42, 12.5)).toBe(10);
    expect(fitFont('Engaged', 40, 12.5)).toBe(9.5);
    // too narrow for the minimum: the minimum (the text ellipsises)
    expect(fitFont('Mute FX Out', 30, 12.5)).toBe(9);
    expect(fitFont('Mute FX Out', 30, 12.5, 8)).toBe(8);
    expect(fitFont('', -5, 12)).toBe(9);
  });
  it('lays a meter flat when it is wider than tall', () => {
    expect(isFlatMeter(6, 1)).toBe(true);
    expect(isFlatMeter(2, 4)).toBe(false);
    expect(isFlatMeter(2, 2)).toBe(false);
  });
});

describe('meters', () => {
  const m = (paramName: string, role: string, norm: number, db: number | null = null) => ({ paramName, role, norm, db });
  it('fills gain reduction inverted, levels directly', () => {
    expect(meterFill(m('X', 'gainReduction', 0.8))).toBeCloseTo(0.2, 6);
    expect(meterFill(m('X', 'level', 0.8))).toBe(0.8);
    expect(meterFill(null)).toBe(0);
  });
  it('colours by threshold', () => {
    expect(meterTone(0.95)).toBe('danger');
    expect(meterTone(0.92)).toBe('danger');
    expect(meterTone(0.8)).toBe('amber');
    expect(meterTone(0.5)).toBe('accent');
  });
  it('tags bars', () => {
    expect(meterTag(m('OUT_VUL', 'vu', 0))).toBe('L');
    expect(meterTag(m('OUT_VUR', 'vu', 0))).toBe('R');
    expect(meterTag(m('COMP_GAINMON2', 'gainReduction', 0))).toBe('2');
    expect(meterTag(m('COMP_GR', 'gainReduction', 0))).toBe('GR');
    expect(meterTag(m('X', 'vu', 0))).toBe('VU');
    expect(meterTag(m('X', 'level', 0))).toBe('·');
  });
  it('reads out dB, else percent, else a dash', () => {
    expect(meterText(m('X', 'level', 0.5, -12.34))).toBe('-12.3 dB');
    expect(meterText(m('X', 'level', 0.5, 1))).toBe('+1.0 dB');
    expect(meterText(m('X', 'level', 0.5))).toBe('50%');
    expect(meterText(null)).toBe('—');
  });
});

describe('waveBars', () => {
  it('downsamples to peaks', () => {
    expect(waveBars([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
    expect(waveBars([], 4)).toEqual([]);
    expect(waveBars(null, 4)).toEqual([]);
    expect(waveBars([0.5], 3)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('anchorKey', () => {
  it('changes with the navigation, the board size or a cell size, not with anything else', () => {
    const L = { A: { c: 30 }, B: { c: 30 } };
    const k = anchorKey('top', 1200, 300, L);
    expect(anchorKey('top', 1200, 300, { A: { c: 30 }, B: { c: 30 } })).toBe(k);
    expect(anchorKey('side', 1200, 300, L)).not.toBe(k);
    expect(anchorKey('top', 1100, 300, L)).not.toBe(k);
    expect(anchorKey('top', 1200, 280, L)).not.toBe(k);
    expect(anchorKey('top', 1200, 300, { A: { c: 32 }, B: { c: 32 } })).not.toBe(k);
  });
});

describe('arrange on drawn items only', () => {
  // the meter is kept on the board but not drawn (metering off): it must not block its cells
  const board = (): BeBoard => ({
    v: 2,
    pageOrder: ['A'],
    page: 'A',
    boards: {
      A: [
        { id: 'k', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
        { id: 'm', key: 'meter', view: 'meter', x: 2, y: 0, w: 2, h: 4 }
      ]
    }
  });
  const shown = (it: BeItem) => isDivider(it) || it.key !== 'meter';

  it('moves onto cells a hidden item occupies and keeps the hidden item on its page', () => {
    expect(moveItem(board(), 'k', 'A', 2, 0).ok).toBe(false);
    const r = onDrawnItems(board(), shown, (b) => moveItem(b, 'k', 'A', 2, 0));
    expect(r.ok).toBe(true);
    expect(r.board.boards.A!.map((it) => it.id)).toEqual(['k', 'm']);
    expect(r.board.boards.A![0]).toMatchObject({ x: 2, y: 0 });
    // when the meter is listed again, the load-time normalization moves IT aside, the knob stays
    const back = normalizeBoard(r.board, ['k1', 'meter']);
    expect(back.boards.A!.find((it) => it.id === 'k')).toMatchObject({ x: 2, y: 0 });
    const m = back.boards.A!.find((it) => it.id === 'm')!;
    expect(m.x >= 4 || m.y >= 2).toBe(true);
  });

  it('adds at the first spot free of drawn items and tidies around hidden ones', () => {
    const add = onDrawnItems(board(), shown, (b) => addControl(b, 'A', { key: 'k2', view: 'knob' }, null, () => 'n'));
    expect(add.board.boards.A!.find((it) => it.id === 'n')).toMatchObject({ x: 2, y: 0 });
    const t = onDrawnItems(board(), shown, (b) => ({ ok: true, board: { ...b, boards: { ...b.boards, A: tidy(b.boards.A!) } } }));
    expect(t.board.boards.A!.some((it) => it.id === 'm')).toBe(true);
  });

  it('returns the input board for a failed or no-op operation', () => {
    const b = board();
    expect(onDrawnItems(b, shown, (x) => moveItem(x, 'k', 'A', 0, 0)).board).toBe(b);
    expect(onDrawnItems(b, shown, (x) => moveItem(x, 'k', 'A', 30, 0)).board).toBe(b);
    expect(onDrawnItems(b, () => true, (x) => moveItem(x, 'k', 'A', 0, 0)).board).toBe(b);
  });
});

describe('arrange helpers', () => {
  it('keeps enough spare rows that a 2-high control can be dropped into a new row under the content', () => {
    // one row of knobs (2 high) in a short panel: the fitted rows alone would end right under it
    const items = knobs(3, 1);
    const pages = [{ page: 'A', items }];
    expect(spareRowsFor(pages)).toBe(2);
    expect(spareRowsFor([{ page: 'E', items: [] }])).toBe(1);
    const L = layoutBoardPages(pages, { bodyW: 1600, bodyH: 60, nav: 'top', density: 'm', editMode: true, frozenCell: 30 })['A']!;
    expect(L.rows).toBeGreaterThanOrEqual(4);
    // the pointer two cells below the content: the knob lands at y = 2 (a new row), not clamped back
    const st = L.c + L.g;
    const hit = { left: 0, top: 0, zoom: 1, c: L.c, g: L.g, cols: L.cols, rows: L.rows };
    expect(dropCell(st * 8 + 2, st * 2 + 2, hit, { w: 2, h: 2 }, { cx: 0, cy: 0 })).toEqual({ x: 8, y: 2 });
    // a 4-high fader dragged in from another page also fits below the content
    const tall = layoutBoardPages([...pages, { page: 'B', items: [{ id: 'f', key: 'k9', view: 'fader', x: 0, y: 0, w: 2, h: 4 }] }], {
      bodyW: 1600,
      bodyH: 60,
      nav: 'top',
      density: 'm',
      editMode: true,
      frozenCell: 30
    })['A']!;
    expect(tall.rows).toBeGreaterThanOrEqual(2 + 4);
  });
  const grid = { left: 100, top: 50, zoom: 1, c: 30, g: 4, cols: 24, rows: 8 };

  it('drops at the pointer cell minus the grab offset, clamped inside the grid', () => {
    expect(dropCell(100 + 34 * 5 + 2, 50 + 34 * 2 + 2, grid, { w: 2, h: 2 }, { cx: 0, cy: 0 })).toEqual({ x: 5, y: 2 });
    expect(dropCell(100 + 34 * 5 + 2, 50 + 34 * 2 + 2, grid, { w: 2, h: 2 }, { cx: 1, cy: 1 })).toEqual({ x: 4, y: 1 });
    expect(dropCell(0, 0, grid, { w: 2, h: 2 }, { cx: 0, cy: 0 })).toEqual({ x: 0, y: 0 });
    expect(dropCell(5000, 5000, grid, { w: 2, h: 2 }, { cx: 0, cy: 0 })).toEqual({ x: 22, y: 6 });
  });

  it('compensates an ancestor zoom', () => {
    expect(dropCell(100 + 2 * 34 * 5 + 4, 50, { ...grid, zoom: 2 }, { w: 2, h: 2 }, { cx: 0, cy: 0 })).toEqual({ x: 5, y: 0 });
    expect(grabCell(100 + 2 * 34 + 4, 50, { left: 100, top: 50 }, 2, 34, { w: 2, h: 2 })).toEqual({ cx: 1, cy: 0 });
  });

  it('clamps the grab cell to the item', () => {
    expect(grabCell(1000, 1000, { left: 0, top: 0 }, 1, 34, { w: 2, h: 3 })).toEqual({ cx: 1, cy: 2 });
  });

  it('snaps a corner drag to whole cells', () => {
    expect(resizeBy({ w: 2, h: 2 }, 50, -10, 34, 1)).toEqual({ w: 3, h: 2 });
    expect(resizeBy({ w: 2, h: 2 }, 68, 68, 34, 2)).toEqual({ w: 3, h: 3 });
  });

  it('auto-scrolls near the edges only', () => {
    expect(autoScrollDelta(105, 100, 900)).toBe(-AUTOSCROLL_STEP);
    expect(autoScrollDelta(895, 100, 900)).toBe(AUTOSCROLL_STEP);
    expect(autoScrollDelta(500, 100, 900)).toBe(0);
  });

  it('keeps the middle of a short board free of auto-scroll', () => {
    // a 53 px board: 13.25 px bands at each end, the rest scrolls nothing
    expect(autoScrollDelta(712 + 10, 712, 765)).toBe(-AUTOSCROLL_STEP);
    expect(autoScrollDelta(765 - 10, 712, 765)).toBe(AUTOSCROLL_STEP);
    expect(autoScrollDelta(712 + 20, 712, 765)).toBe(0);
    expect(autoScrollDelta(765 - 20, 712, 765)).toBe(0);
  });

  it('collects the pinnable parameter ids of a page once each', () => {
    const cat = new Map([
      ['k1', { id: 1, kind: 'cont' }],
      ['e2', { id: 2, kind: 'select' }],
      ['bypass', { id: -2, kind: 'action' }],
      ['meter', { id: -3, kind: 'meter' }]
    ]);
    const items: BeItem[] = [
      { id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
      { id: 'b', key: 'bypass', view: 'action', x: 2, y: 0, w: 2, h: 1 },
      { id: 'c', key: 'e2', view: 'select', x: 4, y: 0, w: 2, h: 2 },
      { id: 'd', kind: 'hdiv', x: 0, y: 3, w: 6, h: 1 },
      { id: 'e', key: 'gone', view: 'knob', x: 6, y: 0, w: 2, h: 2 }
    ];
    expect(pagePinIds(items, cat)).toEqual([1, 2]);
    expect(isPinnableKind({ id: 3, kind: 'toggle' })).toBe(true);
    expect(isPinnableKind({ id: -1, kind: 'cont' })).toBe(false);
  });
});

describe('hover actions (⚡ / ∿) only where they leave the control free', () => {
  // a tile of w × h cells at cell size c (gap 4), as BeControl measures it
  const fits = (view: string, w: number, h: number, c: number) => {
    const pxW = pxOf(w, c, 4);
    const pxH = pxOf(h, c, 4);
    const box = tileContentBox(view, { pxW, pxH, c, lf: labelPx(c), showLabel: h >= 2 });
    return hoverActionsFit(view, h, pxW, pxH, hoverActionPx(c), box);
  };
  it('never on a one-row tile: its control fills the height', () => {
    for (const v of ['slider', 'button', 'switch', 'select', 'number']) expect(fits(v, 2, 1, 50)).toBe(false);
    expect(fits('slider', 6, 1, 40)).toBe(false);
    expect(fits('button', 4, 1, 50)).toBe(false);
  });
  it('a knob keeps the corners of its dial free', () => {
    expect(fits('knob', 2, 2, 32)).toBe(true);
    expect(fits('knob', 4, 4, 50)).toBe(true);
  });
  it('a full-width pill or field needs a free strip above it', () => {
    expect(fits('button', 2, 2, 40)).toBe(false);
    expect(fits('select', 2, 2, 40)).toBe(false);
    expect(fits('button', 2, 2, 50)).toBe(true);
    expect(fits('select', 4, 2, 50)).toBe(true);
  });
  it('a narrow control leaves room beside it; a fader needs a wide tile', () => {
    expect(fits('switch', 2, 2, 40)).toBe(true);
    expect(fits('fader', 1, 4, 40)).toBe(false);
    expect(fits('fader', 2, 4, 40)).toBe(false);
    expect(fits('fader', 3, 4, 40)).toBe(true);
  });
  it('a two-row slider shows them above its row; a small number tile does not', () => {
    expect(fits('slider', 6, 2, 40)).toBe(true);
    expect(fits('number', 2, 2, 40)).toBe(false);
  });
  it('the content box mirrors the tile layout', () => {
    expect(tileContentBox('switch', { pxW: 84, pxH: 84, c: 40, lf: 11, showLabel: true })).toEqual({ w: 42, h: 24 + 15 });
    expect(tileContentBox('button', { pxW: 84, pxH: 40, c: 40, lf: 11, showLabel: false })).toEqual({ w: 84, h: 29 });
    expect(tileContentBox('meter', { pxW: 84, pxH: 172, c: 40, lf: 11, showLabel: true })).toEqual({ w: 84, h: 172 });
  });
});
