import { describe, expect, it } from 'vitest';
import { familyLabel } from '../catalog';
import {
  HEADER_NARROW_W,
  HEADER_ONE_ROW_MIN_W,
  HEADER_PARTS,
  HEADER_TINY_W,
  HEADER_XS_W,
  SEARCH_FIELD_MIN_W,
  CHIP_READABLE_W,
  CHIP_ROW_MIN_W,
  STATE_NARROW_W,
  TOUCH_BUTTON_W,
  blockStateView,
  bypassModeInMenu,
  bypassModeMenu,
  bypassModeText,
  formatBypassModeLabel,
  headerFit,
  headerOrder,
  headerRows,
  oneRowMinWidth,
  stateLabels,
  typeChip,
  type BlockStateInput
} from './headerModel';
import type { BlockState } from '../types';

describe('headerRows / oneRowMinWidth', () => {
  it('one row from ~1240 px with the top navigation, two below', () => {
    expect(HEADER_ONE_ROW_MIN_W).toBe(1240);
    expect(oneRowMinWidth({ nav: 'top' })).toBe(1240);
    expect(headerRows(1240, 'top')).toBe(1);
    expect(headerRows(2560, 'top')).toBe(1);
    expect(headerRows(1239, 'top')).toBe(2);
    expect(headerRows(390, 'top')).toBe(2);
  });
  it('side navigation: one row as soon as every part fits at its widest (nothing wraps)', () => {
    const p = HEADER_PARTS;
    const side = oneRowMinWidth({ nav: 'side' });
    expect(side).toBe(p.pad + p.chip + p.search + p.state + p.more + p.spacerMin + 4 * p.gap);
    expect(side).toBeGreaterThan(960); // a long cab summary + search + segments + ⋯ (was 860, which wrapped)
    expect(headerRows(side, 'side')).toBe(1);
    expect(headerRows(side - 1, 'side')).toBe(2);
    expect(headerRows(1200, 'side')).toBe(1);
    expect(headerRows(1200, 'top')).toBe(2);
  });
  it('a close button (monolith) needs its room too', () => {
    const side = oneRowMinWidth({ nav: 'side' });
    expect(oneRowMinWidth({ nav: 'side', hasEnd: true })).toBe(side + HEADER_PARTS.gap + HEADER_PARTS.end);
    expect(headerRows(side, 'side', true)).toBe(2);
    // with the Bypass mode control the parts with ✕ need a little more than the 1240 floor
    const p = HEADER_PARTS;
    expect(oneRowMinWidth({ nav: 'top', hasEnd: true })).toBe(Math.max(1240, side + p.gap + p.end + p.gap + p.tabsMin));
    expect(oneRowMinWidth({ nav: 'top', hasEnd: true })).toBe(1262);
  });
  it('an unmeasured editor gets two rows', () => {
    expect(headerRows(0, 'top')).toBe(2);
    expect(headerRows(Number.NaN, 'side')).toBe(2);
  });
});

describe('headerOrder (document = visual = Tab order)', () => {
  it('one row: chip · tabs · ⟷ · search · state · ⋯ · ✕', () => {
    expect(headerOrder({ rows: 1, block: true, tabs: true, end: true, tiny: false })).toEqual(['chip', 'tabs', 'spB', 'tools', 'state', 'more', 'end']);
    expect(headerOrder({ rows: 1, block: true, tabs: false, end: false, tiny: false })).toEqual(['chip', 'spB', 'tools', 'state', 'more']);
  });
  it('two rows: row 1 before row 2', () => {
    expect(headerOrder({ rows: 2, block: true, tabs: true, end: false, tiny: false })).toEqual(['chip', 'spA', 'state', 'more', 'break', 'tabs', 'spB', 'tools']);
    expect(headerOrder({ rows: 2, block: true, tabs: true, end: true, tiny: false })).toEqual(['chip', 'spA', 'state', 'more', 'end', 'break', 'tabs', 'spB', 'tools']);
  });
  it('a phone with a close button: chip · ✕, then state · ⋯, then tabs · search', () => {
    expect(headerOrder({ rows: 2, block: true, tabs: true, end: true, tiny: true })).toEqual(['chip', 'spA', 'end', 'breakEnd', 'state', 'more', 'break', 'tabs', 'spB', 'tools']);
  });
  it('no block (virtual screens): tabs · ⟷ · search · ⋯', () => {
    expect(headerOrder({ rows: 1, block: false, tabs: true, end: false, tiny: false })).toEqual(['tabs', 'spB', 'tools', 'more']);
    expect(headerOrder({ rows: 1, block: false, tabs: false, end: false, tiny: false })).toEqual(['spB', 'tools', 'more']);
  });
});

