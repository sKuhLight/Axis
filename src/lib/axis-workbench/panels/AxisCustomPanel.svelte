<script lang="ts">
  import WidgetZone from '../../workbench/svelte/WidgetZone.svelte';
  import type { PanelInstance } from '../../workbench';

  let { panel }: { panel: PanelInstance } = $props();
  const zone = $derived(`panel:${panel.id}`);
</script>

<section class="custom-panel">
  <WidgetZone {zone} variant="panel" emptyLabel="Drop widgets or parameters here" />
</section>

<style>
  .custom-panel {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    padding: 12px;
    overflow: auto;
    background:
      linear-gradient(rgba(255, 255, 255, 0.018), transparent 110px),
      var(--bg);
  }
</style>
