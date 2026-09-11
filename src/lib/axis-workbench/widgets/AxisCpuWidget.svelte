<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const cpu = $derived(Math.max(0, Math.min(100, editor.cpu ?? 0)));
  const cpuText = $derived(editor.cpu != null ? `${editor.cpu.toFixed(0)}%` : '--');
  const cpuColor = $derived(cpu > 75 ? 'var(--danger)' : cpu > 55 ? 'var(--amber)' : 'var(--accent)');
</script>

<div class="axis-widget meter" data-size={size} title="DSP load">
  <span class="mono token">CPU</span>
  <span class="bar"><span style:width={`${cpu}%`} style:background={cpuColor}></span></span>
  {#if expanded}<span class="mono strong">{cpuText}</span>{/if}
</div>

<style>
  .meter .bar {
    width: 44px;
    height: 6px;
    flex: none;
    overflow: hidden;
    border-radius: 3px;
    background: var(--track);
  }
  [data-size='mini'].meter .bar {
    width: 26px;
  }
  .meter .bar span {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
</style>
