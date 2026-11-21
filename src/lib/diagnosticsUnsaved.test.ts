import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  OLDER_FIRMWARE_ADVICE,
  OLDER_FIRMWARE_NOTE,
  PREFLIGHT_FALLBACK_NOTE,
  PREFLIGHT_MAX_AGE_MS,
  buildStartRequest,
  classifyPreflightError,
  STALE_CHECK_NOTE,
  isPreflightStale,
  isStaleCheckError,
  needsUnsavedDecision,
  plannedSteps,
  startErrorMessage,
  unsavedDecisionText,
  unsavedDialogModel,
  unsavedEditsOutcome,
  unsavedSkipText,
  willSwitchPresets
} from './diagnostics';
import type { CapturePreflight } from './types';

// ── synthetic data only ──
const pre = (o: Partial<CapturePreflight> = {}): CapturePreflight => ({ preset: 12, presetName: 'Test Preset', editBuffer: 'dirty', canSave: true, ...o });
const fw = { available: true, reason: '' };
const base = { acknowledged: true, confirmed: true, includeFullWalk: false, fullWalk: fw };

describe('which runs have to ask', () => {
  it('plans the default staged run, plus the full walk on request', () => {
    expect(plannedSteps({ includeFullWalk: false })).toEqual(['info', 'readonlyWalk', 'labelProbe', 'dumpHeaderProbe', 'reloadProbe']);
    expect(plannedSteps({ includeFullWalk: true }).at(-1)).toBe('fullWalk');
  });
  it('a run switches presets through the reload check (and the full walk)', () => {
    expect(willSwitchPresets({ includeFullWalk: false })).toBe(true);
    expect(willSwitchPresets({ includeFullWalk: true })).toBe(true);
  });
  it('asks when the edit buffer is dirty or unknown and a step will switch presets — not when clean, not without a pre-check', () => {
    expect(needsUnsavedDecision({ preflight: pre({ editBuffer: 'dirty' }), willSwitch: true })).toBe(true);
    expect(needsUnsavedDecision({ preflight: pre({ editBuffer: 'unknown' }), willSwitch: true })).toBe(true);
    expect(needsUnsavedDecision({ preflight: pre({ editBuffer: 'clean' }), willSwitch: true })).toBe(false);
    expect(needsUnsavedDecision({ preflight: pre({ editBuffer: 'dirty' }), willSwitch: false })).toBe(false);
    expect(needsUnsavedDecision({ preflight: null, willSwitch: true })).toBe(false);
    // a value from a newer engine is "not clean" too
    expect(needsUnsavedDecision({ preflight: pre({ editBuffer: 'weird' as never }), willSwitch: true })).toBe(true);
  });
});

describe('preflight failures', () => {
  it('409 busy and 503 no device refuse the start with a clear message', () => {
    const busy = classifyPreflightError(409, { error: 'busy', what: 'capture' });
    expect(busy.kind).toBe('blocked');
    expect(busy.message).toMatch(/already running/i);
    expect(classifyPreflightError(409, { error: 'busy', what: 'cache-build' }).message).toMatch(/reading the device definitions/i);
    const none = classifyPreflightError(503, { error: 'no-device' });
    expect(none.kind).toBe('blocked');
    expect(none.message).toMatch(/no device is connected/i);
  });
  it('503 {error:"device"} (a dump failed) does not read as "no device"', () => {
    const c = classifyPreflightError(503, { error: 'device', message: 'dump timed out\nafter 5 s' });
    expect(c.kind).toBe('blocked');
    expect(c.message).not.toMatch(/no device is connected/i);
    expect(c.message).toMatch(/did not answer the check for unsaved changes/i);
    expect(c.message).toContain('dump timed out after 5 s');
    expect(c.message).toMatch(/switch the device off and on again/i);
    expect(classifyPreflightError(503, { error: 'device' }).message).not.toMatch(/\(\)/);
    expect(startErrorMessage(503, { error: 'no-device' })).toMatch(/no device is connected/i);
    expect(startErrorMessage(503)).toMatch(/no device is connected/i);
  });
  it('501 (not a gen-3 device) refuses too — the start would be refused the same way', () => {
    const c = classifyPreflightError(501, { error: 'unsupported', capability: 'diagnosticCapture' });
    expect(c.kind).toBe('blocked');
    expect(c.message).toMatch(/does not support/i);
  });
  it('anything else falls back to starting without a decision, and says so', () => {
    for (const status of [0, 404, 500, 502]) {
      const c = classifyPreflightError(status);
      expect(c.kind, String(status)).toBe('fallback');
      expect(c.message).toBe(PREFLIGHT_FALLBACK_NOTE);
    }
    expect(PREFLIGHT_FALLBACK_NOTE).toMatch(/could not check/i);
    expect(PREFLIGHT_FALLBACK_NOTE).toMatch(/skipped/i);
  });
});

