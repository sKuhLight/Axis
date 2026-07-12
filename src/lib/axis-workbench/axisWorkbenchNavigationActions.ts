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
}

function findPanel(controller: WorkbenchController, panelId: string): PanelInstance | undefined {
  const layout = selectActiveLayout(controller.document);
  return layout?.panels[panelId];
}

/** Add the panel if it is missing, otherwise just make it the active tab in its stack. */
function openOrFocusPanel(controller: WorkbenchController, def: AxisNavigationPanelAction): void {
  const existing = findPanel(controller, def.panelId);
  if (existing) {
    const result = controller.dispatch({ type: 'panel.activate', panelId: def.panelId });
    // A panel can exist but sit outside a tab stack (e.g. a floating/detached state);
    // if activation can't find its stack, re-dock it rather than failing silently.
    if (!result.success) {
      controller.dispatch({ type: 'panel.move', panelId: def.panelId, to: { kind: 'region', region: def.region } });
    }
    return;
  }
  const panel: PanelInstance = {
    id: def.panelId,
    type: def.panelType,
    title: def.title,
    closable: true,
    collapsible: true,
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
