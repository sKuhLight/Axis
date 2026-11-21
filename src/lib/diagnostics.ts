// Pure decision logic for the in-product device diagnostic (Settings → Debug → "Device diagnostics").
//
// The diagnostic is a gated, staged probe run against the connected device (ForgeFX `/diagnostics/capture*`)
// that always ends in a redacted result bundle, which the user can save locally or upload for analysis.
// Everything that decides WHAT the UI offers or says lives here as framework-free functions, so it is unit-tested
// (see `diagnostics.test.ts`): availability, start gating (disclaimer + second confirmation), the full-walk gate,
// status → view mapping, polling cadence, step rows and the run summary, upload preconditions and preview,
// error wording per HTTP status, and the bundle file name / gzip-with-fallback encoding. The runes store
// (`diagnostics.svelte.ts`) and the panel (`DiagnosticsPanel.svelte`) are thin shells over these.

import type {
  CaptureUploadRequest,
  CaptureBundle,
  CaptureRunState,
  CaptureStartRequest,
  CaptureStatus,
  CaptureStepName,
  CaptureStepStatus
} from './types';

// ── fixed copy (exact wording from the product contract) ────────────────────────────────────────────────────

/** Mandatory disclaimer checkbox — the Start button stays disabled until it is ticked. */
export const BACKUP_ACK_TEXT =
  'I have a backup of my presets and settings. I understand the device may stop responding and need to be switched off and on again.';
/** Title of the second confirmation dialog (Cancel is its default action). */
export const CONFIRM_TITLE = 'Run the device diagnostic now?';
/** Label of the optional full-walk toggle. */
export const FULL_WALK_LABEL =
  'Include full walk (writes test values to the device, only available for verified firmware)';
/** Extra warning shown while the full-walk toggle is on (and again in the confirmation dialog). */
export const FULL_WALK_WARNING =
  'The full walk briefly writes test values into the current preset on the device and reloads it afterwards. Nothing is saved permanently, but it takes noticeably longer and the device may react oddly while it runs. Do not touch the device or save anything on it until the diagnostic is finished.';
/** Explicit consent tick before anything leaves this computer. */
export const UPLOAD_CONSENT_TEXT =
  'I have reviewed what is uploaded and agree to send this diagnostic result to Axis for analysis.';
/** The cloud's compressed upload ceiling (server answers 413 above it). */
export const UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
/** After this long an upload shows a "still uploading" note (large results take minutes; the engine's own worst case is ~9.5 min). */
export const UPLOAD_SLOW_MS = 15_000;

/** The engine accepts the client's version in this form only (it stamps it into the uploaded copy). */
const AXIS_VERSION_RE = /^[0-9A-Za-z.+-]{1,32}$/;

/** The `POST /diagnostics/capture/upload` body: the consent, plus the Axis version when it is a plausible one. */
export function uploadRequestBody(axisVersion: string | null | undefined): CaptureUploadRequest {
  return axisVersion && AXIS_VERSION_RE.test(axisVersion) ? { consent: true, axisVersion } : { consent: true };
}

// ── step catalogue ──────────────────────────────────────────────────────────────────────────────────────────

/** The steps of a default run, in execution order. `fullWalk` is appended only when the user opted in. */
export const DEFAULT_STEPS: readonly CaptureStepName[] = ['info', 'readonlyWalk', 'labelProbe', 'dumpHeaderProbe', 'reloadProbe'];

export const STEP_INFO: Record<CaptureStepName, { label: string; what: string }> = {
  info: { label: 'Device information', what: 'Model, firmware version, connection type and the current preset number.' },
  readonlyWalk: { label: 'Read-only definitions scan', what: 'Reads the definitions the device describes itself with. Nothing is written.' },
  labelProbe: { label: 'Label check', what: 'Asks for one value label per option list and compares it with the expected name.' },
  dumpHeaderProbe: { label: 'Preset header check', what: 'Requests a few stored presets and keeps only the header of each answer.' },
  reloadProbe: { label: 'Reload check', what: 'Re-selects the current preset and checks the device switches back correctly. Skipped when the device has unsaved edits.' },
  fullWalk: { label: 'Full walk', what: 'Writes test values into the current preset to measure exact parameter ranges. Verified firmware only.' }
};

/** Display label for a step name; unknown (future) steps fall back to their raw name. */
export const stepLabel = (name: string): string => STEP_INFO[name as CaptureStepName]?.label ?? name;

