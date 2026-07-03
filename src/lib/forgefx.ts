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
  FcReadState,
  TelemetryStatus,
  DebugReport,
  ModModel,
  PresetSummary,
  DecodedBlock,
  VersionInfo,
  CloudVersion
} from './types';

const BASE = import.meta.env.VITE_FORGEFX_BASE ?? '/api';

// Per-tab client id, stamped onto config writes (putDoc) so the live cross-UI sync can tell a UI's own echo
// from a genuine change made elsewhere (host↔remote). See editor.applyDeviceEvent('config').
export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

class ForgeError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ForgeError';
  }
}

/** Fleet-telemetry hook: invoked for every server-side (5xx) or network failure so the store can
 *  auto-report it to Faro with device context. 4xx (expected client errors like a 401 bad password) are
 *  deliberately NOT reported — they're not bugs. Registered by the editor; null until then / in tests. */
let onReqFailure: ((info: { route: string; method: string; status: number; message: string }) => void) | null = null;
export function setRequestFailureReporter(fn: typeof onReqFailure): void { onReqFailure = fn; }
const reportFailure = (route: string, method: string, status: number, message: string) => {
  try { if (status >= 500 || status === 0) onReqFailure?.({ route, method, status, message }); } catch { /* never let reporting break a request */ }
};

// ── Pluggable transport (Axis Cloud Remote) ────────────────────────────────────────────────────────
// The same client can run over HTTP (local ForgeFX) or a relay (a remote browser controlling the user's
// PC via the Supabase Realtime channel). A remote transport takes a request and returns a response
// envelope; req() applies identical parsing + failure reporting either way. null = local HTTP (default,
// unchanged). NOTE: only req()-based calls route through this; the SSE `events()` stream and the few
// direct-fetch helpers (binary upload/restore) get their own relay handling in a later increment.
export type RemoteResponse = { status: number; contentType: string; body: string | ArrayBuffer };
export type RemoteTransport = (rq: { method: string; path: string; body?: string }) => Promise<RemoteResponse>;
let remote: RemoteTransport | null = null;
// Latency layer for remote mode: coalesce identical in-flight GETs into one relay round-trip, and keep a
// session cache for device-static endpoints (catalogs/help/address models) so opening blocks + dropdowns
// doesn't re-hit the relay every time. Cleared whenever the transport changes (connect / reconnect).
const remoteInflight = new Map<string, Promise<unknown>>();
/** GET endpoints whose result is fixed for the connected device — safe to cache for the whole session. */
function remoteCacheable(path: string): boolean {
  const p = path.split('?')[0] ?? path;
  return (
    p === '/blocks' ||
    p === '/cab/irs' ||
    p === '/mod/model' ||
    p === '/fc/model' ||
    /^\/blocks\/[^/]+\/(types|params|help)$/.test(p) ||
    /^\/help\//.test(p)
  );
}
export function setRemoteTransport(fn: RemoteTransport | null): void {
  remote = fn;
  remoteInflight.clear();
}
export const isRemote = (): boolean => remote !== null;

