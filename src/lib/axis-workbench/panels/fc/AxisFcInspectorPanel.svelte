<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisFcPartView } from '../../fc/fcPartView.svelte';
  import type { AxisFcSide } from '../../fc/fcWorkbenchData';
  import FcPanelChrome from './parts/FcPanelChrome.svelte';
  import FcInspectorShell from './parts/FcInspectorShell.svelte';
  import FcIdentityPanel from './parts/FcIdentityPanel.svelte';
  import FcActionCard from './parts/FcActionCard.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisFcPartView('inspector');

  const SIDES: readonly AxisFcSide[] = ['tap', 'hold'];
</script>

<FcPanelChrome part="inspector" runtimeSnapshot={view.runtimeSnapshot} dataReady={view.data.ready} inspBg>
  <FcInspectorShell {view} part="inspector">
    <FcIdentityPanel {view} wide={false} />
    {#each SIDES as which (which)}
      <FcActionCard {view} {which} bordered />
    {/each}
  </FcInspectorShell>
</FcPanelChrome>
