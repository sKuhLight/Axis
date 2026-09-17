import type {
  AxisPresetBrowserBlockSummary,
  AxisPresetBrowserLibEntryLike
} from './presetBrowserWorkbenchData';
import {
  resolveAxisPbMoveBatch,
  type AxisPbMoveFailure,
  type AxisPbMoveStep,
  type AxisPbMoveWrite
} from './presetBrowserWorkbenchMove';
import { createAxisRuntimeHostStack } from '../runtimeHostStack';

/** Human-readable reason a move was refused before any device write. */
function moveFailureMessage(reason: AxisPbMoveFailure): string {
  switch (reason) {
    case 'empty-selection': return 'Select at least one preset to move';
    case 'not-contiguous': return 'A move needs a contiguous run of slots';
    case 'selection-out-of-range': return 'That selection is outside the device slots';
    case 'destination-out-of-range': return 'That destination is outside the device slots';
    case 'conflicting-moves': return 'Two staged moves use the same slot - remove one';
  }
}

export interface AxisPresetBrowserVersionLike {
  id: string;
  name?: string;
  location?: number;
  createdAt?: number;
}

export interface AxisPresetBrowserGridLike {
  scenes?: string[];
  cells?: unknown[];
  shunts?: unknown[];
}

export interface AxisPresetBrowserRuntimeHost {
  findEntry: (entryId: string) => AxisPresetBrowserLibEntryLike | null;
  fileBytes?: (entryId: string) => Uint8Array | null;
  localPath?: (entryId: string) => string;
  loadBytes?: (bytes: ArrayBuffer | Uint8Array) => Promise<void>;
  /** Store the CURRENT edit buffer to an explicit device slot — the browser's "Save to device…". */
  saveBufferToSlot?: (slot: number) => Promise<boolean>;
  loadDeviceSlot?: (presetNumber: number) => Promise<void>;
  deviceEntryBytes?: (presetNumber: number) => Promise<ArrayBuffer>;
  localPresetFile?: (path: string) => Promise<ArrayBuffer>;
  openBuild?: () => void;
  reloadEditor?: () => Promise<void>;
  noteBufferReplaced?: (label: string) => void;
  /** Mark the edit buffer as an in-progress audition (drives the Save chip's AUDITIONING state). */
  markAudition?: (name: string) => void;
  setBufferSource?: (source: { path: string; name: string } | null) => void;
  hydrateParams?: (entryId: string) => Promise<void>;
  paramsOf?: (entry: AxisPresetBrowserLibEntryLike) => AxisPresetBrowserBlockSummary[] | null;
  /** Cab IR names per bank, for resolving a browsed Cab's slot names (`GET /cab/irs`, cached). */
  cabIrs?: () => Promise<Record<string, string[]>>;
  presetGrid?: (presetNumber: number) => Promise<AxisPresetBrowserGridLike>;
  versions?: (presetNumber: number) => Promise<AxisPresetBrowserVersionLike[]>;
  notify?: (message: string, accent?: string) => void;
  /** Stamp a successful load for the Recent sort. Host-injected so the runtime stays app-free. */
  recordLoad?: (entryId: string) => void;
  /** Apply a resolved slot permutation on the device (snapshot-first server-side; rolls back on
   *  failure). The host fills in the active slot to restore. */
  applyPresetMove?: (writes: AxisPbMoveWrite[], opts: { slotCount: number }) => Promise<void>;
  /** Device slot occupancy, so the plan can report which destinations end up empty. */
  isSlotEmpty?: (slot: number) => boolean;
  /** Re-read affected device slots into the library cache after a move. */
  refreshDeviceSlots?: (slots: number[]) => Promise<void>;
}

export interface AxisPresetBrowserDetailState {
  entryId: string;
  paramsLoaded: boolean;
  gridLoaded: boolean;
  versionsLoaded: boolean;
  blockCount: number;
  grid: AxisPresetBrowserGridLike | null;
  versions: AxisPresetBrowserVersionLike[];
}