/** One relay round-trip with identical parsing + failure reporting as local mode. */
async function relayReq<T>(path: string, method: string, init?: RequestInit): Promise<T> {
  let r: RemoteResponse;
  try {
    r = await remote!({ method, path, body: typeof init?.body === 'string' ? init.body : undefined });
  } catch (e) {
    reportFailure(path, method, 0, (e as Error)?.message ?? 'relay error');
    throw e;
  }
  if (r.status < 200 || r.status >= 300) {
    reportFailure(path, method, r.status, `${method} ${path} → ${r.status}`); // self-filters to 5xx/0
    throw new ForgeError(r.status, `${method} ${path} → ${r.status}`);
  }
  return (r.contentType.includes('json') && typeof r.body === 'string' ? JSON.parse(r.body) : r.body) as T;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  // ── remote mode: route the request through the relay transport (with cache + in-flight dedup) ──
  if (remote) {
    if (method === 'GET') {
      const hit = remoteInflight.get(path);
      if (hit) return hit as Promise<T>;
      const p = relayReq<T>(path, method, init);
      const keep = remoteCacheable(path); // session-cache static endpoints; otherwise just dedup in-flight
      remoteInflight.set(path, p);
      p.then(() => { if (!keep) remoteInflight.delete(path); }, () => remoteInflight.delete(path));
      return p;
    }
    return relayReq<T>(path, method, init);
  }
  // ── local mode: HTTP to ForgeFX (default) ──
  // Serial-backed requests are serialized on the server; under load a few can queue.
  // A 12s ceiling means a genuinely hung request surfaces as an error instead of an
  // endless 'loading' spinner. Well above any healthy round-trip (~0.6s worst case).
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(12000),
      ...init
    });
  } catch (e) {
    // network failure / timeout / engine down — report as status 0 (no HTTP response)
    reportFailure(path, method, 0, (e as Error)?.message ?? 'network error');
    throw e;
  }
  if (!res.ok) {
    reportFailure(path, method, res.status, `${method} ${path} → ${res.status}`);
    throw new ForgeError(res.status, `${method} ${path} → ${res.status}`);
  }
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
  // `model` forces a device profile ('auto' clears it); omit to leave the profile override untouched.
  selectPort: (conn: ConnPick | null, model?: string) => req<{ ok: boolean }>('/ports/select', { method: 'POST', body: JSON.stringify({ ...(conn ?? { id: null }), ...(model !== undefined ? { model } : {}) }) }),

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
  // LEGACY /am4/* aliases (deprecated server-side) — kept ONLY for the v1-server fallback paths.
  /** @deprecated legacy v1 fallback — API v2 serves the AM4 through the unified grid(). */
  am4Grid: () => req<PresetGrid>('/am4/grid'),
  /** @deprecated legacy v1 fallback — API v2 serves AM4 params through blockParams(). */
  am4BlockParams: (pidLow: number) => req<BlockParams>(`/am4/blocks/${pidLow}/params`),
  /** @deprecated legacy v1 fallback — API v2 lists stored locations via presetLocations(). */
  am4Presets: () => req<{ count: number; presets: { location: number; code: string; name: string; isEmpty: boolean }[] }>('/am4/presets'),
  /** @deprecated legacy v1 fallback — API v2 loads a location via selectPreset(). */
  am4SwitchPreset: (location: number) =>
    req<{ ok: boolean }>('/am4/preset', { method: 'POST', body: JSON.stringify({ location }) }),
  /** @deprecated legacy v1 fallback — API v2 switches scenes via setScene(). */
  am4SetScene: (index: number) =>
    req<{ ok: boolean }>('/am4/scene', { method: 'POST', body: JSON.stringify({ index }) }),
  /** @deprecated legacy v1 fallback — API v2 writes continuous params via setParam(…, true). */
  am4SetParamNorm: (pidLow: number, pidHigh: number, norm: number) =>
    req<{ ok: boolean }>(`/am4/blocks/${pidLow}/params/${pidHigh}`, { method: 'PUT', body: JSON.stringify({ norm }) }),
  /** @deprecated legacy v1 fallback — API v2 writes discrete params via setParam(…, false). */
  am4SetParamValue: (pidLow: number, pidHigh: number, value: number) =>
    req<{ ok: boolean }>(`/am4/blocks/${pidLow}/params/${pidHigh}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  presetGrid: (n: number) => req<PresetGrid>(`/presets/${n}/grid`),
  /** Placed blocks: position + routing + live bypass/channel. */
  presetBlocks: () => req<PresetBlock[]>('/preset/blocks'),
  selectPreset: (number: number) =>
    req<{ ok: boolean; number: number }>('/preset/select', {
      method: 'POST',
      body: JSON.stringify({ number })
    }),
  /** Store the edit buffer to a preset slot. DESTRUCTIVE — overwrites that location.
   *  `location`/`code` are ADDITIVE (bank-letter devices report e.g. "C02"). */
  store: (number: number) =>
    req<{ ok: boolean; location?: number; code?: string }>('/preset/store', {
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
  // ── preset versions / backups ──
  versions: (location?: number) => req<{ versions: VersionInfo[] }>(`/versions${location != null ? `?location=${location}` : ''}`),
  snapshotPreset: (n: number) => req<{ version: VersionInfo }>(`/backup/preset/${n}`, { method: 'POST' }),
  /** Full device backup — snapshots every populated slot into the version store as one backup set. */
  // Full device backup dumps every populated slot — minutes on a full unit. Override the default 12s
  // ceiling with a generous one so the client doesn't abort a backup that's still running.
  backupDevice: (label = 'Full device backup') => req<{ id: string; count: number }>(`/backup/device`, { method: 'POST', body: JSON.stringify({ label }), signal: AbortSignal.timeout(600000) }),
  versionSyx: (id: string) => fetch(`${BASE}/version/${id}/syx`).then((r) => r.blob()),
  loadVersion: (id: string) => req<{ ok: boolean }>(`/version/${id}/load`, { method: 'POST' }),
  /** Restore a snapshot to its origin slot (load + commit to that slot — destructive for the slot). */
  restoreVersion: (id: string) => req<{ ok: boolean; location: number }>(`/version/${id}/restore`, { method: 'POST' }),
  /** Load arbitrary raw .syx bytes (an imported file/folder preset) straight into the edit buffer. */
  loadBytes: (bytes: ArrayBuffer | Uint8Array) =>
    fetch(`${BASE}/preset/load`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes as BodyInit, signal: AbortSignal.timeout(12000) })
      .then((r) => { if (!r.ok) throw new ForgeError(r.status, `load → ${r.status}`); return r.json() as Promise<{ ok: boolean }>; }),
  // ── cloud sync (gated server-side by AXIS_CLOUD) ──
  cloudStatus: () => req<{ enabled: boolean; url?: string; user: { id: string; email: string } | null; subscription?: { active: boolean; plan: string | null } }>('/cloud/status'),
  cloudRegister: (email: string, password: string) => req<{ user: { id: string; email: string } | null; needsConfirmation?: boolean }>('/cloud/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  cloudLogin: (email: string, password: string) => req<{ user: { id: string; email: string } }>('/cloud/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  cloudLogout: () => req<{ ok: boolean }>('/cloud/logout', { method: 'POST' }),
  cloudDeleteAccount: () => req<{ ok: boolean }>('/cloud/delete-account', { method: 'POST' }),
  // The first sync after a full-device backup uploads 100+ blobs — minutes of work. Long timeout so
  // the client doesn't abort a sync that's still making progress.
  cloudSync: (scopes?: { config?: boolean; presets?: boolean }) => req<{ config: { pushed: number; pulled: number }; versions: { pushed: number; pulled: number } }>('/cloud/sync', { method: 'POST', body: JSON.stringify(scopes ? { scopes } : {}), signal: AbortSignal.timeout(600000) }),
  /** The cloud's view of every backed-up preset version (metadata only) — for computing per-preset sync state. */
  cloudIndex: () => req<{ versions: CloudVersion[] }>('/cloud/index'),
  // ── Axis Cloud Remote (host side): let a remote browser control this device (off by default) ──
  remoteStatus: () => req<{ enabled: boolean; connected: boolean; userId: string | null }>('/remote/status'),
  remoteEnable: (on: boolean) => req<{ enabled: boolean; connected: boolean; userId: string | null; error?: string }>('/remote/enable', { method: 'POST', body: JSON.stringify({ on }) }),
  // ── persistent store (Axis config / metadata) ──
  getDoc: <T>(c: string, id: string) => req<{ data: T } | null>(`/store/${c}/${id}`).catch(() => null),
  putDoc: (c: string, id: string, data: unknown) => req(`/store/${c}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ data, origin: CLIENT_ID }) }),
  listDocs: <T>(c: string) => req<{ docs: { id: string; data: T; updatedAt: number }[] }>(`/store/${c}`),
  /** Decode a device preset by number (non-disruptive) → library summary (name, scenes, blocks). */
  presetSummary: (n: number, full = false) => req<PresetSummary>(`/presets/${n}/summary${full ? '?full=1' : ''}`),
  /** Full per-block decoded params for a device preset (every family/param) — deep search + detail. */
  presetParams: (n: number) => req<{ blocks: DecodedBlock[] }>(`/presets/${n}/params`),
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
  /** Current FC switch state via the sub-0x01 structured config-selector read. tap/hold each carry a
   *  `present` flag (the device returned a record matching the requested config/side) and the raw 78-byte
   *  response body. config/side are device-confirmed; interior field bytes are not yet decoded. */
  fcState: (layout: number, view: number, sw: number) =>
    req<FcReadState>(`/fc/state?layout=${layout}&view=${view}&switch=${sw}`),
  // ── telemetry / diagnostics ──
  diag: () => req<unknown>('/diag'),
  telemetryStatus: () => req<TelemetryStatus>('/telemetry/status'),
  uploadDebugReport: (report: DebugReport) =>
    req<{ path: string; bytes: number; stored: number }>('/telemetry/report', { method: 'POST', body: JSON.stringify(report) }),
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
  /** Rename a scene (0-based index) in the working buffer. Visible immediately; not yet persisted to flash. */
  setSceneName: (index: number, name: string) =>
    req<{ ok: boolean }>('/scene/name', { method: 'POST', body: JSON.stringify({ index, name }) }),
  /** Rename the working-buffer preset. Visible immediately; not yet persisted to flash (use store to save). */
  setPresetName: (name: string) =>
    req<{ ok: boolean }>('/preset/name', { method: 'POST', body: JSON.stringify({ name }) }),
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
    }),

  // ── per-block monitor (meter) table: paramName → {pid, role, dB range} ──
  monitors: () => req<import('./types').MonitorParams>('/preset/monitors'),
  /** Live per-block audio meters: each placed monitored block's normalized level + dB. */
  monitorsLive: (eid?: number) =>
    req<import('./types').LiveMonitor[]>(`/preset/monitors/live${eid != null ? `?eid=${eid}` : ''}`),

  // ── unified device tools (API v2, capability-gated server-side → 501 {error:'unsupported'}) ──
  /** Fast stored-location name scan (caps presets.canScanNames) — the library index for devices
   *  without full preset dumps. */
  presetLocations: () => req<import('./types').PresetLocations>('/preset/locations'),
  /** Verbatim .syx dump of one preset (location omitted → active buffer). Caps backupDump. */
  presetBackup: (location?: number) =>
    req<import('./types').PresetBackup>('/preset/backup', { method: 'POST', body: JSON.stringify(location != null ? { location } : {}) }),
  /** Verbatim re-emit of a preset dump (byte array) to its stored location. Caps restoreDump. */
  presetRestore: (bytes: number[]) =>
    req<{ ok: boolean; location: number | null; code: string | null }>('/preset/restore', { method: 'POST', body: JSON.stringify({ bytes }) }),
  /** Validate a firmware .syx envelope (integrity check only — NOT a flasher). Caps firmwareValidate. */
  validateFirmware: (bytes: number[]) =>
    req<import('./types').FirmwareValidateResult>('/firmware/validate', { method: 'POST', body: JSON.stringify({ bytes }) }),
  /** Offline decode of a preset .syx via JSON bytes — model-sniffed server-side (gen-3 → summary;
   *  AM4 → location/name listing). Rides the relay transport, unlike the octet-stream decode. */
  decodeSyxBytes: (bytes: number[]) =>
    req<import('./types').SyxDecodeResult>('/preset/decode', { method: 'POST', body: JSON.stringify({ bytes }) }),

  // ── AM4 (model 0x15) — LEGACY v1 routes (deprecated aliases server-side). Kept ONLY as the
  //    fallback path when the backend doesn't speak API v2; do not add new call sites. ──
  /** @deprecated legacy v1 fallback — API v2 serves the unified model via modModel(). */
  am4ModModel: () => req<import('./types').Am4ModifierModel>('/am4/mod/model'),
  /** @deprecated legacy v1 fallback — API v2 stores via store(). */
  am4StorePreset: (location: number) =>
    req<{ ok: boolean; location: number; code: string }>('/am4/preset/store', { method: 'POST', body: JSON.stringify({ location }) }),
  /** @deprecated legacy v1 fallback — API v2 backs up via presetBackup(). */
  am4BackupPreset: (location?: number) =>
    req<import('./types').Am4Backup>('/am4/preset/backup', { method: 'POST', body: JSON.stringify(location != null ? { location } : {}) }),
  /** @deprecated legacy v1 fallback — API v2 restores via presetRestore(). */
  am4RestorePreset: (bytes: number[]) =>
    req<{ ok: boolean; location: number | null; code: string | null }>('/am4/preset/restore', { method: 'POST', body: JSON.stringify({ bytes }) }),
  /** @deprecated legacy v1 fallback — API v2 decodes via decodeSyxBytes(). */
  am4DecodeSyx: (bytes: number[]) =>
    req<import('./types').Am4Decode>('/am4/preset/decode', { method: 'POST', body: JSON.stringify({ bytes }) }),
  /** @deprecated legacy v1 fallback — API v2 validates via validateFirmware(). */
  am4ValidateFirmware: (bytes: number[]) =>
    req<import('./types').Am4FirmwareResult>('/am4/firmware/validate', { method: 'POST', body: JSON.stringify({ bytes }) })
};

export { ForgeError };
