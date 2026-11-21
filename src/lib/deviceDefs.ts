// Pure decision logic for the device-definitions feature (A4, AXIS-17/44 · META-22).
//
// Axis ships BUNDLED effect definitions. When the connected device+firmware has no persisted profile,
// it offers to build one — and offers again when the stored profile is STALE (the server stamps every
// profile with a schema and refuses to apply one it can't use, so Axis is back on the bundled
// definitions until they are re-read). This module holds the framework-free, unit-tested core: which actions to offer
// (and in what order of preference), whether the prompt should appear at all, which source the active
// definitions came from, and how to parse/match an official editor cache filename. The store
// (`deviceDefs.svelte.ts`) and component (`DeviceDefsPrompt.svelte`) are thin shells over these.

import type { DeviceCacheStatus, DeviceCacheSources, CloudCacheStatus, DeviceDefsOrigin, DeviceDefsStaleReason } from './types';

/** The device capabilities the definitions logic looks at. */
export type DefsCaps = { selfDescribe?: boolean; cacheImport?: boolean; fullCapture?: boolean } | null | undefined;

/** The ways a user can obtain a definition profile, most-preferred first. `fullCapture` is the
 *  secondary taper/curve read — a superset of `readFromDevice`, so it always trails it. */
export type DeviceDefAction = 'cloudPull' | 'importCandidate' | 'dropFile' | 'readFromDevice' | 'locateFolder' | 'fullCapture';

/** Everything the ordering decision needs — kept as plain data so it's trivial to unit-test. */
export interface DeviceDefsInputs {
  /** Relevant device capabilities. `selfDescribe` gates "Read from device"; `cacheImport` gates imports;
   *  `fullCapture` gates the secondary taper/curve capture (needs `selfDescribe` + a local session). */
  caps: { selfDescribe?: boolean; cacheImport?: boolean; fullCapture?: boolean } | null;
  status: Pick<DeviceCacheStatus, 'exists' | 'building'> | null;
  sources: Pick<DeviceCacheSources, 'candidates'> | null;
  cloud: Pick<CloudCacheStatus, 'available'> | null;
  env: {
    /** Running inside the Electron desktop shell (has server-side filesystem discovery). */
    isElectron: boolean;
    /** Browser exposes the File System Access API (Chromium) → "Locate editor folder" is possible. */
    hasDirectoryPicker: boolean;
    /** Relayed remote session — a full device walk over the relay is unusable, so hide device reads. */
    isRemote: boolean;
  };
}

/**
 * Ordered list of actions to present, most-preferred first. Returns [] while a build is already running.
 * Preference order (per spec): cloud pull → import a discovered candidate → drag-drop a file →
 * read from device → locate an editor folder (browser Chromium only).
 */
export function deviceDefsActions(inp: DeviceDefsInputs): DeviceDefAction[] {
  if (inp.status?.building) return [];
  const out: DeviceDefAction[] = [];
  const canImport = !!inp.caps?.cacheImport;

  if (inp.cloud?.available) out.push('cloudPull');
  if (canImport && inp.env.isElectron && (inp.sources?.candidates?.length ?? 0) > 0) out.push('importCandidate');
  // Drag-drop is always available when the server accepts imports (works in browser AND desktop).
  if (canImport) out.push('dropFile');
  // Reading off the device is the universal fallback (needs the self-describe capability; not over a relay).
  if (inp.caps?.selfDescribe && !inp.env.isRemote) out.push('readFromDevice');
  // Chromium folder access — only in the browser (Electron uses server-side discovery instead).
  if (canImport && !inp.env.isElectron && inp.env.hasDirectoryPicker) out.push('locateFolder');
  // Full (taper) capture — an opt-in superset of the self-describe walk, offered LAST as the clearly
  // secondary affordance. Same local-session gating as readFromDevice, plus the device must advertise it.
  if (inp.caps?.fullCapture && inp.caps?.selfDescribe && !inp.env.isRemote) out.push('fullCapture');
  return out;
}

