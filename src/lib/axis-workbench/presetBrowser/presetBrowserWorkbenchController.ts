import { parseAxisPresetBrowserPart, type AxisPresetBrowserPart, type AxisPresetBrowserSelection } from './types';
import { electAxisPbOwner } from './presetBrowserWorkbenchLayout';
import { condsToQuery, parseUnifiedQuery, serializeUnifiedQuery, type AxisPbCond } from './presetBrowserWorkbenchQuery';
import type { AxisPbPresenceView } from './presetBrowserWorkbenchPresence';

export type AxisPresetBrowserSort = 'num' | 'name' | 'cpu' | 'recent';
export type AxisPresetBrowserSortDir = 'asc' | 'desc';

// Each sort field's natural direction: switching fields resets the direction so the old
// default ordering (A-Z ascending, CPU high-first, RECENT newest-first) is preserved.
export const AXIS_PRESET_BROWSER_SORT_DEFAULTS: Record<AxisPresetBrowserSort, AxisPresetBrowserSortDir> = {
  num: 'asc',
  name: 'asc',
  cpu: 'desc',
  recent: 'desc'
};

// Shared state across all mounted parts — the typed-controller replacement for `window.__PBBus`
// (§1 of docs/workbench-dc-parity/06-preset-browser.md). Every key here is in lockstep across
// list/sources/detail/full so a split layout behaves as one browser.
export interface AxisPresetBrowserControllerSnapshot extends AxisPresetBrowserSelection {
  activePart: AxisPresetBrowserPart;
  detailOpen: boolean;
  // query system (§2) — one field. Structured filters parse only from `` `...` `` spans inside it
  // (see parseUnifiedQuery); everything else is free text. No mode to toggle.
  queryText: string;
  // library view (§3) — the sources sidebar's LIBRARY selection, shared across parts.
  presenceView: AxisPbPresenceView;
  // saved-filter inline-name affordance (§3.3) — the "Save filter" flow's open/name state.
  saving: boolean;
  // list part (§4)
  sort: AxisPresetBrowserSort;
  sortDir: AxisPresetBrowserSortDir;
  showAllRows: boolean;
  marked: Record<string, boolean>;
  anchorId: string | null;
  // owner election (§1) — which mounted part renders shared overlays
  owner: AxisPresetBrowserPart | null;
}

export interface AxisPresetBrowserWorkbenchHost {
  openSource?: (sourceId: string) => void | Promise<void>;
  selectEntry?: (entryId: string | null) => void | Promise<void>;
  focusBlock?: (effectId: number | null) => void | Promise<void>;
  openDetail?: (entryId: string | null) => void | Promise<void>;
  loadEntry?: (entryId: string) => void | Promise<void>;
}

