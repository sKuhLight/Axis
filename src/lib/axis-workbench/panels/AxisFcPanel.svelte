<script lang="ts">
  import SignalGrid from '$lib/editor/SignalGrid.svelte';
  import FcEditor from '$lib/device/FcEditor.svelte';
  import type { PanelInstance } from '../../workbench';
  import { getWorkbenchContext } from '../../workbench/svelte/context';
  import { axisGridViewFromWidgets } from '../gridView';

  let { panel }: { panel: PanelInstance } = $props();
  const { controller: workbench } = getWorkbenchContext();
  const gridView = $derived(axisGridViewFromWidgets(Object.values($workbench.activeLayout?.widgets ?? {})));
</script>

{#if panel.state?.part === 'grid'}
  <div class="axis-pane-fill">
    <SignalGrid view={gridView} />
  </div>
{:else}
  <div class="axis-pane-fill">
    <FcEditor />
  </div>
{/if}

<style>
  .axis-pane-fill {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--aw-bg);
  }
</style>