/** What a 409 from `POST /device/cache/build` means. The engine answers `{ error:'busy', what:'capture' }` while a device
 *  diagnostic owns the device — nothing is building then, so it must not read as "already building". */
export function buildConflictKind(body: unknown): 'diagnostic' | 'building' {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return o.error === 'busy' && o.what === 'capture' ? 'diagnostic' : 'building';
}

/** Shown when reading the definitions is refused because a device diagnostic is running. */
export const DIAGNOSTIC_RUNNING_MESSAGE = 'A device diagnostic is running. Wait until it has finished, then read the definitions again.';

/** Terminal `cacheBuild` SSE phases — the build has stopped (successfully or not). Everything else is
 *  in-progress. Kept as data so both the store and its tests agree on the classification. */
export const TERMINAL_BUILD_PHASES: ReadonlySet<string> = new Set(['done', 'error', 'cancelled', 'already-built']);

/**
 * Is this a mid-build progress phase (as opposed to a terminal one)? Known progress phases are
 * `walking`/`building`; full-mode adds a `param-sweep` sub-phase inside the walking stage. Any UNKNOWN
 * phase is treated as progress too (like `walking`) so an additive server sub-phase never trips the
 * terminal path — the build finishes only on an explicit terminal phase.
 */
export function isBuildProgressPhase(phase: string): boolean {
  return !TERMINAL_BUILD_PHASES.has(phase);
}

/** The stored profile exists but the server can't use it (schema missing / outdated / newer): it is not
 *  applied, so Axis is on the bundled definitions exactly as if nothing were stored. */
export function isDefsStale(status: Pick<DeviceCacheStatus, 'exists' | 'stale'> | null | undefined): boolean {
  return !!status?.exists && !!status.stale;
}

/**
 * The status as far as THIS device is concerned. A stored profile only ever takes effect on a self-describing
 * (gen-3) device — the server applies stored profiles at runtime for those alone — so on an import-only device
 * (the AM4) "stale" changes nothing the user could see: its profile is not applied either way, and prompting
 * to re-read it would be a promise Axis can't keep. There the stale flag is dropped and the status reads as
 * it did before profiles were versioned. Every decision below takes this view, never the raw status.
 */
export function effectiveStatus<T extends Pick<DeviceCacheStatus, 'stale' | 'staleReason'>>(status: T | null, caps: DefsCaps): T | null {
  if (!status?.stale || caps?.selfDescribe) return status;
  return { ...status, stale: false, staleReason: undefined };
}

/** Copy for the prompt/readout of a stale profile. A profile from a NEWER Axis is called that — re-reading
 *  replaces it, which the text says — instead of the "out of date" wording of an old or unstamped one. */
export function staleCopy(reason: DeviceDefsStaleReason | undefined): { title: string; sub: string; label: string; detail: string; panel: string } {
  if (reason === 'newer') {
    return {
      title: 'Saved definitions are from a newer Axis',
      sub: 'The definitions saved for this device were made by a newer version of Axis and can’t be used by this one, so Axis is using its bundled ones. Getting definitions again replaces the saved ones.',
      label: 'Bundled definitions (saved profile is from a newer Axis)',
      detail: 'The definitions saved for this device were made by a newer version of Axis and are not used here. Getting definitions again replaces them.',
      panel: 'The stored definitions were saved by a newer version of Axis and aren’t used here. Reading them again replaces them.'
    };
  }
  return {
    title: 'Re-read the definitions for this device',
    sub: 'The definitions saved for this device are out of date and no longer used, so Axis is using its bundled ones. Read them again to match your exact firmware.',
    label: 'Bundled definitions (stored profile out of date)',
    detail: 'The definitions stored for this device are out of date and are not used. Re-read them to match this device and firmware again.',
    panel: 'The stored definitions are out of date and not used. Read them again to match this device and firmware.'
  };
}

/** Why no shared-profile option is offered although the cloud has one for this firmware: its schema isn't one
 *  this build can use. Null when there is nothing to explain. */
