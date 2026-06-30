// Typed client for the ForgeFX HTTP API (resource-oriented, named).
// Dev: Vite proxies /api -> http://localhost:5056 (vite.config.ts strips /api).
// Prod: ForgeFX.Server serves Axis, so /api is same-origin (set VITE_FORGEFX_BASE to override).
import type {
  BlockParams,
  BlockSummary,
  CabState,
  ConnPick,
  DetectResult,
  PortList,
  DeviceEvent,
  DeviceInfo,
  Health,
  PresetBlock,
  PresetGrid,
  PresetRef,
  FcModel,
  ModModel,
  PresetSummary
} from './types';

const BASE = import.meta.env.VITE_FORGEFX_BASE ?? '/api';

class ForgeError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ForgeError';
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // Serial-backed requests are serialized on the server; under load a few can queue.
  // A 12s ceiling means a genuinely hung request surfaces as an error instead of an
  // endless 'loading' spinner. Well above any healthy round-trip (~0.6s worst case).
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(12000),
    ...init
  });
  if (!res.ok) throw new ForgeError(res.status, `${init?.method ?? 'GET'} ${path} → ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : (res.arrayBuffer() as unknown)) as Promise<T>;
}

export const forgefx = {
  // ── system ──
  health: () => req<Health>('/healthz'),
  device: () => req<DeviceInfo>('/device'),
  /** Auto-detect the connected Fractal unit (FM3/FM9/Axe-Fx/…) via the handshake. */
  detect: () => req<DetectResult>('/device/detect'),
  /** List all serial + MIDI connections (Fractal flagged) + the chosen one / manual override. */
  listPorts: () => req<PortList>('/ports'),
  /** Manually pick a connection, or null to clear back to auto-detect. */
  selectPort: (conn: ConnPick | null) => req<{ ok: boolean }>('/ports/select', { method: 'POST', body: JSON.stringify(conn ?? { id: null }) }),

  // ── catalog (static) ──
  blocks: () => req<BlockSummary[]>('/blocks'),
  blockTypes: (slug: string) =>
    req<{ value: number; name: string; manufacturer: string | null; basedOn: string | null }[]>(
      `/blocks/${slug}/types`
    ),

  // ── preset + grid (live) ──
  currentPreset: () => req<PresetRef>('/preset'),
  preset: (n: number) => req<PresetRef>(`/presets/${n}`),
  grid: () => req<PresetGrid>('/preset/grid'),
  /** AM4 (model 0x15) — its 4 slots as a 1×4 grid, rendered by the same Signal Grid. */
  am4Grid: () => req<PresetGrid>('/am4/grid'),
  presetGrid: (n: number) => req<PresetGrid>(`/presets/${n}/grid`),
  /** Placed blocks: position + routing + live bypass/channel. */
  presetBlocks: () => req<PresetBlock[]>('/preset/blocks'),
  selectPreset: (number: number) =>
    req<{ ok: boolean; number: number }>('/preset/select', {
      method: 'POST',
      body: JSON.stringify({ number })
    }),
  /** Store the edit buffer to a preset slot. DESTRUCTIVE — overwrites that location. */
  store: (number: number) =>
    req<{ ok: boolean }>('/preset/store', {
      method: 'POST',
      body: JSON.stringify({ number })
    }),

  // ── live block parameters (addressed by the placed instance's effect id) ──
  blockParams: (eid: number) => req<BlockParams>(`/preset/blocks/${eid}/params`),
  /** Set a parameter. continuous=true (knob, value 0..1) by default; false sends an enum ordinal. */
  setParam: (eid: number, paramId: number, value: number, continuous = true) =>
    req<{ ok: boolean }>(`/preset/blocks/${eid}/params/${paramId}`, {
      method: 'PUT',
      body: JSON.stringify({ value, continuous })
    }),
  /** Decode a device preset by number (non-disruptive) → library summary (name, scenes, blocks). */
  presetSummary: (n: number) => req<PresetSummary>(`/presets/${n}/summary`),
  /** Decode a preset .syx file (raw bytes) offline → library summary. */
  decodePresetFile: async (bytes: ArrayBuffer | Uint8Array): Promise<PresetSummary> => {
    const res = await fetch(`${BASE}/preset/decode`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as BodyInit,
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new ForgeError(res.status, (await res.json().catch(() => ({})))?.error ?? res.statusText);
    return res.json();
  },
  /** Foot Controller address model (field bases + config formula + enums); null if not decoded. */
  fcModel: () => req<FcModel | null>(`/fc/model`),
  /** Modifier address model (field → paramId); null if not decoded. */
  modModel: () => req<ModModel | null>(`/mod/model`),
  /** Bind a modifier slot to a target parameter (writes targetEffectId + targetParam + source). */
  modBind: (slot: number, targetEffectId: number, targetParam: number, source: number) =>
    req<{ ok: boolean; slotEid?: number; error?: string }>(`/mod/bind`, {
      method: 'POST',
      body: JSON.stringify({ slot, targetEffectId, targetParam, source })
    }),
  /** Raw param values for an effect (FC 199 / Modifier 3), keyed by paramId. */
  rawBlock: (eid: number) => req<{ eid: number; values: Record<string, number> }>(`/preset/blocks/${eid}/raw`),
  /** Read specific paramIds via per-pid GET (FC current state). Returns {pid: value}. */
  readParams: (eid: number, pids: number[]) =>
    req<Record<string, number>>(`/preset/blocks/${eid}/read`, { method: 'POST', body: JSON.stringify({ pids }) }),
  /** Cab IR names per bank (Factory 1/2, Legacy, Scratchpad) — for the cab IR picker. */
  cabIrs: () => req<Record<string, string[]>>(`/cab/irs`),
  /** Current cab block state (mode / per-slot bank + IR + dyna type) for the picker. */
  cabState: (eid: number) => req<CabState>(`/preset/blocks/${eid}/cab`),
  /** Change the block's model/type by ordinal. */
  setType: (eid: number, value: number) =>
    req<{ ok: boolean }>(`/preset/blocks/${eid}/type`, { method: 'POST', body: JSON.stringify({ value }) }),
  setBypass: (eid: number, bypassed: boolean) =>
    req<{ ok: boolean }>(`/preset/blocks/${eid}/bypass`, {
      method: 'POST',
      body: JSON.stringify({ bypassed })
    }),
  setChannel: (eid: number, channel: string) =>
    req<{ ok: boolean }>(`/preset/blocks/${eid}/channel`, {
      method: 'POST',
      body: JSON.stringify({ channel })
    }),

  // ── grid editing (1-indexed row/col) ──
  /** Place a block (by effect id) at a cell, or clear it (blockId 0). */
  placeCell: (row: number, col: number, blockId: number) =>
    req<{ ok: boolean }>('/preset/grid/cell', {
      method: 'PUT',
      body: JSON.stringify({ row, col, blockId })
    }),
  clearCell: (row: number, col: number) =>
    req<{ ok: boolean }>('/preset/grid/cell', {
      method: 'PUT',
      body: JSON.stringify({ row, col, blockId: 0 })
    }),
  /** Cable (srcRow,srcCol)→(destRow,srcCol+1). connect=false removes it. 1-indexed. */
  cable: (srcRow: number, srcCol: number, destRow: number, connect = true) =>
    req<{ ok: boolean }>('/preset/grid/cable', {
      method: 'POST',
      body: JSON.stringify({ srcRow, srcCol, destRow, connect })
    }),
  /** Move the device's edit cursor to a cell so the FM3 screen follows the UI. 1-indexed. */
  selectCell: (row: number, col: number) =>
    req<{ ok: boolean }>('/preset/grid/select', {
      method: 'POST',
      body: JSON.stringify({ row, col })
    }),

  // ── telemetry: tuner · tempo · scene ──
  setTuner: (on: boolean) => req<{ ok: boolean }>('/tuner', { method: 'POST', body: JSON.stringify({ on }) }),
  getTempo: () => req<{ bpm: number }>('/tempo'),
  setTempo: (bpm: number) => req<{ ok: boolean }>('/tempo', { method: 'POST', body: JSON.stringify({ bpm }) }),
  tapTempo: () => req<{ ok: boolean }>('/tempo/tap', { method: 'POST' }),
  getScene: () => req<{ index: number }>('/scene'),
  setScene: (index: number) => req<{ ok: boolean }>('/scene', { method: 'POST', body: JSON.stringify({ index }) }),
  /** Per-block meter values (always-on grid level fill + swipe controls). */
  meters: (wants: Record<string, number[]> = {}) =>
    req<import('./types').BlockMeter[]>('/preset/meters', {
      method: 'POST',
      body: JSON.stringify({ wants })
    }),

  /** Subscribe to the live event stream (tuner/tempo/scene/cpu). Returns the EventSource so the
   * caller can close it. Reconnects automatically (EventSource default). */
  events: (onEvent: (e: DeviceEvent) => void): EventSource => {
    const es = new EventSource(`${BASE}/events`);
    es.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data) as DeviceEvent);
      } catch {
        /* ignore malformed frame */
      }
    };
    return es;
  },

  // ── backup / restore ──
  backupPreset: (n: number) => req<ArrayBuffer>(`/presets/${n}/backup`),
  backupCurrent: () => req<ArrayBuffer>('/preset/backup'),
  restorePreset: (bytes: ArrayBuffer) =>
    fetch(`${BASE}/presets/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes
    })
};

export { ForgeError };
