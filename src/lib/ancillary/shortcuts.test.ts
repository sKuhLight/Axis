import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS, SHORTCUT_TOKENS } from './shortcuts';

describe('shortcut catalog', () => {
  it('lists the help shortcut itself', () => {
    const keys = SHORTCUT_GROUPS.flatMap((group) => group.items.map((item) => item.keys.join('+')));
    expect(keys).toContain('?');
  });

  it('has a title and at least one item per group', () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title.trim()).not.toBe('');
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('only uses known key tokens', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const item of group.items) {
        expect(item.keys.length).toBeGreaterThan(0);
        for (const key of item.keys) expect(SHORTCUT_TOKENS.has(key)).toBe(true);
        expect(item.label.trim()).not.toBe('');
      }
    }
  });

  it('does not bind the same chord twice within a group', () => {
    for (const group of SHORTCUT_GROUPS) {
      const chords = group.items.map((item) => item.keys.join('+'));
      expect(new Set(chords).size).toBe(chords.length);
    }
  });
});
