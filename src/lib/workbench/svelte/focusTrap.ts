/**
 * T18 — focus management for the workbench chrome.
 *
 * A tiny, dependency-free focus-trap `use:` action plus the pure helpers it is
 * built from. The pure parts (element filtering, next-index math) are unit
 * tested; the DOM wiring (`focusTrap`) is thin glue over them and verified
 * manually (see the T18 report / progress log).
 *
 * Behaviour of `use:focusTrap`:
 *   - on mount: moves focus into the container (an explicit `[data-autofocus]`
 *     target if present, otherwise the first focusable descendant, otherwise
 *     the container itself);
 *   - traps Tab / Shift+Tab so focus cycles within the container;
 *   - Escape (when `onClose` is given) calls the close callback;
 *   - on destroy: restores focus to whatever was focused when the trap mounted
 *     (the opener), so a keyboard user lands back where they started.
 *
 * It intentionally does NOT own arrow-key item navigation — menus layer that on
 * top via `nextFocusIndex` (roving focus), because arrow semantics differ
 * between a menu (a vertical list) and a drawer (a scrollable form).
 */

/** The selector for natively/authored focusable elements, minus disabled/hidden. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]'
].join(',');

/**
 * True when `el` is a candidate for keyboard focus: matches the focusable
 * selector, is not disabled, is not `tabindex="-1"`, and is not visually
 * removed (`display:none` / `hidden` collapse `offsetParent` to null). Pure
 * except for the `getComputedStyle`/layout reads, which the tests stub.
 */
export function isFocusable(el: Element): el is HTMLElement {
  // `HTMLElement` is undefined in a non-DOM (node/vitest) environment; guard on
  // its presence so the predicate stays callable in tests, where callers pass a
  // duck-typed element. In the browser this is the real instanceof check.
  const HtmlCtor = (globalThis as { HTMLElement?: new () => unknown }).HTMLElement;
  if (HtmlCtor && !(el instanceof HtmlCtor)) return false;
  if (typeof (el as HTMLElement).matches !== 'function') return false;
  if (!el.matches(FOCUSABLE_SELECTOR)) return false;
  if (el.hasAttribute('disabled')) return false;
  if ((el as HTMLElement & { disabled?: boolean }).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const tabIndex = el.getAttribute('tabindex');
  if (tabIndex !== null && Number(tabIndex) < 0) return false;
  // `offsetParent` is null for detached / display:none / hidden subtrees.
  // `position:fixed` elements also report null, so accept a nonzero client rect
  // as a fallback — the drawers and menus this guards are fixed-positioned.
  if ((el as HTMLElement).offsetParent === null && el.getClientRects().length === 0) return false;
  return true;
}

/** All focusable descendants of `container`, in DOM (tab) order. */
export function focusableWithin(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable);
}

/**
 * Pure roving-focus math: given the current index within a list of length
 * `count`, return the next index when moving by `delta` (+1 / -1), wrapping
 * around the ends. `current < 0` (nothing focused yet) starts at the first item
 * for a forward move and the last item for a backward move. Returns -1 when the
 * list is empty.
 */
export function nextFocusIndex(current: number, count: number, delta: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta < 0 ? count - 1 : 0;
  return (current + delta + count) % count;
}

/**
 * Pure Tab-trap math: given the index of the currently focused element within
 * the focusable list and whether Shift is held, return the index that Tab
 * should move to (wrapping at the edges). Returns -1 when the list is empty.
 * `current < 0` (focus outside the trapped set) sends Tab to the first item and
 * Shift+Tab to the last, pulling stray focus back inside.
 */
export function wrapTabIndex(current: number, count: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

export interface FocusTrapOptions {
  /** Called on Escape. Omit to leave Escape handling to the host. */
  onClose?: () => void;
  /** When false, the trap is inert (mounts nothing). Lets callers gate by `open`. */
  enabled?: boolean;
}

function initialTarget(container: HTMLElement): HTMLElement {
  const explicit = container.querySelector<HTMLElement>('[data-autofocus]');
  if (explicit && isFocusable(explicit)) return explicit;
  const first = focusableWithin(container)[0];
  return first ?? container;
}

/**
 * Svelte `use:` action. Attach to the container element of a menu/drawer:
 *   <div use:focusTrap={{ onClose }}>…</div>
 * Pass `{ enabled: false }` to no-op (e.g. when the surface is closed but the
 * element stays mounted).
 */
export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
  let opts = options;
  let previouslyFocused: HTMLElement | null = null;
  let active = false;

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (opts.onClose) {
        event.stopPropagation();
        event.preventDefault();
        opts.onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableWithin(node);
    if (items.length === 0) {
      // Nothing to move to — keep focus on the container.
      event.preventDefault();
      node.focus();
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = wrapTabIndex(current, items.length, event.shiftKey);
    event.preventDefault();
    items[next]?.focus();
  }

  function activate() {
    if (active) return;
    active = true;
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node.addEventListener('keydown', onKeydown);
    // Defer the initial focus one microtask so the DOM (and any conditional
    // children) is settled before we pick a target.
    queueMicrotask(() => {
      if (!active) return;
      initialTarget(node).focus();
    });
  }

  function deactivate() {
    if (!active) return;
    active = false;
    node.removeEventListener('keydown', onKeydown);
    // Restore focus to the opener if it is still in the document and focusable.
    const restore = previouslyFocused;
    previouslyFocused = null;
    if (restore && restore.isConnected && typeof restore.focus === 'function') {
      restore.focus();
    }
  }

  if (opts.enabled !== false) activate();

  return {
    update(next: FocusTrapOptions = {}) {
      opts = next;
      if (opts.enabled === false) deactivate();
      else activate();
    },
    destroy() {
      deactivate();
    }
  };
}
