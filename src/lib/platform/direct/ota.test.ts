import { describe, it, expect, vi } from 'vitest';

// ota.ts imports the native plugins at module scope; stub them so the pure compat helpers load in a
// plain node test without a Capacitor runtime.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/app', () => ({ App: {} }));
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: {} }));

import { cmpVersion, isCompatible } from './ota';

describe('cmpVersion', () => {
  it('orders by numeric core', () => {
    expect(cmpVersion('1.0.0', '1.0.0')).toBe(0);
    expect(cmpVersion('1.2.0', '1.10.0')).toBe(-1); // numeric, not lexical
    expect(cmpVersion('2.0.0', '1.9.9')).toBe(1);
    expect(cmpVersion('1.1', '1.1.0')).toBe(0); // missing parts treated as 0
  });

  it('ignores pre-release / build suffixes', () => {
    expect(cmpVersion('0.8.0-beta+42', '0.8.0')).toBe(0);
    expect(cmpVersion('0.8.1-beta', '0.8.0')).toBe(1);
  });
});

describe('isCompatible — the OTA native-version gate', () => {
  it('accepts a bundle whose minNative <= installed native', () => {
    expect(isCompatible('1.2.0', '1.0.0')).toBe(true);
    expect(isCompatible('1.0.0', '1.0.0')).toBe(true); // equal is compatible
  });

  it('rejects a bundle that needs a newer native app than is installed', () => {
    expect(isCompatible('0.9.0', '1.0.0')).toBe(false);
    expect(isCompatible('0.8.0-beta', '0.8.1')).toBe(false);
  });
});
