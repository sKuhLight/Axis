<script lang="ts">
  import AxisFcPartPanel from './fc/AxisFcPartPanel.svelte';
  import type { PanelInstance } from '../../workbench';

  let { panel }: { panel: PanelInstance } = $props();
</script>

<AxisFcPartPanel {panel} />
