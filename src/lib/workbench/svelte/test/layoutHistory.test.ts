import { describe, expect, it } from 'vitest';
import {
  coalesceKeyFor,
  isCapturedCommand,
  LayoutHistory,
  DEFAULT_LAYOUT_HISTORY_DEPTH,
  DEFAULT_COALESCE_WINDOW_MS
} from '../layoutHistory';
import type { WorkbenchCommand, WorkbenchDocument } from '../../core';

/** A stand-in document: the ring is schema-agnostic (deep-clones plain JSON). */
function doc(tag: string): WorkbenchDocument {
  return { schemaVersion: 1, tag } as unknown as WorkbenchDocument;
}

/** Injectable clock the tests advance explicitly. */
function fakeClock() {
  let t = 1000;
  return {
    env: { now: () => t },
    advance(ms: number) {
      t += ms;
    }
  };
}

const splitResize = (splitId: string): WorkbenchCommand => ({ type: 'split.resize', splitId, ratio: [0.5, 0.5] });
const widgetMove = (ids: string[]): WorkbenchCommand => ({ type: 'widget.move', widgetIds: ids, zone: 'top.right' });
const panelActivate = (panelId: string): WorkbenchCommand => ({ type: 'panel.activate', panelId });
const panelAdd = (id: string): WorkbenchCommand => ({
  type: 'panel.add',
  panel: { id, type: 't', title: id },
  region: 'main'
});

describe('layoutHistory — capture policy', () => {
  it('excludes pure activation commands', () => {
    expect(isCapturedCommand(panelActivate('p'))).toBe(false);
    expect(isCapturedCommand({ type: 'profile.activate', profileId: 'x' })).toBe(false);
  });

  it('includes structural + widget.state commands', () => {
    expect(isCapturedCommand(panelAdd('a'))).toBe(true);
    expect(isCapturedCommand({ type: 'widget.state', widgetId: 'w', state: {} })).toBe(true);
    expect(isCapturedCommand(splitResize('s'))).toBe(true);
  });

  it('scopes coalesce keys to the specific target', () => {
    expect(coalesceKeyFor(splitResize('a'))).toBe('split.resize:a');
    expect(coalesceKeyFor(splitResize('b'))).not.toBe(coalesceKeyFor(splitResize('a')));
    // widget.move set is order-independent
    expect(coalesceKeyFor(widgetMove(['w2', 'w1']))).toBe(coalesceKeyFor(widgetMove(['w1', 'w2'])));
    // commands that should always stand alone
    expect(coalesceKeyFor(panelAdd('a'))).toBeNull();
  });
});

