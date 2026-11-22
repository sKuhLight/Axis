<script lang="ts">
  import type { DockLayout, DockNode } from '../core';

  /**
   * A mini-map of a page's dock arrangement (Add palette page cards): the five
   * regions as boxes — side columns, top / bottom bands around main — with
   * every split and tab stack drawn to its ratio and labelled with its active
   * panel. Pure rendering from the dock tree; an empty dock is one dashed box.
   */
  let {
    dock,
    titles = {},
    label
  }: {
    dock?: DockLayout | null;
    /** Panel id → title for the stack labels. */
    titles?: Record<string, string>;
    /** Accessible description. */
    label?: string;
  } = $props();

  const root = $derived(dock?.root ?? null);
  const empty = $derived(!root || Object.values(root).every((node) => !node));
  const titleOf = (id: string) => titles[id] ?? id;
</script>

{#snippet tree(node: DockNode)}
  {#if node.kind === 'tabs'}
    <span class="aw-thumb-stack" title={node.panelIds.map(titleOf).join(' · ')}>
      <span class="aw-thumb-tab">{titleOf(node.activePanelId)}</span>
    </span>
  {:else}
    <span class="aw-thumb-split" class:vertical={node.axis === 'vertical'}>
      {#each node.children as child, index (child.id)}
        <span class="aw-thumb-cell" style={`flex:${node.ratio?.[index] ?? 1} 1 0`}>{@render tree(child)}</span>
      {/each}
    </span>
  {/if}
{/snippet}

<span class="aw-thumb" class:empty role="img" aria-label={label ?? 'Page layout'} data-dock-thumbnail>
  {#if empty}
    <span class="aw-thumb-empty">Empty</span>
  {:else if root}
    {#if root.left}<span class="aw-thumb-side">{@render tree(root.left)}</span>{/if}
    <span class="aw-thumb-center">
      {#if root.top}<span class="aw-thumb-band">{@render tree(root.top)}</span>{/if}
      {#if root.main}<span class="aw-thumb-main">{@render tree(root.main)}</span>{/if}
      {#if root.bottom}<span class="aw-thumb-band">{@render tree(root.bottom)}</span>{/if}
    </span>
    {#if root.right}<span class="aw-thumb-side">{@render tree(root.right)}</span>{/if}
  {/if}
</span>

<style>
  .aw-thumb {
    box-sizing: border-box;
    display: flex;
    gap: 3px;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 4px;
    border: 1px solid var(--aw-border);
    border-radius: 7px;
    background: var(--aw-bg);
    overflow: hidden;
  }
  .aw-thumb *,
  .aw-thumb *::before {
    box-sizing: border-box;
  }
  .aw-thumb.empty {
    align-items: center;
    justify-content: center;
    border-style: dashed;
  }
  .aw-thumb-empty {
    color: var(--aw-text-faint);
    font: 600 9px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .aw-thumb-side {
    flex: 0 0 26%;
    display: flex;
    min-width: 0;
  }
  .aw-thumb-center {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .aw-thumb-band {
    flex: 0 0 32%;
    display: flex;
    min-height: 0;
  }
  .aw-thumb-main {
    flex: 1 1 0;
    display: flex;
    min-height: 0;
  }
  .aw-thumb-split {
    flex: 1 1 0;
    display: flex;
    gap: 3px;
    min-width: 0;
    min-height: 0;
  }
  .aw-thumb-split.vertical {
    flex-direction: column;
  }
  .aw-thumb-cell {
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  .aw-thumb-stack {
    flex: 1 1 0;
    display: flex;
    align-items: flex-start;
    min-width: 0;
    min-height: 0;
    padding: 3px;
    border-radius: 4px;
    background: var(--aw-surface-2);
    box-shadow: inset 0 0 0 1px var(--aw-border-2);
    overflow: hidden;
  }
  .aw-thumb-tab {
    max-width: 100%;
    overflow: hidden;
    padding: 1px 4px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--aw-accent) 18%, transparent);
    color: var(--aw-text-2);
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 600 8.5px/1.3 var(--aw-font-ui);
  }
</style>
