import { describe, it, expect } from 'vitest';
import type { ConversionEvent, ConverterPreset } from './types';
import { eventSeverity } from './convertReport';
import {
  seedScratch,
  setBlockType,
  acceptType,
  acknowledgeClamps,
  acknowledgeRouting,
  placeBlock,
  type ScratchState
} from './convertScratch';
import {
  SEV_RANK,
  CONFLICT_BADGE,
  sevToken,
  familyCat,
  blockConflicts,
  worstSev,
  blockBadge,
  isBlocking,
  paramStatusFor,
  blockParamViews,
  paramKeptCounts,
  unresolvedCount,
  reportGroups,
  tooltipInfo,
  sourceOutcome,
  type BlockConflict,
  type SourceOutcome
} from './convertConflicts';

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────

function preset(overrides: Partial<ConverterPreset> = {}): ConverterPreset {
  return {
    sourceDevice: 'FM3',
    name: 'Test Patch',
    sceneCount: 4,
    decodeDepth: 'full',
    routing: { seriesChains: [['amp1', 'cab1']] },
    blocks: [
      {
        key: 'amp1',
        family: 'amp',
        instance: 1,
        typeName: 'Brit 800',
        typeValue: 12,
        params: [
          { nativeName: 'Gain', value: 5 },
          { nativeName: 'Master', value: 10 },
          { nativeName: 'Presence', value: 8 },
          { nativeName: 'Sag', value: 3 }
        ],
        position: { row: 0, col: 2 }
      },
      { key: 'cab1', family: 'cab', instance: 1, typeName: '4x12', typeValue: 3, params: [{ nativeName: 'Level', value: 3 }], position: { row: 0, col: 3 } },
      { key: 'delay1', family: 'delay', instance: 1, typeName: 'Digital', typeValue: 1, params: [{ nativeName: 'Time', value: 420 }], position: null }
    ],
    ...overrides
  };
}

// A broad event set touching every kind relevant to this module.
function events(): ConversionEvent[] {
  return [
    { kind: 'source-partial', decodeDepth: 'name-only', detail: 'Only the name decoded.' },
    { kind: 'type-unresolved', blockKey: 'delay1', family: 'delay', sourceTypeName: 'Tape' },
    { kind: 'type-substituted', blockKey: 'amp1', family: 'amp', sourceTypeName: '5153 100W Red', targetTypeName: 'USA Lead', confidence: 'fuzzy', score: 62 },
    { kind: 'type-substituted', blockKey: 'cab1', family: 'cab', sourceTypeName: '4x12 Recto', targetTypeName: '4x12', confidence: 'exact' }, // info, NOT a conflict
    { kind: 'param-clamped', blockKey: 'amp1', nativeName: 'Master', sourceValue: 12, targetValue: 10, targetMin: 0, targetMax: 10 },
    { kind: 'param-clamped', blockKey: 'amp1', nativeName: 'Presence', sourceValue: 9, targetValue: 8 },
    { kind: 'param-dropped', blockKey: 'amp1', nativeName: 'Sag', reason: 'target-lacks-param' },
    { kind: 'param-unverified', blockKey: 'cab1', nativeName: 'Level', value: 3 },
    { kind: 'block-unplaced', blockKey: 'delay1', family: 'delay', reason: 'needs the 4th slot' },
    { kind: 'block-merged', blockKey: 'cab_src', family: 'cab', intoFamily: 'amp', intoBlockKey: 'amp1' },
    { kind: 'block-dropped', blockKey: 'phaser1', family: 'phaser', reason: 'family-missing' },
    { kind: 'routing-simplified', detail: '2 parallel rows → series chain', affectedBlockKeys: ['amp1'] },
    { kind: 'scene-collapsed', sourceScenes: 8, targetScenes: 4 },
    { kind: 'channel-collapsed', blockKey: 'amp1', sourceChannels: 4, targetChannels: 1 }
  ];
}

function seed(dev: Parameters<typeof seedScratch>[2] = 'am4'): ScratchState {
  return seedScratch(preset(), events(), dev);
}

// ── constants ────────────────────────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('SEV_RANK orders info < warn < loss', () => {
    expect(SEV_RANK.info).toBeLessThan(SEV_RANK.warn);
    expect(SEV_RANK.warn).toBeLessThan(SEV_RANK.loss);
  });

  it('CONFLICT_BADGE covers every collapsed UI kind', () => {
    expect(CONFLICT_BADGE).toMatchObject({
      'type-unresolved': '!',
      'type-substituted': '~',
      'params-clamped': '±',
      'params-unverified': '?',
      'params-dropped': '−',
      unplaced: '⇱',
      merged: '⤵',
      'routing-simplified': '↳'
    });
  });

  it('sevToken maps each severity + ok to its CSS var', () => {
    expect(sevToken('loss')).toBe('var(--danger)');
    expect(sevToken('warn')).toBe('var(--amber)');
    expect(sevToken('info')).toBe('var(--accent)');
    expect(sevToken('ok')).toBe('var(--ok)');
  });

  it('familyCat resolves a family slug through catalog.catFor', () => {
    expect(familyCat('amp').short).toBe('Amp');
    expect(familyCat('drive').glyph).toBe('◈');
    expect(familyCat('totally-unknown').short).toBe('—'); // fallback entry
  });
});

