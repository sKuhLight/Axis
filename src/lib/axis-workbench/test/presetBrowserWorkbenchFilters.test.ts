import { describe, expect, it } from 'vitest';
import {
  addCondFromPayload,
  applyPick,
  buildFiltersContext,
  chipDescriptor,
  opGlyph,
  pickerItems,
  type AxisPbFiltersContext
} from '../presetBrowser/presetBrowserWorkbenchFilters';
import { specsBySlug, type SpecLibEntry } from '../presetBrowser/presetBrowserWorkbenchSpecs';
import type { AxisPbCond } from '../presetBrowser/presetBrowserWorkbenchQuery';

const libEntry: SpecLibEntry = {
  summaryBlockSlugs: ['amp', 'reverb'],
  models: { amp: ['USA Clean'], reverb: ['Large Hall'] },
  blocks: [
    {
      slug: 'amp',
      params: [
        { label: 'Gain', kind: 'float', value: 2, enumLabel: null },
        { label: 'Gain', kind: 'float', value: 10, enumLabel: null }
      ]
    }
  ]
};

const ctx: AxisPbFiltersContext = buildFiltersContext([libEntry], specsBySlug([libEntry]), ['Lead']);

// apply an applyPick result to an empty cond list, return the mutated list
function runPick(kind: Parameters<typeof applyPick>[1], pctx: Parameters<typeof applyPick>[2], v: string, seed: AxisPbCond[] = []) {
  const res = applyPick(ctx, kind, pctx, v);
  if (res.type === 'edit') res.edit(seed);
  return { res, conds: seed };
}

describe('Preset Browser filters picker', () => {
  it('addfilter lists blocks + tag/name/scenes/cpu', () => {
    const items = pickerItems(ctx, 'addfilter', {}, '');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('AMP');
    expect(labels).toContain('tag:');
    expect(labels).toContain('name:');
    expect(labels).toContain('scenes');
    expect(labels).toContain('cpu');
  });

  it('picking cpu/scenes inserts a default condition', () => {
    expect(runPick('addfilter', {}, 'cpu').conds).toEqual([{ kind: 'cpu', op: '<', val: '60' }]);
    expect(runPick('addfilter', {}, 'scenes').conds).toEqual([{ kind: 'scenes', op: '>', val: '4' }]);
  });

  it('picking a block adds an empty block cond', () => {
    expect(runPick('addfilter', {}, 'amp').conds).toEqual([{ kind: 'block', block: 'amp', params: [] }]);
  });

  it('picking tag: chains to the tag picker', () => {
    expect(applyPick(ctx, 'addfilter', {}, 'tag')).toEqual({ type: 'chain', kind: 'tag', ctx: {} });
  });

  it('param pick chains to value; value pick appends the param cond', () => {
    const chain = applyPick(ctx, 'param', { block: 'amp' }, 'Gain');
    expect(chain).toMatchObject({ type: 'chain', kind: 'value', ctx: { block: 'amp', param: 'Gain' } });
    // numeric param default op is '>'
    const seed: AxisPbCond[] = [{ kind: 'block', block: 'amp', params: [] }];
    const { conds } = runPick('value', { block: 'amp', param: 'Gain', ci: 0 }, '10', seed);
    expect(conds).toEqual([{ kind: 'block', block: 'amp', params: [{ name: 'Gain', op: '>', val: '10' }] }]);
  });

  it('addCondFromPayload creates/reuses a block chip and appends a param', () => {
    const conds: AxisPbCond[] = [];
    addCondFromPayload(conds, { slug: 'amp', label: 'Gain', op: '=', val: '7' });
    expect(conds).toEqual([{ kind: 'block', block: 'amp', params: [{ name: 'Gain', op: '=', val: '7' }] }]);
    // dedupes on reuse
    addCondFromPayload(conds, { slug: 'amp', label: 'Gain', op: '=', val: '7' });
    expect((conds[0] as Extract<AxisPbCond, { kind: 'block' }>).params).toHaveLength(1);
  });

  it('opGlyph maps comparison operators to friendly glyphs', () => {
    expect(opGlyph('>=')).toBe('≥');
    expect(opGlyph('<=')).toBe('≤');
    expect(opGlyph('!=')).toBe('≠');
    expect(opGlyph('>')).toBe('>');
  });

  it('chipDescriptor builds block + scalar chips', () => {
    const block = chipDescriptor({ kind: 'block', block: 'amp', params: [{ name: 'Gain', op: '>', val: '7' }] });
    expect(block).toMatchObject({ kind: 'block', block: 'amp', label: 'Amp' });
    expect((block as { params: unknown[] }).params).toEqual([{ name: 'Gain', op: '>', val: '7', glyph: '>' }]);
    expect(chipDescriptor({ kind: 'tag', val: 'Lead' })).toMatchObject({ kind: 'scalar', text: 'Tag: Lead' });
    expect(chipDescriptor({ kind: 'cpu', op: '<', val: '55' })).toMatchObject({ kind: 'scalar', text: '~CPU < 55' });
  });
});
