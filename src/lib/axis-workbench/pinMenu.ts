import type { WorkbenchDocument, WorkbenchMenuItem } from '../workbench';
import { axisMyControlsSections } from './myControlsSections';
import { axisPinTarget } from './pinTargets';

/**
 * The context / action-sheet menu for a pinnable control. There is still exactly
 * one pin destination — My Controls — so the first item pins to the end of the
 * panel and is hinted with how many controls are already there.
 *
 * When the panel has named sections, each becomes a further item that files the
 * control under it. That is a choice of INSERT POSITION inside the one panel, not
 * a second destination: with layout editing retired the user cannot drag a pinned
 * control into place, so the pin is the only moment the position can be chosen.
 * `onPick` receives the section's header widget id, or `null` for the end.
 *
 * It stays a menu rather than an immediate action so right-click and long-press
 * keep an explicit confirm step.
 */
export function buildAxisPinMenuItems(
  doc: WorkbenchDocument,
  onPick: (sectionId: string | null) => void
): WorkbenchMenuItem[] {
  const target = axisPinTarget(doc);
  const sections = axisMyControlsSections(doc);
  return [
    {
      id: 'pin.myControls',
      label: sections.length ? `${target.label} (end)` : target.label,
      hint: String(target.widgetCount),
      run: () => onPick(null)
    },
    ...sections.map((section, index): WorkbenchMenuItem => ({
      id: `pin.section.${section.headerWidgetId}`,
      label: section.label,
      hint: String(section.controlCount),
      separatorBefore: index === 0,
      run: () => onPick(section.headerWidgetId)
    }))
  ];
}
