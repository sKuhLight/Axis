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
// family has no `axs.be1meta.<slug>` marked `migrated`. Before the first write the editor carries every
// profile's legacy board over to its desktop key (`carryLegacyBoards`); the first save of a board, a
// family seed or the meta then marks the family migrated, so from then on a legacy board can never come
// back (not after a variant change, not for a profile saved on another device class only, not for a
// deleted profile whose name is reused). Legacy keys are never deleted or written (they are the way
// back on a revert).

import { isGraphKey } from '../blockVisuals';
import { sameLayoutVariant } from '../deviceLayoutBoard';
import { FIXED_PAGE, isBlockLevelKey, isDivider, normalizeBoard, pageItems, regions, type BeBoard, type BeItem, type BeView } from './boardModel';
import { parseStoredBoard, parseStoredMeta, type BePrefs } from './boardSchema';

export type DeviceClass = 'desktop' | 'tablet' | 'phone';
export const DEVICE_CLASSES: readonly DeviceClass[] = ['desktop', 'tablet', 'phone'];

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, val: string): void;
}

/** Monolith shell: narrower than this is a phone. */
export const PHONE_MAX_W = 760;

/** Device class of the running editor. Inside the workbench the active profile's breakpoint decides, and
 *  a profile without one counts as desktop (as in the workbench itself); in the monolith shell the
 *  viewport decides: < 760 px phone, else desktop. Every phone / desktop decision of the editor (board
 *  key, chrome, arrange) reads this one value. */
export function deviceClassFrom(input: { inWorkbench?: boolean; workbenchBreakpoint?: string | null; viewportWidth: number }): DeviceClass {
  const bp = input.workbenchBreakpoint;
  if (bp === 'desktop' || bp === 'tablet' || bp === 'phone') return bp;
  if (input.inWorkbench) return 'desktop';
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
  /** Arrange: tidy after every move / resize ("Auto-pack"); absent = off. */
  autoPack?: boolean;
}

export const DEFAULT_PREFS: BePrefs = { nav: 'top', density: 'm' };

const defaultMeta = (): BeMeta => ({ active: DEFAULT_PROFILE, names: [DEFAULT_PROFILE, BLANK_PROFILE], prefs: {}, migrated: false });

function tidyMeta(m: { active: string; names: string[]; prefs?: Partial<Record<DeviceClass, BePrefs | undefined>>; migrated?: boolean; autoPack?: boolean }): BeMeta {
  const names = [DEFAULT_PROFILE, BLANK_PROFILE];
  for (const n of m.names) if (n && !names.includes(n)) names.push(n);
  const prefs: Partial<Record<DeviceClass, BePrefs>> = {};
  for (const cls of DEVICE_CLASSES) {
    const p = m.prefs?.[cls];
    if (p) prefs[cls] = { nav: p.nav, density: p.density };
  }
  const out: BeMeta = { active: names.includes(m.active) ? m.active : DEFAULT_PROFILE, names, prefs, migrated: m.migrated === true };
  if (m.autoPack === true) out.autoPack = true;
  return out;
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
  /** `Default` only: the built-in seed as earlier versions built it (the device layout by rows only, before
   *  positions, dividers and graph displays were used; the one with every control on its pages, before the
   *  fixed area; the curated one with the header's controls), one board or several, or a function
   *  building them — called only when a stored Default board has to be compared with them. A stored board
   *  that is still exactly one of them was never changed by the user, so it follows the current built-in
   *  seed instead (nothing is written) — unless that previous seed is also the current seed, or another
   *  previous one, minus its graph displays (then the stored board may be the user's "graph removed",
   *  which is kept). */
  previousSeed?: PreviousSeeds | (() => PreviousSeeds);
}

/** One previous built-in seed, or several (null entries are skipped). */
export type PreviousSeeds = BeBoard | null | readonly (BeBoard | null)[];

/** Load a board. Chain: own device-class key → desktop key → (only while the family is not migrated:)
 *  previous editor's key, then for `Default` the pre-profile key, both migrated → the user's family
 *  seed (not for `Blank`) → `seed`.
 *  For `Default`, a stored board seeded from a different, non-empty device-layout variant is skipped,
 *  so a block type change re-seeds it; a `Default` board taken from a seed adopts the current variant
 *  so it survives its first save. A stored `Default` board that is still exactly a `previousSeed` (the
 *  default as earlier versions laid it out) was never changed by the user: it loads as the current
 *  built-in seed instead (source `seed`, nothing written), so the device positions and the fixed area show
 *  and the layout is not reported as changed — but only while the family has no saved "default for this
 *  type" (that one is the reference then) and only when every control of the stored board is in the
 *  catalog right now (a board that also holds a not-yet-listed meter / EQ graph / waveform is not known
 *  to be untouched). Any other stored board keeps its content: no fixed area is put into it. Copies are
 *  never upgraded.
 *  Every result is schema-checked and normalized; block-level controls
 *  (`meter`, `wave`, `eq`, `bypass`) are kept even while the catalog does not list them yet, because
 *  their data can arrive after the parameters — the renderer draws only keys present in the catalog. */
