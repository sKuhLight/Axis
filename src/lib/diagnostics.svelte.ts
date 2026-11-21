// Device-diagnostics store (Settings → Debug → "Device diagnostics"). Drives the engine's staged diagnostic run:
// start, poll status while it runs, cancel, fetch the redacted result bundle once the run has finished, save it
// locally and upload it for analysis. All decisions (view mapping, polling cadence, when to fetch the result,
// preconditions, error wording, file name, gzip fallback) live in the pure `diagnostics.ts`; this file is the runes
// shell plus the small impure plumbing (timers, requests, the download anchor). It deliberately does NOT import the
// editor store (the editor imports IT, to keep its background device reads quiet while a run is going).
//
// The result bundle is held with `$state.raw`: it can carry tens of thousands of wire-log frames and must never
// become a deep reactive proxy.

import { forgefx, isRemote } from './forgefx';
import type { CaptureBundle, CaptureStartRequest, CaptureStatus } from './types';
import {
  bundleFileName,
  cancelErrorMessage,
  diagView,
  encodeBundle,
  errorInfo,
  isFinishedState,
  isRunBusy,
  platformGzip,
  pollDecision,
  POLL_MAX_FAILURES,
  resultErrorMessage,
  shouldFetchResult,
  startErrorMessage,
  uploadErrorMessage,
  uploadPreconditions,
  withAxisVersion,
  type DiagView,
  type EncodedBundle
} from './diagnostics';

const axisVersion = (): string | null => {
  const desktop = (globalThis as { axisDesktop?: { version?: string } }).axisDesktop?.version;
  if (desktop) return desktop;
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
};

class DiagnosticsStore {
  /** The engine's view of the current / last run; null until first read (or when the engine has no diagnostic). */
  status = $state<CaptureStatus | null>(null);
  /** The redacted result of the last finished run, once fetched. */
  bundle = $state.raw<CaptureBundle | null>(null);
  /** The result serialized for saving (gzip when possible) — also what the upload preview sizes come from. */
  encoded = $state.raw<EncodedBundle | null>(null);
  /** POST start in flight. */
  starting = $state(false);
  /** A cancel was requested and the run has not yet reported that it stopped. */
  cancelling = $state(false);
  loadingResult = $state(false);
  /** Whether the run that is showing was asked to include the full walk (so its step list can be planned up front). */
  includeFullWalk = $state(false);
  /** Start / polling failure, shown in the panel. */
  error = $state<string | null>(null);
  resultError = $state<string | null>(null);
  uploading = $state(false);
  uploaded = $state<{ captureId: string; bytes: number } | null>(null);
  uploadError = $state<string | null>(null);
  /** File name of the last local save (confirmation text). */
  savedAs = $state<string | null>(null);
  /** A finished run the user already moved on from ("Run again"): reads as idle until a different run appears. */
  dismissedId = $state<string | null>(null);

  #timer: ReturnType<typeof setTimeout> | null = null;
  #failures = 0;
  #resumed = false;

  get view(): DiagView {
    return diagView({ status: this.status, starting: this.starting, cancelling: this.cancelling, dismissedId: this.dismissedId });
  }
  /** A run owns the device transport — the editor's background reads (poll / preset watch / save probe) sit out. */
  get running(): boolean {
    return isRunBusy(this.view);
  }

  // ── status ──
  /** Read the engine's status once (and start polling when a run is going). Silent when the engine has no diagnostic. */
  refresh = async (): Promise<void> => {
    try {
      this.#adopt(await forgefx.diagnosticCaptureStatus());
      this.#failures = 0;
    } catch {
      /* old engine (404) / not supported (501) / unreachable: the panel's availability check explains it */
    }
    this.#schedule();
  };

  /** Once per session, when the device first advertises the diagnostic: pick up a run that is already going (another
   *  window, or this page was reloaded mid-run) so the background reads stay quiet and the progress shows. */
  resume = (): void => {
    if (this.#resumed || isRemote()) return;
    this.#resumed = true;
    void this.refresh();
  };

  #adopt(s: CaptureStatus): void {
    this.status = s;
    if (s.state !== 'running') this.cancelling = false;
    this.#maybeFetchResult();
  }

