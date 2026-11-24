import { describe, expect, it } from 'vitest';
import { bbox, fits, type BeView } from './boardModel';
import { fixedSize, packFixed, pickFixed, type FixedPick } from './fixedSeed';
import type { LayoutEntry } from './layoutPlacement';

type T = [key: string, section?: string, view?: BeView];
/** One page's resolved entries: 'page' as section = a page-level control. */
const page = (...tiles: T[]): LayoutEntry[] =>
  tiles.map(([key, section = 'parameters', view = 'knob'], index) => ({
    kind: 'tile',
    key,
    view,
    row: 0,
    index,
    exact: null,
    col: null,
    dx: 0,
    dy: 0,
    section: section === 'page' ? 'parameters' : section,
    ...(section === 'page' ? { pageLevel: true } : {})
  }));
const keys = (p: FixedPick[]) => p.map((x) => x.key);

describe('pickFixed', () => {
  it('a) two pages or more: what is on every page moves, whatever its section; the rest stays', () => {
    const pages = [
      page(['a'], ['s'], ['x', 'mixer'], ['y', 'mixer'], ['pl', 'page']),
      page(['b'], ['s'], ['x', 'mixer'], ['y', 'mixer'], ['pl', 'page']),
      page(['c'], ['s'], ['x', 'mixer'], ['pl', 'page'])
    ];
    // page-level first, then the mixer in editor order, then shared parameters; y is missing on the third page
    expect(keys(pickFixed(pages))).toEqual(['pl', 'x', 's']);
  });

  it('a) strict: on all pages but one is not on every page', () => {
    expect(pickFixed([page(['a'], ['x', 'mixer']), page(['b'], ['x', 'mixer']), page(['c'])])).toEqual([]);
  });

  it('a) moving parameter controls that would empty a page: those stay, the mixer and page-level ones move', () => {
    const pages = [page(['s'], ['a'], ['x', 'mixer']), page(['s'], ['x', 'mixer'])];
    expect(keys(pickFixed(pages))).toEqual(['x']);
    const withPageLevel = [page(['s'], ['a'], ['pl', 'page']), page(['s'], ['pl', 'page'])];
    expect(keys(pickFixed(withPageLevel))).toEqual(['pl']);
  });

  it('a) the first page decides a control’s view and section', () => {
    const picks = pickFixed([page(['a'], ['x', 'mixer', 'fader']), page(['b'], ['x', 'parameters', 'knob'])]);
    expect(picks).toEqual([{ key: 'x', view: 'fader' }]);
  });

  it('pages without any control do not count', () => {
    expect(keys(pickFixed([page(['a'], ['x', 'mixer']), [], page(['b'], ['x', 'mixer'])]))).toEqual(['x']);
    // one page left: rule b)
    expect(keys(pickFixed([[], page(['a'], ['x', 'mixer'], ['pl', 'page'])]))).toEqual(['x']);
    expect(pickFixed([[], []])).toEqual([]);
    expect(pickFixed([])).toEqual([]);
  });

  it('b) exactly one page: the mixer section moves, unless the page would be left without a control', () => {
    expect(keys(pickFixed([page(['a'], ['x', 'mixer'], ['y', 'Mixer'])]))).toEqual(['x', 'y']);
    expect(pickFixed([page(['x', 'mixer'], ['y', 'mixer'])])).toEqual([]);
    expect(pickFixed([page(['a'], ['b'])])).toEqual([]);
  });

  it('a page that held nothing but the shared mixer goes away — unless that is every page', () => {
    expect(keys(pickFixed([page(['a'], ['x', 'mixer']), page(['x', 'mixer'])]))).toEqual(['x']);
    expect(pickFixed([page(['x', 'mixer']), page(['x', 'mixer'])])).toEqual([]);
  });

  it('never the EQ graph, a graph display or the loop waveform', () => {
    const same = (v: BeView, key: string): T => [key, 'mixer', v];
    const pages = ['a', 'b'].map((k) => page([k], same('eq', 'eq'), same('graph', 'graph:lfo'), same('wave', 'wave'), same('meter', 'meter')));
    expect(keys(pickFixed(pages))).toEqual(['meter']);
  });

  it('leaves a key on its pages when any occurrence is named after another block', () => {
    const one = page(['a'], ['shared', 'mixer'], ['wrong', 'mixer']);
    const two = page(['b'], ['shared', 'mixer'], ['wrong', 'mixer']);
    two[2]!.other = true;
    expect(keys(pickFixed([one, two]))).toEqual(['shared']);
    expect(keys(pickFixed([two]))).toEqual(['shared']);
  });
});

