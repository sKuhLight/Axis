import { describe, expect, it } from 'vitest';
import { CTX_ECHO_MS, flyoutTakesEscape, isControlMenuKey, isEchoContextMenu, isEditableTarget, longPressOpensMenu, menuAtTile } from './controlMenuInput';

describe('control menu keys and anchor', () => {
  it('Shift+F10 and the ContextMenu key open the menu; plain F10 and other keys do not', () => {
    expect(isControlMenuKey({ key: 'ContextMenu' })).toBe(true);
    expect(isControlMenuKey({ key: 'F10', shiftKey: true })).toBe(true);
    expect(isControlMenuKey({ key: 'F10', shiftKey: false })).toBe(false);
    expect(isControlMenuKey({ key: 'Enter', shiftKey: true })).toBe(false);
  });
  it('a contextmenu event without pointer coordinates (keyboard) opens at the tile', () => {
    expect(menuAtTile({ clientX: 0, clientY: 0 })).toBe(true);
    expect(menuAtTile({ clientX: 0, clientY: 12 })).toBe(false);
    expect(menuAtTile({ clientX: 300, clientY: 400 })).toBe(false);
  });
});

describe('contextmenu echo', () => {
  it('right after an opening (long-press, menu key) the contextmenu event is ignored', () => {
    expect(isEchoContextMenu(true, 1000, 1000 + CTX_ECHO_MS - 1)).toBe(true);
    expect(isEchoContextMenu(true, 1000, 1000 + CTX_ECHO_MS)).toBe(false);
  });
  it('with no menu open it is a real right-click', () => {
    expect(isEchoContextMenu(false, 1000, 1001)).toBe(false);
  });
});

describe('editable targets', () => {
  it('inputs, text areas, selects and contenteditable keep the browser menu', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('long-press → control menu', () => {
  const still = { editMode: false, pinDrag: false, pinPress: false, arrange: false, valueMoved: false };
  it('a still press in normal mode opens it', () => {
    expect(longPressOpensMenu(still)).toBe(true);
  });
  it('never while arranging, during a pin drag or ⚡ press, an arrange move / resize, or a moved value drag', () => {
    expect(longPressOpensMenu({ ...still, editMode: true })).toBe(false);
    expect(longPressOpensMenu({ ...still, pinDrag: true })).toBe(false);
    expect(longPressOpensMenu({ ...still, pinPress: true })).toBe(false);
    expect(longPressOpensMenu({ ...still, arrange: true })).toBe(false);
    expect(longPressOpensMenu({ ...still, valueMoved: true })).toBe(false);
  });
});

describe('modifier flyout Escape', () => {
  const base = { key: 'Escape', defaultPrevented: false, inFlyout: false, overlayOpen: false };
  it('takes an unhandled Escape when nothing else is open', () => {
    expect(flyoutTakesEscape(base)).toBe(true);
  });
  it('leaves it to whoever handled it, and to another open overlay (palette, dialog, menu)', () => {
    expect(flyoutTakesEscape({ ...base, defaultPrevented: true })).toBe(false);
    expect(flyoutTakesEscape({ ...base, overlayOpen: true })).toBe(false);
  });
  it('a key inside the flyout is the flyout’s; other keys never', () => {
    expect(flyoutTakesEscape({ ...base, overlayOpen: true, inFlyout: true })).toBe(true);
    expect(flyoutTakesEscape({ ...base, key: 'Enter' })).toBe(false);
  });
});