// ── blockConflicts ────────────────────────────────────────────────────────────────────────────────

describe('blockConflicts', () => {
  it('derives + collapses the active conflicts for a block, with severity from eventSeverity', () => {
    const cs = blockConflicts(events(), 'amp1', undefined, 'am4');
    const byKind = Object.fromEntries(cs.map((c) => [c.kind, c]));

    // fuzzy substitution surfaces (as-converted: unverified); exact one on cab1 does not leak here.
    expect(byKind['type-substituted']).toBeTruthy();
    expect(byKind['type-substituted'].text).toContain('AM4');
    expect(byKind['type-substituted'].sev).toBe('warn');

    // two param-clamped events collapse to ONE summary
    expect(byKind['params-clamped'].text).toBe('2 parameters clamped to AM4 range');
    // one param-dropped
    expect(byKind['params-dropped'].text).toContain('1 parameter dropped');
    // merged folds onto amp1 (the host), not its source block
    expect(byKind['merged'].text).toBe('Cab folded into Amp');
    // routing marks its affected block
    expect(byKind['routing-simplified'].text).toBe('2 parallel rows → series chain');
    // channel collapse passes through
    expect(byKind['channel-collapsed'].text).toBe('Channels 4 → 1');
  });

  it('surfaces type-unresolved and hides it once resolved', () => {
    const unresolved = blockConflicts(events(), 'delay1', undefined, 'am4');
    const tu = unresolved.find((c) => c.kind === 'type-unresolved')!;
    expect(tu.text).toBe('Type ‘Tape’ not on AM4 — pick one');
    expect(tu.sev).toBe(eventSeverity({ kind: 'type-unresolved', blockKey: 'delay1', family: 'delay', sourceTypeName: 'Tape' }));

    const resolved = blockConflicts(events(), 'delay1', { typeUnresolved: false });
    expect(resolved.find((c) => c.kind === 'type-unresolved')).toBeUndefined();
    // the unplaced conflict is unaffected by the type-resolution flag
    expect(resolved.find((c) => c.kind === 'unplaced')).toBeTruthy();
  });

  it('hides a substitution once verified', () => {
    expect(blockConflicts(events(), 'amp1', { verified: true }).find((c) => c.kind === 'type-substituted')).toBeUndefined();
  });

  it('does NOT surface exact/lineage substitutions as conflicts', () => {
    const cs = blockConflicts(events(), 'cab1', undefined, 'am4');
    expect(cs.find((c) => c.kind === 'type-substituted')).toBeUndefined();
    // cab1 still carries its unverified param
    expect(cs.find((c) => c.kind === 'params-unverified')).toBeTruthy();
  });
});

// ── worstSev / blockBadge / isBlocking ───────────────────────────────────────────────────────────

describe('worstSev + blockBadge', () => {
  it('picks the highest-rank severity', () => {
    const cs: BlockConflict[] = [
      { kind: 'params-unverified', sev: 'info', text: 'x' },
      { kind: 'params-clamped', sev: 'warn', text: 'y' },
      { kind: 'unplaced', sev: 'loss', text: 'z' }
    ];
    expect(worstSev(cs)).toBe('loss');
    expect(worstSev([])).toBeNull();
  });

  it('badge = first conflict at the worst severity → its glyph', () => {
    const cs: BlockConflict[] = [
      { kind: 'params-clamped', sev: 'warn', text: 'y' },
      { kind: 'unplaced', sev: 'loss', text: 'z' },
      { kind: 'type-unresolved', sev: 'loss', text: 'w' }
    ];
    expect(blockBadge(cs)).toEqual({ icon: '⇱', sev: 'loss' }); // first loss is unplaced
    expect(blockBadge([])).toBeNull();
  });

  it('falls back to a neutral dot for a kind without a mapped badge', () => {
    expect(blockBadge([{ kind: 'channel-collapsed', sev: 'loss', text: 'x' }])).toEqual({ icon: '•', sev: 'loss' });
  });
});

