// Versioning for the persisted caches that hold DECODED preset param values (display values the server's
// decoder produced — e.g. the library's per-preset param index and the params embedded in imported-file
// summaries). Those values depend on how the decoder maps a stored raw to a display number, so when that
// mapping changes (e.g. log-taper params decoded to their true display value instead of linearly) an old
// cache must NOT be served next to freshly decoded values: deep search would compare two different scales.
//
// Bump PARAMS_DECODE_VERSION whenever the server/codec changes how preset params decode. Anything cached
// under another version — including legacy caches written before versioning existed — is dropped and
// re-decoded. Framework-free so it is unit-tested directly (library.svelte.ts is a runes store).

/** Version of the preset-param decode the caches below were written with. 1 = the implicit, unversioned
 *  era (linear decode of log-taper params); 2 = log-taper params decoded to their true display value. */
export const PARAMS_DECODE_VERSION = 2;

/** On-disk envelope for a decoded-params cache blob (IndexedDB). */
export interface ParamsEnvelope<T> {
  v: number;
  params: T;
}

export function wrapParams<T>(params: T): ParamsEnvelope<T> {
  return { v: PARAMS_DECODE_VERSION, params };
}

/** The cached params when `raw` is an envelope of the CURRENT decode version, else null — a legacy
 *  (unversioned) blob, another version, or anything malformed is never served. */
export function unwrapParams<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as { v?: unknown; params?: unknown };
  if (e.v !== PARAMS_DECODE_VERSION) return null;
  if (!e.params || typeof e.params !== 'object') return null;
  return e.params as T;
}

/** Read a decoded-params cache from a key→value store. Only a current-version envelope is served; a legacy
 *  (unversioned) blob or another version is deleted from the store and treated as absent, so the caller
 *  re-decodes instead of mixing scales. */
export async function loadParamsCache<T>(
  kv: { get: (key: string) => Promise<unknown>; del: (key: string) => Promise<unknown> },
  key: string
): Promise<T | null> {
  const raw = await kv.get(key);
  const params = unwrapParams<T>(raw);
  if (params === null && raw !== undefined) await kv.del(key);
  return params;
}

/** True when a stored decode version (localStorage marker) is missing or not the current one. */
export function isStaleParamsVersion(stored: unknown): boolean {
  return stored !== PARAMS_DECODE_VERSION;
}

/** Persisted entries whose summaries embed decoded `params` (imported files): when the stored version is
 *  stale, drop the embedded params so a stale scale is never searched; the caller re-decodes them from the
 *  raw bytes. Returns the input untouched (same references) when the version is current. */
export function dropStaleEmbeddedParams<T extends { summary: { params?: unknown } }>(
  items: T[],
  storedVersion: unknown
): { items: T[]; stale: boolean } {
  if (!isStaleParamsVersion(storedVersion)) return { items, stale: false };
  return { items: items.map((it) => ({ ...it, summary: { ...it.summary, params: undefined } }) as T), stale: true };
}
