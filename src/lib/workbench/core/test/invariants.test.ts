import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import { createWorkbenchId, reserveWorkbenchIds } from '../ids';
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

const collectNodeIds = (node: DockNode | null, ids: string[] = []): string[] => {
  if (!node) return ids;
  ids.push(node.id);
  if (node.kind === 'split') for (const child of node.children) collectNodeIds(child, ids);
  return ids;
};

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

  it('detects duplicate dock node ids across regions', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).panels.b = { id: 'b', type: 'unknown.panel' };
    layout(next).dock.root.main = tabs('tabs-0001', ['a']);
    layout(next).dock.root.right = tabs('tabs-0001', ['b']);

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'duplicate-node-id')).toBe(true);
  });

  it('detects duplicate dock node ids in nested splits', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).panels.b = { id: 'b', type: 'unknown.panel' };
    layout(next).dock.root.main = {
      kind: 'split',
      id: 'dup-0001',
      axis: 'horizontal',
      ratio: [0.5, 0.5],
      children: [tabs('dup-0001', ['a']), tabs('tabs-0002', ['b'])]
    };

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'duplicate-node-id')).toBe(true);
  });

  it('re-mints duplicated dock node ids so the repaired document validates clean', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).panels.b = { id: 'b', type: 'unknown.panel' };
    layout(next).dock.root.main = tabs('tabs-0001', ['a']);
    layout(next).dock.root.right = tabs('tabs-0001', ['b']);

    const repaired = repairWorkbenchDocument(next);

    const nodeIds = [
      ...collectNodeIds(layout(repaired).dock.root.main),
      ...collectNodeIds(layout(repaired).dock.root.right)
    ];
    // The second occurrence must have been re-minted to a different id.
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    // First occurrence is kept as-is; the collision is resolved on the later one.
    expect(nodeIds).toContain('tabs-0001');

    expect(validateWorkbenchDocument(repaired).issues.some((issue) => issue.code === 'duplicate-node-id')).toBe(false);
  });

  it('reserves persisted ids so createWorkbenchId never collides with the loaded document', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).dock.root.main = tabs('tabs-0007', ['a']);

    const repaired = repairWorkbenchDocument(next);

    const existing = new Set([
      ...collectNodeIds(layout(repaired).dock.root.main),
      'tabs-0007'
    ]);

    // Minting a batch of fresh ids must never reproduce one already present in the document.
    // Counters are module-scoped and may already be bumped by other tests, so assert on
    // absence-of-collision rather than an exact next value.
    for (let i = 0; i < 20; i += 1) {
      const minted = createWorkbenchId('tabs');
      expect(existing.has(minted)).toBe(false);
    }
  });

  it('reserveWorkbenchIds bumps the counter past a reserved id', () => {
    // Reserve a deliberately high value; the very next mint for that prefix must exceed it.
    reserveWorkbenchIds(['reserve-9000']);
    const minted = createWorkbenchId('reserve');
    const suffix = Number(minted.split('-')[1]);
    expect(suffix).toBeGreaterThan(9000);
  });

  it('preserves a valid bottom navigation mode', () => {
    const next = doc();
    layout(next).navigation.mode = 'bottom';

    const repaired = repairWorkbenchDocument(next);

    expect(layout(repaired).navigation.mode).toBe('bottom');
  });

  it('repairs an unknown navigation mode back to side', () => {
    const next = doc();
    // Simulate a persisted/plugin document carrying an out-of-union mode value.
    (layout(next).navigation as { mode: string }).mode = 'floating';

    const repaired = repairWorkbenchDocument(next);

    expect(layout(repaired).navigation.mode).toBe('side');
  });

  it('repairs a missing navigation mode to side', () => {
    const next = doc();
    delete (layout(next).navigation as { mode?: string }).mode;

    const repaired = repairWorkbenchDocument(next);

    expect(layout(repaired).navigation.mode).toBe('side');
  });

  it('validates JSON serializability', () => {
    const next = doc() as WorkbenchDocument & { bad?: unknown };
    next.bad = () => 'nope';

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'not-json-serializable')).toBe(true);
  });
});
