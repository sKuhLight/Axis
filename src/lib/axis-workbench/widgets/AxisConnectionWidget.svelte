<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const connDot = $derived(editor.conn.state === 'online' ? 'var(--ok)' : editor.conn.state === 'offline' ? 'var(--danger)' : 'var(--amber)');
</script>

<button class="axis-widget" data-size={size} type="button" onclick={() => editor.openPorts()} title="Connection">
  <span class="led" style:background={connDot}></span>
  {#if expanded}<span class="mono token">{editor.conn.fw ? `AX-3 · FW${editor.conn.fw}` : editor.conn.state}</span>{/if}
</button>

<style>
  .led {
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
    box-shadow: 0 0 8px currentColor;
  }
</style>
