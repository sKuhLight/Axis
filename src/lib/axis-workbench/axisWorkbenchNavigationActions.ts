import { selectActiveLayout } from '../workbench';
import type {
  DockRegionId,
  JsonObject,
  PanelInstance,
  WorkbenchActionContext,
  WorkbenchActionHandler,
  WorkbenchCommand,
  WorkbenchController
} from '../workbench';

/**
 * Definition for a navigation entry that opens (or focuses) a docked panel instead of
 * firing a "coming soon" toast. Ports the design's `onNav` panel-toggle semantics
 * (01-shell.md §9): a nav click docks the target panel into a region and activates it.
 */
export interface AxisNavigationPanelAction {
  actionId: string;
  panelId: string;
  panelType: string;
  title: string;
  region: DockRegionId;
  state?: JsonObject;
  /** Singleton key of a minted panel (default: `panelId`, like the roster). */
  singletonKey?: string;
}

/** The instance standing for the def: same id, else the one carrying its singleton key. */
function findPanel(controller: WorkbenchController, def: AxisNavigationPanelAction): PanelInstance | undefined {
  const layout = selectActiveLayout(controller.document);
  const key = def.singletonKey ?? def.panelId;
  return layout?.panels[def.panelId] ?? Object.values(layout?.panels ?? {}).find((panel) => panel.singletonKey === key);
}

/** Add the panel if it is missing, otherwise just make it the active tab in its stack. */
function openOrFocusPanel(controller: WorkbenchController, def: AxisNavigationPanelAction): void {
  const existing = findPanel(controller, def);
  if (existing) {
    const result = controller.dispatch({ type: 'panel.activate', panelId: existing.id });
    // A panel can exist but sit outside a tab stack (parked, or on another page);
    // if activation can't find its stack, re-dock it rather than failing silently.
    if (!result.success) {
      controller.dispatch({ type: 'panel.move', panelId: existing.id, to: { kind: 'region', region: def.region } });
    }
    return;
  }
  // Minted WITH its singleton key, so the panel catalog recognises it as the
  // canonical instance (no second "not placed" offer, no keyless twin).
  const panel: PanelInstance = {
    id: def.panelId,
    type: def.panelType,
    title: def.title,
    closable: true,
    collapsible: true,
    singletonKey: def.singletonKey ?? def.panelId,
    ...(def.state ? { state: def.state } : {})
  };
  const command: WorkbenchCommand = { type: 'panel.add', panel, region: def.region };
  controller.dispatch(command);
}

export function createAxisNavigationPanelAction(def: AxisNavigationPanelAction): WorkbenchActionHandler {
  return {
    id: def.actionId,
    run: (context: WorkbenchActionContext) => {
      openOrFocusPanel(context.controller, def);
    }
  };
}
