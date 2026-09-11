<script lang="ts">
  import AxisPresetBrowserFullPanel from './preset-browser/AxisPresetBrowserFullPanel.svelte';
  import type { PanelInstance } from '../../workbench';

  let { panel }: { panel: PanelInstance } = $props();
</script>

<AxisPresetBrowserFullPanel {panel} />
