// Read-only block visuals (graph tiles) as the server serves them on the block-params response (cap
// `blockVisuals`): parse what arrived, tolerating its absence or an unexpected shape. Which parameter plays
// which role is decided by the server (forgefx-midi role tables, resolved against the device's own
// catalog); nothing here knows catalog symbols or paramIds. Pure (blockVisuals.test.ts).

import type { BlockVisual, BlockVisualKind } from './types';

export const BLOCK_VISUAL_KINDS: readonly BlockVisualKind[] = ['dynamics', 'lfo', 'response', 'decay', 'echo', 'adsr', 'cabAlign', 'eq', 'dynaCab'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isKind = (v: unknown): v is BlockVisualKind => typeof v === 'string' && (BLOCK_VISUAL_KINDS as readonly string[]).includes(v);
/** Keys become part of a board key (`graph:<key>`): word characters only. */
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

function parseVisual(raw: unknown): BlockVisual | null {
  if (!isObj(raw) || typeof raw.key !== 'string' || !KEY_RE.test(raw.key) || !isKind(raw.kind)) return null;
  if (!isObj(raw.roles)) return null;
  const roles: Record<string, number> = {};
  for (const [role, id] of Object.entries(raw.roles)) {
    if (typeof id === 'number' && Number.isInteger(id) && id >= 0) roles[role] = id;
  }
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : raw.key;
  const out: BlockVisual = { key: raw.key, kind: raw.kind, title, roles };
  if (typeof raw.mode === 'string' && raw.mode) out.mode = raw.mode;
  if (raw.kind === 'eq') {
    if (!Array.isArray(raw.bands)) return null;
    out.bands = raw.bands.flatMap((b) => {
      if (!isObj(b) || typeof b.key !== 'string') return [];
      const band: NonNullable<BlockVisual['bands']>[number] = { key: b.key };
      for (const k of ['gain', 'freq', 'q', 'type'] as const) if (typeof b[k] === 'number' && Number.isInteger(b[k]) && b[k] >= 0) band[k] = b[k];
      if (typeof b.centerHz === 'number' && Number.isFinite(b.centerHz) && b.centerHz > 0) band.centerHz = b.centerHz;
      if (typeof b.label === 'string' && b.label.trim()) band.label = b.label.trim();
      if (['bell', 'lowshelf', 'highshelf', 'lowcut', 'highcut'].includes(String(b.shape))) band.shape = b.shape as typeof band.shape;
      return band.freq != null || (band.gain != null && (band.centerHz != null || raw.mode === 'graphic')) ? [band] : [];
    });
    if (!out.bands.length) return null;
  }
  return out;
}

/** The server's `visuals`, or undefined when it sent none or something that is not a list. Malformed
 *  entries are dropped; a repeated key keeps its first entry. */
export function parseBlockVisuals(raw: unknown): BlockVisual[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: BlockVisual[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const v = parseVisual(r);
    if (!v || seen.has(v.key)) continue;
    seen.add(v.key);
    out.push(v);
  }
  return out;
}

/** Board / catalog key of a visual. */
export const GRAPH_KEY_PREFIX = 'graph:';
export const graphCatalogKey = (visualKey: string): string => GRAPH_KEY_PREFIX + visualKey;
export const isGraphKey = (key: string): boolean => key.startsWith(GRAPH_KEY_PREFIX) && key.length > GRAPH_KEY_PREFIX.length;