export interface AxisPresetBrowserRuntimeSnapshot {
  loadingEntryId: string | null;
  auditioningEntryId: string | null;
  hydratingEntryId: string | null;
  /** True while a block move is being applied on the device. */
  moving: boolean;
  error: string | null;
  lastLoadedEntryId: string | null;
  lastAuditionedEntryId: string | null;
  details: Record<string, AxisPresetBrowserDetailState>;
  /** Cab IR names per bank once fetched; null until `ensureCabIrs` resolves (or when unavailable). */
  cabIrs: Record<string, string[]> | null;
}

export class AxisPresetBrowserWorkbenchRuntime {
  #hosts = createAxisRuntimeHostStack<AxisPresetBrowserRuntimeHost>();
  #snapshot: AxisPresetBrowserRuntimeSnapshot = {
    loadingEntryId: null,
    auditioningEntryId: null,
    hydratingEntryId: null,
    moving: false,
    error: null,
    lastLoadedEntryId: null,
    lastAuditionedEntryId: null,
    details: {},
    cabIrs: null
  };
  #subscribers = new Set<(snapshot: AxisPresetBrowserRuntimeSnapshot) => void>();
  #detailLoads = new Map<string, Promise<AxisPresetBrowserDetailState | null>>();
  #cabIrsLoad: Promise<void> | null = null;

  get snapshot(): AxisPresetBrowserRuntimeSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  bindHost(host: AxisPresetBrowserRuntimeHost | null): () => void {
    return this.#hosts.bind(host);
  }

  /** Resolve the Cab IR catalog once so a browsed Cab's slot names can render. Idempotent and
   *  best-effort: on failure the cards fall back to the IR ordinal (`#n`) instead of a name. */
  ensureCabIrs(): Promise<void> {
    if (this.#snapshot.cabIrs) return Promise.resolve();
    if (this.#cabIrsLoad) return this.#cabIrsLoad;
    const load = this.#hosts.current?.cabIrs;
    if (!load) return Promise.resolve();
    this.#cabIrsLoad = load()
      .then((irs) => this.#set({ cabIrs: irs }))
      .catch(() => {})
      .finally(() => (this.#cabIrsLoad = null));
    return this.#cabIrsLoad;
  }

  subscribe(run: (snapshot: AxisPresetBrowserRuntimeSnapshot) => void): () => void {
    run(this.snapshot);
    this.#subscribers.add(run);
    return () => this.#subscribers.delete(run);
  }

  async loadEntry(entryId: string): Promise<boolean> {
    const entry = this.#entry(entryId);
    if (!entry) return false;
    this.#set({ loadingEntryId: entryId, error: null });
    const host = this.#hosts.current!;
    host.openBuild?.();

    try {
      if (entry.source === 'file') {
        if (!host.loadBytes) throw new Error('File bytes unavailable. Re-import the preset.');
        const bytes = await this.#entryBytes(entry, host);
        await host.loadBytes(bytes);
        host.noteBufferReplaced?.(`Loaded ${entry.summary.name ?? 'preset'}`);
        await host.reloadEditor?.();
        host.notify?.(`Loaded ${entry.summary.name ?? 'preset'}`, '#f5a623');
      } else if (entry.source === 'local') {
        if (!host.loadBytes) throw new Error('Local preset file unavailable.');
        const bytes = await this.#entryBytes(entry, host);
        const path = host.localPath?.(entry.id);
        await host.loadBytes(bytes);
        host.noteBufferReplaced?.(`Loaded ${entry.summary.name ?? 'preset'} from local folder`);
        if (path) host.setBufferSource?.({ path, name: entry.summary.name ?? 'preset' });
        await host.reloadEditor?.();
        host.notify?.(`Loaded ${entry.summary.name ?? 'preset'} - Save stores it to the current preset slot`, '#f5a623');
      } else {
        const number = entry.summary.number ?? -1;
        if (number < 0 || !host.loadDeviceSlot) throw new Error('Open it on the device to load.');
        // A row click starts detail hydration before its dblclick loads the preset. Its numbered grid
        // endpoint reads the active edit buffer, so let that read drain before select invalidates the
        // live-grid cache; otherwise it can finish after select and restore the previous preset's grid.
        await this.#detailLoads.get(entryId);
        await host.loadDeviceSlot(number);
      }

      // Unconditional across all four branches: the device branch also stamps `dev:<n>` via
      // editor.selectPreset, but that is the same key at the same instant — idempotent.
      host.recordLoad?.(entryId);
      this.#set({ loadingEntryId: null, lastLoadedEntryId: entryId });
      return true;
    } catch (e) {
      const error = messageOf(e);
      host.notify?.(error || 'Load failed', '#d6543f');
      this.#set({ loadingEntryId: null, error });
      return false;
    }
  }

  async auditionEntry(entryId: string): Promise<boolean> {
    const entry = this.#entry(entryId);
    if (!entry) return false;
    const host = this.#hosts.current;
    if (!host?.loadBytes) {
      this.#set({ error: 'No runtime host to audition from.' });
      return false;
    }

    this.#set({ auditioningEntryId: entryId, error: null });
    host.openBuild?.();
    try {
      const bytes = await this.#entryBytes(entry, host);
      await host.loadBytes(bytes);
      host.noteBufferReplaced?.(`Auditioned ${entry.summary.name ?? 'preset'}`);
      host.markAudition?.(entry.summary.name ?? 'preset');
      await host.reloadEditor?.();
      host.notify?.(`Auditioning ${entry.summary.name ?? 'preset'} - Save to keep it on a slot`, '#f5a623');
      this.#set({ auditioningEntryId: null, lastAuditionedEntryId: entryId });
      return true;
    } catch (e) {
      const error = messageOf(e);
      host.notify?.('Audition failed', '#d6543f');
      this.#set({ auditioningEntryId: null, error });
      return false;
    }
  }

  /** Save a computer preset (imported file / local folder entry) straight onto a chosen device slot —
   *  the browser's "Save to device…". There is no "write bytes to slot" call: the buffer is loaded
   *  first (which is why this also replaces the edit buffer), then stored to the destination slot and
   *  the device is moved onto it. Returns success. */
  async saveEntryToDevice(entryId: string, slot: number): Promise<boolean> {
    const entry = this.#entry(entryId);
    if (!entry) return false;
    const host = this.#hosts.current;
    if (!host?.loadBytes || !host.saveBufferToSlot) {
      this.#set({ error: 'No runtime host to save from.' });
      return false;
    }

    this.#set({ loadingEntryId: entryId, error: null });
    host.openBuild?.();
    try {
      const bytes = await this.#entryBytes(entry, host);
      await host.loadBytes(bytes);
      host.noteBufferReplaced?.(`Saving ${entry.summary.name ?? 'preset'} to the device`);
      const ok = await host.saveBufferToSlot(slot);
      if (!ok) throw new Error('Save rejected by device');
      await host.reloadEditor?.();
      this.#set({ loadingEntryId: null, lastLoadedEntryId: entryId });
      return true;
    } catch (e) {
      const error = messageOf(e);
      host.notify?.(error || 'Save failed', '#d6543f');
      this.#set({ loadingEntryId: null, error });
      return false;
    }
  }

  /** Apply every staged move as ONE snapshot-first permutation. Each step is planned by the pure
   *  `resolveAxisPbMoveBatch`, whose merged writes the host applies on the device — the server
   *  snapshots every affected slot before the first write and rolls back on failure. Returns success. */
  async moveBatch(steps: readonly AxisPbMoveStep[], slotCount: number): Promise<boolean> {
    const host = this.#hosts.current;
    if (!host?.applyPresetMove) {
      this.#set({ error: 'No runtime host to move presets.' });
      return false;
    }
    const resolved = resolveAxisPbMoveBatch(steps, { slotCount, isEmpty: host.isSlotEmpty });
    if (!resolved.ok) {
      host.notify?.(moveFailureMessage(resolved.reason), '#d6543f');
      this.#set({ error: resolved.reason });
      return false;
    }
    const { writes, unchanged, cleared } = resolved.plan;
    if (!writes.length) {
      host.notify?.('Those presets are already in that position', '#f5a623');
      return true;
    }

    this.#set({ moving: true, error: null });
    try {
      await host.applyPresetMove(writes, { slotCount });
      await host.reloadEditor?.();
      const affected = [...new Set([...writes.flatMap((w) => [w.from, w.to]), ...unchanged])].sort((a, b) => a - b);
      await host.refreshDeviceSlots?.(affected);
      const moved = writes.length;
      const suffix = cleared.length ? `, ${cleared.length} slot${cleared.length === 1 ? '' : 's'} emptied` : '';
      host.notify?.(`Moved ${moved} preset${moved === 1 ? '' : 's'}${suffix}`, '#33c46b');
      this.#set({ moving: false });
      return true;
    } catch (e) {
      host.notify?.('Move failed - the device was rolled back', '#d6543f');
      this.#set({ moving: false, error: messageOf(e) });
      return false;
    }
  }

  /** Raw .syx bytes for an entry that lives as a file (`file:` / `local:`) or as a device slot.
   *  Shared by the file/local load path and the source-agnostic audition path so the two can't drift. */
  async #entryBytes(
    entry: AxisPresetBrowserLibEntryLike,
    host: AxisPresetBrowserRuntimeHost
  ): Promise<Uint8Array | ArrayBuffer> {
    if (entry.source === 'file') {
      const bytes = host.fileBytes?.(entry.id);
      if (!bytes) throw new Error('File bytes unavailable. Re-import the preset.');
      return bytes;
    }
    if (entry.source === 'local') {
      const path = host.localPath?.(entry.id);
      if (!path || !host.localPresetFile) throw new Error('Local preset file unavailable.');
      return host.localPresetFile(path);
    }
    const number = entry.summary.number ?? -1;
    if (number < 0 || !host.deviceEntryBytes) throw new Error('No device slot to audition from.');
    return host.deviceEntryBytes(number);
  }

  loadDetail(entryId: string): Promise<AxisPresetBrowserDetailState | null> {
    const existing = this.#detailLoads.get(entryId);
    if (existing) return existing;
    const loading = this.#loadDetail(entryId).finally(() => {
      if (this.#detailLoads.get(entryId) === loading) this.#detailLoads.delete(entryId);
    });
    this.#detailLoads.set(entryId, loading);
    return loading;
  }

  async #loadDetail(entryId: string): Promise<AxisPresetBrowserDetailState | null> {
    const entry = this.#entry(entryId);
    if (!entry) return null;
    this.#set({ hydratingEntryId: entryId, error: null });
    const host = this.#hosts.current;

    try {
      await host?.hydrateParams?.(entryId);
      const params = host?.paramsOf?.(entry) ?? null;
      const number = entry.summary.number ?? -1;
      const [grid, versions] = entry.source === 'device' && number >= 0
        ? await Promise.all([
            host?.presetGrid?.(number).catch(() => null) ?? null,
            host?.versions?.(number).catch(() => []) ?? []
          ])
        : [null, []];
      const detail: AxisPresetBrowserDetailState = {
        entryId,
        paramsLoaded: !!params,
        gridLoaded: !!grid,
        versionsLoaded: versions.length > 0,
        blockCount: params?.length ?? entry.summary.blocks?.length ?? 0,
        grid,
        versions
      };
      this.#set({
        hydratingEntryId: null,
        details: { ...this.#snapshot.details, [entryId]: detail }
      });
      return detail;
    } catch (e) {
      const error = messageOf(e);
      this.#set({ hydratingEntryId: null, error });
      return null;
    }
  }

  #entry(entryId: string): AxisPresetBrowserLibEntryLike | null {
    const host = this.#hosts.current;
    if (!host) {
      this.#set({ error: 'No Preset Browser runtime host is bound.' });
      return null;
    }
    const entry = host.findEntry(entryId);
    if (!entry) this.#set({ error: `Preset ${entryId} was not found.` });
    return entry;
  }

  #set(patch: Partial<AxisPresetBrowserRuntimeSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.snapshot;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

function cloneSnapshot(snapshot: AxisPresetBrowserRuntimeSnapshot): AxisPresetBrowserRuntimeSnapshot {
  return {
    ...snapshot,
    details: Object.fromEntries(
      Object.entries(snapshot.details).map(([entryId, detail]) => [
        entryId,
        { ...detail, versions: [...detail.versions] }
      ])
    )
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const axisPresetBrowserWorkbenchRuntime = new AxisPresetBrowserWorkbenchRuntime();
