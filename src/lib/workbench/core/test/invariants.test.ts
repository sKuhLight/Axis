import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import { createWorkbenchId, reserveWorkbenchIds } from '../ids';
import { repairWorkbenchDocument, validateWorkbenchDocument } from '../invariants';
import type { DockNode, WorkbenchDocument } from '../schema';
import { activeWorkbenchPage, selectActiveLayout, allPanelIdsInDock } from '../selectors';

const doc = (): WorkbenchDocument =>
  createEmptyWorkbenchDocument({
    profileId: 'profile.test',
    layoutId: 'layout.test'
  });

const layout = (d: WorkbenchDocument) => selectActiveLayout(d)!;
// Pages (schema v2): dock-scoped assertions read the ACTIVE page's dock.
const dock = (d: WorkbenchDocument) => activeWorkbenchPage(layout(d))!.dock;
const tabs = (id: string, panelIds: string[], activePanelId = panelIds[0]): DockNode => ({ kind: 'tabs', id, panelIds, activePanelId });

const collectNodeIds = (node: DockNode | null, ids: string[] = []): string[] => {
  if (!node) return ids;
  ids.push(node.id);
  if (node.kind === 'split') for (const child of node.children) collectNodeIds(child, ids);
  return ids;
};

const collectPanelIdsOf = (node: DockNode | null): string[] => {
  if (!node) return [];
  if (node.kind === 'tabs') return [...node.panelIds];
  return node.children.flatMap(collectPanelIdsOf);
};

