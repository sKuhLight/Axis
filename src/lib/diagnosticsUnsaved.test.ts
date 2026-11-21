import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  OLDER_FIRMWARE_NOTE,
  PREFLIGHT_FALLBACK_NOTE,
  buildStartRequest,
  classifyPreflightError,
  needsUnsavedDecision,
  plannedSteps,
  startErrorMessage,
  unsavedDecisionText,
  unsavedDialogModel,
  unsavedEditsOutcome,
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

describe('unsavedEdits in the start body', () => {
  it('sends the decision, with the preset it was made for, only when the pre-check found unsaved edits', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'dirty' }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 12 });
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'unknown' }), unsavedEdits: 'save' })).toEqual({ acknowledged: true, unsavedEdits: 'save', preset: 12 });
    // a stale choice (device now clean) or no pre-check never rides along
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'clean' }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: null, unsavedEdits: 'discard' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base })).toEqual({ acknowledged: true });
  });
  it('never sends save when the engine said it cannot save', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ canSave: false }), unsavedEdits: 'save' })).toEqual({ acknowledged: true });
    expect(buildStartRequest({ ...base, preflight: pre({ canSave: false }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 12 });
  });
  it('sends preset 0, and leaves the preset out when the pre-check did not know it (the engine then uses its last pre-check)', () => {
    expect(buildStartRequest({ ...base, preflight: pre({ preset: 0 }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard', preset: 0 });
    expect(buildStartRequest({ ...base, preflight: pre({ preset: null, canSave: false }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard' });
    expect(buildStartRequest({ ...base, preflight: pre({ preset: 1.5 }), unsavedEdits: 'discard' })).toEqual({ acknowledged: true, unsavedEdits: 'discard' });
    expect(buildStartRequest({ ...base, preflight: pre({ editBuffer: 'clean' }), unsavedEdits: 'discard' })).not.toHaveProperty('preset');
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
    expect(m.discard.label).toBe('Discard changes');
    expect(m.discard.hint).toMatch(/unsaved changes on the device are lost/i);
  });
  it('mentions the full walk when it is part of the run', () => {
    expect(unsavedDialogModel(pre(), { includeFullWalk: true }).paragraphs[0]).toMatch(/reload check and the full walk switch presets/i);
  });
  it('offers no save when the engine cannot save or the preset is unknown', () => {
    expect(unsavedDialogModel(pre({ canSave: false }), plan).save).toBeNull();
    const none = unsavedDialogModel(pre({ preset: null, presetName: undefined, canSave: true }), plan);
    expect(none.save).toBeNull();
    expect(none.title).toBe('Unsaved changes on the current preset');
    expect(unsavedDialogModel(pre({ presetName: undefined }), plan).title).toBe('Unsaved changes on preset 012');
  });
  it('adds the older-firmware explanation when that is the likely cause', () => {
    const m = unsavedDialogModel(pre({ likelyCause: 'older-firmware' }), plan);
    expect(m.olderFirmware).toBe(OLDER_FIRMWARE_NOTE);
    expect(OLDER_FIRMWARE_NOTE).toBe(
      'This preset may have been saved under an older firmware; the device converted it when loading. Saving stores it in the current format.'
    );
    for (const likelyCause of ['unsaved-edits', 'unknown', undefined] as const) expect(unsavedDialogModel(pre({ likelyCause }), plan).olderFirmware).toBeNull();
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
    expect(panel).toMatch(/const r = await d\.preflight\(\);[\s\S]*?dialog = needsUnsavedDecision\(\{ preflight, willSwitch: willSwitchPresets\(plan\) \}\) \? 'unsaved' : 'confirm';/);
    expect(panel).toMatch(/function chooseUnsaved\(choice: CaptureUnsavedEdits\) \{\s*unsavedChoice = choice;\s*dialog = 'confirm';/);
    expect(panel).toMatch(/buildStartRequest\(\{ acknowledged, confirmed: true, includeFullWalk: wantFullWalk, fullWalk, preflight, unsavedEdits: unsavedChoice \}\)/);
    expect(panel.indexOf("{#if dialog === 'unsaved'")).toBeLessThan(panel.indexOf("{#if dialog === 'confirm'"));
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