// ── availability ────────────────────────────────────────────────────────────────────────────────────────────

export type DiagUnavailableReason = 'remote' | 'offline' | 'no-capability';
export interface DiagAvailability {
  available: boolean;
  reason?: DiagUnavailableReason;
  /** Why the diagnostic is not offered — shown in place of the controls. Empty when available. */
  message: string;
}

/**
 * Can a NEW run be started from here? Needs a local (or in-page) session — over a relay the device sits on another
 * computer and a multi-megabyte result would have to cross it — a connected device, and the server advertising
 * `diagnosticCapture` for it. Otherwise the panel explains which of these is missing. (A run that is already
 * going, or finished, is shown regardless — see `diagView`.)
 */
export function diagnosticsAvailability(inp: {
  caps: { diagnosticCapture?: boolean } | null | undefined;
  online: boolean;
  isRemote: boolean;
}): DiagAvailability {
  if (inp.isRemote) {
    return { available: false, reason: 'remote', message: 'The device diagnostic runs on the computer the device is connected to. Open Axis there to run it.' };
  }
  if (!inp.online) {
    return { available: false, reason: 'offline', message: 'Connect your device to run the diagnostic.' };
  }
  if (!inp.caps?.diagnosticCapture) {
    return {
      available: false,
      reason: 'no-capability',
      message: 'The device diagnostic is not available for this device or this version of the engine. It is offered for Fractal gen-3 devices (FM3, FM9, Axe-Fx III) that can describe themselves — update Axis if you expect it here.'
    };
  }
  return { available: true, message: '' };
}

export interface FullWalkAvailability {
  available: boolean;
  /** Why the toggle is disabled. Empty when available. */
  reason: string;
}

/** The opt-in full walk is offered only where the existing full-capture gate allows it (`fullCapture` + a device that self-describes). */
export function fullWalkAvailability(caps: { fullCapture?: boolean; selfDescribe?: boolean } | null | undefined): FullWalkAvailability {
  if (caps?.fullCapture && caps?.selfDescribe) return { available: true, reason: '' };
  return {
    available: false,
    reason: 'The full walk is only available for firmware that has been verified for it. It is not enabled for this device and firmware, so the diagnostic runs without it.'
  };
}

// ── start gating ────────────────────────────────────────────────────────────────────────────────────────────

/** The disclaimer box is ticked, the diagnostic is available and nothing is in progress → "Start" may open the confirmation. */
export function canOpenConfirm(inp: { acknowledged: boolean; view: DiagView; available: boolean }): boolean {
  return inp.acknowledged && inp.available && inp.view === 'idle';
}

/**
 * The request body for `POST /diagnostics/capture` — or null while either gate is still closed (disclaimer ticked AND the
 * second dialog confirmed). `includeFullWalk` is sent only when the user asked for it AND it is available, so a stale
 * toggle can never request it. No `steps` are sent: the engine picks the default staged run.
 */
export function buildStartRequest(inp: {
  acknowledged: boolean;
  confirmed: boolean;
  includeFullWalk: boolean;
  fullWalk: FullWalkAvailability;
}): CaptureStartRequest | null {
  if (!inp.acknowledged || !inp.confirmed) return null;
  return inp.includeFullWalk && inp.fullWalk.available ? { acknowledged: true, includeFullWalk: true } : { acknowledged: true };
}

// ── status → view ───────────────────────────────────────────────────────────────────────────────────────────

/** What the panel shows: the setup form, a run being started / running / being cancelled, a run whose engine went
 *  silent (`lost`), or a finished run's summary. */
export type DiagView = 'idle' | 'starting' | 'running' | 'cancelling' | 'lost' | 'finished';

export const isFinishedState = (s: CaptureRunState | undefined): boolean => s === 'done' || s === 'failed' || s === 'cancelled';

/**
 * Map the engine's status (plus local transient flags) to a view. `dismissedId` is the id of a finished run the user already
 * moved on from ("Run again") — it then reads as idle until a different run appears.
 */
export function diagView(inp: { status: CaptureStatus | null; starting: boolean; cancelling: boolean; dismissedId: string | null; lost?: boolean }): DiagView {
  if (inp.starting) return 'starting';
  const state = inp.status?.state;
  if (state === 'running') return inp.lost ? 'lost' : inp.cancelling ? 'cancelling' : 'running';
  if (isFinishedState(state)) return inp.dismissedId !== null && inp.dismissedId === (inp.status?.id ?? '') ? 'idle' : 'finished';
  return 'idle';
}