describe('isBlocking', () => {
  it('blocks on an unresolved type and on an unverified fuzzy substitution', () => {
    expect(isBlocking(events(), 'delay1')).toBe(true); // type-unresolved
    expect(isBlocking(events(), 'amp1')).toBe(true); // fuzzy substitution, not yet verified
  });
  it('clears once resolved / verified', () => {
    expect(isBlocking(events(), 'delay1', { typeUnresolved: false })).toBe(false);
    expect(isBlocking(events(), 'amp1', { verified: true })).toBe(false);
  });
  it('an exact substitution does not block', () => {
    expect(isBlocking(events(), 'cab1')).toBe(false);
  });
});

// ── param status ─────────────────────────────────────────────────────────────────────────────────

describe('paramStatusFor', () => {
  it('joins by blockKey + nativeName across the four states', () => {
    const ev = events();
    expect(paramStatusFor(ev, 'amp1', 'Master')).toEqual({ status: 'clamped', from: 12, to: 10, range: '0 – 10' });
    expect(paramStatusFor(ev, 'amp1', 'Presence')).toEqual({ status: 'clamped', from: 9, to: 8 }); // no range keys
    expect(paramStatusFor(ev, 'amp1', 'Sag')).toEqual({ status: 'dropped', reason: 'Target block lacks this parameter' });
    expect(paramStatusFor(ev, 'cab1', 'Level')).toEqual({ status: 'unverified' });
    expect(paramStatusFor(ev, 'amp1', 'Gain')).toEqual({ status: 'ok' });
  });

  it('dropped wins over other statuses for the same param', () => {
    const ev: ConversionEvent[] = [
      { kind: 'param-clamped', blockKey: 'b', nativeName: 'P', sourceValue: 1, targetValue: 2 },
      { kind: 'param-dropped', blockKey: 'b', nativeName: 'P', reason: 'no-concept-mapping' }
    ];
    expect(paramStatusFor(ev, 'b', 'P').status).toBe('dropped');
  });
});

describe('blockParamViews + paramKeptCounts', () => {
  it('maps every param to a view and counts kept = not dropped', () => {
    const ev = events();
    const amp = preset().blocks[0];
    const views = blockParamViews(ev, amp);
    expect(views.map((v) => [v.name, v.status])).toEqual([
      ['Gain', 'ok'],
      ['Master', 'clamped'],
      ['Presence', 'clamped'],
      ['Sag', 'dropped']
    ]);
    expect(views[0].value).toBe('5');
    expect(views[1].range).toBe('0 – 10');
    expect(paramKeptCounts(views)).toEqual({ kept: 3, total: 4 });
  });
});

// ── unresolvedCount vs the commit gate ───────────────────────────────────────────────────────────

describe('unresolvedCount', () => {
  it('equals remainingConflicts and reaches 0 exactly when the gate opens', () => {
    let s = seed('am4');
    // Only placed type conflicts + placement gate. clamps(amp1) and routing are informational (non-gating).
    // Gate-relevant as-seeded: type(amp1, placed) + placement(delay1). delay1's type sits in the tray.
    expect(unresolvedCount(s)).toBe(2);

    s = acceptType(s, 'amp1'); // verify the fuzzy amp substitution
    expect(unresolvedCount(s)).toBe(1);
    // acknowledging clamps / routing never gated → no change
    s = acknowledgeClamps(s, 'amp1');
    expect(unresolvedCount(s)).toBe(1);
    s = acknowledgeRouting(s);
    expect(unresolvedCount(s)).toBe(1);
    // placing delay1 resolves its placement conflict but exposes its (now-placed) unresolved type conflict
    s = placeBlock(s, 'delay1', 0, 0);
    expect(unresolvedCount(s)).toBe(1);
    s = setBlockType(s, 'delay1', { typeName: 'Digital Mono', typeValue: 2 });
    expect(unresolvedCount(s)).toBe(0);
  });
});

// ── reportGroups ─────────────────────────────────────────────────────────────────────────────────

describe('reportGroups', () => {
  it('groups loss → warn → info, collapses params per block, and sets done/loc', () => {
    const s = seed('am4');
    const groups = reportGroups(events(), s);
    expect(groups.map((g) => g.sev)).toEqual(['loss', 'warn', 'info']);
    expect(groups.map((g) => g.label)).toEqual(['LOSS', 'WARN', 'INFO']);

    const rows = groups.flatMap((g) => g.rows);
    const find = (t: string) => rows.find((r) => r.title.includes(t))!;

    // a placed unresolved-type block locates to its cell / tray; delay1 is unplaced → tray
    const dropped = find('Phaser dropped');
    expect(dropped.sev).toBe('loss');
    expect(dropped.loc).toBe('src:phaser1'); // no target cell
    expect(dropped.done).toBe(false);

    const clamps = rows.find((r) => r.title === 'Amp — 2 params clamped')!;
    expect(clamps.sev).toBe('warn');
    expect(clamps.detail).toBe('Master, Presence clamped to target range');
    expect(clamps.loc).toBe('t:amp1');
    expect(clamps.done).toBe(false);

    const unplaced = find('Delay unplaced');
    expect(unplaced.loc).toBe('tray:delay1');
    expect(unplaced.done).toBe(false);

    const merged = find('Cab merged');
    expect(merged.sev).toBe('info');
    expect(merged.loc).toBe('t:amp1');
  });

  it('reflects resolution in done + loc after edits', () => {
    let s = seed('am4');
    s = acknowledgeClamps(s, 'amp1');
    s = placeBlock(s, 'delay1', 0, 0);
    const rows = reportGroups(events(), s).flatMap((g) => g.rows);
    expect(rows.find((r) => r.title === 'Amp — 2 params clamped')!.done).toBe(true);
    const unplaced = rows.find((r) => r.title === 'Delay unplaced')!;
    expect(unplaced.done).toBe(true);
    expect(unplaced.loc).toBe('t:delay1'); // now on the grid
  });
});

