// Block Editor control menu + modifier flyout: the input decisions around them — which key opens the
// menu, where it opens, which contextmenu event is only the echo of an opening, when a long-press may open
// it, and when the flyout may take an Escape. Pure (controlMenuInput.test.ts); BeSurface does the DOM.

/** Shift+F10 or the ContextMenu key on a focused tile. */
export function isControlMenuKey(e: { key: string; shiftKey?: boolean }): boolean {
  return e.key === 'ContextMenu' || (e.key === 'F10' && !!e.shiftKey);
}

/** A contextmenu event the keyboard fired (Shift+F10, the ContextMenu key) has no pointer position: the
 *  menu then opens at the tile instead of at (0, 0). */
export function menuAtTile(e: { clientX: number; clientY: number }): boolean {
  return e.clientX === 0 && e.clientY === 0;
}

/** How long after the menu opened a contextmenu event is the echo of that opening (a touch long-press and
 *  the ContextMenu key's key-up fire one) rather than a new right-click. */
export const CTX_ECHO_MS = 600;

export function isEchoContextMenu(open: boolean, openedAt: number, now: number): boolean {
  return open && now - openedAt < CTX_ECHO_MS;
}

/** Text fields keep the browser's own menu and their own keys. */
export function isEditableTarget(t: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!t) return false;
  const tag = (t.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
}

/** What is going on when a long-press (touch / pen hold) fires on a tile. */
export interface LongPressContext {
  /** Arranging: a hold there is the start of a move, never a menu. */
  editMode: boolean;
  /** A pin drag is up (the pen's 380 ms hold-drag, or a ⚡ press-drag). */
  pinDrag: boolean;
  /** A press on ⚡ is pending. */
  pinPress: boolean;
  /** An arrange move or resize is armed or running. */
  arrange: boolean;
  /** A value drag has moved the value. */
  valueMoved: boolean;
}

/** A long-press opens the control menu only on a still press that started nothing else. */
export function longPressOpensMenu(c: LongPressContext): boolean {
  return !c.editMode && !c.pinDrag && !c.pinPress && !c.arrange && !c.valueMoved;
}

/** Overlays that handle Escape themselves (the same set the workbench checks before an Escape restores a
 *  maximized panel). While one is open, an Escape is theirs, not the flyout's. */
export const ESCAPE_OVERLAYS = '.aw-context-menu, [role="dialog"], [aria-modal="true"], .aw-layout-drawer, .aw-lib-drawer, .aw-nav-rename';

export interface FlyoutEscapeContext {
  key: string;
  /** Something earlier in the dispatch handled the key. */
  defaultPrevented: boolean;
  /** The key went to an element inside the flyout. */
  inFlyout: boolean;
  /** Another overlay that owns Escape is open (outside the flyout). */
  overlayOpen: boolean;
}

/** The open modifier flyout closes on an Escape nobody handled before it — unless the key went to another
 *  overlay that is open on top (a palette, a dialog, a menu): that one closes first. */
export function flyoutTakesEscape(c: FlyoutEscapeContext): boolean {
  return c.key === 'Escape' && !c.defaultPrevented && (c.inFlyout || !c.overlayOpen);
}
