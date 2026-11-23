<script lang="ts">
  // The Block Editor ⋯ menu: the rows from moreMenu.ts rendered by the workbench ContextMenu (keyboard
  // navigation, radio rows, inline confirm). Opened below its anchor box (right-aligned to the trigger,
  // see MORE_MENU_W). It lives in the editor's overlay layer (overlayLayer.ts); outside the workbench
  // (the monolith shell) the menu's own `--aw-*` tokens are not set by a workbench host, so the neutral
  // defaults (which read the app tokens) are provided here.
  import ContextMenu from '../workbench/svelte/ContextMenu.svelte';
  import { getOptionalWorkbenchContext, workbenchTokenDefaultsCss, type WorkbenchMenuItem } from '../workbench';

  let {
    open,
    items,
    anchor,
    touch = false,
    label = 'Block and layout options',
    onClose
  }: {
    open: boolean;
    items: WorkbenchMenuItem[];
    /** Anchor box: the menu opens below it, starting at its left edge (clamped into the window). */
    anchor: HTMLElement | null;
    /** Phone: 44 px rows. */
    touch?: boolean;
    label?: string;
    onClose: () => void;
  } = $props();

  const tokens = getOptionalWorkbenchContext() ? '' : workbenchTokenDefaultsCss();
</script>

<div class="be-more-scope" style={tokens || null}>
  <!-- overlay band: above app chrome such as the workbench's floating dock openers -->
  <ContextMenu {open} {anchor} {items} {touch} {label} overlay {onClose} />
</div>

<style>
  .be-more-scope {
    display: contents;
  }
  /* layout status in the LAYOUT header row (styled through its public `className` hook, be-mi-*):
     teal dot = Default, amber = Custom */
  .be-more-scope :global(.be-mi-layout-head) {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .be-more-scope :global(.be-mi-layout-head::before) {
    content: '';
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--accent);
  }
  .be-more-scope :global(.be-mi-layout-head.custom) {
    color: var(--amber);
  }
  .be-more-scope :global(.be-mi-layout-head.custom::before) {
    background: var(--amber);
  }
</style>
