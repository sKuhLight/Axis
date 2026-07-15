import { describe, it, expect } from 'vitest';
import type { ConversionEvent, ConverterPreset } from './types';
import {
  seedScratch,
  seedScratchFromResponse,
  deriveConflicts,
  normalizePosition,
  remainingConflicts,
  conflictsForBlock,
  blockBadgeSeverity,
  unplacedBlocks,
  blockAt,
  canPlaceAt,
  setBlockType,
  acceptType,
  acknowledgeClamps,
  acknowledgeRouting,
  placeBlock,
  moveBlock,
  discardBlock,
  unplaceBlock,
  setBlockParam,
  toggleBlockBypass,
  setBlockRouting,
  scratchToPreset,
  buildLibraryDoc,
  slugifyName,
  validateSlot,
  parseConvertedDoc,
  buildApplyPlan,
  blockEffectId,
  type ScratchState
} from './convertScratch';

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────

function preset(overrides: Partial<ConverterPreset> = {}): ConverterPreset {
  return {
    sourceDevice: 'FM3',
    name: 'Test Patch',
    sceneCount: 4,
    decodeDepth: 'full',
    routing: { seriesChains: [['amp1', 'cab1']] },
    blocks: [
      { key: 'amp1', family: 'amp', instance: 1, typeName: 'Brit 800', typeValue: 12, params: [{ nativeName: 'Gain', value: 5 }], position: { row: 0, col: 2 } },
      { key: 'cab1', family: 'cab', instance: 1, typeName: '4x12', typeValue: 3, params: [], position: { row: 0, col: 3 } },
      { key: 'drive1', family: 'drive', instance: 1, typeName: 'TS808', typeValue: 1, params: [{ nativeName: 'Drive', value: 7 }], position: null }
    ],
    ...overrides
  };
}

/** An event set exercising every conflict-producing kind (+ some non-actionable ones). */
function allEvents(): ConversionEvent[] {
  return [
    { kind: 'source-partial', decodeDepth: 'name-only', detail: 'x' },
    { kind: 'type-unresolved', blockKey: 'amp1', family: 'amp', sourceTypeName: 'Weird Amp' },
    { kind: 'type-substituted', blockKey: 'cab1', family: 'cab', sourceTypeName: 'IR X', targetTypeName: '4x12', confidence: 'fuzzy', score: 62 },
    { kind: 'type-substituted', blockKey: 'amp1', family: 'amp', sourceTypeName: 'Brit', targetTypeName: 'Brit 800', confidence: 'exact' }, // info → NOT a conflict
    { kind: 'param-clamped', blockKey: 'amp1', nativeName: 'Master', sourceValue: 12, targetValue: 10, targetMin: 0, targetMax: 10 },
    { kind: 'param-clamped', blockKey: 'amp1', nativeName: 'Presence', sourceValue: 9, targetValue: 8 },
    { kind: 'block-unplaced', blockKey: 'drive1', family: 'drive', reason: 'no free cell in the chain' },
    { kind: 'routing-simplified', detail: 'parallel path merged', affectedBlockKeys: ['amp1', 'cab1'] },
    // non-actionable losses (must not become conflicts):
    { kind: 'block-dropped', blockKey: 'ghost', family: 'looper', reason: 'family-missing' },
    { kind: 'param-dropped', blockKey: 'amp1', nativeName: 'Sag', reason: 'target-lacks-param' },
    { kind: 'scene-collapsed', sourceScenes: 8, targetScenes: 4 },
    { kind: 'channel-collapsed', blockKey: 'amp1', sourceChannels: 4, targetChannels: 2 },
    { kind: 'param-unverified', blockKey: 'cab1', nativeName: 'Level', value: 3 }
  ];
}

function seed(dev: Parameters<typeof seedScratch>[2] = 'fm3'): ScratchState {
  return seedScratch(preset(), allEvents(), dev);
}

// ── position normalization ─────────────────────────────────────────────────────────────────────

