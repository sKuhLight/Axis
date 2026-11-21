import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  BACKUP_ACK_TEXT,
  CONFIRM_TITLE,
  DEFAULT_STEPS,
  FULL_WALK_LABEL,
  LOST_CONTACT_MS,
  POLL_MAX_DELAY_MS,
  POLL_MS,
  UPLOAD_LIMIT_BYTES,
  abortReasonText,
  bundleFileName,
  buildStartRequest,
  cancelErrorMessage,
  canOpenConfirm,
  cycleFocusIndex,
  diagView,
  diagnosticsAvailability,
  encodeBundle,
  errorInfo,
  formatBytes,
  formatDuration,
  formatRetryAfter,
  fullWalkAvailability,
  isContactLost,
  isFinishedState,
  isRunBusy,
  overallProgress,
  platformGzip,
  pollDecision,
  resultErrorMessage,
  runSummary,
  shouldFetchResult,
  startErrorMessage,
  stepLabel,
  stepRows,
  uploadErrorMessage,
  uploadPreconditions,
  uploadPreview,
  uploadRequestBody,
  withAxisVersion
} from './diagnostics';
import type { CaptureBundle, CaptureStatus } from './types';

// ── synthetic data only ──────────────────────────────────────────────────────────────────────────────────────
const bundle = (o: Partial<CaptureBundle> = {}): CaptureBundle => ({
  schema: 1,
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  createdAt: '2026-01-02T03:04:05.000Z',
  endedAt: '2026-01-02T03:06:10.000Z',
  state: 'done',
  app: { forgefx: '1.2.3', codec: '4.5.6' },
  device: { model: 7, modelName: 'Test Unit III', firmware: '99.01', transport: 'serial' },
  steps: [
    { name: 'info', status: 'ok' },
    { name: 'readonlyWalk', status: 'ok' },
    { name: 'labelProbe', status: 'failed', error: 'x' },
    { name: 'dumpHeaderProbe', status: 'ok' },
    { name: 'reloadProbe', status: 'skipped', note: 'unsaved edits' }
  ],
  frames: [
    { t: 0, dir: 'TX', hex: 'f0 00 f7' },
    { t: 5, dir: 'RX', hex: 'f0 01 f7' }
  ],
  logs: [{ t: 1, level: 'info', msg: 'hello' }],
  redaction: { presetNames: 3, dumpPayloadFrames: 2 },
  ...o
});
const status = (o: Partial<CaptureStatus> = {}): CaptureStatus => ({ state: 'idle', resultAvailable: false, ...o });

describe('fixed copy (exact wording from the product contract)', () => {
  it('uses the exact backup disclaimer and confirmation title', () => {
    expect(BACKUP_ACK_TEXT).toBe(
      'I have a backup of my presets and settings. I understand the device may stop responding and need to be switched off and on again.'
    );
    expect(CONFIRM_TITLE).toBe('Run the device diagnostic now?');
    expect(FULL_WALK_LABEL).toBe('Include full walk (writes test values to the device, only available for verified firmware)');
  });
  it('lists the default staged run in execution order', () => {
    expect([...DEFAULT_STEPS]).toEqual(['info', 'readonlyWalk', 'labelProbe', 'dumpHeaderProbe', 'reloadProbe']);
  });
});

describe('diagnosticsAvailability — visible only with the capability, otherwise explained', () => {
  const ok = { caps: { diagnosticCapture: true }, online: true, isRemote: false };
  it('is available when connected locally and the device reports diagnosticCapture', () => {
    expect(diagnosticsAvailability(ok)).toEqual({ available: true, message: '' });
  });
  it('explains an engine/device without the capability (absent or false)', () => {
    for (const caps of [null, undefined, {}, { diagnosticCapture: false }]) {
      const a = diagnosticsAvailability({ ...ok, caps });
      expect(a.available).toBe(false);
      expect(a.reason).toBe('no-capability');
      expect(a.message).toMatch(/not available/i);
    }
  });
  it('explains an offline device and a relayed session; the relay reason wins', () => {
    expect(diagnosticsAvailability({ ...ok, online: false })).toMatchObject({ available: false, reason: 'offline' });
    expect(diagnosticsAvailability({ ...ok, isRemote: true })).toMatchObject({ available: false, reason: 'remote' });
    expect(diagnosticsAvailability({ caps: null, online: false, isRemote: true }).reason).toBe('remote');
  });
});

describe('fullWalkAvailability — uses the existing fullCapture gate', () => {
  it('is available only when the device advertises fullCapture AND self-describes', () => {
    expect(fullWalkAvailability({ fullCapture: true, selfDescribe: true })).toEqual({ available: true, reason: '' });
    for (const caps of [null, undefined, {}, { fullCapture: true }, { selfDescribe: true }, { fullCapture: false, selfDescribe: true }]) {
      const f = fullWalkAvailability(caps);
      expect(f.available).toBe(false);
      expect(f.reason).toMatch(/verified/i);
    }
  });
});

