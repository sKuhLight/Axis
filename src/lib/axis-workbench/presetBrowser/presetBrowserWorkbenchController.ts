import { parseAxisPresetBrowserPart, type AxisPresetBrowserPart, type AxisPresetBrowserSelection } from './types';

export interface AxisPresetBrowserControllerSnapshot extends AxisPresetBrowserSelection {
  activePart: AxisPresetBrowserPart;
  detailOpen: boolean;
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
    detailOpen: false
  };

  #subscribers = new Set<(snapshot: AxisPresetBrowserControllerSnapshot) => void>();
  #host: AxisPresetBrowserWorkbenchHost | null = null;

  get snapshot(): AxisPresetBrowserControllerSnapshot {
    return { ...this.#snapshot };
  }

  bindHost(host: AxisPresetBrowserWorkbenchHost | null): () => void {
    this.#host = host;
    return () => {
      if (this.#host === host) this.#host = null;
    };
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

  #emit(): void {
    const snapshot = this.snapshot;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

export const axisPresetBrowserWorkbenchController = new AxisPresetBrowserWorkbenchController();