/** Anything that keeps the device transport busy: background device reads (poll / preset watch) must sit out.
 *  A `lost` run is not: the engine has been unreachable too long to keep the editor waiting on it. */
export const isRunBusy = (view: DiagView): boolean => view === 'starting' || view === 'running' || view === 'cancelling';

// ── polling ─────────────────────────────────────────────────────────────────────────────────────────────────

export const POLL_MS = 1000;
/** Backoff ceiling between failed polls. */
export const POLL_MAX_DELAY_MS = 5000;
/** The engine has been unreachable this long -> stop treating the run as busy (the editor resumes). */
export const LOST_CONTACT_MS = 60_000;

/**
 * Keep polling for as long as a run is going - the status read is in-memory on the engine and never touches the
 * device - backing off after failed polls up to `POLL_MAX_DELAY_MS`. Polling continues while contact is lost, so a
 * returning engine is picked up on its own.
 */
export function pollDecision(inp: { state: CaptureRunState | undefined; failures: number }): { poll: boolean; delayMs: number } {
  if (inp.state !== 'running') return { poll: false, delayMs: 0 };
  return { poll: true, delayMs: Math.min(POLL_MS * (1 + Math.max(0, inp.failures)), POLL_MAX_DELAY_MS) };
}

/** Has the engine been unreachable (consecutive failed polls) for longer than `LOST_CONTACT_MS`? `null` = reachable. */
export const isContactLost = (unreachableMs: number | null): boolean => unreachableMs !== null && unreachableMs > LOST_CONTACT_MS;

/** A finished run's bundle should be fetched once: results exist, and the one held (if any) is for another run. */
export function shouldFetchResult(inp: { status: CaptureStatus | null; heldId: string | null; loading: boolean }): boolean {
  const s = inp.status;
  return !!s && isFinishedState(s.state) && s.resultAvailable && !inp.loading && inp.heldId !== (s.id ?? '');
}

// ── step rows + summary ─────────────────────────────────────────────────────────────────────────────────────

export type StepTone = 'idle' | 'busy' | 'ok' | 'warn' | 'bad';
export interface StepRow {
  name: string;
  label: string;
  what: string;
  status: CaptureStepStatus;
  statusText: string;
  tone: StepTone;
  /** 0–100 while the step reports progress, else null. */
  pct: number | null;
  progressText: string | null;
  note: string | null;
}

const STATUS_TEXT: Record<CaptureStepStatus, string> = { pending: 'Waiting', running: 'Running', ok: 'Done', failed: 'Failed', aborted: 'Aborted', skipped: 'Skipped' };
const STATUS_TONE: Record<CaptureStepStatus, StepTone> = { pending: 'idle', running: 'busy', ok: 'ok', failed: 'bad', aborted: 'warn', skipped: 'warn' };

/** Defensive: a status the client doesn't know (a future engine) reads as pending rather than breaking the list. */
const knownStatus = (s: string): CaptureStepStatus => (s in STATUS_TEXT ? (s as CaptureStepStatus) : 'pending');

/**
 * One row per step. The planned steps come first (so the list is complete before the engine reports any progress), merged
 * with what the engine reports; steps the engine adds beyond the plan (e.g. `fullWalk`) follow in its order.
 */
export function stepRows(status: Pick<CaptureStatus, 'steps'> | null, plan: { includeFullWalk: boolean }): StepRow[] {
  const planned: string[] = [...DEFAULT_STEPS, ...(plan.includeFullWalk ? ['fullWalk'] : [])];
  const reported = status?.steps ?? [];
  const names = [...planned, ...reported.map((s) => s.name).filter((n) => !planned.includes(n))];
  return names.map((name) => {
    const r = reported.find((s) => s.name === name);
    const st = knownStatus(r?.status ?? 'pending');
    const total = r?.progress?.total ?? 0;
    const done = r?.progress?.done ?? 0;
    const hasProgress = !!r?.progress && total > 0;
    return {
      name,
      label: stepLabel(name),
      what: STEP_INFO[name as CaptureStepName]?.what ?? '',
      status: st,
      statusText: STATUS_TEXT[st],
      tone: STATUS_TONE[st],
      pct: hasProgress ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : null,
      progressText: hasProgress ? `${done} / ${total}` : null,
      note: r?.note?.trim() ? r.note.trim() : null
    };
  });
}

