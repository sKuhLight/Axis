<script lang="ts">
  import { overlays } from '$lib/overlay/overlays.svelte';
  import { metronome } from '$lib/editor/metronome.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const on = $derived(metronome.running || overlays.isOpen('metronome'));
</script>

<button
  class="axis-widget metro"
  class:on
  data-size={size}
  data-active={on ? 'true' : 'false'}
  type="button"
  title="Metronome · M"
  aria-label="Metronome"
  onclick={() => overlays.toggle('metronome')}
>
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3 7 20h10L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
    <path d="M11.6 8.4 18 5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    <circle cx="18.4" cy="5.2" r="1.4" fill="currentColor" />
    <path d="M6 20h12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
  </svg>
  {#if expanded}<span class="mono token">MET</span>{/if}
</button>

<style>
  .metro svg {
    width: 15px;
    height: 15px;
    color: var(--textdim);
  }
  .metro.on svg {
    color: var(--accent);
  }
  .metro.on {
    border-color: var(--accent-border);
    background: var(--accent-tint);
  }
  .metro.on .token {
    color: var(--accent);
  }
</style>
