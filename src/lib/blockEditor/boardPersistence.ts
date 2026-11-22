// Block Editor persistence: storage keys, the load fallback chain, and the per-family meta.
//
// Pure — the key/value storage is injected (in the app: surfaceStore's surfGet/surfSet, which mirror the
// config/surface document to the store, the cloud and the remote). Boards are kept per block family
// (`slug`), per layout profile and per device class:
//
//   axs.be1.<slug>.<profile>.<deviceClass>   board (v2)
//   axs.be1meta.<slug>                       active profile, profile names, per-device-class prefs,
//                                            and `migrated: true` once the family uses the new keys
//   axs.be1seed.<slug>                       the user's "save as default for this block type" board
//
// Loading walks a fallback chain and only the first usable entry wins; saving writes the current
// device-class key only, so a tablet inherits the desktop board until it is changed on the tablet.
//
// Legacy keys of the previous editor are a ONE-TIME migration source: they are read only while the
// family has no `axs.be1meta.<slug>` marked `migrated`. The first save of a board, a family seed or the
// meta marks the family migrated, so from then on a legacy board can never come back (not after a
// variant change, not for a profile saved on another device class only, not for a deleted profile
// whose name is reused). Legacy keys are never deleted or written (they are the way back on a revert).

import { BLOCK_LEVEL_KEYS, isDivider, normalizeBoard, pageItems, type BeBoard, type BeItem, type BeView } from './boardModel';
import { parseStoredBoard, parseStoredMeta, type BePrefs } from './boardSchema';

export type DeviceClass = 'desktop' | 'tablet' | 'phone';
export const DEVICE_CLASSES: readonly DeviceClass[] = ['desktop', 'tablet', 'phone'];

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, val: string): void;
}

/** Monolith shell: narrower than this is a phone. */
export const PHONE_MAX_W = 760;

/** Device class of the running editor. A workbench profile's breakpoint wins; without one (monolith
 *  shell) the viewport decides: < 760 px phone, else desktop. */
export function deviceClassFrom(input: { workbenchBreakpoint?: string | null; viewportWidth: number }): DeviceClass {
  const bp = input.workbenchBreakpoint;
  if (bp === 'desktop' || bp === 'tablet' || bp === 'phone') return bp;
  return input.viewportWidth < PHONE_MAX_W ? 'phone' : 'desktop';
}

// ── keys ──
export const boardKey = (slug: string, profile: string, cls: DeviceClass): string => `axs.be1.${slug}.${profile}.${cls}`;
export const metaKey = (slug: string): string => `axs.be1meta.${slug}`;
export const seedKey = (slug: string): string => `axs.be1seed.${slug}`;
/** Previous editor: one board per family and profile (v1). */
export const legacyBoardKey = (slug: string, profile: string): string => `axs.surface3.${slug}.${profile}`;
/** Previous editor, before profiles existed: one board per family (v1, read for `Default` only). */
export const legacySingleKey = (slug: string): string => `axs.surface2.${slug}`;
/** Previous editor's meta (active profile + names). */
export const legacyMetaKey = (slug: string): string => `axs.surface3meta.${slug}`;

export const DEFAULT_PROFILE = 'Default';
export const BLANK_PROFILE = 'Blank';

const safeGet = (st: KeyValueStore, key: string): string | null => {
  try {
    return st.get(key);
  } catch {
    return null;
  }
};

// ── meta ──

export interface BeMeta {
  active: string;
  names: string[];
  prefs: Partial<Record<DeviceClass, BePrefs>>;
  /** The family's boards live under the new keys; legacy keys are no longer read. */
  migrated: boolean;
}

export const DEFAULT_PREFS: BePrefs = { nav: 'top', density: 'm' };

const defaultMeta = (): BeMeta => ({ active: DEFAULT_PROFILE, names: [DEFAULT_PROFILE, BLANK_PROFILE], prefs: {}, migrated: false });

function tidyMeta(m: { active: string; names: string[]; prefs?: Partial<Record<DeviceClass, BePrefs | undefined>>; migrated?: boolean }): BeMeta {
  const names = [DEFAULT_PROFILE, BLANK_PROFILE];
  for (const n of m.names) if (n && !names.includes(n)) names.push(n);
  const prefs: Partial<Record<DeviceClass, BePrefs>> = {};
  for (const cls of DEVICE_CLASSES) {
    const p = m.prefs?.[cls];
    if (p) prefs[cls] = { nav: p.nav, density: p.density };
  }
  return { active: names.includes(m.active) ? m.active : DEFAULT_PROFILE, names, prefs, migrated: m.migrated === true };
}

/** Load a family's meta: the new key, else the previous editor's meta (not migrated), else defaults. */
export function loadMeta(storage: KeyValueStore, slug: string): BeMeta {
  const own = parseStoredMeta(safeGet(storage, metaKey(slug)) ?? '');
  if (own) return tidyMeta(own);
  const legacy = parseStoredMeta(safeGet(storage, legacyMetaKey(slug)) ?? '');
  if (legacy) return tidyMeta({ ...legacy, migrated: false });
  return defaultMeta();
}

/** Save a family's meta. Writing the meta always marks the family migrated. */
export function saveMeta(storage: KeyValueStore, slug: string, meta: BeMeta): void {
  storage.set(metaKey(slug), JSON.stringify({ ...meta, migrated: true }));
}

/** True once the family's boards live under the new keys (legacy keys are then ignored). */
export function isFamilyMigrated(storage: KeyValueStore, slug: string): boolean {
  return parseStoredMeta(safeGet(storage, metaKey(slug)) ?? '')?.migrated === true;
}

/** Mark the family migrated (writes the meta once, carrying over the previous editor's profiles). */
export function markFamilyMigrated(storage: KeyValueStore, slug: string): void {
  if (!isFamilyMigrated(storage, slug)) saveMeta(storage, slug, loadMeta(storage, slug));
}

