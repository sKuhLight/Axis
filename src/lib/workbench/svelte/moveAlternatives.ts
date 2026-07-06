import type { DockRegionId, WidgetZoneId } from '../core';

export interface WorkbenchMoveOption<T extends string = string> {
  id: T;
  label: string;
}

export const PANEL_REGION_MOVE_OPTIONS: readonly WorkbenchMoveOption<DockRegionId>[] = [
  { id: 'left', label: 'Move To Left Dock' },
  { id: 'right', label: 'Move To Right Dock' },
  { id: 'top', label: 'Move To Top Dock' },
  { id: 'bottom', label: 'Move To Bottom Dock' },
  { id: 'main', label: 'Move To Main' }
];

export const WIDGET_ZONE_MOVE_OPTIONS: readonly WorkbenchMoveOption<WidgetZoneId>[] = [
  { id: 'top.left', label: 'Move To Top Left' },
  { id: 'top.center', label: 'Move To Top Center' },
  { id: 'top.right', label: 'Move To Top Right' },
  { id: 'rail', label: 'Move To Rail' },
  { id: 'bottom', label: 'Move To Bottom Bar' },
  { id: 'floating', label: 'Move To Floating' },
  { id: 'hidden', label: 'Hide In Library' }
];

export function nextOrderedIndex(currentIndex: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, currentIndex + direction));
}
