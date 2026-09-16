// The client persists params it fetched from the server: device presets in IndexedDB (`lib.params`)
// and imported .syx files embedded in their summary (`axs.lib.files`). Both are keyed by preset
// identity, NOT by the decoder, so a cache built by an older decoder would otherwise survive an
// upgrade — the preset-browser detail pane (and deep search) would keep serving the old block shape.
// A persisted marker records which decoder produced the cache; when it doesn't match, the caches are
// discarded whole and re-hydrate on demand. Bump DECODE_VERSION whenever `DecodedBlock`'s
// shape/semantics change.
//   v2 — every family now decodes one DecodedBlock per A–D channel; before, only the amp did.

export const DECODE_VERSION = 2;

/** True when a persisted cache was written by a decoder other than the current one, so it must be
 *  thrown away rather than migrated. An absent marker (a pre-versioning install) counts as stale. */
export function decodeCacheStale(marker: unknown): boolean {
  return marker !== DECODE_VERSION;
}
