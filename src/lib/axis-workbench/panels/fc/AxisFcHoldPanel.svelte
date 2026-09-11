<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisFcPartView } from '../../fc/fcPartView.svelte';
  import FcPanelChrome from './parts/FcPanelChrome.svelte';
  import FcInspectorShell from './parts/FcInspectorShell.svelte';
  import FcActionCard from './parts/FcActionCard.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisFcPartView('hold');
</script>

<FcPanelChrome part="hold" runtimeSnapshot={view.runtimeSnapshot} dataReady={view.data.ready} inspBg>
  <FcInspectorShell {view} part="hold">
    <FcActionCard {view} which="hold" bordered={false} />
  </FcInspectorShell>
</FcPanelChrome>
