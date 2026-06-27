// Typed client for the ForgeFX HTTP API.
// Dev: Vite proxies /api -> http://localhost:5056 (see vite.config.ts).
// Prod: ForgeFX.Server serves Axis, so /api is same-origin (set VITE_FORGEFX_BASE to override).
import type { BlockParams, Firmware, Health } from './types';

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
  health: () => req<Health>('/healthz'),
  firmware: () => req<Firmware>('/firmware'),

  /** All blocks that have a definition pack (names). */
  blocks: () => req<string[]>('/blocks'),

  /** Current preset number + name. */
  currentPreset: () => req<{ number: number; name: string }>('/preset/current'),

  /** Named, scaled parameter values for one block. */
  blockParams: (name: string) => req<BlockParams>(`/block/${encodeURIComponent(name)}/params`),

  /** Select a preset by number. */
  selectPreset: (n: number) =>
    req<{ ok: boolean; preset: number }>('/preset', {
      method: 'POST',
      body: JSON.stringify({ n })
    }),

  /** Set a parameter. effect = block id/page; addr = SET address bytes; value = float. */
  setParam: (effect: number, addr: number[], value: number) =>
    req<{ ok: boolean; stored: number }>('/param', {
      method: 'POST',
      body: JSON.stringify({ effect, addr, value })
    }),

  /** Raw dump of a block page (3-byte ÷65536 normalized values). */
  dump: (page: number) => req<number[]>(`/dump/${page}`),

  backupPreset: (n: number) => req<ArrayBuffer>(`/preset/${n}/backup`),
  backupCurrent: () => req<ArrayBuffer>('/preset/current/backup'),
  restorePreset: (bytes: ArrayBuffer) =>
    fetch(`${BASE}/preset/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes
    })
};

/** Build the SET address for a (page, index) on a block. effect == page (block id == page). */
export function paramAddr(page: number, index: number): { effect: number; addr: number[] } {
  return { effect: page, addr: [0, page, 0, index, 0] };
}

export { ForgeError };
