import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PITCH_PX,
  fitLayoutPage,
  isPositionedPage,
  layoutPage,
  MAX_TITLE_CHARS,
  measureLayoutPitch,
  measurePitch,
  neighbourDistances,
  pageEntries,
  pageRows,
  parsePositionExact,
  pitchSamples,
  placeLayoutPage,
  preferFinerSlot,
  readPlacement,
  recurringDistance,
  verticalSlot,
  wrapAnchors,
  type LayoutEntry
} from './layoutPlacement';
import { buildCatalog } from './catalog';
import { bbox, isDivider, MAX_ROWS, MAXC, normalizeBoard, type BeBoard, type BeControl, type BeDivider, type BeItem } from './boardModel';
import type { LayoutControl, LayoutPlacement, LayoutRow, LayoutWidget } from '../types';

// Small hand-written pages modelled on real device editor pages: knob lines 92 px apart, a second line
// about 110 px lower, an EQ graph at the top left, section titles ("sectionLabel") about 20 px above the
// controls they title, bold row headers ("labelBold") left of their controls, separators
// ("labelSeperator") 15 px left of the next group, a "mixer" section below the "parameters" one.

const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: `o${i}` }));
const catalog = buildCatalog({
  params: Array.from({ length: 30 }, (_, i) => ({ id: i, name: `P${i}` })),
  enums: [
    { id: 40, name: 'Bright', options: opts(2) },
    { id: 41, name: 'Mode', options: opts(4) },
    ...[42, 43, 44, 45, 46, 47, 48, 49].map((id) => ({ id, name: `E${id}`, options: opts(4) }))
  ],
  eqBandCount: 5,
  monitors: [{ role: 'vu' }]
});
const byKey = new Map(catalog.map((c) => [c.key, c]));

const ctl = (widget: LayoutWidget, paramId: number | null, placement?: LayoutPlacement, rawWidget: string = widget, label = ''): LayoutControl => ({
  label,
  paramName: paramId == null ? null : `P_${paramId}`,
  paramId,
  widget,
  rawWidget,
  ...(placement ? { placement } : {})
});
const knob = (id: number, placement?: LayoutPlacement) => ctl('knob', id, placement);
const drop = (id: number, placement?: LayoutPlacement) => ctl('dropdown', id, placement, 'dropdown1');
const slider = (id: number, placement?: LayoutPlacement) => ctl('slider', id, placement);
const at = (x: number, y: number): LayoutPlacement => ({ positionExact: `${x},${y}` });
const col = (c: number, extra: Partial<LayoutPlacement> = {}): LayoutPlacement => ({ col: c, ...extra });
const title = (text: string, placement?: LayoutPlacement) => ctl('label', null, placement, 'sectionLabel', text);
const bold = (text: string, placement?: LayoutPlacement) => ctl('label', null, placement, 'labelBold', text);
const sep = (placement?: LayoutPlacement) => ctl('label', null, placement, 'labelSeperator', 'Seperator');
const graph = (placement?: LayoutPlacement) => ctl('graph', null, placement, 'graph_eq');
const row = (controls: LayoutControl[], section = 'parameters'): LayoutRow => ({ section, controls });

/** One page → items (page index 0). */
const entriesOf = (rows: LayoutRow[]) => pageEntries(rows, byKey);
const place = (rows: LayoutRow[], o: Partial<Parameters<typeof placeLayoutPage>[1]> = {}) => placeLayoutPage(entriesOf(rows), { pageIndex: 0, ...o });
const ctlOf = (items: BeItem[], key: string) => items.find((i): i is BeControl => !isDivider(i) && i.key === key)!;
const pos = (items: BeItem[], key: string) => {
  const c = ctlOf(items, key);
  return { x: c.x, y: c.y };
};
const dividers = (items: BeItem[]) => items.filter(isDivider) as BeDivider[];
const overlaps = (a: BeItem, b: BeItem) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const noOverlaps = (items: BeItem[]) => {
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (overlaps(items[i]!, items[j]!)) return `${items[i]!.id} × ${items[j]!.id}`;
  return null;
};
const insidePage = (items: BeItem[]) => items.every((i) => i.x >= 0 && i.y >= 0 && i.x + i.w <= MAXC);
/** Keys in reading order (line, then column). */
const readingKeys = (items: BeItem[], keys: string[]) =>
  keys
    .map((k) => ctlOf(items, k))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((c) => c.key);
/** The keys of one device line keep their left-to-right order on the board. */
const orderKept = (items: BeItem[], keys: string[]) => expect(readingKeys(items, keys)).toEqual(keys);

/** x of the k-th knob slot on a 92 px grid that starts at 305 px. */
const kx = (k: number) => 305 + 92 * k;

describe('parsePositionExact / readPlacement', () => {
  it('reads "x,y" pixel strings, whitespace allowed', () => {
    expect(parsePositionExact('305,50')).toEqual({ x: 305, y: 50 });
    expect(parsePositionExact(' 305 , 50 ')).toEqual({ x: 305, y: 50 });
    expect(parsePositionExact('12.5,7')).toEqual({ x: 12.5, y: 7 });
  });
  it('ignores garbage', () => {
    for (const v of [true, false, 12, null, undefined, {}, '', 'abc', '305', '305,50,1', '305;50', 'NaN,5', '1e3,5', ',5', '5,'])
      expect(parsePositionExact(v)).toBeNull();
  });
  it('reads col and nudges defensively', () => {
    expect(readPlacement({ placement: { col: 3, offsetX: 52, offsetY: -70 } })).toEqual({ exact: null, col: 3, dx: 52, dy: -70 });
    expect(readPlacement({ placement: { col: -1, offsetX: 'x' } as never })).toEqual({ exact: null, col: null, dx: 0, dy: 0 });
    expect(readPlacement({ placement: 'nonsense' as never })).toEqual({ exact: null, col: null, dx: 0, dy: 0 });
    expect(readPlacement({})).toEqual({ exact: null, col: null, dx: 0, dy: 0 });
  });
});

