import { describe, expect, it } from 'vitest';
import { createEmptyDockLayout, selectActiveLayout, type DockNode } from '../../workbench';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { AXIS_PAGE_GRID, buildAxisSeedPages } from '../axisWorkbenchPages';
import {
  axisMyControlsWidgetCount,
  ensureAxisMyControlsPanel,
  hasAxisMyControlsPanel,
  AXIS_MY_CONTROLS_PANEL_ID,
  AXIS_MY_CONTROLS_ZONE
} from '../myControlsPanel';

const tabs = (panelIds: string[]): DockNode => ({
  kind: 'tabs',
  id: `tabs-${panelIds.join('-')}`,
  panelIds,
  activePanelId: panelIds[0]
});

/** A doc whose Grid page docks exactly the panels given in its right region. */
function docWithRight(right: DockNode | undefined) {
  const doc = createAxisWorkbenchDefaultDocument();
  const layout = selectActiveLayout(doc)!;
  const dock = createEmptyDockLayout();
  dock.root.main = tabs(['axis.blockEditor']);
  if (right) dock.root.right = right;
  const seeded = buildAxisSeedPages(dock);
  layout.pages = seeded.pages;
  layout.pageOrder = seeded.pageOrder;
  layout.activePageId = seeded.activePageId;
  delete layout.panels[AXIS_MY_CONTROLS_PANEL_ID];
  delete layout.zones[AXIS_MY_CONTROLS_ZONE];
  return doc;
}

const gridRight = (doc: ReturnType<typeof docWithRight>) => {
  const node = selectActiveLayout(doc)!.pages[AXIS_PAGE_GRID].dock.root.right;
  return node?.kind === 'tabs' ? node : undefined;
};

describe('My Controls panel', () => {
  it('ships docked next to History on the default Grid page', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    expect(hasAxisMyControlsPanel(doc)).toBe(true);
    expect(selectActiveLayout(doc)!.zones[AXIS_MY_CONTROLS_ZONE]).toBeDefined();
    expect(gridRight(doc)?.panelIds).toEqual(['axis.history', AXIS_MY_CONTROLS_PANEL_ID]);
  });

  it('is a fixture: locked, not closable, and reports an empty pin count', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const panel = selectActiveLayout(doc)!.panels[AXIS_MY_CONTROLS_PANEL_ID];
    expect(panel.locked).toBe(true);
    expect(panel.closable).toBe(false);
    expect(panel.singletonKey).toBe(AXIS_MY_CONTROLS_PANEL_ID);
    expect(axisMyControlsWidgetCount(doc)).toBe(0);
  });
});

describe('ensureAxisMyControlsPanel', () => {
  it('tabs the panel in beside an existing History', () => {
    const doc = ensureAxisMyControlsPanel(docWithRight(tabs(['axis.history'])));
    expect(hasAxisMyControlsPanel(doc)).toBe(true);
    expect(gridRight(doc)?.panelIds).toEqual(['axis.history', AXIS_MY_CONTROLS_PANEL_ID]);
  });

  it('creates a right region with History when the Grid page has none', () => {
    const doc = ensureAxisMyControlsPanel(docWithRight(undefined));
    expect(gridRight(doc)?.panelIds).toEqual(['axis.history', AXIS_MY_CONTROLS_PANEL_ID]);
  });

  it('tabs into the right region when it holds something other than History', () => {
    const doc = ensureAxisMyControlsPanel(docWithRight(tabs(['axis.presetBrowser'])));
    expect(gridRight(doc)?.panelIds).toEqual(['axis.presetBrowser', AXIS_MY_CONTROLS_PANEL_ID]);
  });

  it('restores the zone and panel instance a persisted document lost', () => {
    const doc = ensureAxisMyControlsPanel(docWithRight(tabs(['axis.history'])));
    const layout = selectActiveLayout(doc)!;
    expect(layout.panels[AXIS_MY_CONTROLS_PANEL_ID]).toBeDefined();
    expect(layout.zones[AXIS_MY_CONTROLS_ZONE]).toBeDefined();
  });

  it('is idempotent — running it twice equals running it once', () => {
    const once = ensureAxisMyControlsPanel(docWithRight(tabs(['axis.history'])));
    const snapshot = JSON.stringify(once);
    expect(JSON.stringify(ensureAxisMyControlsPanel(once))).toEqual(snapshot);
  });

  it('leaves an already-seeded default document untouched', () => {
    const doc = createAxisWorkbenchDefaultDocument();
    const snapshot = JSON.stringify(doc);
    expect(JSON.stringify(ensureAxisMyControlsPanel(doc))).toEqual(snapshot);
  });
});