describe('familyLabel ("Save as default for …")', () => {
  it('the short label, distinct for families sharing one, a fallback outside the catalog', () => {
    expect(familyLabel('Amp')).toBe('Amp');
    expect(familyLabel('Comp')).toBe('Comp');
    expect(familyLabel('MultiComp')).toBe('Multi Comp');
    expect(familyLabel(null, 'Mystery')).toBe('Mystery');
    expect(familyLabel(null)).toBe('this block');
    expect(familyLabel('Amp')).not.toBe('—');
  });
});

describe('headerFit / stateLabels', () => {
  it('search field vs icon, narrow and tiny labels', () => {
    expect(headerFit(SEARCH_FIELD_MIN_W)).toEqual({ searchField: true, narrow: true, tiny: false, xs: false });
    expect(headerFit(SEARCH_FIELD_MIN_W - 1).searchField).toBe(false);
    expect(headerFit(HEADER_NARROW_W)).toMatchObject({ narrow: false });
    expect(headerFit(HEADER_TINY_W - 1)).toEqual({ searchField: false, narrow: true, tiny: true, xs: false });
    expect(headerFit(390)).toMatchObject({ tiny: true, xs: false });
    expect(headerFit(HEADER_XS_W - 1)).toMatchObject({ tiny: true, xs: true });
    expect(headerFit(360).xs).toBe(true);
    expect(headerFit(0)).toEqual({ searchField: true, narrow: false, tiny: false, xs: false });
  });
  it('segment labels follow the width and the bypass state', () => {
    expect(stateLabels(1300, false)).toEqual({ engaged: 'Engaged', scene: 'Scene Ignore' });
    expect(stateLabels(1300, true).engaged).toBe('Bypassed');
    expect(stateLabels(600, false).scene).toBe('Ignore');
    expect(stateLabels(390, false)).toEqual({ engaged: 'On', scene: 'Ignore' });
    expect(stateLabels(390, true).engaged).toBe('Byp');
  });
});

