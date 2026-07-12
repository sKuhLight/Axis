import type { WorkbenchMenuItem } from '../workbench';
import { axisPinTargets, type AxisPinTarget } from './pinTargets';
import type { WorkbenchDocument } from '../workbench';

/**
 * Build the "Pin to custom panel" context/action-sheet menu for a pinnable
 * control. Existing custom panels come first (with their current widget count as
 * a hint), then a separated "New custom panel" entry. Each item invokes `onPick`
 * with the chosen target so the caller can route it through
 * `AXIS_PIN_SELECTED_PARAMETERS_ACTION` (panelId set = append, null = new panel).
 */
export function buildAxisPinMenuItems(
  doc: WorkbenchDocument,
  onPick: (target: AxisPinTarget) => void
): WorkbenchMenuItem[] {
  const targets = axisPinTargets(doc);
  return targets.map((target, index): WorkbenchMenuItem => {
    const isNew = target.panelId == null;
    return {
      id: isNew ? 'pin.new' : `pin.panel.${target.panelId}`,
      label: target.label,
      hint: isNew ? '+' : String(target.widgetCount),
      separatorBefore: isNew && index > 0,
      run: () => onPick(target)
    };
  });
}
