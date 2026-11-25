/**
 * Row kinds a menu can render. `item` (the default when `kind` is omitted) and
 * `radio` activate; `header` is a non-focusable section label; `submenu` drills
 * in (the menu content is replaced by `items`, with a Back row on top); `input`
 * turns into an inline text field when activated (Enter submits, Escape cancels).
 */
export type WorkbenchMenuItemKind = 'item' | 'radio' | 'header' | 'submenu' | 'input';

/** Inline confirm: the first activation swaps the row for the prompt + Confirm/Cancel. */
export interface WorkbenchMenuConfirm {
  prompt: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface WorkbenchMenuItem {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  /**
   * Runs on activation of an `item` / `radio` row (after Confirm when `confirm`
   * is set). `header`, `submenu` and `input` rows never call it — pass a no-op.
   */
  run: () => void;
  /** Row kind; omitted = `item` (the original flat menu row). */
  kind?: WorkbenchMenuItemKind;
  /** `radio` rows: the checked state (`aria-checked`). */
  checked?: boolean;
  /** `submenu` rows: the child rows shown after drilling in. */
  items?: WorkbenchMenuItem[];
  /** Ask inline before `run` (destructive actions). */
  confirm?: WorkbenchMenuConfirm;
  /** Extra class on the rendered row (stable hooks for hosts / e2e). */
  className?: string;
  /** `input` rows: the initial field value. */
  value?: string;
  /** `input` rows: field placeholder. */
  placeholder?: string;
  /**
   * `input` rows: called with the field value on Enter / Save. Return `false` to
   * keep the menu open (e.g. the value was rejected); anything else closes it.
   */
  onSubmit?: (value: string) => boolean | void;
}

export interface WorkbenchMenuPosition {
  x: number;
  y: number;
}

/** The effective kind of a row (`item` when unset). */
export function menuItemKind(item: Pick<WorkbenchMenuItem, 'kind'>): WorkbenchMenuItemKind {
  return item.kind ?? 'item';
}

/** True when keyboard focus may land on the row: not a header and not disabled. */
export function isMenuItemFocusable(item: Pick<WorkbenchMenuItem, 'kind' | 'disabled'>): boolean {
  return menuItemKind(item) !== 'header' && !item.disabled;
}

/**
 * Roving-focus math over menu ROWS: from `current`, step by `delta` (+1 / -1) to
 * the next focusable row, skipping headers and disabled rows and wrapping at the
 * ends. `current < 0` (nothing focused yet) starts from the first row for a
 * forward move and the last row for a backward move. Returns -1 when no row is
 * focusable.
 */
export function nextMenuItemIndex(
  rows: ReadonlyArray<Pick<WorkbenchMenuItem, 'kind' | 'disabled'>>,
  current: number,
  delta: number
): number {
  const count = rows.length;
  if (count === 0) return -1;
  const step = delta < 0 ? -1 : 1;
  let index = current < 0 ? (step > 0 ? -1 : count) : current;
  for (let tried = 0; tried < count; tried++) {
    index = (index + step + count) % count;
    if (isMenuItemFocusable(rows[index])) return index;
  }
  return -1;
}

export interface ResolvedMenuLevel {
  /** The rows of the level the path points at. */
  items: WorkbenchMenuItem[];
  /** The valid prefix of the requested path (stale segments are dropped). */
  path: string[];
  /** The submenu rows walked through, outermost first (for titles / Back focus). */
  trail: WorkbenchMenuItem[];
}

/**
 * Resolve a drill-in path (a list of `submenu` row ids, outermost first) to the
 * level it points at. A segment that no longer names a submenu at its level —
 * the items changed while the menu was open — truncates the path there, so the
 * menu falls back to the deepest level that still exists instead of breaking.
 */
export function resolveMenuPath(items: WorkbenchMenuItem[], path: readonly string[]): ResolvedMenuLevel {
  let level = items;
  const validPath: string[] = [];
  const trail: WorkbenchMenuItem[] = [];
  for (const id of path) {
    const next = level.find((item) => item.id === id && menuItemKind(item) === 'submenu');
    if (!next) break;
    validPath.push(id);
    trail.push(next);
    level = next.items ?? [];
  }
  return { items: level, path: validPath, trail };
}

// ── Interaction state machine (pure) ────────────────────────────────────────
// ContextMenu keeps ONE of these per open menu and feeds every activation /
// confirm / cancel / submit / Escape through the step functions below; each
// returns the next state plus what the component must do (run the item, close,
// move focus). The component only applies the step.

/** Interaction state of an open menu: the drill path and the one inline row in progress. */
export interface MenuInteractionState {
  /** Submenu ids walked into, outermost first. */
  path: string[];
  /** Row showing its inline confirm prompt. */
  confirmingId: string | null;
  /** `input` row showing its inline text field. */
  editingId: string | null;
  /** The inline field's current text. */
  draft: string;
}

export const MENU_INTERACTION_IDLE: MenuInteractionState = { path: [], confirmingId: null, editingId: null, draft: '' };

/** Where focus should land once the step has re-rendered the menu. */
export type MenuFocusTarget =
  /** The first focusable row of the level (after Back). */
  | { kind: 'first-child' }
  /** The row of this item id in the current level. */
  | { kind: 'row'; id: string }
  /** The inline confirm's Cancel button (Enter right after a first activation must not confirm). */
  | { kind: 'cancel' }
  /** The inline text field. */
  | { kind: 'input' };

export interface MenuStep {
  state: MenuInteractionState;
  /** Call the item's `run()`, then close. */
  run: boolean;
  /** Close the menu. */
  close: boolean;
  focus: MenuFocusTarget | null;
}

function menuStep(state: MenuInteractionState, extra: Partial<Omit<MenuStep, 'state'>> = {}): MenuStep {
  return { state, run: false, close: false, focus: null, ...extra };
}

const clearInline = (state: MenuInteractionState): MenuInteractionState => ({
  ...state,
  confirmingId: null,
  editingId: null,
  draft: ''
});

/**
 * Activate a row (click / Enter / Space). Headers and disabled rows do nothing;
 * a submenu drills in; an input row opens its field; an item with `confirm`
 * only swaps to its inline prompt on the first activation — it never runs here
 * until confirmed via {@link confirmMenuRow}; everything else runs and closes.
 */
export function activateMenuRow(state: MenuInteractionState, item: WorkbenchMenuItem): MenuStep {
  if (item.disabled) return menuStep(state);
  const kind = menuItemKind(item);
  if (kind === 'header') return menuStep(state);
  if (kind === 'submenu') {
    return menuStep({ ...clearInline(state), path: [...state.path, item.id] }, { focus: { kind: 'first-child' } });
  }
  if (kind === 'input') {
    return menuStep({ ...clearInline(state), editingId: item.id, draft: item.value ?? '' }, { focus: { kind: 'input' } });
  }
  if (item.confirm) {
    return menuStep({ ...clearInline(state), confirmingId: item.id }, { focus: { kind: 'cancel' } });
  }
  return menuStep(clearInline(state), { run: true, close: true });
}

/** The inline prompt's Confirm: runs the item only when its prompt is the one showing. */
export function confirmMenuRow(state: MenuInteractionState, item: WorkbenchMenuItem): MenuStep {
  if (item.disabled || state.confirmingId !== item.id) return menuStep(state);
  return menuStep(clearInline(state), { run: true, close: true });
}

/** Cancel the inline confirm / field and return focus to its row. */
export function cancelMenuRow(state: MenuInteractionState): MenuStep {
  const id = state.confirmingId ?? state.editingId;
  return menuStep(clearInline(state), { focus: id ? { kind: 'row', id } : null });
}

/** Back one drill level (Back row / ArrowLeft), focusing the submenu row it came from. */
export function backMenuStep(state: MenuInteractionState): MenuStep {
  if (!state.path.length) return menuStep(state);
  const leaving = state.path[state.path.length - 1];
  return menuStep({ ...clearInline(state), path: state.path.slice(0, -1) }, { focus: { kind: 'row', id: leaving } });
}

/**
 * Escape unwinds ONE step: an open field or confirm prompt first, then one
 * submenu level, and only at the root does it close the menu.
 */
export function escapeMenuStep(state: MenuInteractionState): MenuStep {
  if (state.editingId || state.confirmingId) return cancelMenuRow(state);
  if (state.path.length) return backMenuStep(state);
  return menuStep(state, { close: true });
}

/** Update the inline field's text. */
export function editMenuDraft(state: MenuInteractionState, draft: string): MenuInteractionState {
  return { ...state, draft };
}

/**
 * Submit the open field (Enter / Save) through the item's `onSubmit`. A `false`
 * return keeps the field open (the value was rejected); anything else closes.
 */
export function submitMenuInput(state: MenuInteractionState, item: WorkbenchMenuItem): MenuStep {
  if (state.editingId !== item.id) return menuStep(state);
  const accepted = item.onSubmit?.(state.draft) !== false;
  return accepted ? menuStep(clearInline(state), { close: true }) : menuStep(state, { focus: { kind: 'input' } });
}

/** Keys inside the inline field: Enter submits, Escape cancels only the field; others are not handled. */
export function menuInputKey(state: MenuInteractionState, item: WorkbenchMenuItem, key: string): MenuStep | null {
  if (key === 'Enter') return submitMenuInput(state, item);
  if (key === 'Escape') return cancelMenuRow(state);
  return null;
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

export interface AnchoredMenuPlacement extends WorkbenchMenuPosition {
  /** Max height (layout px) that keeps the menu inside the viewport below the anchor. */
  maxHeight: number;
}

/** Smallest max-height an anchored menu is squeezed to before it may overflow. */
const ANCHORED_MENU_MIN_HEIGHT = 120;

/**
 * Placement for a dropdown opened from a trigger (the edit bar). Unlike a
 * pointer menu it NEVER flips upward over its trigger: it opens below the
 * anchor, x is clamped inside the viewport (so a right-edge trigger shifts the
 * menu left), and the height is capped to the space left below — the menu
 * scrolls instead of covering the bar. `floor` (visual px) is a y the menu never
 * opens above: the bottom edge of the bar the trigger sits in, so a bar that
 * grew a second row (e.g. an error chip) is never covered. Computed in visual
 * space, then de-zoomed like {@link resolveMenuPlacement}.
 */
export function resolveAnchoredMenuPlacement(
  anchor: { left: number; bottom: number },
  viewport: { width: number; height: number },
  menuSize: { width: number; height: number },
  zoom: number,
  gap = 4,
  floor?: number
): AnchoredMenuPlacement {
  const margin = 8;
  const factor = zoom > 0 ? zoom : 1;
  const x = Math.max(margin, Math.min(anchor.left, viewport.width - menuSize.width - margin));
  const below = typeof floor === 'number' && Number.isFinite(floor) ? Math.max(anchor.bottom, floor) : anchor.bottom;
  const y = Math.max(margin, below + gap);
  const maxHeight = Math.max(ANCHORED_MENU_MIN_HEIGHT, viewport.height - y - margin);
  return { x: x / factor, y: y / factor, maxHeight: maxHeight / factor };
}
