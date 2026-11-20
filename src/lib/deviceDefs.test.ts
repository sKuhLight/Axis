import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  deviceDefsActions,
  shouldOfferDeviceDefs,
  activeDefsSource,
  dismissKey,
  staleDismissTag,
  currentDismissKey,
  isDismissed,
  isDefsStale,
  hasUsableDefs,
  effectiveStatus,
  staleCopy,
  cloudStaleNote,
  cloudPullFailureMessage,
  rebuildPlan,
  canAutoImportFromFolder,
  canRebuildDefs,
  parseEditorCacheName,
  normalizeModelHex,
  parseFirmware,
  matchEditorCacheFile,
  isBuildProgressPhase,
  type DeviceDefsInputs
} from './deviceDefs';
import type { DeviceCacheStatus } from './types';

const baseEnv = { isElectron: false, hasDirectoryPicker: false, isRemote: false };
const inputs = (o: Partial<DeviceDefsInputs>): DeviceDefsInputs => ({
  caps: { selfDescribe: true, cacheImport: true },
  status: { exists: false, building: false },
  sources: { candidates: [] },
  cloud: { available: false },
  env: baseEnv,
  ...o
});

describe('deviceDefsActions — ordered available actions', () => {
  it('offers cloud pull first when a shared profile is available', () => {
    const a = deviceDefsActions(inputs({ cloud: { available: true } }));
    expect(a[0]).toBe('cloudPull');
  });

  it('lists discovered candidates before drag-drop, but only in Electron', () => {
    const withCandidates = { candidates: [{}] } as unknown as DeviceDefsInputs['sources'];
    // Browser: candidate import is NOT offered (server-side discovery is desktop-only).
    expect(deviceDefsActions(inputs({ sources: withCandidates }))).not.toContain('importCandidate');
    // Electron: candidate import appears, ahead of drop.
    const a = deviceDefsActions(inputs({ sources: withCandidates, env: { ...baseEnv, isElectron: true } }));
    expect(a.indexOf('importCandidate')).toBeLessThan(a.indexOf('dropFile'));
  });

  it('always offers drag-drop and read-from-device as the universal fallbacks', () => {
    const a = deviceDefsActions(inputs({}));
    expect(a).toContain('dropFile');
    expect(a).toContain('readFromDevice');
    expect(a.indexOf('dropFile')).toBeLessThan(a.indexOf('readFromDevice'));
  });

  it('hides read-from-device over a relay (remote) session', () => {
    expect(deviceDefsActions(inputs({ env: { ...baseEnv, isRemote: true } }))).not.toContain('readFromDevice');
  });

  it('offers folder access only in a browser with the directory picker', () => {
    expect(deviceDefsActions(inputs({ env: { ...baseEnv, hasDirectoryPicker: true } }))).toContain('locateFolder');
    // Electron uses server discovery instead — no locate-folder there.
    expect(deviceDefsActions(inputs({ env: { ...baseEnv, hasDirectoryPicker: true, isElectron: true } }))).not.toContain('locateFolder');
  });

  it('hides all import affordances when the server does not accept imports', () => {
    const a = deviceDefsActions(inputs({ caps: { selfDescribe: true, cacheImport: false }, env: { ...baseEnv, hasDirectoryPicker: true } }));
    expect(a).toEqual(['readFromDevice']); // only the self-describe walk remains
  });

  it('returns nothing while a build is already running', () => {
    expect(deviceDefsActions(inputs({ status: { exists: false, building: true } }))).toEqual([]);
  });

  it('keeps the full preference order when everything is available', () => {
    const a = deviceDefsActions(inputs({
      cloud: { available: true },
      sources: { candidates: [{}] } as unknown as DeviceDefsInputs['sources'],
      env: { ...baseEnv, isElectron: true }
    }));
    expect(a).toEqual(['cloudPull', 'importCandidate', 'dropFile', 'readFromDevice']);
  });

  it('offers the full (taper) capture only when the device advertises fullCapture, and always last', () => {
    // Not advertised → absent, even with self-describe present.
    expect(deviceDefsActions(inputs({}))).not.toContain('fullCapture');
    // Advertised → appended after read-from-device as the clearly-secondary, last affordance.
    const a = deviceDefsActions(inputs({ caps: { selfDescribe: true, cacheImport: true, fullCapture: true } }));
    expect(a).toContain('fullCapture');
    expect(a.indexOf('fullCapture')).toBeGreaterThan(a.indexOf('readFromDevice'));
    expect(a[a.length - 1]).toBe('fullCapture');
  });

  it('hides the full (taper) capture without self-describe or over a relay', () => {
    // fullCapture is a superset of the self-describe walk — no walk, no full capture.
    expect(deviceDefsActions(inputs({ caps: { selfDescribe: false, cacheImport: true, fullCapture: true } }))).not.toContain('fullCapture');
    // A relay session can't run a usable device read either.
    expect(deviceDefsActions(inputs({ caps: { selfDescribe: true, fullCapture: true }, env: { ...baseEnv, isRemote: true } }))).not.toContain('fullCapture');
  });

  it('offers nothing (incl. full capture) while a build is already running', () => {
    expect(deviceDefsActions(inputs({ caps: { selfDescribe: true, fullCapture: true }, status: { exists: false, building: true } }))).toEqual([]);
  });
});

