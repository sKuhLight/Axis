<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const notMini = $derived(size !== 'mini');
</script>

<button class="axis-widget" data-size={size} type="button" onclick={() => editor.tapTempo()} title="Tap tempo">
  <span class="mono big">{editor.bpm}</span>
  {#if notMini}<span class="mono token">BPM</span>{/if}
</button>
