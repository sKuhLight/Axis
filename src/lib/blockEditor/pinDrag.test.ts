import { describe, it, expect } from 'vitest';
import { edgeDropArgs, edgeRegionAt, exceedsPinHold, pinActionArgs, PIN_EDGE_BAND, PIN_HOLD_MS, PIN_MOVE_CANCEL, PIN_PRESS_DRAG, tabIndexAfter } from './pinDrag';

describe('pin hold', () => {
  it('keeps the previous timing and tolerance', () => {
    expect(PIN_HOLD_MS).toBe(380);
    expect(PIN_MOVE_CANCEL).toBe(6);
  });
  it('cancels only past the tolerance on either axis', () => {
    expect(exceedsPinHold(100, 100, 106, 100)).toBe(false);
    expect(exceedsPinHold(100, 100, 107, 100)).toBe(true);
    expect(exceedsPinHold(100, 100, 100, 93)).toBe(true);
    expect(exceedsPinHold(100, 100, 104, 104)).toBe(false);
  });
});

describe('edgeRegionAt', () => {
  const ws = { left: 0, top: 0, width: 1000, height: 500 };
  it('finds the dock edge in the outer band', () => {
    expect(edgeRegionAt(10, 250, ws)).toBe('left');
    expect(edgeRegionAt(990, 250, ws)).toBe('right');
    expect(edgeRegionAt(500, 10, ws)).toBe('top');
    expect(edgeRegionAt(500, 490, ws)).toBe('bottom');
  });
  it('is null in the middle and for an unmeasured workspace', () => {
    expect(edgeRegionAt(500, 250, ws)).toBeNull();
    expect(edgeRegionAt(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
  it('prefers left/right in the corners', () => {
    expect(edgeRegionAt(10, 10, ws)).toBe('left');
    expect(edgeRegionAt(995, 495, ws)).toBe('right');
  });
  it('uses the 18 % band', () => {
    expect(PIN_EDGE_BAND).toBe(0.18);
    expect(edgeRegionAt(179, 250, ws)).toBe('left');
    expect(edgeRegionAt(181, 250, ws)).toBeNull();
  });
});

describe('⚡ press', () => {
  it('a few px of movement start the drag right away (no hold); less is a click', () => {
    expect(PIN_PRESS_DRAG).toBeLessThan(PIN_MOVE_CANCEL);
    expect(exceedsPinHold(50, 50, 53, 50, PIN_PRESS_DRAG)).toBe(false);
    expect(exceedsPinHold(50, 50, 54, 50, PIN_PRESS_DRAG)).toBe(true);
  });
});

describe('pinActionArgs (default pin target)', () => {
  it('without a target: a new custom panel named after the control (the old ⌖ default)', () => {
    expect(pinActionArgs({ id: 1, label: 'Bass' })).toEqual({ paramId: 1, title: 'Bass' });
    expect(pinActionArgs({ id: 1, label: 'Bass' }, null)).toEqual({ paramId: 1, title: 'Bass' });
    // the "New custom panel" row of the pin targets is the same default
    expect(pinActionArgs({ id: 1, label: 'Bass' }, { panelId: null })).toEqual({ paramId: 1, title: 'Bass' });
  });
  it('a custom panel target appends the control to that panel', () => {
    expect(pinActionArgs({ id: 4, label: 'Presence' }, { panelId: 'p7' })).toEqual({ paramId: 4, title: 'Presence', panelId: 'p7' });
  });
});

describe('edgeDropArgs / tabIndexAfter', () => {
  it('a tab target carries the stack, index and region; an edge target its region', () => {
    expect(edgeDropArgs('{"s":1}', { tabStackId: 'st', index: 2, region: 'bottom' })).toEqual({ source: '{"s":1}', tabStackId: 'st', index: 2, region: 'bottom' });
    expect(edgeDropArgs('{"s":1}', { tabStackId: 'st', index: 0 })).toEqual({ source: '{"s":1}', tabStackId: 'st', index: 0 });
    expect(edgeDropArgs('{"s":1}', { region: 'left' })).toEqual({ source: '{"s":1}', region: 'left' });
  });
  it('"New tab" lands right after the editor tab, else at the end', () => {
    expect(tabIndexAfter(['grid', 'editor', 'scenes'], 'editor')).toBe(2);
    expect(tabIndexAfter(['editor'], 'editor')).toBe(1);
    expect(tabIndexAfter(['a', 'b'], 'nope')).toBe(2);
    expect(tabIndexAfter(['a', 'b'], undefined)).toBe(2);
  });
});
