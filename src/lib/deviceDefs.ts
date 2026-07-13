// Pure decision logic for the device-definitions feature (A4, AXIS-17/44 · META-22).
//
// Axis ships BUNDLED effect definitions. When the connected device+firmware has no persisted profile,
// it offers to build one. This module holds the framework-free, unit-tested core: which actions to offer
// (and in what order of preference), whether the prompt should appear at all, which source the active
// definitions came from, and how to parse/match an official editor cache filename. The store
// (`deviceDefs.svelte.ts`) and component (`DeviceDefsPrompt.svelte`) are thin shells over these.

import type { DeviceCacheStatus, DeviceCacheSources, CloudCacheStatus, DeviceDefsOrigin } from './types';

/** The ways a user can obtain a definition profile, most-preferred first. */
export type DeviceDefAction = 'cloudPull' | 'importCandidate' | 'dropFile' | 'readFromDevice' | 'locateFolder';

/** Everything the ordering decision needs — kept as plain data so it's trivial to unit-test. */
export interface DeviceDefsInputs {
  /** Relevant device capabilities. `selfDescribe` gates "Read from device"; `cacheImport` gates imports. */
  caps: { selfDescribe?: boolean; cacheImport?: boolean } | null;
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
  return out;
}

/**
 * Whether the connect-time prompt should appear. It appears when the device can acquire a
 * definition profile at all — self-describe (walk) OR cache import (import-only devices like the
 * AM4, whose action list simply has no "Read from device") — the status has loaded and reports NO
 * persisted profile for the current firmware, and the user hasn't dismissed it for this
 * device+firmware. `building` in-flight also shows the prompt (so its progress bar is visible),
 * but a persisted profile (`exists`) or a missing capability hides it.
 */
export function shouldOfferDeviceDefs(
  caps: { selfDescribe?: boolean; cacheImport?: boolean } | null,
  status: Pick<DeviceCacheStatus, 'exists' | 'building'> | null,
  dismissed: boolean
): boolean {
  if ((!caps?.selfDescribe && !caps?.cacheImport) || !status) return false;
  if (status.building) return true; // always surface an in-flight build
  if (status.exists) return false; // already have a profile — nothing to prompt
  return !dismissed;
}

/** Where the active definitions came from, plus display copy. `bundled` when no profile is persisted. */
export interface ActiveDefsSource {
  origin: DeviceDefsOrigin;
  /** One-line label for the readout. */
  label: string;
  /** Longer tooltip detail (record count / firmware / coverage), or '' when nothing extra to say. */
  detail: string;
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
  const persisted = !!status?.exists || !!sources?.persisted;
  if (!persisted) {
    return { origin: 'bundled', label: 'Bundled definitions', detail: 'Axis is using its shipped effect definitions.' };
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
      return { origin: 'device', label: 'Read from device', detail };
    case 'editor-cache':
      return { origin: 'editorCache', label: 'Editor cache file', detail };
    case 'cloud':
      return { origin: 'cloud', label: 'Shared cloud profile', detail };
    default:
      return { origin: 'device', label: 'Device profile', detail };
  }
}

/** localStorage dismissal key for a device+firmware pair (null-safe; unknowns collapse to '?'). */
export function dismissKey(model: string | null | undefined, firmware: string | null | undefined): string {
  return `${(model || '?').toLowerCase()}|${firmware || '?'}`;
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