describe('isBuildProgressPhase — SSE phase classification (full-mode tolerant)', () => {
  it('treats walking / building / the full-mode param-sweep sub-phase as progress', () => {
    expect(isBuildProgressPhase('walking')).toBe(true);
    expect(isBuildProgressPhase('building')).toBe(true);
    expect(isBuildProgressPhase('param-sweep')).toBe(true);
  });

  it('treats any unknown / future additive sub-phase as progress (never terminal)', () => {
    expect(isBuildProgressPhase('some-new-phase')).toBe(true);
    expect(isBuildProgressPhase('')).toBe(true);
  });

  it('treats the terminal phases as NOT progress', () => {
    for (const p of ['done', 'error', 'cancelled', 'already-built']) {
      expect(isBuildProgressPhase(p)).toBe(false);
    }
  });
});

describe('shouldOfferDeviceDefs — when the prompt appears', () => {
  it('does not appear without the self-describe capability', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: false }, { exists: false, building: false }, false)).toBe(false);
    expect(shouldOfferDeviceDefs(null, { exists: false, building: false }, false)).toBe(false);
  });

  it('does not appear before the status has loaded', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, null, false)).toBe(false);
  });

  it('appears when self-describing with no persisted profile and not dismissed', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, { exists: false, building: false }, false)).toBe(true);
  });

  it('offers the prompt for import-only devices (cacheImport without selfDescribe, e.g. AM4)', () => {
    expect(shouldOfferDeviceDefs({ cacheImport: true }, { exists: false, building: false }, false)).toBe(true);
    expect(shouldOfferDeviceDefs({ selfDescribe: false, cacheImport: false }, { exists: false, building: false }, false)).toBe(false);
    expect(shouldOfferDeviceDefs({ cacheImport: true }, { exists: true, building: false }, false)).toBe(false);
  });

  it('does not appear once a profile is persisted', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, { exists: true, building: false }, false)).toBe(false);
  });

  it('stays hidden when dismissed', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, { exists: false, building: false }, true)).toBe(false);
  });

  it('always surfaces an in-flight build, even if dismissed', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, { exists: false, building: true }, true)).toBe(true);
  });
});

describe('shouldOfferDeviceDefs — stale profiles', () => {
  const staleStatus = { exists: true, building: false, stale: true };

  it('appears for a stored-but-stale profile (the server no longer applies it)', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, staleStatus, false)).toBe(true);
    expect(shouldOfferDeviceDefs({ selfDescribe: true, cacheImport: true }, staleStatus, false)).toBe(true);
    // (an import-only device never applies stored profiles, so there stale is not prompted — see effectiveStatus below)
  });

  it('stays hidden for a stale profile once that state was dismissed', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, staleStatus, true)).toBe(false);
  });

  it('a profile that is stored and NOT stale still hides the prompt, as before', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, { exists: true, building: false, stale: false }, false)).toBe(false);
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, { exists: true, building: false }, false)).toBe(false); // older server: no field
  });

  it('still surfaces an in-flight build over a stale profile, even if dismissed', () => {
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, { exists: true, building: true, stale: true }, true)).toBe(true);
  });

  it('classifies the status: stale vs usable', () => {
    expect(isDefsStale({ exists: true, stale: true })).toBe(true);
    expect(isDefsStale({ exists: true, stale: false })).toBe(false);
    expect(isDefsStale({ exists: false, stale: true })).toBe(false); // nothing stored, nothing stale
    expect(isDefsStale(null)).toBe(false);
    expect(hasUsableDefs({ exists: true })).toBe(true);
    expect(hasUsableDefs({ exists: true, stale: true })).toBe(false);
    expect(hasUsableDefs({ exists: false })).toBe(false);
    expect(hasUsableDefs(undefined)).toBe(false);
  });
});

