// Last-loaded timestamps per preset, so the Preset Browser can sort by recency ("the one I was just
// working on"), which a 512-slot list otherwise makes you scroll or re-query for.
//
// Local-only (no ForgeFX config mirror): recency is machine-specific, and a synced last-write-wins doc
// would clobber another machine's history. Follows the light MRU idiom of
// presetBrowserWorkbenchFrequentTags / PresetPicker `recents`, not library's heavier persistCfg dual-write.
//
// Keyed by `LibEntry.id` (`dev:<n>` / `file:<name>` / `local:<relPath>` / `conv:<docId>` / `cloud:<n>`)
// so a device slot and an imported file of the same preset stay distinct.

const KEY = 'axs.presets.lastLoaded';
/** PresetPicker's own slot MRU — the pre-existing recency data we seed from once. */
const PICKER_KEY = 'axs.presets';
/** 512 device slots plus imports/conversions would grow unbounded otherwise. */
const MAX_ENTRIES = 500;
/** Fixed point in the past (2024-01-01) for seeded stamps: order is all the picker's MRU knows, and every
 *  real load must sort above a seeded one. A relative base would drift between runs and break tests. */
const SEED_BASE = 1_704_067_200_000;
const SEED_STEP = 60_000;

export type PresetRecencyMap = Record<string, number>;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // unavailable (private mode / SSR) or corrupt — recency is best-effort
  }
}

/** Per-entry validation: a stale or hand-edited shape degrades to an empty map, never throws. */
function coerce(parsed: unknown): PresetRecencyMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: PresetRecencyMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (k && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** One-time carry-over from PresetPicker's `{ rec: [{ n, name }] }` MRU (newest-first, capped at 12), so
 *  upgrading users don't start with an empty Recent sort. Slot-only by nature — the picker never knew
 *  about file/local/cloud entries. */
export function seedFromPickerRecents(parsed: unknown): PresetRecencyMap {
  const rec = (parsed as { rec?: unknown } | null)?.rec;
  if (!Array.isArray(rec)) return {};
  const out: PresetRecencyMap = {};
  rec.forEach((entry, i) => {
    const n = (entry as { n?: unknown } | null)?.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return;
    const id = `dev:${n}`;
    if (out[id] === undefined) out[id] = SEED_BASE - i * SEED_STEP;
  });
  return out;
}

/** Keep the newest MAX_ENTRIES stamps. Ties broken by id so the result is deterministic. */
export function pruneRecency(map: PresetRecencyMap): PresetRecencyMap {
  const ids = Object.keys(map);
  if (ids.length <= MAX_ENTRIES) return map;
  const kept = ids.sort((a, b) => map[b]! - map[a]! || a.localeCompare(b)).slice(0, MAX_ENTRIES);
  return Object.fromEntries(kept.map((id) => [id, map[id]!]));
}

class PresetRecencyStore {
  /** entry id → epoch ms of the last app-initiated load. */
  map = $state<PresetRecencyMap>(load());

  /** Stamp a load. Idempotent within a tick, so double-recording the same id is harmless. */
  record = (entryId: string): void => {
    if (!entryId) return;
    this.map = pruneRecency({ ...this.map, [entryId]: Date.now() });
    persist(this.map);
  };

  /** Arrow field: passed straight to the browser data view as a callback. */
  at = (entryId: string): number | null => this.map[entryId] ?? null;
}

function load(): PresetRecencyMap {
  const stored = read(KEY);
  if (stored !== null) return coerce(stored);
  // Absent (not merely empty) → first run on this machine: carry the picker's recents over once.
  const seeded = seedFromPickerRecents(read(PICKER_KEY));
  if (Object.keys(seeded).length) persist(seeded);
  return seeded;
}

function persist(map: PresetRecencyMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / unavailable — recency is best-effort */
  }
}

export const presetRecency = new PresetRecencyStore();