/** Overall progress 0–100: finished steps count fully, the running one by its own progress (half when it reports none). */
export function overallProgress(rows: readonly StepRow[]): number {
  if (!rows.length) return 0;
  let acc = 0;
  for (const r of rows) {
    if (r.status === 'ok' || r.status === 'failed' || r.status === 'aborted' || r.status === 'skipped') acc += 1;
    else if (r.status === 'running') acc += r.pct !== null ? r.pct / 100 : 0.5;
  }
  return Math.round((acc / rows.length) * 100);
}

const clip = (s: string, n: number): string => {
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Human wording for the engine's `abortReason` (`cancelled`, `device-silent`, `query-bound`, `error: …`). Null when there is none. */
export function abortReasonText(reason: string | undefined | null): string | null {
  const r = reason?.trim();
  if (!r) return null;
  if (r === 'cancelled') return 'You cancelled the run.';
  if (r === 'device-silent') return 'The device stopped answering, so the run was stopped. Switch the device off and on again before you carry on.';
  if (r === 'query-bound') return 'A query fell outside the safe limits of the scan, so Axis refused to send it and stopped the run. It was never sent to the device.';
  if (/^error:/i.test(r)) return `The run stopped because of an error: ${clip(r.replace(/^error:\s*/i, ''), 200)}`;
  return `The run stopped: ${clip(r, 200)}`;
}

export interface RunSummary {
  tone: 'ok' | 'warn' | 'bad';
  headline: string;
  /** Wording for the abort reason, or null for a clean run. */
  detail: string | null;
  counts: { ok: number; failed: number; skipped: number; aborted: number };
  /** `startedAt → endedAt` as e.g. "2 min 5 s"; null when either stamp is missing. */
  durationText: string | null;
  /** The device stopped answering — tell the user to power-cycle it. */
  restartAdvised: boolean;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

/** The final summary of a finished run: headline, abort reason, per-status step counts and duration. */
export function runSummary(status: CaptureStatus, rows: readonly StepRow[]): RunSummary {
  const counts = { ok: 0, failed: 0, skipped: 0, aborted: 0 };
  for (const r of rows) {
    if (r.status === 'ok') counts.ok++;
    else if (r.status === 'failed') counts.failed++;
    else if (r.status === 'skipped') counts.skipped++;
    else if (r.status === 'aborted') counts.aborted++;
  }
  let tone: RunSummary['tone'] = 'ok';
  let headline = 'Diagnostic finished';
  if (status.state === 'cancelled') { tone = 'warn'; headline = 'Diagnostic cancelled'; }
  else if (status.state === 'failed') { tone = 'bad'; headline = 'Diagnostic stopped early'; }
  else if (counts.failed > 0 || counts.aborted > 0) { tone = 'warn'; headline = 'Diagnostic finished with problems'; }
  const t0 = status.startedAt ? Date.parse(status.startedAt) : NaN;
  const t1 = status.endedAt ? Date.parse(status.endedAt) : NaN;
  const dur = Number.isFinite(t0) && Number.isFinite(t1) ? formatDuration(t1 - t0) : '';
  return {
    tone,
    headline,
    detail: abortReasonText(status.abortReason),
    counts,
    durationText: dur || null,
    restartAdvised: status.abortReason?.trim() === 'device-silent'
  };
}

// ── errors → wording ────────────────────────────────────────────────────────────────────────────────────────

/** HTTP status + parsed JSON body of a failed call. A network/timeout failure (no HTTP response) is status 0;
 *  `timedOut` marks the client's own ceiling expiring (the request may still have been handled). */
export function errorInfo(e: unknown): { status: number; body: unknown; timedOut: boolean } {
  const o = e as { status?: unknown; body?: unknown; name?: unknown } | null;
  return { status: typeof o?.status === 'number' ? o.status : 0, body: o?.body, timedOut: o?.name === 'TimeoutError' || o?.name === 'AbortError' };
}

const field = (body: unknown, key: string): unknown => (body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ENGINE_UNREACHABLE = 'Could not reach the Axis engine. Check that it is still running and try again.';

/** Wording for a failed start (`POST /diagnostics/capture`). */
export function startErrorMessage(status: number, body?: unknown): string {
  switch (status) {
    case 0: return ENGINE_UNREACHABLE;
    case 400: return 'The engine did not accept the request because the disclaimer was not acknowledged. Tick the box and try again.';
    case 404: return 'This version of the engine does not include the device diagnostic. Update Axis to use it.';
    case 409: {
      const what = field(body, 'what');
      if (what === 'cache-build') return 'Axis is reading the device definitions right now. Wait until that has finished, then try again.';
      if (what === 'capture') return 'A diagnostic is already running.';
      return 'The device is busy with another job. Try again in a moment.';
    }
    case 501: return 'This device does not support the device diagnostic.';
    case 503: return 'No device is connected.';
    default: return `The engine could not start the diagnostic (error ${status}). Try again.`;
  }
}

/** Wording for a failed result fetch (`GET /diagnostics/capture/result`). */
export function resultErrorMessage(status: number): string {
  if (status === 0) return ENGINE_UNREACHABLE;
  if (status === 404) return 'The engine has no result for this run. Run the diagnostic again.';
  return `The result could not be loaded (error ${status}).`;
}

/** Wording for a failed cancel request — the run itself may still be going, so say so. */
export function cancelErrorMessage(status: number): string {
  return status === 0 ? `${ENGINE_UNREACHABLE} The run may still be going.` : `The cancel request failed (error ${status}). The run may still be going.`;
}

/** "in about 2 minutes" - a retry hint from the engine's `retryAfterSeconds` (null/absent -> "in a while"). */
export function formatRetryAfter(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return 'in a while';
  if (seconds < 90) {
    const n = Math.max(1, Math.round(seconds));
    return `in about ${n} second${n === 1 ? '' : 's'}`;
  }
  const m = Math.round(seconds / 60);
  if (m < 90) return `in about ${m} minutes`;
  const h = Math.round(seconds / 3600);
  if (h < 48) return `in about ${h} hour${h === 1 ? '' : 's'}`;
  return `in about ${Math.round(seconds / 86400)} days`;
}

/**
 * Wording for a failed upload (`POST /diagnostics/capture/upload`), per status and error code: 400 not consented, 401
 * not signed in (`reason: 'account-required'` = an anonymous session), 404 no result, 413 too large, 429 `rate-limited` /
 * `quota-exceeded` with `retryAfterSeconds`, 503 `cloud-disabled`, 502 any other cloud error (with the cloud's own
 * status - 0 meaning it could not be reached). `timedOut`: the client stopped waiting; the upload may have gone through.
 */
export function uploadErrorMessage(status: number, body?: unknown, opts: { timedOut?: boolean } = {}): string {
  const big = (bytes: number | null, limit: number | null): string =>
    bytes !== null && limit !== null
      ? `The result is too large to upload (${formatBytes(bytes)}, the limit is ${formatBytes(limit)}). Save it locally instead.`
      : 'The result is too large to upload. Save it locally instead.';
  const rate = (): string => {
    const when = formatRetryAfter(num(field(body, 'retryAfterSeconds')));
    return field(body, 'error') === 'quota-exceeded'
      ? `You have reached the upload limit for the last 30 days. You can upload again ${when}. You can still save the result locally.`
      : `You have uploaded too many diagnostics recently. Try again ${when}.`;
  };
  const unreachable = 'The Axis cloud could not be reached. Check your internet connection and try again — repeating an upload is safe.';
  switch (status) {
    case 0:
      return opts.timedOut
        ? 'The upload is taking longer than expected, so Axis stopped waiting. It may still have gone through — trying again is safe, the cloud ignores duplicates.'
        : ENGINE_UNREACHABLE;
    case 400: return 'The upload needs your consent. Tick the box and try again.';
    case 401:
      return field(body, 'reason') === 'account-required'
        ? 'This session is signed in anonymously. Sign in with a full Axis account from the Account tab, then upload again.'
        : 'You are not signed in. Open the Account tab, sign in, then upload again.';
    case 404: return 'There is no finished diagnostic to upload. Run the diagnostic first.';
    case 413: return big(num(field(body, 'bytes')), num(field(body, 'limit')));
    case 429: return rate();
    case 502: {
      const cloudStatus = num(field(body, 'status'));
      const message = field(body, 'message');
      if (cloudStatus === 401 || cloudStatus === 403) return 'Your Axis cloud session has expired. Sign out and in again from the Account tab, then retry.';
      if (cloudStatus === 413) return big(null, null);
      if (cloudStatus === 429) return rate();
      if (cloudStatus === 0) return unreachable;
      const detail = typeof message === 'string' && message.trim() ? `: ${clip(message, 160)}` : '';
      return `The Axis cloud did not accept the upload${cloudStatus !== null ? ` (error ${cloudStatus})` : ''}${detail}. Try again later, or save the result locally.`;
    }
    case 503:
      return field(body, 'error') === 'cloud-disabled' || field(body, 'error') === undefined
        ? 'Cloud features are turned off in this build, so nothing can be uploaded. You can still save the result locally.'
        : 'The Axis cloud is not reachable right now. Try again later, or save the result locally.';
    default: return `The upload failed (error ${status}). Try again later, or save the result locally.`;
  }
}

// ── upload ──────────────────────────────────────────────────────────────────────────────────────────────────

export type UploadBlocker = 'busy' | 'no-result' | 'cloud-off' | 'signed-out' | 'too-large' | 'no-consent';

const BLOCKER_TEXT: Record<UploadBlocker, string> = {
  busy: 'Uploading…',
  'no-result': 'There is no finished diagnostic to upload yet.',
  'cloud-off': 'The Axis cloud is not available on this engine, so nothing can be uploaded. You can still save the result locally.',
  'signed-out': 'Sign in to your Axis account to upload. You can still save the result locally.',
  'too-large': `The result is larger than the ${formatBytes(UPLOAD_LIMIT_BYTES)} upload limit. Save it locally instead.`,
  'no-consent': 'Tick the box to confirm you agree to send this result.'
};

/**
 * May the upload go ahead? Needs a result, a signed-in cloud session, the explicit consent tick, no upload in flight, and (when
 * known) a compressed size within the cloud's limit. `reason` is the first blocker's wording (null when `ok`).
 */
export function uploadPreconditions(inp: {
  hasResult: boolean;
  signedIn: boolean;
  cloudEnabled: boolean;
  consent: boolean;
  busy: boolean;
  /** Compressed size of the result when known; null = unknown (the server still enforces the limit). */
  gzBytes?: number | null;
}): { ok: boolean; blockers: UploadBlocker[]; reason: string | null } {
  const blockers: UploadBlocker[] = [];
  if (inp.busy) blockers.push('busy');
  if (!inp.hasResult) blockers.push('no-result');
  if (!inp.cloudEnabled) blockers.push('cloud-off');
  else if (!inp.signedIn) blockers.push('signed-out');
  if (inp.gzBytes != null && inp.gzBytes > UPLOAD_LIMIT_BYTES) blockers.push('too-large');
  if (!inp.consent) blockers.push('no-consent');
  return { ok: blockers.length === 0, blockers, reason: blockers[0] ? BLOCKER_TEXT[blockers[0]] : null };
}

export interface PreviewRow { label: string; value: string }

/** The "what is uploaded" rows, derived from the bundle itself so the preview is the truth, not a description of it. */
export function uploadPreview(bundle: CaptureBundle, sizes: { jsonBytes: number; gzBytes: number | null }): { rows: PreviewRow[]; notIncluded: string; retention: string } {
  const app = bundle.app ?? ({} as CaptureBundle['app']);
  const versions = [app.forgefx ? `engine ${app.forgefx}` : '', app.codec ? `protocol ${app.codec}` : '', app.axis ? `Axis ${app.axis}` : ''].filter(Boolean).join(' · ');
  const statusCount = (s: CaptureStepStatus) => (bundle.steps ?? []).filter((x) => x.status === s).length;
  const stepBits = (['ok', 'failed', 'skipped', 'aborted'] as const).map((s) => [s, statusCount(s)] as const).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${STATUS_TEXT[s].toLowerCase()}`);
  const size = sizes.gzBytes !== null ? `about ${formatBytes(sizes.jsonBytes)} (about ${formatBytes(sizes.gzBytes)} compressed)` : `about ${formatBytes(sizes.jsonBytes)}`;
  const red = bundle.redaction ?? { presetNames: 0, dumpPayloadFrames: 0 };
  const rows: PreviewRow[] = [
    { label: 'Device', value: bundle.device?.modelName || 'unknown' },
    { label: 'Firmware', value: bundle.device?.firmware || 'unknown' },
    { label: 'Connection', value: bundle.device?.transport || 'unknown' },
    { label: 'Software versions', value: versions || 'unknown' },
    { label: 'Result', value: `${bundle.state}${bundle.abortReason && bundle.abortReason !== bundle.state ? ` (${clip(bundle.abortReason, 80)})` : ''}` },
    { label: 'Steps', value: `${(bundle.steps ?? []).length} ${(bundle.steps ?? []).length === 1 ? 'step' : 'steps'}${stepBits.length ? ` — ${stepBits.join(', ')}` : ''}` },
    { label: 'Wire log', value: `${(bundle.frames ?? []).length} frames with timestamps` },
    { label: 'Run log', value: `${(bundle.logs ?? []).length} ${(bundle.logs ?? []).length === 1 ? 'line' : 'lines'}` },
    { label: 'Size (estimate)', value: size },
    { label: 'Removed before upload', value: `${red.presetNames} preset/scene name answers blanked · ${red.dumpPayloadFrames} preset dump payloads cut down to their header` }
  ];
  return {
    rows,
    notIncluded: 'Not included: preset or scene names, preset contents, file paths, computer or user names, your e-mail address.',
    retention: 'Stored privately and linked to your Axis account. Kept for up to 180 days and deleted with your account.'
  };
}

// ── local save: file name + gzip with plain-JSON fallback ───────────────────────────────────────────────────

export type GzipFn = (data: Uint8Array) => Promise<Uint8Array>;

export interface EncodedBundle {
  bytes: Uint8Array;
  /** Size of the uncompressed JSON. */
  jsonBytes: number;
  /** Size after gzip; null when no gzip was possible. */
  gzBytes: number | null;
  compressed: boolean;
  ext: 'json.gz' | 'json';
  mime: 'application/gzip' | 'application/json';
}

/** gzip through the platform's `CompressionStream` — null where it does not exist (the caller then saves plain JSON). */
export function platformGzip(): GzipFn | null {
  const CS = (globalThis as { CompressionStream?: new (format: string) => unknown }).CompressionStream;
  if (typeof CS !== 'function') return null;
  return async (data) => {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CS('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
}

/** Serialize the bundle as `.json.gz`, or as plain `.json` when gzip is unavailable or fails. */
export async function encodeBundle(bundle: CaptureBundle, gzip: GzipFn | null): Promise<EncodedBundle> {
  const raw = new TextEncoder().encode(JSON.stringify(bundle));
  if (gzip) {
    try {
      const gz = await gzip(raw);
      if (gz.length > 0) return { bytes: gz, jsonBytes: raw.length, gzBytes: gz.length, compressed: true, ext: 'json.gz', mime: 'application/gzip' };
    } catch {
      /* fall through to plain JSON */
    }
  }
  return { bytes: raw, jsonBytes: raw.length, gzBytes: null, compressed: false, ext: 'json', mime: 'application/json' };
}

/** A copy of the bundle with the Axis version filled in when the engine could not know it. The input is not mutated. */
export function withAxisVersion(bundle: CaptureBundle, axis: string | null | undefined): CaptureBundle {
  if (!axis || bundle.app?.axis) return bundle;
  return { ...bundle, app: { ...bundle.app, axis } };
}

const slug = (s: string, max: number): string =>
  s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(0, max).replace(/[-.]+$/g, '');

/** `axis-diagnostics-<model>-fw<firmware>-<yyyymmdd>-<hhmmss>-<id>.json.gz` — nothing personal, sortable, safe on every file system. */
export function bundleFileName(bundle: Pick<CaptureBundle, 'id' | 'createdAt' | 'device'>, ext: EncodedBundle['ext']): string {
  const parts = ['axis-diagnostics'];
  const model = slug(bundle.device?.modelName ?? '', 24);
  if (model) parts.push(model);
  const fw = slug(bundle.device?.firmware ?? '', 16);
  parts.push(fw ? `fw${fw}` : 'fw-unknown');
  const t = Date.parse(bundle.createdAt);
  if (Number.isFinite(t)) {
    const iso = new Date(t).toISOString(); // 2026-11-21T09:54:26.000Z
    parts.push(iso.slice(0, 10).replace(/-/g, ''), iso.slice(11, 19).replace(/:/g, ''));
  }
  const id = slug(bundle.id ?? '', 8);
  if (id) parts.push(id);
  return `${parts.join('-')}.${ext}`;
}

// ── accessibility ───────────────────────────────────────────────────────────────────────────────────────────

/** Next focus index when Tab wraps inside a modal dialog (`current` -1 = focus is outside the dialog). */
export function cycleFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}