describe('activeDefsSource — a stale profile is not the active definitions', () => {
  const stale: DeviceCacheStatus = { key: 'k', exists: true, building: false, stale: true, staleReason: 'missing', currentSchema: 1, meta: { recordCount: 10, builtAt: null, source: 'live', schema: null } };

  it('reports the bundled definitions, flagged stale, even though a profile is stored', () => {
    const s = activeDefsSource(stale, null);
    expect(s.origin).toBe('bundled');
    expect(s.stale).toBe(true);
    expect(s.label).toMatch(/out of date/);
    expect(s.detail).toMatch(/not used/);
  });

  it('is not rescued by sources.persisted', () => {
    expect(activeDefsSource(stale, { persisted: true }).origin).toBe('bundled');
  });

  it('is not flagged stale for bundled-only or in-use profiles', () => {
    expect(activeDefsSource(null, null).stale).toBe(false);
    expect(activeDefsSource({ key: 'k', exists: true, building: false, meta: { recordCount: 1, builtAt: null, source: 'live' } }, null).stale).toBe(false);
  });
});

describe('activeDefsSource — where the active definitions came from', () => {
  const status = (o: Partial<DeviceCacheStatus>): DeviceCacheStatus => ({ key: 'k', exists: true, building: false, ...o });

  it('reports bundled when nothing is persisted', () => {
    expect(activeDefsSource(null, null).origin).toBe('bundled');
    expect(activeDefsSource(status({ exists: false }), { persisted: false }).origin).toBe('bundled');
  });

  it('labels a persisted profile by its stamped source', () => {
    expect(activeDefsSource(status({ meta: { recordCount: 10, builtAt: null, source: 'live' } }), null).origin).toBe('device');
    expect(activeDefsSource(status({ meta: { recordCount: 10, builtAt: null, source: 'editor-cache' } }), null).origin).toBe('editorCache');
    expect(activeDefsSource(status({ meta: { recordCount: 10, builtAt: null, source: 'cloud' } }), null).label).toBe('Shared cloud profile');
  });

  it('falls back to a generic device profile when a profile exists but source is unknown', () => {
    const s = activeDefsSource(status({ meta: { recordCount: 10, builtAt: null } }), null);
    expect(s.origin).toBe('device');
    expect(s.label).toBe('Device profile');
  });

  it('treats sources.persisted as a profile signal even without status.meta', () => {
    expect(activeDefsSource(null, { persisted: true }).origin).not.toBe('bundled');
  });

  it('summarises record count / firmware / coverage in the detail line', () => {
    const s = activeDefsSource(status({ meta: { recordCount: 1234, builtAt: null, firmware: '1.07.15', unmappedSections: 2, source: 'live' } }), null);
    expect(s.detail).toMatch(/1[.,]234 definitions/); // thousands separator is locale-dependent
    expect(s.detail).toContain('firmware 1.07.15');
    expect(s.detail).toContain('2 unmapped');
  });
});

