<script lang="ts">
  import { axisFcWorkbenchController } from '../fc/fcWorkbenchController';
  import { createAxisFcWidgetSnapshot } from './fcWidgetSnapshot.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const expanded = $derived(size === 'default');
  const fc = createAxisFcWidgetSnapshot();

  const fcViewCount = $derived(fc.model?.views ?? 4);
  const fcView = $derived(Math.max(0, Math.min(fcViewCount - 1, fc.selection.view)));
  const fcSwitch = $derived(fc.selection.switchIndex ?? 0);
</script>

<div class="axis-widget fc-switch" data-size={size}>
  {#if expanded}<span class="mono token">SW</span>{/if}
  <button class="fc-arrow" type="button" title="Previous switch" onclick={() => axisFcWorkbenchController.selectSwitch(Math.max(0, fcSwitch - 1))}>‹</button>
  <span class="mono big fc-num">{fcSwitch + 1}</span>
  <button class="fc-arrow" type="button" title="Next switch" onclick={() => axisFcWorkbenchController.selectSwitch(fcSwitch + 1)}>›</button>
  {#if expanded}<span class="mono token">VIEW</span>{/if}
  {#if !mini}
    <div class="chip-row">
      {#each Array(fcViewCount) as _, i}
        <button class="num-chip" class:on={i === fcView} type="button" title={`View ${i + 1}`} onclick={() => axisFcWorkbenchController.selectView(i)}>
          {i + 1}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .fc-arrow {
    width: 16px;
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    background: transparent;
    color: var(--aw-text-muted);
    cursor: pointer;
    font-size: 16px;
  }
  .fc-arrow:hover {
    color: var(--aw-text);
  }
  .fc-num {
    min-width: 14px;
    text-align: center;
  }
</style>
