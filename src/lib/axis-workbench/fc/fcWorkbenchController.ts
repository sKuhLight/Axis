import { parseAxisFcPart, type AxisFcPart, type AxisFcSelection } from './types';

export interface AxisFcControllerSnapshot extends AxisFcSelection {
  activePart: AxisFcPart;
  inspectorOpen: boolean;
}

export interface AxisFcWorkbenchHost {
  selectLayout?: (layout: number) => void | Promise<void>;
  selectView?: (view: number) => void | Promise<void>;
  selectSwitch?: (switchIndex: number | null, side: 'tap' | 'hold') => void | Promise<void>;
  selectSide?: (side: 'tap' | 'hold') => void | Promise<void>;
  openInspector?: (switchIndex: number | null) => void | Promise<void>;
}

export class AxisFcWorkbenchController {
  #snapshot: AxisFcControllerSnapshot = {
    activePart: 'full',
    layout: 0,
    view: 0,
    switchIndex: null,
    side: 'tap',
    inspectorOpen: false
  };

  #subscribers = new Set<(snapshot: AxisFcControllerSnapshot) => void>();
  #host: AxisFcWorkbenchHost | null = null;

  get snapshot(): AxisFcControllerSnapshot {
    return { ...this.#snapshot };
  }

  bindHost(host: AxisFcWorkbenchHost | null): () => void {
    this.#host = host;
    return () => {
      if (this.#host === host) this.#host = null;
    };
  }

  setPart(part: AxisFcPart | string): void {
    this.#snapshot = { ...this.#snapshot, activePart: parseAxisFcPart(part) };
    this.#emit();
  }

  selectLayout(layout: number): void {
    // Design parity (04-fc-and-grid.md §3.2): selecting a layout resets view AND switch.
    this.#snapshot = {
      ...this.#snapshot,
      layout: Math.max(0, Math.floor(layout)),
      view: 0,
      switchIndex: null,
      inspectorOpen: false
    };
    this.#emit();
    void this.#host?.selectLayout?.(this.#snapshot.layout);
  }

  selectView(view: number): void {
    this.#snapshot = {
      ...this.#snapshot,
      view: Math.max(0, Math.floor(view)),
      switchIndex: null,
      inspectorOpen: false
    };
    this.#emit();
    void this.#host?.selectView?.(this.#snapshot.view);
  }

  selectSwitch(switchIndex: number | null, side: 'tap' | 'hold' = this.#snapshot.side): void {
    this.#snapshot = {
      ...this.#snapshot,
      switchIndex: switchIndex == null ? null : Math.max(0, Math.floor(switchIndex)),
      side,
      inspectorOpen: switchIndex != null
    };
    this.#emit();
    void this.#host?.selectSwitch?.(this.#snapshot.switchIndex, side);
  }

  selectSide(side: 'tap' | 'hold'): void {
    this.#snapshot = { ...this.#snapshot, side };
    this.#emit();
    void this.#host?.selectSide?.(side);
  }

  openInspector(switchIndex = this.#snapshot.switchIndex): void {
    this.#snapshot = {
      ...this.#snapshot,
      switchIndex,
      inspectorOpen: switchIndex != null
    };
    this.#emit();
    void this.#host?.openInspector?.(switchIndex);
  }

  closeInspector(): void {
    this.#snapshot = { ...this.#snapshot, inspectorOpen: false };
    this.#emit();
  }

  subscribe(run: (snapshot: AxisFcControllerSnapshot) => void): () => void {
    run(this.snapshot);
    this.#subscribers.add(run);
    return () => this.#subscribers.delete(run);
  }

  #emit(): void {
    const snapshot = this.snapshot;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

export const axisFcWorkbenchController = new AxisFcWorkbenchController();
