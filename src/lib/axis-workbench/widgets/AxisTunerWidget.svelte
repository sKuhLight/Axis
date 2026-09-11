<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
</script>

<button class="axis-widget" data-size={size} type="button" onclick={() => editor.toggleTuner()} title="tuner">
  <span class="glyph">♪</span>
  {#if expanded}<span class="mono token">TUNE</span>{/if}
</button>

<style>
  .glyph {
    color: var(--textdim);
    font-size: 15px;
    line-height: 1;
  }
</style>