describe('pitch detection', () => {
  it('neighbour distances along a line / a column; under 30 px they never count', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 92, y: 4 },
      { x: 184, y: 0 },
      { x: 0, y: 160 },
      { x: 200, y: 0 } // 16 px right of the third: an overlapping alternate, not a slot
    ];
    expect(neighbourDistances(pts, 'x', 24).sort((a, b) => a - b)).toEqual([92, 92]);
    expect(neighbourDistances(pts, 'y', 30)).toEqual([160]);
  });
  it('takes the smallest distance that recurs, not the smallest one', () => {
    expect(recurringDistance([300, 92, 45, 93, 92])).toBe(92);
    expect(recurringDistance([45, 45, 92, 92])).toBe(45); // a recurring small distance wins …
    expect(recurringDistance([100, 200])).toBeNull(); // … a lone one never sets the pitch
    expect(recurringDistance([])).toBeNull();
  });
  it('measures knobs first (square buttons sit closer than a knob slot)', () => {
    const knobs = [0, 1, 2].map((k) => ({ p: { x: kx(k), y: 50 }, view: 'knob' as const }));
    const buttons = [0, 34, 68].map((d) => ({ p: { x: 800 + d, y: 300 }, view: 'button' as const }));
    expect(measurePitch([...knobs, ...buttons])).toMatchObject({ x: 92 });
    expect(measurePitch(buttons)).toMatchObject({ x: 34 });
  });
  it('knobs on every second slot between dropdowns: the finer all-controls slot', () => {
    // knob, dropdown, knob, dropdown … 83 px apart; the knobs alone recur at 166 px
    const line = [0, 1, 2, 3, 4, 5].map((k) => ({ p: { x: 305 + 83 * k, y: 230 }, view: k % 2 ? ('select' as const) : ('knob' as const) }));
    expect(measurePitch(line)).toMatchObject({ x: 83 });
    expect(preferFinerSlot(166, 83)).toBe(83);
    expect(preferFinerSlot(92, 60)).toBe(92); // not a multiple
    expect(preferFinerSlot(92, 34)).toBe(92); // too narrow for a slot
    expect(preferFinerSlot(92, null)).toBe(92);
    expect(preferFinerSlot(null, 83)).toBe(83);
  });
  it('the vertical pitch ignores thin controls stacked tighter than 0.6 slot', () => {
    const s = [
      { p: { x: 305, y: 50 }, view: 'knob' as const },
      { p: { x: 397, y: 50 }, view: 'knob' as const },
      { p: { x: 305, y: 210 }, view: 'knob' as const },
      { p: { x: 397, y: 210 }, view: 'knob' as const },
      { p: { x: 600, y: 50 }, view: 'select' as const },
      { p: { x: 600, y: 80 }, view: 'select' as const },
      { p: { x: 700, y: 50 }, view: 'select' as const },
      { p: { x: 700, y: 80 }, view: 'select' as const }
    ];
    expect(measurePitch(s)).toMatchObject({ x: 92, y: 160 });
  });
  it('the layout-wide slot needs at least three distances from at least two pages', () => {
    const line = (y: number, n: number, d: number) => Array.from({ length: n }, (_, k) => ({ p: { x: 305 + d * k, y }, view: 'knob' as const }));
    // one page with two cab sections 215 px apart: never the slot of every page
    expect(measureLayoutPitch([line(50, 3, 215), []])).toEqual({ x: null, y: null });
    // three distances, but all on one page
    expect(measureLayoutPitch([line(50, 4, 92)])).toEqual({ x: null, y: null });
    // two pages: it counts
    expect(measureLayoutPitch([line(50, 3, 92), line(50, 3, 93)]).x).toBeCloseTo(92.5, 0);
  });
  it('a vertical distance that does not recur: the layout-wide vertical slot (scaled), else the device proportion', () => {
    const rows = [row([0, 1, 2, 3].map((k) => knob(k, at(kx(k), 50)))), row([knob(4, at(kx(0), 160))])];
    const entries = entriesOf(rows);
    expect(measurePitch(pitchSamples(entries))).toMatchObject({ x: 92, y: null });
    expect(verticalSlot(92, null)).toBeCloseTo((92 * DEFAULT_PITCH_PX.y) / DEFAULT_PITCH_PX.x);
    expect(pos(placeLayoutPage(entries, { pageIndex: 0 }), 'k4')).toEqual({ x: 0, y: 2 });
    expect(verticalSlot(92, { x: 184, y: 240 })).toBe(120);
    expect(pos(placeLayoutPage(entries, { pageIndex: 0, layoutPitch: { x: 184, y: 240 } }), 'k4')).toEqual({ x: 0, y: 2 });
  });
});

