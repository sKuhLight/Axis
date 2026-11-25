<script lang="ts">
  // Every Block Editor menu, rendered by the workbench ContextMenu (submenus, radio rows, inline confirm and
  // input rows, keyboard navigation; Escape unwinds one level and never reaches the app's window Escape
  // chain): the header's ⋯ (rows from moreMenu.ts, `be-mi-<id>`), a control's menu (controlMenu.ts,
  // `be-ci-<id>`; opened at the pointer or at the tile), and the Arrange bar's Page ▾ (pageMenu.ts,
  // `be-pm-<id>`) and ⋯ overflow (arrangeBar.ts, `be-ab-<id>`), both opened below their trigger. It is
  // rendered inside the editor's ONE overlay layer (overlayLayer.ts), so menus and the "Add" library stack
  // in that layer (the menus above the library). Outside the workbench (the monolith) the menu's `--aw-*`
  // tokens are not set by a workbench host, so the neutral defaults (which read the app tokens) are provided
  // here. Row icons hang off the rows' class hooks — defined once, below.
  import ContextMenu from '../workbench/svelte/ContextMenu.svelte';
  import { getOptionalWorkbenchContext, workbenchTokenDefaultsCss, type WorkbenchMenuItem, type WorkbenchMenuPosition } from '../workbench';

  let {
    open,
    items,
    anchor = null,
    position = undefined,
    touch = false,
    label,
    onClose
  }: {
    open: boolean;
    items: WorkbenchMenuItem[];
    /** A dropdown: the menu opens below this trigger (clamped into the window). */
    anchor?: HTMLElement | null;
    /** A context menu: the pointer (or the tile) position; ignored with an anchor. */
    position?: WorkbenchMenuPosition;
    /** 44 px rows (phone; the tablet's Arrange menus). */
    touch?: boolean;
    label: string;
    onClose: () => void;
  } = $props();

  const tokens = getOptionalWorkbenchContext() ? '' : workbenchTokenDefaultsCss();
</script>

<!-- no browser menu over an open menu: a right-click on its scrim closes it; inside the menu (also the
     contextmenu event the ContextMenu key fires at the focused row on key-up) nothing happens -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="be-menu-scope"
  style={tokens || null}
  oncontextmenu={(e) => {
    if (!open) return;
    e.preventDefault();
    if ((e.target as HTMLElement | null)?.closest?.('.aw-context-menu')) return;
    onClose();
  }}
>
  <ContextMenu {open} {anchor} {position} {items} {touch} {label} overlay {onClose} />
</div>

