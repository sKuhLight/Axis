<script lang="ts">
  import { tick } from 'svelte';
  import { clampMenuPosition, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';

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
  let left = $state(0);
  let top = $state(0);

  function run(item: WorkbenchMenuItem) {
    if (item.disabled) return;
    item.run();
    onClose();
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (open && event.key === 'Escape') onClose();
  }

  $effect(() => {
    if (!open) return;
    left = position.x;
    top = position.y;
    void tick().then(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      const next = clampMenuPosition(
        position,
        { width: window.innerWidth, height: window.innerHeight },
        { width: rect.width, height: rect.height }
      );
      left = next.x;
      top = next.y;
      menuEl.focus();
    });
  });
</script>

<svelte:window onkeydown={closeOnEscape} />

{#if open}
  <button class="aw-menu-scrim" type="button" aria-label="Close menu" onclick={onClose}></button>
  <div
    class="aw-context-menu"
    bind:this={menuEl}
    role="menu"
    aria-label={label}
    tabindex="-1"
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
  .aw-menu-item:hover,
  .aw-menu-item:focus-visible {
    background: color-mix(in srgb, var(--aw-accent) 12%, transparent);
    color: var(--aw-text);
    outline: none;
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
