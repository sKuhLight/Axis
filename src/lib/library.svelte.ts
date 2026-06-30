// Preset Library store — scan the device's presets (by number, non-disruptive) or import .syx files,
// then search/filter by name + block + scene + tag/collection, with favorites. Persists metadata +
// the scanned summaries to localStorage. UI-agnostic: the Library screen binds to this; no rendering here.
import { z } from 'zod';
import { forgefx } from './forgefx';
import { idb } from './idb';
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
  /** stable id: `dev:<n>` for a device preset slot, `file:<name>` for an imported .syx. */
  id: string;
  source: 'device' | 'file';
  summary: PresetSummary;
  fav: boolean;
}

const LS = { tags: 'axs.lib.tags', collections: 'axs.lib.collections', favs: 'axs.lib.favs', cache: 'axs.lib.cache', built: 'axs.lib.built' };
const IDB_PARAMS = 'lib.params'; // IndexedDB key for the per-preset param index (id → DecodedBlock[])
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
  hydrating = $state(false);
  hydrateDone = $state(0);
  /** True once a full cache build has completed (persisted) — drives the startup prompt. */
  cacheBuilt = $state(load<boolean>(LS.built, false));

  constructor() {
    // restore the cached device scan so the library isn't empty on launch
    const favs = new Set(load<string[]>(LS.favs, []));
    const cached = load<unknown[]>(LS.cache, []).filter((s) => summarySchema.safeParse(s).success) as PresetSummary[];
    this.entries = cached.map((s) => ({ id: `dev:${s.number}`, source: 'device' as const, summary: s, fav: favs.has(`dev:${s.number}`) }));
    // restore the heavy per-preset params from IndexedDB (async) so deep search works without a re-scan
    if (idb.available()) idb.get<Record<string, DecodedBlock[]>>(IDB_PARAMS).then((p) => { if (p) this.#paramsCache = p; });
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
      for (let n = from; n <= to; n++) {
        try {
          const s = await forgefx.presetSummary(n, true); // full=1 → summary + params in one dump
          if (s.crcValid && s.name.trim()) {
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

  // ── import .syx preset files (offline) ──
  async importFiles(files: Iterable<File>): Promise<{ ok: number; failed: number }> {
    const byId = new Map(this.entries.map((e) => [e.id, e] as const));
    let ok = 0;
    let failed = 0;
    for (const f of files) {
      try {
        const summary = await forgefx.decodePresetFile(await f.arrayBuffer());
        const id = `file:${f.name}`;
        byId.set(id, { id, source: 'file', summary: { ...summary, name: summary.name || f.name }, fav: byId.get(id)?.fav ?? false });
        ok++;
      } catch {
        failed++;
      }
    }
    this.entries = [...byId.values()].sort(this.#order);
    return { ok, failed };
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
  /** True once every entry the param filter could apply to has its params available. */
  paramsReady = $derived.by(() => this.entries.every((e) => e.source === 'file' || e.summary.params || this.#paramsCache[e.id]));

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
    if (a.source !== b.source) return a.source === 'device' ? -1 : 1;
    if (a.source === 'device') return a.summary.number - b.summary.number;
    return a.summary.name.localeCompare(b.summary.name);
  };
  #cacheDevice() {
    // summaries stay light in localStorage; the heavy `params` live in IndexedDB (IDB_PARAMS)
    persist(LS.cache, this.entries.filter((e) => e.source === 'device').map((e) => ({ ...e.summary, params: undefined })));
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
      if (s.crcValid && s.name.trim()) {
        if (s.params) { this.#paramsCache = { ...this.#paramsCache, [id]: s.params }; delete s.params; this.#persistParams(); }
        byId.set(id, { id, source: 'device', summary: s, fav: byId.get(id)?.fav ?? false });
      } else {
        byId.delete(id); // slot was cleared/emptied
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
    persist(LS.favs, this.entries.filter((x) => x.fav).map((x) => x.id));
  }
  addTag(id: string, tag: string): void {
    const t = tag.trim();
    if (!t) return;
    const cur = this.tags[id] ?? [];
    if (cur.includes(t)) return;
    this.tags[id] = [...cur, t];
    persist(LS.tags, this.tags);
  }
  removeTag(id: string, tag: string): void {
    if (!this.tags[id]) return;
    this.tags[id] = this.tags[id].filter((x) => x !== tag);
    if (!this.tags[id].length) delete this.tags[id];
    persist(LS.tags, this.tags);
  }
  createCollection(name: string): void {
    const n = name.trim();
    if (!n || this.collections[n]) return;
    this.collections[n] = [];
    persist(LS.collections, this.collections);
  }
  toggleInCollection(name: string, id: string): void {
    const list = this.collections[name];
    if (!list) return;
    this.collections[name] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    persist(LS.collections, this.collections);
  }
  deleteCollection(name: string): void {
    delete this.collections[name];
    if (this.collectionFilter === name) this.collectionFilter = null;
    persist(LS.collections, this.collections);
  }

  tagsOf = (id: string): string[] => this.tags[id] ?? [];
  inCollection = (name: string, id: string): boolean => (this.collections[name] ?? []).includes(id);
}

export const library = new LibraryStore();
