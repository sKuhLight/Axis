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
import type { CaptureBundle, CapturePreflight, CaptureStartRequest, CaptureStatus, CaptureUnsavedEdits } from './types';
import {
  bundleFileName,
  cancelErrorMessage,
  classifyPreflightError,
  diagView,
  encodeBundle,
  errorInfo,
  isContactLost,
  isFinishedState,
  isRunBusy,
  isStaleCheckError,
  platformGzip,
  pollDecision,
  resultErrorMessage,
  shouldFetchResult,
  startErrorMessage,
  uploadErrorMessage,
  uploadPreconditions,
  uploadRequestBody,
  UPLOAD_SLOW_MS,
  withAxisVersion,
  type DiagView,
  type EncodedBundle
} from './diagnostics';

const axisVersion = (): string | null => {
  const desktop = (globalThis as { axisDesktop?: { version?: string } }).axisDesktop?.version;
  if (desktop) return desktop;
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
};

/** What the pre-check said: a result, a refusal to start (409 busy / 503 no device — the message is in `error`), or a
 *  failure of the pre-check itself (start without a decision, and say so). */
export type PreflightResult =
  | { kind: 'ok'; preflight: CapturePreflight }
  | { kind: 'blocked' }
  | { kind: 'fallback'; note: string };

class DiagnosticsStore {
  /** The engine's view of the current / last run; null until first read (or when the engine has no diagnostic). */
  status = $state<CaptureStatus | null>(null);
  /** The redacted result of the last finished run, once fetched. */
  bundle = $state.raw<CaptureBundle | null>(null);
  /** The result serialized for saving (gzip when possible) — also what the upload preview sizes come from. */
  encoded = $state.raw<EncodedBundle | null>(null);
  /** POST start in flight. */
  starting = $state(false);
  /** The pre-check (a few device reads of the edit buffer) is running — the engine holds the device, so it counts as busy. */
  checking = $state(false);
  /** The last start was refused because the pre-check it relied on no longer fits (token expired / unknown, cannot save): the
   *  panel checks again and asks again instead of showing an error. Read once with `takeStaleCheck`. */
  #staleCheck = false;
  /** What the user decided about unsaved edits for the run that is showing (null = no question was asked), and the
   *  preset it was about — for the summary. */
  unsavedChoice = $state<CaptureUnsavedEdits | null>(null);
  unsavedPreset = $state<{ number: number | null; name?: string } | null>(null);
  /** A cancel was requested and the run has not yet reported that it stopped. */
  cancelling = $state(false);
  loadingResult = $state(false);
  /** Whether the run that is showing was asked to include the full walk (so its step list can be planned up front). */
  includeFullWalk = $state(false);
  /** The engine has been unreachable for more than a minute while a run was going: the run no longer counts as
   *  busy (the editor's background reads resume) and the panel offers Refresh. Cleared as soon as it answers. */
  lost = $state(false);
  /** Start / cancel failure, shown in the panel. */
  error = $state<string | null>(null);
  resultError = $state<string | null>(null);
  uploading = $state(false);
  /** The upload has been running for a while — show a "still uploading" note (large results take minutes). */
  uploadSlow = $state(false);
  uploaded = $state<{ captureId: string; bytes: number; deduped: boolean } | null>(null);
  uploadError = $state<string | null>(null);
  /** File name of the last local save (confirmation text). */
  savedAs = $state<string | null>(null);
  /** A finished run the user already moved on from ("Run again"): reads as idle until a different run appears. */
  dismissedId = $state<string | null>(null);

  #timer: ReturnType<typeof setTimeout> | null = null;
  #slowTimer: ReturnType<typeof setTimeout> | null = null;
  #failures = 0;
  /** When the current streak of failed polls began (null = the last poll succeeded). */
  #failSince: number | null = null;
  #resumed = false;

  get view(): DiagView {
    return diagView({ status: this.status, starting: this.starting, cancelling: this.cancelling, dismissedId: this.dismissedId, lost: this.lost });
  }
  /** A run owns the device transport — the editor's background reads (poll / preset watch / save probe) sit out. */
  get running(): boolean {
    return isRunBusy(this.view, this.checking);
  }

