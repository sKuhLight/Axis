<script lang="ts">
  import DockNodeView from './DockNode.svelte';
  import SplitHandle from './SplitHandle.svelte';
  import TabStack from './TabStack.svelte';
  import type { DockNode, DockRegionId } from '../core';

  let {
    node,
    region
  }: {
    node: DockNode;
    region: DockRegionId;
  } = $props();
</script>

{#if node.kind === 'tabs'}
  <TabStack stack={node} {region} />
{:else}
  <div class="aw-split" class:vertical={node.axis === 'vertical'} class:horizontal={node.axis === 'horizontal'} data-split={node.id}>
    {#each node.children as child, index (child.id)}
      <div class="aw-split-child" style="flex-basis:{(node.ratio[index] ?? 1 / node.children.length) * 100}%">
        <DockNodeView node={child} {region} />
      </div>
      {#if index < node.children.length - 1}
        <SplitHandle split={node} {index} />
      {/if}
    {/each}
  </div>
{/if}

<style>
  .aw-split {
    position: absolute;
    inset: 0;
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .aw-split.horizontal {
    flex-direction: row;
  }
  .aw-split.vertical {
    flex-direction: column;
  }
  .aw-split-child {
    position: relative;
    min-width: 0;
    min-height: 0;
    flex-grow: 1;
    flex-shrink: 1;
    overflow: hidden;
  }
</style>
