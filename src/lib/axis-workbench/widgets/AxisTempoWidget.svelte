<script lang="ts">
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const notMini = $derived(size !== 'mini');
</script>

<button class="axis-widget" data-size={size} type="button" onclick={() => deviceSession.tapTempo()} title="Tap tempo">
  <span class="mono big">{deviceSession.bpm}</span>
  {#if notMini}<span class="mono token">BPM</span>{/if}
</button>