describe('blockStateView (Scene Ignore + Bypass mode from the device)', () => {
  const STATE: BlockState = {
    sceneIgnore: { paramId: 137, value: 1, supported: true },
    bypassMode: {
      paramId: 3,
      value: 2,
      options: [
        { value: 0, label: 'THRU', muting: false },
        { value: 1, label: 'MUTE FX OUT', muting: false },
        { value: 2, label: 'MUTE OUT', muting: true }
      ]
    }
  };
  const base: BlockStateInput = { live: true, cap: true, device: 'FM3', status: 'ready', state: STATE, channel: 'B' };

  it('available: Scene Ignore on, per channel; the current mode with its device label and the muted mark', () => {
    const v = blockStateView(base);
    expect(v.scene).toEqual({
      enabled: true,
      pending: false,
      on: true,
      paramId: 137,
      title: 'Scene Ignore · channel B — this block keeps its state on scene changes',
      reason: null
    });
    expect(v.bypassMode).toMatchObject({ enabled: true, paramId: 3, value: 2, label: 'Mute Out', muting: true, reason: null });
    expect(v.bypassMode.options.map((o) => o.label)).toEqual(['Thru', 'Mute FX Out', 'Mute Out']);
    expect(v.bypassMode.title).toBe('Bypass mode · channel B: Mute Out — what this block does while bypassed (it mutes)');
    // off, a non-muting mode, no channel
    const off = blockStateView({ ...base, channel: null, state: { sceneIgnore: { ...STATE.sceneIgnore!, value: 0 }, bypassMode: { ...STATE.bypassMode!, value: 0 } } });
    expect(off.scene.on).toBe(false);
    expect(off.scene.title).toBe('Scene Ignore — this block keeps its state on scene changes');
    expect(off.bypassMode).toMatchObject({ label: 'Thru', muting: false });
    expect(off.bypassMode.title).toBe('Bypass mode: Thru — what this block does while bypassed');
  });

  it('unavailable: disabled with the reason, in order (offline, older server, device, block read, block, firmware)', () => {
    const reasons = (i: Partial<BlockStateInput>) => {
      const v = blockStateView({ ...base, ...i });
      expect([v.scene.enabled, v.bypassMode.enabled]).toEqual([false, false]);
      return [v.scene.reason, v.bypassMode.reason];
    };
    expect(reasons({ live: false })).toEqual(['Not available offline', 'Not available offline']);
    expect(reasons({ cap: undefined })).toEqual(['Needs a newer ForgeFX server', 'Needs a newer ForgeFX server']);
    expect(reasons({ cap: false, device: 'VP4' })).toEqual(['Not available on VP4', 'Not available on VP4']);
    expect(reasons({ cap: false, device: null })).toEqual(['Not available on this device', 'Not available on this device']);
    expect(reasons({ status: 'loading' })).toEqual(['Reading the block…', 'Reading the block…']);
    expect(reasons({ stale: true })).toEqual(['Reading the block…', 'Reading the block…']);
    expect(reasons({ status: 'loading', state: null })).toEqual(['Reading the block…', 'Reading the block…']); // first open
    expect(reasons({ status: 'error' })).toEqual(["Couldn't read this block", "Couldn't read this block"]);
    expect(reasons({ state: { sceneIgnore: null, bypassMode: null, readError: true } })).toEqual(["Couldn't read this block", "Couldn't read this block"]);
    expect(reasons({ status: 'nopack' })).toEqual(['This block has no parameters', 'This block has no parameters']);
    expect(reasons({ state: null })).toEqual(['This block has no Scene Ignore', 'This block has no bypass mode']);
    expect(reasons({ state: { sceneIgnore: null, bypassMode: null } })).toEqual(['This block has no Scene Ignore', 'This block has no bypass mode']);
    const v = blockStateView({ ...base, cap: undefined });
    expect(v.scene.title).toBe('Scene Ignore — Needs a newer ForgeFX server');
    expect(v.bypassMode.title).toBe('Bypass mode — Needs a newer ForgeFX server');
    expect(v.scene.on).toBe(false);
    expect([v.scene.pending, v.bypassMode.pending]).toEqual([false, false]);
    expect(v.bypassMode.options).toEqual([]);
  });

  it('a re-read of the same block (or another channel pending) keeps the last state on show, only disabled', () => {
    for (const i of [{ status: 'loading' as const }, { stale: true }]) {
      const v = blockStateView({ ...base, ...i });
      expect(v.scene).toMatchObject({ enabled: false, pending: true, on: true, paramId: 137, reason: 'Reading the block…' });
      expect(v.bypassMode).toMatchObject({ enabled: false, pending: true, value: 2, label: 'Mute Out', muting: true, reason: 'Reading the block…' });
      // the same text (no width jump), and no menu to open
      expect(bypassModeText(v.bypassMode, 1300)).toBe('Bypass: Mute Out');
      expect(bypassModeText(v.bypassMode, 600)).toBe('Mute Out');
      expect(bypassModeMenu(v.bypassMode, 'B', () => {})).toEqual([]);
    }
    // a hard reason wins over pending and shows nothing of the old state
    const off = blockStateView({ ...base, status: 'loading', cap: false });
    expect(off.scene).toMatchObject({ pending: false, on: false });
    expect(off.bypassMode).toMatchObject({ pending: false, label: '' });
  });

  it('one without the other; a firmware gate disables Scene Ignore only', () => {
    const noSi = blockStateView({ ...base, state: { sceneIgnore: null, bypassMode: STATE.bypassMode } });
    expect(noSi.scene).toMatchObject({ enabled: false, reason: 'This block has no Scene Ignore' });
    expect(noSi.bypassMode.enabled).toBe(true);
    const gated = blockStateView({ ...base, state: { ...STATE, sceneIgnore: { paramId: 6, value: 0, supported: false, reason: 'Needs firmware ≥ 2.03' } } });
    expect(gated.scene).toMatchObject({ enabled: false, paramId: 6, reason: 'Needs firmware ≥ 2.03', title: 'Scene Ignore — Needs firmware ≥ 2.03' });
    expect(gated.bypassMode.enabled).toBe(true);
    const gatedNoReason = blockStateView({ ...base, state: { ...STATE, sceneIgnore: { paramId: 6, value: 0, supported: false } } });
    expect(gatedNoReason.scene.reason).toBe('Not supported by this firmware');
  });

  it('labels: device labels title-cased (FX stays), an unnamed mode by its position', () => {
    expect(formatBypassModeLabel('THRU', 0)).toBe('Thru');
    expect(formatBypassModeLabel('MUTE FX IN', 3)).toBe('Mute FX In');
    expect(formatBypassModeLabel('Mute Out', 2)).toBe('Mute Out');
    expect(formatBypassModeLabel(' mute  in ', 4)).toBe('Mute In');
    expect(formatBypassModeLabel('2', 2)).toBe('Mode 3');
    expect(formatBypassModeLabel('', 0)).toBe('Mode 1');
  });

  it('control text by width; where chip · state · ⋯ (· ✕) no longer share row one it moves into ⋯', () => {
    const v = blockStateView(base).bypassMode;
    expect(bypassModeText(v, 1300)).toBe('Bypass: Mute Out');
    expect(bypassModeText(v, HEADER_NARROW_W - 1)).toBe('Mute Out');
    expect(bypassModeText(blockStateView({ ...base, cap: false }).bypassMode, 1300)).toBe('Bypass mode');
    expect(bypassModeInMenu(1300)).toBe(false);
    expect(bypassModeInMenu(390)).toBe(true);
    expect(bypassModeInMenu(HEADER_TINY_W - 1)).toBe(true);
    expect(bypassModeInMenu(0)).toBe(false); // unmeasured: the full look
    // row one at its narrowest: padding, a readable chip, spacer and gaps, the widest narrow state group, ⋯ (and ✕)
    const p = HEADER_PARTS;
    expect(CHIP_READABLE_W).toBeGreaterThan(CHIP_ROW_MIN_W); // the CSS minimum cuts the name to a letter
    const row = (more: number, end = 0) => p.pad + CHIP_READABLE_W + p.gap + p.spacerMin + p.gap + STATE_NARROW_W + p.gap + more + (end ? p.gap + end : 0);
    const cases: [Parameters<typeof bypassModeInMenu>[1], number][] = [
      [{}, row(p.more)],
      [{ touch: true }, row(TOUCH_BUTTON_W)],
      [{ hasEnd: true }, row(p.more, p.end)],
      [{ hasEnd: true, touch: true }, row(TOUCH_BUTTON_W, TOUCH_BUTTON_W)]
    ];
    for (const [o, min] of cases) {
      expect(bypassModeInMenu(min, o), JSON.stringify(o)).toBe(false);
      expect(bypassModeInMenu(min - 1, o), JSON.stringify(o)).toBe(true);
    }
    expect([row(p.more), row(TOUCH_BUTTON_W), row(p.more, p.end), row(TOUCH_BUTTON_W, TOUCH_BUTTON_W)]).toEqual([528, 538, 566, 586]);
    // 470 / 500 px with ✕ (the monolith): in ⋯, so the first row cannot wrap with "Mute FX Out"
    for (const touch of [false, true]) {
      expect(bypassModeInMenu(470, { hasEnd: true, touch })).toBe(true);
      expect(bypassModeInMenu(500, { hasEnd: true, touch })).toBe(true);
    }
    expect(bypassModeInMenu(590, { hasEnd: true, touch: true })).toBe(false);
  });

  it('touch targets widen ⋯ and ✕ in the one-row width', () => {
    const p = HEADER_PARTS;
    expect(oneRowMinWidth({ nav: 'side', touch: true })).toBe(oneRowMinWidth({ nav: 'side' }) + TOUCH_BUTTON_W - p.more);
    expect(oneRowMinWidth({ nav: 'side', hasEnd: true, touch: true })).toBe(oneRowMinWidth({ nav: 'side', hasEnd: true }) + 2 * (TOUCH_BUTTON_W - p.more));
    const side = oneRowMinWidth({ nav: 'side', touch: true });
    expect(headerRows(side, 'side', false, true)).toBe(1);
    expect(headerRows(side - 1, 'side', false, true)).toBe(2);
  });

  it('the Bypass mode menu: a channel header, one radio row per mode (muting ones hinted), a pick writes', () => {
    const picks: number[] = [];
    const rows = bypassModeMenu(blockStateView(base).bypassMode, 'B', (v) => picks.push(v));
    expect(rows.map((r) => [r.kind, r.label, r.hint ?? '', r.checked ?? null])).toEqual([
      ['header', 'Bypass mode · channel B', '', null],
      ['radio', 'Thru', '', false],
      ['radio', 'Mute FX Out', '', false],
      ['radio', 'Mute Out', 'mutes', true]
    ]);
    expect(rows[3]!.className).toBe('be-bm be-bm-opt be-bm-2 muting');
    rows[1]!.run();
    expect(picks).toEqual([0]);
    expect(bypassModeMenu(blockStateView(base).bypassMode, null, () => {})[0]!.label).toBe('Bypass mode');
    expect(bypassModeMenu(blockStateView({ ...base, cap: false }).bypassMode, 'B', () => {})).toEqual([]);
  });
});