describe('start gating — disclaimer tick + second confirmation', () => {
  it('opens the confirmation only when ticked, available and idle', () => {
    expect(canOpenConfirm({ acknowledged: true, available: true, view: 'idle' })).toBe(true);
    expect(canOpenConfirm({ acknowledged: false, available: true, view: 'idle' })).toBe(false);
    expect(canOpenConfirm({ acknowledged: true, available: false, view: 'idle' })).toBe(false);
    for (const view of ['starting', 'running', 'cancelling', 'finished'] as const) {
      expect(canOpenConfirm({ acknowledged: true, available: true, view })).toBe(false);
    }
  });
  const fw = { available: true, reason: '' };
  it('builds no request until BOTH the tick and the confirmation are given', () => {
    expect(buildStartRequest({ acknowledged: false, confirmed: false, includeFullWalk: false, fullWalk: fw })).toBeNull();
    expect(buildStartRequest({ acknowledged: true, confirmed: false, includeFullWalk: false, fullWalk: fw })).toBeNull();
    expect(buildStartRequest({ acknowledged: false, confirmed: true, includeFullWalk: false, fullWalk: fw })).toBeNull();
  });
  it('sends acknowledged:true and no step list for the default run', () => {
    expect(buildStartRequest({ acknowledged: true, confirmed: true, includeFullWalk: false, fullWalk: fw })).toEqual({ acknowledged: true });
  });
  it('requests the full walk only when asked for AND available', () => {
    expect(buildStartRequest({ acknowledged: true, confirmed: true, includeFullWalk: true, fullWalk: fw })).toEqual({ acknowledged: true, includeFullWalk: true });
    // a stale toggle cannot request it once the gate closed
    expect(buildStartRequest({ acknowledged: true, confirmed: true, includeFullWalk: true, fullWalk: { available: false, reason: 'x' } })).toEqual({ acknowledged: true });
  });
});

describe('diagView — status → view', () => {
  const v = (s: CaptureStatus | null, o: { starting?: boolean; cancelling?: boolean; dismissedId?: string | null; lost?: boolean } = {}) =>
    diagView({ status: s, starting: false, cancelling: false, dismissedId: null, ...o });
  it('maps engine states', () => {
    expect(v(null)).toBe('idle');
    expect(v(status({ state: 'idle' }))).toBe('idle');
    expect(v(status({ state: 'running', id: 'r1' }))).toBe('running');
    for (const state of ['done', 'failed', 'cancelled'] as const) expect(v(status({ state, id: 'r1' }))).toBe('finished');
  });
  it('reads as starting while the start request is in flight, ahead of any older status', () => {
    expect(v(status({ state: 'done', id: 'old' }), { starting: true })).toBe('starting');
  });
  it('shows cancelling only while the run is still running', () => {
    expect(v(status({ state: 'running', id: 'r1' }), { cancelling: true })).toBe('cancelling');
    expect(v(status({ state: 'cancelled', id: 'r1' }), { cancelling: true })).toBe('finished');
  });
  it('lets the user move on from a finished run, until a different run shows up', () => {
    expect(v(status({ state: 'done', id: 'r1' }), { dismissedId: 'r1' })).toBe('idle');
    expect(v(status({ state: 'done', id: 'r2' }), { dismissedId: 'r1' })).toBe('finished');
    expect(v(status({ state: 'running', id: 'r2' }), { dismissedId: 'r1' })).toBe('running');
    // a finished status without an id is dismissed by the empty id
    expect(v(status({ state: 'done' }), { dismissedId: '' })).toBe('idle');
  });
  it('a run whose engine went silent reads as lost, and only while it is running', () => {
    expect(v(status({ state: 'running', id: 'r1' }), { lost: true })).toBe('lost');
    expect(v(status({ state: 'running', id: 'r1' }), { lost: true, cancelling: true })).toBe('lost');
    expect(v(status({ state: 'done', id: 'r1' }), { lost: true })).toBe('finished');
    expect(v(null, { lost: true })).toBe('idle');
    expect(v(status({ state: 'running', id: 'r1' }), { lost: false })).toBe('running');
  });
  it('isRunBusy marks exactly the views that own the device transport — a lost run no longer does', () => {
    expect(['idle', 'starting', 'running', 'cancelling', 'lost', 'finished'].map((x) => isRunBusy(x as never))).toEqual([false, true, true, true, false, false]);
    expect(isFinishedState('done') && isFinishedState('failed') && isFinishedState('cancelled')).toBe(true);
    expect(isFinishedState('running') || isFinishedState('idle') || isFinishedState(undefined)).toBe(false);
  });
});

describe('polling', () => {
  it('polls while running and backs off after failures, capped at a few seconds — it never gives up on its own', () => {
    expect(pollDecision({ state: 'running', failures: 0 })).toEqual({ poll: true, delayMs: POLL_MS });
    expect(pollDecision({ state: 'running', failures: 2 }).delayMs).toBe(POLL_MS * 3);
    for (const failures of [4, 5, 50, 5000]) expect(pollDecision({ state: 'running', failures })).toEqual({ poll: true, delayMs: POLL_MAX_DELAY_MS });
    expect(POLL_MAX_DELAY_MS).toBeLessThanOrEqual(5000);
    expect(pollDecision({ state: 'running', failures: -3 }).delayMs).toBe(POLL_MS);
    for (const state of ['idle', 'done', 'failed', 'cancelled', undefined] as const) expect(pollDecision({ state, failures: 0 }).poll).toBe(false);
  });
  it('declares contact lost once the engine has been unreachable for over a minute', () => {
    expect(LOST_CONTACT_MS).toBe(60_000);
    expect(isContactLost(null)).toBe(false);
    expect(isContactLost(0)).toBe(false);
    expect(isContactLost(LOST_CONTACT_MS)).toBe(false);
    expect(isContactLost(LOST_CONTACT_MS + 1)).toBe(true);
  });
  it('fetches the result once per finished run that has one', () => {
    const done = status({ state: 'done', id: 'r1', resultAvailable: true });
    expect(shouldFetchResult({ status: done, heldId: null, loading: false })).toBe(true);
    expect(shouldFetchResult({ status: done, heldId: 'r1', loading: false })).toBe(false);
    expect(shouldFetchResult({ status: done, heldId: 'r0', loading: false })).toBe(true);
    expect(shouldFetchResult({ status: done, heldId: null, loading: true })).toBe(false);
    expect(shouldFetchResult({ status: { ...done, resultAvailable: false }, heldId: null, loading: false })).toBe(false);
    expect(shouldFetchResult({ status: status({ state: 'running', resultAvailable: true }), heldId: null, loading: false })).toBe(false);
    expect(shouldFetchResult({ status: null, heldId: null, loading: false })).toBe(false);
  });
});