describe('filename parsing + matching', () => {
  it('normalizes model bytes to bare lowercase hex', () => {
    expect(normalizeModelHex('0x15')).toBe('15');
    expect(normalizeModelHex('0X07')).toBe('7');
    expect(normalizeModelHex('15')).toBe('15');
    expect(normalizeModelHex(null)).toBe('');
  });

  it('parses firmware version to major/minor', () => {
    expect(parseFirmware('1.07.15')).toEqual({ major: 1, minor: 7 });
    expect(parseFirmware('2.0')).toEqual({ major: 2, minor: 0 });
    expect(parseFirmware('3')).toEqual({ major: 3, minor: 0 });
    expect(parseFirmware(null)).toBeNull();
  });

  it('parses an effectDefinitions cache filename', () => {
    expect(parseEditorCacheName('effectDefinitions_15_1p7.cache')).toEqual({ model: '15', fwMajor: 1, fwMinor: 7 });
    expect(parseEditorCacheName('EffectDefinitions_0x07_2p10.CACHE')).toEqual({ model: '7', fwMajor: 2, fwMinor: 10 });
    expect(parseEditorCacheName('/some/path/effectDefinitions_15_1p7.cache')).toEqual({ model: '15', fwMajor: 1, fwMinor: 7 });
    expect(parseEditorCacheName('random.cache')).toBeNull();
    expect(parseEditorCacheName('effectDefinitions_15.cache')).toBeNull();
  });

  it('matches on model and firmware when both are known', () => {
    const target = { modelHex: '15', fw: { major: 1, minor: 7 } };
    expect(matchEditorCacheFile('effectDefinitions_15_1p7.cache', target)).toBe(true);
    expect(matchEditorCacheFile('effectDefinitions_15_1p8.cache', target)).toBe(false); // wrong minor
    expect(matchEditorCacheFile('effectDefinitions_07_1p7.cache', target)).toBe(false); // wrong model
  });

  it('matches on model alone when firmware is unknown (server still validates)', () => {
    expect(matchEditorCacheFile('effectDefinitions_15_9p9.cache', { modelHex: '15', fw: null })).toBe(true);
    expect(matchEditorCacheFile('effectDefinitions_07_9p9.cache', { modelHex: '15', fw: null })).toBe(false);
  });

  it('never matches a non-cache filename', () => {
    expect(matchEditorCacheFile('notes.txt', { modelHex: '15', fw: null })).toBe(false);
  });
});

describe('dismissKey', () => {
  it('combines model + firmware, lowercased and null-safe', () => {
    expect(dismissKey('FM3', '1.07.15')).toBe('fm3|1.07.15');
    expect(dismissKey(null, null)).toBe('?|?');
    expect(dismissKey('AxeFx III', undefined)).toBe('axefx iii|?');
  });

  it('keeps the plain key when there is no stale state (earlier dismissals stay valid)', () => {
    expect(dismissKey('FM3', '12.0', null)).toBe('fm3|12.0');
    expect(dismissKey('FM3', '12.0', undefined)).toBe('fm3|12.0');
  });

  it('is a different key for a stale state', () => {
    expect(dismissKey('FM3', '12.0', 'none>1')).toBe('fm3|12.0|stale:none>1');
    expect(dismissKey('FM3', '12.0', 'none>1')).not.toBe(dismissKey('FM3', '12.0'));
  });
});