export function cloudStaleNote(cloud: Pick<CloudCacheStatus, 'available' | 'stale' | 'staleReason'> | null | undefined): string | null {
  if (!cloud?.stale || cloud.available) return null;
  return cloud.staleReason === 'newer'
    ? 'A shared profile exists for this firmware but was made by a newer version of Axis, so it can’t be used here.'
    : 'A shared profile exists for this firmware but is out of date, so it can’t be used.';
}

/** Message for a failed shared-profile pull. A 409 means the shared profile's schema can't be used; the
 *  suggested way out depends on what this session can do: read from the device (self-describe, local
 *  session), else import an editor file (import-only devices such as the AM4), else nothing is suggested. */
export function cloudPullFailureMessage(httpStatus: number | null | undefined, caps: DefsCaps, isRemote: boolean): string {
  if (httpStatus !== 409) return 'Could not fetch the shared definitions.';
  const base = 'The shared definitions for this firmware can’t be used by this version of Axis.';
  if (caps?.selfDescribe && !isRemote) return `${base} Read them from the device instead.`;
  if (caps?.cacheImport) return `${base} Import an editor definitions file instead.`;
  return base;
}

/** What "Re-read definitions" does. `discard`: a usable profile is stored — drop it and offer the normal flow
 *  again (a firmware update). `build`: the stored profile is stale and this device can read definitions —
 *  start the read directly (the button already says it; going through a prompt that was possibly never shown
 *  would look like nothing happened). `prompt`: bring the prompt back instead — for devices that can't read
 *  from the device, and ALWAYS for a profile from a newer Axis: replacing that is the user's explicit choice
 *  in the prompt (its copy says so), never a one-click side effect. */
export type RebuildPlan = 'discard' | 'build' | 'prompt';
export function rebuildPlan(status: Pick<DeviceCacheStatus, 'exists' | 'stale' | 'staleReason'> | null | undefined, caps: DefsCaps): RebuildPlan {
  if (!isDefsStale(status)) return 'discard';
  if (status?.staleReason === 'newer') return 'prompt';
  return caps?.selfDescribe ? 'build' : 'prompt';
}

/** Whether the silent connect-time re-import from a remembered editor folder may run. Never over a usable
 *  profile, never without import support — and never over a profile from a NEWER Axis (replacing it is a
 *  decision for the user, not something to do quietly in the background). A stale older/unstamped profile
 *  does get the silent import: it is exactly what it exists to fix. */
export function canAutoImportFromFolder(caps: DefsCaps, status: Pick<DeviceCacheStatus, 'exists' | 'stale' | 'staleReason'> | null | undefined): boolean {
  if (!caps?.cacheImport) return false;
  if (hasUsableDefs(status)) return false;
  if (isDefsStale(status) && status?.staleReason === 'newer') return false;
  return true;
}

/** Whether to offer "Re-read definitions": a profile is persisted (in use, or stored but out of date) AND
 *  this local session can re-acquire one (self-describe walk or import). Hidden over a relay — the
 *  follow-up device read isn't usable there. */
export function canRebuildDefs(i: { source: Pick<ActiveDefsSource, 'origin' | 'stale'>; isRemote: boolean; caps: DefsCaps }): boolean {
  return (i.source.origin !== 'bundled' || i.source.stale) && !i.isRemote && (!!i.caps?.selfDescribe || !!i.caps?.cacheImport);
}

/** A USABLE profile is stored (exists and not stale) — the only state in which Axis runs on device definitions. */
export function hasUsableDefs(status: Pick<DeviceCacheStatus, 'exists' | 'stale'> | null | undefined): boolean {
  return !!status?.exists && !status.stale;
}

/**
 * Whether the connect-time prompt should appear. It appears when the device can acquire a
 * definition profile at all — self-describe (walk) OR cache import (import-only devices like the
 * AM4, whose action list simply has no "Read from device") — the status has loaded and reports NO
 * USABLE profile for the current firmware (none stored, or a stale one the server won't apply), and
 * the user hasn't dismissed it for this device+firmware+state (see `dismissKey`: a dismissal of the
 * "no profile" prompt does not cover the stale prompt). `building` in-flight also shows the prompt
 * (so its progress bar is visible), but a usable profile or a missing capability hides it.
 */
