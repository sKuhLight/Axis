<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisFcPartView } from '../../fc/fcPartView.svelte';
  import FcPanelChrome from './parts/FcPanelChrome.svelte';
  import FcLayoutsStrip from './parts/FcLayoutsStrip.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisFcPartView('layouts');
</script>

<FcPanelChrome part="layouts" runtimeSnapshot={view.runtimeSnapshot} dataReady={view.data.ready}>
  <FcLayoutsStrip data={view.data} />
</FcPanelChrome>
