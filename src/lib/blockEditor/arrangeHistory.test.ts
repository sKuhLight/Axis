import { describe, expect, it } from 'vitest';
import { pageToShowAfterUndo, popUndo, pushUndo, restoreBoard, UNDO_CAP } from './arrangeHistory';
import type { BeBoard } from './boardModel';

const board = (page: string, pages = ['A', 'B']): BeBoard => ({ v: 2, pageOrder: pages, page, boards: Object.fromEntries(pages.map((p) => [p, []])) });

describe('arrange undo stack', () => {
  it('pushes newest last and pops it back', () => {
    let s: number[] = [];
    s = pushUndo(s, 1);
    s = pushUndo(s, 2);
    expect(s).toEqual([1, 2]);
    const a = popUndo(s);
    expect(a.entry).toBe(2);
    expect(a.stack).toEqual([1]);
    const b = popUndo(a.stack);
    expect(b.entry).toBe(1);
    expect(b.stack).toEqual([]);
  });

  it('an empty stack pops nothing and stays the same', () => {
    const s: number[] = [];
    const r = popUndo(s);
    expect(r.entry).toBeNull();
    expect(r.stack).toBe(s);
  });

  it('is capped: the oldest entries fall off', () => {
    let s: number[] = [];
    for (let i = 1; i <= UNDO_CAP + 7; i++) s = pushUndo(s, i);
    expect(UNDO_CAP).toBe(50);
    expect(s).toHaveLength(UNDO_CAP);
    expect(s[0]).toBe(8);
    expect(s[s.length - 1]).toBe(UNDO_CAP + 7);
    expect(pushUndo([1, 2, 3], 4, 2)).toEqual([3, 4]);
  });

  it('never mutates the stack it was given', () => {
    const s = Object.freeze([1, 2]) as readonly number[];
    expect(pushUndo(s, 3)).toEqual([1, 2, 3]);
    expect(popUndo(s).stack).toEqual([1]);
    expect(s).toEqual([1, 2]);
  });

  it('restores on the page the user is on when the stored board has it', () => {
    const stored = board('A');
    expect(restoreBoard(stored, 'A')).toBe(stored);
    expect(restoreBoard(stored, 'B').page).toBe('B');
    // a page the stored board does not have (it was added after the snapshot): the stored page
    expect(restoreBoard(stored, 'C')).toBe(stored);
  });

  it('brings the restored page into view when the page the user was on went away with the undo', () => {
    // an undone "Add page" / "Duplicate": the user was on C, which the restored board does not have
    expect(pageToShowAfterUndo('C', board('A'))).toBe('A');
    expect(pageToShowAfterUndo('B', board('B'))).toBeNull();
    expect(pageToShowAfterUndo('B', board('A'))).toBeNull(); // B still there: it is kept where it is
    expect(pageToShowAfterUndo('A', null)).toBeNull();
  });
});
