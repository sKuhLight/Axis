import { describe, it, expect } from 'vitest';
import {
  addControl,
  addDivider,
  addPage,
  BE_PRESETS,
  BE_SPEC,
  BLOCK_LEVEL_KEYS,
  MAX_ROWS,
  bbox,
  closeGaps,
  deletePage,
  duplicatePage,
  findFree,
  fits,
  isDivider,
  locate,
  MAXC,
  migrateV1,
  moveItem,
  movePage,
  moveToPage,
  normalizeBoard,
  reflowPack,
  removeItem,
  renamePage,
  resetPageFrom,
  resizeItem,
  rotateDivider,
  sequentialIdGen,
  setDividerLabel,
  setView,
  sizeItem,
  tidy,
  wrapWidePage,
  type BeBoard,
  type BeBoardV1,
  type BeControl,
  type BeDivider,
  type BeItem
} from './boardModel';

const knob = (id: string, key: string, x: number, y: number, extra: Partial<BeControl> = {}): BeControl => ({
  id,
  key,
  view: 'knob',
  x,
  y,
  w: 2,
  h: 2,
  ...extra
});
const hdiv = (id: string, x: number, y: number, w = 6, label?: string): BeDivider => ({ id, kind: 'hdiv', x, y, w, h: 1, ...(label ? { label } : {}) });
const board = (boards: Record<string, BeItem[]>, extra: Partial<BeBoard> = {}): BeBoard => ({
  v: 2,
  pageOrder: Object.keys(boards),
  page: Object.keys(boards)[0]!,
  boards,
  ...extra
});
const overlapFree = (list: readonly BeItem[]): boolean =>
  list.every((a, i) => list.every((b, j) => i === j || !(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)));

describe('size table', () => {
  it('knob is 2×2, wave 8×4 (min 6×3), page 24 cells', () => {
    expect(MAXC).toBe(24);
    expect(BE_SPEC.knob).toMatchObject({ w: 2, h: 2 });
    expect(BE_SPEC.wave).toMatchObject({ w: 8, h: 4, minW: 6, minH: 3 });
    expect(BE_PRESETS.knob.map((p) => p.label)).toEqual(['S', 'M', 'L']);
    for (const spec of Object.values(BE_SPEC)) expect(spec.maxW).toBeLessThanOrEqual(MAXC);
  });
});

describe('fits / findFree', () => {
  const list = [knob('a', 'k1', 0, 0), knob('b', 'k2', 2, 0)];
  it('rejects overlaps, negative positions and anything past 24 cells', () => {
    expect(fits(list, 4, 0, 2, 2)).toBe(true);
    expect(fits(list, 1, 0, 2, 2)).toBe(false);
    expect(fits(list, -1, 0, 2, 2)).toBe(false);
    expect(fits(list, 22, 0, 2, 2)).toBe(true);
    expect(fits(list, 23, 0, 2, 2)).toBe(false);
  });
  it('ignores the item itself via exceptId', () => {
    expect(fits(list, 1, 0, 2, 2, 'a')).toBe(false); // still hits b
    expect(fits(list, 0, 1, 2, 2, 'a')).toBe(true);
  });
  it('finds the first free spot in reading order', () => {
    expect(findFree(list, 2, 2)).toEqual({ x: 4, y: 0 });
    const full = Array.from({ length: 12 }, (_, i) => knob(`f${i}`, `k${i}`, i * 2, 0));
    expect(findFree(full, 2, 2)).toEqual({ x: 0, y: 2 });
    expect(findFree([], 8, 4)).toEqual({ x: 0, y: 0 });
  });
});

describe('moveItem', () => {
  const b = board({ A: [knob('a', 'k1', 0, 0), knob('b', 'k2', 2, 0)], B: [knob('c', 'k1', 0, 0), knob('d', 'k3', 2, 0)] });
  it('moves within a page and rejects collisions / bounds', () => {
    const r = moveItem(b, 'a', 'A', 4, 0);
    expect(r.ok).toBe(true);
    expect(locate(r.board, 'a')!.item).toMatchObject({ x: 4, y: 0 });
    expect(b.boards.A![0]).toMatchObject({ x: 0 }); // immutable
    expect(moveItem(b, 'a', 'A', 1, 0)).toMatchObject({ ok: false, reason: 'collision' });
    expect(moveItem(b, 'a', 'A', 23, 0)).toMatchObject({ ok: false, reason: 'bounds' });
    expect(moveItem(b, 'a', 'A', 0, 0).board).toBe(b); // no-op keeps the reference
  });
  it('moves across pages', () => {
    const r = moveItem(b, 'b', 'B', 4, 0);
    expect(r.ok).toBe(true);
    expect(r.board.boards.A!.map((i) => i.id)).toEqual(['a']);
    expect(r.board.boards.B!.map((i) => i.id)).toEqual(['c', 'd', 'b']);
    expect(locate(r.board, 'b')).toMatchObject({ page: 'B', item: { x: 4, y: 0 } });
  });
  it('rejects a parameter that already sits on the target page', () => {
    const r = moveItem(b, 'a', 'B', 6, 0); // k1 is already on B
    expect(r).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(r.board).toBe(b);
  });
  it('rejects a collision on the target page and unknown targets', () => {
    expect(moveItem(b, 'b', 'B', 0, 0)).toMatchObject({ ok: false, reason: 'collision' });
    expect(moveItem(b, 'b', 'Nope', 0, 4)).toMatchObject({ ok: false, reason: 'missing' });
    expect(moveItem(b, 'zz', 'B', 0, 4)).toMatchObject({ ok: false, reason: 'missing' });
  });
});

