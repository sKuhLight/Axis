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