describe('staleDismissTag + isDismissed — a dismissal never suppresses the stale prompt', () => {
  const stale = (schema: number | null, currentSchema = 2): DeviceCacheStatus => ({
    key: 'k', exists: true, building: false, stale: true, currentSchema, meta: { recordCount: 1, builtAt: null, schema }
  });
  const usable: DeviceCacheStatus = { key: 'k', exists: true, building: false, stale: false, currentSchema: 2, meta: { recordCount: 1, builtAt: null, schema: 2 } };
  const none: DeviceCacheStatus = { key: 'k', exists: false, building: false, currentSchema: 2 };

  it('tags only a stale state, with the stored and the current schema', () => {
    expect(staleDismissTag(stale(1))).toBe('1>2');
    expect(staleDismissTag(stale(null))).toBe('none>2');
    expect(staleDismissTag({ exists: true, stale: true })).toBe('none>?'); // a server that reports neither number
    expect(staleDismissTag(usable)).toBeNull();
    expect(staleDismissTag(none)).toBeNull();
    expect(staleDismissTag({ exists: false, stale: true })).toBeNull();
    expect(staleDismissTag(null)).toBeNull();
  });

  it('a dismissal of the no-profile prompt does not hide the stale prompt for the same model+firmware', () => {
    const dismissed = new Set([dismissKey('FM3', '12.0')]); // user clicked Later while nothing was stored
    expect(isDismissed(dismissed, 'FM3', '12.0', none)).toBe(true);
    expect(isDismissed(dismissed, 'FM3', '12.0', stale(null))).toBe(false);
    // so the prompt logic re-offers: the stale status is shown although this device+firmware was dismissed
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, stale(null), isDismissed(dismissed, 'FM3', '12.0', stale(null)))).toBe(true);
  });

  it('dismissing the stale prompt hides exactly that stale state', () => {
    const dismissed = new Set([dismissKey('FM3', '12.0', staleDismissTag(stale(1)))]);
    expect(isDismissed(dismissed, 'FM3', '12.0', stale(1))).toBe(true);
    expect(shouldOfferDeviceDefs({ selfDescribe: true }, stale(1), isDismissed(dismissed, 'FM3', '12.0', stale(1)))).toBe(false);
    // a different stored schema, or a later schema bump, is a new state and prompts again
    expect(isDismissed(dismissed, 'FM3', '12.0', stale(null))).toBe(false);
    expect(isDismissed(dismissed, 'FM3', '12.0', stale(1, 3))).toBe(false);
    // another firmware / model is its own pair
    expect(isDismissed(dismissed, 'FM3', '13.0', stale(1))).toBe(false);
    expect(isDismissed(dismissed, 'FM9', '12.0', stale(1))).toBe(false);
  });

  it('the stale dismissal does not leak into the plain key once the profile is rebuilt', () => {
    const dismissed = new Set([dismissKey('FM3', '12.0', staleDismissTag(stale(1)))]);
    expect(isDismissed(dismissed, 'FM3', '12.0', usable)).toBe(false);
    expect(isDismissed(dismissed, 'FM3', '12.0', none)).toBe(false);
  });
});

// ── device-specific + reason-specific behaviour (pure; the store/prompt/panel are pinned below) ──
const GEN3 = { selfDescribe: true, cacheImport: true, fullCapture: true };
const AM4 = { selfDescribe: false, cacheImport: true };
const staleSt = (reason: 'missing' | 'outdated' | 'newer' = 'missing'): DeviceCacheStatus => ({
  key: 'k', exists: true, building: false, stale: true, staleReason: reason, currentSchema: 2, meta: { recordCount: 1, builtAt: null, schema: reason === 'missing' ? null : reason === 'newer' ? 3 : 1 }
});
const usableSt: DeviceCacheStatus = { key: 'k', exists: true, building: false, stale: false, currentSchema: 2, meta: { recordCount: 1, builtAt: null, schema: 2 } };
const noneSt: DeviceCacheStatus = { key: 'k', exists: false, building: false, currentSchema: 2 };

describe('effectiveStatus — stale only matters where stored profiles are applied (self-describe devices)', () => {
  it('keeps a stale status on a self-describing device', () => {
    expect(effectiveStatus(staleSt(), GEN3)?.stale).toBe(true);
  });

  it('drops the stale flag on an import-only device (AM4): its profile is not applied either way', () => {
    const eff = effectiveStatus(staleSt('outdated'), AM4);
    expect(eff?.stale).toBe(false);
    expect(eff?.staleReason).toBeUndefined();
    expect(eff?.exists).toBe(true); // otherwise untouched
    expect(effectiveStatus(staleSt(), null)?.stale).toBe(false);
  });

  it('leaves non-stale and absent statuses alone', () => {
    expect(effectiveStatus(usableSt, AM4)).toBe(usableSt);
    expect(effectiveStatus(noneSt, GEN3)).toBe(noneSt);
    expect(effectiveStatus(null, GEN3)).toBeNull();
  });

  it('an import-only device is not prompted for a stale profile (nothing to re-read), a self-describing one is', () => {
    expect(shouldOfferDeviceDefs(AM4, staleSt(), false)).toBe(false);
    expect(shouldOfferDeviceDefs(GEN3, staleSt(), false)).toBe(true);
    // ...while an import-only device with NOTHING stored keeps getting the normal offer
    expect(shouldOfferDeviceDefs(AM4, noneSt, false)).toBe(true);
  });
});

