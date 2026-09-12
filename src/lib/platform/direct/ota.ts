// Self-hosted OTA web-bundle updates for the mobile shell (Capgo @capgo/capacitor-updater).
// The mobile-ota GitHub Actions workflow builds the mobile web bundle, zips it, and publishes the
// zip + a small latest-ios.json manifest to GitHub Releases. On launch the app fetches the manifest,
// rejects bundles that need a newer NATIVE app than is installed, then downloads (checksum-verified),
// installs, and reloads. Native/plugin changes still require a new IPA — OTA ships web assets only.
//
// notifyAppReady() must be called on successful WEB boot (JS loaded + gate rendered), NOT on device
// connect — otherwise a launch with no device plugged in would trip Capgo's auto-rollback.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

export interface OtaManifest {
  /** Web-bundle version identifier (monotonic, e.g. a build number or git describe). */
  version: string;
  /** HTTPS URL of the updater zip. */
  url: string;
  /** sha256 of the zip, verified by the updater during download. */
  checksum: string;
  /** Minimum NATIVE app version this web bundle is compatible with. */
  minNative: string;
}

export type OtaResult =
  | { status: 'skipped'; reason: string }
  | { status: 'current' }
  | { status: 'incompatible'; nativeVersion: string; minNative: string }
  | { status: 'updated'; version: string }
  | { status: 'error'; error: string };

/** Manifest location, injected at build time. Left unset in non-mobile builds → OTA no-ops. Point it
 *  at e.g. https://github.com/<owner>/Axis/releases/latest/download/latest-ios.json */
const MANIFEST_URL = import.meta.env.VITE_OTA_MANIFEST_URL as string | undefined;

/** Parse the leading numeric dotted core of a version ("0.8.0-beta+42" → [0,8,0]), ignoring any
 *  pre-release / build suffix. Good enough for the monotonic native-compat gate. */
function core(v: string): number[] {
  const m = /^\d+(?:\.\d+)*/.exec(v.trim());
  return (m ? m[0] : '0').split('.').map((n) => parseInt(n, 10) || 0);
}

/** -1 / 0 / 1 for a<b / a==b / a>b over the numeric version core. */
export function cmpVersion(a: string, b: string): number {
  const x = core(a);
  const y = core(b);
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** A web bundle is installable only if the installed native app is at least its minNative. Pure — the
 *  unit test drives this directly (no native platform needed). */
export function isCompatible(nativeVersion: string, minNative: string): boolean {
  return cmpVersion(nativeVersion, minNative) >= 0;
}

/** Call once, as early as possible after the web app boots, so Capgo commits the running bundle and
 *  does not auto-roll-back. No-op off native. */
export async function notifyReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch {
    /* not fatal — a fresh install with no OTA bundle yet has nothing to confirm */
  }
}

/** Check the manifest and, if a newer compatible bundle exists, download + install + reload. */
export async function checkForUpdate(): Promise<OtaResult> {
  if (!Capacitor.isNativePlatform()) return { status: 'skipped', reason: 'not native' };
  if (!MANIFEST_URL) return { status: 'skipped', reason: 'no manifest url configured' };

  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) return { status: 'error', error: `manifest ${res.status}` };
    const manifest = (await res.json()) as OtaManifest;

    const { version: nativeVersion } = await App.getInfo();
    if (!isCompatible(nativeVersion, manifest.minNative)) {
      return { status: 'incompatible', nativeVersion, minNative: manifest.minNative };
    }

    const current = await CapacitorUpdater.current();
    if (current.bundle?.version === manifest.version) return { status: 'current' };

    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
      checksum: manifest.checksum
    });
    await CapacitorUpdater.set({ id: bundle.id });
    await CapacitorUpdater.reload();
    return { status: 'updated', version: manifest.version };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
