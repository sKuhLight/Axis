// Preset Library store — scan the device's presets (by number, non-disruptive) or import .syx files,
// then search/filter by name + block + scene + tag/collection, with favorites. Persists metadata +
// the scanned summaries to localStorage. UI-agnostic: the Library screen binds to this; no rendering here.
import { z } from 'zod';
import { forgefx, isRemote } from './forgefx';
import { isRemoteBuild } from './cloudBrowser';
import { idb } from './idb';
import { notifyMutation } from './syncBus';
import type { PresetSummary, DecodedBlock } from './types';

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
   *  `local:<relPath>` for a preset in the configured local Presets/ folder. */
  id: string;
  source: 'device' | 'file' | 'local';
  summary: PresetSummary;
  fav: boolean;
  /** imported/local presets only: the folder they came from (for grouping/browsing). */
  folder?: string;
}

/** The FM3 names an uninitialized slot `<EMPTY>` — a valid CRC'd preset, so it must be filtered
 *  explicitly or it pollutes the library/search as a ghost entry. */
const isEmptyName = (name: string) => /^<empty>$/i.test(name.trim());

const LS = { tags: 'axs.lib.tags', collections: 'axs.lib.collections', favs: 'axs.lib.favs', cache: 'axs.lib.cache', built: 'axs.lib.built', files: 'axs.lib.files', folders: 'axs.lib.folders' };
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
// is ready for cloud sync. localStorage stays authoritative for reads → zero data-loss risk.
const persistCfg = (cfgId: 'tags' | 'collections' | 'favs', lsKey: string, v: unknown) => {
  persist(lsKey, v);
  forgefx.putDoc('config', cfgId, v).catch(() => {});
  notifyMutation(); // nudge debounced cloud auto-sync
};