describe('resizeItem / setView / rotateDivider', () => {
  it('resizes within the view limits and rejects collisions', () => {
    const b = board({ A: [knob('a', 'k1', 0, 0), knob('b', 'k2', 4, 0)] });
    const r = resizeItem(b, 'a', 4, 4);
    expect(r.ok).toBe(true);
    expect(locate(r.board, 'a')!.item).toMatchObject({ w: 4, h: 4 });
    expect(resizeItem(b, 'a', 6, 6)).toMatchObject({ ok: false, reason: 'collision' });
    // clamped to knob limits (max 6): asking for 99 becomes 6 → collides with b
    expect(resizeItem(b, 'a', 1, 1).board).toBe(b); // clamped up to 2×2 = unchanged
  });
  it('takes the new view size in place when it fits', () => {
    const b = board({ A: [knob('a', 'k1', 0, 0)] });
    const r = setView(b, 'a', 'fader');
    expect(r).toMatchObject({ ok: true });
    expect(r.moved).toBeUndefined();
    expect(locate(r.board, 'a')!.item).toMatchObject({ view: 'fader', x: 0, y: 0, w: 2, h: 4 });
    expect(setView(b, 'a', 'knob').board).toBe(b);
  });
  it('falls back to the next free spot and reports the move', () => {
    const b = board({ A: [knob('a', 'k1', 0, 0), knob('b', 'k2', 2, 0), knob('c', 'k3', 0, 2)] });
    const r = setView(b, 'a', 'slider'); // 6×1 at 0,0 hits b
    expect(r).toMatchObject({ ok: true, moved: true });
    const a = locate(r.board, 'a')!.item;
    expect(a).toMatchObject({ view: 'slider', w: 6, h: 1, x: 4, y: 0 });
    expect(overlapFree(r.board.boards.A!)).toBe(true);
  });
  it('rotates dividers, swapping width and height', () => {
    const b = board({ A: [hdiv('d', 0, 0, 6, 'Tone')] });
    const r = rotateDivider(b, 'd');
    expect(r.ok).toBe(true);
    expect(locate(r.board, 'd')!.item).toMatchObject({ kind: 'vdiv', w: 1, h: 6, label: 'Tone' });
    const back = rotateDivider(r.board, 'd');
    expect(locate(back.board, 'd')!.item).toMatchObject({ kind: 'hdiv', w: 6, h: 1 });
    const blocked = board({ A: [hdiv('d', 0, 0, 6), knob('k', 'k1', 0, 1)] });
    expect(rotateDivider(blocked, 'd')).toMatchObject({ ok: false, reason: 'collision' });
    expect(rotateDivider(blocked, 'k')).toMatchObject({ ok: false, reason: 'invalid' });
  });
  it('labels dividers', () => {
    const b = board({ A: [hdiv('d', 0, 0)] });
    const r = setDividerLabel(b, 'd', '  Input ');
    expect(locate(r.board, 'd')!.item).toMatchObject({ label: 'Input' });
    const cleared = setDividerLabel(r.board, 'd', '');
    expect('label' in locate(cleared.board, 'd')!.item).toBe(false);
  });
});

describe('add / remove', () => {
  it('adds at the first free spot, refuses a duplicate key on the page', () => {
    const ids = sequentialIdGen('n');
    const b = board({ A: [knob('a', 'k1', 0, 0)] });
    const r = addControl(b, 'A', { key: 'k2', view: 'knob' }, null, ids);
    expect(r).toMatchObject({ ok: true, id: 'n1' });
    expect(locate(r.board, 'n1')!.item).toMatchObject({ x: 2, y: 0, w: 2, h: 2 });
    expect(addControl(r.board, 'A', { key: 'k1', view: 'knob' }, null, ids)).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(addControl(r.board, 'A', { key: 'k3', view: 'knob' }, { x: 1, y: 0 }, ids)).toMatchObject({ ok: false, reason: 'collision' });
    const d = addDivider(r.board, 'A', 'hdiv', null, ids, 'Mix');
    expect(locate(d.board, d.id!)!.item).toMatchObject({ kind: 'hdiv', label: 'Mix', w: 6, h: 1 });
    expect(removeItem(d.board, 'a').board.boards.A!.some((i) => i.id === 'a')).toBe(false);
  });
});