describe('typeChip', () => {
  const base = { family: 'Amp', typeName: 'Plexi 100W', pack: 'Amp', isCab: false, cabSummary: null, channel: 'B' };
  it('a block with a type: model name, palette, channel letter', () => {
    expect(typeChip(base)).toEqual({ sub: 'Amp · type', name: 'Plexi 100W', title: 'Change type — search models', action: 'retype', channel: 'B' });
  });
  it('no channel letter when the block has no channels', () => {
    expect(typeChip({ ...base, channel: undefined }).channel).toBeNull();
    expect(typeChip({ ...base, channel: null }).channel).toBeNull();
  });
  it('without a pack nothing opens and no channel shows; the name falls back', () => {
    const c = typeChip({ ...base, pack: null, typeName: '' });
    expect(c.action).toBeNull();
    expect(c.channel).toBeNull();
    expect(c.name).toBe('—');
    expect(typeChip({ ...base, typeName: null }).name).toBe('Amp');
  });
  it('a cab shows its slot summary and opens the cab picker', () => {
    const c = typeChip({ ...base, family: 'Cab', pack: 'Cab', isCab: true, cabSummary: 'Factory 1 4x12', channel: 'A' });
    expect(c).toMatchObject({ sub: 'Cab IR · DynaCab', name: 'Factory 1 4x12', action: 'cab', channel: 'A' });
    expect(typeChip({ ...base, isCab: true, cabSummary: null }).name).toBe('Browse cabinet library');
  });
});
