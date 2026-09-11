<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisPresetBrowserPartView } from '../../presetBrowser/presetBrowserWorkbenchView.svelte';
  import PbPartChrome from './parts/PbPartChrome.svelte';
  import PbSourcesBody from './parts/PbSourcesBody.svelte';
  import PbOverlays from './parts/PbOverlays.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisPresetBrowserPartView('sources');
</script>

<PbPartChrome part="sources">
  <PbSourcesBody {view} />
</PbPartChrome>

<PbOverlays {view} />