describe('closeGaps', () => {
  it('removes empty rows and columns, including leading ones', () => {
    const list: BeItem[] = [knob('a', 'k1', 2, 2), knob('b', 'k2', 8, 2), knob('c', 'k3', 2, 7)];
    const out = closeGaps(list);
    expect(out.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [2, 0],
      [0, 2]
    ]);
  });
  it('keeps the reference when there is nothing to close', () => {
    const list: BeItem[] = [knob('a', 'k1', 0, 0), knob('b', 'k2', 2, 0)];
    expect(closeGaps(list)).toBe(list);
    expect(closeGaps([])).toEqual([]);
  });
});

describe('tidy', () => {
  it('slides items up then left, keeping dividers and sections in order', () => {
    const list: BeItem[] = [knob('a', 'k1', 0, 0), knob('b', 'k2', 6, 0), hdiv('d', 0, 4, 24, 'Power'), knob('c', 'k3', 4, 8)];
    const out = tidy(list);
    expect(out.find((i) => i.id === 'b')).toMatchObject({ x: 2, y: 0 });
    expect(out.find((i) => i.id === 'd')).toMatchObject({ x: 0, y: 2 }); // divider kept, pulled up
    expect(out.find((i) => i.id === 'c')).toMatchObject({ x: 0, y: 3 }); // stays below the divider
    expect(overlapFree(out)).toBe(true);
    expect(tidy(out)).toBe(out); // a tidy board is a fixed point
  });
});

describe('reflowPack', () => {
  it('drops dividers and gravity-packs free items into the columns', () => {
    const list: BeItem[] = [knob('a', 'k1', 0, 0), hdiv('d', 0, 2, 24), knob('b', 'k2', 2, 0), knob('c', 'k3', 20, 4)];
    const r = reflowPack(list, 4);
    expect(Object.keys(r.pos).sort()).toEqual(['a', 'b', 'c']);
    expect(r.pos.a).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(r.pos.b).toEqual({ x: 2, y: 0, w: 2, h: 2 });
    expect(r.pos.c).toEqual({ x: 0, y: 2, w: 2, h: 2 });
    expect(r.rows).toBe(4);
  });
  it('keeps source rows together and starts each on a new line', () => {
    const list: BeItem[] = [
      knob('a', 'k1', 0, 0, { row: 0 }),
      knob('b', 'k2', 2, 0, { row: 0 }),
      knob('c', 'k3', 4, 0, { row: 0 }),
      knob('d', 'k4', 0, 2, { row: 1 })
    ];
    const r = reflowPack(list, 4);
    expect(r.pos.a).toMatchObject({ x: 0, y: 0 });
    expect(r.pos.b).toMatchObject({ x: 2, y: 0 });
    expect(r.pos.c).toMatchObject({ x: 0, y: 2 }); // wraps inside row 0
    expect(r.pos.d).toMatchObject({ x: 0, y: 4 }); // row 1 starts on a fresh line
    expect(r.rows).toBe(6);
  });
  it('caps widths at the column count', () => {
    const r = reflowPack([{ id: 'e', key: 'eq', view: 'eq', x: 0, y: 0, w: 8, h: 4 }], 3);
    expect(r.pos.e).toEqual({ x: 0, y: 0, w: 3, h: 4 });
  });
});

