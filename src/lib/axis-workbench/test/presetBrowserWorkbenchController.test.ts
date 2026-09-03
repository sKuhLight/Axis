import { describe, expect, it } from 'vitest';
import { AxisPresetBrowserWorkbenchController } from '../presetBrowser/presetBrowserWorkbenchController';

describe('Preset Browser controller shared state (§1, §2)', () => {
  it('derives active conditions only from `` `...` `` spans in the query', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('`AMP(TYPE=5153)  +  tag:Lead`');
    expect(c.activeConditions.map((cond) => cond.kind)).toEqual(['block', 'tag']);
  });

  it('treats text outside backticks as free text, not a filter', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('tag:Lead');
    expect(c.activeConditions).toEqual([]);
    expect(c.freeText).toBe('tag:Lead');
  });

  it('editConds writes a canonical backtick block and preserves free text', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('lead tone');
    c.editConds((conds) => conds.push({ kind: 'tag', val: 'Lead' }));
    expect(c.snapshot.queryText).toBe('lead tone `tag:Lead`');
    expect(c.freeText).toBe('lead tone');
    expect(c.activeConditions).toEqual([{ kind: 'tag', val: 'Lead' }]);
  });

  it('editConds re-serializes an existing block condition', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('`AMP`');
    c.editConds((conds) => {
      const blk = conds.find((x) => x.kind === 'block');
      if (blk && blk.kind === 'block') blk.params.push({ name: 'GAIN', op: '>', val: '7' });
    });
    expect(c.snapshot.queryText).toBe('`AMP(GAIN>7)`');
  });

  it('toggles a tag condition on and off, preserving free text', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('clean');
    c.toggleTag('Lead');
    expect(c.freeText).toBe('clean');
    expect(c.activeConditions).toEqual([{ kind: 'tag', val: 'Lead' }]);
    c.toggleTag('Lead');
    expect(c.freeText).toBe('clean');
    expect(c.activeConditions).toEqual([]);
  });

  it('applyQueryText wraps saved-filter text in backticks, replacing free text', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('lead tone');
    c.applyQueryText('AMP  +  tag:Lead');
    expect(c.snapshot.queryText).toBe('`AMP  +  tag:Lead`');
    expect(c.activeConditions.map((cond) => cond.kind)).toEqual(['block', 'tag']);
  });

  it('currentQueryText saves condition-only text, no backticks or free text', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('lead tone `AMP  +  tag:Lead`');
    expect(c.currentQueryText()).toBe('AMP  +  tag:Lead');
  });

  it('marks a range in display order for shift-click', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    const order = ['a', 'b', 'c', 'd'];
    c.toggleMark('a'); // sets anchor
    c.markRange(order, 'c');
    expect(Object.keys(c.snapshot.marked).sort()).toEqual(['a', 'b', 'c']);
    c.clearMarks();
    expect(c.snapshot.marked).toEqual({});
  });

  it('resets direction to the field natural default when the sort field changes', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    expect(c.snapshot.sort).toBe('num');
    expect(c.snapshot.sortDir).toBe('asc');

    c.setSortDir('desc');
    expect(c.snapshot.sortDir).toBe('desc');

    c.setSort('cpu'); // CPU naturally sorts high-first
    expect(c.snapshot.sort).toBe('cpu');
    expect(c.snapshot.sortDir).toBe('desc');

    c.setSort('name'); // A-Z naturally sorts ascending
    expect(c.snapshot.sortDir).toBe('asc');
  });

  it('flips the direction without touching the sort field', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setSortDir('desc');
    expect(c.snapshot.sort).toBe('num');
    expect(c.snapshot.sortDir).toBe('desc');
    c.setSortDir('asc');
    expect(c.snapshot.sortDir).toBe('asc');
  });

  it('elects the lowest-rank registered part as overlay owner', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    const unSources = c.registerPart('sources');
    expect(c.snapshot.owner).toBe('sources');
    const unList = c.registerPart('list');
    expect(c.snapshot.owner).toBe('list');
    expect(c.isOwner('list')).toBe(true);
    expect(c.isOwner('sources')).toBe(false);
    unList();
    expect(c.snapshot.owner).toBe('sources');
    unSources();
    expect(c.snapshot.owner).toBeNull();
  });
});
