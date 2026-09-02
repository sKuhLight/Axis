import type { WorkbenchDocument, WorkbenchMenuItem } from '../workbench';
import { axisPinTarget } from './pinTargets';

/**
 * The context / action-sheet menu for a pinnable control: a single "Pin to My
 * Controls" item, hinted with how many controls are pinned already. It stays a
 * menu rather than an immediate action so right-click and long-press keep an
 * explicit confirm step.
 */
export function buildAxisPinMenuItems(doc: WorkbenchDocument, onPick: () => void): WorkbenchMenuItem[] {
  const target = axisPinTarget(doc);
  return [
    {
      id: 'pin.myControls',
      label: target.label,
      hint: String(target.widgetCount),
      run: onPick
    }
  ];
}