describe('LayoutHistory — ring', () => {
  it('seeds with a baseline and reports nothing to undo/redo', () => {
    const h = new LayoutHistory();
    h.seed(doc('base'));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.length).toBe(1);
  });

  it('push / undo / redo restores the right snapshots', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env });
    h.seed(doc('base'));

    clock.advance(1000);
    h.record(panelAdd('a'), doc('a'));
    clock.advance(1000);
    h.record(panelAdd('b'), doc('b'));

    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    expect((h.undo() as unknown as { tag: string }).tag).toBe('a');
    expect(h.canRedo).toBe(true);
    expect((h.undo() as unknown as { tag: string }).tag).toBe('base');
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeNull();

    expect((h.redo() as unknown as { tag: string }).tag).toBe('a');
    expect((h.redo() as unknown as { tag: string }).tag).toBe('b');
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeNull();
  });

  it('a new commit after undo truncates the redo future', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env });
    h.seed(doc('base'));
    clock.advance(1000);
    h.record(panelAdd('a'), doc('a'));
    clock.advance(1000);
    h.record(panelAdd('b'), doc('b'));

    h.undo(); // back to 'a'
    expect(h.canRedo).toBe(true);
    clock.advance(1000);
    h.record(panelAdd('c'), doc('c'));
    expect(h.canRedo).toBe(false); // 'b' future discarded
    expect((h.undo() as unknown as { tag: string }).tag).toBe('a');
  });

  it('coalesces same-key commits inside the window into one undo step', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env, coalesceWindowMs: 400 });
    h.seed(doc('base'));

    // A continuous split drag: many split.resize on the same split, close together.
    clock.advance(1000);
    h.record(splitResize('s1'), doc('drag-1'));
    clock.advance(100);
    h.record(splitResize('s1'), doc('drag-2'));
    clock.advance(100);
    h.record(splitResize('s1'), doc('drag-3'));

    // One undo step for the whole gesture; undoing lands on the pre-drag baseline.
    expect(h.length).toBe(2);
    expect((h.undo() as unknown as { tag: string }).tag).toBe('base');
    // Redo returns the LAST value of the gesture.
    expect((h.redo() as unknown as { tag: string }).tag).toBe('drag-3');
  });

  it('does NOT coalesce past the time window', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env, coalesceWindowMs: 400 });
    h.seed(doc('base'));
    clock.advance(1000);
    h.record(splitResize('s1'), doc('r1'));
    clock.advance(500); // > window
    h.record(splitResize('s1'), doc('r2'));
    expect(h.length).toBe(3);
    expect((h.undo() as unknown as { tag: string }).tag).toBe('r1');
  });

  it('does NOT coalesce different keys of the same type', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env, coalesceWindowMs: 400 });
    h.seed(doc('base'));
    clock.advance(1000);
    h.record(splitResize('s1'), doc('a'));
    clock.advance(50);
    h.record(splitResize('s2'), doc('b'));
    expect(h.length).toBe(3);
  });

  it('never coalesces null-key commands even when adjacent', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env, coalesceWindowMs: 400 });
    h.seed(doc('base'));
    clock.advance(10);
    h.record(panelAdd('a'), doc('a'));
    clock.advance(10);
    h.record(panelAdd('b'), doc('b'));
    expect(h.length).toBe(3);
  });

  it('ignores excluded command types (no undo step created)', () => {
    const h = new LayoutHistory();
    h.seed(doc('base'));
    h.record(panelActivate('p'), doc('activated'));
    expect(h.canUndo).toBe(false);
    expect(h.length).toBe(1);
  });

  it('caps the ring at the configured depth, evicting oldest', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env, depth: 3, coalesceWindowMs: 0 });
    h.seed(doc('base'));
    for (let i = 0; i < 10; i++) {
      clock.advance(1000);
      h.record(panelAdd(`p${i}`), doc(`v${i}`));
    }
    expect(h.length).toBe(3); // current + 2 undo levels
    // Two undos reach the oldest retained snapshot; a third is impossible.
    h.undo();
    h.undo();
    expect(h.canUndo).toBe(false);
  });

  it('recordBatch collapses a multi-command action into one standalone step', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env });
    h.seed(doc('base'));
    clock.advance(1000);
    h.recordBatch([panelAdd('a'), panelActivate('a')], doc('after-batch'));
    expect(h.length).toBe(2);
    expect((h.undo() as unknown as { tag: string }).tag).toBe('base');
  });

  it('recordBatch is a no-op when no command in the batch is captured', () => {
    const h = new LayoutHistory();
    h.seed(doc('base'));
    h.recordBatch([panelActivate('a'), { type: 'profile.activate', profileId: 'x' }], doc('x'));
    expect(h.length).toBe(1);
    expect(h.canUndo).toBe(false);
  });

  it('reset re-baselines and clears undo/redo', () => {
    const clock = fakeClock();
    const h = new LayoutHistory({ env: clock.env });
    h.seed(doc('base'));
    clock.advance(1000);
    h.record(panelAdd('a'), doc('a'));
    expect(h.canUndo).toBe(true);
    h.reset(doc('fresh'));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.length).toBe(1);
  });

  it('exports sane defaults', () => {
    expect(DEFAULT_LAYOUT_HISTORY_DEPTH).toBeGreaterThanOrEqual(50);
    expect(DEFAULT_COALESCE_WINDOW_MS).toBeGreaterThan(0);
  });
});