describe('positioned pages', () => {
  it('one regular knob row: a knob slot is 2 cells, all on one line, gaps kept', () => {
    const items = place([row([0, 1, 2, 4, 5].map((k) => knob(k, at(kx(k), 50))))]);
    expect([0, 1, 2, 4, 5].map((k) => pos(items, `k${k}`))).toEqual([0, 2, 4, 8, 10].map((x) => ({ x, y: 0 })));
    expect(new Set(items.map((i) => (i as BeControl).row))).toEqual(new Set([0]));
    expect(layoutPage(entriesOf([row([0, 1].map((k) => knob(k, at(kx(k), 50))))]), { pageIndex: 0 }).positioned).toBe(true);
  });

  it('two rows: the second line one knob lower, in its columns', () => {
    const items = place([
      row([knob(0, at(kx(0), 50)), knob(1, at(kx(1), 50)), knob(2, at(kx(2), 50)), knob(3, at(kx(4), 50))]),
      row([knob(4, at(kx(0), 160)), ctl('toggle', 40, at(kx(2), 160))])
    ]);
    expect(pos(items, 'k3')).toEqual({ x: 8, y: 0 });
    expect(pos(items, 'k4')).toEqual({ x: 0, y: 2 });
    expect(ctlOf(items, 'e40')).toMatchObject({ x: 4, y: 2, view: 'switch' });
    expect(ctlOf(items, 'k0').row).toBe(0);
    expect(ctlOf(items, 'k4').row).toBe(1);
  });

  it('an outlier distance does not set the pitch', () => {
    const items = place([row([knob(0, at(kx(0), 50)), knob(1, at(kx(1), 50)), knob(2, at(kx(2), 50)), knob(3, at(1100, 50))])]);
    expect([0, 1, 2].map((k) => pos(items, `k${k}`).x)).toEqual([0, 2, 4]);
    expect(pos(items, 'k3')).toEqual({ x: 17, y: 0 }); // (1100 − 305) / 92 × 2 = 17.3
  });

  it('a wide control (EQ graph) at its top-left with its BE_SPEC size, the knobs below stay free', () => {
    const items = place([row([graph(at(315, 30)), ...[0, 1, 2, 3].map((k) => knob(k, at(kx(k), 250)))])]);
    expect(ctlOf(items, 'eq')).toMatchObject({ x: 0, y: 0, w: 8, h: 4 });
    expect([0, 1, 2, 3].map((k) => pos(items, `k${k}`))).toEqual([0, 2, 4, 6].map((x) => ({ x, y: 4 })));
    expect(noOverlaps(items)).toBeNull();
  });

  it('a large view gives up height first, then width, before it moves (only its lower right blocked)', () => {
    // a knob under the graph's right end, one line lower than the graph is tall
    const items = place([row([graph(at(305, 20)), knob(0, at(kx(0), 20 + 110 * 2)), knob(1, at(kx(6), 20 + 110)), knob(2, at(kx(7), 20 + 110))])]);
    // k1 sits at (12, 2): the graph keeps its full 8 width at its anchor and gives up height (4 → 2? no: minH 3)
    const eq = ctlOf(items, 'eq');
    expect(eq).toMatchObject({ x: 0, y: 0 });
    expect(eq.h).toBeGreaterThanOrEqual(3);
    expect(noOverlaps(items)).toBeNull();
    // only the lower right blocked: height first keeps the full width
    const lr = place([row([graph(at(305, 20)), knob(0, at(kx(0), 20 + 110 * 4)), knob(1, at(kx(3), 20 + 165)), knob(2, at(kx(4), 20 + 165))])]);
    expect(ctlOf(lr, 'eq')).toMatchObject({ x: 0, y: 0, w: 8, h: 3 });
    expect(noOverlaps(lr)).toBeNull();
  });

  it('shared anchors are alternates: the first keeps the spot, the other flows below, nothing else moves', () => {
    // PEQ-like: a gain knob and a slope selector on one anchor (the device shows one or the other)
    const items = place([row([knob(0, at(kx(0), 50)), knob(1, at(kx(1), 50)), drop(41, at(kx(1), 50)), knob(2, at(kx(2), 50)), knob(3, at(kx(3), 50))])]);
    expect([0, 1, 2, 3].map((k) => pos(items, `k${k}`))).toEqual([0, 2, 4, 6].map((x) => ({ x, y: 0 })));
    expect(pos(items, 'e41')).toEqual({ x: 0, y: 2 });
    orderKept(items, ['k0', 'k1', 'k2', 'k3']);
    expect(noOverlaps(items)).toBeNull();
  });

  it('collisions that are not alternates: the later one goes to the nearest free spot (≤ 15 % displaced)', () => {
    // nine knobs on one line, the 6th sits 2/3 slot right of the 5th (not an alternate, but overlapping)
    const xs = [0, 1, 2, 3, 4, 4.66, 6, 7, 8].map(kx);
    const items = place([row(xs.map((x, k) => knob(k, at(x, 50))))]);
    expect(layoutPage(entriesOf([row(xs.map((x, k) => knob(k, at(x, 50))))]), { pageIndex: 0 }).positioned).toBe(true);
    expect([0, 1, 2, 3, 4, 6, 7, 8].map((k) => pos(items, `k${k}`).x)).toEqual([0, 2, 4, 6, 8, 12, 14, 16]);
    expect(pos(items, 'k5')).toEqual({ x: 10, y: 0 }); // nearest free spot on its line
    orderKept(items, xs.map((_, k) => `k${k}`));
  });

  it('more than 15 % of the standard controls displaced: the page is laid out by rows', () => {
    // thin one-line selectors stacked 55 px apart in two columns (a setup page): every second one collides
    const rows = [row([0, 1, 2, 3].flatMap((i) => [drop(42 + i, at(305, 60 + 55 * i)), drop(46 + i, at(431, 60 + 55 * i))]))];
    const r = layoutPage(entriesOf(rows), { pageIndex: 0 });
    expect(r.positioned).toBe(false);
    // the row flow: layout order, nothing lost or overlapping
    expect(readingKeys(r.items, ['e42', 'e46', 'e43', 'e47', 'e44', 'e48', 'e45', 'e49'])).toEqual(['e42', 'e46', 'e43', 'e47', 'e44', 'e48', 'e45', 'e49']);
    expect(noOverlaps(r.items)).toBeNull();
  });

  it('a page of only large views (dense sliders) has nothing to measure: rows', () => {
    const rows = [row(Array.from({ length: 8 }, (_, k) => slider(k, at(305 + 40 * k, 100))))];
    const r = layoutPage(entriesOf(rows), { pageIndex: 0 });
    expect(r.positioned).toBe(false);
    orderKept(r.items, Array.from({ length: 8 }, (_, k) => `k${k}`));
    expect(noOverlaps(r.items)).toBeNull();
  });

  it('dense sliders beside knobs keep their order (a running cursor per line)', () => {
    const rows = [row([knob(0, at(kx(0), 50)), knob(1, at(kx(1), 50)), knob(2, at(kx(2), 50)), ...[3, 4, 5].map((k, i) => slider(k, at(kx(3) + 40 * i, 50)))])];
    const r = layoutPage(entriesOf(rows), { pageIndex: 0 });
    expect(r.positioned).toBe(true);
    orderKept(r.items, ['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
    expect(noOverlaps(r.items)).toBeNull();
    // the knobs keep their spots
    expect([0, 1, 2].map((k) => pos(r.items, `k${k}`))).toEqual([0, 2, 4].map((x) => ({ x, y: 0 })));
  });

  it('a page wider than 24 cells wraps by slot: reading order kept, knob slots kept, no odd gaps', () => {
    const keys = Array.from({ length: 16 }, (_, k) => `k${k}`);
    const items = place([row(Array.from({ length: 16 }, (_, k) => knob(k, at(kx(k), 50))))]);
    expect(insidePage(items)).toBe(true);
    expect(noOverlaps(items)).toBeNull();
    orderKept(items, keys);
    // twelve on the first line, the rest one knob line lower from the left
    expect(keys.slice(0, 12).map((k) => pos(items, k))).toEqual(Array.from({ length: 12 }, (_, i) => ({ x: i * 2, y: 0 })));
    expect(keys.slice(12).map((k) => pos(items, k))).toEqual(Array.from({ length: 4 }, (_, i) => ({ x: i * 2, y: 2 })));
    // a second device line moves down below the wrapped part
    const two = place([row(Array.from({ length: 14 }, (_, k) => knob(k, at(kx(k), 50)))), row([knob(20, at(kx(0), 160))])]);
    expect(pos(two, 'k12')).toEqual({ x: 0, y: 2 });
    expect(pos(two, 'k20')).toEqual({ x: 0, y: 4 });
    orderKept(two, [...Array.from({ length: 14 }, (_, k) => `k${k}`), 'k20']);
  });

  it('wrapAnchors cuts at the last slot boundary no anchor straddles', () => {
    const a = [
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 20, y: 0, w: 8, h: 4 }, // straddles 24 → moves on
      { x: 30, y: 0, w: 2, h: 2 }
    ];
    wrapAnchors(a, (p, q) => p.x - q.x);
    expect(a).toEqual([
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 0, y: 4, w: 8, h: 4 },
      { x: 10, y: 4, w: 2, h: 2 }
    ]);
  });

  it('a section title above the controls gets a line of its own and spans the run below it', () => {
    const items = place([row([title('TONE', at(kx(1), 29)), ...[0, 1, 2, 3, 4].map((k) => knob(k, at(kx(k), 50)))])]);
    expect(dividers(items)).toEqual([{ id: 'w0.div0', kind: 'hdiv', x: 2, y: 0, w: 8, h: 1, label: 'TONE' }]);
    expect(pos(items, 'k0')).toEqual({ x: 0, y: 1 });
    expect(noOverlaps(items)).toBeNull();
  });

  it('titles: the free line above when there is one, else one inserted line, never stacked', () => {
    // a graph at the top leaves room for the titles on the line above the knobs
    const roomy = place([
      row([graph(at(315, 30)), title('RANGE', at(400, 209)), knob(0, at(kx(1), 230)), knob(1, at(kx(2), 230)), title('LFO', at(584, 209))]),
      row([drop(41, at(kx(3), 230)), knob(2, at(kx(4), 230)), knob(3, at(kx(5), 230))])
    ]);
    const [range, lfo] = dividers(roomy);
    expect(range).toMatchObject({ label: 'RANGE', x: 2 });
    expect(lfo).toMatchObject({ label: 'LFO', x: 6, w: 6, y: range!.y }); // over Mode, P2, P3
    expect(pos(roomy, 'k0').y).toBe(range!.y + 1);
    expect(noOverlaps(roomy)).toBeNull();

    // two tightly packed knob lines: a line is inserted for the title, the lower line moves down
    const tight = place([
      row([0, 1, 2, 3].map((k) => knob(k, at(kx(k), 50)))),
      row([title('DYNAMICS', at(kx(1), 140)), ...[4, 5, 6, 7].map((k, i) => knob(k, at(kx(i), 160)))])
    ]);
    expect(dividers(tight)).toEqual([{ id: 'w0.div0', kind: 'hdiv', x: 2, y: 2, w: 6, h: 1, label: 'DYNAMICS' }]);
    expect(pos(tight, 'k4')).toEqual({ x: 0, y: 3 });

    // two titles over the same controls: the second would stack under the first — it is left out
    const stacked = place([row([title('A', at(kx(0), 10)), title('B', at(kx(0), 29)), ...[0, 1].map((k) => knob(k, at(kx(k), 50)))])]);
    expect(dividers(stacked).map((d) => d.label)).toEqual(['A']);
    // titles 'free': no inserted line, the title is left out
    expect(dividers(place([row([title('TONE', at(kx(1), 29)), ...[0, 1, 2].map((k) => knob(k, at(kx(k), 50)))])], { titles: 'free' }))).toEqual([]);
  });

  it('row headers (a bold label left of its controls on the same line) and labels with nothing under them are no titles', () => {
    // a setup page: "INPUT 1" / "INPUT 2" head their lines from the left, "CONFIG" titles both columns
    const items = place([
      row([
        title('CONFIG', at(305, 29)),
        bold('INPUT 1', at(305, 60)),
        knob(0, at(390, 60)),
        knob(1, at(482, 60)),
        bold('INPUT 2', at(305, 170)),
        knob(2, at(390, 170)),
        knob(3, at(482, 170)),
        title('NOTHING BELOW', at(900, 29))
      ])
    ]);
    expect(dividers(items).map((d) => [d.label, d.x, d.w])).toEqual([['CONFIG', 0, 4]]);
    orderKept(items, ['k0', 'k1']);
    expect(pos(items, 'k2')).toEqual({ x: 0, y: 3 });
    // long text is a note, not a title
    expect(entriesOf([row([title('x'.repeat(MAX_TITLE_CHARS + 1)), knob(0)])]).map((e) => e.kind)).toEqual(['gap', 'tile']);
  });

  it('bold headings are titles too, unless they show a live parameter of the block', () => {
    const items = place([row([bold('CAB 1', at(kx(0), 29)), ...[0, 1, 2].map((k) => knob(k, at(kx(k), 50))), ctl('label', 5, at(kx(4), 50), 'labelBold', 'Level')])]);
    expect(dividers(items)).toEqual([{ id: 'w0.div0', kind: 'hdiv', x: 0, y: 0, w: 6, h: 1, label: 'CAB 1' }]);
    expect(ctlOf(items, 'k5')).toBeTruthy(); // bound to a live parameter: stays a control
    const noEq = new Map([...byKey].filter(([k]) => k !== 'eq')); // (on a block with an EQ graph a label stands for the graph)
    expect(pageEntries([row([ctl('label', null, undefined, 'labelSliderTicks', '0 5 10'), knob(0)])], noEq).map((e) => e.kind)).toEqual(['gap', 'tile']);
  });

  it('controls of another block (cross-block refs) are gaps; a bold heading bound to one is a title (AXIS-93)', () => {
    const xref = (c: LayoutControl): LayoutControl => ({ ...c, crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: c.paramName, paramId: c.paramId } });
    // pid 3 / 5 also exist in the open block's catalog: the refs must not bind to them
    expect(entriesOf([row([knob(0), xref(knob(3)), xref(drop(41))])]).map((e) => e.kind)).toEqual(['tile', 'gap', 'gap']);
    const heading = xref(ctl('label', 5, undefined, 'labelBold', 'Level'));
    expect(entriesOf([row([heading, knob(0)])]).map((e) => [e.kind, e.text ?? e.key])).toEqual([['label', 'Level'], ['tile', 'k0']]);
    // the owner named by effect id and equal to the open block: binds as before
    const own = { ...knob(3), crossBlock: { effect: 'ID_X', effectId: 46, family: 'X', paramName: 'P_3', paramId: 3 } };
    expect(pageEntries([row([own])], byKey, { effectId: 46 }).map((e) => e.key)).toEqual(['k3']);
    expect(pageEntries([row([own])], byKey, { effectId: 47 }).map((e) => e.kind)).toEqual(['gap']);
  });

  it('separators: a vertical divider in the free column between two groups, all of a line or none, heights down to the minimum', () => {
    const items = place([row([knob(0, at(305, 50)), knob(1, at(397, 50)), sep(at(520, 50)), knob(2, at(535, 50)), knob(3, at(627, 50)), sep(at(750, 50)), knob(4, at(765, 50))])]);
    expect(pos(items, 'k2')).toEqual({ x: 5, y: 0 });
    expect(dividers(items)).toEqual([
      { id: 'w0.div0', kind: 'vdiv', x: 4, y: 0, w: 1, h: 2 },
      { id: 'w0.div1', kind: 'vdiv', x: 9, y: 0, w: 1, h: 2 }
    ]);
    // the second separator has no free column (its groups touch): neither is drawn
    const none = place([row([knob(0, at(305, 50)), knob(1, at(397, 50)), sep(at(520, 50)), knob(2, at(535, 50)), knob(3, at(627, 50)), sep(at(710, 50)), knob(4, at(719, 50))])]);
    expect(dividers(none)).toEqual([]);
    // at the edge (nothing on its right) it is left out
    expect(dividers(place([row([knob(0, at(305, 50)), knob(1, at(397, 50)), sep(at(500, 50))])]))).toEqual([]);
  });

  it('only the first section is positioned: an exact mixer control flows with its own row', () => {
    // a cab-like page: the mixer's Balance has a position, Level has none
    const items = place([
      row([knob(0, at(kx(0), 50)), knob(1, at(kx(1), 50)), knob(2, at(kx(2), 50))]),
      row([knob(3)], 'mixer'),
      row([knob(4, at(1179, 185)), ctl('button', null, undefined, 'btnBypass', 'Bypass')], 'mixer')
    ]);
    expect([0, 1, 2].map((k) => pos(items, `k${k}`))).toEqual([0, 2, 4].map((x) => ({ x, y: 0 })));
    expect(dividers(items)).toEqual([{ id: 'w0.div0', kind: 'hdiv', x: 0, y: 2, w: 6, h: 1, label: 'Mixer' }]);
    expect(pos(items, 'k3')).toEqual({ x: 0, y: 3 });
    expect(pos(items, 'k4')).toEqual({ x: 0, y: 5 }); // Balance in its own row, not split off
    expect(pos(items, 'bypass')).toEqual({ x: 2, y: 5 });
  });

  it('the remainder: gaps before the first flowing control of a row do not count', () => {
    // exact knobs, then two spacers, then a control without a position: it starts at the left
    const items = place([row([knob(0, at(kx(0), 50)), knob(1, at(kx(1), 50)), ctl('spacer', null), ctl('spacer', null), knob(2), ctl('spacer', null), knob(3)])]);
    expect(pos(items, 'k2')).toEqual({ x: 0, y: 2 });
    expect(pos(items, 'k3')).toEqual({ x: 4, y: 2 }); // a gap between flowing controls still counts
  });

  it('knobs between dropdowns (all-controls slot), positions kept exactly', () => {
    const line = [knob(0, at(305, 230)), drop(41, at(388, 230)), knob(1, at(471, 230)), drop(42, at(554, 230)), knob(2, at(637, 230)), drop(43, at(720, 230))];
    const items = place([row(line)]);
    expect(['k0', 'e41', 'k1', 'e42', 'k2', 'e43'].map((k) => pos(items, k))).toEqual([0, 2, 4, 6, 8, 10].map((x) => ({ x, y: 0 })));
  });

  it('mixed page: exact controls first, the rest flowed below in layout order, a section change as a divider', () => {
    const items = place([
      row([knob(0, at(kx(0), 50)), knob(1, at(kx(1), 50)), knob(2, at(kx(2), 50)), knob(3, at(kx(3), 50)), knob(4)]),
      row([knob(5)], 'mixer'),
      row([ctl('button', null, undefined, 'btnBypass', 'Bypass')], 'mixer')
    ]);
    expect(isPositionedPage(entriesOf([row([knob(0, at(1, 1)), knob(1, at(2, 1)), knob(2)])]))).toBe(true);
    expect(isPositionedPage(entriesOf([row([knob(0, at(1, 1)), knob(1, at(2, 1)), knob(2), knob(3), knob(4)])]))).toBe(false);
    expect(isPositionedPage(entriesOf([row([knob(0, at(1, 1)), knob(1)])]))).toBe(false);
    expect([0, 1, 2, 3].map((k) => pos(items, `k${k}`))).toEqual([0, 2, 4, 6].map((x) => ({ x, y: 0 })));
    expect(pos(items, 'k4')).toEqual({ x: 0, y: 2 });
    expect(dividers(items)).toEqual([{ id: 'w0.div0', kind: 'hdiv', x: 0, y: 4, w: 8, h: 1, label: 'Mixer' }]);
    expect(pos(items, 'k5')).toEqual({ x: 0, y: 5 });
    expect(pos(items, 'bypass')).toEqual({ x: 0, y: 7 });
    expect(noOverlaps(items)).toBeNull();
  });

  it('positions far out are clamped (garbage that parses)', () => {
    const items = place([row([knob(0, at(305, 50)), knob(1, at(397, 50)), knob(2, at(305, 9e9))])]);
    expect(noOverlaps(items)).toBeNull();
    for (const i of items) expect(i.y + i.h).toBeLessThanOrEqual(MAX_ROWS);
    expect(insidePage(items)).toBe(true);
  });
});