describe('pages', () => {
  const b = board({ A: [knob('a', 'k1', 0, 0)], B: [] });
  it('adds unique pages and makes them current', () => {
    const r = addPage(b);
    expect(r.page).toBe('Page 3');
    expect(r.board.page).toBe('Page 3');
    expect(r.board.boards['Page 3']).toEqual([]);
    const named = addPage(r.board, 'A');
    expect(named.page).toBe('A 2');
  });
  it('renames, refusing empty and taken names', () => {
    const r = renamePage(b, 'A', ' Amp ');
    expect(r.ok).toBe(true);
    expect(r.board.pageOrder).toEqual(['Amp', 'B']);
    expect(r.board.page).toBe('Amp');
    expect(r.board.boards.Amp).toBe(b.boards.A);
    expect(renamePage(b, 'A', 'B')).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(renamePage(b, 'A', '  ')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(renamePage(b, 'A', 'A').board).toBe(b);
  });
  it('duplicates after the original with fresh ids', () => {
    const ids = sequentialIdGen('dup');
    const r = duplicatePage(b, 'A', ids);
    expect(r.page).toBe('A copy');
    expect(r.board.pageOrder).toEqual(['A', 'A copy', 'B']);
    expect(r.board.boards['A copy']).toEqual([{ ...b.boards.A![0], id: 'dup1' }]);
    const again = duplicatePage(r.board, 'A', ids);
    expect(again.page).toBe('A copy 2');
  });
  it('moves pages and keeps the reference for no-ops', () => {
    expect(movePage(b, 'A', 1).pageOrder).toEqual(['B', 'A']);
    expect(movePage(b, 'A', -1)).toBe(b);
    expect(movePage(b, 'B', 5)).toBe(b);
  });
  it('deletes pages but never the last one', () => {
    const r = deletePage(b, 'A');
    expect(r.ok).toBe(true);
    expect(r.board.pageOrder).toEqual(['B']);
    expect(r.board.page).toBe('B');
    expect('A' in r.board.boards).toBe(false);
    expect(deletePage(r.board, 'B')).toMatchObject({ ok: false, reason: 'last-page' });
  });
});

describe('normalizeBoard', () => {
  const keys = ['k1', 'k2', 'k3', 'eq'];
  it('drops vanished keys, dedupes keys per page, clamps sizes and positions', () => {
    const raw = board({
      A: [
        knob('a', 'k1', 0, 0),
        knob('gone', 'k99', 2, 0),
        knob('dup', 'k1', 4, 0),
        { id: 'big', key: 'k2', view: 'knob', x: 30, y: -3, w: 40, h: 1 },
        { id: 'e', key: 'eq', view: 'eq', x: 0, y: 4, w: 30, h: 2 }
      ]
    });
    const n = normalizeBoard(raw, keys);
    const A = n.boards.A!;
    expect(A.map((i) => i.id)).toEqual(['a', 'big', 'e']);
    expect(A.find((i) => i.id === 'big')).toMatchObject({ x: 18, y: 0, w: 6, h: 2 }); // knob max 6, min 2
    expect(A.find((i) => i.id === 'e')).toMatchObject({ x: 0, y: 4, w: 24, h: 3 }); // eq max 24 / min 3
  });
  it('resolves overlaps by moving the later item to a free spot', () => {
    const n = normalizeBoard(board({ A: [knob('a', 'k1', 0, 0), knob('b', 'k2', 1, 1)] }), keys);
    expect(n.boards.A![1]).toMatchObject({ id: 'b', x: 2, y: 1 }); // nearest: same line, to the right
    expect(overlapFree(n.boards.A!)).toBe(true);
  });
  it('makes ids unique across the board and pages consistent', () => {
    const raw: BeBoard = {
      v: 2,
      pageOrder: ['A', 'A', 'Ghost'],
      page: 'Nowhere',
      boards: { A: [knob('x', 'k1', 0, 0)], Extra: [knob('x', 'k1', 0, 0)] },
      variantSig: 'sig'
    };
    const n = normalizeBoard(raw, keys);
    expect(n.pageOrder).toEqual(['A', 'Ghost', 'Extra']);
    expect(n.boards.Ghost).toEqual([]);
    expect(n.page).toBe('A');
    expect(n.boards.Extra![0]!.id).toBe('n2.k1'); // derived from page index + key, not random
    expect(normalizeBoard(raw, keys)).toEqual(n); // same input, same ids
    expect(n.variantSig).toBe('sig');
  });
  it('never yields zero pages and fixes views against the allowed list', () => {
    const n = normalizeBoard({ v: 2, pageOrder: [], page: '', boards: {} }, keys);
    expect(n.pageOrder).toEqual(['Page 1']);
    const v = normalizeBoard(board({ A: [knob('a', 'k1', 0, 0)] }), keys, { viewsByKey: new Map([['k1', ['fader', 'knob'] as const]]) });
    expect(v.boards.A![0]).toMatchObject({ view: 'knob' });
    const w = normalizeBoard(board({ A: [knob('a', 'k1', 0, 0)] }), keys, { viewsByKey: new Map([['k1', ['button'] as const]]) });
    expect(w.boards.A![0]).toMatchObject({ view: 'button' });
  });
  it('is idempotent: normalizing twice equals normalizing once', () => {
    const raw = board(
      {
        A: [knob('a', 'k1', 3, 3), knob('b', 'k2', 3, 3), { id: 'b', key: 'k3', view: 'slider', x: 22, y: 0, w: 1, h: 9 }, hdiv('d', 20, 0, 40, ' T ')],
        B: [knob('a', 'k1', 0, 0), knob('z', 'zz', 0, 0)]
      },
      { variantSig: 'x' }
    );
    const once = normalizeBoard(raw, keys);
    const twice = normalizeBoard(once, keys);
    expect(twice).toEqual(once);
    for (const pg of once.pageOrder) expect(overlapFree(once.boards[pg]!)).toBe(true);
  });
});

describe('migrateV1', () => {
  const v1: BeBoardV1 = {
    pageOrder: ['Main', 'Wide'],
    page: 'Main',
    boards: {
      Main: [
        { id: 'w1', key: 'k1', x: 0, y: 0, w: 1, h: 1, view: 'knob' },
        { id: 'w2', key: 'eq', x: 1, y: 0, w: 4, h: 2, view: 'eq' },
        { id: 'w3', key: 'meter', x: 5, y: 0, w: 1, h: 2, view: 'meter' }
      ],
      // 20 knobs side by side on two rows: 20 cells wide in v1 → 40 cells in v2 → must wrap
      Wide: [
        ...Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, key: `k${100 + i}`, x: i, y: 0, w: 1, h: 1, view: 'knob' })),
        ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, key: `k${200 + i}`, x: i, y: 1, w: 1, h: 1, view: 'fader' }))
      ]
    },
    variantSig: 'fam|v'
  };
  const keys = [
    'k1',
    'eq',
    'meter',
    ...Array.from({ length: 20 }, (_, i) => `k${100 + i}`),
    ...Array.from({ length: 3 }, (_, i) => `k${200 + i}`)
  ];

  it('scales every coordinate and size ×2 and marks the board v2', () => {
    const m = migrateV1(v1);
    expect(m.v).toBe(2);
    expect(m.variantSig).toBe('fam|v');
    expect(m.boards.Main).toEqual([
      { id: 'w1', key: 'k1', view: 'knob', x: 0, y: 0, w: 2, h: 2 },
      { id: 'w2', key: 'eq', view: 'eq', x: 2, y: 0, w: 8, h: 4 },
      { id: 'w3', key: 'meter', view: 'meter', x: 10, y: 0, w: 2, h: 4 }
    ]);
  });

  it('wraps a page wider than 24 cells, row by row', () => {
    const wide = migrateV1(v1).boards.Wide!;
    expect(bbox(wide).C).toBeLessThanOrEqual(MAXC);
    const row0 = wide.filter((i) => i.id.startsWith('a'));
    // first 12 knobs stay on line 0, the other 8 wrap onto the next line, in order
    expect(row0.slice(0, 12).every((i) => i.y === 0)).toBe(true);
    expect(row0.slice(12).every((i) => i.y === 2)).toBe(true);
    expect(row0[12]).toMatchObject({ x: 0, y: 2 });
    expect(row0[19]).toMatchObject({ x: 14, y: 2 });
    // the second source row comes after both lines of the first
    const row1 = wide.filter((i) => i.id.startsWith('b'));
    expect(row1.map((i) => [i.x, i.y])).toEqual([
      [0, 4],
      [2, 4],
      [4, 4]
    ]);
    expect(overlapFree(wide)).toBe(true);
  });

  it('wraps by source row when items carry one', () => {
    const rows: BeBoardV1 = {
      pageOrder: ['P'],
      page: 'P',
      boards: {
        P: [
          ...Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, key: `k${i}`, x: i, y: 0, w: 1, h: 1, view: 'knob', row: 0 })),
          { id: 's', key: 'k50', x: 0, y: 1, w: 1, h: 1, view: 'knob', row: 1 }
        ]
      }
    };
    const P = migrateV1(rows).boards.P!;
    expect(P.find((i) => i.id === 'r12')).toMatchObject({ x: 0, y: 2, row: 0 });
    expect(P.find((i) => i.id === 's')).toMatchObject({ x: 0, y: 4, row: 1 });
  });

  it('is a no-op on a v2 board (same reference)', () => {
    const m = migrateV1(v1);
    expect(migrateV1(m)).toBe(m);
  });

  it('migrate + normalize: running it twice equals running it once', () => {
    const once = normalizeBoard(migrateV1(v1), keys);
    const twice = normalizeBoard(migrateV1(once), keys);
    expect(twice).toEqual(once);
    // a v1 fader (1×1 → 2×2) grows to the fader's minimum height
    expect(once.boards.Wide!.find((i) => i.id === 'b0')).toMatchObject({ w: 2, h: 3 });
    for (const pg of once.pageOrder) expect(overlapFree(once.boards[pg]!)).toBe(true);
  });

  it('wrapWidePage leaves narrow pages alone', () => {
    const list: BeItem[] = [knob('a', 'k1', 0, 0), knob('b', 'k2', 22, 0)];
    expect(wrapWidePage(list)).toBe(list);
  });

  it('hard-cuts chains of overlapping-in-x items that cannot be split cleanly', () => {
    const chain: BeItem[] = [0, 5, 10, 15, 20].map((x, i) => ({ id: `c${i}`, key: `k${i}`, view: 'slider', x, y: i % 2, w: 6, h: 2 }));
    const out = wrapWidePage(chain);
    expect(bbox(out).C).toBeLessThanOrEqual(MAXC);
    expect(out).toHaveLength(5);
    expect(out.find((i) => i.id === 'c4')).toMatchObject({ x: 0 }); // the straddler starts the next line
    expect(out.find((i) => i.id === 'c4')!.y).toBeGreaterThanOrEqual(3);
  });

  it('isDivider tells the item kinds apart', () => {
    expect(isDivider(hdiv('d', 0, 0))).toBe(true);
    expect(isDivider(knob('a', 'k1', 0, 0))).toBe(false);
  });
});