describe('the pre-check expires', () => {
  it('goes stale shortly before the engine\'s ~15 minute token does', () => {
    expect(PREFLIGHT_MAX_AGE_MS).toBeLessThan(15 * 60_000);
    expect(PREFLIGHT_MAX_AGE_MS).toBeGreaterThan(10 * 60_000);
    const t0 = 1_000_000;
    expect(isPreflightStale(t0, t0)).toBe(false);
    expect(isPreflightStale(t0, t0 + PREFLIGHT_MAX_AGE_MS)).toBe(false);
    expect(isPreflightStale(t0, t0 + PREFLIGHT_MAX_AGE_MS + 1)).toBe(true);
    expect(isPreflightStale(null, t0 + 10 * PREFLIGHT_MAX_AGE_MS)).toBe(false); // no pre-check, nothing to be stale
  });
});

describe('unsavedEdits in the start body', () => {
  it('sends the decision, with the preset it was made for, only when the pre-check found unsaved edits', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'dirty' }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 12 });
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'unknown' }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 12 });
    // a stale choice (device now clean) or no pre-check never rides along
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'clean' }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: null, unsavedEdits: 'discard' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base })).toEqual({ acknowledged: true });
  });
  it('never sends save when the engine said it cannot save', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ canSave: false }), unsavedEdits: 'save' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: pre({ canSave: false }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 12 });
  });
  it('sends the pre-check token with the decision, and only with it', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ token: 'tok-1' }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 12, token: 'tok-1' });
    expect(buildStartRequest({ ...base, preflight: pre({ token: 'tok-1' }), unsavedEdits: 'save' })).toEqual({ acknowledged: true, unsavedEdits: 'save', preset: 12, token: 'tok-1' });
    // a clean device or no decision: no token rides along
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'clean', token: 'tok-1' }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: pre({ token: 'tok-1' }), unsavedEdits: null })).toEqual({ acknowledged: true });
    // an engine that sends no token: none is made up
    expect(buildStartRequest({ ...base, preflight: pre(), unsavedEdits: 'discard' })).not.toHaveProperty('token');
  });
  it('sends preset 0; with no known preset the engine cannot honour a decision, so none is sent', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ preset: 0 }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 0 });
    expect(buildStartRequest({ ...base, preflight: pre({ preset: null, canSave: false }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: pre({ preset: 1.5 }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'clean' }), unsavedEdits: 'discard' })).not.toHaveProperty('preset');
  });
  it('never saves from an edit buffer it could not read — discarding stays possible', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'unknown', canSave: true }), unsavedEdits: 'save' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'unknown', canSave: false }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 12 });
  });
  it('an out-of-date check (400 token-expired / bad-token / cannot-save) is worded as such and recognised for an automatic re-check', () => {
    for (const error of ['token-expired', 'bad-token', 'cannot-save']) {
      expect(startErrorMessage(400, { error }), error).toBe(STALE_CHECK_NOTE);
      expect(isStaleCheckError(400, { error }), error).toBe(true);
      expect(startErrorMessage(400, { error })).not.toMatch(/disclaimer/i);
    }
    expect(STALE_CHECK_NOTE).toBe('The device check is out of date — Axis checked again. Please choose again.');
    // other errors are not that: a missing token, the disclaimer, other statuses
    for (const [status, body] of [[400, { error: 'missing-token' }], [400, { error: 'not-acknowledged' }], [400, undefined], [409, { error: 'token-expired' }], [0, undefined]] as const) {
      expect(isStaleCheckError(status, body)).toBe(false);
    }
  });
  it('words a missing token (400 missing-token) and tells it apart from the other 400s', () => {
    expect(startErrorMessage(400, { error: 'missing-token' })).toMatch(/fresh check of the device/i);
    expect(startErrorMessage(400, { error: 'bad-steps' })).toMatch(/list of steps/i);
    expect(startErrorMessage(400, { error: 'missing-token' })).not.toMatch(/disclaimer/i);
  });
  it('words a refused decision value (400 bad-unsaved-edits) apart from a missing acknowledgement', () => {
    expect(startErrorMessage(400, { error: 'bad-unsaved-edits' })).toMatch(/choice about unsaved changes/i);
    expect(startErrorMessage(400, { error: 'not-acknowledged' })).toMatch(/disclaimer/i);
    expect(startErrorMessage(400)).toMatch(/disclaimer/i);
  });
  it('combines with the full walk and still needs both gates', () => {
    expect(buildStartRequest({ ...base, includeFullWalk: true, preflight: pre(), unsavedEdits: 'save' })).toEqual({ acknowledged: true, includeFullWalk: true, unsavedEdits: 'save', preset: 12 });
    expect(buildStartRequest({ ...base, confirmed: false, preflight: pre(), unsavedEdits: 'save' })).toBeNull();
    expect(buildStartRequest({ ...base, acknowledged: false, preflight: pre(), unsavedEdits: 'save' })).toBeNull();
  });
});

