// Versioning for the persisted caches that hold DECODED preset param values (display values the server's
// decoder produced — e.g. the library's per-preset param index and the params embedded in imported-file
// summaries). Those values depend on how the decoder maps a stored raw to a display number, so when that
// mapping changes (e.g. log-taper params decoded to their true display value instead of linearly) an old
// cache must NOT be served next to freshly decoded values: deep search would compare two different scales.
//
// Bump PARAMS_DECODE_VERSION whenever the server/codec changes how preset params decode. Anything cached
// under another version — including legacy caches written before versioning existed — is dropped and
// re-decoded. Framework-free so it is unit-tested directly (library.svelte.ts is a runes store).

import { plainCopy } from './guardedBlob';

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

/** Persist a decoded-params cache: a plain SNAPSHOT of `params` in a versioned envelope. The library's cache is
 *  a Svelte `$state` record; IndexedDB can't structured-clone a proxy (DataCloneError, which idb.set used to
 *  swallow — nothing was ever persisted), so the value must be snapshotted first (`$state.snapshot` in the
 *  store; a JSON copy by default). */
export function saveParamsCache(
  kv: { set: (key: string, val: unknown) => Promise<unknown> },
  key: string,
  params: unknown,
  snapshot: <T>(v: T) => T = plainCopy
): Promise<unknown> {
  return kv.set(key, wrapParams(snapshot(params)));
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

/** Stamp for a file whose embedded params were decoded by an OLDER decoder and can never be re-decoded (its raw
 *  bytes are gone): the stale params are KEPT so deep search still works (log-taper values may be off until the
 *  file is re-imported), and the file is settled — never retried, never dropped. */
export const LEGACY_STAMP = 'legacy' as const;

/** The decode version a file's params carry: the current one, or LEGACY_STAMP (settled, kept stale). */
export type ParamsStamp = number | typeof LEGACY_STAMP;

/** A persisted imported-file record. `paramsV` stamps WHICH decode version this file's embedded `params`
 *  came from — per file, so one file the server rejects never forces the whole library to be re-decoded.
 *  `paramsFail` counts re-decode attempts that failed with a server error for this file (see redecodePass). */
export interface PersistedFile {
  id: string;
  folder?: string;
  summary: { params?: unknown };
  paramsV?: ParamsStamp;
  paramsFail?: number;
}

/** After this many counted server-error failures a file is settled without params instead of retried. */
export const MAX_REDECODE_FAILURES = 3;
/** This many server errors in a row (no success between) look like a server-wide problem: stop the pass. */
export const MAX_CONSECUTIVE_HTTP_FAILURES = 3;

/** Load-time settle for persisted imported files. A file stamped with the current decode version, or settled as
 *  LEGACY, is kept untouched (same reference). Any other (missing / older stamp) is stale, and:
 *  - `canRedecode` (IndexedDB is there, so the raw bytes MAY be) → its id is returned in `pending`, params left
 *    as they are for now: whether bytes actually exist is only known once the bytes blob has been read (see
 *    `partitionByBytes`). `pending` is ordered by persisted failure count (fewest first, otherwise file order)
 *    so a file that keeps failing is tried last and cannot starve the rest;
 *  - otherwise there are no bytes at all, so it is settled on the spot as LEGACY: its stale params are KEPT. */
export function settleFilesOnLoad<T extends PersistedFile>(
  items: T[],
  canRedecode: boolean
): { items: T[]; pending: string[] } {
  const pending: { id: string; fails: number }[] = [];
  const out = items.map((it) => {
    if (it.paramsV === PARAMS_DECODE_VERSION || it.paramsV === LEGACY_STAMP) return it;
    if (canRedecode) {
      pending.push({ id: it.id, fails: it.paramsFail ?? 0 });
      return it;
    }
    return { ...it, paramsV: LEGACY_STAMP } as T;
  });
  pending.sort((x, y) => x.fails - y.fails); // stable: ties keep file order
  return { items: out, pending: pending.map((x) => x.id) };
}

/** Once the bytes blob has been read, decide each pending file: with stored bytes → `redecode` (its stale params
 *  must be dropped so no old scale is searched, then it is re-decoded); WITHOUT bytes → `legacy` (settled, the
 *  stale params are kept, never retried). Order within each list is preserved. */
export function partitionByBytes(
  pending: readonly string[],
  hasBytes: (id: string) => boolean
): { redecode: string[]; legacy: string[] } {
  const redecode: string[] = [];
  const legacy: string[] = [];
  for (const id of pending) (hasBytes(id) ? redecode : legacy).push(id);
  return { redecode, legacy };
}

/** Is a failed decode worth retrying? A deterministic rejection (HTTP 4xx other than 408/429: the server
 *  looked at these bytes and refused them) never is. No HTTP status at all (network down, server offline,
 *  timeout), 5xx, 408 and 429 are transient. */
export function isTransientDecodeError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null | undefined)?.status;
  if (typeof status !== 'number') return true;
  return !(status >= 400 && status < 500 && status !== 408 && status !== 429);
}