// The device library index (512 preset summaries) is far too big for a plain config doc, so we gzip it to
// base64 before storing it in the `config/library` doc. The host pushes it after every scan; a remote web
// client pulls + gunzips it (over the relay) instead of re-scanning 512 presets over MIDI. CompressionStream
// is available in every browser + Electron we ship on.
async function gzipB64(obj: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const buf = await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
async function gunzipB64<T>(b64: string): Promise<T> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

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

  // filter state the UI binds to
  query = $state('');
  blockFilter = $state<string | null>(null); // block slug
  ampFilter = $state<string | null>(null); // amp model name (back-compat; amp-specific)
  modelFilter = $state<string | null>(null); // ANY block-family model name (amp/drive/cab/reverb/…)
  tagFilter = $state<string | null>(null);
  collectionFilter = $state<string | null>(null);
  favOnly = $state(false);
  /** Deep param-search clauses (ANDed). Only match entries whose params are available (files always;
   *  device entries after `hydrateParams`/`deepScan`). */
  paramQueries = $state<ParamQuery[]>([]);
  /** Hydrated device params, keyed by entry id. Persisted in IndexedDB (too big for localStorage) and
   *  loaded into memory on launch, so the param index survives reloads. */
  #paramsCache = $state<Record<string, DecodedBlock[]>>({});
  /** Raw .syx bytes for imported file/folder presets (id → byte array), so they load live to the edit
   *  buffer. Persisted in IndexedDB. */
  #fileBytes = $state<Record<string, number[]>>({});
  /** Folder paths the user has imported presets from (for the sidebar folder list). */
  folders = $state<string[]>([]);
  hydrating = $state(false);
  hydrateDone = $state(0);
  /** True once a full cache build has completed (persisted) — drives the startup prompt. */
  cacheBuilt = $state(load<boolean>(LS.built, false));

  constructor() {
    // restore the cached device scan so the library isn't empty on launch
    const favs = new Set(load<string[]>(LS.favs, []));
    const cached = (load<unknown[]>(LS.cache, []).filter((s) => summarySchema.safeParse(s).success) as PresetSummary[])
      .filter((s) => !isEmptyName(s.name)); // self-heal: drop ghost <EMPTY> entries from older caches
    const deviceEntries = cached.map((s) => ({ id: `dev:${s.number}`, source: 'device' as const, summary: s, fav: favs.has(`dev:${s.number}`) }));
    // restore imported file/folder presets (summaries in localStorage; raw bytes in IndexedDB for live load)
    const files = (load<{ id: string; folder?: string; summary: unknown }[]>(LS.files, [])
      .filter((f) => summarySchema.safeParse(f.summary).success)) as { id: string; folder?: string; summary: PresetSummary }[];
    const fileEntries = files.map((f) => ({ id: f.id, source: 'file' as const, summary: f.summary, fav: favs.has(f.id), folder: f.folder }));
    this.entries = [...deviceEntries, ...fileEntries].sort(this.#order);
    this.folders = load<string[]>(LS.folders, []);
    // Host: publish the existing device index to the cloud so remote clients get it without a re-scan.
    // (no-op in remote mode; debounced; idempotent.)
    if (deviceEntries.length) this.#pushIndex(cached.map((s) => ({ ...s, params: undefined })));
    // restore the heavy per-preset params from IndexedDB (async) so deep search works without a re-scan
    if (idb.available()) {
      idb.get<Record<string, DecodedBlock[]>>(IDB_PARAMS).then((p) => { if (p) this.#paramsCache = p; });
      idb.get<Record<string, number[]>>(IDB_FILEBYTES).then((b) => { if (b) this.#fileBytes = b; });
    }
    // Host: republish the local Axis config into the ONE config store on every launch, so the store always
    // reflects THIS PC — that's the source of truth the remote (and cloud sync) read. NEVER on the remote web
    // build: its localStorage is empty and (in dev) shares the host's ForgeFX, so publishing would clobber
    // the host's real config. The remote PULLS this config in hydrateRemoteConfig() instead.
    if (!isRemoteBuild() && typeof localStorage !== 'undefined') {
      const raw = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
      forgefx.putDoc('config', 'tags', this.tags).catch(() => {});
      forgefx.putDoc('config', 'collections', this.collections).catch(() => {});
      forgefx.putDoc('config', 'favs', load<string[]>(LS.favs, [])).catch(() => {});
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
    // Remote mode: scanning 512 full preset dumps over the relay (+ the host's slow link) is unusable —
    // that's the host's job. The remote browses via live queries; the library cache stays a local/host thing.
    if (isRemote()) { this.scanError = 'Library scan runs on your PC, not remotely.'; return; }
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
      const nameScan = v2 ? !!caps?.presets?.canScanNames && !caps?.presets?.canDeepScan : dev?.modelByte === '0x15';
      if (nameScan) {
        // API v2: unified GET /preset/locations; legacy v1 fallback: the AM4's own scan route.
        const locations = v2
          ? (await forgefx.presetLocations()).locations
          : (await forgefx.am4Presets()).presets;
        this.scanTotal = locations.length;
        for (const p of locations) {
          if (p.isEmpty || !p.name.trim()) continue;
          const id = `dev:${p.location}`;
          byId.set(id, {
            id,
            source: 'device',
            summary: { number: p.location, name: p.name, model: dev?.model ?? 'AM4', crcValid: true, scenes: [], blocks: [], models: {}, amps: [] },
            fav: byId.get(id)?.fav ?? false
          });
        }
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
          if (s.crcValid && s.name.trim() && !isEmptyName(s.name)) {
            const id = `dev:${n}`;
            if (s.params) { params[id] = s.params; delete s.params; } // params → idb; keep summary light
            byId.set(id, { id, source: 'device', summary: s, fav: byId.get(id)?.fav ?? false });
          }
        } catch {
          /* unreadable / empty slot — skip */
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
    if (isRemote()) return; // local folder lives on the host PC — hidden in remote sessions
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
  }
  /** Remove every preset imported from a folder. */
  removeFolder(folder: string): void {
    for (const e of this.entries) if (e.folder === folder) delete this.#fileBytes[e.id];
    this.entries = this.entries.filter((e) => e.folder !== folder);
    this.folders = this.folders.filter((f) => f !== folder);
    persist(LS.folders, this.folders);
    this.#persistFiles();
  }
  #persistFiles(): void {
    const files = this.entries.filter((e) => e.source === 'file').map((e) => ({ id: e.id, folder: e.folder, summary: e.summary }));
    persist(LS.files, files);
    if (idb.available()) idb.set(IDB_FILEBYTES, { ...this.#fileBytes });
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
  /** Hydrate every device entry's params so deep search spans the whole library; persisted to IndexedDB. */
  async deepScan(): Promise<void> {
    if (this.hydrating) return;
    this.hydrating = true;
    this.hydrateDone = 0;
    try {
      const todo = this.entries.filter((e) => e.source === 'device' && !e.summary.params && !this.#paramsCache[e.id]);
      for (const e of todo) {
        const { blocks } = await forgefx.presetParams(e.summary.number).catch(() => ({ blocks: null }));
        if (blocks) this.#paramsCache[e.id] = blocks;
        this.hydrateDone++;
      }
      this.#paramsCache = { ...this.#paramsCache };
      this.#persistParams();
    } finally {
      this.hydrating = false;
    }
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
      const rank = (s: LibEntry['source']) => (s === 'device' ? 0 : s === 'local' ? 1 : 2);
      return rank(a.source) - rank(b.source);
    }
    if (a.source === 'device') return a.summary.number - b.summary.number;
    if (a.source === 'local') return a.id.localeCompare(b.id); // path order (folders group naturally)
    return a.summary.name.localeCompare(b.summary.name);
  };
  #cacheDevice() {
    // summaries stay light in localStorage; the heavy `params` live in IndexedDB (IDB_PARAMS)
    const summaries = this.entries.filter((e) => e.source === 'device').map((e) => ({ ...e.summary, params: undefined }));
    persist(LS.cache, summaries);
    this.#pushIndex(summaries);
  }

  #pushIndexTimer: ReturnType<typeof setTimeout> | null = null;
  /** Mirror the device library index to the cloud (gzipped) so a remote web client gets it without a scan.
   *  Debounced + skipped in remote mode (the remote pulls this doc; it must never overwrite it). */
  #pushIndex(summaries: unknown[]): void {
    if (isRemoteBuild() || isRemote() || typeof CompressionStream === 'undefined') return;
    if (this.#pushIndexTimer) clearTimeout(this.#pushIndexTimer);
    this.#pushIndexTimer = setTimeout(() => {
      gzipB64(summaries)
        .then((gz) => forgefx.putDoc('config', 'library', { v: 1, n: summaries.length, gz }))
        .then(() => notifyMutation())
        .catch(() => {});
    }, 1500);
  }

  /** Remote/fresh web client: adopt the host's synced Axis config (pulled over the relay/cloud) so the
   *  remote shows the SAME tags, collections, favorites and preset library as the PC — instead of scanning
   *  512 presets over MIDI. Layouts + swipe/quick-actions are hydrated separately (their localStorage keys
   *  are written before editor.init()). */
  async hydrate(cfg: { tags?: unknown; collections?: unknown; favs?: unknown; index?: { gz?: string } | null }): Promise<void> {
    if (cfg.tags && typeof cfg.tags === 'object') { this.tags = cfg.tags as Record<string, string[]>; persist(LS.tags, this.tags); }
    if (cfg.collections && typeof cfg.collections === 'object') { this.collections = cfg.collections as Record<string, string[]>; persist(LS.collections, this.collections); }
    const favSet = new Set(Array.isArray(cfg.favs) ? (cfg.favs as string[]) : []);
    if (cfg.index?.gz && typeof DecompressionStream !== 'undefined') {
      try {
        const summaries = (await gunzipB64<unknown[]>(cfg.index.gz))
          .filter((s) => summarySchema.safeParse(s).success) as PresetSummary[];
        const device = summaries
          .filter((s) => !isEmptyName(s.name))
          .map((s) => ({ id: `dev:${s.number}`, source: 'device' as const, summary: s, fav: favSet.has(`dev:${s.number}`) }));
        this.entries = [...device, ...this.entries.filter((e) => e.source !== 'device')].sort(this.#order);
        this.cacheBuilt = true;
        persist(LS.built, true);
        this.#cacheDevice(); // keep locally; #pushIndex is a no-op in remote mode
      } catch { /* bad/absent index — leave the library empty rather than crash */ }
    }
    if (favSet.size) this.entries = this.entries.map((e) => ({ ...e, fav: favSet.has(e.id) })).sort(this.#order);
  }

  /** Apply a live config push from another UI (host↔remote), WITHOUT re-publishing (that would loop).
   *  Updates the in-memory state + the localStorage cache only. */
  applyRemoteConfig(id: string, data: unknown): void {
    if (id === 'tags' && data && typeof data === 'object') { this.tags = data as Record<string, string[]>; persist(LS.tags, this.tags); }
    else if (id === 'collections' && data && typeof data === 'object') { this.collections = data as Record<string, string[]>; persist(LS.collections, this.collections); }
    else if (id === 'favs' && Array.isArray(data)) {
      const s = new Set(data as string[]);
      this.entries = this.entries.map((e) => ({ ...e, fav: s.has(e.id) })).sort(this.#order);
      persist(LS.favs, data);
    }
  }
  /** Preset name for a device slot from the cache (for the quick picker). '' if not cached. */
  nameOfSlot = (n: number): string => this.entries.find((e) => e.source === 'device' && e.summary.number === n)?.summary.name ?? '';

  /** Re-read one device slot into the cache, keeping the index in sync with saves + external edits.
   *  CRC-gated: if the slot's content fingerprint matches the cached one, it's a no-op (no re-write). */
  async refreshSlot(n: number): Promise<void> {
    const id = `dev:${n}`;
    try {
      const s = await forgefx.presetSummary(n, true);
      const cached = this.entries.find((e) => e.id === id);
      // unchanged + already fully cached → nothing to do (skip the IndexedDB write + reactivity churn)
      if (cached && cached.summary.crc != null && cached.summary.crc === s.crc && this.#paramsCache[id]) return;
      const byId = new Map(this.entries.map((e) => [e.id, e] as const));
      if (s.crcValid && s.name.trim() && !isEmptyName(s.name)) {
        if (s.params) { this.#paramsCache = { ...this.#paramsCache, [id]: s.params }; delete s.params; this.#persistParams(); }
        byId.set(id, { id, source: 'device', summary: s, fav: byId.get(id)?.fav ?? false });
      } else {
        byId.delete(id); // slot was cleared/emptied (or holds the FM3 <EMPTY> sentinel)
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
  }
  removeTag(id: string, tag: string): void {
    if (!this.tags[id]) return;
    this.tags[id] = this.tags[id].filter((x) => x !== tag);
    if (!this.tags[id].length) delete this.tags[id];
    persistCfg('tags', LS.tags, this.tags);
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
}

export const library = new LibraryStore();
