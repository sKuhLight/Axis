import { describe, expect, it, beforeEach } from 'vitest';
import { AxisPresetBrowserWorkbenchController } from '../presetBrowser/presetBrowserWorkbenchController';
import { AXIS_PB_SEARCH_MODE_KEY } from '../presetBrowser/presetBrowserWorkbenchSearchMode';

// Minimal in-memory localStorage stub for the node test env — the controller reads the sticky
// search mode out of storage in its field initializer.
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0
  } as Storage;
}

// A controller in advanced mode. Simple is the default now, so the query-language tests below opt
// in explicitly rather than leaning on the initial snapshot.
function advancedController(): AxisPresetBrowserWorkbenchController {
  const c = new AxisPresetBrowserWorkbenchController();
  c.toggleAdvanced();
  return c;
}

describe('Preset Browser controller shared state (§1, §2)', () => {
  beforeEach(() => stubStorage());

  it('derives active conditions from the typed query in advanced mode', () => {
    const c = advancedController();
    c.setQuery('AMP(TYPE=5153)  +  tag:Lead');
    expect(c.activeConditions.map((cond) => cond.kind)).toEqual(['block', 'tag']);
  });

  it('converts state across the advanced <-> simple toggle', () => {
    const c = advancedController();
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

  // A tag chip narrows what the user already typed; it must not silently empty the search box and
  // widen the list. The builder chips (editConds) have always left the text alone.
  it('keeps the simple-mode search text when a tag chip is clicked', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.setSimpleQuery('clean');
    c.toggleTag('Lead');
    expect(c.snapshot.simpleQ).toBe('clean');
    expect(c.snapshot.conditions).toEqual([{ kind: 'tag', val: 'Lead' }]);
    c.toggleTag('Lead');
    expect(c.snapshot.simpleQ).toBe('clean');
    expect(c.snapshot.conditions).toEqual([]);
  });

  it('editConds re-serializes to the query in advanced mode', () => {
    const c = advancedController();
    c.setQuery('AMP');
    c.editConds((conds) => {
      const blk = conds.find((x) => x.kind === 'block');
      if (blk && blk.kind === 'block') blk.params.push({ name: 'GAIN', op: '>', val: '7' });
    });
    expect(c.snapshot.query).toBe('AMP(GAIN>7)');
  });

  it('editConds writes the chip list in simple mode', () => {
    const c = new AxisPresetBrowserWorkbenchController(); // simple is the default mode
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

  // ===================== sticky search mode =====================

  it('opens in simple mode for a user who has never toggled', () => {
    expect(new AxisPresetBrowserWorkbenchController().snapshot.advanced).toBe(false);
  });

  it('restores the persisted mode on construction', () => {
    localStorage.setItem(AXIS_PB_SEARCH_MODE_KEY, 'advanced');
    expect(new AxisPresetBrowserWorkbenchController().snapshot.advanced).toBe(true);
  });

  it('persists the mode on an explicit toggle', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.toggleAdvanced();
    expect(localStorage.getItem(AXIS_PB_SEARCH_MODE_KEY)).toBe('advanced');
    c.toggleAdvanced();
    expect(localStorage.getItem(AXIS_PB_SEARCH_MODE_KEY)).toBe('simple');
  });

  // Applying a saved filter switches the live mode but must not rewrite the user's chosen default,
  // or one click on a saved filter would silently make advanced their permanent start mode.
  it('does not persist the advanced switch a saved filter forces', () => {
    const c = new AxisPresetBrowserWorkbenchController();
    c.applyQueryText('AMP  +  tag:Lead');
    expect(c.snapshot.advanced).toBe(true);
    expect(localStorage.getItem(AXIS_PB_SEARCH_MODE_KEY)).toBeNull();
  });
});