describe('stepRows / overallProgress', () => {
  it('lists the planned steps as waiting before the engine reports anything', () => {
    const rows = stepRows(null, { includeFullWalk: false });
    expect(rows.map((r) => r.name)).toEqual([...DEFAULT_STEPS]);
    expect(rows.every((r) => r.status === 'pending' && r.statusText === 'Waiting' && r.tone === 'idle' && r.pct === null)).toBe(true);
    expect(stepRows(null, { includeFullWalk: true }).map((r) => r.name).at(-1)).toBe('fullWalk');
  });
  it('merges the engine report into the plan and appends steps beyond it', () => {
    const rows = stepRows(
      {
        steps: [
          { name: 'info', status: 'ok' },
          { name: 'readonlyWalk', status: 'running', progress: { done: 25, total: 100 }, note: '  halfway  ' },
          { name: 'fullWalk', status: 'skipped', note: 'firmware not verified' }
        ]
      },
      { includeFullWalk: false }
    );
    expect(rows.map((r) => r.name)).toEqual([...DEFAULT_STEPS, 'fullWalk']);
    const walk = rows.find((r) => r.name === 'readonlyWalk')!;
    expect(walk).toMatchObject({ status: 'running', statusText: 'Running', tone: 'busy', pct: 25, progressText: '25 / 100', note: 'halfway' });
    expect(rows.find((r) => r.name === 'fullWalk')).toMatchObject({ statusText: 'Skipped', tone: 'warn', note: 'firmware not verified' });
    expect(rows.find((r) => r.name === 'labelProbe')!.status).toBe('pending');
  });
  it('tones every status, clamps progress and tolerates unknown steps/statuses from a newer engine', () => {
    const rows = stepRows(
      {
        steps: [
          { name: 'info', status: 'failed' },
          { name: 'readonlyWalk', status: 'aborted' },
          { name: 'labelProbe', status: 'running', progress: { done: 500, total: 100 } },
          { name: 'dumpHeaderProbe', status: 'running', progress: { done: 0, total: 0 } },
          { name: 'reloadProbe', status: 'weird' as never },
          { name: 'newStep' as never, status: 'ok' }
        ]
      },
      { includeFullWalk: false }
    );
    expect(rows[0]!.tone).toBe('bad');
    expect(rows[1]!.tone).toBe('warn');
    expect(rows[2]!.pct).toBe(100);
    expect(rows[3]!.pct).toBeNull(); // total 0 → no progress bar
    expect(rows[4]!.status).toBe('pending');
    const extra = rows.find((r) => r.name === 'newStep')!;
    expect(extra.label).toBe('newStep');
    expect(stepLabel('info')).toBe('Device information');
  });
  it('computes overall progress from finished and running steps', () => {
    expect(overallProgress([])).toBe(0);
    const rows = stepRows(
      { steps: [{ name: 'info', status: 'ok' }, { name: 'readonlyWalk', status: 'running', progress: { done: 1, total: 2 } }] },
      { includeFullWalk: false }
    );
    expect(overallProgress(rows)).toBe(Math.round(((1 + 0.5) / 5) * 100));
    const done = stepRows({ steps: DEFAULT_STEPS.map((name) => ({ name, status: 'ok' as const })) }, { includeFullWalk: false });
    expect(overallProgress(done)).toBe(100);
  });
});

