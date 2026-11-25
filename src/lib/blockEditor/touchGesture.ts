// Block Editor value gestures on touch: which axis of a drag changes a control's value and which one is
// left to the board's scrolling, per navigation and input. Pure — no DOM (touchGesture.test.ts).
//
// - The board scrolls along one axis: the top strip sideways, the side stack — and the phone layout, whose
//   pages always stack — vertically.
// - Mouse and pen: as on the desktop — a knob / number drags vertically, a fader / slider follows its
//   track. A pen behaves like the mouse: pens (a Wacom tablet in Electron, say) usually do not pan, so a pen
//   gesture is never turned into a scroll here; where a browser does pan for a pen, it cancels the
//   pointer (`pointercancel`) and the gesture ends.
// - Touch: the value changes along the OTHER axis than the board scrolls. Top: a vertical drag changes it,
//   a sideways swipe scrolls the strip (`touch-action: pan-x pinch-zoom` on the tile). Side navigation
//   (F11) and the phone layout: a sideways drag changes it, a vertical swipe scrolls (`pan-y pinch-zoom`)
//   — on the phone the page scroll is the one that must never be fought. A drag decides once it leaves a
//   small slop: along the scroll axis it is a scroll and changes nothing; a tap on a fader / slider track
//   sets the tapped value. Pinch-zoom stays with the browser.
// - Arrange (tablet): every tile is a drag handle (`touch-action: none`).

import type { BeNav } from './boardGeometry';

export type Axis = 'x' | 'y';

/** The axis the board scrolls along with this navigation. */
export const scrollAxisOf = (nav: BeNav): Axis => (nav === 'top' ? 'x' : 'y');

/** Direct-manipulation input whose value axis follows the board's scroll axis: touch only (a pen behaves
 *  like the mouse). */
export const isDirect = (pointerType: string): boolean => pointerType === 'touch';

/** Continuous views whose value a drag changes. */
const VALUE_VIEWS: ReadonlySet<string> = new Set(['knob', 'number', 'fader', 'slider']);
export const isValueView = (kind: string | undefined, view: string): boolean => kind === 'cont' && VALUE_VIEWS.has(view);

/** The axis along which a drag changes the value of a control in `view`. */
export function valueAxis(view: string, pointerType: string, scroll: Axis): Axis {
  if (!isDirect(pointerType)) return view === 'slider' ? 'x' : 'y';
  return scroll === 'x' ? 'y' : 'x';
}

export type TileTouchAction = 'none' | 'pan-x pinch-zoom' | 'pan-y pinch-zoom' | 'manipulation';

/** `touch-action` of a tile: value controls leave the scroll axis (and pinch-zoom) to the browser; Arrange
 *  takes every gesture; everything else keeps panning and pinch-zoom (and drops the double-tap zoom). */
export function tileTouchAction(t: { editMode: boolean; kind: string | undefined; view: string; scroll: Axis }): TileTouchAction {
  if (t.editMode) return 'none';
  if (isValueView(t.kind, t.view)) return t.scroll === 'x' ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom';
  return 'manipulation';
}

/** Movement (px) a touch may make before its drag decides between value and scroll. */
export const TOUCH_SLOP = 8;

export type GestureLock = 'value' | 'scroll';

/** The decision of a direct-manipulation drag: null while it is still inside the slop (a tap so far),
 *  'value' once it moved more along the value axis than across it, else 'scroll' (it then changes
 *  nothing for the rest of the gesture). */
export function lockGesture(dx: number, dy: number, axis: Axis, slop: number = TOUCH_SLOP): GestureLock | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.hypot(ax, ay) < slop) return null;
  const along = axis === 'x' ? ax : ay;
  const across = axis === 'x' ? ay : ax;
  return along > across ? 'value' : 'scroll';
}

/** A touch value drag the browser takes over (`pointercancel`) this soon after it locked to 'value' was a
 *  swipe the browser decided to pan only after our slop (a curved swipe): its value goes back. */
export const CANCEL_RESTORE_MS = 150;

/** The value to write back when a touch drag is cancelled: its start value when the drag had locked to
 *  'value' less than CANCEL_RESTORE_MS ago and the value actually changed; else null (nothing to write —
 *  a cancelled drag that left the value as it was never writes). */
export function restoreOnCancel(d: { lock: GestureLock | null; lockedAt: number; start: number }, now: number, current: number): number | null {
  if (d.lock !== 'value' || now - d.lockedAt >= CANCEL_RESTORE_MS) return null;
  return current === d.start ? null : d.start;
}

/** Pixels a drag moved in the "more" direction of its value axis: up (y) or right (x). */
export const valueDelta = (dx: number, dy: number, axis: Axis): number => (axis === 'y' ? -dy : dx);

/** Value (0..1) of a fader / slider track at a point: bottom → top for a vertical track, left → right
 *  otherwise. */
export function trackNorm(px: number, py: number, rect: { left: number; top: number; width: number; height: number }, vertical: boolean): number {
  const f = vertical ? 1 - (py - rect.top) / (rect.height || 1) : (px - rect.left) / (rect.width || 1);
  return Math.max(0, Math.min(1, f));
}
