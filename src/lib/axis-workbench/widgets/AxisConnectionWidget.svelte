<script lang="ts">
  import { deviceSession, editorOverlays } from '$lib/editor/editorClients.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const connDot = $derived(deviceSession.conn.state === 'online' ? 'var(--ok)' : deviceSession.conn.state === 'offline' ? 'var(--danger)' : 'var(--amber)');
</script>

<button class="axis-widget" data-size={size} type="button" onclick={() => editorOverlays.openAxis('device')} title="Connection">
  <span class="led" style:background={connDot}></span>
  {#if expanded}<span class="mono token">{deviceSession.conn.fw ? `AX-3 · FW${deviceSession.conn.fw}` : deviceSession.conn.state}</span>{/if}
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