describe('staleCopy + activeDefsSource — a profile from a newer Axis is called that', () => {
  it('uses the "out of date" wording for missing and outdated schemas', () => {
    for (const r of ['missing', 'outdated', undefined] as const) {
      const c = staleCopy(r);
      expect(c.title).toMatch(/Re-read/);
      expect(c.sub).toMatch(/out of date/);
      expect(c.panel).toMatch(/out of date/);
    }
  });

  it('says "newer version of Axis" and that getting definitions replaces the saved ones', () => {
    const c = staleCopy('newer');
    expect(c.title).toMatch(/newer Axis/);
    expect(c.sub).toMatch(/newer version of Axis/);
    expect(c.sub).toMatch(/replaces/);
    expect(c.label).toMatch(/newer Axis/);
    expect(c.detail).toMatch(/newer version of Axis/);
    expect(c.panel).toMatch(/newer version of Axis/);
    expect(c.sub).not.toMatch(/out of date/);
  });

  it('the source readout follows the reason and stays bundled', () => {
    const newer = activeDefsSource(staleSt('newer'), null);
    expect(newer).toMatchObject({ origin: 'bundled', stale: true });
    expect(newer.label).toMatch(/newer Axis/);
    const old = activeDefsSource(staleSt('outdated'), null);
    expect(old).toMatchObject({ origin: 'bundled', stale: true });
    expect(old.label).toMatch(/out of date/);
  });
});

describe('cloudStaleNote — why no shared-profile option appears', () => {
  it('explains an unusable shared profile, by reason', () => {
    expect(cloudStaleNote({ available: false, stale: true, staleReason: 'outdated' })).toMatch(/out of date/);
    expect(cloudStaleNote({ available: false, stale: true, staleReason: 'missing' })).toMatch(/out of date/);
    expect(cloudStaleNote({ available: false, stale: true, staleReason: 'newer' })).toMatch(/newer version of Axis/);
  });

  it('says nothing when there is nothing to explain', () => {
    expect(cloudStaleNote(null)).toBeNull();
    expect(cloudStaleNote({ available: false })).toBeNull();
    expect(cloudStaleNote({ available: true })).toBeNull();
    expect(cloudStaleNote({ available: true, stale: true })).toBeNull(); // an offered profile needs no excuse
  });
});

describe('cloudPullFailureMessage — the way out depends on the device', () => {
  it('a generic failure stays generic', () => {
    expect(cloudPullFailureMessage(null, GEN3, false)).toBe('Could not fetch the shared definitions.');
    expect(cloudPullFailureMessage(503, GEN3, false)).toBe('Could not fetch the shared definitions.');
  });

  it('409 on a self-describing local session suggests reading from the device', () => {
    expect(cloudPullFailureMessage(409, GEN3, false)).toMatch(/can’t be used.*Read them from the device instead/);
  });

  it('409 on an import-only device (AM4) suggests importing an editor file, not a device read', () => {
    const m = cloudPullFailureMessage(409, AM4, false);
    expect(m).toMatch(/Import an editor definitions file instead/);
    expect(m).not.toMatch(/from the device/);
  });

  it('409 over a relay can read nothing from the device: no device read is suggested', () => {
    const m = cloudPullFailureMessage(409, GEN3, true);
    expect(m).not.toMatch(/from the device/);
    expect(m).toMatch(/can’t be used/);
    expect(cloudPullFailureMessage(409, null, false)).toMatch(/can’t be used/);
  });
});

describe('rebuildPlan — what "Re-read definitions" does', () => {
  it('discards and re-offers when a usable profile is stored (the firmware-update path)', () => {
    expect(rebuildPlan(usableSt, GEN3)).toBe('discard');
    expect(rebuildPlan(usableSt, AM4)).toBe('discard');
    expect(rebuildPlan(noneSt, GEN3)).toBe('discard');
    expect(rebuildPlan(null, GEN3)).toBe('discard');
  });

  it('starts the read directly for a stale (missing/outdated) profile on a device that can read', () => {
    expect(rebuildPlan(staleSt('missing'), GEN3)).toBe('build');
    expect(rebuildPlan(staleSt('outdated'), GEN3)).toBe('build');
  });

  it('only brings the prompt back for a stale profile on a device that cannot read definitions', () => {
    expect(rebuildPlan(staleSt('outdated'), AM4)).toBe('prompt');
  });

  it('never replaces a profile from a newer Axis in one click: the prompt (its copy says so) decides', () => {
    expect(rebuildPlan(staleSt('newer'), GEN3)).toBe('prompt');
    expect(rebuildPlan(staleSt('newer'), AM4)).toBe('prompt');
  });
});

