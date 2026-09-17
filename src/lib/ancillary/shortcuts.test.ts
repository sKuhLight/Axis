import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS, SHORTCUT_TOKENS, visibleShortcutGroups } from './shortcuts';

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

describe('visible shortcuts', () => {
  const chords = (gridActive: boolean, hasTuner: boolean, hasTempo: boolean, presetBrowserActive = false) =>
    visibleShortcutGroups({ gridActive, presetBrowserActive, hasTuner, hasTempo }).flatMap((group) =>
      group.items.map((item) => item.keys.join('+'))
    );

  it('shows the whole catalog when every surface and feature is available', () => {
    expect(chords(true, true, true, true)).toEqual(
      SHORTCUT_GROUPS.flatMap((group) => group.items.map((item) => item.keys.join('+')))
    );
  });

  it('drops scoped and device-gated rows when only the defaults are available', () => {
    // No active page and no tuner/tempo: only the always-global help keys remain.
    expect(chords(false, false, false)).toEqual(['?', 'Esc']);
  });

  it('offers only the global tuner key off the Grid page when the device has one', () => {
    // Tap tempo (`B`) is grid-only regardless of the device; only tuner (`T`) is global.
    expect(chords(false, true, true)).toEqual(['?', 'Esc', 'T']);
  });

  it('keeps a device-gated key out until the device supports it', () => {
    const gridOnly = chords(true, true, false);
    expect(gridOnly).not.toContain('B');
    expect(gridOnly).toContain('T');
  });

  it('advertises the move shortcut only on the Preset Browser page', () => {
    expect(chords(false, true, true, true)).toContain('M');
    expect(chords(false, true, true, false)).not.toContain('M');
  });

  it('never returns an empty group', () => {
    for (const gridActive of [true, false]) {
      for (const presetBrowserActive of [true, false]) {
        for (const hasTuner of [true, false]) {
          for (const hasTempo of [true, false]) {
            for (const group of visibleShortcutGroups({ gridActive, presetBrowserActive, hasTuner, hasTempo })) {
              expect(group.items.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });
});
