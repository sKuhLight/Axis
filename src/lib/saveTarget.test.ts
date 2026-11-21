import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forgefx, ForgeError } from './forgefx';
import {
  canProbePreset,
  checkSaveTarget,
  describeRestoreTarget,
  guardedStore,
  isSlotConfirmed,
  isSlotNumber,
  resolveCurrentSlot,
  resolveSaveTarget,
  saveBlockedText,
  saveProbeMs,
  seedOnOpen,
  slotRangeWarning,
  withTimeout,
  type OpenSeed
} from './saveTarget';

describe('canProbePreset — no preset read during a definitions walk', () => {
  it('only a live-query device that is not mid-walk may be asked', () => {
    expect(canProbePreset({ live: true, walking: false })).toBe(true);
    expect(canProbePreset({ live: true, walking: true })).toBe(false); // walk/import owns the transport (FM3 freeze)
    expect(canProbePreset({ live: false, walking: false })).toBe(false);
    expect(canProbePreset({ live: false, walking: true })).toBe(false);
  });

  it('a refused probe yields an unknown slot, never the stale cache (openSave flow)', () => {
    const probeAllowed = canProbePreset({ live: true, walking: true });
    const fresh = probeAllowed ? 20 : null; // what openSave does: no query → fresh stays null
    expect(resolveCurrentSlot({ live: true, fresh, preset: 12, last: 12 })).toBeNull();
  });

  it('a rename during a walk is unconfirmed (no read → nothing reported → abort)', () => {
    const reported = canProbePreset({ live: true, walking: true }) ? 12 : undefined;
    expect(isSlotConfirmed(12, { live: true, reported, selectAcked: true })).toBe(false);
  });
});

describe('saveProbeMs', () => {
  it('waits at least as long as the server allows the preset-ref query on a slow link (4000 ms)', () => {
    expect(saveProbeMs(true)).toBeGreaterThanOrEqual(4500);
    expect(saveProbeMs(false)).toBeGreaterThan(0);
    expect(saveProbeMs(false)).toBeLessThanOrEqual(saveProbeMs(true));
  });
});

describe('resolveSaveTarget — never invents a slot', () => {
  it('returns null when the current preset is unknown', () => {
    expect(resolveSaveTarget(undefined, undefined)).toBeNull();
    expect(resolveSaveTarget(null, null)).toBeNull();
    expect(resolveSaveTarget()).toBeNull();
  });

  it('treats a failed read (-1 / NaN) as unknown, not as slot 0', () => {
    expect(resolveSaveTarget(-1, null)).toBeNull();
    expect(resolveSaveTarget(Number.NaN, undefined)).toBeNull();
    expect(resolveSaveTarget(1.5, null)).toBeNull();
  });

  it('keeps the known behaviour: first known candidate wins', () => {
    expect(resolveSaveTarget(12, 7)).toBe(12);
    expect(resolveSaveTarget(undefined, 7)).toBe(7);
    expect(resolveSaveTarget(-1, 7)).toBe(7);
  });

  it('a genuinely loaded slot 0 is still a known target (0 is not "falsy-unknown")', () => {
    expect(resolveSaveTarget(0, 5)).toBe(0);
    expect(resolveSaveTarget(undefined, 0)).toBe(0);
  });
});

describe('resolveCurrentSlot — a stale cache never stands in for the device', () => {
  it('live-query device: ONLY the fresh read counts', () => {
    expect(resolveCurrentSlot({ live: true, fresh: 20, preset: 12, last: 12 })).toBe(20);
    expect(resolveCurrentSlot({ live: true, fresh: 0, preset: 12, last: 12 })).toBe(0);
  });

  it('live-query device: -1 / failed / timed-out read → unknown, even though the cache still says 12', () => {
    // preset switched on the unit, then edited → the query answers -1 while preset/lastPreset keep the old slot
    expect(resolveCurrentSlot({ live: true, fresh: -1, preset: 12, last: 12 })).toBeNull();
    expect(resolveCurrentSlot({ live: true, fresh: null, preset: 12, last: 12 })).toBeNull();
    expect(resolveCurrentSlot({ live: true, fresh: undefined, preset: 12, last: 12 })).toBeNull();
  });

  it('device without a live query: falls back to what was last selected here (unverifiable but all there is)', () => {
    expect(resolveCurrentSlot({ live: false, fresh: null, preset: null, last: 7 })).toBe(7);
    expect(resolveCurrentSlot({ live: false, fresh: null, preset: null, last: null })).toBeNull();
  });

  it('after a port/profile/model change the context is reset (null/null) → unknown, not the old unit’s slot', () => {
    expect(resolveCurrentSlot({ live: false, fresh: null, preset: null, last: null })).toBeNull();
    expect(resolveCurrentSlot({ live: true, fresh: null, preset: null, last: null })).toBeNull();
  });
});

