// Preset Library store — scan the device's presets (by number, non-disruptive) or import .syx files,
// then search/filter by name + block + scene + tag/collection, with favorites. Persists metadata +
// the scanned summaries to localStorage. UI-agnostic: the Library screen binds to this; no rendering here.
import { forgefx } from './forgefx';
import type { PresetSummary } from './types';

export interface LibEntry {
  /** stable id: `dev:<n>` for a device preset slot, `file:<name>` for an imported .syx. */
  id: string;
  source: 'device' | 'file';
  summary: PresetSummary;
  fav: boolean;
}

const LS = { tags: 'axs.lib.tags', collections: 'axs.lib.collections', favs: 'axs.lib.favs', cache: 'axs.lib.cache' };
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
  ampFilter = $state<string | null>(null); // amp model name
  tagFilter = $state<string | null>(null);
  collectionFilter = $state<string | null>(null);
  favOnly = $state(false);

  constructor() {
    // restore the cached device scan so the library isn't empty on launch
    const favs = new Set(load<string[]>(LS.favs, []));
    const cached = load<PresetSummary[]>(LS.cache, []);
    this.entries = cached.map((s) => ({ id: `dev:${s.number}`, source: 'device' as const, summary: s, fav: favs.has(`dev:${s.number}`) }));
  }

  // ── derived views (memoized) ──
  filtered = $derived.by(() => {
    const q = this.query.trim().toLowerCase();
    return this.entries.filter((e) => {
      if (this.favOnly && !e.fav) return false;
      if (this.blockFilter && !e.summary.blocks.some((b) => b.slug === this.blockFilter)) return false;
      if (this.ampFilter && !(e.summary.amps ?? []).includes(this.ampFilter)) return false;
      if (this.tagFilter && !(this.tags[e.id] ?? []).includes(this.tagFilter)) return false;
      if (this.collectionFilter && !(this.collections[this.collectionFilter] ?? []).includes(e.id)) return false;
      if (q) {
        const hay = `${e.summary.name} ${e.summary.scenes.join(' ')} ${e.summary.blocks.map((b) => b.name).join(' ')} ${(e.summary.amps ?? []).join(' ')}`.toLowerCase();
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
  allTags = $derived.by(() => {
    const s = new Set<string>();
    for (const ts of Object.values(this.tags)) for (const t of ts) s.add(t);
    return [...s].sort();
  });
  collectionNames = $derived.by(() => Object.keys(this.collections).sort());

  // ── device scan (non-disruptive; skips empty/invalid slots) ──
  async scanDevice(from = 0, to = 511): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this.scanError = null;
    this.scanDone = 0;
    this.scanTotal = to - from + 1;
    const byId = new Map(this.entries.map((e) => [e.id, e] as const));
    try {
      for (let n = from; n <= to; n++) {
        try {
          const s = await forgefx.presetSummary(n);
          if (s.crcValid && s.name.trim()) {
            const id = `dev:${n}`;
            byId.set(id, { id, source: 'device', summary: s, fav: byId.get(id)?.fav ?? false });
          }
        } catch {
          /* unreadable / empty slot — skip */
        }
        this.scanDone = n - from + 1;
        this.entries = [...byId.values()].sort(this.#order); // progressive: UI updates as it scans
      }
      this.#cacheDevice();
    } catch (e) {
      this.scanError = (e as Error).message;
    } finally {
      this.scanning = false;
    }
  }

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

  #order = (a: LibEntry, b: LibEntry) => {
    if (a.source !== b.source) return a.source === 'device' ? -1 : 1;
    if (a.source === 'device') return a.summary.number - b.summary.number;
    return a.summary.name.localeCompare(b.summary.name);
  };
  #cacheDevice() {
    persist(LS.cache, this.entries.filter((e) => e.source === 'device').map((e) => e.summary));
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