describe('pages laid out by rows', () => {
  it('no placement: the row-faithful flow (a gap = one knob slot, a separator too)', () => {
    const items = place([row([knob(0), knob(1), ctl('spacer', null), knob(2), sep(), knob(3)]), row([knob(4)])]);
    expect([0, 1, 2, 3, 4].map((k) => pos(items, `k${k}`))).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 6, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 2 }
    ]);
    expect(dividers(items)).toEqual([]);
  });

  it('columns: col × 2 cells, a spacer column stays empty', () => {
    const items = place([row([knob(0, col(0)), ctl('spacer', null, col(1)), knob(1, col(2)), knob(2, col(3)), knob(3, col(5))])]);
    expect([0, 1, 2, 3].map((k) => pos(items, `k${k}`).x)).toEqual([0, 4, 6, 10]);
  });

  it('nudges: half-knob steps, at most one slot; one onto the line above is dropped, a free one kept', () => {
    const items = place([row([knob(0, col(0)), knob(1, col(1))]), row([knob(2, col(1, { offsetY: -70 })), knob(3, col(3, { offsetY: 60 })), knob(4, col(5, { offsetX: 52 })), knob(5, col(7, { offsetY: 5000 }))])]);
    expect(pos(items, 'k2')).toEqual({ x: 2, y: 2 }); // −70 px would cover P1
    expect(pos(items, 'k3')).toEqual({ x: 6, y: 3 }); // +60 px ≈ half a knob down
    expect(pos(items, 'k4')).toEqual({ x: 11, y: 2 }); // +52 px ≈ half a knob right
    expect(pos(items, 'k5')).toEqual({ x: 14, y: 4 }); // a huge nudge: one slot at most
    expect(DEFAULT_PITCH_PX).toEqual({ x: 88, y: 106 });
  });

  it('a section change becomes a labelled divider as wide as the controls', () => {
    const items = place([row([knob(0), knob(1), knob(2), knob(3)]), row([knob(4), knob(5)], 'mixer')]);
    expect(dividers(items)).toEqual([{ id: 'w0.div0', kind: 'hdiv', x: 0, y: 2, w: 8, h: 1, label: 'Mixer' }]);
    expect(pos(items, 'k4')).toEqual({ x: 0, y: 3 });
    expect(dividers(place([row([knob(0)], 'mixer'), row([knob(1)], 'mixer')]))).toEqual([]);
    expect(dividers(place([{ controls: [knob(0)] }, { controls: [knob(1)] }]))).toEqual([]);
    // sections 'gap': no divider line; a divider only in a free row
    expect(dividers(place([row([knob(0), knob(1)]), row([knob(4)], 'mixer')], { sections: 'gap' }))).toEqual([]);
  });

  it('a section title in a row takes a line above it, from the control it precedes over its run', () => {
    const items = place([row([knob(0, col(0)), title('VOICES', at(475, 29)), knob(1, col(2)), knob(2, col(3)), knob(3, col(4)), knob(4, col(6))])]);
    expect(dividers(items)).toEqual([{ id: 'w0.div0', kind: 'hdiv', x: 4, y: 0, w: 6, h: 1, label: 'VOICES' }]);
    expect(pos(items, 'k0')).toEqual({ x: 0, y: 1 });
    expect(pos(items, 'k4')).toEqual({ x: 12, y: 1 });
    const two = place([row([title('LOW'), knob(0, col(0)), title('BAND'), knob(1, col(1)), knob(2, col(2))])]);
    expect(dividers(two).map((d) => [d.label, d.x, d.w])).toEqual([
      ['LOW', 0, 2],
      ['BAND', 2, 4]
    ]);
  });

  it('an exact control on a column page goes at the end of its own row; a title heads the columns', () => {
    // a cab-like page: per cab a title and an exact selector listed before the column knobs
    const items = place([
      row([bold('CAB 1', at(315, 63)), drop(41, at(321, 165)), knob(0, col(3)), knob(1, col(4)), knob(2, col(5))]),
      row([bold('CAB 2', at(315, 243)), drop(42, at(321, 345)), knob(3, col(3)), knob(4, col(4)), knob(5, col(5))]),
      row([knob(6)], 'mixer')
    ]);
    expect(dividers(items).map((d) => [d.label, d.x, d.y, d.w])).toEqual([
      ['CAB 1', 6, 0, 8],
      ['CAB 2', 6, 3, 8],
      ['Mixer', 0, 6, 14]
    ]);
    expect([0, 1, 2].map((k) => pos(items, `k${k}`))).toEqual([6, 8, 10].map((x) => ({ x, y: 1 })));
    expect(pos(items, 'e41')).toEqual({ x: 12, y: 1 }); // end of the CAB 1 row
    expect(pos(items, 'e42')).toEqual({ x: 12, y: 4 }); // end of the CAB 2 row
    expect(pos(items, 'k6')).toEqual({ x: 0, y: 7 });
  });

  it('a row of exact controls on a row page still starts its section (divider first)', () => {
    const items = place([row([knob(0, col(0)), knob(1, col(1))]), row([ctl('meter', 30, at(465, 370), 'meterGainHeadroom')], 'mixer'), row([knob(2)], 'mixer')]);
    expect(isPositionedPage(entriesOf([row([knob(0, col(0)), knob(1, col(1))]), row([ctl('meter', 30, at(465, 370))], 'mixer')]))).toBe(false);
    expect(dividers(items)).toMatchObject([{ y: 2, label: 'Mixer' }]);
    expect(ctlOf(items, 'meter')).toMatchObject({ x: 0, y: 3, w: 2, h: 4 });
    expect(pos(items, 'k2')).toEqual({ x: 0, y: 7 });
  });

  it('garbage positions are ignored (the page flows by rows)', () => {
    const garbage = place([row([knob(0, { positionExact: 'abc' }), knob(1, { positionExact: true } as never), knob(2, { positionExact: '1,2,3' })])]);
    const plain = place([row([knob(0), knob(1), knob(2)])]);
    expect(garbage).toEqual(plain);
  });
});

