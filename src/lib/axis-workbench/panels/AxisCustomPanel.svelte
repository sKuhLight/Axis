<script lang="ts">
  import WidgetZone from '../../workbench/svelte/WidgetZone.svelte';
  import {
    customPanelGridSettings,
    panelWidgetZoneId,
    selectVisibleWidgetsByZone,
    type PanelInstance
  } from '../../workbench';
  import { getWorkbenchContext } from '../../workbench/svelte/context';
  import { AXIS_MY_CONTROLS_EMPTY_LABEL, AXIS_MY_CONTROLS_PANEL_TYPE } from '../myControlsPanel';

  // Renders both widget-grid panel types: the flag-gated edit-mode custom panel
  // and My Controls (the single pin destination). They differ only in how they
  // get filled, so only the empty-state copy branches.
  let { panel }: { panel: PanelInstance } = $props();
  const { controller } = getWorkbenchContext();
  const zone = $derived(panelWidgetZoneId(panel.id));
  const grid = $derived(customPanelGridSettings(panel.state));
  const empty = $derived(selectVisibleWidgetsByZone($controller.document, zone).length === 0);
  const emptyLabel = $derived(
    panel.type === AXIS_MY_CONTROLS_PANEL_TYPE ? AXIS_MY_CONTROLS_EMPTY_LABEL : 'Drop widgets here'
  );
</script>

<section class="custom-panel" role="group" aria-label={panel.title ?? 'Custom panel'}>
  <WidgetZone
    {zone}
    variant="grid"
    gridColumns={grid.columns}
    gridRowHeight={grid.rowHeight}
    gridGap={grid.gap}
    {emptyLabel}
  />
  {#if empty && !$controller.editMode}
    <!-- WidgetZone hides an empty zone entirely unless layout editing is on, so
         the panel owns its own resting empty state — otherwise a fresh user opens
         My Controls to a blank rectangle with no clue how to fill it. -->
    <p class="empty">{emptyLabel}</p>
  {/if}
</section>

<style>
  .custom-panel {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    padding: 12px;
    overflow: auto;
    background:
      linear-gradient(rgba(255, 255, 255, 0.018), transparent 110px),
      var(--bg);
  }
  .empty {
    margin: 0;
    padding: 24px 12px;
    text-align: center;
    text-wrap: balance;
    color: var(--textdim);
    font-size: 12px;
    line-height: 1.5;
  }
</style>
