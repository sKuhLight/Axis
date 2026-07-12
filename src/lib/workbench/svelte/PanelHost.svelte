<script lang="ts">
  import { getWorkbenchContext } from './context';
  import type { PanelInstance, WorkbenchCommand } from '../core';

  let { panel }: { panel: PanelInstance } = $props();
  const { controller, registry } = getWorkbenchContext();
  const Component = $derived(registry.panel(panel.type));
</script>

<article class="aw-panel" class:collapsed={panel.collapsed} data-panel={panel.id} data-panel-type={panel.type}>
  {#if !panel.collapsed}
    <div class="aw-panel-body">
      {#if Component}
        <Component panel={panel} dispatch={(command: WorkbenchCommand) => controller.dispatch(command)} editMode={$controller.editMode} />
      {/if}
    </div>
  {/if}
</article>

<style>
  .aw-panel {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: transparent;
  }
  .aw-panel-body {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--aw-bg);
  }
</style>
