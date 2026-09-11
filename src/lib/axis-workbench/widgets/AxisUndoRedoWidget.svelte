<script lang="ts">
  import { history } from '$lib/editor/history.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
</script>

<button class="axis-widget" data-size={size} type="button" onclick={() => void history.undo()} title="undoRedo">
  <span class="glyph">↶</span>
  {#if expanded}<span class="mono token">undoRedo</span>{/if}
</button>

<style>
  .glyph {
    color: var(--textdim);
    font-size: 15px;
    line-height: 1;
  }
</style>
