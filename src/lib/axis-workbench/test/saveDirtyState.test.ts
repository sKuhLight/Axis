import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../history.svelte';
import { isSaveDirty } from '../widgets/saveDirtyState';

let seq = 0;
const edit = (): HistoryEntry => ({ id: `e${seq++}`, t: seq, label: 'edit', ops: [], undoable: true });
const save = (): HistoryEntry => ({ id: `s${seq++}`, t: seq, label: 'Saved to preset 1', ops: [], undoable: false });
const barrier = (): HistoryEntry => ({ id: `b${seq++}`, t: seq, label: 'Loaded', ops: [], undoable: false, barrier: true });

describe('isSaveDirty', () => {
  it('is clean with no history', () => {
    expect(isSaveDirty([], 0)).toBe(false);
  });

  it('is dirty when an undoable edit is live above the baseline', () => {
    const entries = [edit()];
    expect(isSaveDirty(entries, entries.length)).toBe(true);
  });

  it('is clean immediately after a save marker', () => {
    const entries = [edit(), save()];
    expect(isSaveDirty(entries, entries.length)).toBe(false);
  });

  it('is dirty again after editing past a save', () => {
    const entries = [edit(), save(), edit()];
    expect(isSaveDirty(entries, entries.length)).toBe(true);
  });

  it('respects the cursor — undone edits above the cursor do not count as dirty', () => {
    const entries = [edit(), save(), edit()];
    // cursor rolled back to just after the save (trailing edit undone) ⇒ clean
    expect(isSaveDirty(entries, 2)).toBe(false);
    // cursor before the save, only the first edit is live ⇒ dirty
    expect(isSaveDirty(entries, 1)).toBe(true);
    // full cursor with the trailing edit live ⇒ dirty
    expect(isSaveDirty(entries, 3)).toBe(true);
  });

  it('treats a buffer-replacement barrier as a clean baseline', () => {
    const entries = [edit(), barrier()];
    expect(isSaveDirty(entries, entries.length)).toBe(false);
  });

  it('clamps an out-of-range cursor', () => {
    const entries = [edit()];
    expect(isSaveDirty(entries, 99)).toBe(true);
    expect(isSaveDirty(entries, -5)).toBe(false);
  });
});
