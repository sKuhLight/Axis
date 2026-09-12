import {
  buildEmptyDeviceSlotEntries,
  createAxisPresetBrowserDataView,
  shouldSynthesizeEmptyDeviceSlots,
  type AxisPbPreparedEntry,
  type AxisPresetBrowserDataView,
  type AxisPresetBrowserEntrySummary,
  type AxisPresetBrowserLibEntryLike
} from './presetBrowserWorkbenchData';
import type {
  AxisPresetBrowserControllerSnapshot,
  AxisPresetBrowserSort,
  AxisPresetBrowserWorkbenchController
} from './presetBrowserWorkbenchController';
import type { AxisPresetBrowserWorkbenchRuntime } from './presetBrowserWorkbenchRuntime';
import type { AxisPbCond } from './presetBrowserWorkbenchQuery';
import type { AxisPbPresenceViewDef } from './presetBrowserWorkbenchPresence';
import { applyRowCap, type AxisPbRowCap } from './presetBrowserWorkbenchLayout';
import { resolvePresetLoadAction } from './presetBrowserWorkbenchLoadAction';
import {
  addSavedFilter,
  removeSavedFilter,
  type AxisPbSavedFilter
} from './presetBrowserWorkbenchSavedFilters';

export interface AxisPresetBrowserViewModelHost {
  get entries(): AxisPresetBrowserLibEntryLike[];
  get filteredEntries(): AxisPresetBrowserLibEntryLike[];
  get cacheBuilt(): boolean;
  get connectionState(): string;
  get presetCount(): number;
  get canRenamePresets(): boolean;
  tagsOf(entryId: string): string[];
  lastLoadedAt(entryId: string): number | null;
  realNameFor(slug: string, model: string): string;
  selectPreset(number: number, options?: { recency?: boolean }): unknown;
  renameStoredPreset(number: number, name: string): unknown;
  persistSavedFilters(filters: AxisPbSavedFilter[]): void;
  openConverted(entryId: string): void;
}

export interface AxisPresetBrowserViewModelOptions {
  controller: AxisPresetBrowserWorkbenchController;
  runtime: AxisPresetBrowserWorkbenchRuntime;
  host: AxisPresetBrowserViewModelHost;
  presenceViews: AxisPbPresenceViewDef[];
  prepared?: () => Map<string, AxisPbPreparedEntry>;
  deviceSlots?: () => Set<number>;
}

export class AxisPresetBrowserViewModel {
  readonly #controller: AxisPresetBrowserWorkbenchController;
  readonly #runtime: AxisPresetBrowserWorkbenchRuntime;
  readonly #host: AxisPresetBrowserViewModelHost;
  readonly #presenceViews: AxisPbPresenceViewDef[];
  readonly #prepared?: () => Map<string, AxisPbPreparedEntry>;
  readonly #deviceSlots?: () => Set<number>;

  constructor(options: AxisPresetBrowserViewModelOptions) {
    this.#controller = options.controller;
    this.#runtime = options.runtime;
    this.#host = options.host;
    this.#presenceViews = options.presenceViews;
    this.#prepared = options.prepared;
    this.#deviceSlots = options.deviceSlots;
  }

  data(snapshot: AxisPresetBrowserControllerSnapshot = this.#controller.snapshot): AxisPresetBrowserDataView {
    const entries = this.#host.entries;
    const slots = this.#deviceSlots?.() ?? new Set(
      entries
        .filter((entry) => entry.source === 'device' && entry.summary.number != null)
        .map((entry) => entry.summary.number as number)
    );
    const emptySlots = shouldSynthesizeEmptyDeviceSlots(this.#host.cacheBuilt, this.#host.connectionState)
      ? buildEmptyDeviceSlotEntries(this.#host.presetCount, (number) => !slots.has(number))
      : [];
    return createAxisPresetBrowserDataView({
      entries,
      filteredEntries: snapshot.presenceView === 'all' ? this.#host.filteredEntries : entries,
      emptySlots,
      sourceId: snapshot.sourceId,
      selectedEntryId: snapshot.entryId,
      tagsOf: this.#host.tagsOf,
      lastLoadedAt: this.#host.lastLoadedAt,
      conditions: this.#controller.activeConditions,
      simpleQuery: this.#controller.freeText,
      realNameFor: this.#host.realNameFor,
      prepared: this.#prepared?.(),
      sort: snapshot.sort,
      sortDir: snapshot.sortDir,
      presenceView: snapshot.presenceView,
      presenceViews: this.#presenceViews
    });
  }

  rowCap(snapshot: AxisPresetBrowserControllerSnapshot = this.#controller.snapshot): AxisPbRowCap<AxisPresetBrowserEntrySummary> {
    return applyRowCap(this.data(snapshot).visibleEntries, snapshot.showAllRows);
  }

  select(entry: AxisPresetBrowserEntrySummary): void {
    this.#controller.selectEntry(entry.id);
  }

  toggleMark(entry: AxisPresetBrowserEntrySummary): void {
    this.#controller.toggleMark(entry.id);
  }

  markRange(entry: AxisPresetBrowserEntrySummary, order: string[]): void {
    this.#controller.markRange(order, entry.id);
  }

  setQuery(query: string): void {
    this.#controller.setQuery(query);
  }

  editConditions(edit: (conditions: AxisPbCond[]) => void): void {
    this.#controller.editConds(edit);
  }

  applySavedFilter(filter: AxisPbSavedFilter): void {
    this.#controller.applyQueryText(filter.query);
  }

  saveFilter(filters: AxisPbSavedFilter[], name: string): AxisPbSavedFilter[] {
    const trimmed = name.trim();
    if (!trimmed) {
      this.#controller.setSaving(false);
      return filters;
    }
    const next = addSavedFilter(filters, trimmed, this.#controller.currentQueryText());
    this.#host.persistSavedFilters(next);
    this.#controller.setSaving(false);
    return next;
  }

  deleteSavedFilter(filters: AxisPbSavedFilter[], id: string): AxisPbSavedFilter[] {
    const next = removeSavedFilter(filters, id);
    this.#host.persistSavedFilters(next);
    return next;
  }

  toggleSort(key: AxisPresetBrowserSort, snapshot: AxisPresetBrowserControllerSnapshot = this.#controller.snapshot): void {
    if (snapshot.sort === key) {
      this.#controller.setSortDir(snapshot.sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      this.#controller.setSort(key);
    }
  }

  canRename(entry: AxisPresetBrowserEntrySummary): boolean {
    return this.#host.canRenamePresets && entry.sourceId === 'device' && !entry.empty && (entry.number ?? -1) >= 0;
  }

  rename(entry: AxisPresetBrowserEntrySummary, name: string): boolean {
    const next = name.trim();
    if (!this.canRename(entry) || !next || next === entry.name || entry.number == null) return false;
    void this.#host.renameStoredPreset(entry.number, next);
    return true;
  }

  load(entry: AxisPresetBrowserEntrySummary): void {
    this.#controller.selectEntry(entry.id);
    const action = resolvePresetLoadAction(entry);
    if (action.kind === 'openConverter') this.#host.openConverted(entry.id);
    else if (action.kind === 'loadEmptySlot') void this.#host.selectPreset(action.number, { recency: false });
    else void this.#runtime.loadEntry(entry.id);
  }
}