<style>
  .be-menu-scope {
    display: contents;
  }

  /* ── headers: the control's name (control menu), the page's name (Page ▾) ── */
  .be-menu-scope :global(.aw-menu-header.be-ci-head),
  .be-menu-scope :global(.aw-menu-header.be-pm-head) {
    padding: 8px 9px;
    color: var(--aw-text);
    font: 700 12px/1.2 var(--aw-font-ui);
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* a read-only display's notes under its name (what the graph draws and what it does not) */
  .be-menu-scope :global(.aw-menu-header.be-ci-note) {
    max-width: 280px;
    padding: 0 9px 6px;
    color: var(--aw-text-muted);
    font: 500 11px/1.35 var(--aw-font-ui);
    letter-spacing: 0;
    text-transform: none;
    white-space: normal;
  }
  /* ⋯ LAYOUT header: teal dot = Default, amber = Custom */
  .be-menu-scope :global(.be-mi-layout-head) {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .be-menu-scope :global(.be-mi-layout-head::before) {
    content: '';
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--accent);
  }
  .be-menu-scope :global(.be-mi-layout-head.custom) {
    color: var(--amber);
  }
  .be-menu-scope :global(.be-mi-layout-head.custom::before) {
    background: var(--amber);
  }

  /* ── a leading icon per top-level row (child rows of a submenu carry none) ── */
  .be-menu-scope :global(.be-ci:not(.be-ci-head):not(.be-ci-view-opt):not(.be-ci-size-opt):not(.be-ci-move-opt):not([class*='be-ci-pin-'])::before),
  .be-menu-scope :global(.be-pm:not(.be-pm-head)::before),
  .be-menu-scope :global(.be-ab:not(.be-ab-view-opt):not(.be-ab-size-opt)::before) {
    flex: none;
    width: 14px;
    text-align: center;
    color: var(--aw-text-muted);
    font: 600 13px/1 var(--aw-font-ui);
  }
  /* ⚡ = pin (F2), drawn as the template's bolt */
  .be-menu-scope :global(.be-ci-pin::before),
  .be-menu-scope :global(.be-ab-pin::before) {
    content: '';
    height: 12px;
    background: var(--amber);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M9.2 1 L3 9.2 H7.4 L6.4 15 L13 6.6 H8.6 Z'/%3E%3C/svg%3E") center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M9.2 1 L3 9.2 H7.4 L6.4 15 L13 6.6 H8.6 Z'/%3E%3C/svg%3E") center / contain no-repeat;
  }
  .be-menu-scope :global(.be-ci-modifier::before) {
    content: '∿';
    color: var(--amber);
  }
  .be-menu-scope :global(.be-ci-view::before),
  .be-menu-scope :global(.be-ab-view::before) {
    content: '◉';
    font-size: 11px;
  }
  .be-menu-scope :global(.be-ci-size::before),
  .be-menu-scope :global(.be-ab-size::before) {
    content: '⤡';
  }
  .be-menu-scope :global(.be-ci-move::before) {
    content: '⇥';
  }
  /* grid swipe control: its own icon (a swipe), amber while assigned */
  .be-menu-scope :global(.be-ci-swipe::before),
  .be-menu-scope :global(.be-ab-swipe::before) {
    content: '⇆';
  }
  .be-menu-scope :global(.be-ci-swipe.on::before),
  .be-menu-scope :global(.be-ci-swipe.on i),
  .be-menu-scope :global(.be-ab-swipe.on::before) {
    color: var(--amber);
  }
  .be-menu-scope :global(.be-ci-remove::before),
  .be-menu-scope :global(.be-ab-remove::before),
  .be-menu-scope :global(.be-pm-delete::before) {
    content: '✕';
    color: inherit;
    font-size: 11px;
  }
  .be-menu-scope :global(.be-pm-rename::before) {
    content: '✎';
  }
  .be-menu-scope :global(.be-pm-duplicate::before) {
    content: '⧉';
  }
  .be-menu-scope :global(.be-pm-pin::before) {
    content: '⚑';
    color: var(--amber);
  }
  .be-menu-scope :global(.be-pm-earlier::before) {
    content: '←';
  }
  .be-menu-scope :global(.be-pm-later::before) {
    content: '→';
  }
  .be-menu-scope :global(.be-pm-add::before),
  .be-menu-scope :global(.be-ab-add::before) {
    content: '+';
    color: var(--accent);
    font-size: 14px;
  }
  .be-menu-scope :global(.be-ab-label::before) {
    content: 'T';
    font-family: var(--aw-font-mono, monospace);
  }
  .be-menu-scope :global(.be-ab-rotate::before) {
    content: '⟲';
  }
  .be-menu-scope :global(.be-ab-undo::before) {
    content: '↶';
  }
  .be-menu-scope :global(.be-ab-hdiv::before) {
    content: '―';
  }
  .be-menu-scope :global(.be-ab-vdiv::before) {
    content: '│';
  }
  .be-menu-scope :global(.be-ab-close-gaps::before) {
    content: '⇤';
  }
  .be-menu-scope :global(.be-ab-tidy::before) {
    content: '⤢';
  }
  .be-menu-scope :global(.be-ab-autopack::before) {
    content: '⊞';
  }
  .be-menu-scope :global(.be-ab-autopack.on::before) {
    color: var(--accent);
  }
  .be-menu-scope :global(.be-ab-page::before) {
    content: '▤';
  }
</style>
