import { describe, expect, it } from 'vitest';
import {
  buildDetailBlockCards,
  detailKind,
  detailParams,
  encodeDragPayload,
  fmtNum,
  fmtVal,
  matchParamCond,
  parseDragPayload,
  type DetailBlock
} from '../presetBrowser/presetBrowserWorkbenchParams';

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

describe('Preset Browser detail kinds', () => {
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

  it('drag payload codec round-trips and rejects foreign data', () => {
    const encoded = encodeDragPayload({ slug: 'amp', label: 'Gain', op: '>', val: '7' });
    expect(parseDragPayload(encoded)).toEqual({ slug: 'amp', label: 'Gain', op: '>', val: '7' });
    expect(parseDragPayload(null)).toBeNull();
    expect(parseDragPayload('not json')).toBeNull();
    expect(parseDragPayload('{"foo":1}')).toBeNull();
  });

  it('detailKind prefers typeName, then the type param, else empty', () => {
    expect(detailKind(block())).toBe('USA Clean');
    expect(
      detailKind(
        block({
          typeName: null,
          params: [p({ name: 'AMP_TYPE', label: 'Type', kind: 'enum', value: null, enumLabel: 'Brit 800' })]
        })
      )
    ).toBe('Brit 800');
    expect(detailKind(block({ typeName: null, params: [p()] }))).toBe('');
  });

  it('buildDetailBlockCards excludes IO and respects focus', () => {
    const blocks = [
      block({ slug: 'input', effectId: 1 }),
      block({ slug: 'amp', effectId: 100 }),
      block({ slug: 'reverb', effectId: 200, typeName: 'Large Hall' })
    ];
    const all = buildDetailBlockCards(blocks, null);
    expect(all.map((c) => c.slug)).toEqual(['amp', 'reverb']); // input excluded
    expect(all[0].kinds).toEqual([{ label: 'Ch A', value: 'USA Clean' }]);
    expect(all[1].kinds).toEqual([{ label: 'Ch A', value: 'Large Hall' }]);
    // focus restricts to the amp effectId
    const focused = buildDetailBlockCards(blocks, 100);
    expect(focused.map((c) => c.slug)).toEqual(['amp']);
  });

  it('lists a channel row for every block, even single-channel families (drive)', () => {
    const cards = buildDetailBlockCards([block({ slug: 'drive', effectId: 10, typeName: 'T808 OD' })], null);
    expect(cards[0].category).toBe('Drive');
    expect(cards[0].kinds).toEqual([{ label: 'Ch A', value: 'T808 OD' }]);
  });

  it('collapses amp channels into one card with per-channel kinds', () => {
    const blocks = [
      block({ effectId: 100, channel: 0, typeName: 'USA Clean' }),
      block({ effectId: 100, channel: 1, typeName: 'Brit 800' }),
      block({ effectId: 100, channel: 3, typeName: 'Hipower' }),
      block({ effectId: 100, channel: 2, typeName: 'PVH 6160' })
    ];
    const cards = buildDetailBlockCards(blocks, null);
    expect(cards.length).toBe(1);
    expect(cards[0].instanceLabel).toBe('#1');
    expect(cards[0].kinds).toEqual([
      { label: 'Ch A', value: 'USA Clean' },
      { label: 'Ch B', value: 'Brit 800' },
      { label: 'Ch C', value: 'PVH 6160' },
      { label: 'Ch D', value: 'Hipower' }
    ]);
  });

  it('keeps distinct placed instances apart', () => {
    const cards = buildDetailBlockCards(
      [
        block({ slug: 'drive', effectId: 10, instance: 1, typeName: 'T808' }),
        block({ slug: 'drive', effectId: 11, instance: 2, typeName: 'OCD' })
      ],
      null
    );
    expect(cards.map((c) => c.instanceLabel)).toEqual(['#1', '#2']);
    expect(cards.map((c) => c.kinds[0].value)).toEqual(['T808', 'OCD']);
  });
});
