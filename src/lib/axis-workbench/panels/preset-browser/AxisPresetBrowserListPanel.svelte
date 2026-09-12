<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisPresetBrowserPartView } from '../../presetBrowser/presetBrowserWorkbenchView.svelte';
  import PbPartChrome from './parts/PbPartChrome.svelte';
  import PbListTopBar from './parts/PbListTopBar.svelte';
  import PbListBody from './parts/PbListBody.svelte';
  import PbOverlays from './parts/PbOverlays.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisPresetBrowserPartView('list');
</script>

<PbPartChrome part="list">
  <PbListTopBar {view} />
  <PbListBody {view} />
</PbPartChrome>

<PbOverlays {view} />