describe('height budget (fitLayoutPage)', () => {
  const page = [
    row([title('GAIN', at(kx(0), 29)), knob(0, at(kx(0), 50)), title('TONE', at(kx(2), 29)), ...[1, 2, 3].map((k) => knob(k, at(kx(k + 1), 50)))]),
    row([knob(4), knob(5)], 'mixer')
  ];
  const entries = entriesOf(page);
  const rowsOnly = (): BeItem[] => [{ id: 'old', key: 'k0', view: 'knob', x: 0, y: 0, w: 2, h: 2 }];
  const fit = (budget: number) => fitLayoutPage(entries, { pageIndex: 0 }, budget, rowsOnly);
  const height = (items: BeItem[]) => bbox(items).R;

  it('titles and section dividers while they fit; then without title lines; then without divider lines; then rows; then the rows-only page', () => {
    const full = fit(6);
    expect(full.mode).toBe('positioned');
    expect(height(full.items)).toBe(6);
    expect(dividers(full.items).map((d) => d.label)).toEqual(['GAIN', 'TONE', 'Mixer']);

    const compact = fit(5);
    expect(compact.mode).toBe('positioned-compact');
    expect(dividers(compact.items).map((d) => d.label)).toEqual(['Mixer']);
    expect(height(compact.items)).toBe(5);

    const plain = fit(4);
    expect(plain.mode).toBe('positioned-plain');
    expect(dividers(plain.items)).toEqual([]);
    expect(height(plain.items)).toBe(4);
    expect(pos(plain.items, 'k4')).toEqual({ x: 0, y: 2 }); // the section break is a new line

    expect(fit(1).mode).toBe('rows-only');
    expect(fit(1).items).toEqual(rowsOnly());
  });

  it('a page without positions: rows, then rows without title / divider lines', () => {
    const rowsPage = entriesOf([row([title('T'), knob(0), knob(1)]), row([knob(2)], 'mixer')]);
    expect(fitLayoutPage(rowsPage, { pageIndex: 0 }, 6, rowsOnly).mode).toBe('rows');
    expect(fitLayoutPage(rowsPage, { pageIndex: 0 }, 5, rowsOnly).mode).toBe('rows-compact');
    expect(fitLayoutPage(rowsPage, { pageIndex: 0 }, 4, rowsOnly).mode).toBe('rows-plain');
  });
});

