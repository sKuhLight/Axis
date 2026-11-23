import { describe, expect, it } from 'vitest';
import { browserFlagStore, GRID_MAP_HIDDEN_KEY, readGridMapShown, writeGridMapShown, type FlagStore } from './gridMapPrefs';

const mem = (): FlagStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('grid map shown / hidden', () => {
  it('is shown by default and round-trips', () => {
    const st = mem();
    expect(readGridMapShown(st)).toBe(true);
    writeGridMapShown(st, false);
    expect(st.data.get(GRID_MAP_HIDDEN_KEY)).toBe('1');
    expect(readGridMapShown(st)).toBe(false);
    writeGridMapShown(st, true);
    expect(st.data.has(GRID_MAP_HIDDEN_KEY)).toBe(false);
    expect(readGridMapShown(st)).toBe(true);
  });
  it('a missing or throwing store shows it and never throws', () => {
    const broken: FlagStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      }
    };
    expect(readGridMapShown(null)).toBe(true);
    expect(readGridMapShown(broken)).toBe(true);
    expect(() => writeGridMapShown(broken, false)).not.toThrow();
    expect(() => writeGridMapShown(undefined, false)).not.toThrow();
  });
  it('browserFlagStore: a blocked or missing localStorage is null, never a throw', () => {
    expect(
      browserFlagStore(() => {
        throw new Error('SecurityError');
      })
    ).toBeNull();
    expect(browserFlagStore(() => undefined)).toBeNull();
    const st = mem();
    expect(browserFlagStore(() => st)).toBe(st);
    expect(() => browserFlagStore()).not.toThrow();
  });
});