describe('unsavedDialogModel', () => {
  const plan = { includeFullWalk: false };
  it('titles it with the preset number and name and offers save / discard', () => {
    const m = unsavedDialogModel(pre(), plan);
    expect(m.title).toBe('Unsaved changes on preset 012 Test Preset');
    expect(m.save).toEqual({ label: 'Save to preset 012', hint: expect.stringMatching(/overwrites the stored preset/i) });
    expect(m.paragraphs[0]).toMatch(/reload check switches presets/i);
    expect(m.paragraphs[0]).toMatch(/discards unsaved changes/i);
    expect(m.olderFirmware).toBeNull();
    expect(m.reason).toBeNull();
  });
  it('the discard button says that unsaved changes are lost', () => {
    const m = unsavedDialogModel(pre(), plan);
    expect(m.discard?.label).toBe('Discard changes');
    expect(m.discard?.hint).toMatch(/unsaved changes on the device are lost/i);
    expect(m.skip).toBeNull();
  });
  it('mentions the full walk when it is part of the run', () => {
    expect(unsavedDialogModel(pre(), { includeFullWalk: true }).paragraphs[0]).toMatch(/reload check and the full walk switch presets/i);
  });
  it('offers no save when the engine cannot save', () => {
    const m = unsavedDialogModel(pre({ canSave: false }), plan);
    expect(m.save).toBeNull();
    expect(m.discard).not.toBeNull();
    expect(unsavedDialogModel(pre({ presetName: undefined }), plan).title).toBe('Unsaved changes on preset 012');
  });
  it('an unknown edit buffer offers Discard and Cancel only — even if the engine claimed it could save', () => {
    const m = unsavedDialogModel(pre({ editBuffer: 'unknown', canSave: true }), plan);
    expect(m.save).toBeNull();
    expect(m.discard).not.toBeNull();
    expect(m.paragraphs.join(' ')).toMatch(/saving is not offered/i);
  });
  it('with no known preset neither Save nor Discard is offered: the steps are skipped and the user carries on or cancels', () => {
    const m = unsavedDialogModel(pre({ preset: null, presetName: undefined, canSave: false }), plan);
    expect(m.save).toBeNull();
    expect(m.discard).toBeNull();
    expect(m.skip).toEqual({ label: 'Continue without the reload check', hint: expect.stringMatching(/skipped/i) });
    expect(m.title).toBe('Unsaved changes on the current preset');
    expect(m.paragraphs[0]).toMatch(/could not tell which preset/i);
    expect(m.paragraphs[0]).toMatch(/reload check will be skipped/i);
    const full = unsavedDialogModel(pre({ preset: null, canSave: true }), { includeFullWalk: true });
    expect(full.save).toBeNull();
    expect(full.skip?.label).toBe('Continue without the reload check and full walk');
    expect(full.paragraphs[0]).toMatch(/reload check and the full walk will be skipped/i);
    expect(unsavedSkipText(plan)).toMatch(/reload check will be skipped/i);
    expect(unsavedSkipText({ includeFullWalk: true })).toMatch(/reload check and the full walk will be skipped/i);
  });
  it('adds the older-firmware explanation when that is the likely cause', () => {
    const m = unsavedDialogModel(pre({ likelyCause: 'older-firmware' }), plan);
    expect(m.olderFirmware).toBe(OLDER_FIRMWARE_NOTE);
    expect(OLDER_FIRMWARE_NOTE).toBe(
      'This preset may have been saved under an older firmware; the device converted it when loading. Saving stores it in the current format.'
    );
    for (const likelyCause of ['unsaved-edits', 'unknown', undefined] as const) expect(unsavedDialogModel(pre({ likelyCause }), plan).olderFirmware).toBeNull();
  });
  it('tells what to pick when nothing was changed: Discard is safe, the preset is converted again on the next load', () => {
    const m = unsavedDialogModel(pre({ likelyCause: 'older-firmware' }), plan);
    expect(m.olderFirmwareAdvice).toBe(OLDER_FIRMWARE_ADVICE);
    expect(OLDER_FIRMWARE_ADVICE).toMatch(/did not change anything, Discard is the safe choice/);
    expect(OLDER_FIRMWARE_ADVICE).toMatch(/stored preset stays as it is and is converted again the next time it is loaded/);
    expect(OLDER_FIRMWARE_ADVICE).toMatch(/Save rewrites it in the current format/);
    expect(unsavedDialogModel(pre({ likelyCause: 'unknown' }), plan).olderFirmwareAdvice).toBeNull();
  });
  it('does not claim certainty when the edit buffer is unknown, and clips the engine reason and the name', () => {
    const m = unsavedDialogModel(pre({ editBuffer: 'unknown', reason: `could not compare\n${'x'.repeat(400)}`, presetName: 'N'.repeat(80) }), plan);
    expect(m.title).toMatch(/^Possible unsaved changes on preset 012 N+…$/);
    expect(m.title.length).toBeLessThan(80);
    expect(m.paragraphs[0]).toMatch(/could not tell whether/i);
    expect(m.reason!.length).toBeLessThanOrEqual(200);
    expect(m.reason).not.toContain('\n');
  });
});

