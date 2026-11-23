import { describe, expect, it } from 'vitest';
import { familyLabel } from '../catalog';
import {
  HEADER_NARROW_W,
  HEADER_ONE_ROW_MIN_W,
  HEADER_PARTS,
  HEADER_TINY_W,
  HEADER_XS_W,
  SEARCH_FIELD_MIN_W,
  headerFit,
  headerOrder,
  headerRows,
  oneRowMinWidth,
  stateLabels,
  typeChip
} from './headerModel';

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
    expect(oneRowMinWidth({ nav: 'top', hasEnd: true })).toBe(1240);
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
    expect(stateLabels(1300, false)).toEqual({ engaged: 'Engaged', mute: 'Mute', scene: 'Scene Ignore' });
    expect(stateLabels(1300, true).engaged).toBe('Bypassed');
    expect(stateLabels(600, false).scene).toBe('Ignore');
    expect(stateLabels(390, false)).toEqual({ engaged: 'On', mute: 'Mute', scene: 'Ignore' });
    expect(stateLabels(390, true).engaged).toBe('Byp');
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
