// Selection, open-block data, parameter writes, tabs, swipe controls and pinned hydration. Grid
// state is reached through ParamEditingHost so this slice never imports its grid sibling.
import { forgefx, ForgeError } from '$lib/api/forgefx';
import type { Cell, Layout } from '$lib/device/grid';
import { monitorsByFamily } from '$lib/device/deviceMonitors';
import { geqBandsFromLayout } from '$lib/graphs/eq';
import { paramValue } from '$lib/ui/format';
import type { DecodedBlockFile, DeviceLayout, EnumParam, MeterVal, NamedParam, ResolvedTab, TabDef } from '$lib/api/types';
import { history } from './history.svelte';
import { loadLayouts, loadSwipe, newTabId, resolveTabs, saveLayouts, saveSwipe, type SwipeCtrl } from './layouts';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export interface ParamEditingHost {
  readonly layout: Layout;
  readonly status: 'loading' | 'ready' | 'offline';
  readonly legacyAm4: boolean;
  readonly paramsWithoutPack: boolean;
  readonly hasCursorSelect: boolean;
  readonly hasBlockMeters: boolean;
  readonly slowLink: boolean;
  loadGrid: () => Promise<void>;
  scheduleBlockStateReload: () => void;
  showToast: (text: string, accent?: string) => void;
  clearLooperWave: () => void;
}

