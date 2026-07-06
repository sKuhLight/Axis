import { describe, expect, it } from 'vitest';
import {
  AXIS_WORKBENCH_BACKUP_KEYS,
  AXIS_WORKBENCH_CACHE_KEY,
  listAxisWorkbenchBackups,
  readAxisWorkbenchBackup,
  readWorkbenchDocRev,
  rotateAxisWorkbenchBackups,
  shouldAdoptIncomingWorkbenchDoc,
  stashAxisWorkbenchBackup,
  type StorageLike
} from '../axisWorkbenchBackups';

class MemStorage implements StorageLike {
  #store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#store.has(key) ? this.#store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.#store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.#store.delete(key);
  }
}

const doc = (marker: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  marker,
  layouts: { 'layout.a': {}, 'layout.b': {} },
  ...extra
});

describe('readWorkbenchDocRev / shouldAdoptIncomingWorkbenchDoc', () => {
  it('reads missing, invalid, and non-positive revs as 0', () => {
    expect(readWorkbenchDocRev(null)).toBe(0);
    expect(readWorkbenchDocRev('nope')).toBe(0);
    expect(readWorkbenchDocRev({})).toBe(0);
    expect(readWorkbenchDocRev({ rev: 'high' })).toBe(0);
    expect(readWorkbenchDocRev({ rev: Number.NaN })).toBe(0);
    expect(readWorkbenchDocRev({ rev: Number.POSITIVE_INFINITY })).toBe(0);
    expect(readWorkbenchDocRev({ rev: -3 })).toBe(0);
    expect(readWorkbenchDocRev({ rev: 0 })).toBe(0);
  });

  it('floors fractional revs and passes valid ones through', () => {
    expect(readWorkbenchDocRev({ rev: 7 })).toBe(7);
    expect(readWorkbenchDocRev({ rev: 7.9 })).toBe(7);
  });

  it('adopts equal-or-newer incoming docs and rejects older ones', () => {
    expect(shouldAdoptIncomingWorkbenchDoc({ rev: 3 }, 5)).toBe(false);
    expect(shouldAdoptIncomingWorkbenchDoc({ rev: 5 }, 5)).toBe(true);
    expect(shouldAdoptIncomingWorkbenchDoc({ rev: 6 }, 5)).toBe(true);
    // Docs without a rev count as revision 0: adopted only when we hold rev 0 too
    // (the pre-rev normalize-and-adopt behavior).
    expect(shouldAdoptIncomingWorkbenchDoc({}, 0)).toBe(true);
    expect(shouldAdoptIncomingWorkbenchDoc({}, 1)).toBe(false);
  });
});