  // ── status ──
  /** Read the engine's status once (and start polling when a run is going). Silent when the engine has no diagnostic. */
  refresh = async (): Promise<void> => {
    try {
      this.#adopt(await forgefx.diagnosticCaptureStatus());
      this.#pollOk();
    } catch {
      this.#pollFailed(); // old engine (404) / not supported (501) / unreachable: the panel's availability check explains it
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

  /** A poll got through: the engine is reachable, whatever it says. */
  #pollOk(): void {
    this.#failures = 0;
    this.#failSince = null;
    this.lost = false;
  }

  /** A poll failed. The status read is in-memory on the engine and never touches the device, so polling carries on
   *  (backing off); but once the engine has been unreachable for over a minute the run stops counting as busy. */
  #pollFailed(): void {
    this.#failures++;
    this.#failSince ??= Date.now();
    this.lost = isContactLost(Date.now() - this.#failSince);
  }

  #schedule(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const d = pollDecision({ state: this.status?.state, failures: this.#failures });
    if (d.poll) this.#timer = setTimeout(this.#tick, d.delayMs);
  }

  #tick = async (): Promise<void> => {
    if (this.#timer) clearTimeout(this.#timer); // also reached directly (cancel / refresh): never leave a second chain pending
    this.#timer = null;
    try {
      this.#adopt(await forgefx.diagnosticCaptureStatus());
      this.#pollOk();
    } catch {
      this.#pollFailed();
    }
    this.#schedule();
  };

  /** "Refresh" after lost contact: ask again right now. */
  retryPolling = (): void => {
    this.error = null;
    void this.#tick();
  };

  // ── run ──
  /** Look at the device right before a run (current preset, edit buffer clean / dirty / unknown). Failures are sorted by
   *  `classifyPreflightError`: a refusal sets `error`; anything else lets the run start without a decision. */
  preflight = async (): Promise<PreflightResult> => {
    if (this.checking) return { kind: 'blocked' };
    this.checking = true;
    this.error = null;
    try {
      return { kind: 'ok', preflight: await forgefx.diagnosticCapturePreflight() };
    } catch (e) {
      const { status, body } = errorInfo(e);
      const c = classifyPreflightError(status, body);
      if (c.kind === 'blocked') {
        this.error = c.message;
        return { kind: 'blocked' };
      }
      return { kind: 'fallback', note: c.message };
    } finally {
      this.checking = false;
    }
  };

  /** Start a run. The request is built (and the two gates checked) by the caller via `buildStartRequest`; `about` is the
   *  preset the unsaved-edits decision (if any) was about. */
  start = async (request: CaptureStartRequest, about?: { number: number | null; name?: string }): Promise<boolean> => {
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
      this.unsavedChoice = request.unsavedEdits ?? null;
      this.unsavedPreset = request.unsavedEdits && about ? about : null;
      this.includeFullWalk = !!request.includeFullWalk;
      this.status = { state: 'running', id: r.id, startedAt: new Date().toISOString(), resultAvailable: false };
      this.#pollOk();
      this.#schedule();
      return true;
    } catch (e) {
      const { status, body } = errorInfo(e);
      if (isStaleCheckError(status, body)) {
        this.#staleCheck = true; // the caller re-runs the pre-check and asks again
        this.error = null;
      } else {
        this.error = startErrorMessage(status, body);
      }
      return false;
    } finally {
      this.starting = false;
    }
  };

  /** Was the last start refused because the pre-check is out of date? (Reads and clears the flag.) */
  takeStaleCheck = (): boolean => {
    const was = this.#staleCheck;
    this.#staleCheck = false;
    return was;
  };

  cancel = async (): Promise<void> => {
    if (this.view !== 'running' && this.view !== 'lost') return;
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
      // The copy we keep carries the Axis version (the engine stamps the same one into the uploaded copy), so the
      // preview, the local file and the upload all describe the same bundle.
      const b = withAxisVersion(await forgefx.diagnosticCaptureResult(), axisVersion());
      this.encoded = await encodeBundle(b, platformGzip());
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
    this.uploadSlow = false;
    this.uploadError = null;
    this.#slowTimer = setTimeout(() => { this.uploadSlow = true; }, UPLOAD_SLOW_MS);
    try {
      const r = await forgefx.uploadDiagnosticCapture(uploadRequestBody(axisVersion()));
      this.uploaded = { captureId: r.captureId, bytes: r.bytes, deduped: r.deduped === true };
      return true;
    } catch (e) {
      const { status, body, timedOut } = errorInfo(e);
      this.uploadError = uploadErrorMessage(status, body, { timedOut });
      return false;
    } finally {
      if (this.#slowTimer) clearTimeout(this.#slowTimer);
      this.#slowTimer = null;
      this.uploading = false;
      this.uploadSlow = false;
    }
  };

  /** Is the held status one of a finished run? (Convenience for templates.) */
  get finished(): boolean {
    return isFinishedState(this.status?.state);
  }
}

export const diagnostics = new DiagnosticsStore();
