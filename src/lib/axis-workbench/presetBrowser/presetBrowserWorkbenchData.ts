export type AxisPresetBrowserSourceId = 'all' | 'device' | 'local' | 'file' | 'cloud' | 'converted' | string;

export interface AxisPresetBrowserBlockSummary {
  effectId?: number | null;
  slug?: string | null;
  name?: string | null;
  instance?: number | null;
}

export interface AxisPresetBrowserLibEntryLike {
  id: string;
  source: AxisPresetBrowserSourceId;
  fav?: boolean;
  folder?: string;
  /** True for a synthesized cleared/empty device slot (not a real library entry). */
  empty?: boolean;
  /** `converted` entries only: the "FM3 → AM4" provenance line surfaced as a row chip. */
  provenance?: string | null;
  summary: {
    number?: number | null;
    name?: string | null;
    model?: string | null;
    scenes?: string[] | null;
    blocks?: AxisPresetBrowserBlockSummary[] | null;
    amps?: string[] | null;
    models?: Record<string, string[]> | null;
    /** Device-slot CRC — used to resolve cloud sync state via cloud.stateOf (§3). */
    crc?: number | null;
  };
}

export interface AxisPresetBrowserEntrySummary {
  id: string;
  sourceId: AxisPresetBrowserSourceId;
  sourceLabel: string;
  number: number | null;
  name: string;
  model: string;
  sceneCount: number;
  blockCount: number;
  fav: boolean;
  folder: string | null;
  tags: string[];
  /** Epoch ms of the last app-initiated load, or null if never loaded. */
  lastLoadedAt: number | null;
  blocks: AxisPresetBrowserBlockSummary[];
  /** Decoded per-family model names (e.g. { amp: ["5153 100W Blue"] }) — the source of truth for
   *  TYPE-style query matching; `blocks[].name` is only a generic roster instance label. */
  models: Record<string, string[]>;
  amps: string[];
  /** Resolved cloud sync state (from cloud.stateOf via the host); 'none' when signed out. */
  syncState: SyncState;
  /** A synthesized cloud-only row (host id starts with `cloud:`). */
  cloudOnly: boolean;
  /** A saved cross-device conversion (source 'converted') — hides device affordances, offers "Open in
   *  converter". */
  converted: boolean;
  /** Display provenance ("FM3 → AM4") for a converted entry; null for every other source. */
  provenance: string | null;
  /** A cleared/empty device slot synthesized as a muted, loadable row. */
  empty?: boolean;
}

export interface AxisPresetBrowserSourceSummary {
  id: AxisPresetBrowserSourceId;
  label: string;
  count: number;
}

export interface AxisPresetBrowserDataView {
  sources: AxisPresetBrowserSourceSummary[];
  entries: AxisPresetBrowserEntrySummary[];
  visibleEntries: AxisPresetBrowserEntrySummary[];
  selectedEntry: AxisPresetBrowserEntrySummary | null;
  activeSourceId: AxisPresetBrowserSourceId;
  /** Cloud-presence views with live counts for the sources sidebar (§3). */
  presenceViews: AxisPresetBrowserPresenceViewSummary[];
  /** The active presence view (§3). */
  activePresenceView: AxisPbPresenceView;
  /** Ordered list of visible entry ids — the display order shift-click range uses (§4.4). */
  order: string[];
}

export type AxisPresetBrowserSortMode = 'num' | 'name' | 'cpu' | 'recent';
export type AxisPresetBrowserSortDir = 'asc' | 'desc';

// Natural direction per field, so omitting `sortDir` preserves the historical ordering (A-Z ascending,
// CPU high-first, RECENT newest-first).
const SORT_DIR_DEFAULTS: Record<AxisPresetBrowserSortMode, AxisPresetBrowserSortDir> = {
  num: 'asc',
  name: 'asc',
  cpu: 'desc',
  recent: 'desc'
};

export interface AxisPresetBrowserDataInput {
  entries: AxisPresetBrowserLibEntryLike[];
  filteredEntries?: AxisPresetBrowserLibEntryLike[];
  /** Cleared/empty device slots synthesized by the host. Injected into the visible list only when the
   *  active source is 'device' (never counted in `entries`/`sources`/presence totals). */
  emptySlots?: AxisPresetBrowserLibEntryLike[];
  sourceId?: AxisPresetBrowserSourceId | null;
  selectedEntryId?: string | null;
  tagsOf?: (entryId: string) => string[];
  /** Epoch ms of the entry's last load, for the 'recent' sort (§4.1). Host reads the recency store. */
  lastLoadedAt?: (entryId: string) => number | null;
  /** Advanced/simple query conditions to filter the visible list (§2, §4.1). */
  conditions?: AxisPbCond[];
  /** Simple-mode free text applied on top of conditions. */
  simpleQuery?: string;
  /** Result ordering (§4.1). Defaults to preset number. */
  sort?: AxisPresetBrowserSortMode;
  /** Result direction (§4.1). 'asc' unless overridden; CPU/RECENT naturally sort descending. */
  sortDir?: AxisPresetBrowserSortDir;
  /** Resolve an entry's cloud sync state (host reads the reactive cloud store). Defaults to 'none'. */
  syncStateOf?: (entry: AxisPresetBrowserLibEntryLike) => SyncState;
  /** Active cloud-presence view (§3). When set (and not 'all'), the list is filtered by it. */
  presenceView?: AxisPbPresenceView;
  /** Per-view counts (respecting the presence filter) for the sources sidebar. */
  presenceViews?: AxisPbPresenceViewDef[];
}