describe('rotateAxisWorkbenchBackups (session-start rotation)', () => {
  it('is a no-op without storage or without a cached doc', () => {
    expect(rotateAxisWorkbenchBackups(null)).toBe(false);
    const storage = new MemStorage();
    expect(rotateAxisWorkbenchBackups(storage)).toBe(false);
    expect(listAxisWorkbenchBackups(storage)).toEqual([]);
  });

  it('is a no-op when the cache does not parse', () => {
    const storage = new MemStorage();
    storage.setItem(AXIS_WORKBENCH_CACHE_KEY, '{corrupt');
    expect(rotateAxisWorkbenchBackups(storage)).toBe(false);
    expect(listAxisWorkbenchBackups(storage)).toEqual([]);
  });

  it('moves the cached doc into bak1', () => {
    const storage = new MemStorage();
    storage.setItem(AXIS_WORKBENCH_CACHE_KEY, JSON.stringify(doc('first', { rev: 4, updatedAt: '2026-07-06T10:00:00.000Z' })));

    expect(rotateAxisWorkbenchBackups(storage)).toBe(true);

    const entries = listAxisWorkbenchBackups(storage);
    expect(entries).toEqual([{ slot: 1, rev: 4, updatedAt: '2026-07-06T10:00:00.000Z', layoutCount: 2 }]);
    expect((readAxisWorkbenchBackup(1, storage) as { marker: string }).marker).toBe('first');
  });

  it('does not burn a generation when the cache matches bak1 apart from the persist stamps', () => {
    const storage = new MemStorage();
    storage.setItem(AXIS_WORKBENCH_CACHE_KEY, JSON.stringify(doc('same', { rev: 4, updatedAt: '2026-07-06T10:00:00.000Z' })));
    expect(rotateAxisWorkbenchBackups(storage)).toBe(true);

    // Same content, later stamps — an unchanged session must not rotate.
    storage.setItem(AXIS_WORKBENCH_CACHE_KEY, JSON.stringify(doc('same', { rev: 9, updatedAt: '2026-07-06T12:00:00.000Z' })));
    expect(rotateAxisWorkbenchBackups(storage)).toBe(false);
    expect(listAxisWorkbenchBackups(storage)).toHaveLength(1);
  });

  it('shifts generations down and evicts bak3', () => {
    const storage = new MemStorage();
    for (const marker of ['one', 'two', 'three', 'four']) {
      storage.setItem(AXIS_WORKBENCH_CACHE_KEY, JSON.stringify(doc(marker)));
      expect(rotateAxisWorkbenchBackups(storage)).toBe(true);
    }

    const markers = [1, 2, 3].map((slot) => (readAxisWorkbenchBackup(slot, storage) as { marker: string }).marker);
    expect(markers).toEqual(['four', 'three', 'two']); // 'one' evicted
    expect(listAxisWorkbenchBackups(storage).map((entry) => entry.slot)).toEqual([1, 2, 3]);
  });
});

describe('stashAxisWorkbenchBackup', () => {
  it('rejects non-object docs and missing storage', () => {
    const storage = new MemStorage();
    expect(stashAxisWorkbenchBackup('nope', storage)).toBe(false);
    expect(stashAxisWorkbenchBackup(null, storage)).toBe(false);
    expect(stashAxisWorkbenchBackup(doc('x'), null)).toBe(false);
    expect(listAxisWorkbenchBackups(storage)).toEqual([]);
  });

  it('stashes a stale incoming doc as bak1 without touching the cache', () => {
    const storage = new MemStorage();
    storage.setItem(AXIS_WORKBENCH_CACHE_KEY, JSON.stringify(doc('current', { rev: 10 })));

    expect(stashAxisWorkbenchBackup(doc('stale-remote', { rev: 3 }), storage)).toBe(true);

    expect((readAxisWorkbenchBackup(1, storage) as { marker: string }).marker).toBe('stale-remote');
    expect(JSON.parse(storage.getItem(AXIS_WORKBENCH_CACHE_KEY)!).marker).toBe('current');
  });
});

describe('listAxisWorkbenchBackups / readAxisWorkbenchBackup', () => {
  it('skips empty and corrupt slots and defaults missing fields', () => {
    const storage = new MemStorage();
    storage.setItem(AXIS_WORKBENCH_BACKUP_KEYS[0], JSON.stringify({ schemaVersion: 1 })); // no rev/updatedAt/layouts
    storage.setItem(AXIS_WORKBENCH_BACKUP_KEYS[1], '{corrupt');
    storage.setItem(AXIS_WORKBENCH_BACKUP_KEYS[2], JSON.stringify(doc('old', { rev: 2 })));

    expect(listAxisWorkbenchBackups(storage)).toEqual([
      { slot: 1, rev: 0, updatedAt: null, layoutCount: 0 },
      { slot: 3, rev: 2, updatedAt: null, layoutCount: 2 }
    ]);
    expect(readAxisWorkbenchBackup(2, storage)).toBeNull();
  });

  it('guards slot bounds', () => {
    const storage = new MemStorage();
    storage.setItem(AXIS_WORKBENCH_BACKUP_KEYS[0], JSON.stringify(doc('x')));
    expect(readAxisWorkbenchBackup(0, storage)).toBeNull();
    expect(readAxisWorkbenchBackup(4, storage)).toBeNull();
    expect(readAxisWorkbenchBackup(1.5, storage)).toBeNull();
    expect(readAxisWorkbenchBackup(1, storage)).not.toBeNull();
  });
});