// ── fix round ──────────────────────────────────────────────────────────────────────────────────────

const pageItemsOf = (b: BeBoard, p: string) => (Object.prototype.hasOwnProperty.call(b.boards, p) ? b.boards[p]! : []);

describe('tidy never creates overlaps', () => {
  it('staggered input: a later item further left blocks an earlier one', () => {
    const list: BeItem[] = [knob('Q', 'k1', 4, 0), knob('P', 'k2', 0, 1)];
    const out = tidy(list);
    expect(overlapFree(out)).toBe(true);
    expect(out.find((i) => i.id === 'Q')).toMatchObject({ x: 2, y: 0 });
    expect(out.find((i) => i.id === 'P')).toMatchObject({ x: 0, y: 0 });
  });
  it('random valid pages stay overlap-free', () => {
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let round = 0; round < 40; round++) {
      const list: BeItem[] = [];
      for (let i = 0; i < 25; i++) {
        const w = 1 + rnd(4);
        const h = 1 + rnd(3);
        const x = rnd(MAXC - w + 1);
        const y = rnd(20);
        if (fits(list, x, y, w, h)) list.push({ id: `r${i}`, key: `k${i}`, view: 'knob', x, y, w, h });
      }
      expect(overlapFree(tidy(list))).toBe(true);
    }
  });
});

