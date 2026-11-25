import { describe, expect, it } from 'vitest';
import type { BlockVisual, EnumParam, NamedParam } from '../types';
import { MAXC, normalizeBoard, type BeBoard, type BeView } from './boardModel';
import { EQ_STYLE_VIEW, eqBandsFromVisual, eqStyleForVisual, eqStyleOfView, eqStylesFromVisuals } from './eqStyles';

const param = (id: number, name: string, value = 0, unit?: string): NamedParam => ({ id, name, value, unit, norm: 0.5 });
const typeEnum = (id: number, labels: string[]): EnumParam => ({
  id,
  name: 'Type',
  value: 0,
  options: labels.map((label, value) => ({ value, label }))
});

const visual = (extra: Partial<BlockVisual> = {}): BlockVisual => ({
  key: 'inputEq',
  kind: 'eq',
  title: 'Input EQ',
  mode: 'parametric',
  roles: {},
  bands: [
    { key: 'low', gain: 10, freq: 1, q: 2, type: 15 },
    { key: 'mid', gain: 11, freq: 3, q: 4, type: 16 },
    { key: 'high', gain: 12, freq: 5, q: 6, type: 17 }
  ],
  ...extra
});

const params = [1, 2, 3, 4, 5, 6, 10, 11, 12].map((id) => param(id, `P${id}`));
const enums = [typeEnum(15, ['Blocking (Low Cut)']), typeEnum(16, ['Peaking']), typeEnum(17, ['Shelving (High Shelf)'])];

describe('eq styles', () => {
  it('names the style of a served EQ visual by its key, and leaves other EQs alone', () => {
    expect(eqStyleForVisual(visual({ key: 'inputEq' }))).toBe('input');
    expect(eqStyleForVisual(visual({ key: 'outputEq', mode: 'graphic' }))).toBe('output');
    expect(eqStyleForVisual(visual({ key: 'peq' }))).toBe('peq');
    expect(eqStyleForVisual(visual({ key: 'paramEq' }))).toBe('peq');
    expect(eqStyleForVisual(visual({ key: 'reverbEq' }))).toBeNull();
    expect(eqStyleForVisual({ key: 'outputEq', kind: 'dynamics', title: 'x', roles: {} })).toBeNull();
  });

  it('maps the views back to their styles', () => {
    expect(eqStyleOfView('eqIn')).toBe('input');
    expect(eqStyleOfView('eqOut')).toBe('output');
    expect(eqStyleOfView('eqPeq')).toBe('peq');
    expect(eqStyleOfView('eq')).toBeNull();
    expect(eqStyleOfView('knob')).toBeNull();
  });

  it('reads a parametric visual into editable bands with their curve shapes', () => {
    const bands = eqBandsFromVisual(visual(), params, enums);
    expect(bands.map((b) => b.key)).toEqual(['low', 'mid', 'high']);
    expect(bands.map((b) => b.shape)).toEqual(['lowcut', 'bell', 'highshelf']);
    expect(bands[0]!.gain?.id).toBe(10);
    expect(bands[0]!.freq?.id).toBe(1);
    expect(bands[0]!.q?.id).toBe(2);
    // the third band's type is a high shelf (a low-side index does not matter once the label says shelf)
    expect(bands[2]!.gain?.name).toBe('P12');
  });

  it('keeps a graphic EQ’s fixed centres and draws every band as a bell', () => {
    const bands = eqBandsFromVisual(
      visual({
        key: 'outputEq',
        mode: 'graphic',
        bands: [
          { key: 'b0', gain: 10, centerHz: 31 },
          { key: 'b1', gain: 11, centerHz: 62 }
        ]
      }),
      params,
      enums
    );
    expect(bands.map((b) => [b.key, b.centerHz, b.shape])).toEqual([
      ['b0', 31, 'bell'],
      ['b1', 62, 'bell']
    ]);
  });

  it('drops a band whose roles resolve to nothing', () => {
    const bands = eqBandsFromVisual(visual({ bands: [{ key: 'ghost', gain: 99 }, { key: 'kept', gain: 10 }] }), params, enums);
    expect(bands.map((b) => b.key)).toEqual(['kept']);
  });

  it('builds one style per served EQ, in the server’s order, with its own range', () => {
    const styles = eqStylesFromVisuals(
      [visual({ key: 'inputEq', title: 'Input EQ' }), visual({ key: 'outputEq', title: 'Output EQ', mode: 'graphic', bands: [{ key: 'a', gain: 10, centerHz: 100 }] }), visual({ key: 'outputEq', title: 'Output EQ again' })],
      params,
      enums
    );
    expect(styles.map((s) => [s.style, s.view, s.title, s.gainRange])).toEqual([
      ['input', 'eqIn', 'Input EQ', 20],
      ['output', 'eqOut', 'Output EQ', 12]
    ]);
    expect(styles[0]!.bands).toHaveLength(3);
    expect(styles[1]!.bands).toHaveLength(1);
  });

  it('ignores visuals without a style or without usable bands', () => {
    expect(eqStylesFromVisuals(undefined, params, enums)).toEqual([]);
    expect(eqStylesFromVisuals([visual({ key: 'reverbEq' })], params, enums)).toEqual([]);
    expect(eqStylesFromVisuals([visual({ bands: [] })], params, enums)).toEqual([]);
  });

  it('exposes the three views as the same footprint names', () => {
    expect(EQ_STYLE_VIEW).toEqual({ input: 'eqIn', output: 'eqOut', peq: 'eqPeq' });
  });
});

describe('eq style views on a stored board', () => {
  const board = (view: string): BeBoard => ({
    v: 2,
    pageOrder: ['EQ'],
    page: 'EQ',
    boards: { EQ: [{ id: 'x', key: 'eq', view: view as BeView, x: 0, y: 0, w: 8, h: 4 }] }
  });
  const allowed = new Map<string, BeView[]>([['eq', ['eqIn', 'eqOut']]]);

  it('keeps a style the block serves, with its size', () => {
    const b = normalizeBoard(board('eqOut'), ['eq'], { viewsByKey: allowed });
    expect(b.boards.EQ![0]).toMatchObject({ view: 'eqOut', w: 8, h: 4 });
  });

  it('falls back a stored style the block no longer serves to the first one it does', () => {
    const b = normalizeBoard(board('eqPeq'), ['eq'], { viewsByKey: allowed });
    expect(b.boards.EQ![0]).toMatchObject({ view: 'eqIn', x: 0, y: 0 });
    // the footprint is the eq tile's: a stored huge width is clamped, a tiny one raised
    const huge = normalizeBoard({ ...board('eqOut'), boards: { EQ: [{ id: 'x', key: 'eq', view: 'eqOut', x: 0, y: 0, w: 40, h: 99 }] } }, ['eq'], { viewsByKey: allowed });
    expect(huge.boards.EQ![0]).toMatchObject({ view: 'eqOut', w: MAXC, h: 8 });
    const tiny = normalizeBoard({ ...board('eqOut'), boards: { EQ: [{ id: 'x', key: 'eq', view: 'eqOut', x: 0, y: 0, w: 1, h: 1 }] } }, ['eq'], { viewsByKey: allowed });
    expect(tiny.boards.EQ![0]).toMatchObject({ view: 'eqOut', w: 6, h: 3 });
  });
});
