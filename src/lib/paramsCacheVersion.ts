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

/** A persisted imported-file record. `paramsV` stamps WHICH decode version this file's embedded `params`
 *  came from — per file, so one file the server rejects never forces the whole library to be re-decoded. */
export interface PersistedFile {
  id: string;
  folder?: string;
  summary: { params?: unknown };
  paramsV?: number;
}

/** Load-time settle for persisted imported files. A file stamped with the current decode version is kept
 *  untouched (same reference). Any other (missing / older stamp) has its embedded params dropped so a stale
 *  scale is never searched, and then:
 *  - `canRedecode` (the raw bytes live in IndexedDB) → its id is returned in `pending` and its stamp is left
 *    stale, so a crash or a failed re-decode is retried;
 *  - otherwise there are no bytes to re-decode from, so it is settled on the spot: params dropped, stamp
 *    advanced — it is not dropped again on every launch. */
export function settleFilesOnLoad<T extends PersistedFile>(
  items: T[],
  canRedecode: boolean
): { items: T[]; pending: string[] } {
  const pending: string[] = [];
  const out = items.map((it) => {
    if (it.paramsV === PARAMS_DECODE_VERSION) return it;
    const dropped = { ...it, summary: { ...it.summary, params: undefined } } as T;
    if (canRedecode) {
      pending.push(it.id);
      return dropped;
    }
    return { ...dropped, paramsV: PARAMS_DECODE_VERSION } as T;
  });
  return { items: out, pending };
}

/** Is a failed decode worth retrying? A deterministic rejection (HTTP 4xx other than 408/429: the server
 *  looked at these bytes and refused them) never is. No HTTP status at all (network down, server offline,
 *  timeout), 5xx, 408 and 429 are transient. */
export function isTransientDecodeError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null | undefined)?.status;
  if (typeof status !== 'number') return true;
  return !(status >= 400 && status < 500 && status !== 408 && status !== 429);
}

/** One re-decode pass over `ids`. `decode` resolves to the fresh summary, or null when there is nothing to
 *  decode from (no stored bytes). Every id that reaches a final outcome is passed to `settle` (with the fresh
 *  summary, or null → settled WITHOUT params: no bytes, or a deterministic rejection). The first TRANSIENT
 *  failure stops the pass — an offline server costs one request, not one per file — and the unattempted ids
 *  plus the failed one are returned, still pending. Never loops: the caller decides about a later pass. */
export async function redecodePass<S>(
  ids: readonly string[],
  decode: (id: string) => Promise<S | null>,
  settle: (id: string, fresh: S | null) => void
): Promise<string[]> {
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    let fresh: S | null;
    try {
      fresh = await decode(id);
    } catch (e) {
      if (isTransientDecodeError(e)) return ids.slice(i);
      settle(id, null); // deterministic: the server will never accept these bytes — done, not retried
      continue;
    }
    settle(id, fresh);
  }
  return [];
}