export class ParamEditingStore {
  #host: ParamEditingHost;
  constructor(host: ParamEditingHost) { this.#host = host; }

  selKey = $state<string | null>(null);
  editorOpen = $state(false);
  editorH = $state(380);
  params = $state<NamedParam[]>([]);
  enums = $state<EnumParam[]>([]);
  blockType = $state<{ value: number; name: string } | null>(null);
  blockSlug = $state<string | null>(null);
  sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('loading');
  #paramsEid: number | null = null;
  blockLayout = $state<DeviceLayout | null>(null);
  virtual = $state<{ eid: number; slug: string; name: string } | null>(null);

  activePage = $state('');
  customLayouts = $state<Record<string, TabDef[]>>({});
  editingTabs = $state(false);
  swipeControls = $state<Record<string, SwipeCtrl[]>>({});
  meters = $state<Record<number, { defaultId: number; defaultName: string; typeName: string; vals: Record<number, MeterVal> }>>({});
  activeCtl = $state<Record<number, number>>({});
  pinnedParams = $state<Record<number, { named: NamedParam[]; enums: EnumParam[] }>>({});
  #pinnedRefs = new Map<number, number>();
  #hydratePinnedTimer: ReturnType<typeof setTimeout> | null = null;
  monitorParams = $state<import('$lib/api/types').MonitorParams | null>(null);
  #monitorParamsLoad: Promise<void> | null = null;
  #sendTimers: Record<string | number, ReturnType<typeof setTimeout>> = {};
  #metersTimer: ReturnType<typeof setTimeout> | null = null;

  init = () => {
    this.customLayouts = loadLayouts();
    this.swipeControls = loadSwipe();
  };

  get selected(): Cell | null {
    if (this.virtual) {
      const v = this.virtual;
      return { row: -1, col: -1, kind: 'block', effectId: v.eid, display: v.name, pack: v.slug, color: '#35c9d6', fromRows: [] };
    }
    if (!this.selKey) return null;
    return [...this.#host.layout.cells, ...this.#host.layout.shunts].find((c) => `${c.row},${c.col}` === this.selKey) ?? null;
  }
  setSelectionKey = (key: string | null) => { this.selKey = key; };
  clearVirtual = () => { this.virtual = null; };

  typeNameFor = (effectId: number): string => this.meters[effectId]?.typeName ?? '';
  loadMonitorParams = (): Promise<void> => {
    if (this.monitorParams) return Promise.resolve();
    this.#monitorParamsLoad ??= forgefx.monitors()
      .then((t) => { this.monitorParams = t ?? {}; })
      .catch(() => { this.monitorParams = {}; })
      .finally(() => { this.#monitorParamsLoad = null; });
    return this.#monitorParamsLoad;
  };
  monitorsByPid = (family: string | null | undefined): Map<number, import('$lib/api/types').MonitorEntry> =>
    monitorsByFamily(this.monitorParams, family);
  get openBlockMonitors(): Map<number, import('$lib/api/types').MonitorEntry> {
    return this.monitorsByPid(this.blockLayout?.family);
  }
  looperControl = async (action: string, on: boolean) => {
    const eid = this.selected?.effectId;
    if (eid == null) return;
    try { await forgefx.looperControl(eid, action, on); } catch { /* best-effort */ }
  };

  get familyKey(): string {
    const c = this.selected;
    return c?.pack ? c.pack.toLowerCase() : '';
  }
  get tabs(): ResolvedTab[] {
    const eqIds = this.selected?.pack === 'Amp' ? geqBandsFromLayout(this.blockLayout).map((b) => b.paramId) : [];
    return resolveTabs(this.params, this.enums, this.customLayouts[this.familyKey] ?? [], eqIds);
  }
  #persistLayouts = () => {
    this.customLayouts = { ...this.customLayouts };
    saveLayouts(this.customLayouts);
  };
  addTab = () => {
    const fam = this.familyKey;
    if (!fam) return;
    const tab: TabDef = { id: newTabId(), name: 'New Tab', paramIds: [] };
    this.customLayouts[fam] = [...(this.customLayouts[fam] ?? []), tab];
    this.#persistLayouts();
    this.activePage = tab.id;
    this.editingTabs = true;
  };
  renameTab = (id: string, name: string) => {
    const t = this.customLayouts[this.familyKey]?.find((x) => x.id === id);
    if (!t) return;
    t.name = name.trim() || t.name;
    this.#persistLayouts();
  };
  deleteTab = (id: string) => {
    const fam = this.familyKey;
    const list = this.customLayouts[fam];
    if (!list) return;
    this.customLayouts[fam] = list.filter((x) => x.id !== id);
    if (this.activePage === id) this.activePage = '__ideal';
    this.#persistLayouts();
  };
  toggleParamInTab = (id: string, paramId: number) => {
    const t = this.customLayouts[this.familyKey]?.find((x) => x.id === id);
    if (!t) return;
    t.paramIds = t.paramIds.includes(paramId) ? t.paramIds.filter((x) => x !== paramId) : [...t.paramIds, paramId];
    this.#persistLayouts();
  };

  slugOf = (c: Cell) => (c.pack ?? '').toLowerCase();
  swipeFor = (slug: string): SwipeCtrl[] => this.swipeControls[slug] ?? [];
  isSwipeControl = (paramId: number) => this.swipeFor(this.familyKey).some((c) => c.id === paramId);
  toggleSwipeControl = (p: NamedParam) => {
    if (p.id == null) return;
    const fam = this.familyKey;
    if (!fam) return;
    const list = this.swipeControls[fam] ?? [];
    this.swipeControls[fam] = list.some((c) => c.id === p.id) ? list.filter((c) => c.id !== p.id) : [...list, { id: p.id, name: p.name }];
    this.swipeControls = { ...this.swipeControls };
    saveSwipe(this.swipeControls);
    this.fetchMeters();
  };
  controlsFor = (cell: Cell): SwipeCtrl[] => {
    const user = this.swipeFor(this.slugOf(cell));
    if (user.length) return user;
    const m = this.meters[cell.effectId];
    return m ? [{ id: m.defaultId, name: m.defaultName }] : [];
  };
  meterFor = (cell: Cell): { norm: number; value: number; unit?: string; min?: number; max?: number; log?: boolean; count: number; active: number; name: string } | null => {
    const ctrls = this.controlsFor(cell);
    if (!ctrls.length) return null;
    const active = Math.min(this.activeCtl[cell.effectId] ?? 0, ctrls.length - 1);
    const v = this.meters[cell.effectId]?.vals[ctrls[active].id];
    return { norm: v?.norm ?? 0, value: v?.value ?? 0, unit: v?.unit, min: v?.min, max: v?.max, log: v?.log, count: ctrls.length, active, name: ctrls[active].name };
  };
  cycleControl = (cell: Cell, dir: number) => {
    const n = this.controlsFor(cell).length;
    if (n <= 1) return;
    this.activeCtl[cell.effectId] = (((this.activeCtl[cell.effectId] ?? 0) + dir) % n + n) % n;
    this.activeCtl = { ...this.activeCtl };
  };
  adjustSwipe = (cell: Cell, deltaNorm: number) => {
    const ctrls = this.controlsFor(cell);
    if (!ctrls.length) return;
    const active = Math.min(this.activeCtl[cell.effectId] ?? 0, ctrls.length - 1);
    const ctl = ctrls[active];
    const m = this.meters[cell.effectId] ?? { defaultId: ctl.id, defaultName: ctl.name, typeName: '', vals: {} as Record<number, MeterVal> };
    const prev = m.vals[ctl.id];
    const norm = clamp01((prev?.norm ?? 0.5) + deltaNorm);
    m.vals = { ...m.vals, [ctl.id]: { ...(prev ?? { value: 0 }), norm, value: paramValue({ norm, min: prev?.min, max: prev?.max, unit: prev?.unit, log: prev?.log }) } };
    this.meters = { ...this.meters, [cell.effectId]: m };
    if (this.selected?.effectId === cell.effectId) {
      const p = this.params.find((x) => x.id === ctl.id);
      if (p) p.norm = norm;
    }
    clearTimeout(this.#sendTimers[ctl.id]);
    this.#sendTimers[ctl.id] = setTimeout(() => forgefx.setParam(cell.effectId, ctl.id, norm, true).catch(() => {}), 50);
  };
  fetchMeters = () => {
    if (!this.#host.hasBlockMeters || this.#host.slowLink) return;
    if (this.#metersTimer) clearTimeout(this.#metersTimer);
    this.#metersTimer = setTimeout(async () => {
      const wants: Record<string, number[]> = {};
      for (const [slug, list] of Object.entries(this.swipeControls)) if (list.length) wants[slug] = list.map((c) => c.id);
      try {
        const rows = await forgefx.meters(wants);
        const next: typeof this.meters = {};
        for (const r of rows) next[r.effectId] = { defaultId: r.defaultId, defaultName: r.defaultName, typeName: r.typeName, vals: r.vals };
        this.meters = next;
      } catch { /* meters are best-effort */ }
    }, 350);
  };

  registerPinnedBlock = (effectId: number | undefined): (() => void) => {
    if (effectId == null || effectId < 0) return () => {};
    this.#pinnedRefs.set(effectId, (this.#pinnedRefs.get(effectId) ?? 0) + 1);
    this.#scheduleHydratePinned();
    return () => {
      const next = (this.#pinnedRefs.get(effectId) ?? 1) - 1;
      if (next > 0) { this.#pinnedRefs.set(effectId, next); return; }
      this.#pinnedRefs.delete(effectId);
      if (this.pinnedParams[effectId]) {
        const { [effectId]: _drop, ...rest } = this.pinnedParams;
        this.pinnedParams = rest;
      }
    };
  };
  pinnedView = (effectId: number | undefined): { named: NamedParam[]; enums: EnumParam[] } => {
    if (effectId != null && this.selected?.effectId === effectId) return { named: this.params, enums: this.enums };
    return (effectId != null && this.pinnedParams[effectId]) || { named: [], enums: [] };
  };
  #scheduleHydratePinned = () => {
    if (this.#hydratePinnedTimer) clearTimeout(this.#hydratePinnedTimer);
    this.#hydratePinnedTimer = setTimeout(() => void this.#hydratePinned(), 250);
  };
  invalidatePinned = () => {
    if (Object.keys(this.pinnedParams).length) this.pinnedParams = {};
    if (this.#pinnedRefs.size) this.#scheduleHydratePinned();
  };
  onGridLoaded = () => { this.fetchMeters(); this.invalidatePinned(); };
  #hydratePinned = async () => {
    this.#hydratePinnedTimer = null;
    if (!this.#pinnedRefs.size || this.#host.slowLink || this.#host.status !== 'ready') return;
    const placed = new Set([...this.#host.layout.cells, ...this.#host.layout.shunts].map((c) => c.effectId));
    for (const eid of this.#pinnedRefs.keys()) {
      if (eid === this.selected?.effectId) continue;
      if (!placed.has(eid) || this.pinnedParams[eid]) continue;
      try {
        const r = this.#host.legacyAm4 ? await forgefx.am4BlockParams(eid) : await forgefx.blockParams(eid);
        this.pinnedParams = {
          ...this.pinnedParams,
          [eid]: { named: r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase())), enums: r.enums ?? [] }
        };
      } catch { /* best-effort */ }
    }
  };
  #cellFor = (effectId: number): Cell | undefined =>
    [...this.#host.layout.cells, ...this.#host.layout.shunts].find((c) => c.effectId === effectId);
  setPinnedParam = (effectId: number, p: NamedParam, v: number) => {
    if (this.selected?.effectId === effectId) { this.setParam(p, v); return; }
    if (p.id == null) return;
    const from = p.norm ?? 0;
    p.norm = v;
    this.pinnedParams = { ...this.pinnedParams };
    const cell = this.#cellFor(effectId);
    history.recordGesture({ kind: 'param', eid: effectId, paramId: p.id, continuous: true, from, to: v, block: cell?.display ?? p.name, param: p.name, min: p.min, max: p.max, unit: p.unit, log: p.log });
    clearTimeout(this.#sendTimers[p.id]);
    this.#sendTimers[p.id] = setTimeout(() => forgefx.setParam(effectId, p.id as number, v, true).catch(() => {}), 60);
  };
  setPinnedEnum = (effectId: number, e: EnumParam, value: number) => {
    if (this.selected?.effectId === effectId) { this.setEnum(e, value); return; }
    const from = e.value;
    e.value = value;
    this.pinnedParams = { ...this.pinnedParams };
    const cell = this.#cellFor(effectId);
    if (from !== value) history.record({ kind: 'param', eid: effectId, paramId: e.id, continuous: false, from, to: value, block: cell?.display ?? e.name, param: e.name, fromLabel: e.options.find((o) => o.value === from)?.label, toLabel: e.options.find((o) => o.value === value)?.label });
    forgefx.setParam(effectId, e.id, value, false).catch(() => {});
  };

  selectCellOnDevice = (row: number, col: number) => {
    if (!this.#host.hasCursorSelect) return;
    forgefx.selectCell(row + 1, col + 1).catch(() => {});
  };
  openCell = async (c: Cell) => {
    this.virtual = null;
    this.selectCellOnDevice(c.row, c.col);
    if (c.kind === 'shunt') {
      this.selKey = `${c.row},${c.col}`;
      this.editorOpen = false;
      return;
    }
    this.selKey = `${c.row},${c.col}`;
    this.editorOpen = true;
    this.editingTabs = false;
    this.activePage = '__ideal';
    if (!c.pack && !this.#host.paramsWithoutPack) {
      this.sheetState = 'nopack';
      this.#paramsEid = null;
      this.params = [];
      this.enums = [];
      return;
    }
    await this.reloadParams();
  };
  closeEditor = () => { this.editorOpen = false; };
  openVirtual = async (eid: number, slug: string, name: string) => {
    this.virtual = { eid, slug, name };
    this.selKey = null;
    this.editorOpen = false;
    this.editingTabs = false;
    this.activePage = '';
    await this.reloadParams();
  };
  reloadParams = async () => {
    const c = this.selected;
    if (!c || (!c.pack && !this.#host.paramsWithoutPack)) return;
    if (this.#paramsEid !== c.effectId) {
      this.#paramsEid = null;
      this.sheetState = 'loading';
    }
    try {
      const [r] = await Promise.all([
        this.#host.legacyAm4 ? forgefx.am4BlockParams(c.effectId) : forgefx.blockParams(c.effectId),
        this.loadMonitorParams()
      ]);
      this.params = r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase()));
      this.enums = r.enums ?? [];
      this.blockType = r.type ?? null;
      this.blockSlug = r.slug ?? null;
      if (this.blockSlug !== 'looper') this.#host.clearLooperWave();
      this.blockLayout = r.layout ?? null;
      if (c.effectId != null) {
        const fallback = this.params[0];
        const m = this.meters[c.effectId] ?? { defaultId: fallback?.id ?? -1, defaultName: fallback?.name ?? '', typeName: '', vals: {} as Record<number, MeterVal> };
        if (r.type?.name) m.typeName = r.type.name;
        for (const p of this.params)
          if (p.id != null && (p.id === m.defaultId || this.swipeFor(this.slugOf(c)).some((x) => x.id === p.id)))
            m.vals[p.id] = { norm: p.norm ?? 0, value: p.value ?? 0, unit: p.unit, min: p.min, max: p.max, log: p.log };
        this.meters = { ...this.meters, [c.effectId]: { ...m } };
      }
      this.#paramsEid = c.effectId ?? null;
      this.sheetState = 'ready';
    } catch (e) {
      this.#paramsEid = null;
      this.sheetState = 'error';
      if (e instanceof ForgeError) console.warn(e.message);
    }
  };

  setParam = (p: NamedParam, v: number) => {
    const from = p.norm ?? 0;
    p.norm = v;
    const c = this.selected;
    if (!c || (!c.pack && !this.#host.paramsWithoutPack)) return;
    if (p.id != null && c.effectId != null) {
      const m = this.meters[c.effectId];
      if (m && m.vals[p.id]) {
        m.vals[p.id] = { ...m.vals[p.id], norm: v, value: paramValue({ norm: v, min: p.min, max: p.max, unit: p.unit, log: p.log }) };
        this.meters = { ...this.meters, [c.effectId]: { ...m } };
      }
    }
    if (p.id == null) return;
    history.recordGesture({ kind: 'param', eid: c.effectId, paramId: p.id, continuous: true, from, to: v, block: c.display, param: p.name, min: p.min, max: p.max, unit: p.unit, log: p.log });
    clearTimeout(this.#sendTimers[p.id]);
    const eid = c.effectId, pid = p.id as number;
    this.#sendTimers[pid] = setTimeout(() => (this.#host.legacyAm4 ? forgefx.am4SetParamNorm(eid, pid, v) : forgefx.setParam(eid, pid, v, true)).catch(() => {}), 60);
  };
  setEnum = (e: EnumParam, value: number) => {
    const from = e.value;
    e.value = value;
    const c = this.selected;
    if (!c || (!c.pack && !this.#host.paramsWithoutPack)) return;
    if (from !== value) history.record({ kind: 'param', eid: c.effectId, paramId: e.id, continuous: false, from, to: value, block: c.display, param: e.name, fromLabel: e.options.find((o) => o.value === from)?.label, toLabel: e.options.find((o) => o.value === value)?.label });
    (this.#host.legacyAm4 ? forgefx.am4SetParamValue(c.effectId, e.id, value) : forgefx.setParam(c.effectId, e.id, value, false)).catch(() => {});
  };
  toggleBypass = async (cell?: Cell) => {
    const c = cell ?? this.selected;
    if (!c?.pack) return;
    const next = !(c.bypassed ?? false);
    c.bypassed = next;
    try {
      await forgefx.setBypass(c.effectId, next);
      history.record({ kind: 'bypass', eid: c.effectId, block: c.display, from: !next, to: next });
      this.#host.showToast(next ? 'Bypassed' : 'Engaged', next ? '#d6543f' : '#5fc46b');
    } catch { c.bypassed = !next; }
  };
  setChannel = async (ch: string) => {
    const c = this.selected;
    if (!c?.pack || c.channel === ch) return;
    const prev = c.channel;
    c.channel = ch;
    try {
      await forgefx.setChannel(c.effectId, ch);
      if (prev) history.record({ kind: 'channel', eid: c.effectId, block: c.display, from: prev, to: ch });
      this.#host.scheduleBlockStateReload();
    } catch { c.channel = prev; }
  };
  retype = async (value: number) => {
    const c = this.selected;
    if (!c?.pack) return;
    const from = this.blockType;
    try {
      await forgefx.setType(c.effectId, value);
      await this.reloadParams();
      if (from && from.value !== value) history.record({ kind: 'retype', eid: c.effectId, block: c.display, from: from.value, to: value, fromName: from.name, toName: this.blockType?.name ?? String(value) });
      await this.#host.loadGrid();
      this.#host.showToast('Type changed', '#35c9d6');
    } catch (e) {
      this.#host.showToast('Type change rejected by device', '#d6543f');
      if (e instanceof ForgeError) console.warn(e.message);
    }
  };
  applyBlockLibrarySource = async (block: DecodedBlockFile): Promise<boolean> => {
    const c = this.selected;
    if (!c?.pack || block.slug.toLowerCase() !== c.pack.toLowerCase()) return false;
    try {
      await forgefx.applyBlockLibrarySource(c.effectId, block);
      history.checkpoint(`${block.name} applied to ${c.display}`, false);
      await this.reloadParams();
      await this.#host.loadGrid();
      this.#host.showToast(`${block.name} applied`, '#5fc46b');
      return true;
    } catch (e) {
      const message = e instanceof ForgeError ? e.message.replace(/^POST \/preset\/blocks\/\d+\/apply → \d+:?\s*/, '') : 'Block apply rejected by device';
      this.#host.showToast(message || 'Block apply rejected by device', '#d6543f');
      if (e instanceof ForgeError) console.warn(e.message);
      return false;
    }
  };
  cabState = (eid: number) => forgefx.cabState(eid);
  applyCab = async (writes: { paramId: number; value: number }[]) => {
    const c = this.selected;
    if (!c?.pack) return;
    for (const w of writes) await forgefx.setParam(c.effectId, w.paramId, w.value, false).catch(() => {});
    history.checkpoint(`${c.display} cab changed`, false);
    await this.reloadParams();
  };

  applyParamEcho = (effectId: number, paramId: number, norm: number) => {
    if (this.selected?.effectId === effectId) {
      const p = this.params.find((x) => x.id === paramId);
      if (p && p.norm !== norm) { p.norm = norm; this.params = [...this.params]; }
    }
    const m = this.meters[effectId];
    if (m) {
      const prev = m.vals[paramId];
      const value = prev ? paramValue({ norm, min: prev.min, max: prev.max, unit: prev.unit, log: prev.log }) : 0;
      m.vals = { ...m.vals, [paramId]: { ...(prev ?? { value: 0 }), norm, value } };
      this.meters = { ...this.meters, [effectId]: { ...m } };
    }
  };
  applyRemoteConfig = (id: 'swipe' | 'layouts', data: object) => {
    const key = id === 'swipe' ? 'axis.swipe.v1' : 'axis.layouts.v1';
    if (id === 'swipe') this.swipeControls = data as Record<string, SwipeCtrl[]>;
    else this.customLayouts = data as Record<string, TabDef[]>;
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* */ }
  };
}
