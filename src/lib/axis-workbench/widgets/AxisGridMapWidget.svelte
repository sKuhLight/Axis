<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import { axisGridMapDots } from '../gridView';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size, dispatch }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const mapDots = $derived(axisGridMapDots([...editor.layout.cells, ...editor.layout.shunts], editor.layout.rows || 4, editor.layout.cols || 12));
</script>

<button class="axis-widget map" data-size={size} type="button" title="Grid map · show the Block Editor navigator" onclick={() => dispatch({ type: 'panel.activate', panelId: 'axis.blockEditor' })}>
  <span class="map-dots">{#each mapDots as on, i (i)}<span class="map-dot" class:on></span>{/each}</span>
  {#if expanded}<span class="mono token">MAP</span>{/if}
</button>

<style>
  .map-dots {
    display: grid;
    flex: none;
    grid-template-columns: repeat(6, 3px);
    grid-auto-rows: 3px;
    gap: 2px;
  }
  .map-dot {
    width: 3px;
    height: 3px;
    border-radius: 1px;
    background: var(--aw-border-2);
  }
  .map-dot.on {
    background: var(--aw-accent);
  }
</style>
