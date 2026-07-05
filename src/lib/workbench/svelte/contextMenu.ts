export interface WorkbenchMenuItem {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  run: () => void;
}

export interface WorkbenchMenuPosition {
  x: number;
  y: number;
}

export function menuPositionFromPointer(event: PointerEvent | MouseEvent): WorkbenchMenuPosition {
  return { x: event.clientX, y: event.clientY };
}

export function clampMenuPosition(
  position: WorkbenchMenuPosition,
  viewport: { width: number; height: number },
  size: { width: number; height: number }
): WorkbenchMenuPosition {
  const margin = 8;
  return {
    x: Math.max(margin, Math.min(position.x, viewport.width - size.width - margin)),
    y: Math.max(margin, Math.min(position.y, viewport.height - size.height - margin))
  };
}
