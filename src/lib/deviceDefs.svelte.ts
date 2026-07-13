// Device-definitions store (A4, AXIS-17/44 · META-22). Orchestrates the server-side definition-profile
// cache: status refresh on connect, self-describe builds (with live SSE progress), editor-cache imports
// (drag-drop bytes, discovered candidates, or a browser-picked folder), and cloud pull/publish. All
// ordering / gating / filename logic is delegated to the pure `deviceDefs.ts`; this file is the runes
// shell + the (small) impure device/browser plumbing. It deliberately does NOT import the editor store
// (the editor imports IT, to route `cacheBuild` SSE events) — device context is passed in on refresh.

import { forgefx, isRemote, ForgeError } from './forgefx';
import type { DeviceCacheStatus, DeviceCacheSources, CloudCacheStatus, DeviceCaps, DeviceEvent } from './types';
import {
  deviceDefsActions,
  shouldOfferDeviceDefs,
  activeDefsSource,
  dismissKey,
  normalizeModelHex,
  parseFirmware,
  type DeviceDefAction,
  type ActiveDefsSource
} from './deviceDefs';
import {
  hasDirectoryPicker,
  pickEditorFolder,
  persistedEditorFolder,
  scanEditorFolder
} from './deviceDefsFolder';

const DISMISS_KEY = 'axs.deviceDefs.dismissed';

/** Device context captured at refresh — enough for gating, filename matching, and the dismissal key. */
interface DeviceDefsCtx {
  model: string | null;
  modelHex: string;
  firmware: string | null;
  fw: { major: number; minor: number } | null;
  caps: DeviceCaps | null;
}

function loadDismissed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

class DeviceDefsStore {
  status = $state<DeviceCacheStatus | null>(null);
  sources = $state<DeviceCacheSources | null>(null);
  cloud = $state<CloudCacheStatus | null>(null);
  /** Live build progress (from the `cacheBuild` SSE / the POST /build response), or null when idle. */
  building = $state<{ done: number; total: number; phase: string } | null>(null);
  importing = $state(false);
  publishing = $state(false);
  /** Set after any successful acquisition (build/import/pull) so the prompt shows its success state. */
  succeeded = $state(false);
  /** True once a publish returned 401 (not signed in) — hides the "Share to cloud" affordance. */
  publishDenied = $state(false);
  error = $state<string | null>(null);
  /** The device model+firmware mismatch case (import 409) awaiting a force retry, or null. */
  mismatch = $state<{ bytes: Uint8Array; name: string } | { path: string } | null>(null);

  #ctx = $state<DeviceDefsCtx | null>(null);
  #dismissed = $state<Set<string>>(new Set());
  #loaded = false;

  constructor() {
    if (typeof localStorage !== 'undefined') this.#dismissed = loadDismissed();
  }