export class AxisPresetBrowserWorkbenchController {
  #snapshot: AxisPresetBrowserControllerSnapshot = {
    activePart: 'full',
    sourceId: 'device',
    entryId: null,
    focusedBlockEffectId: null,
    detailOpen: false,
    queryText: '',
    presenceView: 'all',
    saving: false,
    sort: 'num',
    sortDir: 'asc',
    showAllRows: false,
    marked: {},
    anchorId: null,
    owner: null
  };

  #subscribers = new Set<(snapshot: AxisPresetBrowserControllerSnapshot) => void>();
  #host: AxisPresetBrowserWorkbenchHost | null = null;
  // parts currently mounted, in registration order, for owner election.
  #mounted = new Map<symbol, AxisPresetBrowserPart>();

  get snapshot(): AxisPresetBrowserControllerSnapshot {
    return this.#clone();
  }

  // The conditions that actually filter the list right now: parsed from the `` `...` `` spans in
  // queryText (see parseUnifiedQuery).
  get activeConditions(): AxisPbCond[] {
    return parseUnifiedQuery(this.#snapshot.queryText).conds;
  }

  // The free-text remainder of queryText (everything outside backtick spans) — feeds matchSimple.
  get freeText(): string {
    return parseUnifiedQuery(this.#snapshot.queryText).free;
  }

  bindHost(host: AxisPresetBrowserWorkbenchHost | null): () => void {
    this.#host = host;
    return () => {
      if (this.#host === host) this.#host = null;
    };
  }

  // Register a mounted part so the controller can elect the overlay owner. Returns an unregister fn.
  registerPart(part: AxisPresetBrowserPart): () => void {
    const token = Symbol('pb-part');
    this.#mounted.set(token, part);
    this.#reelectOwner();
    return () => {
      if (this.#mounted.delete(token)) this.#reelectOwner();
    };
  }

  // True when the given part currently owns the shared overlays (§1 rank rule).
  isOwner(part: AxisPresetBrowserPart): boolean {
    return this.#snapshot.owner === part;
  }

  setPart(part: AxisPresetBrowserPart | string): void {
    this.#snapshot = { ...this.#snapshot, activePart: parseAxisPresetBrowserPart(part) };
    this.#emit();
  }

  openSource(sourceId: string): void {
    this.#snapshot = {
      ...this.#snapshot,
      sourceId,
      entryId: null,
      focusedBlockEffectId: null,
      detailOpen: false
    };
    this.#emit();
    void this.#host?.openSource?.(sourceId);
  }

  selectEntry(entryId: string | null): void {
    this.#snapshot = {
      ...this.#snapshot,
      entryId,
      anchorId: entryId,
      focusedBlockEffectId: null,
      detailOpen: entryId != null
    };
    this.#emit();
    void this.#host?.selectEntry?.(entryId);
  }

  focusBlock(effectId: number | null): void {
    this.#snapshot = { ...this.#snapshot, focusedBlockEffectId: effectId };
    this.#emit();
    void this.#host?.focusBlock?.(effectId);
  }

  openDetail(entryId = this.#snapshot.entryId): void {
    this.#snapshot = {
      ...this.#snapshot,
      entryId,
      detailOpen: entryId != null
    };
    this.#emit();
    void this.#host?.openDetail?.(entryId);
  }

  closeDetail(): void {
    this.#snapshot = { ...this.#snapshot, detailOpen: false };
    this.#emit();
  }

  // ===================== query system (§2) =====================

  setQuery(queryText: string): void {
    this.#snapshot = { ...this.#snapshot, queryText };
    this.#emit();
  }

  clearQuery(): void {
    this.#snapshot = { ...this.#snapshot, queryText: '' };
    this.#emit();
  }

  // Edit the active conditions in place, then re-serialize them back into queryText, free text
  // preserved (§2.5, unified — verbatim in spirit from the monolith/pre-unification `editConds`).
  // Used by the FILTERS builder-chips, pickers, quick tags, and drag-into-filters.
  editConds(fn: (conds: AxisPbCond[]) => void): void {
    const { conds, free } = parseUnifiedQuery(this.#snapshot.queryText);
    const c = conds.map((x) => (x.kind === 'block' ? { ...x, params: x.params.map((p) => ({ ...p })) } : { ...x }));
    fn(c);
    this.#snapshot = { ...this.#snapshot, queryText: serializeUnifiedQuery(c, free) };
    this.#emit();
  }

  // Apply a saved-filter query string (§3.3): the stored text is condition-only (see
  // currentQueryText), so it always loads as a fresh backtick block — any free text the user had
  // typed is intentionally replaced, matching "apply this filter" rather than "add to my search".
  applyQueryText(text: string): void {
    this.#snapshot = { ...this.#snapshot, queryText: text.trim() ? `\`${text}\`` : '', saving: false };
    this.#emit();
  }

  // Toggle a `tag:` condition (quick tags, §3.4).
  toggleTag(tag: string): void {
    this.editConds((conds) => {
      const i = conds.findIndex((c) => c.kind === 'tag' && c.val.toLowerCase() === tag.toLowerCase());
      if (i >= 0) conds.splice(i, 1);
      else conds.push({ kind: 'tag', val: tag });
    });
  }

  // ===================== library view (§3) =====================

  // Select a LIBRARY view (All presets / On this device). Shared across parts so the list
  // filters and the sources highlight stay in lockstep.
  setPresenceView(view: AxisPbPresenceView): void {
    this.#snapshot = { ...this.#snapshot, presenceView: view };
    this.#emit();
  }

  // ===================== saved filters (§3.3) =====================

  // Open/close the inline "name this filter" input in the sources sidebar (triggered by the query bar's
  // "Save filter" button). The list of saved filters itself is persisted via the shared saved-filters
  // store (localStorage["axs.pb.saved"] + config mirror), not held in this shared snapshot.
  setSaving(saving: boolean): void {
    this.#snapshot = { ...this.#snapshot, saving };
    this.#emit();
  }

  // The current query text to save — condition-only, no backticks and no free text (§3.3), matching
  // the monolith's commitSave() and the AXIS_PB_SEED_SAVED_FILTERS format.
  currentQueryText(): string {
    return condsToQuery(this.activeConditions);
  }

  // ===================== list part (§4) =====================

  setSort(sort: AxisPresetBrowserSort): void {
    // Switching fields resets the direction to that field's natural default.
    this.#snapshot = { ...this.#snapshot, sort, sortDir: AXIS_PRESET_BROWSER_SORT_DEFAULTS[sort] };
    this.#emit();
  }

  setSortDir(sortDir: AxisPresetBrowserSortDir): void {
    this.#snapshot = { ...this.#snapshot, sortDir };
    this.#emit();
  }

  setShowAllRows(showAll: boolean): void {
    this.#snapshot = { ...this.#snapshot, showAllRows: showAll };
    this.#emit();
  }

  toggleMark(entryId: string): void {
    const marked = { ...this.#snapshot.marked };
    if (marked[entryId]) delete marked[entryId];
    else marked[entryId] = true;
    this.#snapshot = { ...this.#snapshot, marked, anchorId: entryId };
    this.#emit();
  }

  // Shift-click range: mark every id between the anchor and target in current display order (§4.4).
  markRange(order: string[], targetId: string): void {
    const anchor = this.#snapshot.anchorId ?? targetId;
    const a = order.indexOf(anchor);
    const b = order.indexOf(targetId);
    if (a < 0 || b < 0) {
      this.toggleMark(targetId);
      return;
    }
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const marked = { ...this.#snapshot.marked };
    for (let i = lo; i <= hi; i++) marked[order[i]] = true;
    this.#snapshot = { ...this.#snapshot, marked, anchorId: targetId };
    this.#emit();
  }

  clearMarks(): void {
    this.#snapshot = { ...this.#snapshot, marked: {} };
    this.#emit();
  }

  loadSelected(): boolean {
    const entryId = this.#snapshot.entryId;
    if (!entryId || !this.#host?.loadEntry) return false;
    void this.#host.loadEntry(entryId);
    return true;
  }

  subscribe(run: (snapshot: AxisPresetBrowserControllerSnapshot) => void): () => void {
    run(this.snapshot);
    this.#subscribers.add(run);
    return () => this.#subscribers.delete(run);
  }

  #reelectOwner(): void {
    const owner = electAxisPbOwner(this.#mounted.values());
    if (owner !== this.#snapshot.owner) {
      this.#snapshot = { ...this.#snapshot, owner };
      this.#emit();
    }
  }

  #clone(): AxisPresetBrowserControllerSnapshot {
    return {
      ...this.#snapshot,
      marked: { ...this.#snapshot.marked }
    };
  }

  #emit(): void {
    const snapshot = this.snapshot;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

export const axisPresetBrowserWorkbenchController = new AxisPresetBrowserWorkbenchController();
