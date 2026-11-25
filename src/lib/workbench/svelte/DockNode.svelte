<script lang="ts">
  import DockNodeView from './DockNode.svelte';
  import SplitHandle from './SplitHandle.svelte';
  import TabStack from './TabStack.svelte';
  import { getWorkbenchContext } from './context';
  import { splitChildFlex, splitChildFlexCss, stackCollapsedIn } from './dockLayout';
  import type { DockNode, DockRegionId } from '../core';

  let {
    node,
    region,
    stripVertical = false,
    overlay = false
  }: {
    node: DockNode;
    region: DockRegionId;
    /** A collapsed stack here renders as a vertical strip (it sits in a horizontal split / side region). */
    stripVertical?: boolean;
    /** Rendered inside a mobile dock drawer (not the inline dock). */
    overlay?: boolean;
  } = $props();

  const { controller } = getWorkbenchContext();
  // Collapsed children (a stack whose active panel is collapsed, or a split of
  // such) take a fixed strip extent; their siblings share the rest by ratio.
  const childFlex = $derived(
    node.kind === 'split' ? splitChildFlex(node, stackCollapsedIn($controller.activeLayout?.panels ?? {})) : []
  );
</script>

{#if node.kind === 'tabs'}
  <TabStack stack={node} {region} {stripVertical} {overlay} />
{:else}
  <div class="aw-split" class:vertical={node.axis === 'vertical'} class:horizontal={node.axis === 'horizontal'} data-split={node.id}>
    {#each node.children as child, index (child.id)}
      <div
        class="aw-split-child"
        class:collapsed-strip={childFlex[index]?.fixedPx != null}
        style="flex:{childFlex[index] ? splitChildFlexCss(childFlex[index]) : `1 1 ${100 / node.children.length}%`}"
      >
        <DockNodeView node={child} {region} stripVertical={node.axis === 'horizontal'} {overlay} />
      </div>
      {#if index < node.children.length - 1}
        <SplitHandle split={node} {index} inert={childFlex[index]?.fixedPx != null || childFlex[index + 1]?.fixedPx != null} />
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
    overflow: hidden;
  }
</style>
