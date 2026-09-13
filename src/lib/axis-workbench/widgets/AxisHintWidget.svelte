<script lang="ts">
  import { deviceSession, editorHints, paramEditing } from '$lib/editor/editorClients.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const hintText = $derived(editorHints.hint ?? (paramEditing.selected ? paramEditing.selected.display : deviceSession.conn.state === 'online' ? 'Ready' : deviceSession.conn.state === 'offline' ? 'Device offline' : 'Connecting…'));
</script>

<div class="axis-widget hint" data-size={size} title={hintText}>
  <span class="mono hint-text">{hintText}</span>
</div>

<style>
  .hint {
    flex: 1;
    min-width: 0;
    max-width: 420px;
    justify-content: flex-start;
    border-color: transparent;
    background: transparent;
    cursor: default;
  }
  .hint-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--textdim);
    font-size: 11px;
    font-weight: 600;
  }
</style>
