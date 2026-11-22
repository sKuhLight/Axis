import { describe, expect, it } from 'vitest';
import {
  activeWorkbenchPage,
  createEmptyWorkbenchDocument,
  liftPanelFromDock,
  reduceWorkbenchDocument,
  selectActiveLayout,
  type DockLayout,
  type DockNode,
  type DockRegionId,
  type PanelInstance,
  type TabStackDockNode,
  type WorkbenchCommand,
  type WorkbenchDocument
} from '../../core';
import {
  completeDockDropGeometry,
  dockDropCommand,
  landingRect,
  type DockDropGeometry,
  type DockDropTarget,
  type DockStackSlot
} from '../dockDropTarget';
import { layoutDockWorkspace, stackActivePanelId } from '../dockLayout';
import type { WorkbenchRect } from '../drag';

/**
 * Round trip of the "the highlighted rect IS the result" promise, without a DOM:
 *   1. lift the dragged panel out of the dock (as the drag renders it),
 *   2. lay the lifted dock out with the flex mirror (`layoutDockWorkspace`) and
 *      complete it into a drop geometry (what `collectDockDropGeometry` builds
 *      from the real DOM),
 *   3. `landingRect(target)`,
 *   4. apply the REAL reducer command (`dockDropCommand`) and lay the result out,
 *   5. the dropped panel's stack rect must equal the landing rect.
 */

const WS: WorkbenchRect = { left: 72, top: 100, width: 1368, height: 700 };

const panel = (id: string, extra: Partial<PanelInstance> = {}): PanelInstance => ({ id, type: 't.panel', title: id, ...extra });

function build(commands: WorkbenchCommand[]): WorkbenchDocument {
  let doc = createEmptyWorkbenchDocument({ profileId: 'profile.t', layoutId: 'layout.t' });
  for (const command of commands) {
    const result = reduceWorkbenchDocument(doc, command);
    expect(result.success, JSON.stringify(result.error)).toBe(true);
    doc = result.next;
  }
  return doc;
}

function stacksOf(dock: DockLayout): Map<string, TabStackDockNode> {
  const out = new Map<string, TabStackDockNode>();
  const walk = (node: DockNode | null) => {
    if (!node) return;
    if (node.kind === 'tabs') out.set(node.id, node);
    else node.children.forEach(walk);
  };
  for (const region of Object.keys(dock.root) as DockRegionId[]) walk(dock.root[region]);
  return out;
}

/** The drop geometry the drag of `panelId` measures (lifted dock, edit mode). */
function measure(doc: WorkbenchDocument, panelId: string): DockDropGeometry {
  const layout = selectActiveLayout(doc)!;
  const dock = liftPanelFromDock(activeWorkbenchPage(layout)!.dock, panelId, { preserveSplits: true, holdActive: true });
  const laid = layoutDockWorkspace(dock, layout.panels, WS);
  const nodes = stacksOf(dock);
  const stacks: DockStackSlot[] = [...laid.stacks].map(([stackId, entry]) => ({
    stackId,
    activePanelId: stackActivePanelId(nodes.get(stackId)!)!,
    rect: entry.rect,
    region: entry.region,
    collapsed: entry.collapsed
  }));
  return completeDockDropGeometry({
    dock,
    panels: layout.panels,
    measured: {
      workspace: WS,
      stacks,
      emptyRegions: laid.emptyRegions,
      collapsedRegions: laid.collapsedRegions,
      pages: [],
      regionRects: laid.regionRects,
      regionContentRects: laid.regionContentRects
    }
  });
}

/** The rect of the stack holding `panelId` once `doc` is laid out. */
function rectOfPanel(doc: WorkbenchDocument, panelId: string): WorkbenchRect | undefined {
  const layout = selectActiveLayout(doc)!;
  const dock = activeWorkbenchPage(layout)!.dock;
  const laid = layoutDockWorkspace(dock, layout.panels, WS);
  for (const [id, node] of stacksOf(dock)) if (node.panelIds.includes(panelId)) return laid.stacks.get(id)?.rect;
  return undefined;
}

function stackIdOf(doc: WorkbenchDocument, panelId: string): string {
  const dock = activeWorkbenchPage(selectActiveLayout(doc)!)!.dock;
  for (const [id, node] of stacksOf(dock)) if (node.panelIds.includes(panelId)) return id;
  throw new Error(`no stack for ${panelId}`);
}

function expectRoundTrip(doc: WorkbenchDocument, panelId: string, target: DockDropTarget): void {
  const geometry = measure(doc, panelId);
  const land = landingRect(target, geometry);
  expect(land, 'landing').not.toBeNull();
  const command = dockDropCommand(panelId, target)!;
  const result = reduceWorkbenchDocument(doc, command);
  expect(result.success, JSON.stringify(result.error)).toBe(true);
  const after = rectOfPanel(result.next, panelId)!;
  expect(after, 'dropped stack').toBeDefined();
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    expect(after[key], `${key}: landing ${JSON.stringify(land)} vs result ${JSON.stringify(after)}`).toBeCloseTo(land![key], 6);
  }
}

