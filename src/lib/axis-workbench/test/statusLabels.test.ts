import { describe, expect, it } from 'vitest';
import { axisConnectionLabel, axisPresetDisplayName } from '../widgets/statusLabels';

describe('axisPresetDisplayName', () => {
  it('shows the live preset name', () => {
    expect(axisPresetDisplayName('Clean Machine', 'online')).toBe('Clean Machine');
  });

  it('shows an em dash while online before a name is known (never a debug placeholder)', () => {
    expect(axisPresetDisplayName(undefined, 'online')).toBe('—');
    expect(axisPresetDisplayName('', 'online')).toBe('—');
    expect(axisPresetDisplayName(null, 'online')).not.toBe('DEBUG');
  });

  it('shows "offline" while connecting or offline', () => {
    expect(axisPresetDisplayName(undefined, 'offline')).toBe('offline');
    expect(axisPresetDisplayName(undefined, 'connecting')).toBe('offline');
  });
});

describe('axisConnectionLabel', () => {
  it('names the connected device and its firmware', () => {
    expect(axisConnectionLabel({ state: 'online', device: 'FM3', fw: '12.00' })).toBe('FM3 · FW12.00');
    expect(axisConnectionLabel({ state: 'online', device: 'AM4', fw: '2.00' })).toBe('AM4 · FW2.00');
  });

  it('never shows a hard-coded device name', () => {
    expect(axisConnectionLabel({ state: 'online', fw: '12.00' })).toBe('FW12.00');
    expect(axisConnectionLabel({ state: 'online', device: 'FM9', fw: '7.00' })).not.toContain('AX-3');
  });

  it('falls back to the device alone, then to "online"', () => {
    expect(axisConnectionLabel({ state: 'online', device: 'VP4' })).toBe('VP4');
    expect(axisConnectionLabel({ state: 'online', device: '  ' })).toBe('online');
    expect(axisConnectionLabel({ state: 'online' })).toBe('online');
  });

  it('shows the bare state while not online', () => {
    expect(axisConnectionLabel({ state: 'connecting' })).toBe('connecting');
    expect(axisConnectionLabel({ state: 'offline', device: 'FM3', fw: '12.00' })).toBe('offline');
  });
});
