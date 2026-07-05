import {
  createAxisFcDataView,
  type AxisFcDataView,
  type AxisFcModelLike,
  type AxisFcSide
} from './fcWorkbenchData';
import { createAxisRuntimeHostStack } from '../runtimeHostStack';
import type { AxisFcSelection } from './types';

export interface AxisFcReadStateLike {
  config: number;
  fields: Record<string, number | null>;
  tapLabel: string;
  holdLabel: string;
}

export interface AxisFcRuntimeHost {
  loadModel: () => Promise<AxisFcModelLike | null>;
  readState?: (layout: number, view: number, switchIndex: number) => Promise<AxisFcReadStateLike | null>;
  setParam?: (effectId: number, paramId: number, value: number, refresh?: boolean) => Promise<void>;
  notifyError?: (message: string) => void;
}

export interface AxisFcRuntimeSnapshot {
  model: AxisFcModelLike | null;
  loading: boolean;
  reading: boolean;
  error: string | null;
  edits: Record<string, number>;
  labelText: Record<string, string>;
  present: Record<number, boolean>;
}

export class AxisFcWorkbenchRuntime {
  #hosts = createAxisRuntimeHostStack<AxisFcRuntimeHost>();
  #snapshot: AxisFcRuntimeSnapshot = {
    model: null,
    loading: false,
    reading: false,
    error: null,
    edits: {},
    labelText: {},
    present: {}
  };
  #subscribers = new Set<(snapshot: AxisFcRuntimeSnapshot) => void>();

  get snapshot(): AxisFcRuntimeSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  bindHost(host: AxisFcRuntimeHost | null): () => void {
    return this.#hosts.bind(host);
  }

  subscribe(run: (snapshot: AxisFcRuntimeSnapshot) => void): () => void {
    run(this.snapshot);
    this.#subscribers.add(run);
    return () => this.#subscribers.delete(run);
  }

  viewFor(selection: AxisFcSelection): AxisFcDataView {
    return createAxisFcDataView({
      model: this.#snapshot.model,
      layout: selection.layout,
      view: selection.view,
      switchIndex: selection.switchIndex,
      side: selection.side
    });
  }

  async loadModel(): Promise<AxisFcModelLike | null> {
    const host = this.#hosts.current;
    if (!host) {
      this.#set({ error: 'No FC runtime host is bound.' });
      return null;
    }
    this.#set({ loading: true, error: null });
    try {
      const model = await host.loadModel();
      this.#set({
        model,
        loading: false,
        error: model ? null : 'This device has no decoded Foot Controller model yet.'
      });
      return model;
    } catch (e) {
      const error = messageOf(e);
      this.#set({ loading: false, error });
      host.notifyError?.(`FC model load failed: ${error}`);
      return null;
    }
  }

  async readSelection(selection: AxisFcSelection): Promise<boolean> {
    const model = this.#snapshot.model;
    const host = this.#hosts.current;
    if (!model?.liveState || !host?.readState) return false;
    const view = this.viewFor(selection);
    if (view.selectedSwitch == null) return false;
    this.#set({ reading: true, error: null });
    try {
      const state = await host.readState(view.selectedLayout, view.selectedView, view.selectedSwitch);
      if (!state) {
        this.#set({ reading: false });
        return false;
      }
      this.#mergeReadState(state);
      this.#set({ reading: false });
      return true;
    } catch (e) {
      const error = messageOf(e);
      this.#set({ reading: false, error });
      host.notifyError?.(`FC read failed: ${error}`);
      return false;
    }
  }

  valueOf(field: string, config: number): number | undefined {
    return this.#snapshot.edits[this.#key(field, config)];
  }

  labelOf(side: AxisFcSide, config: number): string {
    return this.#snapshot.labelText[this.#key(`${side}Label`, config)] ?? '';
  }

  pidOf(field: string, config: number, index = 0): number | null {
    const model = this.#snapshot.model;
    const def = model?.fields?.[field];
    if (!model || !def) return null;
    return (def.base ?? def.pid ?? 0) + config * (def.stride ?? 0) + index;
  }

  async writeField(field: string, value: number, config: number, index = 0): Promise<boolean> {
    const model = this.#snapshot.model;
    const pid = this.pidOf(field, config, index);
    const host = this.#hosts.current;
    if (!model || pid == null || !host?.setParam) return false;
    if (index === 0) {
      this.#set({ edits: { ...this.#snapshot.edits, [this.#key(field, config)]: value } });
    }
    try {
      await host.setParam(model.effectId, pid, value, false);
      return true;
    } catch (e) {
      const error = messageOf(e);
      this.#set({ error });
      host.notifyError?.(`FC write failed: ${error}`);
      return false;
    }
  }

  async writeSlot(side: AxisFcSide, slotIndex: number, value: number, config: number): Promise<boolean> {
    const slotKey = this.#slotKey(side, slotIndex, config);
    this.#set({ edits: { ...this.#snapshot.edits, [slotKey]: value } });
    return this.writeField(`${side}Params`, value, config, slotIndex);
  }

  async setCategory(side: AxisFcSide, value: number, config: number): Promise<boolean> {
    const wroteCategory = await this.writeField(`${side}Category`, value, config);
    const wroteFunction = await this.writeField(`${side}Function`, 0, config);
    return wroteCategory && wroteFunction;
  }

  async writeLabel(side: AxisFcSide, text: string, config: number): Promise<boolean> {
    const model = this.#snapshot.model;
    if (!model) return false;
    const field = `${side}Label`;
    const base = this.pidOf(field, config);
    const host = this.#hosts.current;
    if (base == null || !host?.setParam) return false;
    this.#set({
      edits: { ...this.#snapshot.edits, [this.#key(field, config)]: text.length },
      labelText: { ...this.#snapshot.labelText, [this.#key(field, config)]: text }
    });
    try {
      for (let i = 0; i < (model.labelLen ?? 0); i += 1) {
        await host.setParam(model.effectId, base + i, i < text.length ? text.charCodeAt(i) : 0, false);
      }
      const customMode = Number(Object.entries(model.labelModes ?? {}).find(([, label]) => label === 'Custom')?.[0] ?? 2);
      if (text.length) await this.writeField(`${side}Display`, customMode, config);
      return true;
    } catch (e) {
      const error = messageOf(e);
      this.#set({ error });
      host.notifyError?.(`FC label write failed: ${error}`);
      return false;
    }
  }

  #mergeReadState(state: AxisFcReadStateLike): void {
    const edits = { ...this.#snapshot.edits };
    const labelText = { ...this.#snapshot.labelText };
    const present = { ...this.#snapshot.present };
    for (const [field, value] of Object.entries(state.fields)) {
      if (value != null) edits[this.#key(field, state.config)] = value;
    }
    labelText[this.#key('tapLabel', state.config)] = state.tapLabel;
    labelText[this.#key('holdLabel', state.config)] = state.holdLabel;
    present[state.config] = (state.fields.tapCategory ?? 0) !== 0 || (state.fields.holdCategory ?? 0) !== 0;
    this.#set({ edits, labelText, present });
  }

  #key(field: string, config: number): string {
    return `${field}:${config}`;
  }

  #slotKey(side: AxisFcSide, slotIndex: number, config: number): string {
    return `${side}Params#${slotIndex}:${config}`;
  }

  #set(patch: Partial<AxisFcRuntimeSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.snapshot;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

function cloneSnapshot(snapshot: AxisFcRuntimeSnapshot): AxisFcRuntimeSnapshot {
  return {
    ...snapshot,
    edits: { ...snapshot.edits },
    labelText: { ...snapshot.labelText },
    present: { ...snapshot.present }
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const axisFcWorkbenchRuntime = new AxisFcWorkbenchRuntime();
