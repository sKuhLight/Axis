<script lang="ts">
  import WidgetZone from '../../workbench/svelte/WidgetZone.svelte';
  import {
    customPanelGridSettings,
    panelWidgetZoneId,
    selectVisibleWidgetsByZone,
    type PanelInstance
  } from '../../workbench';
  import { getWorkbenchContext } from '../../workbench/svelte/context';
  import { AXIS_MY_CONTROLS_EMPTY_LABEL } from '../myControlsPanel';
  import { AXIS_SECTION_DEFAULT_LABEL, createAxisSectionHeaderWidget } from '../myControlsSections';

  // My Controls — the single pin destination. It renders the same widget grid as
  // AxisCustomPanel but owns two things that panel does not: the section toolbar,
  // and a resting empty state that names the only way to fill the panel.
  let { panel }: { panel: PanelInstance } = $props();
  const { controller } = getWorkbenchContext();
  const zone = $derived(panelWidgetZoneId(panel.id));
  const grid = $derived(customPanelGridSettings(panel.state));
  const widgets = $derived(selectVisibleWidgetsByZone($controller.document, zone));

  // Sections and dividers are the same widget type; a blank label renders as a
  // bare rule. Both append to the end — the user renames in place, and the pin
  // menu is what files a control under a section.
  function addSectionMarker(label: string) {
    controller.dispatch({
      type: 'widget.add',
      widget: createAxisSectionHeaderWidget(label),
      zone,
      index: widgets.length
    });
  }
</script>

<section class="custom-panel" role="group" aria-label={panel.title ?? 'My Controls'}>
  <WidgetZone
    {zone}
    variant="grid"
    gridColumns={grid.columns}
    gridMinColumnWidth={grid.minColumnWidth}
    gridRowHeight={grid.rowHeight}
    gridGap={grid.gap}
    emptyLabel={AXIS_MY_CONTROLS_EMPTY_LABEL}
  />
  {#if !widgets.length && !$controller.editMode}
    <!-- WidgetZone hides an empty zone entirely unless layout editing is on, so
         the panel owns its own resting empty state — otherwise a fresh user opens
         My Controls to a blank rectangle with no clue how to fill it. -->
    <p class="empty">{AXIS_MY_CONTROLS_EMPTY_LABEL}</p>
  {/if}
  <div class="section-tools">
    <button type="button" onclick={() => addSectionMarker(AXIS_SECTION_DEFAULT_LABEL)}>＋ Section</button>
    <button type="button" onclick={() => addSectionMarker('')}>＋ Divider</button>
  </div>
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
  /* Sits below the grid rather than in it: adding a section is panel chrome, not
     a widget, and it must stay reachable when the panel is empty. Sticky to the
     panel's own bottom edge — a long control list must not bury it below a
     scroll the user has no reason to make just to add another section. */
  .section-tools {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 6px;
    margin: 10px 0 0;
    padding: 8px 0 2px;
    background: var(--bg);
  }
  .section-tools button {
    padding: 4px 9px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg2);
    color: var(--textdim);
    cursor: pointer;
    font: 600 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
  }
  .section-tools button:hover {
    border-color: var(--accent);
    color: var(--text);
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