describe('canAutoImportFromFolder — the silent connect-time re-import', () => {
  it('runs when nothing is stored (or the status is unknown) and the device can import', () => {
    expect(canAutoImportFromFolder(GEN3, noneSt)).toBe(true);
    expect(canAutoImportFromFolder(AM4, null)).toBe(true);
  });

  it('never runs without import support', () => {
    expect(canAutoImportFromFolder({ selfDescribe: true }, noneSt)).toBe(false);
    expect(canAutoImportFromFolder(null, noneSt)).toBe(false);
  });

  it('never runs over a usable profile', () => {
    expect(canAutoImportFromFolder(GEN3, usableSt)).toBe(false);
  });

  it('runs over a stale missing/outdated profile — that is what it is for', () => {
    expect(canAutoImportFromFolder(GEN3, staleSt('missing'))).toBe(true);
    expect(canAutoImportFromFolder(GEN3, staleSt('outdated'))).toBe(true);
  });

  it('does NOT run over a profile from a newer Axis (replacing it must not happen silently)', () => {
    expect(canAutoImportFromFolder(GEN3, staleSt('newer'))).toBe(false);
  });
});

describe('canRebuildDefs — when "Re-read definitions" is offered', () => {
  const bundled = { origin: 'bundled' as const, stale: false };
  const staleSrc = { origin: 'bundled' as const, stale: true };
  const inUse = { origin: 'device' as const, stale: false };

  it('is offered over a profile in use, local, on a device that can read or import', () => {
    expect(canRebuildDefs({ source: inUse, isRemote: false, caps: GEN3 })).toBe(true);
    expect(canRebuildDefs({ source: inUse, isRemote: false, caps: AM4 })).toBe(true);
  });

  it('is offered over a STALE profile although the readout is still "bundled"', () => {
    expect(canRebuildDefs({ source: staleSrc, isRemote: false, caps: GEN3 })).toBe(true);
  });

  it('is not offered with only the bundled definitions, over a relay, or without a way to re-acquire', () => {
    expect(canRebuildDefs({ source: bundled, isRemote: false, caps: GEN3 })).toBe(false);
    expect(canRebuildDefs({ source: inUse, isRemote: true, caps: GEN3 })).toBe(false);
    expect(canRebuildDefs({ source: staleSrc, isRemote: true, caps: GEN3 })).toBe(false);
    expect(canRebuildDefs({ source: inUse, isRemote: false, caps: {} })).toBe(false);
    expect(canRebuildDefs({ source: inUse, isRemote: false, caps: null })).toBe(false);
  });
});

describe('currentDismissKey', () => {
  it('is the plain key until the profile is stale, then the stale-tagged one', () => {
    expect(currentDismissKey('FM3', '12.0', noneSt)).toBe('fm3|12.0');
    expect(currentDismissKey('FM3', '12.0', usableSt)).toBe('fm3|12.0');
    expect(currentDismissKey('FM3', '12.0', null)).toBe('fm3|12.0');
    expect(currentDismissKey('FM3', '12.0', staleSt('outdated'))).toBe('fm3|12.0|stale:1>2');
    expect(currentDismissKey('FM3', '12.0', staleSt('missing'))).toBe('fm3|12.0|stale:none>2');
  });
});