describe('determinism', () => {
  const page = [
    row([title('TONE', at(kx(1), 29)), graph(at(315, 70)), ...[0, 1, 2, 3, 4].map((k) => knob(k, at(kx(k), 290))), sep(at(kx(5) + 30, 290)), knob(5, at(kx(6), 290))]),
    row([knob(6, at(kx(1), 400)), knob(7)]),
    row([knob(8), drop(41)], 'mixer')
  ];
  it('same input → identical items', () => {
    expect(place(page)).toEqual(place(page));
  });
  it('already normal: normalizeBoard changes nothing, twice = once', () => {
    const board: BeBoard = { v: 2, pageOrder: ['P'], page: 'P', boards: { P: place(page) } };
    const keys = catalog.map((c) => c.key);
    const once = normalizeBoard(board, keys);
    expect(once).toEqual(board);
    expect(normalizeBoard(once, keys)).toEqual(once);
    expect(noOverlaps(board.boards.P!)).toBeNull();
    expect(insidePage(board.boards.P!)).toBe(true);
  });
  it('LayoutEntry indexes follow the layout order', () => {
    expect(entriesOf(page).map((e: LayoutEntry) => e.index)).toEqual(entriesOf(page).map((_, i) => i));
  });
});

// ── controls shown elsewhere and page-level controls (AXIS-94) ──
describe('controls that are gone (the header’s, the fixed area’s)', () => {
  const without = (rows: LayoutRow[], keys: string[], o: Partial<Parameters<typeof placeLayoutPage>[1]> = {}) =>
    placeLayoutPage(pageEntries(rows, byKey, {}, new Set(keys)), { pageIndex: 0, ...o });

  it('leave no slot, nor the gaps left of the first control of their row; other rows keep theirs', () => {
    const spacer = () => ctl('spacer', null);
    const items = without([row([spacer(), knob(0), spacer(), knob(1), spacer(), knob(2)]), row([spacer(), knob(3)])], ['k0']);
    expect(pos(items, 'k1')).toEqual({ x: 0, y: 0 });
    expect(pos(items, 'k2')).toEqual({ x: 4, y: 0 }); // the gap after the first control stays
    expect(pos(items, 'k3')).toEqual({ x: 2, y: 2 });
    expect(items.some((i) => !isDivider(i) && i.key === 'k0')).toBe(false);
  });

  it('a whole row of them is no row; its section starts no divider', () => {
    const items = without([row([knob(0)]), row([knob(1), knob(2)], 'mixer')], ['k1', 'k2']);
    expect(items.map((i) => (isDivider(i) ? i.kind : i.key))).toEqual(['k0']);
    const some = without([row([knob(0)]), row([knob(1), knob(2)], 'mixer')], ['k1']);
    expect(dividers(some).map((d) => d.label)).toEqual(['Mixer']);
    expect(pos(some, 'k2')).toEqual({ x: 0, y: 3 });
  });

  it('a title heads what is left of its group; with nothing left it goes', () => {
    const rows = [row([title('A'), knob(0), knob(1), title('B'), knob(2), title('C'), knob(3)])];
    const labels = (keys: string[]) => dividers(without(rows, keys)).map((d) => [d.label, d.x]);
    expect(labels([])).toEqual([['A', 0], ['B', 4], ['C', 6]]);
    expect(labels(['k0'])).toEqual([['A', 0], ['B', 2], ['C', 4]]);
    expect(labels(['k0', 'k1'])).toEqual([['B', 0], ['C', 2]]);
    expect(labels(['k2'])).toEqual([['A', 0], ['C', 4]]);
    expect(labels(['k3'])).toEqual([['A', 0], ['B', 4]]);
    expect(labels(['k0', 'k1', 'k2', 'k3'])).toEqual([]);
  });

  it('a page that lost its left column starts at the left edge again; one that did not keeps its columns', () => {
    const rows = [row([knob(0, col(0)), knob(1, col(1))]), row([knob(2, col(0)), knob(3, col(2))])];
    const items = without(rows, ['k0', 'k2']);
    expect([pos(items, 'k1'), pos(items, 'k3')]).toEqual([{ x: 0, y: 0 }, { x: 2, y: 2 }]);
    expect(pos(place([row([knob(1, col(1))])]), 'k1')).toEqual({ x: 2, y: 0 }); // nothing gone: as laid out
  });

  it('exact positions: the rest keeps its places to each other, from the left edge', () => {
    const rows = [row([knob(0, at(100, 50)), knob(1, at(305, 50)), knob(2, at(397, 50)), knob(3, at(489, 50)), knob(4, at(305, 160))])];
    const items = without(rows, ['k0']);
    expect([1, 2, 3, 4].map((i) => pos(items, `k${i}`))).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }]);
  });

  it('an empty skip set changes nothing', () => {
    const rows = [row([title('A'), knob(0), ctl('spacer', null), knob(1, col(3))]), row([drop(41), knob(2)], 'mixer')];
    expect(without(rows, [])).toEqual(place(rows));
  });
});

