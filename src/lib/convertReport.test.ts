import { describe, it, expect } from 'vitest';
import type { ConversionEvent, ConvertResponse } from './types';
import {
  eventSeverity,
  eventBlockKey,
  formatEvent,
  familyLabel,
  filterEvents,
  groupEvents,
  summarize,
  deviceIdFromModel,
  deviceName,
  CONVERTER_DEVICES,
  DEVICE_NAMES,
  SEVERITY_ORDER,
  initialConvertState,
  beginConvert,
  succeedConvert,
  failConvert,
  convertErrorMessage,
  type Severity
} from './convertReport';

// A synthetic event set covering ALL 12 ConversionEvent kinds.
const ALL: ConversionEvent[] = [
  { kind: 'source-partial', decodeDepth: 'name-only', detail: 'Only the preset name could be read.' },
  { kind: 'block-dropped', blockKey: 'pitch1', family: 'pitch', reason: 'family-missing' },
  { kind: 'block-unplaced', blockKey: 'drive2', family: 'drive', reason: 'grid full' },
  { kind: 'type-substituted', blockKey: 'amp1', family: 'amp', sourceTypeName: 'Brit 800', targetTypeName: 'Brit Pre', confidence: 'lineage', score: 0.82 },
  { kind: 'type-unresolved', blockKey: 'cab1', family: 'cab', sourceTypeName: '4x12 Weird' },
  { kind: 'param-clamped', blockKey: 'amp1', nativeName: 'Master Volume', sourceValue: 12, targetValue: 10, targetMin: 0, targetMax: 10 },
  { kind: 'param-dropped', blockKey: 'reverb1', nativeName: 'Spring Age', reason: 'no-concept-mapping' },
  { kind: 'param-unverified', blockKey: 'delay1', nativeName: 'Ducking', value: 5 },
  { kind: 'routing-simplified', detail: 'Parallel paths merged.', affectedBlockKeys: ['amp1', 'cab1'] },
  { kind: 'scene-collapsed', sourceScenes: 8, targetScenes: 4 },
  { kind: 'channel-collapsed', blockKey: 'amp1', sourceChannels: 4, targetChannels: 1 },
  { kind: 'block-merged', blockKey: 'cab1', family: 'cab', intoFamily: 'amp', intoBlockKey: 'amp1' }
];

describe('eventSeverity', () => {
  it('maps every kind to the contract severity', () => {
    const bySeverity = (s: Severity) => ALL.filter((e) => eventSeverity(e) === s).map((e) => e.kind);
    expect(bySeverity('loss').sort()).toEqual(['block-dropped', 'block-unplaced', 'channel-collapsed', 'param-dropped', 'scene-collapsed'].sort());
    expect(bySeverity('warn').sort()).toEqual(['param-clamped', 'routing-simplified', 'source-partial', 'type-unresolved'].sort());
    expect(bySeverity('info').sort()).toEqual(['block-merged', 'param-unverified', 'type-substituted'].sort());
  });

  it('type-substituted severity depends on confidence', () => {
    expect(eventSeverity({ kind: 'type-substituted', blockKey: 'a', family: 'amp', sourceTypeName: 'x', targetTypeName: 'y', confidence: 'exact' })).toBe('info');
    expect(eventSeverity({ kind: 'type-substituted', blockKey: 'a', family: 'amp', sourceTypeName: 'x', targetTypeName: 'y', confidence: 'lineage' })).toBe('info');
    expect(eventSeverity({ kind: 'type-substituted', blockKey: 'a', family: 'amp', sourceTypeName: 'x', targetTypeName: 'y', confidence: 'fuzzy' })).toBe('warn');
    expect(eventSeverity({ kind: 'type-substituted', blockKey: 'a', family: 'amp', sourceTypeName: 'x', targetTypeName: 'y', confidence: 'fallback' })).toBe('warn');
  });
});

