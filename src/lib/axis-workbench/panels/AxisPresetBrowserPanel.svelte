<script lang="ts">
  import AxisPresetBrowserPartPanel from './preset-browser/AxisPresetBrowserPartPanel.svelte';
  import type { PanelInstance } from '../../workbench';

  let { panel }: { panel: PanelInstance } = $props();
</script>

<AxisPresetBrowserPartPanel {panel} />