  #schedule(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const d = pollDecision({ state: this.status?.state, failures: this.#failures });
    if (!d.poll) {
      if (this.status?.state === 'running' && this.#failures >= POLL_MAX_FAILURES) {
        this.error = 'Lost contact with the Axis engine while the diagnostic was running. Check that it is still running, then refresh.';
      }
      return;
    }
    this.#timer = setTimeout(this.#tick, d.delayMs);
  }

  #tick = async (): Promise<void> => {
    if (this.#timer) clearTimeout(this.#timer); // also reached directly (cancel): never leave a second chain pending
    this.#timer = null;
    try {
      this.#adopt(await forgefx.diagnosticCaptureStatus());
      this.#failures = 0;
    } catch {
      this.#failures++;
    }
    this.#schedule();
  };

  /** Try polling again after the "lost contact" error. */
  retryPolling = (): void => {
    this.error = null;
    this.#failures = 0;
    void this.refresh();
  };

  // ── run ──
  /** Start a run. The request is built (and the two gates checked) by the caller via `buildStartRequest`. */
  start = async (request: CaptureStartRequest): Promise<boolean> => {
    if (this.starting || this.running) return false;
    this.starting = true;
    this.error = null;
    this.resultError = null;
    try {
      const r = await forgefx.startDiagnosticCapture(request);
      // A fresh run: forget everything about the previous one.
      this.bundle = null;
      this.encoded = null;
      this.uploaded = null;
      this.uploadError = null;
      this.savedAs = null;
      this.dismissedId = null;
      this.cancelling = false;
      this.includeFullWalk = !!request.includeFullWalk;
      this.status = { state: 'running', id: r.id, startedAt: new Date().toISOString(), resultAvailable: false };
      this.#failures = 0;
      this.#schedule();
      return true;
    } catch (e) {
      const { status, body } = errorInfo(e);
      this.error = startErrorMessage(status, body);
      return false;
    } finally {
      this.starting = false;
    }
  };

  cancel = async (): Promise<void> => {
    if (this.view !== 'running') return;
    this.cancelling = true;
    try {
      await forgefx.cancelDiagnosticCapture();
    } catch (e) {
      this.cancelling = false;
      this.error = cancelErrorMessage(errorInfo(e).status);
    }
    void this.#tick(); // reflect the stop quickly instead of waiting for the next poll
  };

  /** Leave a finished run's summary and return to the setup form ("Run again"). */
  dismiss = (): void => {
    this.dismissedId = this.status?.id ?? '';
    this.error = null;
    this.resultError = null;
  };

  // ── result ──
  #maybeFetchResult(): void {
    if (shouldFetchResult({ status: this.status, heldId: this.bundle ? this.bundle.id : null, loading: this.loadingResult })) void this.loadResult();
  }

  loadResult = async (): Promise<void> => {
    if (this.loadingResult) return;
    this.loadingResult = true;
    this.resultError = null;
    try {
      const b = await forgefx.diagnosticCaptureResult();
      this.encoded = await encodeBundle(withAxisVersion(b, axisVersion()), platformGzip());
      this.bundle = b;
    } catch (e) {
      this.resultError = resultErrorMessage(errorInfo(e).status);
    } finally {
      this.loadingResult = false;
    }
  };

  /** Download the result as `.json.gz` (or `.json` where gzip is unavailable). Returns the file name, or null when there is nothing to save. */
  saveLocal = (): string | null => {
    const b = this.bundle;
    const enc = this.encoded;
    if (!b || !enc || typeof document === 'undefined') return null;
    const name = bundleFileName(b, enc.ext);
    const url = URL.createObjectURL(new Blob([enc.bytes as BlobPart], { type: enc.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    this.savedAs = name;
    return name;
  };

  /** Hand the result to the Axis cloud (through the engine's signed-in session). The caller passes the live sign-in state. */
  upload = async (ctx: { signedIn: boolean; cloudEnabled: boolean; consent: boolean }): Promise<boolean> => {
    const pre = uploadPreconditions({ ...ctx, hasResult: !!this.bundle, busy: this.uploading, gzBytes: this.encoded?.gzBytes ?? null });
    if (!pre.ok) {
      this.uploadError = pre.reason;
      return false;
    }
    this.uploading = true;
    this.uploadError = null;
    try {
      const r = await forgefx.uploadDiagnosticCapture(true);
      this.uploaded = { captureId: r.captureId, bytes: r.bytes };
      return true;
    } catch (e) {
      const { status, body } = errorInfo(e);
      this.uploadError = uploadErrorMessage(status, body);
      return false;
    } finally {
      this.uploading = false;
    }
  };

  /** Is the held status one of a finished run? (Convenience for templates.) */
  get finished(): boolean {
    return isFinishedState(this.status?.state);
  }
}

export const diagnostics = new DiagnosticsStore();