export function shouldOfferDeviceDefs(
  caps: { selfDescribe?: boolean; cacheImport?: boolean } | null,
  rawStatus: Pick<DeviceCacheStatus, 'exists' | 'building' | 'stale' | 'staleReason'> | null,
  dismissed: boolean
): boolean {
  const status = effectiveStatus(rawStatus, caps); // an import-only device has nothing to re-read (see effectiveStatus)
  if ((!caps?.selfDescribe && !caps?.cacheImport) || !status) return false;
  if (status.building) return true; // always surface an in-flight build
  if (hasUsableDefs(status)) return false; // already have a usable profile — nothing to prompt
  return !dismissed;
}

/** Where the active definitions came from, plus display copy. `bundled` when no profile is persisted. */
export interface ActiveDefsSource {
  origin: DeviceDefsOrigin;
  /** One-line label for the readout. */
  label: string;
  /** Longer tooltip detail (record count / firmware / coverage), or '' when nothing extra to say. */
  detail: string;
  /** A profile is stored but out of date, so these are still the bundled definitions (`origin: 'bundled'`). */
  stale: boolean;
}

/**
 * Resolve the active-definitions source line from the cache status (+ sources.persisted as a fallback
 * signal). A persisted profile with a known `meta.source` labels precisely; a persisted profile of
 * unknown source falls back to a generic "device profile"; no profile → "bundled".
 */
export function activeDefsSource(
  status: DeviceCacheStatus | null,
  sources: Pick<DeviceCacheSources, 'persisted'> | null
): ActiveDefsSource {
  // A stale profile is stored but NOT applied — the active definitions are the bundled ones. (`status` is the
  // effective one for the device, see effectiveStatus.)
  if (isDefsStale(status)) {
    const copy = staleCopy(status?.staleReason);
    return { origin: 'bundled', label: copy.label, detail: copy.detail, stale: true };
  }
  const persisted = !!status?.exists || !!sources?.persisted;
  if (!persisted) {
    return { origin: 'bundled', label: 'Bundled definitions', detail: 'Axis is using its shipped effect definitions.', stale: false };
  }
  const meta = status?.meta;
  const bits: string[] = [];
  if (meta?.recordCount) bits.push(`${meta.recordCount.toLocaleString()} definitions`);
  if (meta?.firmware) bits.push(`firmware ${meta.firmware}`);
  const unmapped = (meta?.unmappedSections ?? 0) + (meta?.unmappedFamilies ?? 0);
  if (unmapped > 0) bits.push(`${unmapped} unmapped`);
  const detail = bits.join(' · ');
  // The server stamps meta.source: 'live' (self-describe walk) | 'editor-cache' | 'cloud'.
  switch (meta?.source) {
    case 'live':
      return { origin: 'device', label: 'Read from device', detail, stale: false };
    case 'editor-cache':
      return { origin: 'editorCache', label: 'Editor cache file', detail, stale: false };
    case 'cloud':
      return { origin: 'cloud', label: 'Shared cloud profile', detail, stale: false };
    default:
      return { origin: 'device', label: 'Device profile', detail, stale: false };
  }
}

/** localStorage dismissal key for a device+firmware pair (null-safe; unknowns collapse to '?'). With a
 *  `staleTag` (see `staleDismissTag`) it is a DIFFERENT key, so dismissing the "no definitions yet"
 *  prompt for this device+firmware never silences the later "definitions are out of date" prompt. The
 *  plain key (no tag) is unchanged, so earlier dismissals keep working. */
export function dismissKey(model: string | null | undefined, firmware: string | null | undefined, staleTag?: string | null): string {
  const base = `${(model || '?').toLowerCase()}|${firmware || '?'}`;
  return staleTag ? `${base}|stale:${staleTag}` : base;
}

