<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { createAxisPresetBrowserPartView } from '../../presetBrowser/presetBrowserWorkbenchView.svelte';
  import PbSourcesBody from './parts/PbSourcesBody.svelte';
  import PbListTopBar from './parts/PbListTopBar.svelte';
  import PbListBody from './parts/PbListBody.svelte';
  import PbDetailBody from './parts/PbDetailBody.svelte';
  import PbOverlays from './parts/PbOverlays.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisPresetBrowserPartView('full');
</script>

<!-- §"full": the docked panel composes the three parts (sources | list | detail) itself, backed by
     the shared controller + real library data — it does NOT embed the legacy monolith (which stays the
     standalone library surface, still reachable in the classic shell / via the .full sub-parts). -->
<section class="axis-pb-full" data-part="full">
  <aside class="axis-pb-col axis-pb-sources"><PbSourcesBody {view} /></aside>
  <div class="axis-pb-col axis-pb-list">
    <PbListTopBar {view} />
    <div class="axis-pb-list-scroll"><PbListBody {view} /></div>
  </div>
  <aside class="axis-pb-col axis-pb-detail"><PbDetailBody {view} /></aside>
</section>

<PbOverlays {view} />

<style>
  /* §"full": three-column split (sources | list | detail). Absolute-fills the panel body so it always
     has a resolved height even inside flex dock nodes; each column scrolls independently. */
  .axis-pb-full {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    overflow: hidden;
    background: var(--bg);
    color: var(--text2);
    container-type: inline-size;
  }
  .axis-pb-col {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .axis-pb-sources {
    width: 248px;
    flex: none;
    gap: 12px;
    padding: 14px;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--bg2);
  }
  .axis-pb-list {
    flex: 1;
    gap: 12px;
    padding: 14px;
    overflow: hidden;
  }
  .axis-pb-list-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }
  .axis-pb-detail {
    width: 368px;
    flex: none;
    gap: 14px;
    padding: 14px;
    overflow-y: auto;
    border-left: 1px solid var(--border);
    background: var(--bg2);
  }
  /* Below the sources sidebar width the detail column collapses first, then sources, so a narrow dock
     still shows the list. */
  @container (max-width: 860px) {
    .axis-pb-detail {
      display: none;
    }
  }
  @container (max-width: 620px) {
    .axis-pb-sources {
      display: none;
    }
  }
</style>
