import {
  createWorkbenchId,
  panelIdsInPageDock,
  panelWidgetZoneId,
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  type DockLayout,
  type DockNode,
  type PanelInstance,
  type TabStackDockNode,
  type WidgetZoneState,
  type WorkbenchDocument
} from '../workbench';
import { AXIS_PAGE_GRID } from './axisWorkbenchPages';

/**
 * "My Controls" — the ONE panel a control can be pinned into.
 *
 * Pinning used to spawn panels (a fresh "Controls" panel per pin action, a new
 * panel per dock-edge drop, a new tab per tab-bar drop, plus a menu listing every
 * existing custom panel). With layout editing retired the user cannot close,
 * rename or re-dock what that produced, so the pin flow could only accumulate
 * junk tabs. Every pin path now resolves to this single panel instance.
 *
 * It is a distinct panel TYPE rather than a reuse of `axis.customPanel`: the
 * custom panel stays as the (flag-gated, e2e-covered) edit-mode "＋ Panel"
 * affordance, and pin routing needs to identify its destination structurally.
 * Both types render the same component — a widget-zone grid.
 */
export const AXIS_MY_CONTROLS_PANEL_ID = 'axis.myControls';
export const AXIS_MY_CONTROLS_PANEL_TYPE = 'axis.myControls';
export const AXIS_MY_CONTROLS_TITLE = 'My Controls';
/** Widget zone the pinned controls live in. */
export const AXIS_MY_CONTROLS_ZONE = panelWidgetZoneId(AXIS_MY_CONTROLS_PANEL_ID);

/** Empty-state copy — the only way to fill the panel is the pin menu. */
export const AXIS_MY_CONTROLS_EMPTY_LABEL = 'Right-click a control → Pin to My Controls';

/**
 * The panel instance. `locked` + `closable: false` because it is a fixture of the
 * layout, not something the user adds or removes; two columns because it lives in
 * a dock region, not across the page.
 */
export function axisMyControlsPanel(): PanelInstance {
  return {
    id: AXIS_MY_CONTROLS_PANEL_ID,
    type: AXIS_MY_CONTROLS_PANEL_TYPE,
    title: AXIS_MY_CONTROLS_TITLE,
    singletonKey: AXIS_MY_CONTROLS_PANEL_ID,
    locked: true,
    closable: false,
    collapsible: true,
    state: { grid: { columns: 2, rowHeight: 42, gap: 8 } }
  };
}

export function axisMyControlsZone(): WidgetZoneState {
  return {
    id: AXIS_MY_CONTROLS_ZONE,
    label: AXIS_MY_CONTROLS_TITLE,
    orientation: 'horizontal',
    acceptsGroups: true
  };
}

/** How many controls are pinned right now (the pin menu shows this as a hint). */
export function axisMyControlsWidgetCount(doc: WorkbenchDocument): number {
  return selectVisibleWidgetsByZone(doc, AXIS_MY_CONTROLS_ZONE).length;
}

/** True once the panel instance exists in the active layout's roster. */
export function hasAxisMyControlsPanel(doc: WorkbenchDocument): boolean {
  return !!selectActiveLayout(doc)?.panels[AXIS_MY_CONTROLS_PANEL_ID];
}

/**
 * Self-heal the My Controls panel onto every layout's GRID page: the zone, the
 * panel instance, and one docked slot next to History (or a right region of its
 * own when that page has no History). Marker-free and idempotent, like
 * `ensureAxisConvertPage` — a layout that already carries it is untouched, so a
 * document persisted before this feature repairs itself on load. Runs in the
 * normalization chain after `ensureAxisSeedPages`, which guarantees `pages`.
 */
export function ensureAxisMyControlsPanel(doc: WorkbenchDocument): WorkbenchDocument {
  for (const layout of Object.values(doc.layouts ?? {})) {
    if (!layout || typeof layout !== 'object') continue;
    layout.panels = layout.panels ?? {};
    layout.zones = layout.zones ?? {};
    layout.pages = layout.pages ?? {};

    if (!layout.panels[AXIS_MY_CONTROLS_PANEL_ID]) layout.panels[AXIS_MY_CONTROLS_PANEL_ID] = axisMyControlsPanel();
    if (!layout.zones[AXIS_MY_CONTROLS_ZONE]) layout.zones[AXIS_MY_CONTROLS_ZONE] = axisMyControlsZone();

    const page = layout.pages[AXIS_PAGE_GRID];
    if (!page?.dock?.root) continue;
    if (panelIdsInPageDock(page).includes(AXIS_MY_CONTROLS_PANEL_ID)) continue;

    const historyStack = findTabStackWithPanel(page.dock.root, 'axis.history');
    if (historyStack) {
      historyStack.panelIds.push(AXIS_MY_CONTROLS_PANEL_ID);
      continue;
    }
    if (!page.dock.root.right) {
      page.dock.root.right = {
        kind: 'tabs',
        id: createWorkbenchId('tabs'),
        panelIds: ['axis.history', AXIS_MY_CONTROLS_PANEL_ID],
        activePanelId: 'axis.history'
      };
      continue;
    }
    const right = findFirstTabStack(page.dock.root.right);
    if (right) right.panelIds.push(AXIS_MY_CONTROLS_PANEL_ID);
  }
  return doc;
}

function findTabStackWithPanel(root: DockLayout['root'], panelId: string): TabStackDockNode | null {
  for (const node of Object.values(root)) {
    const found = walkTabStacks(node ?? null, (stack) => stack.panelIds.includes(panelId));
    if (found) return found;
  }
  return null;
}

function findFirstTabStack(node: DockNode | null): TabStackDockNode | null {
  return walkTabStacks(node, () => true);
}

function walkTabStacks(node: DockNode | null, match: (stack: TabStackDockNode) => boolean): TabStackDockNode | null {
  if (!node) return null;
  if (node.kind === 'tabs') return match(node) ? node : null;
  for (const child of node.children) {
    const found = walkTabStacks(child, match);
    if (found) return found;
  }
  return null;
}