  get key(): string {
    return dismissKey(this.#ctx?.model, this.#ctx?.firmware);
  }
  get dismissed(): boolean {
    return this.#dismissed.has(this.key);
  }
  /** Whether the connect-time prompt should appear (self-describe + no profile + not dismissed). */
  get shouldShow(): boolean {
    return shouldOfferDeviceDefs(this.#ctx?.caps ?? null, this.status, this.dismissed);
  }
  /** Ordered actions to offer, most-preferred first. */
  get actions(): DeviceDefAction[] {
    return deviceDefsActions({
      caps: this.#ctx?.caps ?? null,
      status: this.status,
      sources: this.sources,
      cloud: this.cloud,
      env: {
        isElectron: typeof globalThis !== 'undefined' && !!(globalThis as { axisDesktop?: unknown }).axisDesktop,
        hasDirectoryPicker: hasDirectoryPicker(),
        isRemote: isRemote()
      }
    });
  }
  /** Whether the "Share to cloud" publish affordance can be offered (cloud endpoint present, not denied). */
  get canPublish(): boolean {
    return this.cloud !== null && !this.publishDenied;
  }
  /** Human-facing readout of where the ACTIVE definitions come from (bundled/device/editor/cloud). */
  get activeSource(): ActiveDefsSource {
    return activeDefsSource(this.status, this.sources);
  }

  /** Refresh all three status endpoints for the connected device. Called on connect/reconnect. */
  refresh = async (ctx: { model: string | null; modelByte: string | null; firmware: string | null; caps: DeviceCaps | null }) => {
    this.#ctx = {
      model: ctx.model,
      modelHex: normalizeModelHex(ctx.modelByte),
      firmware: ctx.firmware,
      fw: parseFirmware(ctx.firmware),
      caps: ctx.caps
    };
    // Only reach for the endpoints when the device claims the capability — old servers 404 harmlessly,
    // but skipping the round-trips keeps a legacy connect clean.
    if (!ctx.caps?.selfDescribe && !ctx.caps?.cacheImport) {
      this.status = null; this.sources = null; this.cloud = null;
      return;
    }
    const [status, sources, cloud] = await Promise.all([
      forgefx.deviceCache().catch(() => null),
      forgefx.cacheSources().catch(() => null),
      forgefx.cloudCacheCheck().catch(() => null)
    ]);
    this.status = status;
    this.sources = sources;
    this.cloud = cloud;
    this.building = status?.building ? (status.progress ?? { done: 0, total: 0, phase: 'starting' }) : null;
    this.succeeded = false;
    this.error = null;
    // A persisted browser folder handle? Silently re-scan + import before the user has to do anything.
    if (!this.#loaded) { this.#loaded = true; void this.#tryPersistedFolder(); }
  };

  /** Start a self-describe build. Progress then streams over `onBuildEvent`. */
  build = async () => {
    this.error = null;
    try {
      await forgefx.buildDeviceCache();
      this.building = { done: 0, total: 0, phase: 'starting' };
    } catch (e) {
      if (e instanceof ForgeError && e.status === 409) { this.building = { done: 0, total: 0, phase: 'building' }; return; } // already building
      this.error = e instanceof ForgeError && e.status === 501 ? 'Reading from device isn’t supported here.' : 'Could not start the build.';
    }
  };

  cancel = async () => {
    await forgefx.cancelDeviceCache().catch(() => null);
    this.building = null;
  };

  /** Import raw cache bytes (browser drag-drop / folder pick). `force` overrides a firmware mismatch. */
  importBytes = async (bytes: Uint8Array, name: string, force = false) => {
    await this.#runImport({ bytes, name }, force);
  };
  /** Import a server-discovered candidate from disk (Electron). */
  importCandidate = async (path: string, force = false) => {
    await this.#runImport({ path }, force);
  };
  #runImport = async (source: { bytes: Uint8Array; name: string } | { path: string }, force: boolean) => {
    this.importing = true;
    this.error = null;
    try {
      await forgefx.importEditorCache(source, { force });
      this.mismatch = null;
      // The import body is a result receipt, not a status — re-read the authoritative status.
      this.status = await forgefx.deviceCache().catch(() => this.status);
      this.#onAcquired();
    } catch (e) {
      if (e instanceof ForgeError && e.status === 409) {
        this.mismatch = source; // offer a force retry
        this.error = 'That file is for a different firmware. Import it anyway?';
      } else if (e instanceof ForgeError && e.status === 501) {
        this.error = 'Importing editor definitions isn’t supported here.';
      } else {
        this.error = 'Import failed. Is this an effectDefinitions_*.cache file?';
      }
    } finally {
      this.importing = false;
    }
  };
  /** Retry the last mismatched import with force=1. */
  forceImport = async () => {
    if (!this.mismatch) return;
    await this.#runImport(this.mismatch, true);
  };

  cloudPull = async () => {
    this.importing = true;
    this.error = null;
    try {
      await forgefx.cloudCachePull();
      this.status = await forgefx.deviceCache().catch(() => this.status);
      this.#onAcquired();
    } catch {
      this.error = 'Could not fetch the shared definitions.';
    } finally {
      this.importing = false;
    }
  };

  cloudPublish = async () => {
    this.publishing = true;
    try {
      await forgefx.cloudCachePublish();
    } catch (e) {
      if (e instanceof ForgeError && e.status === 401) { this.publishDenied = true; return; } // hide the affordance
      this.error = 'Could not share the definitions.';
    } finally {
      this.publishing = false;
    }
  };

  /** Browser Chromium: pick an editor folder, scan it (+ one level of subdirs), import a match. */
  locateFolder = async () => {
    const handle = await pickEditorFolder();
    if (!handle) return;
    await this.#scanAndImport(handle, true);
  };

  dismiss = () => {
    this.succeeded = false; // also closes the post-success card ("Done")
    this.error = null;
    this.#dismissed = new Set([...this.#dismissed, this.key]);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...this.#dismissed])); } catch { /* */ }
  };

  /** Route a `cacheBuild` SSE event onto the live progress / final status. The server emits progress
   *  phases (walking/building) and terminal ones (done/error/cancelled/already-built) — there is no
   *  boolean; terminal detection is by phase. */
  onBuildEvent = (e: Extract<DeviceEvent, { type: 'cacheBuild' }>) => {
    if (e.phase === 'walking' || e.phase === 'building') {
      this.building = { done: e.done, total: e.total, phase: e.phase };
      return;
    }
    this.building = null;
    if (e.phase === 'error') { this.error = 'The build stopped before finishing.'; return; }
    if (e.phase === 'cancelled') return;
    // done / already-built — re-read the fresh status + mark success.
    void forgefx.deviceCache().then((st) => { if (st) { this.status = st; this.#onAcquired(); } });
  };

  #onAcquired = () => {
    this.succeeded = true;
    this.building = null;
    this.error = null;
    // Refresh sources.persisted so the source readout flips off "bundled".
    void forgefx.cacheSources().then((s) => { if (s) this.sources = s; }).catch(() => {});
  };

  // Silent re-scan of a previously-picked folder on connect (permission re-checked, non-interactive).
  #tryPersistedFolder = async () => {
    if (this.status?.exists || !this.#ctx?.caps?.cacheImport) return;
    const handle = await persistedEditorFolder();
    if (!handle) return;
    await this.#scanAndImport(handle, false);
  };
  #scanAndImport = async (handle: Parameters<typeof scanEditorFolder>[0], interactive: boolean) => {
    if (!this.#ctx) return;
    const found = await scanEditorFolder(handle, { modelHex: this.#ctx.modelHex, fw: this.#ctx.fw }, { interactive });
    if (!found) { if (interactive) this.error = 'No matching effectDefinitions_*.cache in that folder.'; return; }
    await this.importBytes(new Uint8Array(found.bytes), found.file);
  };
}

export const deviceDefs = new DeviceDefsStore();
