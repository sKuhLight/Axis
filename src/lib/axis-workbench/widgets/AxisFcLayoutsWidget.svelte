<script lang="ts">
  import { axisFcWorkbenchController } from '../fc/fcWorkbenchController';
  import { axisFcLayoutChipLabel, cycleAxisFcLayout } from './widgetControls';
  import { createAxisFcWidgetSnapshot } from './fcWidgetSnapshot.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const expanded = $derived(size === 'default');
  const fc = createAxisFcWidgetSnapshot();

  // roster size from the live FC model when a panel has loaded it; design count otherwise
  const fcLayoutCount = $derived(fc.model?.layouts ?? 9);
  const fcLayout = $derived(Math.max(0, Math.min(fcLayoutCount - 1, fc.selection.layout)));
</script>

<div class="axis-widget chips" data-size={size}>
  {#if expanded}<span class="mono token">LAY</span>{/if}
  <div class="chip-row">
    {#if mini}
      <button
        class="num-chip on"
        type="button"
        title={`Layout ${axisFcLayoutChipLabel(fcLayout)} · tap for next`}
        onclick={() => axisFcWorkbenchController.selectLayout(cycleAxisFcLayout(fcLayout, fcLayoutCount))}
      >
        {axisFcLayoutChipLabel(fcLayout)}
      </button>
    {:else}
      {#each Array(fcLayoutCount) as _, i}
        <button
          class="num-chip"
          class:on={i === fcLayout}
          type="button"
          title={`Layout ${axisFcLayoutChipLabel(i)}`}
          onclick={() => axisFcWorkbenchController.selectLayout(i)}
        >
          {axisFcLayoutChipLabel(i)}
        </button>
      {/each}
    {/if}
  </div>
</div>