// ── the runes store / prompt / panel are thin shells over the helpers above; pin that they use them (the
// store itself can't be imported in this node-only suite, same approach as saveTarget.test.ts) ──
describe('wiring (source pins)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const store = read('./deviceDefs.svelte.ts');
  const prompt = read('./DeviceDefsPrompt.svelte');
  const panel = read('./AxisPanel.svelte');
  /** Source of one class member: from its declaration to the next member at the same indent. */
  const member = (src: string, start: string): string => {
    const i = src.indexOf(start);
    expect(i, `${start} exists`).toBeGreaterThan(-1);
    const rest = src.slice(i + start.length);
    const next = rest.search(/\n  (?:get |#?\w+ = |\/\*\*)/);
    return start + (next === -1 ? rest : rest.slice(0, next));
  };

  it('the store takes the device-effective status (effectiveStatus) and feeds every decision from it', () => {
    expect(member(store, 'get #eff()')).toContain('effectiveStatus(this.status');
    expect(member(store, 'get key()')).toMatch(/currentDismissKey\([^)]*this\.#eff\)/);
    expect(member(store, 'get dismissed()')).toMatch(/isDismissed\([^)]*this\.#eff\)/);
    expect(member(store, 'get stale()')).toContain('isDefsStale(this.#eff)');
    expect(member(store, 'get shouldShow()')).toMatch(/shouldOfferDeviceDefs\([^)]*this\.#eff,/);
    expect(member(store, 'get activeSource()')).toContain('activeDefsSource(this.#eff,');
    expect(member(store, 'get staleCopy()')).toContain('staleCopy(this.#eff?.staleReason)');
    expect(member(store, 'get cloudNote()')).toContain('cloudStaleNote(this.cloud)');
  });

  it('no raw `this.status` reaches a decision helper', () => {
    for (const fn of ['shouldOfferDeviceDefs', 'activeDefsSource', 'isDefsStale', 'currentDismissKey', 'isDismissed', 'rebuildPlan', 'canAutoImportFromFolder']) {
      for (const m of store.matchAll(new RegExp(`\\b${fn}\\(([^)]*)\\)`, 'g'))) expect(m[1], `${fn}(${m[1]})`).not.toMatch(/this\.status\b/);
    }
  });

  it('dismissing and un-dismissing act on the current (stale-aware) key', () => {
    expect(member(store, 'dismiss = ()')).toContain('this.key');
    expect(member(store, 'rebuild = async ()')).toContain('this.#undismiss(this.key)');
  });

  it('canRebuild goes through canRebuildDefs with the active source, relay state and caps', () => {
    const m = member(store, 'get canRebuild()');
    expect(m).toContain('canRebuildDefs(');
    expect(m).toContain('source: this.activeSource');
    expect(m).toContain('isRemote: isRemote()');
    expect(m).toContain('caps:');
  });

  it('rebuild decides by rebuildPlan BEFORE it deletes anything, and only the discard plan deletes', () => {
    const m = member(store, 'rebuild = async ()');
    const plan = m.indexOf('rebuildPlan(this.#eff');
    const del = m.indexOf('forgefx.deleteDeviceCache');
    expect(plan).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(plan);
    expect(m).toMatch(/if \(plan !== 'discard'\) \{[^}]*return;/s);
    expect(m).toMatch(/if \(plan === 'build'\) await this\.build\(\)/);
  });

  it('the silent folder re-import is gated by canAutoImportFromFolder on the effective status', () => {
    expect(member(store, '#tryPersistedFolder = async ()')).toMatch(/!canAutoImportFromFolder\([^)]*this\.#eff\)\) return/);
  });

  it('a failed shared-profile pull is worded by cloudPullFailureMessage (status, caps, relay)', () => {
    const m = member(store, 'cloudPull = async ()');
    expect(m).toMatch(/cloudPullFailureMessage\(e instanceof ForgeError \? e\.status : null, [^,]*caps[^,]*, isRemote\(\)\)/);
    expect(m).not.toContain('Read them from the device'); // copy lives in the helper only
  });

  it('the prompt and the panel take their stale copy from the store (staleCopy), and the prompt shows the cloud note', () => {
    expect(prompt).toContain('{deviceDefs.staleCopy.title}');
    expect(prompt).toContain('{deviceDefs.staleCopy.sub}');
    expect(prompt).toContain('{#if deviceDefs.cloudNote}');
    expect(panel).toContain('{deviceDefs.staleCopy.panel}');
    expect(panel).toContain('deviceDefs.canRebuild');
  });
});
