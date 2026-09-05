<script lang="ts">
  // The "main" content of a preset row — name, conversion provenance, tag pills, mini signal-chain
  // strip — factored out of AxisPresetBrowserPartPanel.svelte so it and AxisPresetBrowserSearchOverlay
  // (the slim Grid-page overlay) render this identically instead of maintaining two copies of the
  // markup/CSS. The name itself stays overridable via a snippet: the docked panel swaps in its inline
  // rename input there, the overlay just takes the default `<strong>` render. Tag-pill context menu
  // (rename/recolor a tag) stays panel-only via the optional callback — the overlay has no tag editor.
  import type { Snippet } from 'svelte';
  import type { AxisPresetBrowserEntrySummary } from './presetBrowserWorkbenchData';
  import { axisPbRowBlockChips, type AxisPbRowBlockChip } from './presetBrowserWorkbenchRowChips';
  import { library } from '../../library.svelte';

  let {
    entry,
    name,
    onTagContextMenu,
    chainChips
  }: {
    entry: AxisPresetBrowserEntrySummary;
    name?: Snippet;
    onTagContextMenu?: (event: MouseEvent, tag: string) => void;
    /** Override the chain strip's chip list — e.g. narrowed to just the block(s) a search matched
     *  (see presetBrowserWorkbenchChainMatch.ts). Omitted → the full per-block chain. */
    chainChips?: AxisPbRowBlockChip[];
  } = $props();

  // Only derive what this row actually renders. `chainChips` is supplied by the search overlay (and
  // already narrows/empties the chain), so avoid rebuilding the full block-chip list (and the unused CPU
  // meter) a second time — the overlay's 500+ rows made that double walk the mount/typing cost.
  const tagPills = $derived(entry.tags.slice(0, 3));
  const chips = $derived(chainChips ?? axisPbRowBlockChips(entry));
</script>

{#if name}
  {@render name()}
{:else}
  <strong class="row-name" class:dim={entry.empty}>{entry.name}</strong>
{/if}
{#if entry.converted && entry.provenance}
  <span class="conv-prov" title={`Converted from ${entry.provenance}`}>{entry.provenance}</span>
{/if}
{#if tagPills.length}
  <span class="tag-pills">
    {#each tagPills as tag}
      <em
        class="tag-pill"
        data-tag={tag}
        style:--tag-col={library.colorOf(tag)}
        oncontextmenu={(e) => onTagContextMenu?.(e, tag)}
      >{tag}</em>
    {/each}
  </span>
{/if}
{#if chips.length && !entry.empty}
  <!-- Signal-chain quick view: a flowing node → node → node strip, deliberately NOT pill-shaped so it
       never reads as tags (the tag pills sit directly above it). -->
  <span class="chain-strip" title="Signal chain">
    {#each chips as chip, ci}
      {#if ci > 0}<i class="chain-arrow" aria-hidden="true">›</i>{/if}
      <em class="chain-node" style:--c={chip.color} title={chip.title}>
        <i class="chain-dot"></i>
        <b class="chain-cat">{chip.cat}</b>
        {#if chip.type}<span class="chain-type">{chip.type}</span>{/if}
      </em>
    {/each}
  </span>
{/if}

<style>
  /* :global — the docked panel's `name` snippet renders its own `<strong class="row-name">` (for the
     non-renaming case) from ITS template, so the element carries the panel's own Svelte scope hash,
     not this component's. Global is what makes the shared class actually reach it. */
  :global(.row-name) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font: 700 13px/1.15 var(--font-ui);
  }
  :global(.row-name.dim) {
    color: var(--textdim);
    font-weight: 600;
  }
  .conv-prov {
    align-self: flex-start;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--amber, #f5a623) 45%, transparent);
    border-radius: 5px;
    background: color-mix(in srgb, var(--amber, #f5a623) 14%, transparent);
    color: var(--amber, #f5a623);
    font: 700 9.5px/1 var(--font-mono);
    white-space: nowrap;
  }
  .tag-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }
  .tag-pill {
    padding: 2px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--tag-col) 14%, transparent);
    color: var(--tag-col);
    font: 700 9.5px/1 var(--font-mono);
    font-style: normal;
    white-space: nowrap;
  }
  .chain-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1px 3px;
    min-width: 0;
  }
  .chain-arrow {
    color: color-mix(in srgb, var(--textdim) 65%, transparent);
    font: 600 11px/1 var(--font-ui);
    font-style: normal;
  }
  .chain-node {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    padding: 1px 2px;
    font-style: normal;
  }
  .chain-dot {
    align-self: center;
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--c);
  }
  .chain-cat {
    color: var(--c);
    font: 700 10px/1.2 var(--font-mono);
    white-space: nowrap;
  }
  .chain-type {
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--textdim);
    font: 500 10px/1.2 var(--font-mono);
  }
</style>
