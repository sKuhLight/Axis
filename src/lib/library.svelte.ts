// Preset Library store — scan the device's presets (by number, non-disruptive) or import .syx files,
// then search/filter by name + block + scene + tag/collection, with favorites. Persists metadata +
// the scanned summaries to localStorage. UI-agnostic: the Library screen binds to this; no rendering here.
import { z } from 'zod';
import { forgefx } from './forgefx';
import { isWebBuild } from './buildMode';
import { refreshCabIrsCache } from './cabIrsCache';
import { idb } from './idb';
import { notifyMutation } from './syncBus';
import type { PresetSummary, DecodedBlock, ColorLabelGroup } from './types';
import { parseConvertedDoc, type ConvertedPresetDoc } from './convertScratch';
import { deviceName } from './convertReport';
import { claimSwatch, fallbackSwatch, findTagKey, normalizeTagColors, tagSwatchCss } from './tagColors';
import { renameTagAssignments, renameTagColorKey } from './tagRename';
import { mapFm3Color } from './fm3ColorMap';

// Validate persisted summaries on load → drop anything corrupt or from an older schema (instead of
// letting a malformed cache break the library). Permissive: only the fields the UI relies on.
const summarySchema = z.object({
  number: z.number(),
  name: z.string(),
  model: z.string(),
  crcValid: z.boolean(),
  crc: z.number().optional(),
  scenes: z.array(z.string()),
  blocks: z.array(z.object({ effectId: z.number(), slug: z.string().nullable(), name: z.string(), instance: z.number().nullable() })),
  models: z.record(z.string(), z.array(z.string())),
  amps: z.array(z.string()),
  params: z.array(z.any()).optional()
});

/** A deep param-search clause: "<family> <param> <op> <value>". Numeric ops compare the display value;
 *  `has` matches an enum/type/model label (or any param label) by substring. */
export interface ParamQuery {
  /** Restrict to a block family slug (amp/reverb/…); null = any block. */
  slug: string | null;
  /** Param label or catalog name to match (e.g. "Gain", "Type"); case-insensitive substring. */
  field: string;
  op: 'gt' | 'lt' | 'eq' | 'has';
  /** Numeric threshold for gt/lt/eq. */
  value?: number;
  /** Text to match for `has` (enum label / type name). */
  text?: string;
}

export interface LibEntry {
  /** stable id: `dev:<n>` for a device preset slot, `file:<name>` for an imported .syx,
   *  `local:<relPath>` for a preset in the configured local Presets/ folder, `conv:<docId>` for a
   *  cross-device conversion saved to the `converted` store collection. */
  id: string;
  source: 'device' | 'file' | 'local' | 'converted';
  summary: PresetSummary;
  fav: boolean;
  /** imported/local presets only: the folder they came from (for grouping/browsing). */
  folder?: string;
  /** `converted` entries only: the persisted conversion doc (re-open source) + a display provenance
   *  string ("FM3 → AM4"). Absent for every other source. */
  converted?: ConvertedPresetDoc;
  provenance?: string;
}

/** The FM3 names an uninitialized slot `<EMPTY>` — a valid CRC'd preset, so it must be filtered
 *  explicitly or it pollutes the library/search as a ghost entry. */
const isEmptyName = (name: string) => /^<empty>$/i.test(name.trim());

/** True when a decoded preset is effectively empty. "Clear preset" on the FM3 empties the grid and
 *  scenes but LEAVES the name header intact (the old name still decodes), so the name is NOT a
 *  reliable cleared signal — the empty block list is. An empty grid decodes to `blocks: []` because
 *  `#summarizeDump` skips shunts/unplaced cells. */
const isEmptySummary = (s: PresetSummary): boolean => !(s.blocks?.length);

const LS = { tags: 'axs.lib.tags', collections: 'axs.lib.collections', favs: 'axs.lib.favs', tagColors: 'axs.lib.tagColors', cache: 'axs.lib.cache', built: 'axs.lib.built', files: 'axs.lib.files', folders: 'axs.lib.folders' };
const IDB_PARAMS = 'lib.params'; // IndexedDB key for the per-preset param index (id → DecodedBlock[])
const IDB_FILEBYTES = 'lib.fileBytes'; // raw .syx bytes for imported file/folder presets (id → number[]) — for live load
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const persist = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* quota / unavailable — metadata is best-effort */
  }
};
// User config (tags/collections/favorites): persist to localStorage (instant/offline source of truth)
// AND mirror to the ForgeFX store under the `config` collection, so it lives in the unified backend and
// other UIs on this PC see it live. localStorage stays authoritative for reads → zero data-loss risk.
const persistCfg = (cfgId: 'tags' | 'collections' | 'favs' | 'tagColors', lsKey: string, v: unknown) => {
  persist(lsKey, v);
  forgefx.putDoc('config', cfgId, v).catch(() => {});
  notifyMutation(); // nudge debounced local folder auto-sync
};

class LibraryStore {
  entries = $state<LibEntry[]>([]);
  scanning = $state(false);
  scanDone = $state(0);
  scanTotal = $state(0);
  scanError = $state<string | null>(null);

  /** id → tags (persisted). */
  tags = $state<Record<string, string[]>>(load(LS.tags, {}));
  /** collection name → member ids (persisted). */
  collections = $state<Record<string, string[]>>(load(LS.collections, {}));
  /** tag (case as first seen) → swatch hue index (persisted). Assigned only by `ensureTagColors`. */
  tagColors = $state<Record<string, number>>(normalizeTagColors(load(LS.tagColors, {})));

