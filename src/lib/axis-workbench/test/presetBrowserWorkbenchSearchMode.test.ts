import { describe, expect, it, beforeEach } from 'vitest';

import {
  AXIS_PB_SEARCH_MODE_KEY,
  loadAdvancedMode,
  persistAdvancedMode
} from '../presetBrowser/presetBrowserWorkbenchSearchMode';

// Minimal in-memory localStorage stub for the node test env.
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0
  } as Storage;
}

describe('Preset Browser sticky search mode', () => {
  beforeEach(() => stubStorage());

  it('defaults to simple for a user who has never toggled', () => {
    expect(loadAdvancedMode()).toBe(false);
  });

  it('round-trips both modes through storage', () => {
    persistAdvancedMode(true);
    expect(localStorage.getItem(AXIS_PB_SEARCH_MODE_KEY)).toBe('advanced');
    expect(loadAdvancedMode()).toBe(true);

    persistAdvancedMode(false);
    expect(localStorage.getItem(AXIS_PB_SEARCH_MODE_KEY)).toBe('simple');
    expect(loadAdvancedMode()).toBe(false);
  });

  // Only the exact string 'advanced' opts in, so no corrupt or legacy value can land the user in a
  // query language they never asked for.
  it.each(['true', '1', '{}', '', 'Advanced', 'null'])('reads %o as simple', (raw) => {
    localStorage.setItem(AXIS_PB_SEARCH_MODE_KEY, raw);
    expect(loadAdvancedMode()).toBe(false);
  });

  it('survives storage being unavailable', () => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    } as unknown as Storage;

    expect(() => persistAdvancedMode(true)).not.toThrow();
    expect(loadAdvancedMode()).toBe(false);
  });
});