describe('normalizePosition', () => {
  it('passes object positions through for grids', () => {
    expect(normalizePosition({ row: 2, col: 5 }, 'grid')).toEqual({ row: 2, col: 5 });
  });
  it('maps a slot index to a left-to-right column for chains AND slot lists', () => {
    expect(normalizePosition(3, 'chain')).toEqual({ row: 0, col: 3 });
    expect(normalizePosition(3, 'slots')).toEqual({ row: 0, col: 3 });
  });
  it('maps a { slot } position (AM4/VP4 wire shape) to a left-to-right column', () => {
    // regression: the converter emits { slot: N } for slot/chain targets; treating it as a plain
    // {row,col} object collapsed every block to (0,0). It maps to the slot column (row 0) instead —
    // AM4 and VP4 both lay their slots out left-to-right, exactly like the live devices.
    expect(normalizePosition({ slot: 2 }, 'slots')).toEqual({ row: 0, col: 2 });
    expect(normalizePosition({ slot: 2 }, 'chain')).toEqual({ row: 0, col: 2 });
    expect(normalizePosition({ slot: -1 }, 'slots')).toBeNull();
  });
  it('treats null / negative as unplaced', () => {
    expect(normalizePosition(null, 'grid')).toBeNull();
    expect(normalizePosition(-1, 'chain')).toBeNull();
  });
});

// ── conflict derivation ───────────────────────────────────────────────────────────────────────

describe('deriveConflicts', () => {
  it('produces exactly the actionable conflicts, grouping clamps per block', () => {
    const s = seed();
    const kinds = s.conflicts.map((c) => c.kind).sort();
    // amp1: type (unresolved wins over exact-sub) + clamps ; cab1: type (fuzzy) ; drive1: placement ; routing
    expect(kinds).toEqual(['clamps', 'placement', 'routing', 'type', 'type']);
    expect(s.conflicts).toHaveLength(5);
  });

  it('does not create conflicts for exact/lineage substitutions or non-actionable losses', () => {
    const s = seed();
    const cab = s.conflicts.find((c) => c.blockKey === 'cab1');
    expect(cab?.kind).toBe('type');
    expect(cab?.type?.confidence).toBe('fuzzy');
    // no conflict references the dropped/collapsed events
    expect(s.conflicts.some((c) => c.blockKey === 'ghost')).toBe(false);
  });

  it('groups both amp1 clamps into one clamps conflict', () => {
    const s = seed();
    const clamps = s.conflicts.find((c) => c.kind === 'clamps' && c.blockKey === 'amp1');
    expect(clamps?.clamps).toHaveLength(2);
    expect(clamps?.clamps?.[0]).toMatchObject({ nativeName: 'Master', sourceValue: 12, targetValue: 10, targetMin: 0, targetMax: 10 });
  });

  it('marks placement conflicts as a loss, others as warn', () => {
    const s = seed();
    expect(s.conflicts.find((c) => c.kind === 'placement')?.severity).toBe('loss');
    expect(s.conflicts.filter((c) => c.kind !== 'placement').every((c) => c.severity === 'warn')).toBe(true);
  });

  it('ignores events pointing at unknown blocks', () => {
    const conflicts = deriveConflicts(
      [{ kind: 'type-unresolved', blockKey: 'nope', family: 'amp', sourceTypeName: 'x' }],
      [{ key: 'amp1', family: 'amp', instance: 1, params: [], position: null }]
    );
    expect(conflicts).toHaveLength(0);
  });
});

// ── seeding / topology ────────────────────────────────────────────────────────────────────────

