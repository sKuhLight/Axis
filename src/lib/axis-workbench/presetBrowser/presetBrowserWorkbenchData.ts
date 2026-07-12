export type AxisPresetBrowserSourceId = 'all' | 'device' | 'local' | 'file' | 'cloud' | string;

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
  blocks: AxisPresetBrowserBlockSummary[];
  /** Resolved cloud sync state (from cloud.stateOf via the host); 'none' when signed out. */
  syncState: SyncState;
  /** A synthesized cloud-only row (host id starts with `cloud:`). */
  cloudOnly: boolean;
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

export type AxisPresetBrowserSortMode = 'num' | 'name' | 'cpu';

export interface AxisPresetBrowserDataInput {
  entries: AxisPresetBrowserLibEntryLike[];
  filteredEntries?: AxisPresetBrowserLibEntryLike[];
  sourceId?: AxisPresetBrowserSourceId | null;
  selectedEntryId?: string | null;
  tagsOf?: (entryId: string) => string[];
  /** Advanced/simple query conditions to filter the visible list (§2, §4.1). */
  conditions?: AxisPbCond[];
  /** Simple-mode free text applied on top of conditions. */
  simpleQuery?: string;
  /** Result ordering (§4.1). Defaults to preset number. */
  sort?: AxisPresetBrowserSortMode;
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

const SOURCE_ORDER: AxisPresetBrowserSourceId[] = ['all', 'device', 'local', 'file', 'cloud'];

export function axisPresetBrowserSourceLabel(sourceId: AxisPresetBrowserSourceId): string {
  if (sourceId === 'all') return 'All Presets';
  if (sourceId === 'device') return 'Device';
  if (sourceId === 'local') return 'Local';
  if (sourceId === 'file') return 'Files';
  if (sourceId === 'cloud') return 'Cloud';
  return sourceId.replace(/[-_.]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeAxisPresetBrowserSourceId(sourceId: AxisPresetBrowserSourceId | null | undefined): AxisPresetBrowserSourceId {
  if (!sourceId) return 'all';
  if (sourceId === 'files') return 'file';
  return sourceId;
}

export function createAxisPresetBrowserDataView(input: AxisPresetBrowserDataInput): AxisPresetBrowserDataView {
  const activeSourceId = normalizeAxisPresetBrowserSourceId(input.sourceId);
  const syncStateOf = input.syncStateOf;
  const entries = input.entries.map((entry) => normalizeEntry(entry, input.tagsOf, syncStateOf));
  const filteredEntries = (input.filteredEntries ?? input.entries).map((entry) =>
    normalizeEntry(entry, input.tagsOf, syncStateOf)
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

  const byPresence =
    activePresenceView === 'all'
      ? bySource
      : bySource.filter((entry) => entryInPresenceView(toPresenceRow(entry), activePresenceView));

  const conditions = input.conditions ?? [];
  const simpleQuery = (input.simpleQuery ?? '').trim();
  const queried = conditions.length || simpleQuery
    ? byPresence.filter((entry) => matchPreset(matchEntryFromSummary(entry), conditions, simpleQuery))
    : byPresence;

  const visibleEntries = sortEntries(queried, input.sort ?? 'num');
  const order = visibleEntries.map((entry) => entry.id);
  const selectedEntry = entries.find((entry) => entry.id === input.selectedEntryId) ?? null;

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
  sort: AxisPresetBrowserSortMode
): AxisPresetBrowserEntrySummary[] {
  const list = entries.slice();
  if (sort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'cpu') {
    // higher CPU first — summary-level estimate mirrors query.estimateCpu (blockCount-derived).
    list.sort((a, b) => b.blockCount - a.blockCount);
  } else {
    list.sort((a, b) => (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY));
  }
  return list;
}

function normalizeEntry(
  entry: AxisPresetBrowserLibEntryLike,
  tagsOf?: (entryId: string) => string[],
  syncStateOf?: (entry: AxisPresetBrowserLibEntryLike) => SyncState
): AxisPresetBrowserEntrySummary {
  const blocks = entry.summary.blocks ?? [];
  const firstModel = entry.summary.model
    ?? entry.summary.amps?.[0]
    ?? Object.values(entry.summary.models ?? {}).flat()[0]
    ?? '';

  return {
    id: entry.id,
    sourceId: normalizeAxisPresetBrowserSourceId(entry.source),
    sourceLabel: axisPresetBrowserSourceLabel(entry.source),
    number: entry.summary.number ?? null,
    name: entry.summary.name?.trim() || 'Untitled Preset',
    model: firstModel,
    sceneCount: entry.summary.scenes?.length ?? 0,
    blockCount: blocks.length,
    fav: entry.fav === true,
    folder: entry.folder ?? null,
    tags: tagsOf?.(entry.id) ?? [],
    blocks,
    syncState: syncStateOf?.(entry) ?? 'none',
    cloudOnly: entry.id.startsWith('cloud:')
  };
}

function sourceSortIndex(sourceId: AxisPresetBrowserSourceId): number {
  const index = SOURCE_ORDER.indexOf(sourceId);
  return index === -1 ? SOURCE_ORDER.length : index;
}