describe('migration keeps layouts together when sizes grow', () => {
  // slider(0,0) knob(1,0) knob(2,0) | fader(0,1) knob(1,1) | knob(0,2) — rows 0, 1, 2
  const v1: BeBoardV1 = {
    pageOrder: ['P'],
    page: 'P',
    boards: {
      P: [
        { id: 's', key: 'k1', x: 0, y: 0, w: 1, h: 1, view: 'slider', row: 0 },
        { id: 'a', key: 'k2', x: 1, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
        { id: 'b', key: 'k3', x: 2, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
        { id: 'f', key: 'k4', x: 0, y: 1, w: 1, h: 1, view: 'fader', row: 1 },
        { id: 'c', key: 'k5', x: 1, y: 1, w: 1, h: 1, view: 'knob', row: 1 },
        { id: 'd', key: 'k6', x: 0, y: 2, w: 1, h: 1, view: 'knob', row: 2 }
      ]
    }
  };
  const keys = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];

  it('fits sizes to the view and re-lays rows in order', () => {
    const P = migrateV1(v1).boards.P!;
    const at = (id: string) => P.find((i) => i.id === id)!;
    expect(at('s')).toMatchObject({ x: 0, y: 0, w: 3, h: 2 }); // slider min width 3
    expect(at('a')).toMatchObject({ x: 3, y: 0 });
    expect(at('b')).toMatchObject({ x: 5, y: 0 });
    expect(at('f')).toMatchObject({ x: 0, y: 2, w: 2, h: 3 }); // fader min height 3
    expect(at('c')).toMatchObject({ x: 2, y: 2 });
    expect(at('d')).toMatchObject({ x: 0, y: 5, row: 2 });
    expect(overlapFree(P)).toBe(true);
  });

  it('row order is preserved: every row starts below the previous one', () => {
    const P = migrateV1(v1).boards.P! as BeControl[];
    const top = (r: number) => Math.min(...P.filter((i) => i.row === r).map((i) => i.y));
    const bottom = (r: number) => Math.max(...P.filter((i) => i.row === r).map((i) => i.y + i.h));
    expect(top(1)).toBeGreaterThanOrEqual(bottom(0));
    expect(top(2)).toBeGreaterThanOrEqual(bottom(1));
  });

  it('migrate → normalize → normalize is stable', () => {
    const once = normalizeBoard(migrateV1(v1), keys);
    expect(normalizeBoard(once, keys)).toEqual(once);
    expect(once.boards.P).toEqual(migrateV1(v1).boards.P); // nothing left to repair
  });

  it('keeps the gaps the previous layout had between neighbours and joins wrapped lines', () => {
    const P = migrateV1({
      pageOrder: ['P'],
      page: 'P',
      boards: {
        P: [
          { id: 'a', key: 'k1', x: 0, y: 0, w: 1, h: 1, view: 'knob', row: 0 },
          { id: 'b', key: 'k2', x: 2, y: 0, w: 1, h: 1, view: 'knob', row: 0 }, // one spacer before it
          { id: 'c', key: 'k3', x: 0, y: 1, w: 1, h: 1, view: 'knob', row: 0 } // wrapped by a narrow grid
        ]
      }
    }).boards.P!;
    expect(P.map((i) => [i.id, i.x, i.y])).toEqual([
      ['a', 0, 0],
      ['b', 4, 0],
      ['c', 6, 0]
    ]);
  });

  it('untagged pages keep positions; a grown item pushes its neighbour to the nearest spot', () => {
    const b = normalizeBoard(
      migrateV1({
        pageOrder: ['P'],
        page: 'P',
        boards: {
          P: [
            { id: 's', key: 'k1', x: 0, y: 0, w: 1, h: 1, view: 'slider' },
            { id: 'a', key: 'k2', x: 1, y: 0, w: 1, h: 1, view: 'knob' },
            { id: 'z', key: 'k3', x: 5, y: 3, w: 1, h: 1, view: 'knob' }
          ]
        }
      }),
      keys
    );
    const P = b.boards.P!;
    expect(P.find((i) => i.id === 'a')).toMatchObject({ x: 3, y: 0 }); // same line, right of the slider
    expect(P.find((i) => i.id === 'z')).toMatchObject({ x: 10, y: 6 }); // untouched
    expect(normalizeBoard(b, keys)).toEqual(b);
  });
});

describe('normalizeBoard extras', () => {
  it('keepKeys keeps block-level controls missing from the catalog', () => {
    const raw = board({ A: [knob('a', 'k1', 0, 0), { id: 'm', key: 'meter', view: 'meter', x: 2, y: 0, w: 2, h: 4 }, knob('g', 'k9', 4, 0)] });
    expect(normalizeBoard(raw, ['k1']).boards.A!.map((i) => i.id)).toEqual(['a']);
    expect(normalizeBoard(raw, ['k1'], { keepKeys: BLOCK_LEVEL_KEYS }).boards.A!.map((i) => i.id)).toEqual(['a', 'm']);
  });

  it('caps y so huge coordinates cannot blow up later operations', () => {
    const n = normalizeBoard(board({ A: [knob('a', 'k1', 0, 5e8), knob('b', 'k2', 0, 1e300)] }), ['k1', 'k2']);
    const A = n.boards.A!;
    for (const it of A) expect(it.y + it.h).toBeLessThanOrEqual(MAX_ROWS);
    expect(overlapFree(A)).toBe(true);
    expect(closeGaps(A).map((i) => i.y)).toEqual([0, 0]);
    expect(tidy(A).every((i) => i.y === 0)).toBe(true);
  });

  it('closeGaps works on intervals, not per-cell arrays', () => {
    const far: BeItem[] = [knob('a', 'k1', 0, 0), knob('b', 'k2', 0, 4e8)];
    expect(closeGaps(far).map((i) => i.y)).toEqual([0, 2]);
  });

  it('a control carrying a stray kind is still a control', () => {
    const stray = { ...knob('a', 'k1', 0, 0), kind: 'whatever' } as unknown as BeItem;
    expect(isDivider(stray)).toBe(false);
    expect(normalizeBoard(board({ A: [stray] }), ['k1']).boards.A).toHaveLength(1);
  });
});

describe('page names that exist on Object.prototype', () => {
  const b = board({ A: [knob('a', 'k1', 0, 0)] });
  it('are ordinary pages for every operation', () => {
    expect(moveItem(b, 'a', 'constructor', 0, 0)).toMatchObject({ ok: false, reason: 'missing' });
    expect(addControl(b, 'toString', { key: 'k2', view: 'knob' })).toMatchObject({ ok: false, reason: 'missing' });
    expect(addDivider(b, 'hasOwnProperty', 'hdiv')).toMatchObject({ ok: false, reason: 'missing' });
    const added = addPage(b, 'constructor');
    expect(added.page).toBe('constructor');
    const moved = moveItem(added.board, 'a', 'constructor', 0, 0);
    expect(moved.ok).toBe(true);
    expect(pageItemsOf(moved.board, 'constructor')).toHaveLength(1);
    expect(renamePage(b, 'A', 'toString').ok).toBe(true);
    expect(normalizeBoard({ v: 2, pageOrder: ['constructor', 'valueOf'], page: 'valueOf', boards: {} }, ['k1']).pageOrder).toEqual([
      'constructor',
      'valueOf'
    ]);
  });
  it('rejects __proto__ explicitly', () => {
    expect(renamePage(b, 'A', '__proto__')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(addPage(b, '__proto__').page).toBe('Page 2');
    const evil = JSON.parse('{"v":2,"pageOrder":["__proto__","A"],"page":"__proto__","boards":{"__proto__":[],"A":[]}}') as BeBoard;
    const n = normalizeBoard(evil, ['k1']);
    expect(n.pageOrder).toEqual(['A']);
    expect(n.page).toBe('A');
    expect(Object.getPrototypeOf(n.boards)).toBe(Object.prototype);
  });
});

describe('cross-page move drops the source row', () => {
  it('row belongs to the old page', () => {
    const b = board({ A: [knob('a', 'k1', 0, 0, { row: 3 })], B: [] });
    const r = moveItem(b, 'a', 'B', 0, 0);
    expect('row' in locate(r.board, 'a')!.item).toBe(false);
    const same = moveItem(b, 'a', 'A', 2, 0);
    expect(locate(same.board, 'a')!.item).toMatchObject({ row: 3 });
  });
});

describe('resetPageFrom', () => {
  const seed: BeBoard = {
    v: 2,
    pageOrder: ['A', 'B'],
    page: 'A',
    boards: { A: [knob('a1', 'k1', 0, 0), knob('a2', 'k2', 2, 0)], B: [knob('b1', 'k3', 0, 0)] }
  };
  it('puts the seed page back and leaves the other pages, the order and the current page alone', () => {
    const cur: BeBoard = {
      v: 2,
      pageOrder: ['B', 'A', 'Mine'],
      page: 'B',
      boards: { A: [knob('a1', 'k1', 6, 2)], B: [knob('b1', 'k3', 4, 0), knob('bx', 'k4', 0, 0)], Mine: [knob('m', 'k5', 0, 0)] }
    };
    const r = resetPageFrom(cur, seed, 'A', sequentialIdGen('n'));
    expect(r.ok).toBe(true);
    expect(r.board.boards.A).toEqual(seed.boards.A);
    expect(r.board.boards.A).not.toBe(seed.boards.A);
    expect(r.board.boards.B).toBe(cur.boards.B);
    expect(r.board.pageOrder).toEqual(['B', 'A', 'Mine']);
    expect(r.board.page).toBe('B');
  });
  it('a page the seed does not have becomes empty; a missing page fails', () => {
    const cur: BeBoard = { v: 2, pageOrder: ['A', 'Mine'], page: 'Mine', boards: { A: [], Mine: [knob('m', 'k5', 0, 0)] } };
    expect(resetPageFrom(cur, seed, 'Mine').board.boards.Mine).toEqual([]);
    expect(resetPageFrom(cur, seed, 'Nope')).toMatchObject({ ok: false, reason: 'missing' });
  });
  it('a seed item whose id now lives on another page gets a fresh id', () => {
    // a1 was moved from A to B by the user
    const cur: BeBoard = { v: 2, pageOrder: ['A', 'B'], page: 'A', boards: { A: [], B: [knob('a1', 'k1', 4, 0)] } };
    const r = resetPageFrom(cur, seed, 'A', sequentialIdGen('n'));
    const ids = r.board.boards.A!.map((i) => i.id);
    expect(ids).not.toContain('a1');
    expect(ids).toContain('a2');
    expect(new Set([...ids, ...r.board.boards.B!.map((i) => i.id)]).size).toBe(3);
  });
});

describe('sizeItem (control menu Size)', () => {
  it('takes a preset in place when it fits', () => {
    const b = board({ A: [knob('a', 'k1', 0, 0), knob('b', 'k2', 6, 0)] });
    const r = sizeItem(b, 'a', 4, 4);
    expect(r).toMatchObject({ ok: true });
    expect(r.moved).toBeUndefined();
    expect(locate(r.board, 'a')!.item).toMatchObject({ x: 0, y: 0, w: 4, h: 4 });
    expect(sizeItem(b, 'a', 2, 2).board).toBe(b); // unchanged size: same reference
  });
  it('moves to the nearest free spot when the size does not fit in place', () => {
    const b = board({ A: [knob('a', 'k1', 0, 0), knob('b', 'k2', 2, 0), knob('c', 'k3', 8, 0)] });
    const r = sizeItem(b, 'a', 4, 4); // 4×4 at 0,0 hits b
    expect(r).toMatchObject({ ok: true, moved: true });
    const a = locate(r.board, 'a')!.item;
    expect(a).toMatchObject({ w: 4, h: 4, x: 4, y: 0 }); // same line, to the right
    expect(overlapFree(r.board.boards.A!)).toBe(true);
  });
  it('at the right edge it finds room without leaving the page', () => {
    const b = board({ A: [knob('a', 'k1', 22, 0)] });
    const r = sizeItem(b, 'a', 4, 4);
    expect(r.moved).toBe(true);
    const a = locate(r.board, 'a')!.item;
    expect(a.x + a.w).toBeLessThanOrEqual(MAXC);
    expect(overlapFree(r.board.boards.A!)).toBe(true);
  });
  it('clamps to the view limits and fails only for an unknown item', () => {
    const b = board({ A: [knob('a', 'k1', 0, 0)] });
    expect(locate(sizeItem(b, 'a', 99, 99).board, 'a')!.item).toMatchObject({ w: BE_SPEC.knob.maxW, h: BE_SPEC.knob.maxH });
    expect(sizeItem(b, 'zz', 3, 3)).toMatchObject({ ok: false, reason: 'missing' });
    for (const p of BE_PRESETS.fader) {
      const f = board({ A: [{ ...knob('f', 'k1', 0, 0), view: 'fader', w: 2, h: 4 }] });
      expect(locate(sizeItem(f, 'f', p.w, p.h).board, 'f')!.item).toMatchObject({ w: p.w, h: p.h });
    }
  });
});

describe('moveToPage (control menu Move to page)', () => {
  const b = board({ A: [knob('a', 'k1', 0, 0), knob('b', 'k2', 2, 0)], B: [knob('c', 'k1', 0, 0), knob('d', 'k3', 2, 0)], C: [] });
  it('moves to the first free spot of the other page', () => {
    const r = moveToPage(b, 'b', 'B');
    expect(r.ok).toBe(true);
    expect(locate(r.board, 'b')).toMatchObject({ page: 'B', item: { x: 4, y: 0 } });
    expect(r.board.boards.A!.map((i) => i.id)).toEqual(['a']);
    expect(r.board.page).toBe(b.page); // the active page stays
    expect(locate(moveToPage(b, 'b', 'C').board, 'b')).toMatchObject({ page: 'C', item: { x: 0, y: 0 } });
  });
  it('refuses a page that already holds the control; its own page is a no-op', () => {
    expect(moveToPage(b, 'a', 'B')).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(moveToPage(b, 'a', 'A').board).toBe(b);
    expect(moveToPage(b, 'a', 'Nope')).toMatchObject({ ok: false, reason: 'missing' });
  });
  it('a full page takes it below its content', () => {
    const row = Array.from({ length: 12 }, (_, i) => knob(`f${i}`, `k${100 + i}`, i * 2, 0));
    const full = board({ A: [knob('a', 'k1', 0, 0)], F: row });
    expect(locate(moveToPage(full, 'a', 'F').board, 'a')).toMatchObject({ page: 'F', item: { x: 0, y: 2 } });
  });
});
