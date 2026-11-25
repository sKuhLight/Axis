// Per-editor Block Editor state (runes): the board being shown, the family's meta (layout profiles,
// per-device-class navigation / control size, auto-pack), and the Arrange state (the frozen cell and the
// undo stack).
//
// Persistence goes through boardPersistence with an injected key/value store (in the app: the
// config/surface document via surfaceStore). Rules:
//   - loading never writes; only user actions (commit, profile / prefs changes) do;
//   - the first write of a family that still reads the previous editor's keys carries every profile's
//     legacy board over to its desktop key first (that write marks the family migrated, after which
//     legacy keys are never read again);
//   - nothing loads while the catalog is still trivially empty (only the always-present bypass entry);
//   - a reload happens when the family, the catalog's key set, the device-layout variant, the device
//     class or the remote revision changes. A reload of the same family keeps the page the user is on;
//   - every load also resolves the active profile's seed (the family's "default for this type" board,
//     else the device layout / curated fallback; Blank: an empty board) — the layout status compares
//     against it, and "Reset this page" / "Reset fixed area" / the whole-layout reset ("Reset to device
//     layout", or "Reset all pages" with a saved default) go back to it;
//   - a stored Default board that is still exactly the default as earlier versions built it (`previousSeed`:
//     rows only, without a fixed area, …; built only when such a board is found) loads as the current
//     default, without a write — not while a "default for this type" is saved, not when the stored
//     board holds a control the catalog does not list yet, never for copies;
//   - while arranging, every committed change is one undo step (the board it replaced, capped); Undo saves
//     once. The stack is cleared when Arrange starts or ends, on a profile switch and on every (re)load.
// Covered by beState.runes.test.ts.

import { popUndo, pushUndo, restoreBoard } from './arrangeHistory';
import { isBlockLevelKey, lostKeys, normalizeBoard, planPageReset, resetFixedFrom, type BeBoard, type PageResetPlan } from './boardModel';
import {
  BLANK_PROFILE,
  boardKey,
  carryLegacyBoards,
  clearUserSeed,
  DEFAULT_PROFILE,
  DEVICE_CLASSES,
  fixedDiffersFromSeed,
  hasUserSeed,
  isFamilyMigrated,
  loadBoard,
  loadMeta,
  loadSeed,
  pageDiffersFromSeed,
  prefsFor,
  saveBoard,
  saveMeta,
  saveUserSeed,
  withPrefs,
  type BeMeta,
  type BoardSource,
  type DeviceClass,
  type KeyValueStore,
  type PreviousSeeds
} from './boardPersistence';
import type { BePrefs } from './boardSchema';
import { viewsByKey, type BeCtl } from './catalog';

/** Storage for the editor: the surface document's get/set, plus remove for deleted profiles. */
export interface BeStorage extends KeyValueStore {
  remove?(key: string): void;
}

/** What the editor shows a board for. */
export interface BeSource {
  slug: string;
  deviceClass: DeviceClass;
  catalog: readonly BeCtl[];
  /** Device-layout variant fingerprint ('' without a device layout). */
  variantSig: string;
  /** Effect id of the open block: the device seed's cross-block guard depends on it, so another instance
   *  of the same block (Output 1 → Output 2: same family, catalog and variant) re-seeds. */
  owner?: number | null;
  /** What the header shows itself (the block-state params the server tags): the seed leaves them out, so a
   *  change re-seeds. */
  header?: string;
  /** The device-authentic default board (device layout, else the curated fallback). */
  deviceSeed: () => BeBoard;
  /** The default as earlier versions built it (rows only; every control on its pages, before the fixed area;
   *  the curated one with the header's controls), one board or several, or null when there is none. A stored
   *  Default board still equal to one of them follows `deviceSeed`. */
  previousSeed?: () => PreviousSeeds;
  /** Remote revision of the surface document (bumped by a host↔remote push). */
  rev: number;
}

export const emptyBoard = (): BeBoard => ({ v: 2, pageOrder: ['Page 1'], page: 'Page 1', boards: { 'Page 1': [] } });

const defaultMeta = (): BeMeta => ({ active: DEFAULT_PROFILE, names: [DEFAULT_PROFILE, BLANK_PROFILE], prefs: {}, migrated: false });

/** The catalog is "trivially empty" while only the always-present bypass entry exists. */
export const catalogReady = (catalog: readonly BeCtl[]): boolean => catalog.length > 1;

