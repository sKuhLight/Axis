import { describe, expect, it } from 'vitest';
import type { JsonObject, WorkbenchLayout } from '../../core';
import {
  DEFAULT_CONTENT_MODE,
  effectiveContentMode,
  isPagesLayout,
  resolveContentMode,
  resolveLayoutContentMode
} from '../contentMode';

const layoutWith = (settings: JsonObject | undefined): WorkbenchLayout =>
  ({ settings } as unknown as WorkbenchLayout);

describe('resolveContentMode', () => {
  it('defaults to fixed when settings are missing', () => {
    expect(resolveContentMode(undefined)).toBe('fixed');
    expect(resolveContentMode(null)).toBe('fixed');
    expect(resolveContentMode({})).toBe('fixed');
    expect(DEFAULT_CONTENT_MODE).toBe('fixed');
  });

  it('reads an explicit fixed value', () => {
    expect(resolveContentMode({ contentMode: 'fixed' })).toBe('fixed');
  });

  it('reads an explicit pages value', () => {
    expect(resolveContentMode({ contentMode: 'pages' })).toBe('pages');
  });

  it('is repair-safe: unknown / wrong-typed values fall back to fixed', () => {
    expect(resolveContentMode({ contentMode: 'stage' })).toBe('fixed');
    expect(resolveContentMode({ contentMode: 'PAGES' })).toBe('fixed');
    expect(resolveContentMode({ contentMode: 42 as unknown as string })).toBe('fixed');
    expect(resolveContentMode({ contentMode: true as unknown as string })).toBe('fixed');
    expect(resolveContentMode({ contentMode: null as unknown as string })).toBe('fixed');
    expect(resolveContentMode({ contentMode: { nested: 'pages' } as unknown as string })).toBe('fixed');
  });

  it('ignores unrelated settings keys', () => {
    expect(resolveContentMode({ navMode: 'bottom', presetMode: 'page', rightW: 340 })).toBe('fixed');
    expect(resolveContentMode({ navMode: 'bottom', contentMode: 'pages' })).toBe('pages');
  });
});

describe('resolveLayoutContentMode', () => {
  it('resolves from a layout settings bag', () => {
    expect(resolveLayoutContentMode(layoutWith({ contentMode: 'pages' }))).toBe('pages');
    expect(resolveLayoutContentMode(layoutWith({ contentMode: 'fixed' }))).toBe('fixed');
    expect(resolveLayoutContentMode(layoutWith(undefined))).toBe('fixed');
  });

  it('defaults to fixed when the layout is not yet loaded', () => {
    expect(resolveLayoutContentMode(undefined)).toBe('fixed');
    expect(resolveLayoutContentMode(null)).toBe('fixed');
  });
});

describe('effectiveContentMode', () => {
  it('passes the resolved mode through outside edit mode', () => {
    expect(effectiveContentMode('fixed', false)).toBe('fixed');
    expect(effectiveContentMode('pages', false)).toBe('pages');
  });

  it('forces fixed while editing so every region stays rearrangeable', () => {
    expect(effectiveContentMode('pages', true)).toBe('fixed');
    expect(effectiveContentMode('fixed', true)).toBe('fixed');
  });
});

describe('isPagesLayout', () => {
  it('is true only for pages mode outside edit mode', () => {
    expect(isPagesLayout('pages', false)).toBe(true);
    expect(isPagesLayout('pages', true)).toBe(false);
    expect(isPagesLayout('fixed', false)).toBe(false);
    expect(isPagesLayout('fixed', true)).toBe(false);
  });
});
