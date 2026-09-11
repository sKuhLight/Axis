<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisFcPartView } from '../../fc/fcPartView.svelte';
  import FcPanelChrome from './parts/FcPanelChrome.svelte';
  import FcInspectorShell from './parts/FcInspectorShell.svelte';
  import FcActionCard from './parts/FcActionCard.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisFcPartView('tap');
</script>

<FcPanelChrome part="tap" runtimeSnapshot={view.runtimeSnapshot} dataReady={view.data.ready} inspBg>
  <FcInspectorShell {view} part="tap">
    <FcActionCard {view} which="tap" bordered={false} />
  </FcInspectorShell>
</FcPanelChrome>
