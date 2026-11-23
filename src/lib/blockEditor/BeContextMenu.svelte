<script lang="ts">
  // The control menu of one Block Editor tile (rows from controlMenu.ts), rendered by the workbench
  // ContextMenu (submenus, radio rows, keyboard navigation; Escape unwinds one level and never reaches the
  // app's window Escape chain). Opened at the pointer, or at the tile for Shift+F10 / the ContextMenu key.
  // It lives in the editor's overlay layer (overlayLayer.ts); outside the workbench (the monolith shell)
  // the menu's `--aw-*` tokens are not set by a workbench host, so the neutral defaults (which read the
  // app tokens) are provided here. Row icons come from the rows' `be-ci-<id>` class hooks.
  import ContextMenu from '../workbench/svelte/ContextMenu.svelte';
  import { getOptionalWorkbenchContext, workbenchTokenDefaultsCss, type WorkbenchMenuItem, type WorkbenchMenuPosition } from '../workbench';

  let {
    open,
    items,
    position,
    touch = false,
    label = 'Control options',
    onClose
  }: {
    open: boolean;
    items: WorkbenchMenuItem[];
    position: WorkbenchMenuPosition;
    /** Phone: 44 px rows. */
    touch?: boolean;
    label?: string;
    onClose: () => void;
  } = $props();

  const tokens = getOptionalWorkbenchContext() ? '' : workbenchTokenDefaultsCss();
</script>

<!-- no browser menu over the open menu: a right-click on its scrim closes it; inside the menu (also the
     contextmenu event the ContextMenu key fires at the focused row on key-up) nothing happens -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="be-ctx-scope"
  style={tokens || null}
  oncontextmenu={(e) => {
    if (!open) return;
    e.preventDefault();
    if ((e.target as HTMLElement | null)?.closest?.('.aw-context-menu')) return;
    onClose();
  }}
>
  <ContextMenu {open} {position} {items} {touch} {label} overlay {onClose} />
</div>

<style>
  .be-ctx-scope {
    display: contents;
  }
  /* the control's name heads the menu */
  .be-ctx-scope :global(.aw-menu-header.be-ci-head) {
    padding: 8px 9px 8px;
    color: var(--aw-text);
    font: 700 12px/1.2 var(--aw-font-ui);
    letter-spacing: 0;
    text-transform: none;
  }
  /* a leading icon per top-level row (child rows of a submenu carry none) */
  .be-ctx-scope :global(.be-ci:not(.be-ci-head):not(.be-ci-view-opt):not(.be-ci-size-opt):not(.be-ci-move-opt):not([class*='be-ci-pin-'])::before) {
    flex: none;
    width: 14px;
    text-align: center;
    color: var(--aw-text-muted);
    font: 600 13px/1 var(--aw-font-ui);
  }
  /* ⚡ = pin (F2), drawn as the template's bolt */
  .be-ctx-scope :global(.be-ci-pin::before) {
    content: '';
    height: 12px;
    background: var(--amber);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M9.2 1 L3 9.2 H7.4 L6.4 15 L13 6.6 H8.6 Z'/%3E%3C/svg%3E") center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M9.2 1 L3 9.2 H7.4 L6.4 15 L13 6.6 H8.6 Z'/%3E%3C/svg%3E") center / contain no-repeat;
  }
  .be-ctx-scope :global(.be-ci-modifier::before) {
    content: '∿';
    color: var(--amber);
  }
  .be-ctx-scope :global(.be-ci-view::before) {
    content: '◉';
    font-size: 11px;
  }
  .be-ctx-scope :global(.be-ci-size::before) {
    content: '⤡';
  }
  .be-ctx-scope :global(.be-ci-move::before) {
    content: '⇥';
  }
  /* grid swipe control: its own icon (a swipe), amber while assigned */
  .be-ctx-scope :global(.be-ci-swipe::before) {
    content: '⇆';
  }
  .be-ctx-scope :global(.be-ci-swipe.on::before),
  .be-ctx-scope :global(.be-ci-swipe.on i) {
    color: var(--amber);
  }
  .be-ctx-scope :global(.be-ci-remove::before) {
    content: '✕';
    color: inherit;
    font-size: 11px;
  }
</style>