export function loadBoard(input: LoadBoardInput): { board: BeBoard; source: BoardSource } {
  const { storage, slug, profile, deviceClass } = input;
  const keys = input.catalogKeys instanceof Set ? input.catalogKeys : new Set(input.catalogKeys);
  const sig = input.variantSig ?? input.seed.variantSig ?? '';
  const norm = (b: BeBoard) => normalizeBoard(b, keys, { viewsByKey: input.viewsByKey, keepKeys: isBlockLevelKey });
  const read = (st: KeyValueStore, key: string): BeBoard | null => {
    const raw = safeGet(st, key);
    return raw ? parseStoredBoard(raw) : null;
  };
  const isDefault = profile === DEFAULT_PROFILE;
  const stale = (b: BeBoard) => isDefault && !!sig && !sameLayoutVariant(b.variantSig, sig);
  // a stored Default board that is still exactly the previous built-in seed follows the current one
  // (worked out only when a stored Default board is found)
  const stamp = (b: BeBoard): BeBoard => (isDefault && sig ? { ...b, variantSig: sig } : b);
  let upgrade: { prevShapes: ReadonlySet<string>; current: BeBoard } | null | undefined;
  const upgradeInfo = () => {
    if (upgrade !== undefined) return upgrade;
    upgrade = null;
    const prevRaw = typeof input.previousSeed === 'function' ? input.previousSeed() : input.previousSeed;
    const prevs = (Array.isArray(prevRaw) ? prevRaw : [prevRaw]).filter((b): b is BeBoard => !!b);
    if (!isDefault || !prevs.length || hasUserSeed(storage, slug)) return upgrade;
    const current = norm(stamp(input.seed));
    const currentShape = boardShape(current, keys);
    const previous = prevs.map((b) => norm(stamp(b)));
    // A previous seed that is exactly the current one — or another previous one — without its graph displays
    // is ambiguous: a stored board of that shape may just as well be that seed with its graphs removed by
    // the user. The user's removal wins (no upgrade; "Reset to device layout" brings the graphs back).
    const noGraphs = new Set([...keys].filter((k) => !isGraphKey(k)));
    const graphsRemoved = new Set([current, ...previous].filter(hasGraph).map((b) => boardShape(b, noGraphs)));
    const prevShapes = new Set(previous.map((b) => boardShape(b, keys)).filter((s) => s !== currentShape && !graphsRemoved.has(s)));
    if (prevShapes.size) upgrade = { prevShapes, current };
    return upgrade;
  };
  const untouched = (b: BeBoard): boolean => {
    if (!isDefault || !input.previousSeed) return false;
    // every stored control must be one the catalog lists now (kept, not drawn controls make it unknown)
    if (!regions(b).every((pg) => pageItems(b, pg).every((it) => isDivider(it) || keys.has(it.key)))) return false;
    const u = upgradeInfo();
    return !!u && u.prevShapes.has(boardShape(b, keys));
  };

  const chain: [BoardSource, KeyValueStore, string][] = [];
  if (deviceClass !== 'desktop') chain.push(['own', storage, boardKey(slug, profile, deviceClass)]);
  chain.push(['desktop', storage, boardKey(slug, profile, 'desktop')]);
  if (!isFamilyMigrated(storage, slug)) {
    chain.push(['legacy', storage, legacyBoardKey(slug, profile)]);
    // The pre-profile board never carried a variant fingerprint, so it only applies while there is no
    // device layout (the previous editor dropped it after one save in that case anyway).
    if (isDefault) chain.push(['legacy-single', input.legacyStorage ?? storage, legacySingleKey(slug)]);
  }
  // then the seed: the user's family seed, else the built-in one (loadSeed)

  for (const [source, st, key] of chain) {
    const b = read(st, key);
    if (!b || stale(b)) continue;
    const board = norm(b);
    if (untouched(board)) {
      const current = upgrade!.current;
      return { board: current.pageOrder.includes(board.page) ? { ...current, page: board.page } : current, source: 'seed' };
    }
    return { board: stamp(board), source };
  }
  return loadSeed({ ...input, catalogKeys: keys });
}

/** A layout profile's seed — what it shows before (or after a reset of) any change: the user's family
 *  seed ("Save as default for …", not for `Blank`), else the built-in `seed`. Normalized like loadBoard;
 *  a `Default` seed adopts the current variant. */
export function loadSeed(input: Omit<LoadBoardInput, 'deviceClass' | 'legacyStorage'>): { board: BeBoard; source: 'user-seed' | 'seed' } {
  const keys = input.catalogKeys instanceof Set ? input.catalogKeys : new Set(input.catalogKeys);
  const sig = input.variantSig ?? input.seed.variantSig ?? '';
  const stamp = (b: BeBoard): BeBoard => (input.profile === DEFAULT_PROFILE && sig ? { ...b, variantSig: sig } : b);
  const norm = (b: BeBoard) => normalizeBoard(stamp(b), keys, { viewsByKey: input.viewsByKey, keepKeys: isBlockLevelKey });
  if (input.profile !== BLANK_PROFILE) {
    const raw = safeGet(input.storage, seedKey(input.slug));
    const user = raw ? parseStoredBoard(raw) : null;
    if (user) return { board: norm(user), source: 'user-seed' };
  }
  return { board: norm(input.seed), source: 'seed' };
}

