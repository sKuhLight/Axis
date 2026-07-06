import {
  panelWidgetZoneId,
  selectActiveLayout,
  selectVisibleWidgetsByZone,
  type WorkbenchDocument
} from '../workbench';

export const AXIS_CUSTOM_PANEL_TYPE = 'axis.customPanel';

/**
 * A custom panel that a parameter can be pinned into, plus the new-panel
 * sentinel. This is the touch/context-menu equivalent of the HTML5 drag path:
 * dropping onto a panel appends into it, dropping onto an empty region makes a
 * new panel. Pure data — the menu renderer and the pin action both consume it.
 */
export interface AxisPinTarget {
  /** Existing custom panel id, or `null` for "New custom panel". */
  panelId: string | null;
  /** Human label for the menu item. */
  label: string;
  /** Count of widgets already pinned into the panel (0 for the new-panel item). */
  widgetCount: number;
}

/** Sentinel target: create a fresh custom panel (existing pin behavior). */
export const NEW_CUSTOM_PANEL_TARGET: AxisPinTarget = {
  panelId: null,
  label: 'New custom panel',
  widgetCount: 0
};

/**
 * Existing custom panels in the active layout, in dock order-independent but
 * stable (id-sorted) order, each with its current widget count. Callers append
 * {@link NEW_CUSTOM_PANEL_TARGET} to build the full menu.
 */
export function axisCustomPanelPinTargets(doc: WorkbenchDocument): AxisPinTarget[] {
  const layout = selectActiveLayout(doc);
  if (!layout) return [];
  return Object.values(layout.panels)
    .filter((panel) => panel.type === AXIS_CUSTOM_PANEL_TYPE)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((panel) => ({
      panelId: panel.id,
      label: panel.title?.trim() || 'Custom Panel',
      widgetCount: selectVisibleWidgetsByZone(doc, panelWidgetZoneId(panel.id)).length
    }));
}

/**
 * The full ordered pin-target list: existing custom panels first, then the
 * "New custom panel" sentinel last.
 */
export function axisPinTargets(doc: WorkbenchDocument): AxisPinTarget[] {
  return [...axisCustomPanelPinTargets(doc), NEW_CUSTOM_PANEL_TARGET];
}