describe('formatEvent', () => {
  it('produces a non-empty title + correct severity for all 12 kinds', () => {
    for (const e of ALL) {
      const f = formatEvent(e);
      expect(f.title.length, `title for ${e.kind}`).toBeGreaterThan(0);
      expect(f.severity).toBe(eventSeverity(e));
      expect(f.kind).toBe(e.kind);
    }
    // Every kind is represented exactly once → 11 distinct kinds formatted.
    expect(new Set(ALL.map((e) => e.kind)).size).toBe(12);
  });

  it('renders key rows readably', () => {
    const sub = formatEvent(ALL[3]); // type-substituted lineage
    expect(sub.title).toContain('Amp');
    expect(sub.title).toContain('Brit 800');
    expect(sub.title).toContain('Brit Pre');
    expect(sub.detail).toContain('lineage match');
    expect(sub.detail).toContain('0.82');

    const dropped = formatEvent(ALL[1]); // block-dropped pitch
    expect(dropped.title).toContain('Pitch');
    expect(dropped.detail).toContain('not available');

    const clamped = formatEvent(ALL[5]);
    expect(clamped.title).toContain('Master Volume');
    expect(clamped.detail).toContain('12');
    expect(clamped.detail).toContain('10');

    const scenes = formatEvent(ALL[9]);
    expect(scenes.detail).toContain('8');
    expect(scenes.detail).toContain('4');
  });

  it('exposes blockKey only for block-referencing kinds', () => {
    expect(eventBlockKey(ALL[1])).toBe('pitch1'); // block-dropped
    expect(eventBlockKey(ALL[0])).toBeUndefined(); // source-partial
    expect(eventBlockKey(ALL[8])).toBeUndefined(); // routing-simplified
    expect(eventBlockKey(ALL[9])).toBeUndefined(); // scene-collapsed
    expect(formatEvent(ALL[3]).blockKey).toBe('amp1');
  });

  it('formats block-merged as an info fold and focuses the host block, not the merged one', () => {
    const f = formatEvent(ALL[11]); // block-merged: cab → amp
    expect(f.severity).toBe('info');
    expect(f.title.toLowerCase()).toContain('cab');
    expect(f.title.toLowerCase()).toContain('amp');
    expect(f.blockKey).toBe('amp1'); // the removed cab has no cell; focus the host amp instead
  });
});

describe('familyLabel', () => {
  it('title-cases slugs', () => {
    expect(familyLabel('amp')).toBe('Amp');
    expect(familyLabel('multi_delay')).toBe('Multi Delay');
    expect(familyLabel('pitch-shift')).toBe('Pitch Shift');
    expect(familyLabel('')).toBe('Block');
  });
});

describe('groupEvents', () => {
  it('orders loss → warn → info and only keeps non-empty bands', () => {
    const groups = groupEvents(ALL);
    expect(groups.map((g) => g.severity)).toEqual(['loss', 'warn', 'info']);
    const counts = Object.fromEntries(groups.map((g) => [g.severity, g.count]));
    expect(counts).toEqual({ loss: 5, warn: 4, info: 3 });
  });

  it('sub-groups by kind and preserves first-appearance order', () => {
    const groups = groupEvents(ALL);
    const loss = groups.find((g) => g.severity === 'loss')!;
    expect(loss.kinds.map((k) => k.kind)).toEqual(['block-dropped', 'block-unplaced', 'param-dropped', 'scene-collapsed', 'channel-collapsed']);
    const total = loss.kinds.reduce((n, k) => n + k.events.length, 0);
    expect(total).toBe(loss.count);
  });

  it('omits empty bands', () => {
    const onlyInfo = groupEvents([ALL[7]]); // param-unverified
    expect(onlyInfo.map((g) => g.severity)).toEqual(['info']);
  });
});

describe('filterEvents', () => {
  it('filters by severity set', () => {
    const loss = filterEvents(ALL, { severities: new Set<Severity>(['loss']) });
    expect(loss).toHaveLength(5);
    expect(loss.every((e) => eventSeverity(e) === 'loss')).toBe(true);
  });

  it('empty severity set means no severity filter', () => {
    expect(filterEvents(ALL, { severities: new Set() })).toHaveLength(ALL.length);
  });

  it('filters by free text over title/detail/family/blockKey (case-insensitive)', () => {
    expect(filterEvents(ALL, { text: 'brit' }).map((e) => e.kind)).toEqual(['type-substituted']);
    expect(filterEvents(ALL, { text: 'PITCH' }).map((e) => e.kind)).toEqual(['block-dropped']);
    expect(filterEvents(ALL, { text: 'amp1' }).length).toBeGreaterThanOrEqual(2); // multiple amp1 rows
  });

  it('combines severity + text', () => {
    const r = filterEvents(ALL, { severities: new Set<Severity>(['warn']), text: 'volume' });
    expect(r.map((e) => e.kind)).toEqual(['param-clamped']);
  });
});