// ── tooltipInfo ──────────────────────────────────────────────────────────────────────────────────

describe('tooltipInfo', () => {
  it('builds title + sub + conflict lines (pure data, no DOM)', () => {
    const conflicts = blockConflicts(events(), 'amp1', undefined, 'am4');
    const tip = tooltipInfo({ title: 'USA Lead', familyName: 'Amp', wasType: '5153 100W Red', conflicts });
    expect(tip.title).toBe('USA Lead');
    expect(tip.sub).toBe('AMP · was 5153 100W Red');
    expect(tip.lines.length).toBe(conflicts.length);
    expect(tip.lines[0]).toEqual({ sev: conflicts[0].sev, text: conflicts[0].text });
  });
  it('omits the was-line when there is no source type', () => {
    expect(tooltipInfo({ title: 'X', familyName: 'Delay', conflicts: [] }).sub).toBe('DELAY');
  });
});

// ── sourceOutcome ────────────────────────────────────────────────────────────────────────────────

describe('sourceOutcome', () => {
  const ev = events();

  it('picks the worst-first outcome per source block', () => {
    expect(sourceOutcome(ev, 'phaser1').outcome).toBe('dropped');
    expect(sourceOutcome(ev, 'delay1').outcome).toBe('unresolved'); // unresolved beats unplaced
    expect(sourceOutcome(ev, 'amp1').outcome).toBe('substituted'); // substitution beats clamp/merged
    expect(sourceOutcome(ev, 'cab_src').outcome).toBe('merged');
    expect(sourceOutcome(ev, 'cab1').outcome).toBe('unverified'); // exact subst isn't a conflict → unverified param wins
    expect(sourceOutcome(ev, 'nobody').outcome).toBe('carried');
  });

  it('returns icon/label/desc metadata', () => {
    const o = sourceOutcome(ev, 'phaser1');
    expect(o.icon).toBe('✕');
    expect(o.label).toBe('Dropped');
    expect(o.desc).toBe('No target equivalent');
    expect(o.sev).toBe('loss');
  });

  it('applies resolution overrides back to carried', () => {
    expect(sourceOutcome(ev, 'delay1', { resolved: true }).outcome).toBe('carried');
    expect(sourceOutcome(ev, 'amp1', { verified: true }).outcome).toBe('carried');
    // a block whose ONLY issue was placement, once placed, carries
    const unplacedOnly: ConversionEvent[] = [{ kind: 'block-unplaced', blockKey: 'rv', family: 'reverb', reason: 'no slot' }];
    expect(sourceOutcome(unplacedOnly, 'rv').outcome).toBe('unplaced');
    expect(sourceOutcome(unplacedOnly, 'rv', { placed: true }).outcome).toBe('carried');
  });

  it('outcome severities agree with eventSeverity (no duplicated severity logic)', () => {
    const check: Array<[SourceOutcome, ConversionEvent]> = [
      ['clamped', { kind: 'param-clamped', blockKey: 'b', nativeName: 'p', sourceValue: 1, targetValue: 2 }],
      ['merged', { kind: 'block-merged', blockKey: 'b', family: 'cab', intoFamily: 'amp' }],
      ['unverified', { kind: 'param-unverified', blockKey: 'b', nativeName: 'p', value: 1 }],
      ['unresolved', { kind: 'type-unresolved', blockKey: 'b', family: 'delay', sourceTypeName: 'Tape' }],
      ['unplaced', { kind: 'block-unplaced', blockKey: 'b', family: 'delay', reason: 'x' }],
      ['dropped', { kind: 'block-dropped', blockKey: 'b', family: 'phaser', reason: 'family-missing' }]
    ];
    for (const [outcome, e] of check) {
      // build a one-event fixture that yields `outcome`, then compare its sev to eventSeverity(e)
      const view = sourceOutcome([e], 'b');
      expect(view.outcome).toBe(outcome);
      expect(view.sev).toBe(eventSeverity(e));
    }
  });
});
