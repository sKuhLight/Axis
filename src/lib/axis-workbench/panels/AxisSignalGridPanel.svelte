<script lang="ts">
  import SignalGrid from '../../SignalGrid.svelte';
  import WidgetZone from '../../workbench/svelte/WidgetZone.svelte';
  import { selectVisibleWidgetsByZone } from '../../workbench';
  import { getWorkbenchContext } from '../../workbench/svelte/context';
  import { AXIS_DEFAULT_GRID_VIEW, axisGridViewFromWidgets } from '../gridView';

  const { controller } = getWorkbenchContext();
  const barVisible = $derived(selectVisibleWidgetsByZone($controller.document, 'gridbar').length > 0 || $controller.editMode);
  // No grid-control widgets in this layout → fall back to auto+M so pane-relative
  // stepping (full → map) still works; the widgets only override, never enable it.
  const view = $derived(
    axisGridViewFromWidgets(Object.values($controller.activeLayout?.widgets ?? {})) ?? AXIS_DEFAULT_GRID_VIEW
  );
</script>

<div class="axis-pane-fill">
  {#if barVisible}
    <div class="axis-gridbar">
      <WidgetZone zone="gridbar" variant="bar" emptyLabel="Grid Bar" fitGap={8} />
    </div>
  {/if}
  <SignalGrid {view} />
</div>

<style>
  .axis-pane-fill {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .axis-gridbar {
    flex: none;
    min-width: 0;
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    background: var(--aw-bg-2);
    border-bottom: 1px solid var(--aw-border);
  }
  .axis-gridbar :global(.aw-widget-zone) {
    flex: 1;
  }
</style>
