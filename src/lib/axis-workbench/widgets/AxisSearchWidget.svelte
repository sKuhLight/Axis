<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
</script>

<button class="axis-widget search" data-size={size} type="button" onclick={() => editor.openLibrary()} title="Search presets">
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
    <path d="M10.8 10.8 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
  </svg>
  {#if expanded}<span>Search presets...</span>{/if}
</button>

<style>
  .search {
    color: var(--textfaint);
  }
</style>
