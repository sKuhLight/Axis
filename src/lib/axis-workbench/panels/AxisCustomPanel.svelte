<script lang="ts">
  import WidgetZone from '../../workbench/svelte/WidgetZone.svelte';
  import {
    WORKBENCH_PARAMETER_SOURCE_MIME,
    createParameterWidgetCommand,
    customPanelGridSettings,
    panelWidgetZoneId,
    parseWorkbenchParameterSource,
    selectVisibleWidgetsByZone,
    type PanelInstance
  } from '../../workbench';
  import { getWorkbenchContext } from '../../workbench/svelte/context';

  let { panel }: { panel: PanelInstance } = $props();
  const { controller } = getWorkbenchContext();
  const zone = $derived(panelWidgetZoneId(panel.id));
  const grid = $derived(customPanelGridSettings(panel.state));
  const widgetCount = $derived(selectVisibleWidgetsByZone($controller.document, zone).length);
  let parameterDragHover = $state(false);

  // Clear the drag-hover wash whenever any drag ends (drop anywhere, Escape-cancel,
  // or release over a non-target) — `dragleave` alone misses the Escape-cancel and
  // cross-window cases, which left the accent outline stuck until reload (T20 bug #2).
  $effect(() => {
    if (typeof window === 'undefined') return;
    const clear = () => { parameterDragHover = false; };
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  });

  function hasParameterSource(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(WORKBENCH_PARAMETER_SOURCE_MIME);
  }

  function onParameterDragOver(event: DragEvent) {
    if (!hasParameterSource(event)) return;
    // Claim the drop here so the workspace-level edge-drop (which would spawn a
    // NEW panel per parameter) does not also fire — dropping onto a panel means
    // "collect into THIS panel".
    event.preventDefault();
    event.stopPropagation();
    parameterDragHover = true;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onParameterDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    parameterDragHover = false;
  }

  function onParameterDrop(event: DragEvent) {
    const raw = event.dataTransfer?.getData(WORKBENCH_PARAMETER_SOURCE_MIME);
    const source = raw ? parseWorkbenchParameterSource(raw) : null;
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    parameterDragHover = false;
    const command = createParameterWidgetCommand($controller.document, source, { zone, index: widgetCount });
    if (command) controller.dispatch(command);
  }
</script>

<section
  class="custom-panel"
  class:parameter-drag-hover={parameterDragHover}
  role="group"
  aria-label={panel.title ?? 'Custom panel'}
  ondragover={onParameterDragOver}
  ondragleave={onParameterDragLeave}
  ondrop={onParameterDrop}
>
  <WidgetZone
    {zone}
    variant="grid"
    gridColumns={grid.columns}
    gridRowHeight={grid.rowHeight}
    gridGap={grid.gap}
    emptyLabel="Drop widgets or parameters here"
  />
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
  .custom-panel.parameter-drag-hover {
    outline: 1px solid color-mix(in srgb, var(--aw-accent, #35c9d6) 58%, transparent);
    outline-offset: -8px;
  }
</style>
