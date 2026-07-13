import { describe, expect, it } from 'vitest';
import {
  deviceDefsActions,
  shouldOfferDeviceDefs,
  activeDefsSource,
  dismissKey,
  parseEditorCacheName,
  normalizeModelHex,
  parseFirmware,
  matchEditorCacheFile,
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
});