export interface CarryLegacyInput extends Omit<LoadBoardInput, 'profile' | 'deviceClass' | 'seed'> {
  /** Every profile of the family (the meta's names). */
  names: readonly string[];
  /** Built-in seed per profile (as for loadBoard). */
  seedFor: (profile: string) => BeBoard;
}

/** One-time hand-over of a family that still reads the previous editor's keys, run before its first
 *  write (any write marks the family migrated, after which legacy keys are never read again): every
 *  profile whose board would load from a legacy key — `axs.surface3.<slug>.<profile>`, or for `Default`
 *  the pre-profile `axs.surface2.<slug>` — is written to its desktop key, so no profile loses its board.
 *  Legacy keys are left as they are. Returns the profiles carried over; a no-op once migrated. */
export function carryLegacyBoards(input: CarryLegacyInput): string[] {
  const { storage, slug } = input;
  if (isFamilyMigrated(storage, slug)) return [];
  const carried: string[] = [];
  for (const profile of input.names) {
    const r = loadBoard({ ...input, profile, deviceClass: 'desktop', seed: input.seedFor(profile) });
    if (r.source !== 'legacy' && r.source !== 'legacy-single') continue;
    storage.set(boardKey(slug, profile, 'desktop'), JSON.stringify(r.board));
    carried.push(profile);
  }
  return carried;
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

/** True when the family has a readable "default for this block type" board. */
export function hasUserSeed(storage: KeyValueStore, slug: string): boolean {
  const raw = safeGet(storage, seedKey(slug));
  return !!raw && parseStoredBoard(raw) != null;
}

/** Forget the family's "default for this block type" board (the device layout seeds again). */
export function clearUserSeed(storage: KeyValueStore & { remove?(key: string): void }, slug: string): void {
  if (storage.remove) storage.remove(seedKey(slug));
  else storage.set(seedKey(slug), '');
}

/** The board holds a graph display. */
const hasGraph = (b: BeBoard): boolean => regions(b).some((pg) => pageItems(b, pg).some((it) => !isDivider(it) && isGraphKey(it.key)));

/** Structural fingerprint of a board: page order plus each page's items, and the fixed area's width and
 *  items, ignoring ids, item order, the current page, the variant fingerprint and source rows. With `keys`,
 *  controls whose key is not in it are left out (kept, not drawn block-level controls). */
function pageShape(b: BeBoard, pg: string, keys?: ReadonlySet<string>): string[] {
  return pageItems(b, pg)
    .filter((it: BeItem) => isDivider(it) || !keys || keys.has(it.key))
    .map((it: BeItem) =>
      isDivider(it) ? `d:${it.kind}:${it.x},${it.y},${it.w},${it.h}:${it.label ?? ''}` : `c:${it.key}:${it.view}:${it.x},${it.y},${it.w},${it.h}`
    )
    .sort();
}
function boardShape(b: BeBoard, keys?: ReadonlySet<string>): string {
  return JSON.stringify([b.pageOrder.map((pg) => [pg, pageShape(b, pg, keys)]), fixedShape(b, keys)]);
}
function fixedShape(b: BeBoard, keys?: ReadonlySet<string>): unknown {
  return b.fixed ? [b.fixed.cols, pageShape(b, FIXED_PAGE, keys)] : null;
}

/** True when one page (`FIXED_PAGE`: the fixed area) differs from the seed's page of the same name (a page the
 *  seed does not have counts as empty there), with the same catalog-key filter as boardDiffersFromSeed. */
export function pageDiffersFromSeed(board: BeBoard, seed: BeBoard, page: string, keys?: ReadonlySet<string>): boolean {
  if (page === FIXED_PAGE) return fixedDiffersFromSeed(board, seed, keys);
  return JSON.stringify(pageShape(board, page, keys)) !== JSON.stringify(seed.pageOrder.includes(page) ? pageShape(seed, page, keys) : []);
}

/** True when the fixed area differs from the seed's (one of them has none, another width, other items). */
export function fixedDiffersFromSeed(board: BeBoard, seed: BeBoard, keys?: ReadonlySet<string>): boolean {
  return JSON.stringify(fixedShape(board, keys)) !== JSON.stringify(fixedShape(seed, keys));
}

/** True when a board differs from its seed (layout status "Custom" rather than "Default"). Pass the
 *  catalog's keys to ignore controls the catalog does not list right now (they are kept in storage but
 *  not drawn, and may still be missing from a freshly built seed). */
export function boardDiffersFromSeed(board: BeBoard, seed: BeBoard, keys?: ReadonlySet<string>): boolean {
  return boardShape(board, keys) !== boardShape(seed, keys);
}
