// Block Editor Arrange undo: a capped stack of the boards before each arrange change (newest last).
//
// Every arrange mutation (move, resize, view, size, add, remove, divider ops, close gaps, tidy, page ops)
// pushes the board it replaced; Undo puts the newest one back. Boards are immutable, so an entry is just a
// reference — no copies. The stack lives in BeState and is cleared when Arrange ends, on a profile switch
// and on a (re)load. Pure (arrangeHistory.test.ts).

import type { BeBoard } from './boardModel';

/** How many arrange steps can be undone. */
export const UNDO_CAP = 50;

/** Push an entry; the oldest ones fall off beyond `cap`. */
export function pushUndo<T>(stack: readonly T[], entry: T, cap: number = UNDO_CAP): T[] {
  const next = [...stack, entry];
  const max = Math.max(1, Math.floor(cap));
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Take the newest entry off the stack (null when it is empty; the stack is then returned as is). */
export function popUndo<T>(stack: readonly T[]): { stack: T[]; entry: T | null } {
  if (!stack.length) return { stack: stack as T[], entry: null };
  return { stack: stack.slice(0, -1), entry: stack[stack.length - 1]! };
}

/** The board an undo shows: the stored one, on the page the user is on now when that page still exists
 *  there (else the stored board's own current page). Same reference when nothing needs to change. */
export function restoreBoard(stored: BeBoard, currentPage: string): BeBoard {
  if (stored.page === currentPage || !stored.pageOrder.includes(currentPage)) return stored;
  return { ...stored, page: currentPage };
}

/** After an undo: the page to bring into view when the page the user was on is gone (an undone "Add page" /
 *  "Duplicate"), else null (that page is kept where it is on screen). */
export function pageToShowAfterUndo(before: string, restored: BeBoard | null): string | null {
  if (!restored || restored.pageOrder.includes(before)) return null;
  return restored.page;
}