const hasHttpStatus = (e: unknown): boolean => typeof (e as { status?: unknown } | null | undefined)?.status === 'number';

/** One re-decode pass over `ids`. `decode` resolves to the fresh summary, or null when there is nothing to
 *  decode from (no stored bytes). Every id that reaches a final outcome is passed to `settle` (with the fresh
 *  summary, or null → settled WITHOUT params: no bytes, a deterministic rejection, or too many failures).
 *
 *  Failures:
 *  - no HTTP status (network down / server offline / timeout): the pass stops right there — an offline server
 *    costs one request, not one per file — and everything unattempted stays pending, in order;
 *  - an HTTP server error (5xx / 408 / 429): the file is DEFERRED — moved behind the rest — and the pass
 *    carries on, so one always-failing file cannot block the others; but `MAX_CONSECUTIVE_HTTP_FAILURES` in a
 *    row look like a server-wide problem and stop the pass;
 *  - a deferred file's failure is COUNTED (in `failures`, which the caller persists) only with evidence that the
 *    server itself is fine, so it is this file and not a server that is down/starting: some other file decoded
 *    fine in the same pass, OR `serverHealthy()` says the server has otherwise answered successfully (e.g. the
 *    app's own detect/load requests) — which also lets a file that is the ONLY pending one be counted. At
 *    `MAX_REDECODE_FAILURES` counted failures the file is settled without params.
 *  Returns the ids still pending (unattempted first, deferred last). Never loops. */
export async function redecodePass<S>(
  ids: readonly string[],
  decode: (id: string) => Promise<S | null>,
  settle: (id: string, fresh: S | null) => void,
  failures: Map<string, number> = new Map(),
  serverHealthy: () => boolean = () => false
): Promise<string[]> {
  const deferred: string[] = [];
  let successes = 0;
  let consecutiveHttp = 0;
  const finish = (unattempted: string[]): string[] => {
    const keep: string[] = [];
    for (const id of deferred) {
      if (successes > 0 || serverHealthy()) {
        const n = (failures.get(id) ?? 0) + 1;
        failures.set(id, n);
        if (n >= MAX_REDECODE_FAILURES) {
          settle(id, null);
          continue;
        }
      }
      keep.push(id);
    }
    return [...unattempted, ...keep];
  };
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    let fresh: S | null;
    try {
      fresh = await decode(id);
    } catch (e) {
      if (!isTransientDecodeError(e)) {
        settle(id, null); // deterministic: the server will never accept these bytes — done, not retried
        consecutiveHttp = 0;
        continue;
      }
      if (!hasHttpStatus(e)) return finish(ids.slice(i)); // offline: stop, this id stays first in line
      deferred.push(id);
      if (++consecutiveHttp >= MAX_CONSECUTIVE_HTTP_FAILURES) return finish(ids.slice(i + 1));
      continue;
    }
    if (fresh !== null) {
      successes++;
      consecutiveHttp = 0;
    }
    settle(id, fresh);
  }
  return finish([]);
}
