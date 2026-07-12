import { describe, expect, it } from 'vitest';
import { isFocusable, nextFocusIndex, wrapTabIndex } from '../focusTrap';

/**
 * T18 — pure parts of the focus-trap utility. The DOM wiring (`focusTrap`
 * action) is thin glue over these and is verified manually; here we lock down
 * the element-filtering predicate and the two index-math helpers, which are the
 * parts most likely to regress silently.
 */

/**
 * Minimal element stub good enough for `isFocusable`: it only reads
 * `matches`, `hasAttribute`, `getAttribute`, `disabled`, `offsetParent`, and
 * `getClientRects`. Kept in-file (the suite is jsdom-free / logic-only).
 */
function fakeEl(opts: {
  tag: string;
  attrs?: Record<string, string>;
  disabled?: boolean;
  visible?: boolean;
}): Element {
  const attrs = opts.attrs ?? {};
  const visible = opts.visible ?? true;
  const HtmlCtor = (globalThis as { HTMLElement?: { prototype: object } }).HTMLElement;
  const el = Object.create(HtmlCtor?.prototype ?? Object.prototype) as Record<string, unknown>;
  el.tagName = opts.tag.toUpperCase();
  el.disabled = opts.disabled ?? false;
  el.offsetParent = visible ? {} : null;
  el.getClientRects = () => (visible ? [{}] : []);
  el.hasAttribute = (name: string) => name in attrs || (name === 'disabled' && !!opts.disabled);
  el.getAttribute = (name: string) => (name in attrs ? attrs[name] : null);
  el.matches = (selector: string) => {
    // Coarse match: the tag name appears as a selector token, or a bracketed
    // attribute selector is present in attrs. Good enough for these cases.
    if (selector.includes(opts.tag.toLowerCase())) return true;
    if (attrs.tabindex !== undefined && selector.includes('[tabindex]')) return true;
    return false;
  };
  return el as unknown as Element;
}

describe('isFocusable', () => {
  it('accepts an enabled, visible button', () => {
    expect(isFocusable(fakeEl({ tag: 'button' }))).toBe(true);
  });

  // The `instanceof HTMLElement` guard is browser-only (no HTMLElement global in
  // node), so the "reject non-element" path is covered by manual verification,
  // not here. The attribute/visibility branches below are the testable logic.

  it('rejects a disabled control', () => {
    expect(isFocusable(fakeEl({ tag: 'button', disabled: true }))).toBe(false);
  });

  it('rejects tabindex="-1"', () => {
    expect(isFocusable(fakeEl({ tag: 'div', attrs: { tabindex: '-1' } }))).toBe(false);
  });

  it('accepts tabindex="0"', () => {
    expect(isFocusable(fakeEl({ tag: 'div', attrs: { tabindex: '0' } }))).toBe(true);
  });

  it('rejects aria-hidden elements', () => {
    expect(isFocusable(fakeEl({ tag: 'button', attrs: { 'aria-hidden': 'true' } }))).toBe(false);
  });

  it('rejects display:none / detached elements (no offsetParent, no rects)', () => {
    expect(isFocusable(fakeEl({ tag: 'button', visible: false }))).toBe(false);
  });
});

describe('nextFocusIndex (roving arrow navigation)', () => {
  it('returns -1 for an empty list', () => {
    expect(nextFocusIndex(0, 0, 1)).toBe(-1);
  });

  it('starts at the first item on a forward move from nothing focused', () => {
    expect(nextFocusIndex(-1, 4, 1)).toBe(0);
  });

  it('starts at the last item on a backward move from nothing focused', () => {
    expect(nextFocusIndex(-1, 4, -1)).toBe(3);
  });

  it('advances forward', () => {
    expect(nextFocusIndex(1, 4, 1)).toBe(2);
  });

  it('wraps forward past the end', () => {
    expect(nextFocusIndex(3, 4, 1)).toBe(0);
  });

  it('wraps backward past the start', () => {
    expect(nextFocusIndex(0, 4, -1)).toBe(3);
  });
});

describe('wrapTabIndex (Tab trap)', () => {
  it('returns -1 for an empty list', () => {
    expect(wrapTabIndex(0, 0, false)).toBe(-1);
  });

  it('pulls stray focus to the first item on Tab', () => {
    expect(wrapTabIndex(-1, 3, false)).toBe(0);
  });

  it('pulls stray focus to the last item on Shift+Tab', () => {
    expect(wrapTabIndex(-1, 3, true)).toBe(2);
  });

  it('advances forward within bounds', () => {
    expect(wrapTabIndex(0, 3, false)).toBe(1);
  });

  it('wraps from the last item to the first on Tab', () => {
    expect(wrapTabIndex(2, 3, false)).toBe(0);
  });

  it('wraps from the first item to the last on Shift+Tab', () => {
    expect(wrapTabIndex(0, 3, true)).toBe(2);
  });

  it('steps backward within bounds on Shift+Tab', () => {
    expect(wrapTabIndex(2, 3, true)).toBe(1);
  });
});
