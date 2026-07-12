/**
 * Rolling local backups for the Axis workbench document.
 *
 * Exactly one copy of the user's entire workbench customization used to exist
 * (localStorage `axs.workbench.doc`) — one bad write destroyed it. This module
 * keeps up to three backup generations next to the cache:
 *
 *   axs.workbench.doc.bak1   (newest)
 *   axs.workbench.doc.bak2
 *   axs.workbench.doc.bak3   (oldest — evicted when a new generation shifts in)
 *
 * A generation is only burned when the doc being stashed actually differs from
 * bak1 — compared with the persist stamps (`rev`, `updatedAt`) stripped, so a
 * session that never changed anything does not rotate identical copies through
 * all three slots.
 *
 * Everything takes an injectable `StorageLike` (defaulting to
 * `window.localStorage`) so the logic is fully unit-testable in the node
 * vitest environment. All functions are no-ops / empty results without storage.
 *
 * This module also owns the pure revision-comparison helpers used for
 * stale-write protection (see axisWorkbenchStore.svelte.ts).
 */

export const AXIS_WORKBENCH_CACHE_KEY = 'axs.workbench.doc';

export const AXIS_WORKBENCH_BACKUP_SLOTS = 3;

export const AXIS_WORKBENCH_BACKUP_KEYS = [
  'axs.workbench.doc.bak1',
  'axs.workbench.doc.bak2',
  'axs.workbench.doc.bak3'
] as const;

export interface AxisWorkbenchBackupEntry {
  /** 1-based generation slot (1 = newest). */
  slot: number;
  /** Persist revision carried by the backed-up doc (0 when it has none). */
  rev: number;
  /** ISO timestamp of the backed-up doc's last persist, when it carries one. */
  updatedAt: string | null;
  /** Number of layouts in the backed-up doc (a quick "how much is in here"). */
  layoutCount: number;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The persist revision of an arbitrary (untrusted) doc value. Missing, non-
 * numeric, non-finite, and non-positive revs all read as 0 — a doc without a
 * rev is never newer than anything.
 */
export function readWorkbenchDocRev(doc: unknown): number {
  if (!isRecord(doc)) return 0;
  const rev = doc.rev;
  if (typeof rev !== 'number' || !Number.isFinite(rev)) return 0;
  return rev >= 1 ? Math.floor(rev) : 0;
}

/**
 * Stale-write protection predicate: an incoming doc may replace the current
 * one only when its rev is at least the current rev (ties go to the incoming
 * doc — a remote copy at the same revision is adopted, preserving the
 * pre-existing normalize-and-adopt behavior for docs that carry no rev yet).
 */
export function shouldAdoptIncomingWorkbenchDoc(incoming: unknown, currentRev: number): boolean {
  return readWorkbenchDocRev(incoming) >= currentRev;
}

function parseDoc(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Serialized content with the persist stamps stripped — "did anything real change?". */
function contentFingerprint(doc: Record<string, unknown>): string {
  const { rev: _rev, updatedAt: _updatedAt, ...content } = doc;
  return JSON.stringify(content);
}

/** Shift generations down one slot (bak3 evicted) and write `raw` into bak1. */
function shiftIn(raw: string, storage: StorageLike): void {
  for (let slot = AXIS_WORKBENCH_BACKUP_KEYS.length - 1; slot >= 1; slot -= 1) {
    const previous = storage.getItem(AXIS_WORKBENCH_BACKUP_KEYS[slot - 1]);
    if (previous !== null) storage.setItem(AXIS_WORKBENCH_BACKUP_KEYS[slot], previous);
  }
  storage.setItem(AXIS_WORKBENCH_BACKUP_KEYS[0], raw);
}

/**
 * Push `doc` in as the newest backup generation. Skipped (returns false) when
 * the doc is not a plain object or matches bak1 with the persist stamps
 * stripped. Quota/serialization failures are swallowed (backups are best
 * effort — they must never take the app down).
 */
export function stashAxisWorkbenchBackup(doc: unknown, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage || !isRecord(doc)) return false;
  try {
    const newest = parseDoc(storage.getItem(AXIS_WORKBENCH_BACKUP_KEYS[0]));
    if (newest && contentFingerprint(newest) === contentFingerprint(doc)) return false;
    shiftIn(JSON.stringify(doc), storage);
    return true;
  } catch {
    return false;
  }
}

/**
 * Session-start rotation: move the previous session's cached doc into bak1
 * BEFORE this session writes anything — but only when the cache parses and
 * differs from bak1 (unchanged sessions don't burn a generation).
 */
export function rotateAxisWorkbenchBackups(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  const cached = parseDoc(storage.getItem(AXIS_WORKBENCH_CACHE_KEY));
  if (!cached) return false;
  return stashAxisWorkbenchBackup(cached, storage);
}

/** List the parseable backup generations, newest (slot 1) first. */
export function listAxisWorkbenchBackups(storage: StorageLike | null = defaultStorage()): AxisWorkbenchBackupEntry[] {
  if (!storage) return [];
  const entries: AxisWorkbenchBackupEntry[] = [];
  AXIS_WORKBENCH_BACKUP_KEYS.forEach((key, index) => {
    const doc = parseDoc(storage.getItem(key));
    if (!doc) return;
    entries.push({
      slot: index + 1,
      rev: readWorkbenchDocRev(doc),
      updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
      layoutCount: isRecord(doc.layouts) ? Object.keys(doc.layouts).length : 0
    });
  });
  return entries;
}

/** The raw (untrusted, un-normalized) doc in a generation slot, or null. */
export function readAxisWorkbenchBackup(slot: number, storage: StorageLike | null = defaultStorage()): unknown {
  if (!storage || !Number.isInteger(slot) || slot < 1 || slot > AXIS_WORKBENCH_BACKUP_SLOTS) return null;
  return parseDoc(storage.getItem(AXIS_WORKBENCH_BACKUP_KEYS[slot - 1]));
}
