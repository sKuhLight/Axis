// Contract for the overlay registry (`*.runes.test.ts` → the `runes` vitest project, which
// compiles runes against the CLIENT svelte runtime; see vitest.config.ts).
//
// Two things must hold: the registry-owned open flags drive `$derived` readers reactively,
// and `escape()` reproduces the exact priority order of the old `+page.svelte` else-if chain
// — closing exactly one overlay per press, highest priority first.

import { describe, it, expect, beforeEach } from 'vitest';
import { overlays, type OverlayId } from './overlays.svelte';

beforeEach(() => {
  overlays._resetForTest();
});

describe('registry-owned overlays', () => {
  it('open / close / toggle / isOpen round-trip', () => {
    expect(overlays.isOpen('palette')).toBe(false);
    overlays.open('palette');
    expect(overlays.isOpen('palette')).toBe(true);
    overlays.close('palette');
    expect(overlays.isOpen('palette')).toBe(false);
    overlays.toggle('palette');
    expect(overlays.isOpen('palette')).toBe(true);
    overlays.toggle('palette');
    expect(overlays.isOpen('palette')).toBe(false);
  });

  // `anyOpen` is a getter computed over the `$state`-backed owned map — exercising it proves
  // writes propagate through a derived reader (the pattern components rely on), the same way
  // library.runes.test.ts drives reactivity through the store's own getters.
  it('anyOpen reflects the whole set reactively', () => {
    expect(overlays.anyOpen).toBe(false);
    overlays.open('cabPicker');
    expect(overlays.anyOpen).toBe(true);
    overlays.open('save');
    overlays.close('cabPicker');
    expect(overlays.anyOpen).toBe(true); // save still open
    overlays.close('save');
    expect(overlays.anyOpen).toBe(false);
  });

  it('refuses open() on a delegate-backed overlay', () => {
    let closed = false;
    overlays.register('tuner', { isOpen: () => false, close: () => (closed = true) });
    expect(() => overlays.open('tuner')).toThrow(/delegate-backed/);
    expect(closed).toBe(false);
  });
});

describe('escape() priority', () => {
  // A minimal delegate whose open-state is a local boolean.
  function toggleable(initial = false) {
    const box = { open: initial };
    return {
      box,
      delegate: { isOpen: () => box.open, close: () => (box.open = false) }
    };
  }

  it('closes nothing and returns false when the stack is empty', () => {
    expect(overlays.escape()).toBe(false);
  });

  it('closes the single highest-priority open overlay, leaving the rest', () => {
    // history (order 10) beats palette (30) beats presetPicker (70)
    const hist = toggleable(true);
    overlays.register('history', hist.delegate);
    overlays.open('palette');
    overlays.open('presetPicker');

    expect(overlays.escape()).toBe(true);
    expect(hist.box.open).toBe(false); // history closed first
    expect(overlays.isOpen('palette')).toBe(true);
    expect(overlays.isOpen('presetPicker')).toBe(true);

    expect(overlays.escape()).toBe(true);
    expect(overlays.isOpen('palette')).toBe(false); // then palette
    expect(overlays.isOpen('presetPicker')).toBe(true);

    expect(overlays.escape()).toBe(true);
    expect(overlays.isOpen('presetPicker')).toBe(false);
    expect(overlays.escape()).toBe(false);
  });

  it('historically non-dismissible overlays yield to chain overlays without later closing', () => {
    overlays.open('theme');
    overlays.open('quickBuild'); // order 40, far above theme's 230

    overlays.escape();
    expect(overlays.isOpen('quickBuild')).toBe(false);
    expect(overlays.isOpen('theme')).toBe(true);

    overlays.escape();
    expect(overlays.isOpen('theme')).toBe(true);
  });

  it('the chain order matches the historical +page.svelte sequence', () => {
    const order: OverlayId[] = [
      'tuner', 'history', 'cabPicker', 'palette', 'quickBuild',
      'convertScratch', 'convert', 'presetPicker', 'presetSearch', 'linkArm', 'blockEditor'
    ];
    // Register every chain overlay as open via a delegate, then drain with escape().
    const boxes = new Map(order.map((id) => [id, toggleable(true)] as const));
    for (const [id, t] of boxes) overlays.register(id, t.delegate);

    const closedSequence: OverlayId[] = [];
    for (let i = 0; i < order.length; i++) {
      overlays.escape();
      const justClosed = order.find((id) => boxes.get(id)!.box.open === false && !closedSequence.includes(id));
      if (justClosed) closedSequence.push(justClosed);
    }
    expect(closedSequence).toEqual(order);
    expect(overlays.escape()).toBe(false);
  });

  it('skips an overlay whose delegate opts out of Escape', () => {
    const noEsc = toggleable(true);
    overlays.register('blockEditor', { ...noEsc.delegate, escDismiss: false });
    overlays.open('palette');

    overlays.escape();
    expect(overlays.isOpen('palette')).toBe(false);
    overlays.escape();
    expect(noEsc.box.open).toBe(true); // opted out — never closed by Escape
  });

  it('preserves the historically non-Escape-dismissible owned dialogs', () => {
    for (const id of ['deviceTools', 'save', 'axisHub', 'theme'] as const) {
      overlays.open(id);
      expect(overlays.escape()).toBe(false);
      expect(overlays.isOpen(id)).toBe(true);
      overlays.close(id);
    }
  });
});