  // filter state the UI binds to
  query = $state('');
  blockFilter = $state<string | null>(null); // block slug
  ampFilter = $state<string | null>(null); // amp model name (back-compat; amp-specific)
  modelFilter = $state<string | null>(null); // ANY block-family model name (amp/drive/cab/reverb/…)
  tagFilter = $state<string | null>(null);
  collectionFilter = $state<string | null>(null);
  favOnly = $state(false);
  /** Deep param-search clauses (ANDed). Only match entries whose params are available (files always;
   *  device entries after a cache build, or after `hydrateParams` for a single preset). */
  paramQueries = $state<ParamQuery[]>([]);
  // Both caches below are `$state.raw` ON PURPOSE: they hold the biggest objects in the app (every
  // decoded param of every preset; raw .syx bytes), and a deep `$state` proxy makes every param read
  // pay a trap + a reactive source. The spec/autocomplete derivations walk EVERY param of EVERY block
  // of EVERY preset, which measured ~85x slower through the proxy (seconds, not milliseconds, on a
  // 512-preset library). Raw keeps reassignment reactive but leaves the contents plain.
  // CONTRACT: to notify readers, REASSIGN the field (`x = { ...x, [id]: v }`) — an in-place write is
  // invisible to `filtered` / `paramsReady` / `allParamFields` and the Preset Browser derivations.
  /** Hydrated device params, keyed by entry id. Persisted in IndexedDB (too big for localStorage) and
   *  loaded into memory on launch, so the param index survives reloads. */
  #paramsCache = $state.raw<Record<string, DecodedBlock[]>>({});
  /** Raw .syx bytes for imported file/folder presets (id → byte array), so they load live to the edit
   *  buffer. Persisted in IndexedDB. No reactive readers — every consumer goes through `fileBytes(id)`
   *  from imperative code, so the in-place writes below are fine (identity is stable for persistence). */
  #fileBytes = $state.raw<Record<string, number[]>>({});
  /** Folder paths the user has imported presets from (for the sidebar folder list). */
  folders = $state<string[]>([]);
  /** True once a full cache build has completed (persisted) — drives the startup prompt. */
  cacheBuilt = $state(load<boolean>(LS.built, false));