export class BeState {
  /** The active profile's board, or null before the first load. Replaced, never mutated (raw state). */
  board = $state.raw<BeBoard | null>(null);
  /** Replaced, never mutated (raw state). */
  meta = $state.raw<BeMeta>(defaultMeta());
  /** Where the current board came from (own key, desktop fallback, seed, …). */
  source = $state<BoardSource | null>(null);
  /** The active profile's seed (normalized), or null before the first load. Replaced, never mutated. */
  seed = $state.raw<BeBoard | null>(null);
  /** The family has a "default for this type" board. */
  userSeed = $state(false);
  /** Bumped when a load should bring the stored current page into view (new family / profile). */
  loads = $state(0);
  /** Arrange mode and the cell size frozen while arranging. */
  editMode = $state(false);
  frozenCell = $state<number | null>(null);
  /** Arrange undo: the boards replaced by the changes made while arranging (newest last). Replaced, never
   *  mutated (raw state). */
  undoStack = $state.raw<BeBoard[]>([]);

  #storage: BeStorage;
  #legacy?: KeyValueStore;
  #src: BeSource | null = null;
  #sig = '';

  constructor(storage: BeStorage, legacyStorage?: KeyValueStore) {
    this.#storage = storage;
    this.#legacy = legacyStorage;
  }

