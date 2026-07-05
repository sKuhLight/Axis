import type {
  AxisPresetBrowserBlockSummary,
  AxisPresetBrowserLibEntryLike
} from './presetBrowserWorkbenchData';
import { createAxisRuntimeHostStack } from '../runtimeHostStack';

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
  latestCloudVersionId?: (presetNumber: number) => string | null;
  loadCloudVersion?: (versionId: string) => Promise<void>;
  loadBytes?: (bytes: ArrayBuffer | Uint8Array) => Promise<void>;
  loadDeviceSlot?: (presetNumber: number) => Promise<void>;
  deviceEntryBytes?: (presetNumber: number) => Promise<ArrayBuffer>;
  localPresetFile?: (path: string) => Promise<ArrayBuffer>;
  openBuild?: () => void;
  reloadEditor?: () => Promise<void>;
  noteBufferReplaced?: (label: string) => void;
  setBufferSource?: (source: { path: string; name: string } | null) => void;
  hydrateParams?: (entryId: string) => Promise<void>;
  paramsOf?: (entry: AxisPresetBrowserLibEntryLike) => AxisPresetBrowserBlockSummary[] | null;
  presetGrid?: (presetNumber: number) => Promise<AxisPresetBrowserGridLike>;
  versions?: (presetNumber: number) => Promise<AxisPresetBrowserVersionLike[]>;
  notify?: (message: string, accent?: string) => void;
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
  error: string | null;
  lastLoadedEntryId: string | null;
  lastAuditionedEntryId: string | null;
  details: Record<string, AxisPresetBrowserDetailState>;
}

export class AxisPresetBrowserWorkbenchRuntime {
  #hosts = createAxisRuntimeHostStack<AxisPresetBrowserRuntimeHost>();
  #snapshot: AxisPresetBrowserRuntimeSnapshot = {
    loadingEntryId: null,
    auditioningEntryId: null,
    hydratingEntryId: null,
    error: null,
    lastLoadedEntryId: null,
    lastAuditionedEntryId: null,
    details: {}
  };
  #subscribers = new Set<(snapshot: AxisPresetBrowserRuntimeSnapshot) => void>();

  get snapshot(): AxisPresetBrowserRuntimeSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  bindHost(host: AxisPresetBrowserRuntimeHost | null): () => void {
    return this.#hosts.bind(host);
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
      if (entry.id.startsWith('cloud:')) {
        const versionId = host.latestCloudVersionId?.(entry.summary.number ?? -1);
        if (!versionId || !host.loadCloudVersion) throw new Error('No cloud version found.');
        await host.loadCloudVersion(versionId);
        host.noteBufferReplaced?.(`Loaded ${entry.summary.name ?? 'preset'} from cloud`);
        await host.reloadEditor?.();
        host.notify?.(`Loaded ${entry.summary.name ?? 'preset'} from cloud`, '#9b8cf0');
      } else if (entry.source === 'file') {
        const bytes = host.fileBytes?.(entry.id);
        if (!bytes || !host.loadBytes) throw new Error('File bytes unavailable. Re-import the preset.');
        await host.loadBytes(bytes);
        host.noteBufferReplaced?.(`Loaded ${entry.summary.name ?? 'preset'}`);
        await host.reloadEditor?.();
        host.notify?.(`Loaded ${entry.summary.name ?? 'preset'}`, '#f5a623');
      } else if (entry.source === 'local') {
        const path = host.localPath?.(entry.id);
        if (!path || !host.localPresetFile || !host.loadBytes) throw new Error('Local preset file unavailable.');
        const bytes = await host.localPresetFile(path);
        await host.loadBytes(bytes);
        host.noteBufferReplaced?.(`Loaded ${entry.summary.name ?? 'preset'} from local folder`);
        host.setBufferSource?.({ path, name: entry.summary.name ?? 'preset' });
        await host.reloadEditor?.();
        host.notify?.(`Loaded ${entry.summary.name ?? 'preset'} - Save writes to disk or a slot`, '#f5a623');
      } else {
        const number = entry.summary.number ?? -1;
        if (number < 0 || !host.loadDeviceSlot) throw new Error('Open it on the device to load.');
        await host.loadDeviceSlot(number);
      }

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
    const number = entry.summary.number ?? -1;
    const host = this.#hosts.current;
    if (number < 0 || !host?.deviceEntryBytes || !host.loadBytes) {
      this.#set({ error: 'No device slot to audition from.' });
      host?.notify?.('No device slot to audition from', '#f5a623');
      return false;
    }

    this.#set({ auditioningEntryId: entryId, error: null });
    host.openBuild?.();
    try {
      const bytes = await host.deviceEntryBytes(number);
      await host.loadBytes(bytes);
      host.noteBufferReplaced?.(`Auditioned ${entry.summary.name ?? 'preset'}`);
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

  async loadDetail(entryId: string): Promise<AxisPresetBrowserDetailState | null> {
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
