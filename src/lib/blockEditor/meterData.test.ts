import { describe, expect, it } from 'vitest';
import { buildCatalog, viewsByKey } from './catalog';
import { controlMeterReadings } from './meterData';
import type { DeviceLayout, LiveMonitor } from '../types';

const layout: DeviceLayout = { family: 'TEST', pages: [{ name: 'Main', rows: [{ controls: [
  { label: 'Level', paramId: 7, paramName: 'TEST_LEVEL', widget: 'meter' },
  { label: 'Other', paramId: 9, paramName: 'OTHER_LEVEL', widget: 'meter', crossBlock: { effect: 'ID_OTHER1', family: 'OTHER', paramId: 9, paramName: 'OTHER_LEVEL' } }
] }], pageControls: [{ label: 'Envelope', paramId: 8, paramName: 'TEST_ENV', widget: 'meter' }] }] };
const catalog = () => buildCatalog({ layout, params: [{ id: 7, name: 'Level' }, { id: 9, name: 'Gain' }], enums: [{ id: 8, name: 'Envelope', options: [{ value: 0, label: '0' }, { value: 1, label: '1' }] }] });
const live: LiveMonitor = { effectId: 1, family: 'TEST', paramName: 'TEST_LEVEL', role: 'gainReduction', norm: 0.8, db: -3 };

describe('served parameter meters', () => {
  it('classifies row and page meters read-only while preserving persisted keys and ignoring foreign ids', () => {
    const cat = catalog();
    expect(cat.find((c) => c.key === 'k7')).toMatchObject({ kind: 'meter', meterParamName: 'TEST_LEVEL' });
    expect(cat.find((c) => c.key === 'e8')).toMatchObject({ kind: 'meter', meterParamName: 'TEST_ENV' });
    expect(viewsByKey(cat).get('k7')).toEqual(['meter']);
    expect(viewsByKey(cat).get('e8')).toEqual(['meter']);
    expect(cat.find((c) => c.key === 'k9')?.kind).toBe('cont');
  });
  it('uses the matching live symbol and never substitutes another meter', () => {
    const ctl = catalog()[0];
    expect(controlMeterReadings(ctl, [live], true)).toEqual([live]);
    expect(controlMeterReadings(ctl, [{ ...live, paramName: 'UNRELATED' }], true)).toEqual([null]);
    expect(controlMeterReadings(ctl, [live], false)).toEqual([null]);
  });
  it('only uses explicitly normalized named readings as a fallback', () => {
    const ctl = catalog()[0];
    expect(controlMeterReadings(ctl, [], true, { id: 7, name: 'Level', value: 0.5 })).toEqual([null]);
    expect(controlMeterReadings(ctl, [], true, { id: 7, name: 'Level', value: -6, norm: 0.5, unit: 'dB' })).toEqual([{ paramName: 'TEST_LEVEL', role: 'value', norm: 0.5, db: -6 }]);
  });
});