  constructor() {
    // restore the cached device scan so the library isn't empty on launch
    const favs = new Set(load<string[]>(LS.favs, []));
    const cached = (load<unknown[]>(LS.cache, []).filter((s) => summarySchema.safeParse(s).success) as PresetSummary[])
      .filter((s) => !isEmptyName(s.name) && !isEmptySummary(s)); // self-heal: drop ghost/cleared entries from older caches
    const deviceEntries = cached.map((s) => ({ id: `dev:${s.number}`, source: 'device' as const, summary: s, fav: favs.has(`dev:${s.number}`) }));
    // restore imported file/folder presets (summaries in localStorage; raw bytes in IndexedDB for live load)
    const files = (load<{ id: string; folder?: string; summary: unknown }[]>(LS.files, [])
      .filter((f) => summarySchema.safeParse(f.summary).success)) as { id: string; folder?: string; summary: PresetSummary }[];
    const fileEntries = files.map((f) => ({ id: f.id, source: 'file' as const, summary: f.summary, fav: favs.has(f.id), folder: f.folder }));
    this.entries = [...deviceEntries, ...fileEntries].sort(this.#order);
    this.folders = load<string[]>(LS.folders, []);
    // restore the heavy per-preset params from IndexedDB (async) so deep search works without a re-scan
    if (idb.available()) {
      idb.get<Record<string, DecodedBlock[]>>(IDB_PARAMS).then((p) => { if (p) this.#paramsCache = p; });
      idb.get<Record<string, number[]>>(IDB_FILEBYTES).then((b) => { if (b) this.#fileBytes = b; });
    }
    // surface any previously-saved cross-device conversions (best-effort; async)
    void this.loadConverted();
    // Claim swatches for any tag that predates this feature (or arrived via a pushed `tags`
    // doc without ever going through `addTag`) — "first sight" for the host's local library is here,
    // at launch, not only at tag-creation time.
    this.ensureTagColors();
    // Host: republish the local Axis config into the ONE config store on every launch, so the store always
    // reflects THIS PC — the source of truth other UIs on this machine read. NEVER in the web
    // build: its localStorage is empty and (in dev) shares the host's ForgeFX, so publishing would clobber
    // the host's real config.
    if (!isWebBuild() && typeof localStorage !== 'undefined') {
      const raw = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
      forgefx.putDoc('config', 'tags', this.tags).catch(() => {});
      forgefx.putDoc('config', 'collections', this.collections).catch(() => {});
      forgefx.putDoc('config', 'favs', load<string[]>(LS.favs, [])).catch(() => {});
      forgefx.putDoc('config', 'tagColors', this.tagColors).catch(() => {});
      forgefx.putDoc('config', 'savedFilters', raw('axs.pb.saved') ?? []).catch(() => {});
      forgefx.putDoc('config', 'layouts', raw('axis.layouts.v1') ?? {}).catch(() => {});
      forgefx.putDoc('config', 'swipe', raw('axis.swipe.v1') ?? {}).catch(() => {});
    }
  }

  /** All model names across every block family of a preset (amp/drive/cab/reverb/…), flattened. */
  #allModelNames = (s: PresetSummary): string[] => {
    const m = s.models;
    if (m && typeof m === 'object') return Object.values(m).flat();
    return s.amps ?? []; // pre-`models` cached summaries → amp names only
  };

  /** The decoded blocks for an entry, if available (embedded file params or hydrated device params). */
  paramsOf = (e: LibEntry): DecodedBlock[] | null => e.summary.params ?? this.#paramsCache[e.id] ?? null;

  /** Does an entry satisfy one param clause? Unavailable params → no match (so a param query narrows to
   *  entries we can actually evaluate). */
  #matchesParam = (e: LibEntry, q: ParamQuery): boolean => {
    const blocks = this.paramsOf(e);
    if (!blocks) return false;
    const field = q.field.trim().toLowerCase();
    for (const b of blocks) {
      if (q.slug && b.slug !== q.slug) continue;
      for (const p of b.params) {
        if (field && !(p.label.toLowerCase().includes(field) || p.name.toLowerCase().includes(field))) continue;
        if (q.op === 'has') {
          const hay = `${p.enumLabel ?? ''} ${p.label} ${p.name}`.toLowerCase();
          if (!q.text || hay.includes(q.text.trim().toLowerCase())) return true;
        } else if (p.value != null && q.value != null) {
          if (q.op === 'gt' && p.value > q.value) return true;
          if (q.op === 'lt' && p.value < q.value) return true;
          if (q.op === 'eq' && Math.abs(p.value - q.value) < 1e-6) return true;
        }
      }
    }
    return false;
  };

  // ── derived views (memoized) ──
  filtered = $derived.by(() => {
    const q = this.query.trim().toLowerCase();
    return this.entries.filter((e) => {
      if (this.favOnly && !e.fav) return false;
      if (this.blockFilter && !e.summary.blocks.some((b) => b.slug === this.blockFilter)) return false;
      if (this.ampFilter && !(e.summary.amps ?? []).includes(this.ampFilter)) return false;
      if (this.modelFilter && !this.#allModelNames(e.summary).includes(this.modelFilter)) return false;
      if (this.tagFilter && !(this.tags[e.id] ?? []).includes(this.tagFilter)) return false;
      if (this.collectionFilter && !(this.collections[this.collectionFilter] ?? []).includes(e.id)) return false;
      for (const pq of this.paramQueries) if (!this.#matchesParam(e, pq)) return false;
      if (q) {
        const blocks = this.paramsOf(e);
        const paramHay = blocks ? blocks.flatMap((b) => b.params.map((p) => `${p.label} ${p.enumLabel ?? ''}`)).join(' ') : '';
        const hay = `${e.summary.name} ${e.summary.scenes.join(' ')} ${e.summary.blocks.map((b) => b.name).join(' ')} ${this.#allModelNames(e.summary).join(' ')} ${paramHay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });
  /** unique block slugs across the library — for filter chips. */
  allBlocks = $derived.by(() => {
    const s = new Set<string>();
    for (const e of this.entries) for (const b of e.summary.blocks) if (b.slug) s.add(b.slug);
    return [...s].sort();
  });
  /** unique amp-model names across the library — for the amp filter / autocomplete. */
  allAmps = $derived.by(() => {
    const s = new Set<string>();
    for (const e of this.entries) for (const a of e.summary.amps ?? []) s.add(a);
    return [...s].sort();
  });
  /** unique model names across ALL block families — for the model filter / autocomplete. */
  allModels = $derived.by(() => {
    const s = new Set<string>();
    for (const e of this.entries) for (const m of this.#allModelNames(e.summary)) s.add(m);
    return [...s].sort();
  });
  /** model names grouped by family slug — for a per-family model filter UI (e.g. "Reverb → …"). */
  modelsByFamily = $derived.by(() => {
    const out: Record<string, Set<string>> = {};
    for (const e of this.entries)
      for (const [slug, names] of Object.entries(e.summary.models ?? {}))
        for (const n of names) (out[slug] ??= new Set()).add(n);
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
  });
  allTags = $derived.by(() => {
    const s = new Set<string>();
    for (const ts of Object.values(this.tags)) for (const t of ts) s.add(t);
    return [...s].sort();
  });
  collectionNames = $derived.by(() => Object.keys(this.collections).sort());

  // ── device scan (non-disruptive; skips empty/invalid slots) ──
  /** Build the full library cache in one pass: every preset's name + blocks + models + ALL params,
   *  persisted (summaries → localStorage, heavy params → IndexedDB) so every feature works offline after.
   *  This is the single "index everything" action — no separate light-scan vs deep-scan. */
  async buildCache(from = 0, to = 511): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this.scanError = null;
    this.scanDone = 0;
    this.scanTotal = to - from + 1;
    const byId = new Map(this.entries.map((e) => [e.id, e] as const));
    const params = { ...this.#paramsCache };
    try {
      // Name-scan devices (caps presets.canScanNames, e.g. the AM4) have no full preset dumps — they
      // scan stored locations by name. Lightweight entries (name + code, no block/param index) so the
      // browser lists + loads them; the deep param filtering stays a full-dump (canDeepScan) feature.
      const dev = await forgefx.device().catch(() => null);
      const caps = dev?.capabilities;
      const v2 = (dev?.apiVersion ?? 1) >= 2;
      if (caps?.cabIrs) await refreshCabIrsCache().catch(() => {});
      const nameScan = v2 ? !!caps?.presets?.canScanNames && !caps?.presets?.canDeepScan : dev?.modelByte === '0x15';
      if (nameScan) {
        // API v2: unified GET /preset/locations; legacy v1 fallback: the AM4's own scan route.
        const locations = v2
          ? (await forgefx.presetLocations()).locations
          : (await forgefx.am4Presets()).presets;
        this.scanTotal = locations.length;
        const seen = new Set<number>();
        for (const p of locations) {
          if (p.isEmpty || !p.name.trim()) continue;
          seen.add(p.location);
          const id = `dev:${p.location}`;
          byId.set(id, {
            id,
            source: 'device',
            summary: { number: p.location, name: p.name, model: dev?.model ?? 'AM4', crcValid: true, scenes: [], blocks: [], models: {}, amps: [] },
            fav: byId.get(id)?.fav ?? false
          });
        }
        // drop device entries for slots that came back empty/absent this scan, so presets cleared on
        // the hardware don't linger with a stale cached name.
        for (const [id, e] of byId) if (e.source === 'device' && !seen.has(e.summary.number)) byId.delete(id);
        this.entries = [...byId.values()].sort(this.#order);
        this.#cacheDevice();
        this.cacheBuilt = true;
        persist(LS.built, true);
        return; // `finally` resets `scanning`
      }
      // full index: clamp the scan range to the device's real slot count (caps presets.count)
      const count = caps?.presets?.count;
      if (count) { to = Math.min(to, count - 1); this.scanTotal = to - from + 1; }
      for (let n = from; n <= to; n++) {
        try {
          const s = await forgefx.presetSummary(n, true); // full=1 → summary + params in one dump
          if (s.crcValid && s.name.trim() && !isEmptyName(s.name) && !isEmptySummary(s)) {
            const id = `dev:${n}`;
            if (s.params) { params[id] = s.params; delete s.params; } // params → idb; keep summary light
            byId.set(id, { id, source: 'device', summary: s, fav: byId.get(id)?.fav ?? false });
          } else {
            // slot cleared/emptied — drop the stale cached entry + params (a cleared FM3 preset still
            // carries its old name, but its grid decodes to zero blocks → isEmptySummary)
            byId.delete(`dev:${n}`);
            delete params[`dev:${n}`];
          }
        } catch {
          /* unreadable — keep the cached copy (could be a transient read error, not a clear) */
        }
        this.scanDone = n - from + 1;
        if (n % 8 === 0 || n === to) this.entries = [...byId.values()].sort(this.#order); // progressive UI
      }
      this.entries = [...byId.values()].sort(this.#order);
      this.#paramsCache = params;
      this.#cacheDevice();
      if (idb.available()) await idb.set(IDB_PARAMS, params);
      this.cacheBuilt = true;
      persist(LS.built, true);
    } catch (e) {
      this.scanError = (e as Error).message;
    } finally {
      this.scanning = false;
    }
  }
  /** Back-compat alias — the unified build replaces the old light scan. */
  scanDevice = (from = 0, to = 511) => this.buildCache(from, to);

  // ── import .syx preset files / folders (offline) ──
  /** Import .syx files. `folder` groups them (set when importing a directory) and the raw bytes are kept
   *  so each preset can be loaded live into the edit buffer later — no device slot needed. */
  async importFiles(files: Iterable<File>, folder?: string): Promise<{ ok: number; failed: number }> {
    const byId = new Map(this.entries.map((e) => [e.id, e] as const));
    let ok = 0;
    let failed = 0;
    for (const f of files) {
      if (!/\.syx$/i.test(f.name)) continue; // folder imports include non-preset files — skip them
      try {
        const buf = await f.arrayBuffer();
        const summary = await forgefx.decodePresetFile(buf);
        const id = `file:${folder ? folder + '/' : ''}${f.name}`;
        byId.set(id, { id, source: 'file', summary: { ...summary, name: summary.name || f.name.replace(/\.syx$/i, '') }, fav: byId.get(id)?.fav ?? false, folder });
        this.#fileBytes[id] = Array.from(new Uint8Array(buf));
        ok++;
      } catch {
        failed++;
      }
    }
    if (folder && ok && !this.folders.includes(folder)) { this.folders = [...this.folders, folder]; persist(LS.folders, this.folders); }
    this.entries = [...byId.values()].sort(this.#order);
    this.#persistFiles();
    return { ok, failed };
  }

  /** Open a directory picker and import every .syx within (one level). Returns count, or null if the
   *  picker is unsupported / cancelled. Uses the directory <input> so it works in Electron + Chromium. */
  async importFolder(): Promise<{ ok: number; failed: number } | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.syx';
      (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      input.multiple = true;
      input.onchange = async () => {
        const list = Array.from(input.files ?? []);
        if (!list.length) return resolve(null);
        // derive a short folder name from the common top directory of the selection
        const folder = (list[0].webkitRelativePath?.split('/')[0]) || 'Folder';
        resolve(await this.importFiles(list, folder));
      };
      input.click();
    });
  }

  // ── local storage folder (server-scanned Presets/ directory; bytes fetched on demand) ──
  /** True when a local root is configured and the engine serves /local/* (feature-detect via refreshLocal). */
  localEnabled = $state(false);
  /** Non-preset .syx files (IRs/cabs/firmware) skipped by the last local scan. */
  localSkipped = $state(0);
  /** Relative path (under Presets/) of a `local:` entry. */
  localPath = (id: string): string => id.slice('local:'.length);
  /** Re-scan the local Presets/ folder and swap all `local:` entries in one pass. The server cache
   *  (mtime-keyed) is the source of truth — no bytes or summaries are persisted client-side. */
  async refreshLocal(refresh = false): Promise<void> {
    try {
      const r = await forgefx.localPresets(refresh);
      const favs = new Set(load<string[]>(LS.favs, []));
      const locals: LibEntry[] = r.entries.map((en) => ({
        id: `local:${en.path}`,
        source: 'local' as const,
        // decoded server-side by the same offline decoder as file imports (typed as PresetSummary);
        // guard the two collection fields the UI iterates in case an older engine omits them
        summary: { ...en.summary, name: en.name, scenes: en.summary.scenes ?? [], blocks: en.summary.blocks ?? [], models: en.summary.models ?? {}, amps: en.summary.amps ?? [] },
        fav: favs.has(`local:${en.path}`),
        folder: en.path.includes('/') ? en.path.slice(0, en.path.lastIndexOf('/')) : undefined
      }));
      this.localSkipped = r.skipped;
      this.localEnabled = true;
      this.entries = [...this.entries.filter((e) => e.source !== 'local'), ...locals].sort(this.#order);
    } catch {
      // 409 = unconfigured/root missing, 404 = older engine → feature off, entries cleared
      this.localEnabled = false;
      this.entries = this.entries.filter((e) => e.source !== 'local');
    }
  }

  /** Raw .syx bytes for an imported preset (for live load), or null. */
  fileBytes(id: string): Uint8Array | null {
    const b = this.#fileBytes[id];
    return b ? new Uint8Array(b) : null;
  }
  /** Remove an imported preset (and its cached bytes). */
  removeFile(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    delete this.#fileBytes[id];
    this.#persistFiles();
    this.#dropTagsFor([id]);
  }
  /** Remove every preset imported from a folder. */
  removeFolder(folder: string): void {
    // Collect the ids BEFORE filtering — afterwards there is nothing left to look them up by.
    const gone: string[] = [];
    for (const e of this.entries) if (e.folder === folder) { delete this.#fileBytes[e.id]; gone.push(e.id); }
    this.entries = this.entries.filter((e) => e.folder !== folder);
    this.folders = this.folders.filter((f) => f !== folder);
    persist(LS.folders, this.folders);
    this.#persistFiles();
    this.#dropTagsFor(gone);
  }
  /** Forget the tags of presets that no longer exist. `allTags` walks `tags` with no idea whether
   *  its keys still refer to anything, so without this a deleted import keeps feeding ghost entries
   *  to every consumer — the Frequent Tags row, the monolith's quick tags, `tag:` autocomplete and
   *  the tag picker. Persists through persistCfg (not plain persist) so the removal reaches the
   *  synced config doc too, and only when something actually changed.
   *
   *  Only the explicit removal paths call this. The bulk `local`/`converted` category swaps replace
   *  entries whose ids come back on the next scan, so pruning there would discard tags the user
   *  still wants; device slots always exist, so `dev:N` tags are never orphaned this way. */
  #dropTagsFor(ids: string[]): void {
    let changed = false;
    for (const id of ids) if (this.tags[id]) { delete this.tags[id]; changed = true; }
    if (changed) persistCfg('tags', LS.tags, this.tags);
  }
  #persistFiles(): void {
    const files = this.entries.filter((e) => e.source === 'file').map((e) => ({ id: e.id, folder: e.folder, summary: e.summary }));
    persist(LS.files, files);
    if (idb.available()) idb.set(IDB_FILEBYTES, { ...this.#fileBytes });
  }

  // ── converted presets (cross-device conversions saved to the `converted` store collection) ──
  /** Build a lightweight library entry from a stored conversion doc. Summary blocks map the target IR's
   *  blocks to the browser's block shape so name search + block chips work; `number` carries the chosen
   *  slot (or -1 when free-form / unset — the UI renders those as "Converted", never a numeric slot). */
  #convertedEntry(docId: string, doc: ConvertedPresetDoc, favs: Set<string>): LibEntry {
    const id = `conv:${docId}`;
    const blocks = doc.preset.blocks.map((b) => ({ effectId: 0, slug: b.family, name: b.typeName ?? b.family, instance: b.instance }));
    const summary: PresetSummary = {
      number: doc.slot ?? -1,
      name: doc.name,
      model: deviceName(doc.targetDevice),
      crcValid: true,
      scenes: doc.preset.sceneNames ?? [],
      blocks,
      models: {},
      amps: []
    };
    return { id, source: 'converted', summary, fav: favs.has(id), converted: doc, provenance: `${doc.sourceDevice} → ${deviceName(doc.targetDevice)}` };
  }

  /** Load every saved conversion from the `converted` store collection into the library (replacing the
   *  prior `converted` entries in one pass). Best-effort + Zod-validated: a missing/older store or a
   *  corrupt doc simply yields fewer entries — it never throws. */
  async loadConverted(): Promise<void> {
    try {
      const { docs } = await forgefx.listDocs<unknown>('converted');
      const favs = new Set(load<string[]>(LS.favs, []));
      const converted: LibEntry[] = [];
      for (const d of docs) {
        const doc = parseConvertedDoc(d.data);
        if (doc) converted.push(this.#convertedEntry(d.id, doc, favs));
      }
      this.entries = [...this.entries.filter((e) => e.source !== 'converted'), ...converted].sort(this.#order);
    } catch {
      /* no store / older engine — leave any prior converted entries untouched */
    }
  }

  /** Delete a saved conversion (store doc + its library entry). `id` is the `conv:<docId>` entry id. */
  async removeConverted(id: string): Promise<void> {
    const docId = id.startsWith('conv:') ? id.slice('conv:'.length) : id;
    await forgefx.deleteDoc('converted', docId).catch(() => {});
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  // ── deep param hydration (device presets) ──
  /** Fetch + cache (in-memory) the full params for one device entry, so param search can evaluate it. */
  async hydrateParams(id: string): Promise<void> {
    if (this.#paramsCache[id]) return;
    const e = this.entries.find((x) => x.id === id);
    if (!e || e.source !== 'device' || e.summary.params) return;
    try {
      const { blocks } = await forgefx.presetParams(e.summary.number);
      this.#paramsCache = { ...this.#paramsCache, [id]: blocks };
      this.#persistParams();
    } catch {
      /* unreadable — leave unhydrated (param queries simply won't match it) */
    }
  }
  #persistParams() {
    if (idb.available()) idb.set(IDB_PARAMS, { ...this.#paramsCache });
  }
  /** True once every entry the param filter could apply to has its params available. (Non-device
   *  entries never block: file params are embedded; local params aren't indexed — they just won't match.) */
  paramsReady = $derived.by(() => this.entries.every((e) => e.source !== 'device' || e.summary.params || this.#paramsCache[e.id]));

  // ── param-query mutators (the advanced-search UI binds to these) ──
  addParamQuery(q: ParamQuery): void {
    this.paramQueries = [...this.paramQueries, q];
  }
  removeParamQuery(i: number): void {
    this.paramQueries = this.paramQueries.filter((_, k) => k !== i);
  }
  clearParamQueries(): void {
    this.paramQueries = [];
  }
  /** Distinct param labels across all available params — for the advanced-search field autocomplete. */
  allParamFields = $derived.by(() => {
    const s = new Set<string>();
    for (const e of this.entries) for (const b of this.paramsOf(e) ?? []) for (const p of b.params) s.add(p.label);
    return [...s].sort();
  });

  #order = (a: LibEntry, b: LibEntry) => {
    if (a.source !== b.source) {
      const rank = (s: LibEntry['source']) => (s === 'device' ? 0 : s === 'local' ? 1 : s === 'file' ? 2 : 3);
      return rank(a.source) - rank(b.source);
    }
    if (a.source === 'device') return a.summary.number - b.summary.number;
    if (a.source === 'local') return a.id.localeCompare(b.id); // path order (folders group naturally)
    return a.summary.name.localeCompare(b.summary.name); // file + converted → by name
  };
  #cacheDevice() {
    // summaries stay light in localStorage; the heavy `params` live in IndexedDB (IDB_PARAMS)
    const summaries = this.entries.filter((e) => e.source === 'device').map((e) => ({ ...e.summary, params: undefined }));
    persist(LS.cache, summaries);
  }

  /** Apply a live config push from another UI on this machine, WITHOUT re-publishing (that would loop).
   *  Updates the in-memory state + the localStorage cache only. */
  applyRemoteConfig(id: string, data: unknown): void {
    if (id === 'tags' && data && typeof data === 'object') { this.tags = data as Record<string, string[]>; persist(LS.tags, this.tags); this.ensureTagColors(); }
    else if (id === 'collections' && data && typeof data === 'object') { this.collections = data as Record<string, string[]>; persist(LS.collections, this.collections); }
    else if (id === 'favs' && Array.isArray(data)) {
      const s = new Set(data as string[]);
      this.entries = this.entries.map((e) => ({ ...e, fav: s.has(e.id) })).sort(this.#order);
      persist(LS.favs, data);
    } else if (id === 'tagColors' && data && typeof data === 'object') {
      this.tagColors = normalizeTagColors(data);
      persist(LS.tagColors, this.tagColors);
    }
  }
  /** Preset name for a device slot from the cache (for the quick picker). '' if not cached. */
  nameOfSlot = (n: number): string => this.entries.find((e) => e.source === 'device' && e.summary.number === n)?.summary.name ?? '';

  /** A device slot is definitively empty once the library has been scanned and the slot has no entry.
   *  False before any scan (no device entries at all = ambiguity, not empty). */
  slotIsEmpty = (n: number): boolean =>
    this.cacheBuilt && !this.entries.some((e) => e.source === 'device' && e.summary.number === n);

  /** Drop a device slot's cached entry + params. No-op if the slot isn't cached. */
  dropSlot(n: number): void {
    const id = `dev:${n}`;
    if (!this.entries.some((e) => e.id === id && e.source === 'device')) return;
    this.entries = this.entries.filter((e) => e.id !== id);
    delete this.#paramsCache[id];
    this.#cacheDevice();
    if (idb.available()) idb.set(IDB_PARAMS, { ...this.#paramsCache });
  }

  /** Reconcile the cache against a FRESH device name read (the cheap live current-preset query): a slot
   *  the device now reports as empty/`<EMPTY>` is dropped, so a preset cleared on the hardware stops
   *  showing its stale name without a full rescan. Non-empty names are left alone (renames flow through
   *  applySlotName/refreshSlot). */
  clearSlotIfEmpty(n: number, name: string): void {
    const clean = name.trim();
    if (clean && !isEmptyName(clean)) return;
    this.dropSlot(n);
  }

  /** Optimistically set a device slot's cached name after a CONFIRMED rename — no wire read.
   *  Name-scan devices (AM4) rename the stored slot directly, but a follow-up locations re-scan
   *  races the navigate-back on the shared serial transport (and can transiently read the slot
   *  empty → drop the entry), so the rename never lands in the list. Patch the entry in place
   *  instead; refreshSlot still reconciles deep-scan (gen-3) devices. No-op if the slot isn't cached. */
  applySlotName(n: number, name: string): void {
    const clean = name.trim();
    if (!clean) return;
    const id = `dev:${n}`;
    const prev = this.entries.find((e) => e.id === id && e.source === 'device');
    if (!prev || prev.summary.name === clean) return;
    const byId = new Map(this.entries.map((e) => [e.id, e] as const));
    byId.set(id, { ...prev, summary: { ...prev.summary, name: clean } });
    this.entries = [...byId.values()].sort(this.#order);
    this.#cacheDevice();
  }

  /** Re-read one device slot into the cache, keeping the index in sync with saves + external edits.
   *  CRC-gated: if the slot's content fingerprint matches the cached one, it's a no-op (no re-write). */
  async refreshSlot(n: number): Promise<void> {
    const id = `dev:${n}`;
    try {
      // Name-scan devices (AM4: canScanNames && !canDeepScan) have no full preset dump — presetSummary
      // 501s there. Refresh just the stored name from the locations scan so a rename/save reflects in the
      // library without a full rescan (matches the lightweight entry the initial name-scan builds).
      const dev = await forgefx.device().catch(() => null);
      const caps = dev?.capabilities;
      const nameScan = (dev?.apiVersion ?? 1) >= 2 ? !!caps?.presets?.canScanNames && !caps?.presets?.canDeepScan : dev?.modelByte === '0x15';
      if (nameScan) {
        const loc = (await forgefx.presetLocations()).locations.find((p) => p.location === n);
        const byId = new Map(this.entries.map((e) => [e.id, e] as const));
        if (loc && !loc.isEmpty && loc.name.trim() && !isEmptyName(loc.name)) {
          const prev = byId.get(id);
          byId.set(id, {
            id, source: 'device', fav: prev?.fav ?? false,
            summary: { number: n, name: loc.name, model: dev?.model ?? 'AM4', crcValid: true, scenes: [], blocks: [], models: {}, amps: [] } as PresetSummary
          });
        } else byId.delete(id);
        this.entries = [...byId.values()].sort(this.#order);
        this.#cacheDevice();
        return;
      }
      const s = await forgefx.presetSummary(n, true);
      const cached = this.entries.find((e) => e.id === id);
      // unchanged + already fully cached → nothing to do (skip the IndexedDB write + reactivity churn)
      if (cached && cached.summary.crc != null && cached.summary.crc === s.crc && this.#paramsCache[id]) return;
      const byId = new Map(this.entries.map((e) => [e.id, e] as const));
      if (s.crcValid && s.name.trim() && !isEmptyName(s.name) && !isEmptySummary(s)) {
        if (s.params) { this.#paramsCache = { ...this.#paramsCache, [id]: s.params }; delete s.params; this.#persistParams(); }
        byId.set(id, { id, source: 'device', summary: s, fav: byId.get(id)?.fav ?? false });
      } else {
        byId.delete(id); // slot was cleared/emptied (a cleared FM3 preset keeps its old name but has no blocks)
      }
      this.entries = [...byId.values()].sort(this.#order);
      this.#cacheDevice();
    } catch {
      /* leave the cached copy as-is if the re-read fails */
    }
  }

  // ── metadata: tags / collections / favorites ──
  toggleFav(id: string): void {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return;
    e.fav = !e.fav;
    persistCfg('favs', LS.favs, this.entries.filter((x) => x.fav).map((x) => x.id));
  }
  addTag(id: string, tag: string): void {
    const t = tag.trim();
    if (!t) return;
    const cur = this.tags[id] ?? [];
    if (cur.includes(t)) return;
    this.tags[id] = [...cur, t];
    persistCfg('tags', LS.tags, this.tags);
    this.ensureTagColors();
  }
  removeTag(id: string, tag: string): void {
    if (!this.tags[id]) return;
    this.tags[id] = this.tags[id].filter((x) => x !== tag);
    if (!this.tags[id].length) delete this.tags[id];
    persistCfg('tags', LS.tags, this.tags);
  }
  /** Rename a tag everywhere it exists: on every preset, and in the color registry. Case-insensitive
   *  on `from`, so a pure recase still applies. Renaming onto an existing tag MERGES them (see
   *  renameTagAssignments). The Frequent Tags usage counts are NOT owned here — they live with the
   *  workbench panel, which calls `renameTagCount` alongside this. */
  renameTag(from: string, to: string): void {
    const next = to.trim();
    if (!next || next === from) return;
    if (!this.allTags.some((t) => t.toLowerCase() === from.toLowerCase())) return; // nothing to rename
    // Assign BOTH maps before persisting EITHER. persistCfg → notifyMutation nudges the config sync,
    // and an `applyRemoteConfig('tags', …)` landing between the two assignments would see the renamed
    // tag with no color yet and have ensureTagColors claim a fresh swatch for it — the tag visibly
    // changes color on rename. Keeping the window closed is what makes the rename atomic to readers.
    const nextTags = renameTagAssignments(this.tags, from, next);
    const nextColors = renameTagColorKey(this.tagColors, from, next);
    this.tags = nextTags;
    this.tagColors = nextColors;
    persistCfg('tags', LS.tags, this.tags);
    persistCfg('tagColors', LS.tagColors, this.tagColors);
  }
  /** Apply FM3-Edit preset-color groups (replicated-purring-bachman) as Axis tags. Matches by exact
   *  (case-insensitive) `summary.name` against DEVICE-SLOT entries only — FM3-Edit assigns colors to
   *  device slots, so a file/local/converted copy of the same name is deliberately not tagged here
   *  (a name-matching decision, not an oversight; see plan revision #5).
   *
   *  `opts.skipIds`: FM3 tag name → preset ids to leave untouched even if matched (the caller's
   *  provenance record for ids already offered this tag on a prior run — see colorLabels.svelte.ts).
   *  Skipping here, rather than filtering whole groups out by name, is what lets a NEW preset that
   *  later picks up an already-seen FM3 color still get tagged, while a preset whose tag the user
   *  removed or renamed away stays untouched.
   *
   *  Builds a name→ids index once (not a nested scan per name), assigns both the tags map and the
   *  tagColors map before persisting either (mirrors `renameTag`'s atomic build — see plan revision
   *  #2, avoids the `ensureTagColors` claim-race a separate `setTagColor` call afterward would hit),
   *  and only persists what actually changed (see plan revision #3 — this runs on every
   *  `library.entries` reassignment during a progressive scan). Idempotent: skips ids that already
   *  carry the tag.
   *
   *  Returns `matchedIds` (FM3 tag name → every device-slot id the group's names resolved to, whether
   *  newly tagged, already tagged, or skipped) so the caller can fold it into its provenance record. */
  applyColorLabelGroups(
    groups: ColorLabelGroup[],
    opts: { skipIds?: Record<string, string[]> } = {}
  ): { tagged: number; unmatched: string[]; matchedIds: Record<string, string[]> } {
    const nameIndex = new Map<string, string[]>();
    for (const e of this.entries) {
      if (e.source !== 'device') continue;
      const key = e.summary.name.trim().toLowerCase();
      if (!key) continue;
      const ids = nameIndex.get(key);
      if (ids) ids.push(e.id);
      else nameIndex.set(key, [e.id]);
    }

    const nextTags = { ...this.tags };
    const nextColors = { ...this.tagColors };
    const matchedIds: Record<string, string[]> = {};
    const unmatched: string[] = [];
    let tagged = 0;
    let tagsChanged = false;
    let colorsChanged = false;

    for (const group of groups) {
      const { name, swatchIndex } = mapFm3Color(group.hex);
      const skip = new Set(opts.skipIds?.[name] ?? []);
      const seen = new Set<string>();
      for (const presetName of group.names) {
        const ids = nameIndex.get(presetName.trim().toLowerCase());
        if (!ids || !ids.length) { unmatched.push(presetName); continue; }
        for (const id of ids) {
          if (!seen.has(id)) { seen.add(id); (matchedIds[name] ??= []).push(id); }
          if (skip.has(id)) continue; // provenance: leave a removed/renamed-away assignment alone
          const cur = nextTags[id] ?? [];
          if (cur.some((t) => t.toLowerCase() === name.toLowerCase())) continue; // already tagged
          nextTags[id] = [...cur, name];
          tagsChanged = true;
          tagged++;
        }
      }
      // Deliberate color mapping — claim only if this tag has no color yet (never override a manual
      // recolor) and the group actually matched at least one preset (skip phantom colors for an
      // FM3-Edit color the user never assigned to anything), building both maps before persisting
      // either (see the doc comment above).
      if ((matchedIds[name]?.length ?? 0) > 0 && findTagKey(nextColors, name) === undefined) {
        nextColors[name] = swatchIndex;
        colorsChanged = true;
      }
    }

    if (tagsChanged) { this.tags = nextTags; persistCfg('tags', LS.tags, this.tags); }
    if (colorsChanged) { this.tagColors = nextColors; persistCfg('tagColors', LS.tagColors, this.tagColors); }

    return { tagged, unmatched, matchedIds };
  }
  createCollection(name: string): void {
    const n = name.trim();
    if (!n || this.collections[n]) return;
    this.collections[n] = [];
    persistCfg('collections', LS.collections, this.collections);
  }
  toggleInCollection(name: string, id: string): void {
    const list = this.collections[name];
    if (!list) return;
    this.collections[name] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    persistCfg('collections', LS.collections, this.collections);
  }
  deleteCollection(name: string): void {
    delete this.collections[name];
    if (this.collectionFilter === name) this.collectionFilter = null;
    persistCfg('collections', LS.collections, this.collections);
  }

  tagsOf = (id: string): string[] => this.tags[id] ?? [];
  inCollection = (name: string, id: string): boolean => (this.collections[name] ?? []).includes(id);

  // ── metadata: tag colors (a tag owns one color everywhere it renders) ──
  /** Claim a swatch for every tag in `allTags` that doesn't have one yet, persisting once if anything
   *  changed. The ONLY place assignment happens — never lazily inside a getter (`colorOf` is a pure
   *  read; writing `$state` during render trips `state_unsafe_mutation`). Call after
   *  `applyRemoteConfig('tags', …)` and at the end of `addTag()`. */
  ensureTagColors(): void {
    let changed = false;
    const next = { ...this.tagColors };
    for (const tag of this.allTags) {
      if (findTagKey(next, tag) !== undefined) continue;
      next[tag] = claimSwatch(next, tag);
      changed = true;
    }
    if (changed) {
      this.tagColors = next;
      persistCfg('tagColors', LS.tagColors, this.tagColors);
    }
  }
  /** Manual override from the swatch picker. */
  setTagColor(tag: string, index: number): void {
    const existingKey = findTagKey(this.tagColors, tag);
    this.tagColors = { ...this.tagColors, [existingKey ?? tag]: index };
    persistCfg('tagColors', LS.tagColors, this.tagColors);
  }
  /** A tag's color, wherever it renders. Falls back to a deterministic hash for a tag not yet claimed
   *  by `ensureTagColors` — never colorless, never flickers. */
  colorOf(tag: string): string {
    const existingKey = findTagKey(this.tagColors, tag);
    const idx = existingKey !== undefined ? this.tagColors[existingKey] : fallbackSwatch(tag);
    return tagSwatchCss(idx);
  }
}

export const library = new LibraryStore();