describe('page-level controls', () => {
  const page = (rows: LayoutRow[], pageControls: LayoutControl[]) => ({ name: 'P', rows, pageControls });

  it('are one more row after the last row that is not the mixer’s, in its section', () => {
    const rows = [row([knob(0)]), row([knob(1)], 'extra'), row([knob(2)], 'mixer')];
    const out = pageRows(page(rows, [drop(41, at(10, 10))]));
    expect(out.map((r) => [r.section, !!r.pageLevel])).toEqual([['parameters', false], ['extra', false], ['extra', true], ['mixer', false]]);
    expect(pageRows(page([row([knob(2)], 'mixer')], [drop(41)])).map((r) => r.section)).toEqual(['parameters', 'mixer']);
    expect(pageRows(page([], [drop(41)])).map((r) => r.pageLevel)).toEqual([true]);
  });

  it('entries without a param, titles and separators are not used; without any the rows are the page’s own', () => {
    const rows = [row([knob(0)])];
    expect(pageRows(page(rows, [title('X', at(1, 1)), sep(at(1, 1)), bold('Y'), graph(at(1, 1))]))).toBe(rows);
    expect(pageRows({ name: 'P', rows })).toBe(rows);
    expect(pageRows(null)).toEqual([]);
    expect(pageRows(page(rows, [null as never, 'x' as never]))).toBe(rows);
  });

  it('what resolves to nothing, or to a control the page’s rows have, leaves no gap', () => {
    const entries = pageEntries(pageRows(page([row([knob(0)]), row([knob(5)], 'mixer')], [knob(99), knob(0), knob(5), drop(41), drop(41)])), byKey);
    expect(entries.map((e) => [e.kind, e.key, !!e.pageLevel])).toEqual([['tile', 'k0', false], ['tile', 'e41', true], ['tile', 'k5', false]]);
  });

  it('take their exact position on a positioned page, else flow in their own row', () => {
    const positioned = pageEntries(pageRows(page([row([knob(0, at(305, 50)), knob(1, at(397, 50)), knob(2, at(489, 50))])], [knob(3, at(305, 160))])), byKey);
    expect(pos(placeLayoutPage(positioned, { pageIndex: 0 }), 'k3')).toEqual({ x: 0, y: 2 });
    const flow = pageEntries(pageRows(page([row([knob(0), knob(1), knob(2)]), row([knob(4)], 'mixer')], [knob(3, at(305, 160))])), byKey);
    const items = placeLayoutPage(flow, { pageIndex: 0 });
    expect(pos(items, 'k3')).toEqual({ x: 0, y: 2 });
    expect(ctlOf(items, 'k4').y).toBeGreaterThan(2);
    expect(noOverlaps(items)).toBeNull();
  });
});
