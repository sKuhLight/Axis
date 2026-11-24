import { describe, it, expect } from 'vitest';
import { parseStoredBoard, parseStoredMeta } from './boardSchema';

const v2 = {
  v: 2,
  pageOrder: ['A'],
  page: 'A',
  boards: {
    A: [
      { id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
      { id: 'd', kind: 'hdiv', x: 0, y: 2, w: 6, h: 1, label: 'Tone' }
    ]
  },
  variantSig: 'sig'
};

describe('parseStoredBoard', () => {
  it('accepts a v2 board (text or value)', () => {
    const b = parseStoredBoard(JSON.stringify(v2))!;
    expect(b).toEqual(v2);
    expect(parseStoredBoard(v2)).toEqual(v2);
  });

  it('migrates a v1 board', () => {
    const b = parseStoredBoard({
      pageOrder: ['Main'],
      page: 'Main',
      boards: { Main: [{ id: 'w', key: 'k1', x: 1, y: 1, w: 1, h: 1, view: 'knob' }] }
    })!;
    expect(b.v).toBe(2);
    expect(b.boards.Main).toEqual([{ id: 'w', key: 'k1', view: 'knob', x: 2, y: 2, w: 2, h: 2 }]);
  });

  it('drops single bad items but keeps the board', () => {
    const b = parseStoredBoard({ ...v2, boards: { A: [...v2.boards.A, { id: 'x', key: 'k2', view: 'dial', x: 0, y: 0, w: 1, h: 1 }, 42, null] } })!;
    expect(b.boards.A).toHaveLength(2);
  });

  it('rejects garbage', () => {
    for (const bad of [
      'not json{',
      'null',
      '42',
      '[]',
      JSON.stringify({ v: 3, pageOrder: [], page: '', boards: {} }),
      JSON.stringify({ v: 2, pageOrder: ['A'], page: 'A', boards: 'nope' }),
      JSON.stringify({ v: 2, pageOrder: ['A'], page: 'A' }),
      JSON.stringify({ pageOrder: ['A'], page: 'A', boards: [] }),
      JSON.stringify({ hello: 'world' }),
      undefined,
      ''
    ]) {
      expect(parseStoredBoard(bad)).toBeNull();
    }
  });

  it('repairs what normalization can fix instead of rejecting the board', () => {
    const b = parseStoredBoard({ v: 2, pageOrder: 'A', page: 7, boards: { A: [], B: 'nope' }, variantSig: 42 })!;
    expect(b).toEqual({ v: 2, pageOrder: [], page: '', boards: { A: [] } });
    const mixed = parseStoredBoard({ v: 2, pageOrder: ['A', 3, 'B'], page: 'A', boards: {} })!;
    expect(mixed.pageOrder).toEqual(['A', 'B']);
    const v1 = parseStoredBoard({ pageOrder: ['A'], page: 7, boards: { A: [] } })!;
    expect(v1).toMatchObject({ v: 2, page: '' });
  });

  it('treats null in optional fields as absent', () => {
    const b = parseStoredBoard({
      ...v2,
      variantSig: null,
      boards: { A: [{ id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2, row: null }, { id: 'd', kind: 'vdiv', x: 3, y: 0, w: 1, h: 4, label: null }] }
    })!;
    expect(b.boards.A).toEqual([
      { id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
      { id: 'd', kind: 'vdiv', x: 3, y: 0, w: 1, h: 4 }
    ]);
    expect('variantSig' in b).toBe(false);
    const legacy = parseStoredBoard({ pageOrder: ['M'], page: 'M', boards: { M: [{ id: 'w', key: 'k1', x: 0, y: 0, w: 1, h: 1, view: 'knob', row: null }] } })!;
    expect('row' in legacy.boards.M![0]!).toBe(false);
  });

  it('keeps an item with a key as a control even with a stray kind', () => {
    const b = parseStoredBoard({ ...v2, boards: { A: [{ id: 'a', key: 'k1', view: 'knob', kind: 'hdiv', x: 0, y: 0, w: 2, h: 2 }] } })!;
    expect(b.boards.A).toEqual([{ id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 }]);
  });

  it('handles page names from Object.prototype and drops __proto__', () => {
    const b = parseStoredBoard(
      '{"v":2,"pageOrder":["constructor","__proto__","toString"],"page":"constructor","boards":{"constructor":[],"__proto__":[{"id":"x","key":"k1","view":"knob","x":0,"y":0,"w":2,"h":2}],"toString":[]}}'
    )!;
    expect(Object.keys(b.boards)).toEqual(['constructor', 'toString']);
    expect(Object.getPrototypeOf(b.boards)).toBe(Object.prototype);
  });
});

describe('parseStoredBoard: the fixed area', () => {
  const item = { id: 'a', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 };
  const base = { v: 2, pageOrder: ['A'], page: 'A', boards: { A: [item] } };
  it('round-trips, with its dividers', () => {
    const fixed = { cols: 6, items: [{ ...item, id: 'f' }, { id: 'd', kind: 'hdiv', x: 0, y: 2, w: 6, h: 1, label: 'Mix' }] };
    const b = parseStoredBoard(JSON.stringify({ ...base, fixed, variantSig: 's' }))!;
    expect(b.fixed).toEqual(fixed);
    expect(parseStoredBoard(JSON.stringify(b))).toEqual(b);
  });
  it('absent stays absent; a bad one counts as absent and the board stays', () => {
    expect('fixed' in parseStoredBoard(base)!).toBe(false);
    for (const bad of [null, 7, 'x', [], {}, { cols: 'x', items: [] }, { cols: 4 }, { cols: 4, items: {} }]) {
      const b = parseStoredBoard({ ...base, fixed: bad })!;
      expect(b, JSON.stringify(bad)).not.toBeNull();
      expect(b.fixed, JSON.stringify(bad)).toBeUndefined();
      expect(b.boards.A).toHaveLength(1);
    }
  });
  it('bad items are dropped', () => {
    expect(parseStoredBoard({ ...base, fixed: { cols: 4, items: [item, null, 5, { id: 'x' }, { ...item, view: 'nope' }] } })!.fixed!.items).toEqual([{ ...item, row: undefined }]);
  });
});

describe('parseStoredMeta', () => {
  it('accepts the new and the previous meta shape', () => {
    expect(parseStoredMeta('{"active":"Default","names":["Default","Blank"]}')).toEqual({ active: 'Default', names: ['Default', 'Blank'] });
    const m = parseStoredMeta({ active: 'Mine', names: ['Mine'], prefs: { tablet: { nav: 'side', density: 'l' } } });
    expect(m?.prefs?.tablet).toEqual({ nav: 'side', density: 'l' });
  });
  it('rejects what is not a meta at all', () => {
    expect(parseStoredMeta('{"active":""}')).toBeNull();
    expect(parseStoredMeta({ names: ['A'] })).toBeNull();
    expect(parseStoredMeta({ active: 'A', names: 'A' })).toBeNull();
    expect(parseStoredMeta('oops')).toBeNull();
  });
  it('drops one bad optional field instead of the whole meta (keeps `migrated`)', () => {
    // a broken prefs entry: that device class falls back to the defaults, the rest stays
    const m = parseStoredMeta({ active: 'A', names: ['A'], migrated: true, prefs: { desktop: { nav: 'left', density: 'm' }, tablet: { nav: 'side', density: 's' } } });
    expect(m).toMatchObject({ active: 'A', migrated: true });
    expect(m?.prefs?.desktop).toBeUndefined();
    expect(m?.prefs?.tablet).toEqual({ nav: 'side', density: 's' });
    // null / garbage flags count as absent
    expect(parseStoredMeta({ active: 'A', names: ['A'], migrated: true, autoPack: null })).toEqual({ active: 'A', names: ['A'], migrated: true });
    expect(parseStoredMeta({ active: 'A', names: ['A'], migrated: true, autoPack: 'yes' })?.migrated).toBe(true);
    expect(parseStoredMeta({ active: 'A', names: ['A'], migrated: null, autoPack: true })).toEqual({ active: 'A', names: ['A'], autoPack: true });
    expect(parseStoredMeta({ active: 'A', names: ['A'], migrated: true, prefs: 7 })?.prefs).toBeUndefined();
    expect(parseStoredMeta({ active: 'A', names: ['A'], migrated: true, prefs: null })?.migrated).toBe(true);
  });
});