/** The dismissal key for the CURRENT state of a device+firmware (pass the effective status): the plain key
 *  while no profile is stale, the stale-tagged one while it is. */
export function currentDismissKey(
  model: string | null | undefined,
  firmware: string | null | undefined,
  status: Pick<DeviceCacheStatus, 'exists' | 'stale' | 'currentSchema' | 'meta'> | null | undefined
): string {
  return dismissKey(model, firmware, staleDismissTag(status));
}

/** Has the user dismissed the prompt for the CURRENT state of this device+firmware? The stale state is part
 *  of the key, so a dismissal made while no profile was stored (plain key) does not cover a later
 *  stale profile, and a dismissed stale state does not cover a different one (another schema). */
export function isDismissed(
  dismissed: ReadonlySet<string>,
  model: string | null | undefined,
  firmware: string | null | undefined,
  status: Pick<DeviceCacheStatus, 'exists' | 'stale' | 'currentSchema' | 'meta'> | null | undefined
): boolean {
  return dismissed.has(currentDismissKey(model, firmware, status));
}

/** The stale state as a dismissal-key tag: stored schema to current schema (`none` / `?` when unknown), or
 *  null when the profile isn't stale. A later schema bump changes the tag, so a dismissal of one stale
 *  state never hides the next. */
export function staleDismissTag(status: Pick<DeviceCacheStatus, 'exists' | 'stale' | 'currentSchema' | 'meta'> | null | undefined): string | null {
  if (!isDefsStale(status)) return null;
  return `${status?.meta?.schema ?? 'none'}>${status?.currentSchema ?? '?'}`;
}

/** Parsed pieces of an official editor cache filename. */
export interface EditorCacheName {
  /** Model hex, lowercased, no `0x` prefix (e.g. "15"). */
  model: string;
  fwMajor: number;
  fwMinor: number;
}

/**
 * Parse `effectDefinitions_<modelHex>_<major>p<minor>.cache` (case-insensitive, optional `0x` on the
 * model, tolerant of extra path segments). Returns null if the name isn't an effect-definitions cache.
 */
export function parseEditorCacheName(filename: string): EditorCacheName | null {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const m = /^effectdefinitions_(?:0x)?([0-9a-f]+)_(\d+)p(\d+)\.cache$/i.exec(base.trim());
  if (!m) return null;
  return { model: m[1].toLowerCase().replace(/^0+(?=.)/, ''), fwMajor: Number(m[2]), fwMinor: Number(m[3]) };
}

/** Normalize a device model byte ("0x15" / "15" / "0X15") to bare lowercase hex ("15"). */
export function normalizeModelHex(modelByte: string | null | undefined): string {
  return (modelByte || '').toLowerCase().replace(/^0x/, '').replace(/^0+(?=.)/, '');
}

/** First two dotted components of a firmware version ("1.07.15" → { major: 1, minor: 7 }); null if unparseable. */
export function parseFirmware(version: string | null | undefined): { major: number; minor: number } | null {
  if (!version) return null;
  const p = version.split('.').map((x) => Number(x.replace(/[^\d]/g, '')));
  if (!Number.isFinite(p[0])) return null;
  return { major: p[0], minor: Number.isFinite(p[1]) ? p[1] : 0 };
}

/**
 * Does an editor-cache filename match the connected device? Model must match. Firmware major/minor must
 * match WHEN both are known — if the device firmware is unknown we match on model alone (the server
 * still validates and can 409). Non-cache filenames never match.
 */
export function matchEditorCacheFile(
  filename: string,
  target: { modelHex: string; fw: { major: number; minor: number } | null }
): boolean {
  const parsed = parseEditorCacheName(filename);
  if (!parsed) return false;
  if (parsed.model !== target.modelHex) return false;
  if (!target.fw) return true; // firmware unknown → model match is enough (server validates)
  return parsed.fwMajor === target.fw.major && parsed.fwMinor === target.fw.minor;
}
