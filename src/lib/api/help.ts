// Client for the ForgeFX block & parameter help API (curated tooltips).
//
// Self-contained on purpose: it mirrors the BASE/fetch conventions of
// `forgefx.ts` without importing from it, so the help feature stays in its
// own module. Serves the copy surfaced in the grid-bottom status area when
// the user hovers a block or a parameter.

const BASE = import.meta.env.VITE_FORGEFX_BASE ?? '/api';

export interface ParamHelp {
  blurb: string;
  tip?: string;
}

export interface BlockHelp {
  family: string;
  slug: string;
  device: string;
  summary: string;
  detail?: string;
  /** param help keyed by paramId */
  params: Record<number, ParamHelp>;
  /** param help keyed by the editor symbol name (e.g. 'REVERB_TIME') */
  paramsByName: Record<string, ParamHelp>;
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Per-slug cache: help copy is static for a given device session, so a block
// is fetched at most once. (Re-detecting a different device clears it.)
const cache = new Map<string, BlockHelp | null>();
let cachedDevice: string | null = null;

/** Drop the cache when the connected device changes (overrides differ). */
export function resetHelpCache(device: string | null): void {
  if (device !== cachedDevice) {
    cache.clear();
    cachedDevice = device;
  }
}

/**
 * Map an Axis grid `pack` / block display name to the ForgeFX help slug.
 * The help API keys on the codec slug (e.g. 'amp', 'reverb', 'drive'); the
 * grid carries a `pack` like 'Amp' / 'Reverb' / 'Drive', so we lower-case
 * and special-case the few that diverge.
 */
export function helpSlugForPack(pack: string | null | undefined): string | null {
  if (!pack) return null;
  const p = pack.toLowerCase();
  // editor pack 'drive' covers both Drive (OD) and Fuzz; the help slug is 'drive'.
  return p;
}

/** Fetch (and cache) the help record for a block slug. null if none. */
export async function blockHelp(slug: string | null | undefined): Promise<BlockHelp | null> {
  if (!slug) return null;
  if (cache.has(slug)) return cache.get(slug) ?? null;
  const data = await get<BlockHelp>(`/help/blocks/${slug}`);
  cache.set(slug, data);
  return data;
}

/** One-line summary string for a block, fetched on demand. */
export async function blockSummary(slug: string | null | undefined): Promise<string | null> {
  const h = await blockHelp(slug);
  return h?.summary ?? null;
}

/**
 * Param blurb for (slug, paramId). Falls back to symbol-name lookup if the
 * caller passes a name instead of a numeric id.
 */
export async function paramHelp(
  slug: string | null | undefined,
  paramId: number | undefined,
  paramName?: string
): Promise<ParamHelp | null> {
  const h = await blockHelp(slug);
  if (!h) return null;
  if (paramId != null && h.params[paramId]) return h.params[paramId];
  if (paramName && h.paramsByName[paramName]) return h.paramsByName[paramName];
  return null;
}
