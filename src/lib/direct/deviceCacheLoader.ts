// The on-connect / post-build device-cache lookup for the in-page ForgeFX runtime (Browser Direct +
// native mobile). Mirrors the Node registry (ForgeFX drivers/registry.ts) so the registry swaps in the
// device-true runtime profile after a self-describe walk completes AND again on every reconnect.
//
// WHY THIS EXISTS AS ITS OWN MODULE: loadDeviceCache is an OPTIONAL RegistryDeps hook. When it was
// simply omitted from the direct-mode deps, the object still typechecked, so a completed walk was
// persisted to IndexedDB yet registry.applyRuntimeCache() no-op'd and the editor kept the bundled
// profile — the definitions builder appeared to work but had no effect. Extracting the loader gives it
// a node-env unit test (runtime.ts can't be imported under vitest — it pulls browser-only code) that
// guards the exact behaviour the registry depends on.
//
// WHAT IT RETURNS: only a profile this build may use. The usable-vs-stale decision (the profile's
// `meta.schema` against the codec's current schema) is ForgeFX's `loadUsableProfile`, the same lookup the
// Node registry and the status/build/import/cloud routes use, so Browser Direct can never apply a profile
// the server side would call stale. A stale profile stays in the store (nothing here deletes it) and the
// definitions prompt asks for a re-read (see deviceDefs.ts).
//
// TYPE-ONLY IMPORTS HERE, ON PURPOSE: this module is on the eager import chain (direct.svelte.ts ->
// runtime.ts -> here), while forgefx-server/runtime is dynamic-imported by runtime.ts so the desktop and
// remote bundles never carry it. A value import of the runtime from this file would drag the whole runtime
// into the entry bundle, so the caller (which already holds the loaded runtime) hands the function in.
import type { loadUsableProfile, RegistryDeps, Store } from 'forgefx-server/runtime';

/** ForgeFX's `loadUsableProfile` (from the dynamically imported runtime): the profile under `key`, or null
 *  when absent, tombstoned or stale. */
export type LoadUsableProfile = typeof loadUsableProfile;

/** The BuiltCache shape the registry's loadDeviceCache hook returns. Derived from RegistryDeps because
 *  Axis has no direct forgefx-midi dependency (only forgefx-server), so `BuiltCache` isn't importable. */
export type BuiltDeviceCache = NonNullable<Awaited<ReturnType<NonNullable<RegistryDeps['loadDeviceCache']>>>>;

/** Read the stored device cache for `key` from the runtime store, returning null when absent,
 *  tombstoned or stale (so the registry falls back to the bundled profile). Reads the same
 *  `deviceCaches` collection the /device/cache walk writes to. */
export function makeDeviceCacheLoader(
  store: Pick<Store, 'getDoc'>,
  loadUsable: LoadUsableProfile
): NonNullable<RegistryDeps['loadDeviceCache']> {
  return (key) => loadUsable(store, key);
}