export interface AxisPresetBrowserPresenceViewSummary extends AxisPbPresenceViewDef {
  count: number;
}

import { matchEntryFromSummary, matchPreset, type AxisPbCond } from './presetBrowserWorkbenchQuery';
import type { SyncState } from '../../types';
import {
  AXIS_PB_PRESENCE_VIEWS,
  entryInPresenceView,
  presenceViewCount,
  type AxisPbPresenceRow,
  type AxisPbPresenceView,
  type AxisPbPresenceViewDef
} from './presetBrowserWorkbenchPresence';

const SOURCE_ORDER: AxisPresetBrowserSourceId[] = ['all', 'device', 'local', 'file', 'cloud', 'converted'];

export function axisPresetBrowserSourceLabel(sourceId: AxisPresetBrowserSourceId): string {
  if (sourceId === 'all') return 'All Presets';
  if (sourceId === 'device') return 'Device';
  if (sourceId === 'local') return 'Local';
  if (sourceId === 'file') return 'Files';
  if (sourceId === 'cloud') return 'Cloud';
  if (sourceId === 'converted') return 'Converted';
  return sourceId.replace(/[-_.]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeAxisPresetBrowserSourceId(sourceId: AxisPresetBrowserSourceId | null | undefined): AxisPresetBrowserSourceId {
  if (!sourceId) return 'all';
  if (sourceId === 'files') return 'file';
  return sourceId;
}

/** Build synthesized `<EMPTY>` slot entries for every device slot `isEmpty` reports as cleared. */
export function buildEmptyDeviceSlotEntries(
  count: number,
  isEmpty: (number: number) => boolean
): AxisPresetBrowserLibEntryLike[] {
  const out: AxisPresetBrowserLibEntryLike[] = [];
  for (let n = 0; n < count; n++) {
    if (!isEmpty(n)) continue;
    out.push({
      id: `dev:${n}`,
      source: 'device',
      empty: true,
      summary: { number: n, name: '<EMPTY>', scenes: [], blocks: [], amps: [], models: {}, crc: null }
    });
  }
  return out;
}

export function createAxisPresetBrowserDataView(input: AxisPresetBrowserDataInput): AxisPresetBrowserDataView {
  const activeSourceId = normalizeAxisPresetBrowserSourceId(input.sourceId);
  const syncStateOf = input.syncStateOf;
  const lastLoadedAt = input.lastLoadedAt;
  const entries = input.entries.map((entry) => normalizeEntry(entry, input.tagsOf, syncStateOf, lastLoadedAt));
  const filteredEntries = (input.filteredEntries ?? input.entries).map((entry) =>
    normalizeEntry(entry, input.tagsOf, syncStateOf, lastLoadedAt)
  );
  const emptySlots = (input.emptySlots ?? []).map((entry) =>
    normalizeEntry(entry, input.tagsOf, syncStateOf, lastLoadedAt)
  );
  const counts = new Map<AxisPresetBrowserSourceId, number>([['all', entries.length]]);

  for (const entry of entries) {
    counts.set(entry.sourceId, (counts.get(entry.sourceId) ?? 0) + 1);
  }

  const sourceIds = new Set<AxisPresetBrowserSourceId>(SOURCE_ORDER);
  for (const entry of entries) sourceIds.add(entry.sourceId);

  const sources = [...sourceIds]
    .sort((a, b) => sourceSortIndex(a) - sourceSortIndex(b) || axisPresetBrowserSourceLabel(a).localeCompare(axisPresetBrowserSourceLabel(b)))
    .map((id) => ({ id, label: axisPresetBrowserSourceLabel(id), count: counts.get(id) ?? 0 }));

  // Presence-view counts (§3) run over the full entry set (only device-filter/deletions would trim it,
  // handled upstream) so the sidebar shows the honest totals; the design shows counts regardless of the
  // active source/query. Signed-out (no syncStateOf) leaves cloud views at count 0.
  const presenceRows: AxisPbPresenceRow[] = entries.map(toPresenceRow);
  const presenceDefs = input.presenceViews ?? AXIS_PB_PRESENCE_VIEWS;
  const presenceViews = presenceDefs.map((def) => ({ ...def, count: presenceViewCount(presenceRows, def.id) }));
  const activePresenceView: AxisPbPresenceView = input.presenceView ?? 'all';

  const bySource = activeSourceId === 'all'
    ? filteredEntries
    : filteredEntries.filter((entry) => entry.sourceId === activeSourceId);

  // Empty slots render ONLY in the device view (they are device slots, not real entries), injected after
  // the source filter but before presence/query/sort so they respect search + slot-number sort.
  const withEmpty = activeSourceId === 'device' ? [...bySource, ...emptySlots] : bySource;

  const byPresence =
    activePresenceView === 'all'
      ? withEmpty
      : withEmpty.filter((entry) => entryInPresenceView(toPresenceRow(entry), activePresenceView));

  const conditions = input.conditions ?? [];
  const simpleQuery = (input.simpleQuery ?? '').trim();
  const queried = conditions.length || simpleQuery
    ? byPresence.filter((entry) => matchPreset(matchEntryFromSummary(entry), conditions, simpleQuery))
    : byPresence;

  const sortMode = input.sort ?? 'num';
  const visibleEntries = sortEntries(queried, sortMode, input.sortDir ?? SORT_DIR_DEFAULTS[sortMode]);
  const order = visibleEntries.map((entry) => entry.id);
  const selectedEntry = [...entries, ...emptySlots].find((entry) => entry.id === input.selectedEntryId) ?? null;

  return {
    sources,
    entries,
    visibleEntries,
    selectedEntry,
    activeSourceId,
    presenceViews,
    activePresenceView,
    order
  };
}

function toPresenceRow(entry: AxisPresetBrowserEntrySummary): AxisPbPresenceRow {
  return { source: entry.sourceId, cloudOnly: entry.cloudOnly, syncState: entry.syncState };
}

function sortEntries(
  entries: AxisPresetBrowserEntrySummary[],
  sort: AxisPresetBrowserSortMode,
  dir: AxisPresetBrowserSortDir
): AxisPresetBrowserEntrySummary[] {
  const list = entries.slice();
  const desc = dir === 'desc';
  if (sort === 'name') {
    list.sort((a, b) => (desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
  } else if (sort === 'cpu') {
    // higher CPU first by default — summary-level estimate mirrors query.estimateCpu (blockCount-derived).
    list.sort((a, b) => (desc ? b.blockCount - a.blockCount : a.blockCount - b.blockCount));
  } else if (sort === 'recent') {
    // Primary key is the recency stamp (flipped by direction); the number tiebreak stays ASCENDING in
    // both directions so the never-loaded bucket keeps stable slot order (pins the e2e ordering contract).
    // `?? 0` rather than -Infinity: every real stamp is a positive epoch, and Infinity - Infinity
    // would yield NaN for two never-loaded entries.
    list.sort((a, b) => {
      const primary = desc
        ? (b.lastLoadedAt ?? 0) - (a.lastLoadedAt ?? 0)
        : (a.lastLoadedAt ?? 0) - (b.lastLoadedAt ?? 0);
      return primary || (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY);
    });
  } else {
    // Slot-less entries (no number) always sink below numbered ones in BOTH directions — the `+Infinity`
    // sentinel only works for ascending, so the null case is handled explicitly here.
    list.sort((a, b) => {
      const an = a.number;
      const bn = b.number;
      if (an == null && bn == null) return 0;
      if (an == null) return 1;
      if (bn == null) return -1;
      return desc ? bn - an : an - bn;
    });
  }
  return list;
}

function normalizeEntry(
  entry: AxisPresetBrowserLibEntryLike,
  tagsOf?: (entryId: string) => string[],
  syncStateOf?: (entry: AxisPresetBrowserLibEntryLike) => SyncState,
  lastLoadedAt?: (entryId: string) => number | null
): AxisPresetBrowserEntrySummary {
  const blocks = entry.summary.blocks ?? [];
  const firstModel = entry.summary.model
    ?? entry.summary.amps?.[0]
    ?? Object.values(entry.summary.models ?? {}).flat()[0]
    ?? '';
  const sourceId = normalizeAxisPresetBrowserSourceId(entry.source);
  const converted = sourceId === 'converted';
  const empty = entry.empty === true;
  const rawNumber = entry.summary.number ?? null;
  // A converted entry's `number` is its chosen slot; a free-form/unset slot (< 0) shows the source label
  // ("Converted"), never a bogus numeric slot.
  const number = converted ? (rawNumber != null && rawNumber >= 0 ? rawNumber : null) : rawNumber;

  return {
    id: entry.id,
    sourceId,
    sourceLabel: axisPresetBrowserSourceLabel(entry.source),
    number,
    name: entry.summary.name?.trim() || 'Untitled Preset',
    model: firstModel,
    sceneCount: entry.summary.scenes?.length ?? 0,
    blockCount: blocks.length,
    fav: entry.fav === true,
    folder: entry.folder ?? null,
    tags: empty ? [] : (tagsOf?.(entry.id) ?? []),
    lastLoadedAt: lastLoadedAt?.(entry.id) ?? null,
    blocks,
    models: entry.summary.models ?? {},
    amps: entry.summary.amps ?? [],
    syncState: empty ? 'none' : (syncStateOf?.(entry) ?? 'none'),
    cloudOnly: empty ? false : entry.id.startsWith('cloud:'),
    converted,
    provenance: entry.provenance ?? null,
    empty
  };
}

function sourceSortIndex(sourceId: AxisPresetBrowserSourceId): number {
  const index = SOURCE_ORDER.indexOf(sourceId);
  return index === -1 ? SOURCE_ORDER.length : index;
}