describe('seedScratch topology + tray', () => {
  it('applies the device grid default and expands to fit positions', () => {
    const s = seed('fm3');
    expect(s.topology).toMatchObject({ kind: 'grid', rows: 4, cols: 12 });
  });
  it('forces block-unplaced blocks into the tray', () => {
    const s = seed();
    const tray = unplacedBlocks(s);
    expect(tray.map((b) => b.key)).toEqual(['drive1']);
  });
  it('models VP4 as a 1-row chain and AM4 as a slot list', () => {
    const vp4 = seedScratch(preset(), [], 'vp4');
    expect(vp4.topology).toMatchObject({ kind: 'chain', rows: 1 });
    const am4 = seedScratch(preset({ blocks: [] }), [], 'am4');
    expect(am4.topology.kind).toBe('slots');
    expect(am4.topology).toMatchObject({ rows: 1, cols: 4 }); // horizontal 4-slot chain, like the device
  });
  it('keeps AM4 at its 4 fixed slots and drops every convertible block into the tray', () => {
    // the converter leaves slot/chain targets unplaced (position null) so the user fills the fixed
    // slots from the tray. The topology must NOT grow to the block count — AM4 has exactly 4 slots.
    const blocks = ['comp1', 'drive1', 'amp1', 'delay1', 'reverb1', 'chorus1'].map((key) => ({
      key, family: key.replace(/\d+$/, ''), instance: 1, params: [], position: null as null
    }));
    const am4 = seedScratch(preset({ blocks }), [], 'am4');
    expect(am4.topology).toMatchObject({ kind: 'slots', rows: 1, cols: 4 });
    expect(unplacedBlocks(am4)).toHaveLength(6);
  });
  it('seedScratchFromResponse threads target + events', () => {
    const s = seedScratchFromResponse({ source: { device: 'FM3', name: 'x', decodeDepth: 'full' }, target: preset(), events: allEvents(), summary: { total: 0, info: 0, warn: 0, loss: 0 } }, 'fm3');
    expect(s.blocks).toHaveLength(3);
  });
});

// ── placement validity ────────────────────────────────────────────────────────────────────────

describe('canPlaceAt', () => {
  it('rejects occupied cells but allows a block onto its own cell', () => {
    const s = seed();
    expect(canPlaceAt(s, 0, 2)).toBe(false); // amp1 sits here
    expect(canPlaceAt(s, 0, 2, 'amp1')).toBe(true);
    expect(canPlaceAt(s, 1, 1)).toBe(true); // free
  });
  it('rejects out-of-bounds cells', () => {
    const s = seed('fm3'); // 4×12
    expect(canPlaceAt(s, -1, 0)).toBe(false);
    expect(canPlaceAt(s, 0, 12)).toBe(false);
    expect(canPlaceAt(s, 4, 0)).toBe(false);
    expect(canPlaceAt(s, 3, 11)).toBe(true);
  });
  it('honors chain bounds (VP4 = 1 row × 4)', () => {
    const s = seedScratch(preset({ blocks: [] }), [], 'vp4');
    expect(canPlaceAt(s, 0, 3)).toBe(true);
    expect(canPlaceAt(s, 1, 0)).toBe(false); // only row 0 exists
    expect(canPlaceAt(s, 0, 4)).toBe(false);
  });
});

// ── resolution transitions + gate ────────────────────────────────────────────────────────────

