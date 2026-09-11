<script lang="ts">
  import { axisFcWorkbenchController } from '../../../fc/fcWorkbenchController';
  import type { AxisFcDataView } from '../../../fc/fcWorkbenchData';

  let { views }: { views: AxisFcDataView['views'] } = $props();
</script>

{#each views as view (view.index)}
  <button
    type="button"
    class="fc-viewchip"
    class:on={view.active}
    class:assigned={view.assigned}
    aria-pressed={view.active}
    title={`View ${view.label}${view.assigned ? ' · has assigned switches' : ''}`}
    onclick={() => axisFcWorkbenchController.selectView(view.index)}
  >
    {view.label}
    {#if view.assigned && !view.active}<span class="fc-dot tiny"></span>{/if}
  </button>
{/each}

<style>
  .fc-viewchip {
    position: relative;
    width: 34px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid var(--aw-border-2);
    background: var(--aw-surface);
    color: var(--aw-text-faint);
    font: 700 13px/1 var(--aw-font-mono);
    cursor: pointer;
  }
  .fc-viewchip.assigned {
    color: var(--aw-text-2);
  }
  .fc-viewchip:hover:not(.on) {
    border-color: var(--aw-border-3);
    color: var(--aw-text);
  }
  .fc-viewchip.on {
    background: var(--aw-accent);
    border-color: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .fc-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--aw-accent);
  }
  .fc-dot.tiny {
    top: 4px;
    right: 4px;
    width: 4px;
    height: 4px;
  }
</style>
