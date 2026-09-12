<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisPresetBrowserPartView } from '../../presetBrowser/presetBrowserWorkbenchView.svelte';
  import PbPartChrome from './parts/PbPartChrome.svelte';
  import PbDetailBody from './parts/PbDetailBody.svelte';
  import PbOverlays from './parts/PbOverlays.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisPresetBrowserPartView('detail');
</script>

<PbPartChrome part="detail">
  <PbDetailBody {view} />
</PbPartChrome>

<PbOverlays {view} />
