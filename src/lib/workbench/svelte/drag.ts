import type { DockAxis, DockRegionId, DockTarget, FloatingRect, WorkbenchCommand, WidgetZoneId } from '../core';

export interface WorkbenchPointer {
  x: number;
  y: number;
}

export interface WorkbenchRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type WorkbenchDragState =
  | {
      kind: 'panel';
      panelId: string;
      pointer: WorkbenchPointer;
      startedAt: WorkbenchPointer;
      targetLabel?: string;
      previewRect?: WorkbenchRect;
      previewKind?: 'region' | 'tab' | 'split';
    }
  | {
      kind: 'widget';
      widgetIds: string[];
      pointer: WorkbenchPointer;
      startedAt: WorkbenchPointer;
      targetLabel?: string;
      previewRect?: WorkbenchRect;
      previewKind?: 'zone' | 'insert' | 'group';
      previewOrientation?: 'horizontal' | 'vertical';
    };

export type PanelDropIntent =
  | { kind: 'region'; region: DockRegionId; index?: number }
  | { kind: 'tab'; tabStackId: string; index?: number }
  | { kind: 'split'; region?: DockRegionId; targetPanelId?: string; axis: DockAxis; position: 'before' | 'after' };

export interface WidgetDropIntent {
  zone: WidgetZoneId;
  index?: number;
  floatingRect?: FloatingRect;
}

export function pointerDistance(a: WorkbenchPointer, b: WorkbenchPointer): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function splitIntentFromRect(
  pointer: WorkbenchPointer,
  rect: WorkbenchRect,
  targetPanelId: string,
  region?: DockRegionId
): Extract<PanelDropIntent, { kind: 'split' }> | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (pointer.x - rect.left) / rect.width;
  const y = (pointer.y - rect.top) / rect.height;
  const edge = 0.24;
  if (x < edge) return { kind: 'split', region, targetPanelId, axis: 'horizontal', position: 'before' };
  if (x > 1 - edge) return { kind: 'split', region, targetPanelId, axis: 'horizontal', position: 'after' };
  if (y < edge) return { kind: 'split', region, targetPanelId, axis: 'vertical', position: 'before' };
  if (y > 1 - edge) return { kind: 'split', region, targetPanelId, axis: 'vertical', position: 'after' };
  return null;
}

export function panelDropCommand(panelId: string, intent: PanelDropIntent): WorkbenchCommand {
  if (intent.kind === 'tab') return { type: 'panel.move', panelId, to: { kind: 'tab', tabStackId: intent.tabStackId, index: intent.index } };
  if (intent.kind === 'split') {
    return {
      type: 'panel.move',
      panelId,
      to: {
        kind: 'split',
        region: intent.region,
        targetPanelId: intent.targetPanelId,
        axis: intent.axis,
        position: intent.position
      }
    };
  }
  return { type: 'panel.move', panelId, to: { kind: 'region', region: intent.region, index: intent.index } };
}

export function widgetDropCommand(widgetIds: string[], intent: WidgetDropIntent): WorkbenchCommand {
  return {
    type: 'widget.move',
    widgetIds,
    zone: intent.zone,
    index: intent.index,
    floatingRect: intent.floatingRect
  };
}

export function widgetDropIndex(pointer: WorkbenchPointer, itemRects: WorkbenchRect[], orientation: 'horizontal' | 'vertical'): number {
  if (itemRects.length === 0) return 0;
  const coord = orientation === 'vertical' ? pointer.y : pointer.x;
  const index = itemRects.findIndex((rect) => {
    const midpoint = orientation === 'vertical' ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    return coord < midpoint;
  });
  return index === -1 ? itemRects.length : index;
}

export function rectContainsPointer(rect: WorkbenchRect, pointer: WorkbenchPointer): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  );
}

/**
 * Resolve which widget zone a pointer is over, given each candidate zone's client
 * rect. This mirrors the DOM path (`elementFromPoint(...).closest('[data-zone]')`)
 * as a pure, testable decision: a zone is only reachable if its rect actually
 * covers the pointer. A bar zone that shrank to its content height (leaving a
 * dead strip of un-zoned bar above/below) will NOT contain a pointer aimed at
 * that strip — which is exactly the V13h bottom-bar drop regression. The zone
 * section must stretch to fill its bar for the whole visible strip to hit-test.
 * Later entries win ties so a more specific/last-painted zone takes precedence.
 */
export function zoneAtPointer(zones: { zone: WidgetZoneId; rect: WorkbenchRect }[], pointer: WorkbenchPointer): WidgetZoneId | null {
  let found: WidgetZoneId | null = null;
  for (const candidate of zones) {
    if (rectContainsPointer(candidate.rect, pointer)) found = candidate.zone;
  }
  return found;
}

export function dockTargetLabel(intent: PanelDropIntent): string {
  if (intent.kind === 'tab') return 'Tab panel';
  if (intent.kind === 'split') return `Split ${intent.position}`;
  return `Dock ${intent.region}`;
}
