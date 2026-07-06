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
}

import { matchEntryFromSummary, matchPreset, type AxisPbCond } from './presetBrowserWorkbenchQuery';

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
  const entries = input.entries.map((entry) => normalizeEntry(entry, input.tagsOf));
  const filteredEntries = (input.filteredEntries ?? input.entries).map((entry) => normalizeEntry(entry, input.tagsOf));
  const counts = new Map<AxisPresetBrowserSourceId, number>([['all', entries.length]]);

  for (const entry of entries) {
    counts.set(entry.sourceId, (counts.get(entry.sourceId) ?? 0) + 1);
  }

  const sourceIds = new Set<AxisPresetBrowserSourceId>(SOURCE_ORDER);
  for (const entry of entries) sourceIds.add(entry.sourceId);

  const sources = [...sourceIds]
    .sort((a, b) => sourceSortIndex(a) - sourceSortIndex(b) || axisPresetBrowserSourceLabel(a).localeCompare(axisPresetBrowserSourceLabel(b)))
    .map((id) => ({ id, label: axisPresetBrowserSourceLabel(id), count: counts.get(id) ?? 0 }));

  const bySource = activeSourceId === 'all'
    ? filteredEntries
    : filteredEntries.filter((entry) => entry.sourceId === activeSourceId);

  const conditions = input.conditions ?? [];
  const simpleQuery = (input.simpleQuery ?? '').trim();
  const queried = conditions.length || simpleQuery
    ? bySource.filter((entry) => matchPreset(matchEntryFromSummary(entry), conditions, simpleQuery))
    : bySource;

  const visibleEntries = sortEntries(queried, input.sort ?? 'num');
  const order = visibleEntries.map((entry) => entry.id);
  const selectedEntry = entries.find((entry) => entry.id === input.selectedEntryId) ?? null;

  return {
    sources,
    entries,
    visibleEntries,
    selectedEntry,
    activeSourceId,
    order
  };
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

function normalizeEntry(entry: AxisPresetBrowserLibEntryLike, tagsOf?: (entryId: string) => string[]): AxisPresetBrowserEntrySummary {
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
    blocks
  };
}

function sourceSortIndex(sourceId: AxisPresetBrowserSourceId): number {
  const index = SOURCE_ORDER.indexOf(sourceId);
  return index === -1 ? SOURCE_ORDER.length : index;
}
