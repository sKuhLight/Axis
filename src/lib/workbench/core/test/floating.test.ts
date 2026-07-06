import { describe, expect, it } from 'vitest';
import {
  clampFloatingPosition,
  healFloatingRect,
  orderedFloatingWidgets,
  raiseFloatingOrder,
  FLOATING_MIN_VISIBLE
} from '../floating';
import type { WidgetInstance } from '../schema';

const SIZE = { width: 150, height: 40 };
const VIEWPORT = { width: 1000, height: 600 };

function floater(id: string, order: number, zone = 'floating'): WidgetInstance {
  return { id, type: 'axis.tempo', zone: zone as WidgetInstance['zone'], order, size: 'default' };
}

describe('clampFloatingPosition', () => {
  it('leaves an in-bounds position untouched (rounded)', () => {
    expect(clampFloatingPosition({ x: 100.4, y: 80.6 }, SIZE, VIEWPORT)).toEqual({ x: 100, y: 81 });
  });

  it('keeps a grabbable strip on the right edge', () => {
    const { x } = clampFloatingPosition({ x: 5000, y: 100 }, SIZE, VIEWPORT);
    expect(x).toBe(VIEWPORT.width - FLOATING_MIN_VISIBLE);
  });

  it('keeps a grabbable strip on the left edge', () => {
    // Dragged far left: min-visible strip of the right side stays on screen.
    const { x } = clampFloatingPosition({ x: -5000, y: 100 }, SIZE, VIEWPORT);
    expect(x).toBe(FLOATING_MIN_VISIBLE - SIZE.width);
  });

  it('keeps the top edge fully on screen (grab handle is at the top)', () => {
    expect(clampFloatingPosition({ x: 10, y: -400 }, SIZE, VIEWPORT).y).toBe(0);
  });

  it('keeps a grabbable strip at the bottom edge', () => {
    const { y } = clampFloatingPosition({ x: 10, y: 5000 }, SIZE, VIEWPORT);
    expect(y).toBe(VIEWPORT.height - FLOATING_MIN_VISIBLE);
  });

  it('passes through when the viewport is not yet measured', () => {
    expect(clampFloatingPosition({ x: 42, y: 17 }, SIZE, { width: 0, height: 0 })).toEqual({ x: 42, y: 17 });
  });

  it('never produces min > max on a tiny viewport', () => {
    const result = clampFloatingPosition({ x: 999, y: 999 }, SIZE, { width: 20, height: 20 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe('healFloatingRect', () => {
  it('returns null when the persisted rect is already visible', () => {
    expect(healFloatingRect({ x: 100, y: 100 }, SIZE, VIEWPORT)).toBeNull();
  });

  it('heals an offscreen persisted position back into view', () => {
    const healed = healFloatingRect({ x: 4000, y: 4000 }, SIZE, VIEWPORT);
    expect(healed).not.toBeNull();
    expect(healed!.x).toBe(VIEWPORT.width - FLOATING_MIN_VISIBLE);
    expect(healed!.y).toBe(VIEWPORT.height - FLOATING_MIN_VISIBLE);
  });

  it('uses the rect extents when present over the fallback size', () => {
    // Dragged far left with a wide rect (width 300): the right-edge min-visible
    // strip stays on screen, so x clamps to `visX - width`, driven by the rect's
    // own width rather than the fallback SIZE.width (150).
    const healed = healFloatingRect({ x: -4000, y: 100, width: 300, height: 80 }, SIZE, VIEWPORT);
    expect(healed!.x).toBe(FLOATING_MIN_VISIBLE - 300);
  });
});

describe('raiseFloatingOrder', () => {
  it('bumps a lower floater above every sibling', () => {
    const widgets = [floater('a', 0), floater('b', 1), floater('c', 2)];
    expect(raiseFloatingOrder(widgets, 'a')).toBe(3);
  });

  it('returns null when already topmost', () => {
    const widgets = [floater('a', 0), floater('b', 1), floater('c', 2)];
    expect(raiseFloatingOrder(widgets, 'c')).toBeNull();
  });

  it('returns null with a single floater', () => {
    expect(raiseFloatingOrder([floater('a', 0)], 'a')).toBeNull();
  });

  it('ignores widgets in other zones', () => {
    const widgets = [floater('a', 0), floater('b', 9, 'top.left')];
    expect(raiseFloatingOrder(widgets, 'a')).toBeNull();
  });
});

describe('orderedFloatingWidgets', () => {
  it('sorts ascending by order (topmost last), ties by id', () => {
    const widgets = [floater('c', 2), floater('a', 0), floater('b', 0)];
    expect(orderedFloatingWidgets(widgets).map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('excludes non-floating widgets', () => {
    const widgets = [floater('a', 0), floater('x', 1, 'bottom')];
    expect(orderedFloatingWidgets(widgets).map((w) => w.id)).toEqual(['a']);
  });
});