describe('resolution transitions', () => {
  it('gates only on placed type conflicts + placement; clamps/routing are informational', () => {
    let s = seed();
    // type:amp1 (placed) + type:cab1 (placed) + placement:drive1. clamps:amp1 and routing DON'T gate.
    expect(remainingConflicts(s)).toBe(3);

    s = setBlockType(s, 'amp1', { typeName: 'Brit 900', typeValue: 13 });
    expect(remainingConflicts(s)).toBe(2);
    expect(s.blocks.find((b) => b.key === 'amp1')?.typeValue).toBe(13);

    s = acceptType(s, 'cab1');
    expect(remainingConflicts(s)).toBe(1);

    // acknowledging clamps / routing never changed the gate — they are informational, not blocking.
    s = acknowledgeClamps(s, 'amp1');
    expect(remainingConflicts(s)).toBe(1);
    s = acknowledgeRouting(s);
    expect(remainingConflicts(s)).toBe(1);

    s = placeBlock(s, 'drive1', 1, 0);
    expect(remainingConflicts(s)).toBe(0);
    expect(s.blocks.find((b) => b.key === 'drive1')?.position).toEqual({ row: 1, col: 0 });
  });

  it('placeBlock rejects an occupied/out-of-bounds target (returns same state)', () => {
    const s = seed();
    expect(placeBlock(s, 'drive1', 0, 2)).toBe(s); // amp1's cell
    expect(placeBlock(s, 'drive1', 99, 99)).toBe(s);
    expect(remainingConflicts(s)).toBe(3); // nothing resolved — placement + both placed type conflicts open
  });

  it('does not gate the commit on a type conflict while its block sits in the tray', () => {
    // AM4/VP4 fill model: every block starts in the tray, so a tray block's type conflict must not
    // block commit — only placing it (a block you actually keep) re-arms the gate.
    const p = preset({
      blocks: [
        { key: 'amp1', family: 'amp', instance: 1, typeName: 'X', typeValue: 1, params: [], position: null },
        { key: 'peq1', family: 'peq', instance: 1, params: [], position: null }
      ]
    });
    const events: ConversionEvent[] = [{ kind: 'type-unresolved', blockKey: 'peq1', family: 'peq', sourceTypeName: '' }];
    let s = seedScratch(p, events, 'am4');
    expect(s.conflicts).toHaveLength(1);
    expect(remainingConflicts(s)).toBe(0); // peq1 unplaced → its type conflict doesn't gate
    s = placeBlock(s, 'peq1', 0, 0);
    expect(remainingConflicts(s)).toBe(1); // now placed → gates
    s = unplaceBlock(s, 'peq1');
    expect(remainingConflicts(s)).toBe(0); // back to tray → clears
  });

  it('moveBlock relocates a placed block to a free cell', () => {
    let s = seed();
    s = moveBlock(s, 'amp1', 2, 5);
    expect(s.blocks.find((b) => b.key === 'amp1')?.position).toEqual({ row: 2, col: 5 });
    expect(blockAt(s, 2, 5)?.key).toBe('amp1');
  });

  it('discardBlock removes the block and resolves all its conflicts', () => {
    let s = seed();
    s = discardBlock(s, 'amp1');
    expect(s.blocks.some((b) => b.key === 'amp1')).toBe(false);
    expect(conflictsForBlock(s, 'amp1').every((c) => c.resolved)).toBe(true);
    // amp1's gating conflict was its type (clamps never gated) → remaining drops from 3 to 2
    expect(remainingConflicts(s)).toBe(2);
  });

  it('unplaceBlock sends a placed block back to the tray without discarding', () => {
    let s = seed();
    s = unplaceBlock(s, 'amp1');
    expect(unplacedBlocks(s).map((b) => b.key).sort()).toEqual(['amp1', 'drive1']);
    expect(s.blocks.some((b) => b.key === 'amp1')).toBe(true);
  });
});

// ── badge severity ──────────────────────────────────────────────────────────────────────────

describe('blockBadgeSeverity', () => {
  it('returns the worst unresolved conflict severity, null once clear', () => {
    let s = seed();
    expect(blockBadgeSeverity(s, 'drive1')).toBe('loss');
    expect(blockBadgeSeverity(s, 'amp1')).toBe('warn');
    s = placeBlock(s, 'drive1', 1, 0);
    expect(blockBadgeSeverity(s, 'drive1')).toBeNull();
  });
});

// ── apply plan ────────────────────────────────────────────────────────────────────────────────

