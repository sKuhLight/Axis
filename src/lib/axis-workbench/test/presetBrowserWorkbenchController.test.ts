import { describe, expect, it } from 'vitest';
import { AxisPresetBrowserWorkbenchController } from '../presetBrowser/presetBrowserWorkbenchController';

describe('Preset Browser controller shared state (§1, §2)', () => {
  it('derives active conditions from the typed query in advanced mode', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('AMP(TYPE=5153)  +  tag:Lead');
    expect(c.activeConditions.map((cond) => cond.kind)).toEqual(['block', 'tag']);
  });

  it('converts state across the advanced <-> simple toggle', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('AMP  +  tag:Lead');
    c.toggleAdvanced(); // advanced -> simple: parses text into conditions, clears query
    expect(c.snapshot.advanced).toBe(false);
    expect(c.snapshot.query).toBe('');
    expect(c.snapshot.conditions.map((cond) => cond.kind)).toEqual(['block', 'tag']);
    c.toggleAdvanced(); // simple -> advanced: serializes conditions back into query
    expect(c.snapshot.advanced).toBe(true);
    expect(c.snapshot.query).toBe('AMP  +  tag:Lead');
    expect(c.snapshot.conditions).toEqual([]);
  });

  it('toggles a tag condition on and off', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.toggleTag('Lead');
    expect(c.activeConditions).toEqual([{ kind: 'tag', val: 'Lead' }]);
    c.toggleTag('Lead');
    expect(c.activeConditions).toEqual([]);
  });

  it('editConds re-serializes to the query in advanced mode', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setQuery('AMP');
    c.editConds((conds) => {
      const blk = conds.find((x) => x.kind === 'block');
      if (blk && blk.kind === 'block') blk.params.push({ name: 'GAIN', op: '>', val: '7' });
    });
    expect(c.snapshot.query).toBe('AMP(GAIN>7)');
  });

  it('editConds writes the chip list in simple mode', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.toggleAdvanced(); // -> simple
    c.editConds((conds) => conds.push({ kind: 'tag', val: 'Lead' }));
    expect(c.snapshot.conditions).toEqual([{ kind: 'tag', val: 'Lead' }]);
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