describe('checkSaveTarget — shape only, never an upper bound', () => {
  it('distinguishes "nothing chosen" from "not a valid slot"', () => {
    expect(checkSaveTarget(null)).toEqual({ ok: false, reason: 'none' });
    expect(checkSaveTarget(undefined)).toEqual({ ok: false, reason: 'none' });
    for (const bad of [Number.NaN, -1, 1.5, Infinity, '3', {}, []]) {
      expect(checkSaveTarget(bad)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(saveBlockedText('none', true)).not.toBe(saveBlockedText('invalid', true));
  });

  it('accepts any valid slot, including 0 and slots above the reported count (Axe-Fx III: 1024 vs a reported 512)', () => {
    expect(checkSaveTarget(0)).toEqual({ ok: true, slot: 0 });
    expect(checkSaveTarget(255)).toEqual({ ok: true, slot: 255 });
    expect(checkSaveTarget(700)).toEqual({ ok: true, slot: 700 });
  });

  it('isSlotNumber matches the same rule', () => {
    expect(isSlotNumber(0)).toBe(true);
    expect(isSlotNumber(-1)).toBe(false);
    expect(isSlotNumber(null)).toBe(false);
  });

  it('gives a distinct explanation for an unknown current preset', () => {
    const unknownCurrent = saveBlockedText('none', false);
    expect(unknownCurrent).toMatch(/Current preset unknown/);
    expect(saveBlockedText('none', true)).not.toBe(unknownCurrent);
    expect(saveBlockedText('invalid')).toMatch(/Not a valid slot/);
  });
});

describe('slotRangeWarning — advisory, never a gate', () => {
  it('warns when a slot is beyond the reported count', () => {
    expect(slotRangeWarning(700, 512)).toMatch(/512 preset slots.*700/);
    expect(slotRangeWarning(512, 512)).not.toBeNull();
  });

  it('is silent inside the range or when the count is unknown/unusable', () => {
    expect(slotRangeWarning(511, 512)).toBeNull();
    expect(slotRangeWarning(900, undefined)).toBeNull();
    expect(slotRangeWarning(900, null)).toBeNull();
    expect(slotRangeWarning(900, 0)).toBeNull();
  });

  it('does not block: a slot the warning fires for is still accepted by the guard and stored', async () => {
    expect(slotRangeWarning(700, 512)).not.toBeNull();
    const store = vi.fn(async (_slot: number) => ({ ok: true }));
    const res = await guardedStore(700, store);
    expect(res.ok).toBe(true);
    expect(store).toHaveBeenCalledWith(700);
  });
});

describe('guardedStore — the UI-level gate in front of the device write', () => {
  it('unknown current preset → no store call and no slot-0 write', async () => {
    const store = vi.fn(async (_slot: number) => ({ ok: true }));
    // exactly what openSave() hands the dialog / save() when nothing is known:
    const target = resolveCurrentSlot({ live: true, fresh: -1, preset: 12, last: 12 });
    const res = await guardedStore(target, store);
    expect(res).toEqual({ ok: false, reason: 'none' });
    expect(store).not.toHaveBeenCalled();
  });

  it.each([null, undefined, Number.NaN, -1, 2.5])('refuses target %s without touching the device', async (bad) => {
    const store = vi.fn(async (_slot: number) => ({ ok: true }));
    const res = await guardedStore(bad, store);
    expect(res.ok).toBe(false);
    expect(store).not.toHaveBeenCalled();
  });

  it('known preset → stores to exactly that slot and returns the device result', async () => {
    const store = vi.fn(async (slot: number) => ({ ok: true, location: slot, code: 'B02' }));
    const res = await guardedStore(resolveSaveTarget(7, 3), store);
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(7);
    expect(res).toEqual({ ok: true, slot: 7, result: { ok: true, location: 7, code: 'B02' } });
  });

  it('an explicitly chosen slot 0 is honoured (explicit ≠ guessed)', async () => {
    const store = vi.fn(async (_slot: number) => ({ ok: true }));
    const res = await guardedStore(0, store);
    expect(res.ok).toBe(true);
    expect(store).toHaveBeenCalledWith(0);
  });

  it('device errors propagate so the caller can report "Save failed"', async () => {
    const store = vi.fn(async (_slot: number): Promise<{ ok: boolean }> => {
      throw new Error('timeout');
    });
    await expect(guardedStore(4, store)).rejects.toThrow('timeout');
  });
});

describe('isSlotConfirmed — rename/store only on a buffer confirmed to be the slot', () => {
  it('live-query device: only the device’s own answer counts (an acked switch alone is not enough)', () => {
    expect(isSlotConfirmed(12, { live: true, reported: 12, selectAcked: false })).toBe(true);
    // timed-out switch: the old preset is still loaded
    expect(isSlotConfirmed(12, { live: true, reported: 7, selectAcked: false })).toBe(false);
    expect(isSlotConfirmed(12, { live: true, reported: undefined, selectAcked: true })).toBe(false);
    expect(isSlotConfirmed(12, { live: true, reported: -1, selectAcked: true })).toBe(false);
  });

  it('device without a live query: the switch must at least have been acknowledged', () => {
    expect(isSlotConfirmed(12, { live: false, reported: undefined, selectAcked: true })).toBe(true);
    expect(isSlotConfirmed(12, { live: false, reported: undefined, selectAcked: false })).toBe(false);
  });

  it('never confirms a non-slot', () => {
    expect(isSlotConfirmed(-1, { live: true, reported: -1, selectAcked: true })).toBe(false);
    expect(isSlotConfirmed(Number.NaN, { live: false, reported: undefined, selectAcked: true })).toBe(false);
  });
});

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes the value through when it settles in time', async () => {
    await expect(withTimeout(Promise.resolve(5), 1000, -1)).resolves.toBe(5);
  });

  it('falls back when the promise rejects', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 1000, -1)).resolves.toBe(-1);
  });

  it('falls back when the promise never settles within the window', async () => {
    const p = withTimeout(new Promise<number>(() => {}), 3000, -1);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toBe(-1);
  });

  it('does not leave a pending timer behind after a timely answer', async () => {
    await withTimeout(Promise.resolve(1), 3000, -1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('seedOnOpen — an open dialog keeps what the user typed', () => {
  // Models the dialog's draft over time: `poll` re-evaluates the effect with a fresh seed (the preset
  // refreshed in the background); the draft must not be re-seeded while the dialog stays open.
  const open = (s: OpenSeed<string>, seed: string) => seedOnOpen(s, true, () => seed);
  const close = (s: OpenSeed<string>) => seedOnOpen(s, false, () => 'never');

  it('seeds on the closed → open transition', () => {
    const s = open({ wasOpen: false, value: '' }, 'Clean Amp');
    expect(s).toEqual({ wasOpen: true, value: 'Clean Amp' });
  });

  it('a poll update while open does not overwrite the typed name', () => {
    let s = open({ wasOpen: false, value: '' }, 'Clean Amp');
    s = { ...s, value: 'My new name' }; // user types
    const seed = vi.fn(() => 'Device Name After Poll');
    s = seedOnOpen(s, true, seed); // background poll refreshed the preset
    expect(s.value).toBe('My new name');
    expect(seed).not.toHaveBeenCalled(); // the seed is not even read while open
  });

  it('a poll update while open does not silently move the target slot', () => {
    let s: OpenSeed<number | null> = seedOnOpen({ wasOpen: false, value: null }, true, () => 12);
    s = { ...s, value: 40 }; // user picked slot 40
    s = seedOnOpen(s, true, () => 99); // device-side preset changed to 99 under the open dialog
    expect(s.value).toBe(40);
  });

  it('an unknown-preset open stays unchosen until the user picks (null seed is kept across polls)', () => {
    let s: OpenSeed<number | null> = seedOnOpen({ wasOpen: false, value: null }, true, () => resolveSaveTarget(undefined, null));
    expect(s.value).toBeNull();
    s = seedOnOpen(s, true, () => 0); // even if a poll suddenly reports slot 0, the draft stays unchosen
    expect(s.value).toBeNull();
  });

  it('re-seeds (re-blanks) on the next open: close → open', () => {
    let s = open({ wasOpen: false, value: '' }, 'First');
    s = { ...s, value: 'typed' };
    s = close(s);
    expect(s.wasOpen).toBe(false);
    s = open(s, 'Second');
    expect(s.value).toBe('Second');
  });

  it('stays untouched while closed', () => {
    const seed = vi.fn(() => 'x');
    const s = seedOnOpen({ wasOpen: false, value: 'keep' }, false, seed);
    expect(s).toEqual({ wasOpen: false, value: 'keep' });
    expect(seed).not.toHaveBeenCalled();
  });
});

describe('describeRestoreTarget — names where a verbatim restore will write', () => {
  const fmt = (n: number) => String(n).padStart(3, '0');

  it('gen-3 single preset: names the embedded slot and the preset', () => {
    expect(describeRestoreTarget({ number: 12, name: 'Clean Amp' }, fmt)).toBe('preset 012 — "Clean Amp"');
    expect(describeRestoreTarget({ number: 0 }, fmt)).toBe('preset 000');
  });

  it('gen-3 file whose slot cannot be determined says so instead of naming one', () => {
    expect(describeRestoreTarget({ number: -1, name: 'X' }, fmt)).toMatch(/could not be determined/);
    expect(describeRestoreTarget({}, fmt)).toMatch(/could not be determined/);
  });

  it('bank files: one location by code, several as a count + list', () => {
    expect(describeRestoreTarget({ presets: [{ location: 5, code: 'B02' }] }, fmt)).toBe('location B02');
    expect(describeRestoreTarget({ presets: [{ location: 5, code: null }] }, fmt)).toBe('location 005');
    expect(
      describeRestoreTarget({ presets: Array.from({ length: 8 }, (_, i) => ({ location: i, code: `A0${i + 1}` })) }, fmt)
    ).toBe('8 locations (A01, A02, A03, A04, A05, A06, …)');
    expect(describeRestoreTarget({ presets: [] }, fmt)).toBe('an unknown location');
  });
});

// ── client-level guard: forgefx.store / am4StorePreset themselves refuse a non-slot ─────────────────
describe('forgefx.store / am4StorePreset — guarded at the client, whoever calls them', () => {
  function res(status: number, body: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => body
    };
  }
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([undefined, null, Number.NaN, -1, 3.5, '7' as unknown as number])('store(%s) rejects and sends NO request', async (bad) => {
    await expect(forgefx.store(bad as number)).rejects.toBeInstanceOf(ForgeError);
    await expect(forgefx.am4StorePreset(bad as number)).rejects.toBeInstanceOf(ForgeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a calling pattern like `store(preset?.number ?? last)` with both unknown cannot reach the device', async () => {
    const preset: { number: number } | null = null;
    const last: number | null = null;
    await expect(forgefx.store((preset as { number: number } | null)?.number ?? (last as unknown as number))).rejects.toThrow(/Refusing to store/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a valid slot (including 0 and slots above 511) goes through with exactly that number', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    await forgefx.store(0);
    await forgefx.store(700);
    await forgefx.am4StorePreset(5);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/preset/store');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ number: 0 });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ number: 700 });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/am4/preset/store');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ location: 5 });
  });
});

// The store, dialog and tools are runes/Svelte modules (not importable in this node-only suite), so pin the
// wiring itself.
describe('wiring (source pins)', () => {
  const srcRoot = fileURLToPath(new URL('../', import.meta.url));
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const editorSrc = read('./editor.svelte.ts');
  const dialogSrc = read('./SaveDialog.svelte');
  const toolsSrc = read('./DeviceTools.svelte');

  /** Every non-test source file under src/ (relative, forward slashes). */
  const sources = readdirSync(srcRoot, { recursive: true, encoding: 'utf8' })
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => /\.(ts|svelte)$/.test(p) && !/\.test\.ts$/.test(p));

  it('no source under src/ calls forgefx.store / am4StorePreset except the allowlisted, reviewed sites', () => {
    const found: string[] = [];
    for (const rel of sources) {
      const text = readFileSync(srcRoot + rel, 'utf8');
      for (const m of text.matchAll(/\bforgefx\.(store|am4StorePreset)\s*\(([^)]*)\)/g)) found.push(`${rel} :: ${m[1]}(${m[2].trim()})`);
    }
    // Every argument is a validated `slot`: editor.save() gets it from guardedStore, renameStoredPreset()
    // pre-validates it AND confirms the buffer, DeviceTools goes through guardedStore. A NEW call site must be
    // reviewed for a default/unknown target and added here deliberately.
    expect(found.sort()).toEqual(
      [
        'lib/DeviceTools.svelte :: am4StorePreset(slot)',
        'lib/DeviceTools.svelte :: store(slot)',
        'lib/editor.svelte.ts :: am4StorePreset(slot)',
        'lib/editor.svelte.ts :: store(slot)',
        'lib/editor.svelte.ts :: store(slot)'
      ].sort()
    );
  });

  it('the raw store routes are only spelled out inside the (guarded) forgefx client', () => {
    const hits = sources.filter((rel) => /['"`]\/(am4\/)?preset\/store['"`]/.test(readFileSync(srcRoot + rel, 'utf8')));
    expect(hits).toEqual(['lib/forgefx.ts']);
    const client = read('./forgefx.ts');
    expect(client).toMatch(/store: \(number: number\) =>\s*refuseBadStoreSlot\(number\) \?\?/);
    expect(client).toMatch(/am4StorePreset: \(location: number\) =>\s*refuseBadStoreSlot\(location\) \?\?/);
  });

  it('no source defaults a save/store target to a slot (`saveTarget … ?? 0`, `$state(0)` target)', () => {
    for (const rel of sources) {
      const text = readFileSync(srcRoot + rel, 'utf8');
      expect(text, rel).not.toMatch(/saveTarget\s*=[^;\n]*\?\?\s*0\b/);
    }
    expect(editorSrc).toMatch(/saveTarget = \$state<number \| null>\(null\)/);
  });

  it('editor: openSave re-reads the device and never falls back to cached preset/lastPreset on a live device', () => {
    const openSave = editorSrc.slice(editorSrc.indexOf('openSave = async'), editorSrc.indexOf('save = async'));
    expect(openSave).toContain('forgefx.currentPreset()');
    expect(openSave).toContain('resolveCurrentSlot(');
    expect(openSave).not.toMatch(/\?\?\s*0\b/);
    // the walk gate sits in front of the read, the answer is dropped when the device context changed meanwhile,
    // and the pending flag drives the "Reading…" state
    expect(openSave.indexOf('canProbePreset(')).toBeGreaterThan(-1);
    expect(openSave.indexOf('canProbePreset(')).toBeLessThan(openSave.indexOf('forgefx.currentPreset()'));
    expect(openSave).toMatch(/gen !== this\.#presetGen\) return/);
    expect(openSave).toContain('saveProbeMs(this.slowLink)');
    expect(openSave).toContain('this.savePending = true');
    expect(editorSrc).toMatch(/#walkActive = \(\) => !!\(deviceDefs\.building \|\| deviceDefs\.importing \|\| diagnostics\.running\)/);
    expect(editorSrc).toMatch(/#resetPresetContext = \(\) => \{\s*this\.#presetGen\+\+;/);
    expect(read('./TopBar.svelte')).toContain('editor.savePending');
    expect(read('./axis-workbench/widgets/AxisWorkbenchWidget.svelte')).toContain('editor.savePending');
    const save = editorSrc.slice(editorSrc.indexOf('save = async'), editorSrc.indexOf('// ── toast'));
    expect(save).toContain('guardedStore(');
  });

  it('editor: the preset context is reset on port, profile and device change', () => {
    const resets = editorSrc.match(/this\.#resetPresetContext\(\)/g) ?? [];
    expect(resets.length).toBeGreaterThanOrEqual(3); // pickPort + pickProfile + #adoptDevice
    const pickPort = editorSrc.slice(editorSrc.indexOf('pickPort = async'), editorSrc.indexOf('pickProfile = async'));
    expect(pickPort).toContain('#resetPresetContext()');
    const pickProfile = editorSrc.slice(editorSrc.indexOf('pickProfile = async'), editorSrc.indexOf('// ── preset nav'));
    expect(pickProfile).toContain('#resetPresetContext()');
    const adopt = editorSrc.slice(editorSrc.indexOf('#adoptDevice = '), editorSrc.indexOf('#polling = false'));
    expect(adopt).toContain('#resetPresetContext()');
  });

  it('editor: renameStoredPreset confirms the slot is loaded BEFORE it renames/stores', () => {
    const rename = editorSrc.slice(editorSrc.indexOf('renameStoredPreset = async'), editorSrc.indexOf('setBpm = async'));
    const iConfirm = rename.indexOf('isSlotConfirmed(');
    expect(iConfirm).toBeGreaterThan(-1);
    expect(iConfirm).toBeLessThan(rename.indexOf('forgefx.setPresetName('));
    expect(iConfirm).toBeLessThan(rename.indexOf('forgefx.store('));
    // a definitions walk blocks the whole rename up front — before any switch or read touches the transport
    const iWalk = rename.indexOf('this.#walkActive()');
    expect(iWalk).toBeGreaterThan(-1);
    expect(iWalk).toBeLessThan(rename.indexOf('this.selectPreset(slot)'));
    expect(iWalk).toBeLessThan(rename.indexOf('forgefx.currentPreset()'));
    expect(rename).toContain('saveProbeMs(this.slowLink)');
  });

  it('editor: selectPreset reports whether the device acknowledged the switch', () => {
    const sel = editorSrc.slice(editorSrc.indexOf('selectPreset = async'), editorSrc.indexOf('stepPreset = '));
    expect(sel).toMatch(/r\?\.ok === false\) return false/);
    expect(sel).toContain('Promise<boolean>');
  });

  it('dialog: Save is disabled without a valid target, seeded once per open, and the range is only a warning', () => {
    expect(dialogSrc).toContain('checkSaveTarget(');
    expect(dialogSrc).toMatch(/disabled=\{!check\.ok\}/);
    expect(dialogSrc).toContain('seedOnOpen(');
    expect(dialogSrc).not.toMatch(/\bstate\(0\)/);
    expect(dialogSrc).toContain('slotRangeWarning(');
    expect(dialogSrc).not.toMatch(/\bmax=\{/); // no upper-bound attribute / gate
    expect(dialogSrc).toContain('editor.saveCurrent'); // wording derives from the verified slot, not cached preset
  });

  it('device tools: no preselected slot (re-blanked on open), guardedStore, and restore confirms a decoded target first', () => {
    expect(toolsSrc).toMatch(/storeLoc = \$state<number \| ''>\(''\)/);
    expect(toolsSrc).toMatch(/seedOnOpen<number \| ''>\(/);
    expect(toolsSrc).toContain('guardedStore(');
    const restore = toolsSrc.slice(toolsSrc.indexOf('async function restore'), toolsSrc.indexOf('async function decode'));
    const iDescribe = restore.indexOf('describeRestoreTarget(');
    const iConfirm = restore.indexOf('confirm(');
    const iWrite = restore.search(/forgefx\.(am4RestorePreset|presetRestore)\(/);
    expect(iDescribe).toBeGreaterThan(-1);
    expect(iConfirm).toBeGreaterThan(iDescribe);
    expect(iWrite).toBeGreaterThan(iConfirm);
    // a failing decode (gen-2: restoreDump but no decode → 501) must NOT abort the restore flow: it is caught
    // and the prompt still appears (with the "could not be determined" wording)
    const iDecode = restore.search(/forgefx\.(am4DecodeSyx|decodeSyxBytes)\(/);
    const tryOpen = restore.lastIndexOf('try {', iDecode);
    const catchAt = restore.indexOf('} catch {', iDecode);
    expect(iDecode).toBeGreaterThan(-1);
    expect(restore.slice(tryOpen, catchAt)).toContain('dec = legacyAm4'); // the decode sits in its own inner try
    expect(restore.slice(tryOpen, catchAt)).not.toContain('confirm(');
    expect(catchAt).toBeGreaterThan(iDecode);
    expect(catchAt).toBeLessThan(iDescribe);
  });
});