describe('buildApplyPlan', () => {
  it('orders place → set-type → set-param and skips tray + address-less blocks', () => {
    // amp1 carries a device effectId + a param with a paramId; cab1 has an effectId, no params;
    // drive1 is in the tray (unplaced) so never applied.
    const p = preset({
      blocks: [
        { key: 'amp1', family: 'amp', instance: 1, typeValue: 12, params: [{ nativeName: 'Gain', value: 5, paramId: 3 } as never], position: { row: 0, col: 2 }, effectId: 106 } as never,
        { key: 'cab1', family: 'cab', instance: 1, typeValue: 3, params: [], position: { row: 0, col: 3 }, effectId: 112 } as never,
        { key: 'no-eid', family: 'drive', instance: 1, typeValue: 1, params: [{ nativeName: 'Drive', value: 7 }], position: { row: 1, col: 0 } },
        { key: 'drive1', family: 'drive', instance: 2, typeValue: 1, params: [], position: null }
      ]
    });
    const s = seedScratch(p, [], 'fm3');
    const plan = buildApplyPlan(s);

    expect(plan.ops.map((o) => o.kind)).toEqual(['place', 'place', 'set-type', 'set-type', 'set-param']);
    // places come first, both for the two blocks that HAVE an effect id
    expect(plan.ops.slice(0, 2).every((o) => o.kind === 'place')).toBe(true);
    expect(plan.unresolvedBlocks).toBe(1); // 'no-eid'
    expect(plan.unresolvedParams).toBe(0);
    const setParam = plan.ops.find((o) => o.kind === 'set-param');
    expect(setParam).toMatchObject({ effectId: 106, paramId: 3, value: 5 });
  });

  it('counts params without a paramId as unresolved', () => {
    const p = preset({
      blocks: [{ key: 'amp1', family: 'amp', instance: 1, typeValue: 12, params: [{ nativeName: 'Gain', value: 5 }], position: { row: 0, col: 0 }, effectId: 106 } as never]
    });
    const plan = buildApplyPlan(seedScratch(p, [], 'fm3'));
    expect(plan.unresolvedParams).toBe(1);
    expect(plan.ops.some((o) => o.kind === 'set-param')).toBe(false);
  });

  it('blockEffectId reads the loose IR extra key', () => {
    expect(blockEffectId({ key: 'a', family: 'amp', instance: 1, params: [], position: null, effectId: 42 } as never)).toBe(42);
    expect(blockEffectId({ key: 'a', family: 'amp', instance: 1, params: [], position: null })).toBeUndefined();
  });
});

// ── library document ────────────────────────────────────────────────────────────────────────

describe('buildLibraryDoc + scratchToPreset', () => {
  it('slugifies names safely', () => {
    expect(slugifyName('My Cool Patch!')).toBe('my-cool-patch');
    expect(slugifyName('  ')).toBe('preset');
  });

  it('builds a versioned doc reflecting edits, with a device-scoped id', () => {
    let s = seed();
    s = discardBlock(s, 'drive1'); // resolve placement by discarding
    s = setBlockType(s, 'amp1', { typeName: 'Brit 900', typeValue: 13 });
    const { id, doc } = buildLibraryDoc(s, 1720000000000);

    expect(id).toBe('fm3-test-patch-1720000000000');
    expect(doc).toMatchObject({ v: 1, name: 'Test Patch', sourceDevice: 'FM3', targetDevice: 'fm3', savedAt: 1720000000000 });
    expect(doc.preset.blocks.some((b) => b.key === 'drive1')).toBe(false); // discarded
    expect(doc.preset.blocks.find((b) => b.key === 'amp1')?.typeValue).toBe(13); // edited
    // untouched IR carried through
    expect(doc.preset.routing).toEqual(s.base.routing);
    expect(doc.preset.sceneCount).toBe(4);
  });

  it('scratchToPreset preserves position edits', () => {
    let s = seed();
    s = placeBlock(s, 'drive1', 2, 4);
    const out = scratchToPreset(s);
    expect(out.blocks.find((b) => b.key === 'drive1')?.position).toEqual({ row: 2, col: 4 });
  });

  it('threads a name + slot override into the doc, preset, and id', () => {
    const s = seed();
    const { id, doc } = buildLibraryDoc(s, 1720000000000, { name: 'Renamed Patch', slot: 7 });
    expect(doc.name).toBe('Renamed Patch');
    expect(doc.preset.name).toBe('Renamed Patch'); // reflected in the embedded preset too
    expect(doc.slot).toBe(7);
    expect(id).toBe('fm3-renamed-patch-1720000000000'); // id follows the chosen name
  });

  it('falls back to the buffer name and omits slot when overrides are blank/invalid', () => {
    const s = seed();
    const { doc } = buildLibraryDoc(s, 1720000000000, { name: '   ', slot: -3 });
    expect(doc.name).toBe('Test Patch');
    expect('slot' in doc).toBe(false); // negative slot dropped
    const { doc: d2 } = buildLibraryDoc(s, 1720000000000);
    expect('slot' in d2).toBe(false);
  });
});

