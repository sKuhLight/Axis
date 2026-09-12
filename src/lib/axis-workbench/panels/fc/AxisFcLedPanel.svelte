<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisFcPartView } from '../../fc/fcPartView.svelte';
  import FcPanelChrome from './parts/FcPanelChrome.svelte';
  import FcInspectorShell from './parts/FcInspectorShell.svelte';
  import FcIdentityPanel from './parts/FcIdentityPanel.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisFcPartView('led');
</script>

<FcPanelChrome part="led" runtimeSnapshot={view.runtimeSnapshot} dataReady={view.data.ready} inspBg>
  <FcInspectorShell {view} part="led">
    <FcIdentityPanel {view} wide={true} />
  </FcInspectorShell>
</FcPanelChrome>
