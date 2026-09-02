import type { WorkbenchDocument } from '../workbench';
import { axisMyControlsWidgetCount, AXIS_MY_CONTROLS_TITLE } from './myControlsPanel';

/**
 * The pin destination. There is exactly one — My Controls (see
 * `myControlsPanel.ts`) — so this carries only what the menu renders. It stays a
 * type rather than a bare string so the menu item keeps a live widget count.
 */
export interface AxisPinTarget {
  /** Human label for the menu item. */
  label: string;
  /** Count of controls already pinned. */
  widgetCount: number;
}

export function axisPinTarget(doc: WorkbenchDocument): AxisPinTarget {
  return {
    label: `Pin to ${AXIS_MY_CONTROLS_TITLE}`,
    widgetCount: axisMyControlsWidgetCount(doc)
  };
}
