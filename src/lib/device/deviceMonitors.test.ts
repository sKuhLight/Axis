import { describe, it, expect } from 'vitest';
import { monitorsByFamily } from './deviceMonitors';

describe('monitorsByFamily — pid scoping', () => {
  // Shape mirrors GET /preset/monitors.
  const table = {
    INPUT_GAINMONITOR: { family: 'INPUT', pid: 8, role: 'level', minDb: -60, maxDb: 0, widgetConfirmed: true },
    DISTORT_VCCMON: { family: 'DISTORT', pid: 120, role: 'supply', widgetConfirmed: true },
    DISTORT_VPLATEMON: { family: 'DISTORT', pid: 132, role: 'headroom', minDb: -20, maxDb: 0, widgetConfirmed: true },
    CABINET_VUMETER: { family: 'CABINET', pid: 61, role: 'vu', minDb: -40, maxDb: 20, widgetConfirmed: true }
  };

  it('returns only the requested family, keyed by pid, carrying the device token', () => {
    const m = monitorsByFamily(table, 'DISTORT');
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([120, 132]);
    expect(m.get(132)!.token).toBe('DISTORT_VPLATEMON');
    expect(m.get(132)!.role).toBe('headroom');
  });

  // THE regression that matters: pids repeat across families. Amp pid 8 is `Bass 1`; INPUT pid 8 is a
  // level monitor. A pid-only match would render Bass as a read-only meter.
  it('does NOT leak another family pid (amp pid 8 is `Bass 1`, not INPUT_GAINMONITOR)', () => {
    expect(monitorsByFamily(table, 'DISTORT').has(8)).toBe(false);
    expect(monitorsByFamily(table, 'INPUT').has(8)).toBe(true);
    // pid 61 is CABINET_VUMETER in CABINET but `Freq 1` in the delay block.
    expect(monitorsByFamily(table, 'DELAY').has(61)).toBe(false);
  });

  it('is empty for an unknown family or a missing table', () => {
    expect(monitorsByFamily(table, 'REVERB').size).toBe(0);
    expect(monitorsByFamily(null, 'DISTORT').size).toBe(0);
    expect(monitorsByFamily(table, null).size).toBe(0);
  });

  it('keeps a null dB range intact (5 of 16 monitors report none)', () => {
    const supply = monitorsByFamily(table, 'DISTORT').get(120)!;
    expect(supply.minDb).toBeUndefined();
    expect(supply.maxDb).toBeUndefined();
  });
});
