// Typed client for the ForgeFX HTTP API (resource-oriented, named).
// Dev: Vite proxies /api -> http://localhost:5056 (vite.config.ts strips /api).
// Prod: ForgeFX.Server serves Axis, so /api is same-origin (set VITE_FORGEFX_BASE to override).
import type {
  BlockParams,
  BlockSummary,
  DeviceInfo,
  Health,
  PresetBlock,
  PresetGrid,
  PresetRef
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
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
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

  // ── catalog (static) ──
  blocks: () => req<BlockSummary[]>('/blocks'),
  blockTypes: (slug: string) => req<{ value: string; name: string }[]>(`/blocks/${slug}/types`),

  // ── preset + grid (live) ──
  currentPreset: () => req<PresetRef>('/preset'),
  preset: (n: number) => req<PresetRef>(`/presets/${n}`),
  grid: () => req<PresetGrid>('/preset/grid'),
  presetGrid: (n: number) => req<PresetGrid>(`/presets/${n}/grid`),
  /** Placed blocks: position + routing + live bypass/channel. */
  presetBlocks: () => req<PresetBlock[]>('/preset/blocks'),
  selectPreset: (number: number) =>
    req<{ ok: boolean; number: number }>('/preset/select', {
      method: 'POST',
      body: JSON.stringify({ number })
    }),

  // ── live block parameters (named) ──
  blockParams: (slug: string) => req<BlockParams>(`/preset/blocks/${slug}/params`),
  /** Set a parameter. continuous=true (knob, value 0..1) by default; typed=false sends an ordinal. */
  setParam: (slug: string, param: string, value: number, continuous = true) =>
    req<{ ok: boolean }>(`/preset/blocks/${slug}/params/${encodeURIComponent(param)}`, {
      method: 'PUT',
      body: JSON.stringify({ value, continuous })
    }),
  setBypass: (slug: string, bypassed: boolean) =>
    req<{ ok: boolean }>(`/preset/blocks/${slug}/bypass`, {
      method: 'POST',
      body: JSON.stringify({ bypassed })
    }),
  setChannel: (slug: string, channel: string) =>
    req<{ ok: boolean }>(`/preset/blocks/${slug}/channel`, {
      method: 'POST',
      body: JSON.stringify({ channel })
    }),

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
