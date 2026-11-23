import { describe, it, expect } from 'vitest';
import { CANCEL_RESTORE_MS, isDirect, isValueView, lockGesture, restoreOnCancel, scrollAxisOf, tileTouchAction, TOUCH_SLOP, trackNorm, valueAxis, valueDelta } from './touchGesture';

describe('scroll axis', () => {
  it('the top strip scrolls sideways, the side stack (and the phone layout) vertically', () => {
    expect(scrollAxisOf('top')).toBe('x');
    expect(scrollAxisOf('side')).toBe('y');
  });
  it('touch is direct manipulation; the mouse and the pen are not (a pen behaves like the mouse)', () => {
    expect(isDirect('touch')).toBe(true);
    expect(isDirect('pen')).toBe(false);
    expect(isDirect('mouse')).toBe(false);
    expect(isDirect('')).toBe(false);
  });
});

describe('value axis: mode × device class × input', () => {
  // the phone layout always stacks its pages (scroll axis y), whatever the stored navigation
  const cases: [string, 'x' | 'y', string, string, 'x' | 'y'][] = [
    ['desktop top, mouse knob', 'x', 'knob', 'mouse', 'y'],
    ['desktop top, mouse slider', 'x', 'slider', 'mouse', 'x'],
    ['desktop side, mouse knob', 'y', 'knob', 'mouse', 'y'],
    ['desktop side, mouse fader', 'y', 'fader', 'mouse', 'y'],
    ['tablet top, touch knob', 'x', 'knob', 'touch', 'y'],
    ['tablet top, touch fader', 'x', 'fader', 'touch', 'y'],
    ['tablet top, touch slider', 'x', 'slider', 'touch', 'y'],
    ['tablet side (F11), touch knob', 'y', 'knob', 'touch', 'x'],
    ['tablet side (F11), touch number', 'y', 'number', 'touch', 'x'],
    ['phone, touch knob', 'y', 'knob', 'touch', 'x'],
    ['phone, touch fader', 'y', 'fader', 'touch', 'x'],
    // a pen behaves like the mouse whatever the navigation (pens do not pan: REG#2)
    ['phone, pen knob', 'y', 'knob', 'pen', 'y'],
    ['tablet side, pen fader', 'y', 'fader', 'pen', 'y'],
    ['tablet top, pen knob', 'x', 'knob', 'pen', 'y'],
    ['tablet top, pen slider', 'x', 'slider', 'pen', 'x']
  ];
  for (const [name, scroll, view, input, axis] of cases) {
    it(`${name} → ${axis}`, () => expect(valueAxis(view, input, scroll)).toBe(axis));
  }
  it('a direct drag never changes the value along the scroll axis', () => {
    for (const scroll of ['x', 'y'] as const) for (const view of ['knob', 'number', 'fader', 'slider']) expect(valueAxis(view, 'touch', scroll)).not.toBe(scroll);
  });
});

describe('tileTouchAction', () => {
  it('value controls leave the scroll axis and pinch-zoom to the browser', () => {
    for (const view of ['knob', 'number', 'fader', 'slider']) {
      expect(tileTouchAction({ editMode: false, kind: 'cont', view, scroll: 'x' })).toBe('pan-x pinch-zoom');
      expect(tileTouchAction({ editMode: false, kind: 'cont', view, scroll: 'y' })).toBe('pan-y pinch-zoom');
    }
  });
  it('arrange takes every gesture; other tiles keep panning', () => {
    expect(tileTouchAction({ editMode: true, kind: 'cont', view: 'knob', scroll: 'x' })).toBe('none');
    expect(tileTouchAction({ editMode: true, kind: 'toggle', view: 'switch', scroll: 'y' })).toBe('none');
    for (const [kind, view] of [
      ['toggle', 'switch'],
      ['select', 'select'],
      ['action', 'action'],
      ['meter', 'meter'],
      ['eq', 'eq'],
      [undefined, 'hdiv']
    ] as const)
      expect(tileTouchAction({ editMode: false, kind, view, scroll: 'x' })).toBe('manipulation');
    expect(isValueView('toggle', 'knob')).toBe(false);
    expect(isValueView('cont', 'meter')).toBe(false);
  });
});

describe('lockGesture', () => {
  it('stays undecided inside the slop (a tap so far)', () => {
    expect(lockGesture(0, 0, 'y')).toBeNull();
    expect(lockGesture(TOUCH_SLOP - 3, 3, 'y')).toBeNull();
  });
  it('a swipe along the scroll axis is a scroll, never a value change', () => {
    expect(lockGesture(30, 4, 'y')).toBe('scroll'); // top strip: sideways swipe
    expect(lockGesture(-30, -2, 'y')).toBe('scroll');
    expect(lockGesture(3, 40, 'x')).toBe('scroll'); // phone / side: vertical swipe
  });
  it('a drag along the value axis is a value drag', () => {
    expect(lockGesture(2, -20, 'y')).toBe('value');
    expect(lockGesture(-20, 5, 'x')).toBe('value');
  });
  it('an exact diagonal counts as a scroll', () => {
    expect(lockGesture(10, 10, 'y')).toBe('scroll');
    expect(lockGesture(10, -10, 'x')).toBe('scroll');
  });
});

describe('restoreOnCancel (a curved swipe the browser pans after our slop)', () => {
  const d = { lock: 'value' as const, lockedAt: 1000, start: 0.5 };
  it('a value drag cancelled right after it locked goes back to its start value', () => {
    expect(restoreOnCancel(d, 1000 + CANCEL_RESTORE_MS - 1, 0.56)).toBe(0.5);
  });
  it('writes nothing when the value did not change', () => {
    expect(restoreOnCancel(d, 1050, 0.5)).toBeNull();
  });
  it('keeps the value of a drag cancelled later, or of a gesture that never was a value drag', () => {
    expect(restoreOnCancel(d, 1000 + CANCEL_RESTORE_MS, 0.7)).toBeNull();
    expect(restoreOnCancel({ ...d, lock: null }, 1010, 0.7)).toBeNull();
    expect(restoreOnCancel({ ...d, lock: 'scroll' }, 1010, 0.7)).toBeNull();
  });
});

describe('valueDelta / trackNorm', () => {
  it('up and right raise the value', () => {
    expect(valueDelta(5, -12, 'y')).toBe(12);
    expect(valueDelta(5, -12, 'x')).toBe(5);
    expect(valueDelta(-7, 3, 'x')).toBe(-7);
  });
  it('maps a point on a track to 0..1 (vertical from the bottom), clamped', () => {
    const r = { left: 100, top: 200, width: 50, height: 100 };
    expect(trackNorm(0, 225, r, true)).toBe(0.75);
    expect(trackNorm(110, 0, r, false)).toBeCloseTo(0.2);
    expect(trackNorm(0, 400, r, true)).toBe(0);
    expect(trackNorm(500, 0, r, false)).toBe(1);
    expect(trackNorm(0, 0, { left: 0, top: 0, width: 0, height: 0 }, false)).toBe(0);
  });
});
