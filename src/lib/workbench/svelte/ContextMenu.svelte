<script lang="ts">
  import { tick } from 'svelte';
  import { effectiveZoom, resolveMenuPlacement, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { focusTrap, focusableWithin, nextFocusIndex } from './focusTrap';

  let {
    open,
    position,
    items,
    label = 'Context menu',
    onClose
  }: {
    open: boolean;
    position: WorkbenchMenuPosition;
    items: WorkbenchMenuItem[];
    label?: string;
    onClose: () => void;
  } = $props();

  let menuEl = $state<HTMLElement | null>(null);
  // `position:fixed; inset:0` viewport-spanning probe: its visual/layout width
  // ratio is the cumulative ancestor CSS zoom (see contextMenu.ts). Used to
  // convert the visual-space clamped position into the layout-space left/top a
  // fixed element inside a zoomed subtree positions in. Identity at 100% scale.
  let scrimEl = $state<HTMLElement | null>(null);
  let left = $state(0);
  let top = $state(0);

  function run(item: WorkbenchMenuItem) {
    if (item.disabled) return;
    item.run();
    onClose();
  }

  // Roving arrow-key navigation between the (enabled) menu items — the platform
  // convention for a `role="menu"`. Tab-trap + Escape + focus-restore come from
  // `use:focusTrap`; here we add ↑/↓/Home/End and Enter/Space activation.
  function moveFocus(delta: number) {
    if (!menuEl) return;
    const items = focusableWithin(menuEl);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = nextFocusIndex(current, items.length, delta);
    items[next]?.focus();
  }

  function menuKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'Home': {
        event.preventDefault();
        const first = focusableWithin(menuEl!)[0];
        first?.focus();
        break;
      }
      case 'End': {
        event.preventDefault();
        const all = focusableWithin(menuEl!);
        all[all.length - 1]?.focus();
        break;
      }
    }
  }

  $effect(() => {
    if (!open) return;
    // First paint: place at the raw pointer position divided by the current best
    // zoom estimate so a zoomed menu doesn't flash at the wrong spot before the
    // post-tick measure refines it.
    const preZoom = scrimEl ? effectiveZoom(scrimEl.getBoundingClientRect().width, scrimEl.offsetWidth) : 1;
    left = position.x / preZoom;
    top = position.y / preZoom;
    void tick().then(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      const zoom = scrimEl ? effectiveZoom(scrimEl.getBoundingClientRect().width, scrimEl.offsetWidth) : 1;
      const next = resolveMenuPlacement(
        position,
        { width: window.innerWidth, height: window.innerHeight },
        { width: rect.width, height: rect.height },
        zoom
      );
      left = next.x;
      top = next.y;
    });
  });
</script>

{#if open}
  <button class="aw-menu-scrim" type="button" aria-label="Close menu" bind:this={scrimEl} onclick={onClose}></button>
  <div
    class="aw-context-menu"
    bind:this={menuEl}
    use:focusTrap={{ onClose }}
    role="menu"
    aria-label={label}
    tabindex="-1"
    onkeydown={menuKeydown}
    style={`left:${left}px; top:${top}px;`}
  >
    {#each items as item (item.id)}
      <button
        class="aw-menu-item"
        class:danger={item.danger}
        class:separated={item.separatorBefore}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onclick={() => run(item)}
      >
        <span>{item.label}</span>
        {#if item.hint}<i>{item.hint}</i>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .aw-menu-scrim {
    position: fixed;
    inset: 0;
    z-index: 119;
    border: 0;
    background: transparent;
  }
  .aw-context-menu {
    position: fixed;
    z-index: 120;
    min-width: 188px;
    max-width: min(280px, calc(100vw - 16px));
    padding: 6px;
    border: 1px solid var(--aw-border-2);
    border-radius: 8px;
    background: var(--aw-surface);
    box-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
    outline: none;
  }
  .aw-menu-item {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--aw-text-2);
    cursor: pointer;
    text-align: left;
    font: 700 12px/1 var(--aw-font-ui);
  }
  .aw-menu-item:hover {
    background: color-mix(in srgb, var(--aw-accent) 12%, transparent);
    color: var(--aw-text);
  }
  .aw-menu-item:focus-visible {
    background: color-mix(in srgb, var(--aw-accent) 12%, transparent);
    color: var(--aw-text);
    outline: 2px solid var(--aw-accent);
    outline-offset: -2px;
  }
  .aw-menu-item:disabled {
    opacity: 0.42;
    cursor: default;
  }
  .aw-menu-item.danger {
    color: var(--aw-danger);
  }
  .aw-menu-item.separated {
    margin-top: 6px;
    border-top: 1px solid var(--aw-border);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    padding-top: 6px;
  }
  .aw-menu-item span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-menu-item i {
    flex: none;
    color: var(--aw-text-faint);
    font: 700 10px/1 var(--aw-font-mono);
    font-style: normal;
  }
</style>