describe('unsavedDecisionText (confirmation dialog)', () => {
  it('says what will happen to the edits, or nothing when there was no question', () => {
    expect(unsavedDecisionText(null, pre())).toBeNull();
    expect(unsavedDecisionText('save', pre())).toMatch(/saved to preset 012, overwriting the stored preset/i);
    expect(unsavedDecisionText('discard', pre())).toMatch(/preset 012 will be lost/i);
    expect(unsavedDecisionText('discard', null)).toMatch(/current preset will be lost/i);
  });
});

describe('unsavedEditsOutcome — from the step results of the bundle', () => {
  const ok = (name: string, result?: unknown) => ({ name, status: 'ok', result });
  const saved = { slot: 12, ok: true, acked: true, ms: 231.4 };
  it('has nothing to say without a decision', () => {
    expect(unsavedEditsOutcome([ok('info'), ok('reloadProbe', { verified: true })], null)).toBeNull();
    expect(unsavedEditsOutcome([], null)).toBeNull();
  });
  it('reports a save from the engine record: slot, device acknowledgement and time', () => {
    const o = unsavedEditsOutcome([ok('info'), ok('reloadProbe', { unsavedEdits: { decision: 'save', outcome: 'saved', save: saved }, save: saved })], 'save');
    expect(o).toMatchObject({ decision: 'save', kind: 'saved', tone: 'ok', title: 'Unsaved changes: saved first' });
    expect(o!.text).toBe('Your unsaved changes were saved to preset 012 before presets were switched, and the device confirmed it (231 ms).');
  });
  it('warns when the device did not confirm the save; says nothing about a missing acknowledgement', () => {
    const warn = unsavedEditsOutcome([ok('reloadProbe', { unsavedEdits: { decision: 'save', outcome: 'saved', save: { slot: 3, ok: true, acked: false, ms: 900 } } })], 'save');
    expect(warn!.tone).toBe('warn');
    expect(warn!.text).toMatch(/did not confirm/i);
    const unknown = unsavedEditsOutcome([ok('reloadProbe', { unsavedEdits: { decision: 'save', outcome: 'saved', save: { slot: 3, ok: true, acked: null, ms: 40 } } })], 'save');
    expect(unknown!.tone).toBe('ok');
    expect(unknown!.text).toBe('Your unsaved changes were saved to preset 003 before presets were switched (40 ms).');
  });
  it('reports a discard that ran', () => {
    const o = unsavedEditsOutcome([ok('reloadProbe', { discardedUnsavedEdits: true, unsavedEdits: { decision: 'discard', outcome: 'discarded' } })], 'discard');
    expect(o).toMatchObject({ kind: 'discarded', tone: 'ok', title: 'Unsaved changes: discarded' });
    expect(o!.text).toMatch(/discarded, as you chose/i);
  });
  it('reports a failed save with the step error — no preset was switched', () => {
    const o = unsavedEditsOutcome(
      [
        { name: 'reloadProbe', status: 'failed', error: 'saving preset 12 failed: not confirmed', result: { unsavedEdits: { decision: 'save', outcome: 'save-failed', save: { slot: 12, ok: false, acked: false, ms: 1500, error: 'timeout' } } } },
        { name: 'fullWalk', status: 'failed', error: 'saving the edit buffer failed earlier in this run', result: { unsavedEdits: { decision: 'save', outcome: 'save-failed' } } }
      ],
      'save'
    );
    expect(o).toMatchObject({ kind: 'save-failed', tone: 'bad' });
    expect(o!.text).toContain('saving preset 12 failed: not confirmed');
    expect(o!.text).toMatch(/no preset was switched/i);
    // an engine that records only the save object with ok:false reads the same
    const legacy = unsavedEditsOutcome([{ name: 'reloadProbe', status: 'failed', error: 'x', result: { save: { slot: 1, ok: false } } }], 'save');
    expect(legacy!.kind).toBe('save-failed');
  });
  it('reports that the decision was not applied because the preset changed', () => {
    const o = unsavedEditsOutcome(
      [{ name: 'reloadProbe', status: 'skipped', note: 'the current preset changed', result: { unsavedEdits: { decision: 'discard', outcome: 'preset-changed' } } }],
      'discard'
    );
    expect(o).toMatchObject({ kind: 'preset-changed', tone: 'warn', title: 'Unsaved changes: choice not applied' });
    expect(o!.text).toMatch(/nothing was changed on the device/i);
  });
  it('finds the decision from the engine record alone (after a page reload)', () => {
    expect(unsavedEditsOutcome([ok('reloadProbe', { unsavedEdits: { decision: 'save', outcome: 'saved', save: saved } })], null)?.decision).toBe('save');
    expect(unsavedEditsOutcome([ok('reloadProbe', { unsavedEdits: { decision: 'discard', outcome: 'discarded' } })], null)?.decision).toBe('discard');
    expect(unsavedEditsOutcome([ok('fullWalk', { discardedUnsavedEdits: true })], null)).toMatchObject({ decision: 'discard', kind: 'discarded' });
  });
  it('a chosen decision the engine never had to act on: the device was clean by then, or the steps did not run', () => {
    const clean = unsavedEditsOutcome([ok('reloadProbe', { editBuffer: 'clean' })], 'save');
    expect(clean).toMatchObject({ kind: 'not-needed', tone: 'ok' });
    expect(clean!.text).toMatch(/no unsaved changes/i);
    const idle = unsavedEditsOutcome([{ name: 'reloadProbe', status: 'skipped', note: 'this device cannot switch presets by SysEx' }], 'discard');
    expect(idle).toMatchObject({ kind: 'not-run', tone: 'warn' });
    expect(idle!.text).toContain('did not run: this device cannot switch presets by SysEx');
  });
  it('looks only at the steps that switch presets', () => {
    expect(unsavedEditsOutcome([ok('labelProbe', { save: saved })], null)).toBeNull();
  });
  const failedStep = (outcome: string, save?: unknown, error = 'x') => [{ name: 'reloadProbe', status: 'failed', error, result: { unsavedEdits: { decision: 'save', outcome, ...(save ? { save } : {}) } } }];
  it('save-rejected: the device refused — the stored preset is untouched and the changes are still on the device', () => {
    const o = unsavedEditsOutcome(failedStep('save-rejected', { slot: 12, ok: false, acked: false, ms: 80, reason: 'rejected' }, 'the device refused the store'), 'save');
    expect(o).toMatchObject({ kind: 'save-rejected', tone: 'bad', title: 'Unsaved changes: save refused' });
    expect(o!.text).toContain('the device refused the store');
    expect(o!.text).toMatch(/stored preset 012 was not changed/i);
    expect(o!.text).toMatch(/still on the device/i);
    expect(o!.text).toMatch(/no preset was switched/i);
  });
  it('save-unconfirmed: the device did not confirm — check the preset on the device', () => {
    const o = unsavedEditsOutcome(failedStep('save-unconfirmed', { slot: 12, ok: true, acked: false, ms: 1500 }), 'save');
    expect(o).toMatchObject({ kind: 'save-unconfirmed', tone: 'warn' });
    expect(o!.text).toBe('The device did not confirm the save to preset 012. Check preset 012 on the device to see whether it was stored. No preset was switched.');
  });
  it('saved-check-failed: saved, but it still differs from the stored copy — no preset was switched', () => {
    const o = unsavedEditsOutcome(failedStep('saved-check-failed', { slot: 7, ok: true, acked: true, ms: 200 }), 'save');
    expect(o).toMatchObject({ kind: 'saved-check-failed', tone: 'warn' });
    expect(o!.text).toBe('Your changes were saved to preset 007, but it still differs from the stored copy afterwards, so no preset was switched. Check preset 007 on the device.');
  });
  it('edits-changed: the unsaved changes moved on after the decision — nothing was saved or discarded', () => {
    const o = unsavedEditsOutcome([{ name: 'reloadProbe', status: 'skipped', note: 'the unsaved changes changed', result: { unsavedEdits: { decision: 'discard', outcome: 'edits-changed' } } }], 'discard');
    expect(o).toMatchObject({ kind: 'edits-changed', tone: 'warn' });
    expect(o!.text).toBe('The unsaved changes changed after you decided, so nothing was saved or discarded and the steps that switch presets were skipped.');
  });
  it('a save still in progress when the run stopped: check it on the device', () => {
    const o = unsavedEditsOutcome([{ name: 'reloadProbe', status: 'aborted', result: { save: { slot: 12, pending: true } } }], 'save');
    expect(o).toMatchObject({ kind: 'save-pending', tone: 'bad' });
    expect(o!.text).toBe('A save to preset 012 was in progress when the run stopped — check it on the device.');
    // also when it sits inside the decision record, and without a known slot
    expect(unsavedEditsOutcome([{ name: 'fullWalk', status: 'aborted', result: { unsavedEdits: { decision: 'save', outcome: null, save: { pending: true } } } }], null)!.text).toBe(
      'A save to the current preset was in progress when the run stopped — check it on the device.'
    );
  });
  it('save-not-possible: nothing was saved and the reload check / full walk did not switch presets', () => {
    const o = unsavedEditsOutcome([{ name: 'reloadProbe', status: 'failed', error: 'this device cannot save the edit buffer', result: { unsavedEdits: { decision: 'save', outcome: 'save-not-possible' } } }], 'save');
    expect(o).toMatchObject({ kind: 'save-not-possible', tone: 'warn', title: 'Unsaved changes: could not save' });
    expect(o!.text).toContain('this device cannot save the edit buffer');
    expect(o!.text).toMatch(/nothing was saved/i);
    expect(o!.text).toMatch(/did not switch presets/i);
    expect(o!.text).toMatch(/still on the device/i);
  });
  describe('with both switching steps in the result, the most severe outcome surfaces', () => {
    const step = (name: string, status: string, outcome: string, save?: unknown, decision = 'save') => ({
      name,
      status,
      ...(status === 'failed' ? { error: `${name} failed` } : {}),
      result: { unsavedEdits: { decision, outcome, ...(save ? { save } : {}) } }
    });
    it('a reload check that saved, then a full walk whose save did not match, shows the later problem', () => {
      const o = unsavedEditsOutcome([step('reloadProbe', 'ok', 'saved', saved), step('fullWalk', 'failed', 'saved-check-failed', { slot: 12, ok: true, acked: true, ms: 90 })], 'save');
      expect(o).toMatchObject({ kind: 'saved-check-failed', tone: 'warn' });
      expect(o!.text).toMatch(/still differs from the stored copy/i);
      expect(o!.text).toMatch(/Before that, the reload check had already saved your changes first\./);
    });
    it('a reload check that saved, then a full walk that found the edits changed, shows that', () => {
      const o = unsavedEditsOutcome([step('reloadProbe', 'ok', 'saved', saved), step('fullWalk', 'skipped', 'edits-changed')], 'save');
      expect(o).toMatchObject({ kind: 'edits-changed', tone: 'warn' });
      expect(o!.text).toMatch(/Before that, the reload check had already saved/);
    });
    it('a discard followed by a failure keeps the failure, and mentions the discard', () => {
      const o = unsavedEditsOutcome([step('reloadProbe', 'ok', 'discarded', undefined, 'discard'), step('fullWalk', 'failed', 'save-failed', undefined, 'discard')], 'discard');
      expect(o).toMatchObject({ kind: 'save-failed', tone: 'bad' });
      expect(o!.text).toMatch(/Before that, the reload check had already discarded your changes\./);
    });
    it('a problem in the first step stays when the later step is only fine or only skipped for another reason', () => {
      const first = unsavedEditsOutcome([step('reloadProbe', 'failed', 'save-unconfirmed', { slot: 3, ok: true, acked: false }), step('fullWalk', 'ok', 'saved', saved)], 'save');
      expect(first!.kind).toBe('save-unconfirmed');
      const skipped = unsavedEditsOutcome([step('reloadProbe', 'ok', 'saved', saved), { name: 'fullWalk', status: 'skipped', note: 'full capture is not verified for this firmware' }], 'save');
      expect(skipped).toMatchObject({ kind: 'saved', tone: 'ok' });
      expect(skipped!.text).not.toMatch(/Before that/);
    });
    it('two equally bad steps: the one with the save record (the cause) wins over its consequence', () => {
      const o = unsavedEditsOutcome(
        [step('reloadProbe', 'failed', 'save-rejected', { slot: 12, ok: false, acked: false, error: 'refused' }), step('fullWalk', 'failed', 'save-failed')],
        'save'
      );
      expect(o!.kind).toBe('save-rejected');
    });
    it('between two equally severe steps without records of that kind, the later one wins', () => {
      const o = unsavedEditsOutcome([step('reloadProbe', 'skipped', 'preset-changed', undefined, 'discard'), step('fullWalk', 'skipped', 'edits-changed', undefined, 'discard')], 'discard');
      expect(o!.kind).toBe('edits-changed');
    });
  });
  it('every outcome has a title and wording of its own', () => {
    const kinds = ['saved', 'discarded', 'save-rejected', 'save-unconfirmed', 'saved-check-failed', 'save-not-possible', 'edits-changed', 'preset-changed', 'save-failed'];
    const texts = new Set<string>();
    for (const outcome of kinds) {
      const o = unsavedEditsOutcome([{ name: 'reloadProbe', status: outcome === 'saved' || outcome === 'discarded' ? 'ok' : 'failed', result: { unsavedEdits: { decision: outcome === 'discarded' ? 'discard' : 'save', outcome, save: { slot: 1, ok: true, acked: true } } } }], null);
      expect(o?.kind, outcome).toBe(outcome);
      texts.add(o!.text);
    }
    expect(texts.size).toBe(kinds.length);
  });
});