/** Navigation and control size for a device class: own prefs → desktop prefs → defaults. */
export function prefsFor(meta: BeMeta, cls: DeviceClass): BePrefs {
  return meta.prefs[cls] ?? meta.prefs.desktop ?? DEFAULT_PREFS;
}

/** Meta with the prefs of one device class replaced. */
export function withPrefs(meta: BeMeta, cls: DeviceClass, prefs: BePrefs): BeMeta {
  return { ...meta, prefs: { ...meta.prefs, [cls]: { nav: prefs.nav, density: prefs.density } } };
}

// ── boards ──

export type BoardSource = 'own' | 'desktop' | 'legacy' | 'legacy-single' | 'user-seed' | 'seed';

export interface LoadBoardInput {
  storage: KeyValueStore;
  /** Where the pre-profile legacy key lives when it is not in `storage` (it used to be plain
   *  localStorage). Defaults to `storage`. */
  legacyStorage?: KeyValueStore;
  slug: string;
  profile: string;
  deviceClass: DeviceClass;
  catalogKeys: Iterable<string>;
  /** Built-in seed for this profile (device layout / curated board, or an empty board for Blank). */
  seed: BeBoard;
  /** Current device-layout variant; defaults to `seed.variantSig`. */
  variantSig?: string;
  viewsByKey?: ReadonlyMap<string, readonly BeView[]>;
}

/** Load a board. Chain: own device-class key → desktop key → (only while the family is not migrated:)
 *  previous editor's key, then for `Default` the pre-profile key, both migrated → the user's family
 *  seed (not for `Blank`) → `seed`.
 *  For `Default`, a stored board seeded from a different, non-empty device-layout variant is skipped,
 *  so a block type change re-seeds it; a `Default` board taken from a seed adopts the current variant
 *  so it survives its first save. Every result is schema-checked and normalized; block-level controls
 *  (`meter`, `wave`, `eq`, `bypass`) are kept even while the catalog does not list them yet, because
 *  their data can arrive after the parameters — the renderer draws only keys present in the catalog. */
export function loadBoard(input: LoadBoardInput): { board: BeBoard; source: BoardSource } {
  const { storage, slug, profile, deviceClass } = input;
  const keys = input.catalogKeys instanceof Set ? input.catalogKeys : new Set(input.catalogKeys);
  const sig = input.variantSig ?? input.seed.variantSig ?? '';
  const norm = (b: BeBoard) => normalizeBoard(b, keys, { viewsByKey: input.viewsByKey, keepKeys: BLOCK_LEVEL_KEYS });
  const read = (st: KeyValueStore, key: string): BeBoard | null => {
    const raw = safeGet(st, key);
    return raw ? parseStoredBoard(raw) : null;
  };
  const isDefault = profile === DEFAULT_PROFILE;
  const stale = (b: BeBoard) => isDefault && !!sig && b.variantSig !== sig;
  const stamp = (b: BeBoard): BeBoard => (isDefault && sig ? { ...b, variantSig: sig } : b);

  const chain: [BoardSource, KeyValueStore, string, boolean][] = [];
  if (deviceClass !== 'desktop') chain.push(['own', storage, boardKey(slug, profile, deviceClass), true]);
  chain.push(['desktop', storage, boardKey(slug, profile, 'desktop'), true]);
  if (!isFamilyMigrated(storage, slug)) {
    chain.push(['legacy', storage, legacyBoardKey(slug, profile), true]);
    // The pre-profile board never carried a variant fingerprint, so it only applies while there is no
    // device layout (the previous editor dropped it after one save in that case anyway).
    if (isDefault) chain.push(['legacy-single', input.legacyStorage ?? storage, legacySingleKey(slug), true]);
  }
  if (profile !== BLANK_PROFILE) chain.push(['user-seed', storage, seedKey(slug), false]);

  for (const [source, st, key, checkSig] of chain) {
    const b = read(st, key);
    if (!b || (checkSig && stale(b))) continue;
    return { board: norm(checkSig ? b : stamp(b)), source };
  }
  return { board: norm(stamp(input.seed)), source: 'seed' };
}

/** Save a board under the current device class only, and mark the family migrated (first save). */
export function saveBoard(input: { storage: KeyValueStore; slug: string; profile: string; deviceClass: DeviceClass; board: BeBoard }): void {
  input.storage.set(boardKey(input.slug, input.profile, input.deviceClass), JSON.stringify(input.board));
  markFamilyMigrated(input.storage, input.slug);
}

/** Store the user's "default for this block type" board (used before the device layout). */
export function saveUserSeed(storage: KeyValueStore, slug: string, board: BeBoard): void {
  const { variantSig: _sig, ...rest } = board;
  storage.set(seedKey(slug), JSON.stringify(rest));
  markFamilyMigrated(storage, slug);
}

/** Structural fingerprint of a board: page order plus each page's items, ignoring ids, item order,
 *  the current page, the variant fingerprint and source rows. */
function boardShape(b: BeBoard): string {
  const pages = b.pageOrder.map((pg) => {
    const items = pageItems(b, pg).map((it: BeItem) =>
      isDivider(it) ? `d:${it.kind}:${it.x},${it.y},${it.w},${it.h}:${it.label ?? ''}` : `c:${it.key}:${it.view}:${it.x},${it.y},${it.w},${it.h}`
    );
    return [pg, items.sort()];
  });
  return JSON.stringify(pages);
}

/** True when a board differs from its seed (layout status "Custom" rather than "Default"). */
export function boardDiffersFromSeed(board: BeBoard, seed: BeBoard): boolean {
  return boardShape(board) !== boardShape(seed);
}