describe('packFixed', () => {
  const knobs = (n: number): FixedPick[] => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, view: 'knob' }));
  const label = (key: string) => key;
  const beside = (rows: number) => () => rows;

  it('uses two cells for narrow controls when the height fits', () => {
    expect(packFixed(knobs(2), label, beside(0))!.cols).toBe(2);
    expect(packFixed(knobs(3), label, beside(4))!.cols).toBe(4);
    expect(packFixed(knobs(3), label, beside(6))!.cols).toBe(2);
    expect(packFixed([{ key: 'Tracking Mode', view: 'select' }], label, beside(10))!.cols).toBe(4);
  });

  it('two knobs a row while the area stays within the tallest page (at least four rows)', () => {
    const a = packFixed(knobs(4), label, beside(2))!;
    expect(a.cols).toBe(4);
    expect(a.items.map((i) => [i.x, i.y, i.w, i.h])).toEqual([[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2]]);
    expect(packFixed(knobs(6), label, beside(6))!.cols).toBe(4); // six rows are free anyway
  });

  it('widens to 6, then 8 only while it is taller than that', () => {
    expect(packFixed(knobs(6), label, beside(4))!).toMatchObject({ cols: 6 });
    expect(bbox(packFixed(knobs(6), label, beside(4))!.items).R).toBe(4);
    expect(packFixed(knobs(8), label, beside(4))!.cols).toBe(8);
    const tall = packFixed(knobs(20), label, beside(4))!;
    expect(tall.cols).toBe(8);
    expect(bbox(tall.items).R).toBe(10);
  });

  it('keeps the first width that reaches the minimum height and uses the adjacent page height at each width', () => {
    const withMeter: FixedPick[] = [...knobs(3), { key: 'meter', view: 'meter' }];
    expect(packFixed(withMeter, label, beside(2))!.cols).toBe(6);
    expect(packFixed(knobs(8), label, (cols) => cols === 6 ? 6 : 4)!.cols).toBe(6);
    expect(packFixed(knobs(8), label, beside(4))!.cols).toBe(8);
    expect(packFixed(knobs(9), label, beside(4))!.cols).toBe(6); // 8 would still need six rows
  });

  it('sizes: the usual ones, no wider than the area; a long select label takes two knob columns', () => {
    expect(fixedSize('knob', 'Mix', 4)).toEqual({ w: 2, h: 2 });
    expect(fixedSize('fader', 'Level', 4)).toEqual({ w: 2, h: 4 });
    expect(fixedSize('switch', 'On', 4)).toEqual({ w: 2, h: 2 });
    expect(fixedSize('select', 'Input Select', 4)).toEqual({ w: 2, h: 2 });
    expect(fixedSize('select', 'Tracking Mode', 4)).toEqual({ w: 4, h: 2 });
    expect(fixedSize('slider', 'Depth', 4)).toEqual({ w: 4, h: 1 });
    expect(fixedSize('slider', 'Depth', 8)).toEqual({ w: 6, h: 1 });
  });

  it('mixed sizes: no overlap, inside the area, no dividers, deterministic; nothing picked = no area', () => {
    const picks: FixedPick[] = [{ key: 'e1', view: 'select' }, { key: 'k0', view: 'fader' }, { key: 'k1', view: 'knob' }, { key: 'k2', view: 'slider' }, { key: 'e2', view: 'switch' }, { key: 'k3', view: 'number' }];
    const a = packFixed(picks, (k) => (k === 'e1' ? 'A very long label' : k), beside(3))!;
    a.items.forEach((it, i) => expect(fits(a.items.slice(0, i), it.x, it.y, it.w, it.h, undefined, a.cols)).toBe(true));
    expect(a.items.some((i) => 'kind' in i)).toBe(false);
    expect(new Set(a.items.map((i) => i.id)).size).toBe(picks.length);
    expect(packFixed(picks, (k) => (k === 'e1' ? 'A very long label' : k), beside(3))).toEqual(a);
    expect(packFixed([], label, beside(4))).toBeNull();
  });
});