describe('abortReasonText / runSummary', () => {
  it('words each known abort reason and sanitizes free text', () => {
    expect(abortReasonText(undefined)).toBeNull();
    expect(abortReasonText('  ')).toBeNull();
    expect(abortReasonText('cancelled')).toMatch(/cancelled/i);
    expect(abortReasonText('device-silent')).toMatch(/off and on again/i);
    // a query outside the scan's bound is refused before it is sent — it is not a timeout
    expect(abortReasonText('query-bound')).toMatch(/never sent to the device/i);
    expect(abortReasonText('query-bound')).not.toMatch(/took longer|timed out/i);
    expect(abortReasonText('error: boom\n\tbang')).toBe('The run stopped because of an error: boom bang');
    expect(abortReasonText('something-new')).toBe('The run stopped: something-new');
    expect(abortReasonText(`error: ${'x'.repeat(500)}`)!.length).toBeLessThan(260);
  });
  const rowsFor = (steps: NonNullable<CaptureStatus['steps']>) => stepRows({ steps }, { includeFullWalk: false });
  it('summarizes a clean run with its duration', () => {
    const st = status({ state: 'done', id: 'r1', startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:02:05.000Z', resultAvailable: true });
    const s = runSummary(st, rowsFor(DEFAULT_STEPS.map((name) => ({ name, status: 'ok' as const }))));
    expect(s).toMatchObject({ tone: 'ok', headline: 'Diagnostic finished', detail: null, durationText: '2 min 5 s', restartAdvised: false });
    expect(s.counts).toEqual({ ok: 5, failed: 0, skipped: 0, aborted: 0 });
  });
  it('flags problems, skipped steps are not problems', () => {
    const base = status({ state: 'done', id: 'r1' });
    expect(runSummary(base, rowsFor([{ name: 'info', status: 'ok' }, { name: 'reloadProbe', status: 'skipped' }])).tone).toBe('ok');
    const bad = runSummary(base, rowsFor([{ name: 'info', status: 'ok' }, { name: 'labelProbe', status: 'failed' }]));
    expect(bad).toMatchObject({ tone: 'warn', headline: 'Diagnostic finished with problems' });
    expect(bad.counts.failed).toBe(1);
    expect(bad.durationText).toBeNull();
  });
  it('reports a failed, cancelled or device-silent run with its abort reason', () => {
    const failed = runSummary(status({ state: 'failed', abortReason: 'device-silent' }), rowsFor([{ name: 'info', status: 'ok' }, { name: 'readonlyWalk', status: 'aborted' }]));
    expect(failed).toMatchObject({ tone: 'bad', headline: 'Diagnostic stopped early', restartAdvised: true });
    expect(failed.detail).toMatch(/stopped answering/i);
    expect(failed.counts.aborted).toBe(1);
    const cancelled = runSummary(status({ state: 'cancelled', abortReason: 'cancelled' }), rowsFor([]));
    expect(cancelled).toMatchObject({ tone: 'warn', headline: 'Diagnostic cancelled', restartAdvised: false });
    expect(cancelled.detail).toMatch(/you cancelled/i);
  });
  it('formats durations and sizes', () => {
    expect(formatDuration(900)).toBe('1 s');
    expect(formatDuration(59_400)).toBe('59 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
    expect(formatDuration(-1)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024)).toBe('50 KB');
    expect(formatBytes(3.25 * 1024 * 1024)).toBe('3.3 MB');
    expect(formatBytes(Number.NaN)).toBe('');
  });
});

describe('error wording per status code', () => {
  it('reads status + body off a ForgeError-shaped value; anything else is a network failure (0)', () => {
    expect(errorInfo({ status: 409, body: { what: 'capture' } })).toEqual({ status: 409, body: { what: 'capture' }, timedOut: false });
    expect(errorInfo(new TypeError('fetch failed'))).toEqual({ status: 0, body: undefined, timedOut: false });
    expect(errorInfo({ name: 'TimeoutError' })).toMatchObject({ status: 0, timedOut: true });
    expect(errorInfo({ name: 'AbortError' }).timedOut).toBe(true);
    expect(errorInfo(null)).toEqual({ status: 0, body: undefined, timedOut: false });
  });
  it('words a failed start', () => {
    expect(startErrorMessage(0)).toMatch(/could not reach/i);
    expect(startErrorMessage(400)).toMatch(/disclaimer/i);
    expect(startErrorMessage(404)).toMatch(/update axis/i);
    expect(startErrorMessage(409, { error: 'busy', what: 'capture' })).toMatch(/already running/i);
    expect(startErrorMessage(409, { error: 'busy', what: 'cache-build' })).toMatch(/reading the device definitions/i);
    expect(startErrorMessage(409)).toMatch(/busy/i);
    expect(startErrorMessage(501)).toMatch(/does not support/i);
    expect(startErrorMessage(503)).toMatch(/no device/i);
    expect(startErrorMessage(500)).toContain('500');
  });
  it('words a failed result fetch and a failed cancel', () => {
    expect(resultErrorMessage(404)).toMatch(/no result/i);
    expect(resultErrorMessage(0)).toMatch(/could not reach/i);
    expect(resultErrorMessage(500)).toContain('500');
    expect(cancelErrorMessage(0)).toMatch(/may still be going/i);
    expect(cancelErrorMessage(500)).toMatch(/may still be going/i);
  });
  it('words a failed upload for every documented status', () => {
    expect(uploadErrorMessage(0)).toMatch(/could not reach/i);
    expect(uploadErrorMessage(0)).not.toMatch(/error 0/i);
    expect(uploadErrorMessage(400)).toMatch(/consent/i);
    expect(uploadErrorMessage(401)).toMatch(/not signed in/i);
    expect(uploadErrorMessage(404)).toMatch(/no finished diagnostic/i);
    expect(uploadErrorMessage(429)).toMatch(/too many diagnostics/i);
    expect(uploadErrorMessage(500)).toContain('500');
  });
  it('401 distinguishes an anonymous session (account-required) from being signed out', () => {
    expect(uploadErrorMessage(401, { error: 'not-signed-in', reason: 'account-required' })).toMatch(/full Axis account/i);
    expect(uploadErrorMessage(401, { error: 'not-signed-in', reason: 'account-required' })).not.toMatch(/not signed in/i);
    expect(uploadErrorMessage(401, { error: 'not-signed-in' })).toMatch(/not signed in/i);
  });
  it('429 uses retryAfterSeconds, and a spent quota names the 30-day window', () => {
    expect(uploadErrorMessage(429, { error: 'rate-limited', retryAfterSeconds: 600 })).toBe('You have uploaded too many diagnostics recently. Try again in about 10 minutes.');
    expect(uploadErrorMessage(429, { error: 'rate-limited', retryAfterSeconds: null })).toContain('in a while');
    const q = uploadErrorMessage(429, { error: 'quota-exceeded', retryAfterSeconds: 3 * 86400 });
    expect(q).toMatch(/last 30 days/i);
    expect(q).toContain('in about 3 days');
    expect(q).toMatch(/save the result locally/i);
    expect(uploadErrorMessage(429, { error: 'quota-exceeded' })).toMatch(/30 days.*in a while/i);
  });
  it('503 cloud-disabled says cloud features are off in this build; other 503 reads as unreachable', () => {
    expect(uploadErrorMessage(503, { error: 'cloud-disabled' })).toMatch(/cloud features are turned off in this build/i);
    expect(uploadErrorMessage(503)).toMatch(/cloud features are turned off/i);
    expect(uploadErrorMessage(503, { error: 'unavailable' })).toMatch(/not reachable/i);
  });
  it('a client-side timeout says the upload may have gone through and that retrying is safe', () => {
    const t = uploadErrorMessage(0, undefined, { timedOut: true });
    expect(t).toMatch(/may still have gone through/i);
    expect(t).toMatch(/trying again is safe/i);
  });
  it('formats retry hints', () => {
    expect(formatRetryAfter(null)).toBe('in a while');
    expect(formatRetryAfter(undefined)).toBe('in a while');
    expect(formatRetryAfter(-1)).toBe('in a while');
    expect(formatRetryAfter(0)).toBe('in about 1 second');
    expect(formatRetryAfter(45)).toBe('in about 45 seconds');
    expect(formatRetryAfter(600)).toBe('in about 10 minutes');
    expect(formatRetryAfter(3600)).toBe('in about 60 minutes');
    expect(formatRetryAfter(7200)).toBe('in about 2 hours');
    expect(formatRetryAfter(3 * 86400)).toBe('in about 3 days');
  });
  it('413 names the size and the limit when the engine reports them', () => {
    expect(uploadErrorMessage(413, { error: 'too-large', bytes: 30 * 1024 * 1024, limit: 25 * 1024 * 1024 })).toBe(
      'The result is too large to upload (30.0 MB, the limit is 25.0 MB). Save it locally instead.'
    );
    expect(uploadErrorMessage(413)).toMatch(/too large/i);
    expect(uploadErrorMessage(413, { bytes: 'lots' })).toMatch(/too large/i);
  });
  it('502 passes the cloud status on: expired session, rate limit, size, or its (sanitized) message', () => {
    expect(uploadErrorMessage(502, { error: 'cloud', status: 401, message: 'jwt expired' })).toMatch(/session has expired/i);
    expect(uploadErrorMessage(502, { error: 'cloud', status: 403 })).toMatch(/session has expired/i);
    expect(uploadErrorMessage(502, { error: 'cloud', status: 429 })).toMatch(/too many diagnostics/i);
    expect(uploadErrorMessage(502, { error: 'cloud', status: 413 })).toMatch(/too large/i);
    const other = uploadErrorMessage(502, { error: 'cloud', status: 500, message: 'storage\nunavailable' });
    expect(other).toContain('error 500');
    expect(other).toContain('storage unavailable');
    expect(uploadErrorMessage(502)).toMatch(/did not accept the upload/i);
    // the cloud itself could not be reached (status 0): no "(error 0)"
    const unreachable = uploadErrorMessage(502, { error: 'cloud', status: 0, message: 'cloud unreachable' });
    expect(unreachable).toMatch(/could not be reached/i);
    expect(unreachable).not.toMatch(/error 0/i);
  });
});

describe('uploadRequestBody — consent plus the Axis version', () => {
  it('always carries the consent and adds the version only when the engine would accept it', () => {
    expect(uploadRequestBody('0.9.24-beta')).toEqual({ consent: true, axisVersion: '0.9.24-beta' });
    expect(uploadRequestBody('dev')).toEqual({ consent: true, axisVersion: 'dev' });
    for (const bad of [null, undefined, '', 'has space', 'x'.repeat(33), 'C:\\path', '1.0/../x']) expect(uploadRequestBody(bad)).toEqual({ consent: true });
  });
});

describe('uploadPreconditions', () => {
  const ok = { hasResult: true, signedIn: true, cloudEnabled: true, consent: true, busy: false };
  it('passes with a result, a signed-in session and the consent tick', () => {
    expect(uploadPreconditions(ok)).toEqual({ ok: true, blockers: [], reason: null });
  });
  it('blocks without a result, without sign-in, without cloud, without consent, while busy', () => {
    expect(uploadPreconditions({ ...ok, hasResult: false }).blockers).toContain('no-result');
    expect(uploadPreconditions({ ...ok, signedIn: false }).blockers).toEqual(['signed-out']);
    expect(uploadPreconditions({ ...ok, cloudEnabled: false }).blockers).toEqual(['cloud-off']);
    expect(uploadPreconditions({ ...ok, consent: false }).blockers).toEqual(['no-consent']);
    expect(uploadPreconditions({ ...ok, busy: true }).blockers).toEqual(['busy']);
  });
  it('signed-out is reported ahead of the missing consent, and every blocker has wording', () => {
    const r = uploadPreconditions({ ...ok, signedIn: false, consent: false });
    expect(r.blockers).toEqual(['signed-out', 'no-consent']);
    expect(r.reason).toMatch(/sign in/i);
    expect(uploadPreconditions({ ...ok, consent: false }).reason).toMatch(/tick the box/i);
  });
  it('blocks a result known to exceed the compressed limit, but not an unknown size', () => {
    expect(uploadPreconditions({ ...ok, gzBytes: UPLOAD_LIMIT_BYTES + 1 }).blockers).toEqual(['too-large']);
    expect(uploadPreconditions({ ...ok, gzBytes: UPLOAD_LIMIT_BYTES }).ok).toBe(true);
    expect(uploadPreconditions({ ...ok, gzBytes: null }).ok).toBe(true);
  });
});

describe('uploadPreview — exactly what is uploaded, from the bundle', () => {
  it('shows device, firmware, versions, sizes and the redaction counts', () => {
    const p = uploadPreview(bundle({ app: { forgefx: '1.2.3', codec: '4.5.6', axis: '0.9.9' } }), { jsonBytes: 2048, gzBytes: 512 });
    const row = (label: string) => p.rows.find((r) => r.label === label)?.value;
    expect(row('Device')).toBe('Test Unit III');
    expect(row('Firmware')).toBe('99.01');
    expect(row('Connection')).toBe('serial');
    expect(row('Software versions')).toBe('engine 1.2.3 · protocol 4.5.6 · Axis 0.9.9');
    expect(row('Wire log')).toBe('2 frames with timestamps');
    expect(row('Run log')).toBe('1 line');
    expect(row('Size (estimate)')).toBe('about 2.0 KB (about 512 B compressed)');
    expect(row('Steps')).toBe('5 steps — 3 done, 1 failed, 1 skipped');
    expect(row('Removed before upload')).toBe('3 preset/scene name answers blanked · 2 preset dump payloads cut down to their header');
    expect(p.notIncluded).toMatch(/preset or scene names/i);
    expect(p.notIncluded).toMatch(/e-mail/i);
    expect(p.retention).toMatch(/180 days/);
  });
  it('degrades to "unknown" and plain size for a sparse bundle without gzip', () => {
    const sparse = bundle({ device: { model: 0, modelName: '', firmware: null, transport: '' }, app: { forgefx: '', codec: '' }, steps: [], frames: [], logs: [], abortReason: 'device-silent', state: 'failed' });
    const p = uploadPreview(sparse, { jsonBytes: 100, gzBytes: null });
    const row = (label: string) => p.rows.find((r) => r.label === label)?.value;
    expect(row('Device')).toBe('unknown');
    expect(row('Firmware')).toBe('unknown');
    expect(row('Software versions')).toBe('unknown');
    expect(row('Size (estimate)')).toBe('about 100 B');
    expect(row('Result')).toBe('failed (device-silent)');
    expect(row('Steps')).toBe('0 steps');
    // an abort reason that only repeats the state is not shown twice; singular wording for one item
    const cancelled = uploadPreview(bundle({ state: 'cancelled', abortReason: 'cancelled', steps: [{ name: 'info', status: 'ok' }] }), { jsonBytes: 1, gzBytes: null });
    expect(cancelled.rows.find((r) => r.label === 'Result')?.value).toBe('cancelled');
    expect(cancelled.rows.find((r) => r.label === 'Steps')?.value).toBe('1 step — 1 done');
  });
});

describe('local save — file name and gzip with a plain-JSON fallback', () => {
  it('encodes as .json.gz that gunzips back to the same bundle', async () => {
    const gzip = platformGzip();
    expect(gzip).not.toBeNull();
    const b = bundle();
    const enc = await encodeBundle(b, gzip);
    expect(enc).toMatchObject({ compressed: true, ext: 'json.gz', mime: 'application/gzip' });
    expect(enc.gzBytes).toBe(enc.bytes.length);
    expect(JSON.parse(gunzipSync(enc.bytes).toString('utf8'))).toEqual(b);
    expect(enc.jsonBytes).toBe(Buffer.byteLength(JSON.stringify(b)));
  });
  it('falls back to plain JSON when gzip is unavailable, throws, or returns nothing', async () => {
    const b = bundle();
    for (const gzip of [null, async () => { throw new Error('nope'); }, async () => new Uint8Array(0)]) {
      const enc = await encodeBundle(b, gzip);
      expect(enc).toMatchObject({ compressed: false, ext: 'json', mime: 'application/json', gzBytes: null });
      expect(JSON.parse(new TextDecoder().decode(enc.bytes))).toEqual(b);
    }
  });
  afterEach(() => vi.unstubAllGlobals());
  it('platformGzip is null where CompressionStream does not exist', () => {
    vi.stubGlobal('CompressionStream', undefined);
    expect(platformGzip()).toBeNull();
  });
  it('fills in the Axis version without mutating the input or overwriting a known one', () => {
    const b = bundle();
    const w = withAxisVersion(b, '1.0.0');
    expect(w.app.axis).toBe('1.0.0');
    expect(b.app.axis).toBeUndefined();
    expect(withAxisVersion(bundle({ app: { forgefx: 'a', codec: 'b', axis: '2.0.0' } }), '1.0.0').app.axis).toBe('2.0.0');
    expect(withAxisVersion(b, null)).toBe(b);
  });
  it('names the file from model, firmware, time and id — safe characters only', () => {
    expect(bundleFileName(bundle(), 'json.gz')).toBe('axis-diagnostics-test-unit-iii-fw99.01-20260102-030405-a1b2c3d4.json.gz');
    expect(bundleFileName(bundle(), 'json')).toMatch(/\.json$/);
  });
  it('sanitizes path characters and copes with missing parts', () => {
    const name = bundleFileName(
      { id: '../..\\x', createdAt: 'not a date', device: { model: 1, modelName: 'C:\\data\\x/Evil <Name>', firmware: null, transport: 'x' } },
      'json'
    );
    expect(name).toMatch(/^[a-z0-9.-]+$/);
    expect(name).not.toMatch(/\.\.|\/|\\/);
    expect(name).toContain('fw-unknown');
    expect(bundleFileName({ id: '', createdAt: '', device: { model: 1, modelName: '', firmware: '12.00', transport: '' } }, 'json.gz')).toBe('axis-diagnostics-fw12.00.json.gz');
  });
});

describe('cycleFocusIndex — Tab stays inside the dialog', () => {
  it('wraps forwards and backwards, and enters from outside', () => {
    expect(cycleFocusIndex(2, 0, false)).toBe(1);
    expect(cycleFocusIndex(2, 1, false)).toBe(0);
    expect(cycleFocusIndex(2, 0, true)).toBe(1);
    expect(cycleFocusIndex(2, 1, true)).toBe(0);
    expect(cycleFocusIndex(3, -1, false)).toBe(0);
    expect(cycleFocusIndex(3, -1, true)).toBe(2);
    expect(cycleFocusIndex(0, -1, false)).toBe(-1);
  });
});

// ── wiring (source pins): the runes store, the panel and the editor can't be imported in this node-only suite ──
describe('wiring (source pins)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const panel = read('./DiagnosticsPanel.svelte');
  const store = read('./diagnostics.svelte.ts');
  const axisPanel = read('./AxisPanel.svelte');
  const editorSrc = read('./editor.svelte.ts');
  const typesSrc = read('./types.ts');
  const forgefxSrc = read('./forgefx.ts');
  const directRuntime = read('./direct/runtime.ts');
  const viteConfig = read('../../vite.config.ts');
  const appDts = read('../app.d.ts');

  it('the panel decides everything through the pure helpers', () => {
    for (const fn of ['diagnosticsAvailability(', 'fullWalkAvailability(', 'canOpenConfirm(', 'buildStartRequest(', 'stepRows(', 'runSummary(', 'uploadPreconditions(', 'uploadPreview(', 'cycleFocusIndex(']) {
      expect(panel, fn).toContain(fn);
    }
    expect(panel).toContain("from './diagnostics'");
  });
  it('talks to the engine only through the store — no request is hand-built in the component', () => {
    expect(panel).not.toMatch(/forgefx\.\w/);
    expect(panel).toContain('d.start(request)');
    expect(panel).toMatch(/const request = buildStartRequest\(\{ acknowledged, confirmed: true,/);
  });
  it('gates Start on the tick and shows the exact disclaimer and dialog title', () => {
    expect(panel).toContain('disabled={!canStart}');
    expect(panel).toContain('bind:checked={acknowledged}');
    expect(panel).toContain('{BACKUP_ACK_TEXT}');
    expect(panel).toContain('{CONFIRM_TITLE}');
    // Start opens the dialog; only the dialog's own button runs the diagnostic
    expect(panel).toMatch(/class="cta"[^>]*onclick=\{openConfirm\}/);
    expect(panel).toMatch(/class="dgo" onclick=\{runNow\}/);
  });
  it('the confirmation dialog is modal, focuses Cancel, closes on Escape and restores focus', () => {
    expect(panel).toContain('role="alertdialog"');
    expect(panel).toContain('aria-modal="true"');
    expect(panel).toContain('aria-labelledby="diag-confirm-title"');
    expect(panel).toContain('cancelBtn?.focus()');
    expect(panel).toMatch(/e\.key === 'Escape'[\s\S]{0,120}e\.stopPropagation\(\)[\s\S]{0,160}closeConfirm\(\)/);
    expect(panel).toContain("window.addEventListener('keydown', onKey, true)");
    expect(panel).toContain('startBtn?.focus()');
    expect(panel).toMatch(/class="dcancel"[^>]*onclick=\{closeConfirm\}/);
  });
  it('the full-walk toggle is disabled with its reason when the gate is closed, and has its own warning', () => {
    expect(panel).toContain('disabled={!fullWalk.available}');
    expect(panel).toContain(': fullWalk.reason}');
    expect(panel).toContain('{FULL_WALK_WARNING}');
    expect(panel).toContain('{FULL_WALK_LABEL}');
  });
  it('every run needs a fresh acknowledgement', () => {
    expect(panel).toMatch(/if \(await d\.start\(request\)\) \{\s*acknowledged = false;/);
    expect(panel).toMatch(/function runAgain\(\) \{\s*acknowledged = false;/);
  });
  it('upload needs the consent tick and shows the preview; local save is offered from the store', () => {
    expect(panel).toContain('bind:checked={uploadConsent}');
    expect(panel).toContain('disabled={!pre.ok}');
    expect(panel).toContain('{UPLOAD_CONSENT_TEXT}');
    expect(panel).toContain('preview.rows');
    expect(panel).toContain('d.saveLocal()');
    expect(panel).toContain("editor.openAxis('account')");
  });
  it('the store re-checks the upload preconditions and keeps the bundle out of deep reactivity', () => {
    expect(store).toMatch(/uploadPreconditions\(\{ \.\.\.ctx, hasResult: !!this\.bundle/);
    expect(store).toContain('bundle = $state.raw<CaptureBundle | null>(null)');
    expect(store).toContain('encoded = $state.raw<EncodedBundle | null>(null)');
    expect(store).toContain('forgefx.uploadDiagnosticCapture(uploadRequestBody(axisVersion()))');
    expect(store).toContain('uploadErrorMessage(status, body, { timedOut })');
    expect(store).toContain('platformGzip()');
    expect(store).not.toMatch(/from '\.\/editor\.svelte'/); // the editor imports the store, not the other way round
  });
  it('lost contact: polling never gives up, but a run unreachable for over a minute stops counting as busy', () => {
    expect(store).toContain('isContactLost(Date.now() - this.#failSince)');
    expect(store).toContain('lost: this.lost');
    expect(store).not.toContain('POLL_MAX_FAILURES');
    // the status read is retried through the same scheduler after every failure
    expect(store).toMatch(/#pollFailed\(\);\s*\}\s*this\.#schedule\(\);/);
    expect(panel).toContain("view === 'lost'");
    expect(panel).toContain('d.retryPolling()');
  });
  it('the upload shows a still-uploading note, the cloud reference next to the result id, and the dedup case', () => {
    expect(store).toContain('UPLOAD_SLOW_MS');
    expect(panel).toContain('d.uploadSlow');
    expect(panel).toContain('{d.uploaded.captureId}');
    expect(panel).toContain('{d.bundle.id}');
    expect(panel).toContain('d.uploaded.deduped');
    // the client's ceiling sits above the engine's worst case (~570 s: reserve + upload with retries + finalize + one re-upload)
    const m = forgefxSrc.match(/uploadDiagnosticCapture:[\s\S]*?AbortSignal\.timeout\((\d+)\)/);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(600_000);
  });
  it('accessibility: every aria-describedby id exists, and only one live region announces', () => {
    const refs = [...panel.matchAll(/aria-describedby=(?:"([^"]+)"|\{([^}]+)\})/g)].flatMap((m) => (m[1] ?? m[2] ?? '').match(/diag-[\w-]+/g) ?? []);
    expect(refs.length).toBeGreaterThan(0);
    for (const id of new Set(refs)) expect(panel, id).toContain(`id="${id}"`);
    expect(panel.match(/aria-live=/g)?.length).toBe(1);
    expect(panel.match(/role="status"/g)?.length).toBe(1); // the sr-only announcer — the summary / upload boxes are not live regions
    expect(panel).toMatch(/class="sr-only" role="status" aria-live="polite"/);
  });
  it('event-driven device re-reads wait while a diagnostic run or a definitions build owns the transport', () => {
    // one scheduler, told when the transport is owned by a walk / import / diagnostic run
    expect(editorSrc).toContain('#reloads = new ReloadScheduler(() => this.#walkActive())');
    // the 'changed' (full reload), scene and block-state paths all go through it, tagged with their kind — none arms its own timer
    const changed = editorSrc.slice(editorSrc.indexOf("case 'changed': {"), editorSrc.indexOf("case 'config':"));
    expect(changed).toContain("this.#reloads.schedule('changed', 250");
    expect(changed).not.toContain('setTimeout');
    expect(editorSrc).toMatch(/#scheduleSceneReload = \(settleMs = 250\) => this\.#reloads\.schedule\('scene', settleMs,/);
    expect(editorSrc).toMatch(/#scheduleBlockStateReload = \(settleMs = 120\) => this\.#reloads\.schedule\('blockState', settleMs,/);
    expect(editorSrc).not.toContain('#eventReload');
  });
  it('the Browser Direct runtime hands the router its version stamps', () => {
    expect(directRuntime).toMatch(/__FORGEFX_VERSION__/);
    expect(directRuntime).toMatch(/rt\.createRouter\(\{ registry, store, local, cloud, versions \} satisfies RuntimeDeps\)/);
    expect(viteConfig).toContain('__FORGEFX_VERSION__: JSON.stringify(forgefxVersion)');
    expect(appDts).toContain('const __FORGEFX_VERSION__: string;');
  });
  it('the Debug tab hosts the panel inside the Axis hub', () => {
    expect(axisPanel).toContain("import DiagnosticsPanel from './DiagnosticsPanel.svelte'");
    expect(axisPanel).toMatch(/editor\.axisTab === 'debug'\}[\s\S]{0,200}<DiagnosticsPanel \/>/);
    expect(axisPanel).toContain("onclick={() => (editor.axisTab = 'debug')}>Debug</button>");
    expect(editorSrc).toMatch(/axisTab = \$state<[^>]*'debug'/);
    expect(editorSrc).toMatch(/openAxis = \(tab: [^)]*'debug'/);
  });
  it('a running diagnostic keeps the editor’s background device reads quiet and resumes a run in progress', () => {
    const poll = editorSrc.slice(editorSrc.indexOf('poll = async'), editorSrc.indexOf('/** @deprecated AM4'));
    expect(poll).toContain('diagnostics.running');
    const watch = editorSrc.slice(editorSrc.indexOf('watchPreset = async'));
    expect(watch.slice(0, 1200)).toContain('diagnostics.running');
    expect(editorSrc).toContain('#walkActive = () => !!(deviceDefs.building || deviceDefs.importing || diagnostics.running)');
    expect(editorSrc).toMatch(/dev\.capabilities\?\.diagnosticCapture\) diagnostics\.resume\(\)/);
  });
  it('mirrors the contract: the capability flag is optional and additive', () => {
    expect(typesSrc).toMatch(/diagnosticCapture\?: boolean;/);
    expect(typesSrc).toContain('export interface CaptureStatus');
    expect(typesSrc).toContain('export interface CaptureBundle');
    expect(typesSrc).toContain('acknowledged: true;');
  });
});
