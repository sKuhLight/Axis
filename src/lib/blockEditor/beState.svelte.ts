// Per-editor Block Editor state (runes): the board being shown, the family's meta (layout profiles,
// per-device-class navigation / control size, auto-pack), and the interim arrange state.
//
// Persistence goes through boardPersistence with an injected key/value store (in the app: the
// config/surface document via surfaceStore). Rules:
//   - loading never writes; only user actions (commit, profile / prefs changes) do;
//   - the first write of a family that still reads the previous editor's keys carries every profile's
//     legacy board over to its desktop key first (that write marks the family migrated, after which
//     legacy keys are never read again);
//   - nothing loads while the catalog is still trivially empty (only the always-present bypass entry);
//   - a reload happens when the family, the catalog's key set, the device-layout variant, the device
//     class or the remote revision changes. A reload of the same family keeps the page the user is on.
// Covered by beState.runes.test.ts.

import {
  BLOCK_LEVEL_KEYS,
  normalizeBoard,
  type BeBoard
} from './boardModel';
import {
  BLANK_PROFILE,
  boardKey,
  carryLegacyBoards,
  DEFAULT_PROFILE,
  DEVICE_CLASSES,
  loadBoard,
  loadMeta,
  prefsFor,
  saveBoard,
  saveMeta,
  withPrefs,
  type BeMeta,
  type BoardSource,
  type DeviceClass,
  type KeyValueStore
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
  /** The device-authentic default board (device layout, else the curated fallback). */
  deviceSeed: () => BeBoard;
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
  /** Bumped when a load should bring the stored current page into view (new family / profile). */
  loads = $state(0);
  /** Arrange mode (interim) and the cell size frozen while arranging. */
  editMode = $state(false);
  frozenCell = $state<number | null>(null);

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

  /** Bring the state in line with its source. Loads (never saves) when the inputs changed; returns true
   *  when it (re)loaded. */
  sync(src: BeSource): boolean {
    if (!src.slug || !catalogReady(src.catalog)) return false;
    const sig = [src.slug, src.catalog.map((c) => c.key).join(','), src.variantSig, src.deviceClass, src.rev].join('|');
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
    if (!sameFamily) this.setEditMode(false);
    return true;
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
      viewsByKey: viewsByKey(src.catalog)
    });
  }

  /** Before any write: hand a not-yet-migrated family's legacy boards over to the new keys. */
  #carryLegacy(): void {
    const src = this.#src;
    if (!src) return;
    carryLegacyBoards({
      storage: this.#storage,
      legacyStorage: this.#legacy,
      slug: src.slug,
      names: this.meta.names,
      catalogKeys: src.catalog.map((c) => c.key),
      seedFor: (profile) => this.#seedFor(profile),
      variantSig: src.variantSig,
      viewsByKey: viewsByKey(src.catalog)
    });
  }

  #save(board: BeBoard): void {
    const src = this.#src;
    if (!src) return;
    this.#carryLegacy();
    saveBoard({ storage: this.#storage, slug: src.slug, profile: this.meta.active, deviceClass: src.deviceClass, board });
  }

  #saveMeta(meta: BeMeta): void {
    this.#carryLegacy();
    this.meta = meta;
    if (this.#src) saveMeta(this.#storage, this.#src.slug, meta);
  }

  // ── board ──

  /** A user change: show it and save it. The same reference is a no-op. */
  commit(next: BeBoard): void {
    if (!this.#src || next === this.board) return;
    this.board = next;
    this.#save(next);
  }

  /** Show a board without saving (live preview during a gesture; `commit` saves at the end). */
  preview(next: BeBoard): void {
    if (this.#src) this.board = next;
  }

  /** Save what is shown (end of a previewed gesture). */
  flush(): void {
    if (this.board) this.#save(this.board);
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

  setEditMode(on: boolean, cell: number | null = null): void {
    this.editMode = on;
    this.frozenCell = on ? cell : null;
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
      this.loads++;
    }
  }

  /** Re-seed the active profile from the device layout (discard customization) and save it. */
  resetToDevice(): void {
    const src = this.#src;
    if (!src) return;
    const seed = src.deviceSeed();
    const stamped = this.meta.active === DEFAULT_PROFILE && src.variantSig ? { ...seed, variantSig: src.variantSig } : seed;
    const keys = new Set(src.catalog.map((c) => c.key));
    const next = normalizeBoard(stamped, keys, { viewsByKey: viewsByKey(src.catalog), keepKeys: BLOCK_LEVEL_KEYS });
    const page = this.board && next.pageOrder.includes(this.board.page) ? this.board.page : next.page;
    this.commit({ ...next, page });
  }
}
