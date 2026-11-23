import { describe, expect, it } from 'vitest';
import {
  aimedAtEditor,
  arrangeEscape,
  arrangeKeyAction,
  DIVIDER_NAME,
  growItem,
  isForeignOverlay,
  keepSelection,
  LIBRARY_W,
  libraryAdd,
  libraryGrab,
  libraryPlacement,
  nudgeItem,
  onPage,
  tidyPages
} from './arrangeModel';
import {
  addDivider,
  closeGaps,
  tidy,
  deletePage,
  duplicatePage,
  locate,
  moveItem,
  movePage,
  rotateDivider,
  sequentialIdGen,
  setDividerLabel,
  type BeBoard,
  type BeItem
} from './boardModel';
import { onDrawnItems } from './boardView';

const k = (id: string, key: string, x: number, y: number, w = 2, h = 2): BeItem => ({ id, key, view: 'knob', x, y, w, h });
const board = (boards: Record<string, BeItem[]>, page?: string): BeBoard => ({ v: 2, pageOrder: Object.keys(boards), page: page ?? Object.keys(boards)[0]!, boards });
const key = (over: Partial<Parameters<typeof arrangeKeyAction>[0]>) => ({ key: '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...over });
const at = (b: BeBoard, id: string) => locate(b, id)?.item;

describe('arrangeKeyAction', () => {
  it('arrows move one cell, Shift+arrows resize by one cell', () => {
    expect(arrangeKeyAction(key({ key: 'ArrowLeft' }))).toEqual({ kind: 'move', dx: -1, dy: 0 });
    expect(arrangeKeyAction(key({ key: 'ArrowRight' }))).toEqual({ kind: 'move', dx: 1, dy: 0 });
    expect(arrangeKeyAction(key({ key: 'ArrowUp' }))).toEqual({ kind: 'move', dx: 0, dy: -1 });
    expect(arrangeKeyAction(key({ key: 'ArrowDown' }))).toEqual({ kind: 'move', dx: 0, dy: 1 });
    expect(arrangeKeyAction(key({ key: 'ArrowRight', shiftKey: true }))).toEqual({ kind: 'resize', dw: 1, dh: 0 });
    expect(arrangeKeyAction(key({ key: 'ArrowUp', shiftKey: true }))).toEqual({ kind: 'resize', dw: 0, dh: -1 });
  });

  it('Delete / Backspace remove; Ctrl/Cmd+Z undo; redo keys are taken (no-op)', () => {
    expect(arrangeKeyAction(key({ key: 'Delete' }))).toEqual({ kind: 'remove' });
    expect(arrangeKeyAction(key({ key: 'Backspace' }))).toEqual({ kind: 'remove' });
    expect(arrangeKeyAction(key({ key: 'z', ctrlKey: true }))).toEqual({ kind: 'undo' });
    expect(arrangeKeyAction(key({ key: 'Z', metaKey: true }))).toEqual({ kind: 'undo' });
    expect(arrangeKeyAction(key({ key: 'Z', ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'redo' });
    expect(arrangeKeyAction(key({ key: 'y', ctrlKey: true }))).toEqual({ kind: 'redo' });
  });

  it('other keys and Alt combinations are not Arrange’s', () => {
    expect(arrangeKeyAction(key({ key: 'a' }))).toBeNull();
    expect(arrangeKeyAction(key({ key: 'Enter' }))).toBeNull();
    expect(arrangeKeyAction(key({ key: 'ArrowLeft', altKey: true }))).toBeNull();
    expect(arrangeKeyAction(key({ key: 'z', ctrlKey: true, altKey: true }))).toBeNull();
    expect(arrangeKeyAction(key({ key: 'c', ctrlKey: true }))).toBeNull();
  });
});

describe('keyboard maths: nudge and grow', () => {
  const b = board({ P: [k('a', 'k1', 0, 0), k('b', 'k2', 3, 0)] });

  it('nudge moves one cell and refuses the page edge and other items', () => {
    expect(at(nudgeItem(b, 'a', 1, 0).board, 'a')).toMatchObject({ x: 1, y: 0 });
    expect(at(nudgeItem(b, 'a', 0, 1).board, 'a')).toMatchObject({ x: 0, y: 1 });
    expect(nudgeItem(b, 'a', -1, 0)).toMatchObject({ ok: false, reason: 'bounds' });
    expect(nudgeItem(b, 'a', 0, -1)).toMatchObject({ ok: false, reason: 'bounds' });
    const next = nudgeItem(b, 'a', 1, 0).board;
    expect(nudgeItem(next, 'a', 1, 0)).toMatchObject({ ok: false, reason: 'collision' });
    const edge = board({ P: [k('e', 'k1', 22, 0)] });
    expect(nudgeItem(edge, 'e', 1, 0)).toMatchObject({ ok: false, reason: 'bounds' });
    expect(nudgeItem(b, 'zz', 1, 0)).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('grow resizes by one cell inside the view limits; past a limit it is a no-op', () => {
    expect(at(growItem(b, 'a', 0, 1).board, 'a')).toMatchObject({ w: 2, h: 3 });
    // a knob is at least 2×2: shrinking further changes nothing (same board)
    const r = growItem(b, 'a', -1, 0);
    expect(r.ok).toBe(true);
    expect(r.board).toBe(b);
    // growing into the neighbour is refused
    const wide = growItem(growItem(b, 'a', 1, 0).board, 'a', 1, 0);
    expect(wide).toMatchObject({ ok: false, reason: 'collision' });
  });
});

describe('Escape while arranging', () => {
  const c = { defaultPrevented: false, overlayOpen: false, editableTarget: false, libOpen: false, dragging: false };
  it('a drag first, then the library, then Arrange itself', () => {
    expect(arrangeEscape({ ...c, dragging: true, libOpen: true })).toBe('drag');
    expect(arrangeEscape({ ...c, libOpen: true })).toBe('library');
    expect(arrangeEscape(c)).toBe('leave');
  });
  it('a running drag takes the key before an overlay or a field does', () => {
    expect(arrangeEscape({ ...c, dragging: true, overlayOpen: true })).toBe('drag');
    expect(arrangeEscape({ ...c, dragging: true, editableTarget: true })).toBe('drag');
    expect(arrangeEscape({ ...c, dragging: true, defaultPrevented: true })).toBeNull();
  });
  it('leaves the key to whoever owns it', () => {
    expect(arrangeEscape({ ...c, defaultPrevented: true })).toBeNull();
    expect(arrangeEscape({ ...c, overlayOpen: true, libOpen: true })).toBeNull();
    expect(arrangeEscape({ ...c, editableTarget: true })).toBeNull();
  });
});

describe('whose key is it', () => {
  // a tiny tree: shell > drawer > root > tile; shell > layer > library / menu; shell > dialog
  type N = { name: string; kids: N[]; contains(o: unknown): boolean };
  const node = (name: string, kids: N[] = []): N => {
    const n: N = { name, kids, contains: (o) => o === n || kids.some((k) => k.contains(o)) };
    return n;
  };
  const tile = node('tile');
  const root = node('root', [tile]);
  const drawer = node('drawer', [root]);
  const library = node('library');
  const menu = node('menu');
  const layer = node('layer', [library, menu]);
  const dialog = node('dialog');
  const body = node('body');
  const html = node('html');

  it('a key is the editor’s at its root, its own layer, or nothing in particular', () => {
    expect(aimedAtEditor(tile, root, layer, body, html)).toBe(true);
    expect(aimedAtEditor(menu, root, layer, body, html)).toBe(true);
    expect(aimedAtEditor(menu, root, null, body, html)).toBe(false); // arrows / Delete: the root only
    expect(aimedAtEditor(body, root, layer, body, html)).toBe(true);
    expect(aimedAtEditor(null, root, layer, body, html)).toBe(true);
    expect(aimedAtEditor(dialog, root, layer, body, html)).toBe(false);
  });

  it('the library, the editor’s menus and a drawer holding the editor are no foreign overlay; a dialog is', () => {
    expect(isForeignOverlay(library, root, layer)).toBe(false);
    expect(isForeignOverlay(menu, root, layer)).toBe(false);
    expect(isForeignOverlay(drawer, root, layer)).toBe(false);
    expect(isForeignOverlay(dialog, root, layer)).toBe(true);
    expect(isForeignOverlay(library, root, null)).toBe(true);
  });
});

describe('Close gaps / Tidy up / Auto-pack', () => {
  it('close gaps removes empty rows and columns of one page only', () => {
    const b = board({ P: [k('a', 'k1', 2, 2), k('b', 'k2', 8, 6)], Q: [k('c', 'k3', 4, 4)] });
    const r = onPage(b, 'P', closeGaps);
    expect(r.ok).toBe(true);
    expect(at(r.board, 'a')).toMatchObject({ x: 0, y: 0 });
    expect(at(r.board, 'b')).toMatchObject({ x: 2, y: 2 });
    expect(at(r.board, 'c')).toMatchObject({ x: 4, y: 4 });
    expect(onPage(r.board, 'P', closeGaps).board).toBe(r.board);
    expect(onPage(b, 'nope', closeGaps)).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('tidy slides up and left; tidying a tidy page is a no-op', () => {
    const b = board({ P: [k('a', 'k1', 4, 4)] });
    const r = onPage(b, 'P', tidy);
    expect(at(r.board, 'a')).toMatchObject({ x: 0, y: 0 });
    expect(onPage(r.board, 'P', tidy).board).toBe(r.board);
  });

  it('tidyPages tidies each named page once and skips unknown pages', () => {
    const b = board({ P: [k('a', 'k1', 4, 4)], Q: [k('c', 'k3', 6, 2)], R: [k('d', 'k4', 6, 2)] });
    const out = tidyPages(b, ['P', 'Q', 'P', 'gone']);
    expect(at(out, 'a')).toMatchObject({ x: 0, y: 0 });
    expect(at(out, 'c')).toMatchObject({ x: 0, y: 0 });
    expect(at(out, 'd')).toMatchObject({ x: 6, y: 2 });
    expect(tidyPages(out, ['P', 'Q'])).toBe(out);
  });
});

describe('the Add library', () => {
  it('a click adds at the first free spot of the page, a drop at the exact spot', () => {
    const b = board({ P: [k('a', 'k1', 0, 0)] });
    const click = libraryAdd(b, 'P', { key: 'k2', view: 'knob' }, null, sequentialIdGen('n'));
    expect(click.ok).toBe(true);
    expect(click.id).toBe('n1');
    expect(at(click.board, 'n1')).toMatchObject({ key: 'k2', view: 'knob', x: 2, y: 0, w: 2, h: 2 });
    const drop = libraryAdd(b, 'P', { key: 'k2', view: 'fader' }, { x: 10, y: 3 }, sequentialIdGen('n'));
    expect(at(drop.board, 'n1')).toMatchObject({ view: 'fader', x: 10, y: 3, w: 2, h: 4 });
  });

  it('the first free spot fills a hole before going below', () => {
    const b = board({ P: [k('a', 'k1', 0, 0), k('b', 'k2', 4, 0)] });
    expect(at(libraryAdd(b, 'P', { key: 'k3', view: 'knob' }, null, sequentialIdGen('n')).board, 'n1')).toMatchObject({ x: 2, y: 0 });
    const full = board({ P: Array.from({ length: 12 }, (_, i) => k(`i${i}`, `k${i}`, i * 2, 0)) });
    expect(at(libraryAdd(full, 'P', { key: 'k99', view: 'knob' }, null, sequentialIdGen('n')).board, 'n1')).toMatchObject({ x: 0, y: 2 });
  });

  it('refuses a control already on the page, a collision and a spot outside the page', () => {
    const b = board({ P: [k('a', 'k1', 0, 0)] });
    expect(libraryAdd(b, 'P', { key: 'k1', view: 'knob' })).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(libraryAdd(b, 'P', { key: 'k2', view: 'knob' }, { x: 1, y: 1 })).toMatchObject({ ok: false, reason: 'collision' });
    expect(libraryAdd(b, 'P', { key: 'k2', view: 'knob' }, { x: 23, y: 0 })).toMatchObject({ ok: false, reason: 'bounds' });
  });

  it('a library drag holds the new item by its middle cell', () => {
    expect(libraryGrab(2, 2)).toEqual({ cx: 0, cy: 0 });
    expect(libraryGrab(3, 3)).toEqual({ cx: 1, cy: 1 });
    expect(libraryGrab(8, 4)).toEqual({ cx: 3, cy: 1 });
    expect(libraryGrab(1, 1)).toEqual({ cx: 0, cy: 0 });
  });
});

describe('libraryPlacement', () => {
  const vp = { width: 1440, height: 900 };

  it('opens below the bar, right-aligned to its trigger', () => {
    const p = libraryPlacement({ right: 880 }, { top: 190, bottom: 234 }, vp, 1);
    expect(p).toEqual({ left: 880 - LIBRARY_W, top: 238, bottom: null, width: LIBRARY_W, maxH: 900 - 234 - 12 });
  });

  it('flips above a bar near the window bottom when there is more room above', () => {
    const p = libraryPlacement({ right: 880 }, { top: 630, bottom: 674 }, vp, 1);
    expect(p).toMatchObject({ top: null, bottom: 900 - 630 + 4, maxH: 630 - 12 });
    // enough room below (≥ 260 px) always opens below, even with more room above
    expect(libraryPlacement({ right: 880 }, { top: 600, bottom: 628 }, vp, 1)).toMatchObject({ top: 632, bottom: null });
  });

  it('is clamped into the window and keeps a smallest height', () => {
    expect(libraryPlacement({ right: 100 }, { top: 0, bottom: 40 }, vp, 1).left).toBe(8);
    expect(libraryPlacement({ right: 1600 }, { top: 0, bottom: 40 }, vp, 1).left).toBe(1440 - LIBRARY_W - 8);
    expect(libraryPlacement({ right: 300 }, { top: 0, bottom: 40 }, { width: 300, height: 900 }, 1).width).toBe(284);
    expect(libraryPlacement({ right: 880 }, { top: 20, bottom: 860 }, vp, 1)).toMatchObject({ top: 864, maxH: 140 });
  });

  it('turns visual px into layout px under a CSS zoom', () => {
    const p = libraryPlacement({ right: 900 }, { top: 200, bottom: 250 }, vp, 1.5);
    expect(p.width).toBe(LIBRARY_W);
    expect(p.left).toBeCloseTo((900 - LIBRARY_W * 1.5) / 1.5, 6);
    expect(p.top).toBeCloseTo(254 / 1.5, 6);
  });
});

describe('cross-page move (drag onto another page of the strip)', () => {
  it('moves onto the other page; a parameter already there is refused and nothing moves', () => {
    const b = board({ P: [k('a', 'k1', 0, 0)], Q: [k('b', 'k2', 0, 0)] });
    const r = moveItem(b, 'a', 'Q', 4, 0);
    expect(r.ok).toBe(true);
    expect(locate(r.board, 'a')).toMatchObject({ page: 'Q', item: { x: 4, y: 0 } });
    expect(r.board.boards.P).toEqual([]);
    const dup = board({ P: [k('a', 'k1', 0, 0)], Q: [k('b', 'k1', 6, 0)] });
    const refused = moveItem(dup, 'a', 'Q', 0, 0);
    expect(refused).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(refused.board).toBe(dup);
  });

  it('a kept, not drawn control neither blocks the drop nor gets lost', () => {
    const hidden: BeItem = k('m', 'meter', 4, 0);
    const b = board({ P: [k('a', 'k1', 0, 0)], Q: [hidden] });
    const shown = (it: BeItem) => (it as { key?: string }).key !== 'meter';
    const r = onDrawnItems(b, shown, (d) => moveItem(d, 'a', 'Q', 4, 0));
    expect(r.ok).toBe(true);
    expect(r.board.boards.Q!.map((i) => i.id).sort()).toEqual(['a', 'm']);
  });
});

describe('dividers', () => {
  it('are added at the first free spot, labelled and rotated', () => {
    const b = board({ P: [k('a', 'k1', 0, 0)] });
    const h = addDivider(b, 'P', 'hdiv', null, sequentialIdGen('d'));
    expect(h.id).toBe('d1');
    expect(at(h.board, 'd1')).toMatchObject({ kind: 'hdiv', x: 2, y: 0, w: 6, h: 1 });
    const labelled = setDividerLabel(h.board, 'd1', '  Tone stack ');
    expect(at(labelled.board, 'd1')).toMatchObject({ label: 'Tone stack' });
    expect(setDividerLabel(labelled.board, 'd1', 'Tone stack').board).toBe(labelled.board);
    expect(at(setDividerLabel(labelled.board, 'd1', '').board, 'd1')).not.toHaveProperty('label');
    const rotated = rotateDivider(labelled.board, 'd1');
    expect(rotated.ok).toBe(true);
    expect(at(rotated.board, 'd1')).toMatchObject({ kind: 'vdiv', w: 1, h: 6, label: 'Tone stack' });
    expect(setDividerLabel(b, 'a', 'x')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(DIVIDER_NAME.hdiv).toBe('Horizontal divider');
  });

  it('rotating into another item is refused', () => {
    const b = board({ P: [{ id: 'd', kind: 'hdiv', x: 0, y: 0, w: 6, h: 1 }, k('a', 'k1', 0, 2)] });
    expect(rotateDivider(b, 'd')).toMatchObject({ ok: false, reason: 'collision' });
  });
});

describe('page operations (Page ▾)', () => {
  const b = board({ A: [k('a', 'k1', 0, 0)], B: [k('b', 'k2', 0, 0)], C: [] }, 'B');

  it('duplicate: a copy right after the page with fresh ids, shown next', () => {
    const r = duplicatePage(b, 'A', sequentialIdGen('x'));
    expect(r.page).toBe('A copy');
    expect(r.board.pageOrder).toEqual(['A', 'A copy', 'B', 'C']);
    expect(r.board.page).toBe('A copy');
    expect(r.board.boards['A copy']).toEqual([{ ...k('a', 'k1', 0, 0), id: 'x1' }]);
    expect(r.board.boards.A![0]!.id).toBe('a');
    expect(duplicatePage(r.board, 'A', sequentialIdGen('y')).page).toBe('A copy 2');
  });

  it('move keeps the active page and refuses moving past the ends', () => {
    const r = movePage(b, 'A', 1);
    expect(r.pageOrder).toEqual(['B', 'A', 'C']);
    expect(r.page).toBe('B');
    expect(movePage(b, 'A', -1)).toBe(b);
    expect(movePage(b, 'C', 1)).toBe(b);
  });

  it('delete: another page keeps the active page; the active one hands over to its left neighbour; never the last', () => {
    const other = deletePage(b, 'C');
    expect(other.board.pageOrder).toEqual(['A', 'B']);
    expect(other.board.page).toBe('B');
    const active = deletePage(b, 'B');
    expect(active.board.page).toBe('A');
    expect(active.board.boards).not.toHaveProperty('B');
    const one = board({ A: [] });
    expect(deletePage(one, 'A')).toMatchObject({ ok: false, reason: 'last-page' });
  });
});

describe('keepSelection', () => {
  it('keeps an item that still exists, else nothing', () => {
    const b = board({ P: [k('a', 'k1', 0, 0)] });
    expect(keepSelection(b, 'a')).toBe('a');
    expect(keepSelection(b, 'gone')).toBeNull();
    expect(keepSelection(null, 'a')).toBeNull();
    expect(keepSelection(b, null)).toBeNull();
  });
});
