import { describe, expect, it } from 'vitest';
import {
  buildDetailBlockCards,
  cabSections,
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

  it('collapses every non-amp family’s channels too, not just the amp’s', () => {
    const blocks = [
      block({ slug: 'delay', effectId: 300, channel: 0, typeName: 'Stereo Tape' }),
      block({ slug: 'delay', effectId: 300, channel: 1, typeName: 'Digital Mono' }),
      block({ slug: 'delay', effectId: 300, channel: 2, typeName: 'Plex Delay' }),
      block({ slug: 'delay', effectId: 300, channel: 3, typeName: 'Tape Echo' })
    ];
    const cards = buildDetailBlockCards(blocks, null);
    expect(cards.length).toBe(1);
    expect(cards[0].category).toBe('Delay');
    expect(cards[0].kinds.map((k) => k.value)).toEqual(['Stereo Tape', 'Digital Mono', 'Plex Delay', 'Tape Echo']);
    expect(cards[0].kinds.map((k) => k.label)).toEqual(['Ch A', 'Ch B', 'Ch C', 'Ch D']);
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

// ── Cab slot sections (Option 5) ─────────────────────────────────────────────────────────────────
// A Cab carries N IR slots per channel, N set by the device (the FM3 has two, the FM9/III four). The
// real slot count comes from the per-slot PICKER params; the name comes from the bank + raw IR ordinal
// resolved against the IR catalog.
const IR_CATALOG = { 'FACTORY 1': ['A 1x4', 'B 1x6', 'C 1x8', 'D 4x12 Recto V30'] };

const cabChannel = (
  ch: number,
  slots: Record<number, { type: number; raw?: number; bank?: string }>
): DetailBlock => {
  const params: DetailBlock['params'][number][] = [];
  for (const [n, s] of Object.entries(slots)) {
    params.push(p({ name: `CABINET_PICKER${n}`, label: 'Picker', value: 0 })); // per-slot anchor = real slot
    if (s.bank) params.push(p({ name: `CABINET_BANK${n}`, label: 'Bank', value: 0, enumLabel: s.bank }));
    params.push(p({ name: `CABINET_TYPE${n}`, label: 'Type', value: s.type, raw: s.raw ?? s.type }));
  }
  return block({ slug: 'cab', effectId: 40, channel: ch, typeName: null, params });
};

describe('Preset Browser cab sections', () => {
  it('lists one section per channel, naming each slot from the bank + IR ordinal', () => {
    const sections = cabSections(
      [
        cabChannel(0, { 2: { type: 1, raw: 1, bank: 'FACTORY 1' }, 1: { type: 3, raw: 3, bank: 'FACTORY 1' } }),
        cabChannel(1, { 1: { type: 0, raw: 0, bank: 'FACTORY 1' } })
      ],
      IR_CATALOG
    );
    expect(sections.map((s) => s.label)).toEqual(['CH A', 'CH B']);
    expect(sections[0].slots).toEqual([
      { label: 'CAB 1', value: 'D 4x12 Recto V30', empty: false },
      { label: 'CAB 2', value: 'B 1x6', empty: false }
    ]);
  });

  it('carries no per-slot level/pan noise — only the slot label and its name', () => {
    const b = cabChannel(0, { 1: { type: 3, raw: 3, bank: 'FACTORY 1' } });
    b.params.push(p({ name: 'CABINET_LEVEL1', label: 'Level', value: 0, unit: 'dB' }));
    b.params.push(p({ name: 'CABINET_PAN1', label: 'Pan', value: -100, unit: 'bipolar_percent' }));
    expect(Object.keys(cabSections([b], IR_CATALOG)[0].slots[0]).sort()).toEqual(['empty', 'label', 'value']);
  });

  it('falls back to the ordinal when the bank/name is unknown, never the scaled float', () => {
    const [section] = cabSections([cabChannel(0, { 1: { type: 3, raw: 3 } })], IR_CATALOG);
    expect(section.slots[0]).toEqual({ label: 'CAB 1', value: '#3', empty: false });
  });

  it('mirrors ForgeFX: a raw above the bank max is 16-bit-scaled and unscaled back', () => {
    // raw 56000 over a 4-entry bank → round(56000/65534*3) = 3 → the last IR.
    const [section] = cabSections([cabChannel(0, { 1: { type: 0, raw: 56000, bank: 'FACTORY 1' } })], IR_CATALOG);
    expect(section.slots[0].value).toBe('D 4x12 Recto V30');
  });

  it('reads the device slot count from the per-slot anchors, not the universal TYPE catalog', () => {
    const two = cabSections([cabChannel(0, { 1: { type: 1, raw: 1 }, 2: { type: 2, raw: 2 } })]);
    const four = cabSections([
      cabChannel(0, { 1: { type: 1, raw: 1 }, 2: { type: 2, raw: 2 }, 3: { type: 3, raw: 3 }, 4: { type: 4, raw: 4 } })
    ]);
    expect(two[0].slots.map((s) => s.label)).toEqual(['CAB 1', 'CAB 2']);
    expect(four[0].slots.map((s) => s.label)).toEqual(['CAB 1', 'CAB 2', 'CAB 3', 'CAB 4']);
  });

  it('ignores the universal TYPE/LEVEL/PAN 3/4 params a 2-slot device also decodes', () => {
    // A real FM3 still decodes CABINET_TYPE3/4 (sentinels) — only PICKER1/2 mark the real slots.
    const b = cabChannel(0, { 1: { type: 3, raw: 3 }, 2: { type: 1, raw: 1 } });
    b.params.push(p({ name: 'CABINET_TYPE3', label: 'Type', value: 0, raw: 0 }));
    b.params.push(p({ name: 'CABINET_LEVEL3', label: 'Level', value: 65534 }));
    const [section] = cabSections([b]);
    expect(section.slots.map((s) => s.label)).toEqual(['CAB 1', 'CAB 2']);
  });

  it('flags a DynaCab channel and names its slots from the speaker model, not a legacy IR', () => {
    const b = cabChannel(0, { 1: { type: 0, raw: 0, bank: 'FACTORY 1' } });
    b.params.push(p({ name: 'CABINET_MODE', label: 'MODE', value: 1, enumLabel: 'DYNA-CAB' }));
    b.params.push(p({ name: 'CABINET_DYNACAB_TYPE1', label: 'DYNACAB TYPE1', value: 3, enumLabel: '1x12 AC20' }));
    const [section] = cabSections([b], IR_CATALOG);
    expect(section.dynacab).toBe(true);
    expect(section.slots[0].value).toBe('1x12 AC20');
  });

  it('leaves the DynaCab flag off a legacy-IR channel', () => {
    const b = cabChannel(0, { 1: { type: 0, raw: 0, bank: 'FACTORY 1' } });
    b.params.push(p({ name: 'CABINET_MODE', label: 'MODE', value: 0, enumLabel: 'LEGACY' }));
    expect(cabSections([b], IR_CATALOG)[0].dynacab).toBe(false);
  });

  it('a channel with no slot params is a section with zero slots, not a bogus row', () => {
    const empty = block({ slug: 'cab', effectId: 40, channel: 0, typeName: null, params: [] });
    const [section] = cabSections([empty]);
    expect(section.label).toBe('CH A');
    expect(section.slots).toEqual([]);
  });

  it('buildDetailBlockCards renders a Cab as named sections, not one-type-per-channel kinds', () => {
    const [card] = buildDetailBlockCards(
      [cabChannel(0, { 1: { type: 3, raw: 3, bank: 'FACTORY 1' } })],
      null,
      IR_CATALOG
    );
    expect(card.kinds).toEqual([]);
    expect(card.sections).toHaveLength(1);
    expect(card.sections?.[0].slots[0].value).toBe('D 4x12 Recto V30');
    expect(card.category).toBe('Cab');
  });
});
