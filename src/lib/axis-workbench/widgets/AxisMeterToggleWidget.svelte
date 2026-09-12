<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const notMini = $derived(size !== 'mini');
</script>

<button class="axis-widget meter-toggle" class:on={editor.meteringOn} data-size={size} type="button" disabled={!editor.canMeterBlocks} title={editor.canMeterBlocks ? "Per-block audio meters — polls the open block's level once per ~0.5s" : 'Per-block metering needs a ready device with live monitors on a fast link'} onclick={() => (editor.meteringOn = !editor.meteringOn)}>
  <span class="meter-glyph">▊</span>
  {#if expanded}<span class="mono token">METER</span>{/if}
  {#if notMini}<span class="mono meter-state">{editor.meteringOn ? 'ON' : 'OFF'}</span>{/if}
</button>

<style>
  .meter-toggle .meter-glyph {
    color: var(--aw-text-faint);
    font-size: 11px;
    line-height: 1;
  }
  .meter-toggle .meter-state {
    color: var(--aw-text-faint);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .meter-toggle.on .meter-glyph,
  .meter-toggle.on .meter-state {
    color: var(--aw-accent);
  }
  .meter-toggle:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
