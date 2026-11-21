import { describe, expect, it } from 'vitest';
import {
  buildDetailBlockCards,
  detailParams,
  encodeDragPayload,
  fmtNum,
  fmtVal,
  matchParamCond,
  matchedKeys,
  paramDragPayload,
  parseDragPayload,
  type DetailBlock
} from '../presetBrowser/presetBrowserWorkbenchParams';
import type { AxisPbCond } from '../presetBrowser/presetBrowserWorkbenchQuery';

const p = (over: Partial<DetailBlock['params'][number]> = {}): DetailBlock['params'][number] => ({
  paramId: 1,
  name: 'GAIN',
  label: 'Gain',
  kind: 'float',
  value: 7,
  enumLabel: null,
  ...over
});

const block = (over: Partial<DetailBlock> = {}): DetailBlock => ({
  slug: 'amp',
  effectId: 100,
  instance: 1,
  typeName: 'USA Clean',
  params: [p()],
  ...over
});

describe('Preset Browser detail params', () => {
  it('formats numeric + enum + unit values', () => {
    expect(fmtNum(7)).toBe('7');
    expect(fmtNum(7.25)).toBe('7.3');
    expect(fmtVal({ value: 7, enumLabel: null })).toBe('7');
    expect(fmtVal({ value: 7, enumLabel: null, unit: 'dB' })).toBe('7 dB');
    expect(fmtVal({ value: null, enumLabel: 'Large Hall' })).toBe('Large Hall');
    expect(fmtVal({ value: null, enumLabel: null })).toBe('—');
  });

  it('shows unit symbols, never raw catalog codes (percent, knob_0_10, semitones, bipolar_percent …)', () => {
    expect(fmtVal({ value: 5, enumLabel: null, unit: 'percent' })).toBe('5%');
    expect(fmtVal({ value: -12, enumLabel: null, unit: 'bipolar_percent' })).toBe('-12%');
    expect(fmtVal({ value: 5, enumLabel: null, unit: 'knob_0_10' })).toBe('5');
    expect(fmtVal({ value: 5, enumLabel: null, unit: 'knob_0_20' })).toBe('5');
    expect(fmtVal({ value: 7, enumLabel: null, unit: 'semitones' })).toBe('7 st');
    expect(fmtVal({ value: 4, enumLabel: null, unit: 'db' })).toBe('4 dB');
    expect(fmtVal({ value: 440, enumLabel: null, unit: 'hz' })).toBe('440 Hz');
    expect(fmtVal({ value: 120, enumLabel: null, unit: 'ms' })).toBe('120 ms');
    expect(fmtVal({ value: 2, enumLabel: null, unit: 'seconds' })).toBe('2 s');
    expect(fmtVal({ value: 4, enumLabel: null, unit: 'ratio' })).toBe('4 :1');
    expect(fmtVal({ value: 45, enumLabel: null, unit: 'degrees' })).toBe('45 °');
    // the unitless / selector codes the listing already hid stay hidden
    for (const unit of ['numeric', 'count', 'enum', 'unverified', '']) {
      expect(fmtVal({ value: 5, enumLabel: null, unit })).toBe('5');
    }
    // unknown device-true tokens still render verbatim, and symbols are left alone
    expect(fmtVal({ value: 12, enumLabel: null, unit: 'dB/OCT' })).toBe('12 dB/OCT');
    expect(fmtVal({ value: 5, enumLabel: null, unit: '%' })).toBe('5%');
    // an enum label wins over any unit
    expect(fmtVal({ value: 1, enumLabel: 'ON', unit: 'percent' })).toBe('ON');
  });

  it('the detail cards carry the symbol, not the code', () => {
    const cards = buildDetailBlockCards(
      [block({ params: [p({ paramId: 1, label: 'Mix', value: 5, unit: 'percent' }), p({ paramId: 2, label: 'Drive', value: 6.5, unit: 'knob_0_10' })] })],
      [],
      null
    );
    expect(cards[0]!.cells.map((c) => c.value)).toEqual(['5%', '6.5']);
  });

  it('detailParams skips zero/default noise and caps at 12', () => {
    const b = block({
      params: [
        p({ paramId: 1, value: 7 }),
        p({ paramId: 2, value: 0 }), // dropped (default noise)
        p({ paramId: 3, value: null, enumLabel: 'On' }) // kept (enum)
      ]
    });
    expect(detailParams(b).map((x) => x.paramId)).toEqual([1, 3]);
  });

  it('matchParamCond matches enum substring and numeric compare + type suffix', () => {
    const b = block({
      params: [
        p({ paramId: 1, name: 'AMP_TYPE', label: 'Type', kind: 'enum', value: null, enumLabel: 'USA Clean' }),
        p({ paramId: 2, name: 'GAIN', label: 'Gain', value: 5 })
      ]
    });
    expect(matchParamCond(b, { name: 'Type', op: '=', val: 'usa' })).toBe(true);
    expect(matchParamCond(b, { name: 'Type', op: '!=', val: 'brit' })).toBe(true);
    expect(matchParamCond(b, { name: 'Gain', op: '>', val: '3' })).toBe(true);
    expect(matchParamCond(b, { name: 'Gain', op: '<', val: '3' })).toBe(false);
  });

  it('matchedKeys highlights params matched by an active block cond', () => {
    const blocks = [block({ params: [p({ paramId: 5, label: 'Gain', value: 8 })] })];
    const conds: AxisPbCond[] = [{ kind: 'block', block: 'amp', params: [{ name: 'Gain', op: '>', val: '5' }] }];
    expect(matchedKeys(blocks, conds)).toEqual(new Set(['0:5']));
  });

  it('paramDragPayload encodes enum vs numeric', () => {
    expect(paramDragPayload('reverb', p({ label: 'Type', value: null, enumLabel: 'Large Hall' }))).toEqual({
      slug: 'reverb',
      label: 'Type',
      op: '=',
      val: 'Large Hall'
    });
    expect(paramDragPayload('amp', p({ label: 'Gain', value: 7.24 }))).toEqual({ slug: 'amp', label: 'Gain', op: '=', val: '7.2' });
  });

  it('drag payload codec round-trips and rejects foreign data', () => {
    const encoded = encodeDragPayload({ slug: 'amp', label: 'Gain', op: '>', val: '7' });
    expect(parseDragPayload(encoded)).toEqual({ slug: 'amp', label: 'Gain', op: '>', val: '7' });
    expect(parseDragPayload(null)).toBeNull();
    expect(parseDragPayload('not json')).toBeNull();
    expect(parseDragPayload('{"foo":1}')).toBeNull();
  });

  it('buildDetailBlockCards excludes IO, respects focus, and marks hits', () => {
    const blocks = [
      block({ slug: 'input', effectId: 1, params: [p({ value: 5 })] }),
      block({ slug: 'amp', effectId: 100, params: [p({ paramId: 9, label: 'Gain', value: 8 })] }),
      block({ slug: 'reverb', effectId: 200, params: [p({ paramId: 3, label: 'Mix', value: 40 })] })
    ];
    const conds: AxisPbCond[] = [{ kind: 'block', block: 'amp', params: [{ name: 'Gain', op: '>', val: '5' }] }];
    const all = buildDetailBlockCards(blocks, conds, null);
    expect(all.map((c) => c.slug)).toEqual(['amp', 'reverb']); // input excluded
    expect(all[0].cells[0].hit).toBe(true);
    expect(all[0].instanceLabel).toBe('#1');
    // focus restricts to the amp effectId
    const focused = buildDetailBlockCards(blocks, conds, 100);
    expect(focused.map((c) => c.slug)).toEqual(['amp']);
  });

  it('amp channel yields a Ch label', () => {
    const cards = buildDetailBlockCards([block({ channel: 1, params: [p({ value: 5 })] })], [], null);
    expect(cards[0].instanceLabel).toBe('Ch B');
  });
});
