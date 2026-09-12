<script lang="ts">
  import { history } from '$lib/editor/history.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
</script>

<button class="axis-widget square" data-size={size} type="button" onclick={() => (history.panelOpen = true)} title="History">
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
    <path d="M8 4.6 V8 L10.3 9.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
  </svg>
</button>

<style>
  .square {
    width: 38px;
    justify-content: center;
    padding: 0;
    color: var(--textdim);
  }
  .square[data-size='compact'] {
    width: 34px;
  }
  .square[data-size='mini'] {
    width: 28px;
    justify-content: center;
    padding: 0;
  }
</style>