const zone = (doc: WorkbenchDocument, targetPanelId: string, z: 'top' | 'left' | 'center' | 'right' | 'bottom', region: DockRegionId, small = false): DockDropTarget => ({
  kind: 'zone',
  stackId: stackIdOf(doc, targetPanelId),
  targetPanelId,
  region,
  zone: z,
  small
});

describe('landing rect round trip (reducer + flex mirror)', () => {
  it('a split inside a same-axis split lands on the matching half of the target', () => {
    const doc = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('scenes'), region: 'main', target: { kind: 'split', targetPanelId: 'grid', axis: 'horizontal', position: 'after' } },
      { type: 'panel.add', panel: panel('p'), region: 'bottom' }
    ]);
    for (const z of ['right', 'left', 'top', 'bottom'] as const) expectRoundTrip(doc, 'p', zone(doc, 'scenes', z, 'main'));
  });

  it('an edge drop on an occupied region lands on its outer half', () => {
    const doc = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('left'), region: 'left' },
      { type: 'panel.add', panel: panel('right'), region: 'right' },
      { type: 'panel.add', panel: panel('top'), region: 'top' },
      { type: 'panel.add', panel: panel('bottom'), region: 'bottom' },
      { type: 'panel.add', panel: panel('p'), region: 'main', target: { kind: 'tab', targetPanelId: 'grid' } }
    ]);
    for (const region of ['left', 'right', 'top', 'bottom'] as const) expectRoundTrip(doc, 'p', { kind: 'edge', region, empty: false });
  });

  it('an edge drop on an empty region lands on its band', () => {
    const doc = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('p'), region: 'bottom' }
    ]);
    for (const region of ['left', 'right', 'top'] as const) expectRoundTrip(doc, 'p', { kind: 'edge', region, empty: true });
  });

  it('a drop into a user-collapsed region expands it and lands exactly', () => {
    const occupied = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('side'), region: 'left' },
      { type: 'panel.add', panel: panel('p'), region: 'bottom' },
      { type: 'region.collapse', region: 'left', collapsed: true }
    ]);
    expectRoundTrip(occupied, 'p', { kind: 'edge', region: 'left', empty: false });
    const empty = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('p'), region: 'bottom' },
      { type: 'region.collapse', region: 'right', collapsed: true }
    ]);
    expectRoundTrip(empty, 'p', { kind: 'edge', region: 'right', empty: true });
  });

  it('a collapsed panel arrives expanded where the landing showed it', () => {
    const doc = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('p', { collapsed: true }), region: 'bottom' }
    ]);
    expectRoundTrip(doc, 'p', zone(doc, 'grid', 'right', 'main'));
    expectRoundTrip(doc, 'p', { kind: 'edge', region: 'left', empty: true });
  });

  it('a tab into a collapsed stack lands on the stack it expands into', () => {
    const lone = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('editor', { collapsed: true }), region: 'right' },
      { type: 'panel.add', panel: panel('p'), region: 'bottom' }
    ]);
    expectRoundTrip(lone, 'p', zone(lone, 'editor', 'center', 'right', true));

    const inSplit = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('editor', { collapsed: true }), region: 'main', target: { kind: 'split', targetPanelId: 'grid', axis: 'vertical', position: 'after' } },
      { type: 'panel.add', panel: panel('p'), region: 'bottom' }
    ]);
    expectRoundTrip(inSplit, 'p', zone(inSplit, 'editor', 'center', 'main', true));
  });

  it('a held stack whose next tab is collapsed is already a strip in the lifted layout', () => {
    // [X(collapsed), P(active)] beside grid; dragging P out leaves X active → a strip,
    // so grid's slot (and the landing beside it) is already the post-drop size.
    const doc = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('x', { collapsed: true }), region: 'main', target: { kind: 'split', targetPanelId: 'grid', axis: 'horizontal', position: 'after' } },
      { type: 'panel.add', panel: panel('p'), region: 'main', target: { kind: 'tab', targetPanelId: 'x' } }
    ]);
    for (const z of ['bottom', 'right', 'center'] as const) expectRoundTrip(doc, 'p', zone(doc, 'grid', z, 'main'));
  });

  it('dragging the active tab out of a multi-tab stack keeps the geometry (held stack)', () => {
    const doc = build([
      { type: 'panel.add', panel: panel('grid'), region: 'main' },
      { type: 'panel.add', panel: panel('p'), region: 'main', target: { kind: 'tab', targetPanelId: 'grid' } }
    ]);
    // p is the active tab of the main stack; the lifted stack holds (shows grid's pill, mounts nothing).
    expectRoundTrip(doc, 'p', { kind: 'edge', region: 'right', empty: true });
    expectRoundTrip(doc, 'p', zone(doc, 'grid', 'bottom', 'main'));
  });
});
