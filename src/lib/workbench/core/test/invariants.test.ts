import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import { repairWorkbenchDocument, validateWorkbenchDocument } from '../invariants';
import type { DockNode, WorkbenchDocument } from '../schema';
import { selectActiveLayout, allPanelIdsInDock } from '../selectors';

const doc = (): WorkbenchDocument =>
  createEmptyWorkbenchDocument({
    profileId: 'profile.test',
    layoutId: 'layout.test'
  });

const layout = (d: WorkbenchDocument) => selectActiveLayout(d)!;
const tabs = (id: string, panelIds: string[], activePanelId = panelIds[0]): DockNode => ({ kind: 'tabs', id, panelIds, activePanelId });

describe('Workbench invariants', () => {
  it('detects duplicate panel references in the dock tree', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).dock.root.main = tabs('tabs.main', ['a']);
    layout(next).dock.root.right = tabs('tabs.right', ['a']);

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'duplicate-panel-reference')).toBe(true);
  });

  it('repairs duplicate panel references in the dock tree', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).dock.root.main = tabs('tabs.main', ['a']);
    layout(next).dock.root.right = tabs('tabs.right', ['a']);

    const repaired = repairWorkbenchDocument(next);

    expect(allPanelIdsInDock(layout(repaired))).toEqual(['a']);
  });

  it('repairs invalid active tabs', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).dock.root.main = tabs('tabs.main', ['a'], 'missing');

    const repaired = repairWorkbenchDocument(next);
    const root = layout(repaired).dock.root.main;

    expect(root?.kind).toBe('tabs');
    if (root?.kind === 'tabs') expect(root.activePanelId).toBe('a');
  });

  it('normalizes split ratios', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).panels.b = { id: 'b', type: 'unknown.panel' };
    layout(next).dock.root.main = {
      kind: 'split',
      id: 'split.main',
      axis: 'horizontal',
      ratio: [1],
      children: [tabs('tabs.a', ['a']), tabs('tabs.b', ['b'])]
    };

    const repaired = repairWorkbenchDocument(next);
    const root = layout(repaired).dock.root.main;

    expect(root?.kind).toBe('split');
    if (root?.kind === 'split') {
      expect(root.ratio).toHaveLength(2);
      expect(root.ratio.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    }
  });

  it('preserves unknown panel and widget instances', () => {
    const next = doc();
    layout(next).panels.unknown = { id: 'unknown', type: 'plugin.panel', state: { hello: 'panel' } };
    layout(next).widgets.unknown = {
      id: 'unknown',
      type: 'plugin.widget',
      zone: 'top.left',
      order: 0,
      size: 'default',
      state: { hello: 'widget' }
    };

    const repaired = repairWorkbenchDocument(next);

    expect(layout(repaired).panels.unknown.state).toEqual({ hello: 'panel' });
    expect(layout(repaired).widgets.unknown.state).toEqual({ hello: 'widget' });
  });

  it('validates JSON serializability', () => {
    const next = doc() as WorkbenchDocument & { bad?: unknown };
    next.bad = () => 'nope';

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'not-json-serializable')).toBe(true);
  });
});
