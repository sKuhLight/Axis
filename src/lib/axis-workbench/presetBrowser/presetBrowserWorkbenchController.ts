import { parseAxisPresetBrowserPart, type AxisPresetBrowserPart, type AxisPresetBrowserSelection } from './types';
import { electAxisPbOwner } from './presetBrowserWorkbenchLayout';
import { condsToQuery, parseQuery, toAdvancedText, toSimpleConds, type AxisPbCond } from './presetBrowserWorkbenchQuery';

export type AxisPresetBrowserSort = 'num' | 'name' | 'cpu';

// Shared state across all mounted parts — the typed-controller replacement for `window.__PBBus`
// (§1 of docs/workbench-dc-parity/06-preset-browser.md). Every key here is in lockstep across
// list/sources/detail/full so a split layout behaves as one browser.
export interface AxisPresetBrowserControllerSnapshot extends AxisPresetBrowserSelection {
  activePart: AxisPresetBrowserPart;
  detailOpen: boolean;
  // query system (§2)
  advanced: boolean;
  query: string; // advanced typed query
  simpleQ: string; // simple free text
  conditions: AxisPbCond[]; // simple-mode chips
  // list part (§4)
  sort: AxisPresetBrowserSort;
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
    advanced: true,
    query: '',
    simpleQ: '',
    conditions: [],
    sort: 'num',
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

  // The conditions that actually filter the list right now: parsed from the typed query in advanced
  // mode, the chip list (plus any typed conditions) in simple mode.
  get activeConditions(): AxisPbCond[] {
    return this.#snapshot.advanced
      ? parseQuery(this.#snapshot.query)
      : [...this.#snapshot.conditions, ...parseQuery(this.#snapshot.simpleQ)];
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

  setQuery(query: string): void {
    this.#snapshot = { ...this.#snapshot, query };
    this.#emit();
  }

  setSimpleQuery(simpleQ: string): void {
    this.#snapshot = { ...this.#snapshot, simpleQ };
    this.#emit();
  }

  setConditions(conditions: AxisPbCond[]): void {
    // In advanced mode chip edits re-serialize back into the typed query (§2.5).
    this.#snapshot = this.#snapshot.advanced
      ? { ...this.#snapshot, query: condsToQuery(conditions) }
      : { ...this.#snapshot, conditions };
    this.#emit();
  }

  clearQuery(): void {
    this.#snapshot = { ...this.#snapshot, query: '', simpleQ: '', conditions: [] };
    this.#emit();
  }

  // Toggle advanced ↔ simple and convert the current state across the boundary (§2.1).
  toggleAdvanced(): void {
    const s = this.#snapshot;
    this.#snapshot = s.advanced
      ? { ...s, advanced: false, conditions: toSimpleConds(s.query), query: '' }
      : { ...s, advanced: true, query: toAdvancedText(s.conditions), conditions: [] };
    this.#emit();
  }

  // Apply a saved-filter query string: switch to advanced and load its text (§3.3).
  applyQueryText(text: string): void {
    this.#snapshot = { ...this.#snapshot, advanced: true, query: text, conditions: [] };
    this.#emit();
  }

  // Toggle a `tag:` condition (quick tags, §3.4). Works in both modes.
  toggleTag(tag: string): void {
    const has = this.activeConditions.some((c) => c.kind === 'tag' && c.val.toLowerCase() === tag.toLowerCase());
    const next = has
      ? this.activeConditions.filter((c) => !(c.kind === 'tag' && c.val.toLowerCase() === tag.toLowerCase()))
      : [...this.activeConditions, { kind: 'tag' as const, val: tag }];
    if (this.#snapshot.advanced) this.#snapshot = { ...this.#snapshot, query: condsToQuery(next) };
    else this.#snapshot = { ...this.#snapshot, conditions: next, simpleQ: '' };
    this.#emit();
  }

  // ===================== list part (§4) =====================

  setSort(sort: AxisPresetBrowserSort): void {
    this.#snapshot = { ...this.#snapshot, sort };
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
      conditions: [...this.#snapshot.conditions],
      marked: { ...this.#snapshot.marked }
    };
  }

  #emit(): void {
    const snapshot = this.snapshot;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

export const axisPresetBrowserWorkbenchController = new AxisPresetBrowserWorkbenchController();