// ── wiring (source pins) ──
describe('wiring (source pins)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const panel = read('./DiagnosticsPanel.svelte');
  const store = read('./diagnostics.svelte.ts');
  const client = read('./forgefx.ts');
  const types = read('./types.ts');

  it('the client reads the pre-check and the types mirror the contract', () => {
    expect(client).toContain("diagnosticCapturePreflight: () => req<CapturePreflight>('/diagnostics/capture/preflight')");
    expect(types).toContain('export interface CapturePreflight');
    expect(types).toContain("editBuffer: 'clean' | 'dirty' | 'unknown'");
    expect(types).toContain("likelyCause?: 'unsaved-edits' | 'older-firmware' | 'unknown'");
    expect(types).toContain("export type CaptureUnsavedEdits = 'save' | 'discard'");
    expect(types).toMatch(/unsavedEdits\?: CaptureUnsavedEdits;/);
  });
  it('Start runs the pre-check; the unsaved dialog comes before the confirmation dialog; its choice goes into the request', () => {
    expect(panel).toMatch(/const r = await d\.preflight\(\);[\s\S]*?dialog = askedUnsaved \? 'unsaved' : 'confirm';/);
    expect(panel).toContain('const askedUnsaved = $derived(needsUnsavedDecision({ preflight, willSwitch: willSwitchPresets(plan) }));');
    expect(panel).toMatch(/function chooseUnsaved\(choice: CaptureUnsavedEdits \| 'skip'\) \{\s*unsavedChoice = choice === 'skip' \? null : choice;\s*unsavedSkipped = choice === 'skip';\s*dialog = 'confirm';/);
    // the click event must never be taken for the restart notice
    expect(panel).toContain('onclick={() => begin()}');
    expect(panel).toMatch(/buildStartRequest\(\{ acknowledged, confirmed: true, includeFullWalk: wantFullWalk, fullWalk, preflight, unsavedEdits: unsavedChoice \}\)/);
    expect(panel.indexOf("{#if dialog === 'unsaved'")).toBeLessThan(panel.indexOf("{#if dialog === 'confirm'"));
  });
  it('a start refused because the check is out of date re-runs the pre-check and asks again, without an error banner', () => {
    expect(store).toContain('isStaleCheckError(status, body)');
    expect(store).toMatch(/this\.#staleCheck = true;[^\n]*\n\s*this\.error = null;/);
    expect(panel).toMatch(/\} else if \(d\.takeStaleCheck\(\)\) \{[\s\S]*?await begin\(STALE_CHECK_NOTE\);/);
  });
  it('the pre-check counts as busy, so the editor\'s polling pauses while the engine holds the device', () => {
    expect(store).toContain('return isRunBusy(this.view, this.checking);');
  });
  it('an expired pre-check is repeated and asked again instead of being sent', () => {
    expect(panel).toMatch(/if \(preflight && isPreflightStale\(preflightAt, Date\.now\(\)\)\) \{\s*dialog = null;\s*await begin\(PREFLIGHT_STALE_NOTE\);\s*return;\s*\}/);
    expect(panel.indexOf('isPreflightStale(preflightAt')).toBeLessThan(panel.indexOf('const request = buildStartRequest('));
    expect(panel).toContain('preflightAt = Date.now();');
    expect(panel).toContain('{restartNote}');
  });
  it('the dialog adapts: Save / Discard only when offered, a skip button when the preset is unknown, the older-firmware advice', () => {
    const dlg = panel.slice(panel.indexOf("{#if dialog === 'unsaved'"), panel.indexOf("{#if dialog === 'confirm'"));
    expect(dlg).toMatch(/\{#if unsavedModel\.discard\}/);
    expect(dlg).toMatch(/\{#if unsavedModel\.skip\}[\s\S]*?chooseUnsaved\('skip'\)/);
    expect(dlg).toContain('{unsavedModel.olderFirmware}');
    expect(dlg).toContain('{unsavedModel.olderFirmwareAdvice}');
    expect(panel).toContain('{unsavedSkipText(plan)}');
  });
  it('a refused pre-check stays on the form; a failed one starts without a decision and says so', () => {
    expect(panel).toMatch(/if \(r\.kind === 'blocked'\) return;/);
    expect(panel).toMatch(/if \(r\.kind === 'fallback'\) preflightNote = r\.note;/);
    expect(panel).toContain('{preflightNote}');
    expect(store).toContain('classifyPreflightError(status, body)');
  });
  it('the unsaved dialog is modal, Cancel is first and focused, Escape cancels the whole flow', () => {
    const dlg = panel.slice(panel.indexOf("{#if dialog === 'unsaved'"), panel.indexOf("{#if dialog === 'confirm'"));
    expect(dlg).toContain('role="alertdialog"');
    expect(dlg).toContain('aria-modal="true"');
    expect(dlg).toContain('aria-labelledby="diag-unsaved-title"');
    expect(dlg).toContain('id="diag-unsaved-title"');
    expect(dlg).toContain('id="diag-unsaved-desc"');
    expect(dlg.indexOf('class="dcancel"')).toBeLessThan(dlg.indexOf("chooseUnsaved('save')"));
    expect(dlg.indexOf("chooseUnsaved('save')")).toBeLessThan(dlg.indexOf("chooseUnsaved('discard')"));
    expect(dlg).toContain('onclick={closeDialog}');
    // Save only when the engine can; discard always shows what it costs
    expect(dlg).toMatch(/\{#if unsavedModel\.save\}/);
    expect(dlg).toContain('{unsavedModel.discard.hint}');
    expect(dlg).toContain('{unsavedModel.olderFirmware}');
    expect(panel).toContain('cancelUnsaved : cancelConfirm)?.focus()');
    expect(panel).toMatch(/function closeDialog\(\) \{\s*dialog = null;\s*unsavedChoice = null;/);
  });
  it('the store keeps the decision for the summary, which reads the outcome from the bundle', () => {
    expect(store).toContain('this.unsavedChoice = request.unsavedEdits ?? null;');
    expect(panel).toMatch(/unsavedEditsOutcome\(d\.bundle\.steps, d\.unsavedChoice\)/);
    expect(panel).toContain('{unsavedOutcome.title}');
    expect(panel).toContain('{unsavedOutcome.text}');
  });
});
