import {
  createWorkbenchId,
  panelIdsInPageDock,
  panelWidgetZoneId,
  selectActiveLayout,
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
 * Both render a widget-zone grid, but My Controls has its own component
 * (`panels/AxisMyControlsPanel.svelte`) for the section toolbar and empty state.
 *
 * The panel can be divided into sections — see `myControlsSections.ts`. A section
 * is a full-row marker widget in this same zone, not a container, so nothing here
 * changes shape.
 */
export const AXIS_MY_CONTROLS_PANEL_ID = 'axis.myControls';
export const AXIS_MY_CONTROLS_PANEL_TYPE = 'axis.myControls';
export const AXIS_MY_CONTROLS_TITLE = 'My Controls';
/** The History panel — My Controls docks immediately to its left. */
const AXIS_HISTORY_PANEL_ID = 'axis.history';

/** Widget zone the pinned controls live in. */
export const AXIS_MY_CONTROLS_ZONE = panelWidgetZoneId(AXIS_MY_CONTROLS_PANEL_ID);

/** Empty-state copy — the only way to fill the panel is the pin menu. */
export const AXIS_MY_CONTROLS_EMPTY_LABEL = 'Right-click a control → Pin to My Controls';

/**
 * The panel instance. `locked` + `closable: false` because it is a fixture of the
 * layout, not something the user adds or removes.
 *
 * The grid auto-fills columns at least `minColumnWidth` wide rather than pinning a
 * column count: a fixed two columns stretched each tile across half of whatever
 * width the dock region had, which made the knobs far larger than the ones in the
 * block editor. `columns` stays as the fallback for a panel narrower than one
 * column.
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
    // Tile density matches the pinned-parameter panels this replaced: as many
    // ~88px columns as fit, which is four across a docked right region. Two wide
    // columns turned every pinned control into a banner.
    state: { grid: { columns: 4, minColumnWidth: 88, rowHeight: 42, gap: 8 } }
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

    const existing = layout.panels[AXIS_MY_CONTROLS_PANEL_ID];
    if (!existing) layout.panels[AXIS_MY_CONTROLS_PANEL_ID] = axisMyControlsPanel();
    // The grid geometry is a fixture of the panel, not user data — nothing in the
    // UI edits it — so it is re-applied rather than preserved. Without this a
    // document persisted before a geometry change keeps the old columns forever,
    // exactly the way a seed-only change never reaches an existing layout.
    else existing.state = axisMyControlsPanel().state;
    if (!layout.zones[AXIS_MY_CONTROLS_ZONE]) layout.zones[AXIS_MY_CONTROLS_ZONE] = axisMyControlsZone();

    const page = layout.pages[AXIS_PAGE_GRID];
    if (!page?.dock?.root) continue;

    const docked = panelIdsInPageDock(page).includes(AXIS_MY_CONTROLS_PANEL_ID);
    const historyStack = findTabStackWithPanel(page.dock.root, AXIS_HISTORY_PANEL_ID);

    if (historyStack) {
      // Reposition an already-docked panel only when it shares History's stack —
      // one parked in another region is left alone. Tab reorder is edit-mode gated
      // (`TabStack`), so with layout editing retired there is no user arrangement
      // here to overwrite.
      if (!docked || historyStack.panelIds.includes(AXIS_MY_CONTROLS_PANEL_ID)) {
        placeMyControlsBeforeHistory(historyStack);
      }
      continue;
    }
    if (docked) continue;
    if (!page.dock.root.right) {
      page.dock.root.right = {
        kind: 'tabs',
        id: createWorkbenchId('tabs'),
        panelIds: [AXIS_MY_CONTROLS_PANEL_ID, AXIS_HISTORY_PANEL_ID],
        activePanelId: AXIS_HISTORY_PANEL_ID
      };
      continue;
    }
    const right = findFirstTabStack(page.dock.root.right);
    if (right) right.panelIds.push(AXIS_MY_CONTROLS_PANEL_ID);
  }
  return doc;
}

/**
 * My Controls sits immediately LEFT of History: it is the tab the user reaches
 * for, History is the log beside it. Rewrites the whole list rather than
 * splicing in place so a panel already sitting to History's right moves, which
 * makes the step idempotent for documents seeded before this order.
 */
function placeMyControlsBeforeHistory(stack: TabStackDockNode): void {
  const others = stack.panelIds.filter((panelId) => panelId !== AXIS_MY_CONTROLS_PANEL_ID);
  const historyIndex = others.indexOf(AXIS_HISTORY_PANEL_ID);
  others.splice(historyIndex < 0 ? others.length : historyIndex, 0, AXIS_MY_CONTROLS_PANEL_ID);
  stack.panelIds = others;
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