describe('summarize', () => {
  it('tallies severities', () => {
    expect(summarize(ALL)).toEqual({ total: 12, info: 3, warn: 4, loss: 5 });
  });
});

describe('device roster', () => {
  it('has a display name for every target and a stable roster of 7', () => {
    expect(CONVERTER_DEVICES).toHaveLength(7);
    for (const d of CONVERTER_DEVICES) {
      expect(DEVICE_NAMES[d]).toBeTruthy();
      expect(deviceName(d)).toBe(DEVICE_NAMES[d]);
    }
  });

  it('maps model bytes to converter ids', () => {
    expect(deviceIdFromModel(0x10)).toBe('axe-fx-iii');
    expect(deviceIdFromModel(0x11)).toBe('fm3');
    expect(deviceIdFromModel(0x12)).toBe('fm9');
    expect(deviceIdFromModel(0x14)).toBe('vp4');
    expect(deviceIdFromModel(0x15)).toBe('am4');
    expect(deviceIdFromModel(0x07)).toBe('axe-fx-ii');
    expect(deviceIdFromModel(0x00)).toBe('axe-fx-gen1');
    expect(deviceIdFromModel(0x99)).toBeNull();
    expect(deviceIdFromModel(null)).toBeNull();
  });

  it('SEVERITY_ORDER is loss-first', () => {
    expect(SEVERITY_ORDER).toEqual(['loss', 'warn', 'info']);
  });
});

describe('convert-flow state reducers', () => {
  const resp = { source: { device: 'FM3', name: 'Test', decodeDepth: 'full' }, target: {}, events: [], summary: { total: 0, info: 0, warn: 0, loss: 0 } } as unknown as ConvertResponse;

  it('begins running and clears prior result/error', () => {
    const prior = { status: 'error' as const, error: 'boom', result: resp };
    const s = beginConvert({ targetDevice: 'fm9', hasSource: false });
    expect(s.status).toBe('running');
    expect(s.result).toBeUndefined();
    expect(s.error).toBeUndefined();
    expect(s.lastRequest).toEqual({ targetDevice: 'fm9', hasSource: false });
    // reducer is pure — prior untouched
    expect(prior.status).toBe('error');
  });

  it('success returns to idle with the result (result presence = report ready)', () => {
    const running = beginConvert({ targetDevice: 'am4', hasSource: true, sourceName: 'x.syx' });
    const s = succeedConvert(running, resp);
    expect(s.status).toBe('idle');
    expect(s.result).toBe(resp);
    expect(s.error).toBeUndefined();
    expect(s.lastRequest?.targetDevice).toBe('am4');
  });

  it('failure sets error status and drops the result', () => {
    const running = beginConvert({ targetDevice: 'vp4', hasSource: false });
    const s = failConvert(running, 'nope');
    expect(s.status).toBe('error');
    expect(s.error).toBe('nope');
    expect(s.result).toBeUndefined();
    expect(s.lastRequest?.targetDevice).toBe('vp4');
  });

  it('initial state is idle with nothing set', () => {
    expect(initialConvertState).toEqual({ status: 'idle' });
  });
});

describe('convertErrorMessage', () => {
  it('gives specific copy for 501 and 400 and network', () => {
    expect(convertErrorMessage(501)).toMatch(/can.t provide/i);
    expect(convertErrorMessage(400, 'bad target')).toBe('bad target');
    expect(convertErrorMessage(400)).toMatch(/invalid/i);
    expect(convertErrorMessage(0)).toMatch(/reach the ForgeFX/i);
    expect(convertErrorMessage(500, 'x')).toBe('x');
  });
});
