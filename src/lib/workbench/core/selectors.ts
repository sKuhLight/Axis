import type {
  DockLayout,
  DockNode,
  DockRegionId,
  NavigationEntryState,
  TabStackDockNode,
  WidgetGroup,
  WidgetInstance,
  WidgetZoneId,
  WorkbenchDocument,
  WorkbenchLayout,
  WorkbenchPage,
  WorkbenchProfile
} from './schema';
import { validateWorkbenchDocument } from './invariants';

export interface PanelLocation {
  region: DockRegionId;
  tabStackId: string;
  panelIndex: number;
}

export function selectActiveProfile(doc: WorkbenchDocument): WorkbenchProfile | undefined {
  return doc.profiles[doc.activeProfileId];
}

export function selectActiveLayout(doc: WorkbenchDocument): WorkbenchLayout | undefined {
  const profile = selectActiveProfile(doc);
  return profile ? doc.layouts[profile.layoutId] : undefined;
}

/**
 * The active page of a layout — the page whose dock is currently rendered and
 * the implicit target of every dock-scoped command. Falls back to the first
 * page in order when `activePageId` dangles (repair normally prevents that).
 */
export function activeWorkbenchPage(layout: WorkbenchLayout | undefined): WorkbenchPage | undefined {
  if (!layout) return undefined;
  return layout.pages?.[layout.activePageId] ?? orderedWorkbenchPages(layout)[0];
}

/** Pages of a layout in canonical (pageOrder) order; unlisted pages trail sorted by id. */
export function orderedWorkbenchPages(layout: WorkbenchLayout | undefined): WorkbenchPage[] {
  if (!layout) return [];
  const seen = new Set<string>();
  const pages: WorkbenchPage[] = [];
  for (const id of layout.pageOrder ?? []) {
    const page = layout.pages?.[id];
    if (page && !seen.has(id)) {
      seen.add(id);
      pages.push(page);
    }
  }
  for (const id of Object.keys(layout.pages ?? {}).sort()) {
    if (!seen.has(id)) pages.push(layout.pages[id]);
  }
  return pages;
}

export function selectActivePage(doc: WorkbenchDocument): WorkbenchPage | undefined {
  return activeWorkbenchPage(selectActiveLayout(doc));
}

export function selectOrderedPages(doc: WorkbenchDocument): WorkbenchPage[] {
  return orderedWorkbenchPages(selectActiveLayout(doc));
}

/** The active page's dock (the layout-level single dock is gone since schema v2). */
export function selectActiveDock(doc: WorkbenchDocument): DockLayout | undefined {
  return selectActivePage(doc)?.dock;
}

export function selectDockRegionTree(doc: WorkbenchDocument, region: DockRegionId): DockNode | null {
  return selectActiveDock(doc)?.root[region] ?? null;
}

export function panelIdsInDockTree(node: DockNode | null): string[] {
  if (!node) return [];
  if (node.kind === 'tabs') return [...node.panelIds];
  return node.children.flatMap(panelIdsInDockTree);
}

/** Panel ids docked on ONE page. */
export function panelIdsInPageDock(page: WorkbenchPage): string[] {
  return Object.values(page.dock.root).flatMap(panelIdsInDockTree);
}

/** Panel ids docked anywhere in the layout — the union across ALL pages. */
export function allPanelIdsInDock(layout: WorkbenchLayout): string[] {
  return orderedWorkbenchPages(layout).flatMap(panelIdsInPageDock);
}

export function findTabStackById(node: DockNode | null, tabStackId: string): TabStackDockNode | undefined {
  if (!node) return undefined;
  if (node.kind === 'tabs') return node.id === tabStackId ? node : undefined;
  for (const child of node.children) {
    const found = findTabStackById(child, tabStackId);
    if (found) return found;
  }
  return undefined;
}

export function selectTabStackById(doc: WorkbenchDocument, tabStackId: string): TabStackDockNode | undefined {
  const dock = selectActiveDock(doc);
  if (!dock) return undefined;
  for (const node of Object.values(dock.root)) {
    const found = findTabStackById(node, tabStackId);
    if (found) return found;
  }
  return undefined;
}

function findPanelInNode(node: DockNode | null, panelId: string): Omit<PanelLocation, 'region'> | undefined {
  if (!node) return undefined;
  if (node.kind === 'tabs') {
    const panelIndex = node.panelIds.indexOf(panelId);
    return panelIndex >= 0 ? { tabStackId: node.id, panelIndex } : undefined;
  }
  for (const child of node.children) {
    const found = findPanelInNode(child, panelId);
    if (found) return found;
  }
  return undefined;
}

/** Locate a panel within the ACTIVE page's dock (panels on other pages resolve undefined). */
export function selectPanelLocation(doc: WorkbenchDocument, panelId: string): PanelLocation | undefined {
  const dock = selectActiveDock(doc);
  if (!dock) return undefined;
  for (const [region, node] of Object.entries(dock.root) as [DockRegionId, DockNode | null][]) {
    const found = findPanelInNode(node, panelId);
    if (found) return { region, ...found };
  }
  return undefined;
}

export function selectVisibleWidgetsByZone(doc: WorkbenchDocument, zone: WidgetZoneId): WidgetInstance[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  return Object.values(layout.widgets)
    .filter((widget) => widget.zone === zone && widget.zone !== 'hidden')
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function selectHiddenWidgets(doc: WorkbenchDocument): WidgetInstance[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  return Object.values(layout.widgets)
    .filter((widget) => widget.zone === 'hidden')
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function selectWidgetGroup(doc: WorkbenchDocument, groupId: string): WidgetGroup | undefined {
  return selectActiveLayout(doc)?.widgetGroups[groupId];
}

export function selectVisibleNavigationEntries(doc: WorkbenchDocument): NavigationEntryState[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  const ordered = layout.navigation.order
    .map((id) => layout.navigation.entries[id])
    .filter((entry): entry is NavigationEntryState => !!entry && !entry.hidden);
  const orderedIds = new Set(ordered.map((entry) => entry.id));
  const rest = Object.values(layout.navigation.entries)
    .filter((entry) => !entry.hidden && !orderedIds.has(entry.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...ordered, ...rest];
}

export function selectLockedNavigationEntries(doc: WorkbenchDocument): NavigationEntryState[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  return Object.values(layout.navigation.entries).filter((entry) => entry.locked || (entry.fixedSlot && entry.fixedSlot !== 'none'));
}

export function selectLayoutInvariantSummary(doc: WorkbenchDocument): {
  valid: boolean;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  panelReferenceCount: number;
} {
  const layout = selectActiveLayout(doc);
  const validation = validateWorkbenchDocument(doc);
  return {
    valid: validation.valid,
    issueCount: validation.issues.length,
    errorCount: validation.issues.filter((issue) => issue.severity === 'error').length,
    warningCount: validation.issues.filter((issue) => issue.severity === 'warning').length,
    panelReferenceCount: layout ? allPanelIdsInDock(layout).length : 0
  };
}