// ── slot validation ──────────────────────────────────────────────────────────────────────────
describe('validateSlot', () => {
  it('treats blank/null as valid with no slot', () => {
    expect(validateSlot('')).toEqual({ ok: true });
    expect(validateSlot(null)).toEqual({ ok: true });
    expect(validateSlot(undefined)).toEqual({ ok: true });
  });
  it('accepts a non-negative whole number', () => {
    expect(validateSlot('5')).toEqual({ ok: true, slot: 5 });
    expect(validateSlot(0)).toEqual({ ok: true, slot: 0 });
  });
  it('rejects negatives, fractions, and non-numbers', () => {
    expect(validateSlot('-1').ok).toBe(false);
    expect(validateSlot('2.5').ok).toBe(false);
    expect(validateSlot('abc').ok).toBe(false);
  });
  it('range-checks against a device preset count when given', () => {
    expect(validateSlot('383', 384)).toEqual({ ok: true, slot: 383 });
    const over = validateSlot('384', 384);
    expect(over.ok).toBe(false);
    expect(over.error).toContain('0–383');
  });
});

// ── persisted-doc validation ───────────────────────────────────────────────────────────────
describe('parseConvertedDoc', () => {
  it('round-trips a doc built by buildLibraryDoc', () => {
    const { doc } = buildLibraryDoc(seed(), 1720000000000, { name: 'Rt', slot: 2 });
    const parsed = parseConvertedDoc(doc);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({ v: 1, name: 'Rt', slot: 2, targetDevice: 'fm3' });
    expect(parsed?.preset.blocks.length).toBe(doc.preset.blocks.length);
  });
  it('rejects corrupt / older-schema shapes', () => {
    expect(parseConvertedDoc(null)).toBeNull();
    expect(parseConvertedDoc({ v: 2, name: 'x' })).toBeNull();
    expect(parseConvertedDoc({ v: 1, name: 'x', sourceDevice: 'FM3', targetDevice: 'nope', savedAt: 1, preset: {} })).toBeNull();
  });
  it('accepts a doc without a slot (slot is optional)', () => {
    const { doc } = buildLibraryDoc(seed(), 1);
    expect(parseConvertedDoc(doc)?.slot).toBeUndefined();
  });
});

// ── offline edit transitions (real-grid convert surface) ─────────────────────────────────────────
describe('offline block edits', () => {
  const blockOf = (s: ReturnType<typeof seed>, key: string) => s.blocks.find((b) => b.key === key)!;

  it('setBlockParam sets one param by index and leaves others/blocks untouched', () => {
    let s = seed();
    s = setBlockParam(s, 'amp1', 0, 8);
    expect(blockOf(s, 'amp1').params[0].value).toBe(8);
    expect(blockOf(s, 'drive1').params[0].value).toBe(7); // untouched block
  });
  it('setBlockParam is a no-op on an out-of-range index', () => {
    const s = seed();
    expect(setBlockParam(s, 'amp1', 5, 99)).toEqual(s);
    expect(setBlockParam(s, 'amp1', -1, 99)).toEqual(s);
  });
  it('toggleBlockBypass flips the bypass flag', () => {
    let s = seed();
    expect(blockOf(s, 'amp1').bypassed).toBeUndefined();
    s = toggleBlockBypass(s, 'amp1');
    expect(blockOf(s, 'amp1').bypassed).toBe(true);
    s = toggleBlockBypass(s, 'amp1');
    expect(blockOf(s, 'amp1').bypassed).toBe(false);
  });
  it('setBlockRouting stores deduped, sorted feed-rows on a placed block', () => {
    let s = seed();
    s = setBlockRouting(s, 'amp1', [2, 0, 2, -1]);
    expect(blockOf(s, 'amp1').fromRows).toEqual([0, 2]);
  });
  it('setBlockRouting is a no-op for a tray (unplaced) block', () => {
    const s = seed();
    expect(blockOf(s, 'drive1').position).toBeNull();
    const next = setBlockRouting(s, 'drive1', [0, 1]);
    expect(blockOf(next, 'drive1').fromRows).toBeUndefined();
  });
  it('unplaceBlock clears routing when sending a block back to the tray', () => {
    let s = seed();
    s = setBlockRouting(s, 'amp1', [0, 1]);
    s = unplaceBlock(s, 'amp1');
    expect(blockOf(s, 'amp1').position).toBeNull();
    expect(blockOf(s, 'amp1').fromRows).toEqual([]);
  });
});
