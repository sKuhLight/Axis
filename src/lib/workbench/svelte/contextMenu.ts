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

// Anchor a menu BELOW a unit (a widget host or group module) rather than at the
// pointer: x aligns with the unit's left edge, y sits a small gap under its
// bottom edge. Pure geometry — the emitted position is still fed through
// `resolveMenuPlacement` (via ContextMenu) so it clamps to the viewport and
// de-zooms, which is what keeps a below-anchored menu on-screen on a short phone
// viewport (it flips up against the bottom margin instead of overflowing).
export function menuPositionBelowRect(
  rect: { left: number; bottom: number },
  gap = 6
): WorkbenchMenuPosition {
  return { x: rect.left, y: rect.bottom + gap };
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

// An ancestor CSS `zoom` (the app UI-scale setting applies one on the root) puts
// a `position:fixed` overlay's own px units in LAYOUT space, while pointer coords
// and getBoundingClientRect values are VISUAL. Placing a fixed menu at raw visual
// coords double-applies the factor, so the menu drifts from the cursor — the drift
// grows with distance from the origin. A viewport-spanning fixed probe self-
// calibrates: its visual/layout width ratio IS the cumulative effective zoom
// (identity 1 with no zoom, so this is a no-op at 100% scale). Dividing visual
// coords by that ratio converts them back to the layout space the menu positions
// in. Mirrors DragLayer's approach so both overlays stay in lockstep.
export function effectiveZoom(visualWidth: number, layoutWidth: number): number {
  return layoutWidth > 0 && visualWidth > 0 ? visualWidth / layoutWidth : 1;
}

// Clamp in VISUAL space (viewport + measured menu box are both visual), then
// divide the result by the effective zoom so the emitted left/top land correctly
// once the zoomed subtree re-multiplies them. `menuSize` is the menu's own visual
// box; `viewport` is the visual viewport (window.innerWidth/Height).
export function resolveMenuPlacement(
  position: WorkbenchMenuPosition,
  viewport: { width: number; height: number },
  menuSize: { width: number; height: number },
  zoom: number
): WorkbenchMenuPosition {
  const clamped = clampMenuPosition(position, viewport, menuSize);
  const factor = zoom > 0 ? zoom : 1;
  return { x: clamped.x / factor, y: clamped.y / factor };
}