  get slug(): string {
    return this.#src?.slug ?? '';
  }
  get deviceClass(): DeviceClass {
    return this.#src?.deviceClass ?? 'desktop';
  }
  get profile(): string {
    return this.meta.active;
  }
  get profileNames(): string[] {
    return this.meta.names;
  }
  get prefs(): BePrefs {
    return prefsFor(this.meta, this.deviceClass);
  }
  get autoPack(): boolean {
    return this.meta.autoPack === true;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Bring the state in line with its source. Loads (never saves) when the inputs changed; returns true
   *  when it (re)loaded. */
  sync(src: BeSource): boolean {
    if (!src.slug || !catalogReady(src.catalog)) return false;
    const sig = [src.slug, src.catalog.map((c) => c.key).join(','), src.variantSig, src.deviceClass, src.rev, src.owner ?? '', src.header ?? ''].join('|');
    const prev = this.#src;
    this.#src = src;
    if (sig === this.#sig) return false;
    this.#sig = sig;
    const sameFamily = !!prev && prev.slug === src.slug;
    if (!sameFamily || prev.rev !== src.rev) this.meta = loadMeta(this.#storage, src.slug);
    const keep = sameFamily ? this.board?.page : undefined;
    let { board, source } = this.#load(this.meta.active);
    if (keep && board.pageOrder.includes(keep)) board = board.page === keep ? board : { ...board, page: keep };
    else this.loads++;
    this.board = board;
    this.source = source;
    this.#refreshSeed();
    this.clearUndo(); // the stored boards belong to what was shown before the load
    if (!sameFamily) this.setEditMode(false);
    return true;
  }

  /** Resolve the active profile's seed (after a load, a profile switch or a change of the family seed). */
  #refreshSeed(): void {
    const src = this.#src;
    if (!src) return;
    this.userSeed = hasUserSeed(this.#storage, src.slug);
    this.seed = loadSeed({
      storage: this.#storage,
      slug: src.slug,
      profile: this.meta.active,
      catalogKeys: src.catalog.map((c) => c.key),
      seed: this.#seedFor(this.meta.active),
      variantSig: src.variantSig,
      viewsByKey: viewsByKey(src.catalog)
    }).board;
  }

  #seedFor(profile: string): BeBoard {
    return profile === BLANK_PROFILE ? emptyBoard() : (this.#src?.deviceSeed() ?? emptyBoard());
  }

  #load(profile: string): { board: BeBoard; source: BoardSource } {
    const src = this.#src!;
    return loadBoard({
      storage: this.#storage,
      legacyStorage: this.#legacy,
      slug: src.slug,
      profile,
      deviceClass: src.deviceClass,
      catalogKeys: src.catalog.map((c) => c.key),
      seed: this.#seedFor(profile),
      variantSig: src.variantSig,
      viewsByKey: viewsByKey(src.catalog),
      // built only when a stored Default board has to be compared with it
      previousSeed: profile === DEFAULT_PROFILE ? src.previousSeed : null
    });
  }

  /** Before any write: hand a not-yet-migrated family's legacy boards over to the new keys. */
  #carryLegacy(): void {
    const src = this.#src;
    if (!src || isFamilyMigrated(this.#storage, src.slug)) return; // the usual case: nothing to carry, nothing built
    carryLegacyBoards({
      storage: this.#storage,
      legacyStorage: this.#legacy,
      slug: src.slug,
      names: this.meta.names,
      catalogKeys: src.catalog.map((c) => c.key),
      seedFor: (profile) => this.#seedFor(profile),
      variantSig: src.variantSig,
      viewsByKey: viewsByKey(src.catalog),
      previousSeed: src.previousSeed
    });
  }

  #save(board: BeBoard): void {
    const src = this.#src;
    if (!src) return;
    this.#carryLegacy();
    saveBoard({ storage: this.#storage, slug: src.slug, profile: this.meta.active, deviceClass: src.deviceClass, board });
    // the board now lives under the own device-class key
    this.source = src.deviceClass === 'desktop' ? 'desktop' : 'own';
  }

  #saveMeta(meta: BeMeta): void {
    this.#carryLegacy();
    this.meta = meta;
    if (this.#src) saveMeta(this.#storage, this.#src.slug, meta);
  }

  // ── board ──

  /** A user change: show it and save it (while arranging also one undo step). The same reference is a
   *  no-op. */
  commit(next: BeBoard): void {
    if (!this.#src || next === this.board) return;
    if (this.editMode && this.board) this.undoStack = pushUndo(this.undoStack, this.board);
    this.board = next;
    this.#save(next);
  }

  /** Show a board without saving (live preview during a gesture; `flush` saves at the end). */
  preview(next: BeBoard): void {
    if (this.#src) this.board = next;
  }

  /** Save what is shown (end of a previewed gesture). `before` = the board the gesture started from: while
   *  arranging it becomes one undo step. */
  flush(before?: BeBoard): void {
    if (!this.board) return;
    if (before && this.editMode && before !== this.board) this.undoStack = pushUndo(this.undoStack, before);
    this.#save(this.board);
  }

  /** Arrange undo: put back the board the last change replaced (on the page the user is on now when it
   *  still exists) and save it once. False when there is nothing to undo. */
  undo(): boolean {
    const { stack, entry } = popUndo(this.undoStack);
    if (!entry || !this.#src) return false;
    this.undoStack = stack;
    const next = restoreBoard(entry, this.board?.page ?? entry.page);
    this.board = next;
    this.#save(next);
    return true;
  }

  clearUndo(): void {
    if (this.undoStack.length) this.undoStack = [];
  }

  /** Switch the current page (navigation only, not saved). */
  setPage(page: string): void {
    const b = this.board;
    if (!b || b.page === page || !b.pageOrder.includes(page)) return;
    this.board = { ...b, page };
  }

  // ── prefs ──

  setPrefs(next: Partial<BePrefs>): void {
    if (!this.#src) return;
    const cur = this.prefs;
    const prefs: BePrefs = { nav: next.nav ?? cur.nav, density: next.density ?? cur.density };
    if (prefs.nav === cur.nav && prefs.density === cur.density) return;
    this.#saveMeta(withPrefs(this.meta, this.deviceClass, prefs));
  }

  setAutoPack(on: boolean): void {
    if (!this.#src || this.autoPack === on) return;
    const { autoPack: _old, ...rest } = this.meta;
    this.#saveMeta(on ? { ...rest, autoPack: true } : rest);
  }

  // ── arrange ──

  /** Start / end arranging (a fresh undo stack either way). */
  setEditMode(on: boolean, cell: number | null = null): void {
    this.editMode = on;
    this.frozenCell = on ? cell : null;
    this.clearUndo();
  }

  /** Forget the frozen cell (navigation or control size changed while arranging). */
  refreeze(cell: number | null): void {
    if (this.editMode) this.frozenCell = cell;
  }

  // ── layout profiles ──

  /** Switch to another profile (adding the name when it is new). */
  setProfile(name: string): void {
    if (!this.#src || name === this.meta.active) return;
    const names = this.meta.names.includes(name) ? this.meta.names : [...this.meta.names, name];
    this.#saveMeta({ ...this.meta, active: name, names });
    const { board, source } = this.#load(name);
    this.board = board;
    this.source = source;
    this.#refreshSeed();
    this.clearUndo();
    this.loads++;
  }

  /** New profile as a copy of the current board (`Layout N`); it becomes the active one. */
  addProfile(): string | null {
    if (!this.#src || !this.board) return null;
    let i = 1;
    let name = `Layout ${i}`;
    while (this.meta.names.includes(name)) name = `Layout ${++i}`;
    const copy = JSON.parse(JSON.stringify(this.board)) as BeBoard;
    this.#saveMeta({ ...this.meta, active: name, names: [...this.meta.names, name] });
    this.board = copy;
    this.source = 'own';
    this.#save(copy);
    this.#refreshSeed();
    this.clearUndo();
    return name;
  }

  /** Delete a custom profile (built-ins stay); its boards go on every device class. */
  deleteProfile(name: string): void {
    const src = this.#src;
    if (!src || name === DEFAULT_PROFILE || name === BLANK_PROFILE || !this.meta.names.includes(name)) return;
    const wasActive = this.meta.active === name;
    this.#saveMeta({ ...this.meta, active: wasActive ? DEFAULT_PROFILE : this.meta.active, names: this.meta.names.filter((n) => n !== name) });
    for (const cls of DEVICE_CLASSES) this.#storage.remove?.(boardKey(src.slug, name, cls));
    if (wasActive) {
      const { board, source } = this.#load(DEFAULT_PROFILE);
      this.board = board;
      this.source = source;
      this.#refreshSeed();
      this.clearUndo();
      this.loads++;
    }
  }

  /** What resetting the current page to the profile's seed (its page of the same name, else empty) does, or
   *  null when the page already equals it. The prompt names what it moves and what it takes off the board. */
  planResetPage(): PageResetPlan | null {
    const b = this.board;
    const seed = this.seed;
    const src = this.#src;
    if (!src || !b || !seed) return null;
    const keys = new Set(src.catalog.map((c) => c.key));
    return pageDiffersFromSeed(b, seed, b.page, keys) ? planPageReset(b, seed, b.page, keys) : null;
  }

  /** Reset the current page that way and save; null (and no write) when the page already equals its seed. */
  resetPage(): PageResetPlan | null {
    const plan = this.planResetPage();
    if (plan) this.commit(plan.board);
    return plan;
  }

  /** Controls the reset of the fixed area takes off the board. */
  lostByFixedReset(): string[] {
    const b = this.board;
    const seed = this.seed;
    const src = this.#src;
    return src && b && seed ? lostKeys(b, resetFixedFrom(b, seed).board, new Set(src.catalog.map((c) => c.key))) : [];
  }

  /** Reset the fixed area to the profile's seed (away when the seed has none) and save; false (and no write)
   *  when it already equals it. */
  resetFixed(): boolean {
    const b = this.board;
    const seed = this.seed;
    const src = this.#src;
    if (!src || !b || !seed || !fixedDiffersFromSeed(b, seed, new Set(src.catalog.map((c) => c.key)))) return false;
    const r = resetFixedFrom(b, seed);
    if (r.ok) this.commit(r.board);
    return r.ok;
  }

  /** Reset every page (and the fixed area) to the profile's seed (the saved default for the type, else the
   *  device layout; Blank: empty) and save. The current page stays when the seed has it. */
  resetAll(): void {
    const b = this.board;
    const seed = this.seed;
    if (!this.#src || !seed) return;
    const page = b && seed.pageOrder.includes(b.page) ? b.page : seed.page;
    this.commit({ ...JSON.parse(JSON.stringify(seed)), page } as BeBoard);
  }

  /** Save the current board as the family's "default for this type" (F8: per block family): profiles
   *  without a board of their own, and a Default re-seeded by a type change, start from it. */
  saveAsDefault(): void {
    const src = this.#src;
    const b = this.board;
    if (!src || !b) return;
    this.#carryLegacy();
    saveUserSeed(this.#storage, src.slug, b);
    this.#refreshSeed();
  }

  /** Forget the family's "default for this type": the device layout seeds again. */
  forgetDefault(): void {
    const src = this.#src;
    if (!src) return;
    clearUserSeed(this.#storage, src.slug);
    // a board still showing the forgotten default (nothing stored for the profile yet) goes back to
    // what the profile loads now — the device layout — without writing anything
    if (this.source === 'user-seed') {
      const keep = this.board?.page;
      let { board, source } = this.#load(this.meta.active);
      if (keep && board.pageOrder.includes(keep)) board = board.page === keep ? board : { ...board, page: keep };
      this.board = board;
      this.source = source;
      this.clearUndo();
    }
    this.#refreshSeed();
  }

  /** Re-seed the active profile from the device layout (discard customization) and save it. */
  resetToDevice(): void {
    const src = this.#src;
    if (!src) return;
    const seed = src.deviceSeed();
    const stamped = this.meta.active === DEFAULT_PROFILE && src.variantSig ? { ...seed, variantSig: src.variantSig } : seed;
    const keys = new Set(src.catalog.map((c) => c.key));
    const next = normalizeBoard(stamped, keys, { viewsByKey: viewsByKey(src.catalog), keepKeys: isBlockLevelKey });
    const page = this.board && next.pageOrder.includes(this.board.page) ? this.board.page : next.page;
    this.commit({ ...next, page });
  }
}