describe('Workbench invariants', () => {
  it('detects duplicate panel references in the dock tree', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    dock(next).root.main = tabs('tabs.main', ['a']);
    dock(next).root.right = tabs('tabs.right', ['a']);

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'duplicate-panel-reference')).toBe(true);
  });

  it('repairs duplicate panel references in the dock tree', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    dock(next).root.main = tabs('tabs.main', ['a']);
    dock(next).root.right = tabs('tabs.right', ['a']);

    const repaired = repairWorkbenchDocument(next);

    expect(allPanelIdsInDock(layout(repaired))).toEqual(['a']);
  });

  it('repairs invalid active tabs', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    dock(next).root.main = tabs('tabs.main', ['a'], 'missing');

    const repaired = repairWorkbenchDocument(next);
    const root = dock(repaired).root.main;

    expect(root?.kind).toBe('tabs');
    if (root?.kind === 'tabs') expect(root.activePanelId).toBe('a');
  });

  it('normalizes split ratios', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).panels.b = { id: 'b', type: 'unknown.panel' };
    dock(next).root.main = {
      kind: 'split',
      id: 'split.main',
      axis: 'horizontal',
      ratio: [1],
      children: [tabs('tabs.a', ['a']), tabs('tabs.b', ['b'])]
    };

    const repaired = repairWorkbenchDocument(next);
    const root = dock(repaired).root.main;

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
    dock(next).root.main = tabs('tabs-0001', ['a']);
    dock(next).root.right = tabs('tabs-0001', ['b']);

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'duplicate-node-id')).toBe(true);
  });

  it('detects duplicate dock node ids in nested splits', () => {
    const next = doc();
    layout(next).panels.a = { id: 'a', type: 'unknown.panel' };
    layout(next).panels.b = { id: 'b', type: 'unknown.panel' };
    dock(next).root.main = {
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
    dock(next).root.main = tabs('tabs-0001', ['a']);
    dock(next).root.right = tabs('tabs-0001', ['b']);

    const repaired = repairWorkbenchDocument(next);

    const nodeIds = [
      ...collectNodeIds(dock(repaired).root.main),
      ...collectNodeIds(dock(repaired).root.right)
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
    dock(next).root.main = tabs('tabs-0007', ['a']);

    const repaired = repairWorkbenchDocument(next);

    const existing = new Set([
      ...collectNodeIds(dock(repaired).root.main),
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

  it('wraps a legacy single-dock layout (zero pages) into one default page', () => {
    const next = doc();
    const l = layout(next);
    l.panels.a = { id: 'a', type: 'unknown.panel' };
    // Simulate a schema-v1 layout: dock on the layout, no pages.
    const legacyDock = l.pages[l.activePageId].dock;
    legacyDock.root.main = tabs('tabs.legacy', ['a']);
    l.dock = legacyDock;
    (l as { pages?: unknown }).pages = undefined;
    (l as { pageOrder?: unknown }).pageOrder = undefined;
    (l as { activePageId?: unknown }).activePageId = undefined;

    const repaired = repairWorkbenchDocument(next);
    const rl = layout(repaired);

    expect(Object.keys(rl.pages)).toEqual(['main']);
    expect(rl.pages.main.label).toBe('Main');
    expect(rl.pageOrder).toEqual(['main']);
    expect(rl.activePageId).toBe('main');
    // The whole legacy dock IS the one page — renders exactly as before.
    expect(rl.pages.main.dock.root.main).toMatchObject({ kind: 'tabs', panelIds: ['a'] });
    // The deprecated layout-level dock is consumed and removed.
    expect(rl.dock).toBeUndefined();
    expect('dock' in rl).toBe(false);
  });

  it('is idempotent over the pages migration (repair twice == repair once)', () => {
    const next = doc();
    const l = layout(next);
    l.panels.a = { id: 'a', type: 'unknown.panel' };
    l.pages[l.activePageId].dock.root.main = tabs('tabs.legacy', ['a']);
    l.dock = l.pages[l.activePageId].dock;
    (l as { pages?: unknown }).pages = undefined;

    const once = repairWorkbenchDocument(next);
    const twice = repairWorkbenchDocument(once);
    expect(twice).toEqual(once);
  });

  it('repairs a dangling activePageId to the first page in order', () => {
    const next = doc();
    layout(next).activePageId = 'missing.page';

    const repaired = repairWorkbenchDocument(next);
    expect(layout(repaired).activePageId).toBe(layout(repaired).pageOrder[0]);
  });

  it('dedupes and completes pageOrder', () => {
    const next = doc();
    const l = layout(next);
    const active = l.activePageId;
    l.pages['page.extra'] = { id: 'page.extra', label: 'Extra', dock: structuredClone(l.pages[active].dock) };
    // Duplicate + missing entries; page.extra omitted entirely.
    l.pageOrder = [active, active, 'missing.page'];

    const repaired = repairWorkbenchDocument(next);
    expect(layout(repaired).pageOrder).toEqual([active, 'page.extra']);
  });

  it('keeps a panel docked on two pages only in the FIRST page (by order)', () => {
    const next = doc();
    const l = layout(next);
    l.panels.a = { id: 'a', type: 'unknown.panel' };
    const active = l.activePageId;
    l.pages[active].dock.root.main = tabs('tabs.first', ['a']);
    const secondDock = structuredClone(l.pages[active].dock);
    secondDock.root.main = tabs('tabs.second', ['a']);
    l.pages['page.second'] = { id: 'page.second', label: 'Second', dock: secondDock };
    l.pageOrder = [active, 'page.second'];

    const validation = validateWorkbenchDocument(next);
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'duplicate-panel-reference')).toBe(true);

    const repaired = repairWorkbenchDocument(next);
    const rl = layout(repaired);
    expect(collectPanelIdsOf(rl.pages[active].dock.root.main)).toEqual(['a']);
    expect(collectPanelIdsOf(rl.pages['page.second'].dock.root.main)).toEqual([]);
  });

  it('drops a dangling nav page binding but keeps the entry when it has a command target', () => {
    const next = doc();
    const l = layout(next);
    l.navigation.entries.hybrid = { id: 'hybrid', label: 'Hybrid', pageId: 'missing.page', target: { command: 'app.open' } };
    l.navigation.order = ['hybrid'];

    const repaired = repairWorkbenchDocument(next);
    const entry = layout(repaired).navigation.entries.hybrid;
    expect(entry).toBeDefined();
    expect(entry.pageId).toBeUndefined();
    expect(entry.target).toEqual({ command: 'app.open' });
  });

  it('removes a pure page entry whose page is gone (no other purpose)', () => {
    const next = doc();
    const l = layout(next);
    l.navigation.entries['page:gone'] = { id: 'page:gone', label: 'Gone', pageId: 'missing.page' };
    l.navigation.order = ['page:gone'];

    const validation = validateWorkbenchDocument(next);
    expect(validation.issues.some((issue) => issue.code === 'missing-navigation-page')).toBe(true);

    const repaired = repairWorkbenchDocument(next);
    expect(layout(repaired).navigation.entries['page:gone']).toBeUndefined();
    expect(layout(repaired).navigation.order).not.toContain('page:gone');
  });

  it('flags layouts without pages and dangling activePageId in validation', () => {
    const withDangling = doc();
    layout(withDangling).activePageId = 'missing.page';
    expect(validateWorkbenchDocument(withDangling).issues.some((issue) => issue.code === 'active-page-missing')).toBe(true);

    const next = doc();
    (layout(next) as unknown as { pages: Record<string, unknown> }).pages = {};
    expect(validateWorkbenchDocument(next).issues.some((issue) => issue.code === 'missing-pages')).toBe(true);
  });

  it('validates JSON serializability', () => {
    const next = doc() as WorkbenchDocument & { bad?: unknown };
    next.bad = () => 'nope';

    const validation = validateWorkbenchDocument(next);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'not-json-serializable')).toBe(true);
  });
});
