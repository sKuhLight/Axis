<script lang="ts">
  import WidgetHost from './WidgetHost.svelte';
  import { widgetGridPlacement } from './widgetGridPlacement';
  import WidgetGroupHost from './WidgetGroupHost.svelte';
  import { getWorkbenchContext } from './context';
  import {
    fitWidgetInWidth,
    selectVisibleWidgetsByZone,
    widgetZoneLabel,
    type JsonObject,
    type WidgetFitDescriptor,
    type WidgetInstance,
    type WidgetSize
  } from '../core';
  import { onMount } from 'svelte';
  import { labelFromWorkbenchType } from './library';
  import { WIDGET_ZONE_ADD_BUTTON_PX } from './addCatalog';
  import { fitWidgetZones, WIDGET_ZONE_EDIT_GAP_PX, WIDGET_ZONE_FIT_GROUP_EDIT_PAD_PX, type FitZoneInput } from './zoneFit';

  type WidgetUnit = { groupId?: string; widgetIds: string[] };

  let {
    zone,
    floating = false,
    variant = 'bar',
    emptyLabel,
    // `fitGroup` = the set of zones fitted jointly against a shared container
    // width (design §8: `tl+tc+tr` decide one size together). When set, the
    // shared width is measured from `zoneEl.parentElement` (their common bar).
    fitGroup,
    // Per-zone gap used both by the CSS layout and the fit estimate. Design §8:
    // top zones 12px, bottom 10px, gridbar 8px.
    fitGap = 12,
    gridColumns = 4,
    gridRowHeight = 42,
    gridGap = 8
  }: {
    zone: string;
    floating?: boolean;
    variant?: 'bar' | 'panel' | 'grid';
    emptyLabel?: string;
    fitGroup?: string[];
    fitGap?: number;
    gridColumns?: number;
    gridRowHeight?: number;
    gridGap?: number;
  } = $props();

  const { controller, registry } = getWorkbenchContext();
  let zoneEl = $state<HTMLElement | null>(null);
  let zoneWidth = $state(0);
  let groupWidth = $state(0);
  let overflowOpen = $state(false);
  const widgets = $derived(availableWidgets(selectVisibleWidgetsByZone($controller.document, zone)));
  const units = $derived(unitsForZone(widgets));
  const visible = $derived(units.length > 0 || $controller.editMode);
  const vertical = $derived(zone === 'rail');
  // Bar zones auto-fit + shed into the `⋯` overflow. Panel/grid/rail/float do not.
  const fitEnabled = $derived(variant === 'bar' && !floating && !vertical);

  // Design estW for a widget type via the app-provided sizing table
  // (workbench holds no widget-type knowledge). Fallback = flat 120.
  function estWidthOf(type: string): number {
    return registry.widgetSizing?.estWidth(type) ?? 120;
  }
  function isKeepType(type: string): boolean {
    return registry.widgetSizing?.isKeep?.(type) ?? false;
  }
  // App-gated widget types (e.g. a device capability) that cannot render right
  // now: never mounted here and never counted by the fit (no phantom width).
  function isAvailableType(type: string): boolean {
    return registry.widgetSizing?.isAvailable?.(type) ?? true;
  }
  function availableWidgets(source: WidgetInstance[]): WidgetInstance[] {
    return source.filter((widget) => isAvailableType(widget.type));
  }

  function unitsForZone(source: WidgetInstance[]): WidgetUnit[] {
    const out: WidgetUnit[] = [];
    const seenGroups = new Set<string>();
    for (const widget of source) {
      if (widget.groupId) {
        if (seenGroups.has(widget.groupId)) continue;
        const group = $controller.activeLayout?.widgetGroups[widget.groupId];
        seenGroups.add(widget.groupId);
        out.push({ groupId: widget.groupId, widgetIds: group?.widgetIds ?? [widget.id] });
      } else {
        out.push({ widgetIds: [widget.id] });
      }
    }
    return out;
  }

  function unitDescriptor(unit: WidgetUnit): WidgetFitDescriptor {
    const layout = $controller.activeLayout;
    const members = availableWidgets(unit.widgetIds.map((id) => layout?.widgets[id]).filter(Boolean) as WidgetInstance[]);
    const estW = members.reduce((total, widget) => total + estWidthOf(widget.type), 0) || 120;
    // Keep-protected if any member is in the app keep-set OR is locked.
    const keep = members.some((widget) => widget.locked || isKeepType(widget.type));
    return { key: unitKey(unit), estW, keep };
  }

  // The zones fitted together (the whole fit group, or this zone alone), each
  // with its unit descriptors — the edit-mode chrome is reserved per zone.
  const fitZones = $derived.by<FitZoneInput[]>(() => {
    if (!fitEnabled) return [];
    const zones = fitGroup && fitGroup.length ? fitGroup : [zone];
    return zones.map((z) => {
      const zoneWidgets = z === zone ? widgets : availableWidgets(selectVisibleWidgetsByZone($controller.document, z));
      return { zone: z, units: unitsForZone(zoneWidgets).map(unitDescriptor) };
    });
  });

  const availWidth = $derived(fitGroup && fitGroup.length ? groupWidth : zoneWidth);

  // ── Add (edit mode, with a host Add palette) ─────────────────────────────
  // A compact "+" at the zone's free end, or "+ Widget" filling an empty zone,
  // opens the Add palette on Widgets with this zone as its fixed target: a
  // card click inserts right here (no highlight step). While a drag / placement
  // runs the "+" keeps its place but is invisible and inert.
  const canAdd = $derived($controller.editMode && !floating && zone !== 'hidden' && !!registry.addPalette);

  // Joint fit + shedding (design `_fit` / `_overflow`, 01-shell §8). Overflow
  // shedding only applies outside edit mode (design: units stay visible while
  // editing). Slice 4b: while editing the fit reserves the "+" / "+ Widget"
  // buttons and the wider edit gap, so a narrow bar (834 px) steps its units
  // down instead of spilling, and empty zones collapse "+ Widget" to "+" when
  // the label would cost the units a size.
  const fitResult = $derived.by(() => {
    if (!fitEnabled || availWidth <= 0) return { size: 'default' as WidgetSize, overflow: new Set<string>(), emptyAdd: 'label' as const };
    return fitWidgetZones({
      zones: fitZones,
      avail: availWidth,
      gap: fitGap,
      editing: $controller.editMode,
      canAdd,
      zoneChromePx: fitGroup && fitGroup.length ? WIDGET_ZONE_FIT_GROUP_EDIT_PAD_PX * 2 : 0
    });
  });
  const zoneSize = $derived(fitResult.size);
  const overflowKeys = $derived(fitResult.overflow);
  const emptyAddCompact = $derived(variant === 'bar' && fitResult.emptyAdd === 'compact');

  const renderedUnits = $derived(units.filter((unit) => !overflowKeys.has(unitKey(unit))));
  const overflowUnits = $derived(units.filter((unit) => overflowKeys.has(unitKey(unit))));

  // ── Drop target (slice 4b) ───────────────────────────────────────────────
  // A widget drag / placement inserting into this zone washes the zone; the
  // insert LINE itself is drawn by the DragLayer (nothing is spliced into the
  // flow — the units keep their places). A reorder inside a group is not a
  // zone insert.
  const drag = $derived($controller.drag);
  const dropTarget = $derived(drag?.kind === 'widget' && !drag.groupInsert && drag.zoneInsert?.zone === zone);
  const dragging = $derived(drag?.kind === 'widget');
  // Edit mode: the units of a flow zone move apart so the insert line sits
  // clearly between them (the grid variant keeps its configured gap; the free
  // canvas has no flow).
  const editSpread = $derived($controller.editMode && !floating && variant !== 'grid');

  // Manual density is a ceiling; auto-fit shrinks below it (design mkW). The
  // WidgetHost caps `forcedSize` by the widget's own manual size, so returning
  // the raw auto-fit here is correct.
  //   - bar zones: the joint zone-level size (one tier for all fitted units)
  //   - panel zones: per-widget width fit (design mkW: estW <= availW-24 …)
  function forcedSizeFor(unit: WidgetUnit): WidgetSize | undefined {
    if (fitEnabled) return zoneSize;
    if (variant === 'panel' && zoneWidth > 0) {
      const est = unitDescriptor(unit).estW;
      return fitWidgetInWidth(est, zoneWidth - 24);
    }
    return undefined;
  }

  const zoneName = $derived(widgetZoneLabel($controller.activeLayout, zone));
  function openAdd() {
    controller.openAddPalette({
      filter: 'widgets',
      target: { kind: 'widget', zone, label: units.length ? `End of ${zoneName}` : `Into ${zoneName}` }
    });
  }

  function unitKey(unit: WidgetUnit): string {
    return unit.groupId ?? unit.widgetIds[0] ?? 'unit';
  }

  function unitLabel(unit: WidgetUnit): string {
    const layout = $controller.activeLayout;
    if (unit.groupId) {
      const labels = unit.widgetIds
        .map((id) => layout?.widgets[id])
        .filter(Boolean)
        .map((widget) => labelFromWorkbenchType(widget!.type));
      return labels.join(' + ');
    }
    const widget = layout?.widgets[unit.widgetIds[0]];
    return widget ? labelFromWorkbenchType(widget.type) : unit.widgetIds[0] ?? 'Widget';
  }

  function readPlacementObject(value: unknown): JsonObject | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
  }

  function gridCellStyle(unit: WidgetUnit): string {
    const widget = $controller.activeLayout?.widgets[unit.widgetIds[0]];
    const placement = readPlacementObject(widget?.state?.grid) ?? readPlacementObject(widget?.state?.placement);
    return widgetGridPlacement(placement, gridColumns);
  }

  onMount(() => {
    if (!zoneEl) return;
    const groupEl = fitGroup && fitGroup.length ? zoneEl.parentElement : null;
    const measure = () => {
      if (zoneEl) zoneWidth = zoneEl.clientWidth;
      if (groupEl) groupWidth = groupEl.clientWidth;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(zoneEl);
    if (groupEl) ro.observe(groupEl);
    return () => ro.disconnect();
  });
</script>

{#if visible}
  <section
    class="aw-widget-zone"
    class:floating
    class:panel={variant === 'panel'}
    class:grid={variant === 'grid'}
    class:fit-group={!!fitGroup?.length}
    class:overflow-open={overflowOpen}
    class:drop-target={dropTarget}
    bind:this={zoneEl}
    data-zone={zone}
    style:--aw-zone-grid-columns={gridColumns}
    style:--aw-zone-grid-row-height={`${gridRowHeight}px`}
    style:--aw-zone-grid-gap={`${gridGap}px`}
    style:gap={editSpread ? `${WIDGET_ZONE_EDIT_GAP_PX}px` : undefined}
    style:padding-inline={$controller.editMode && fitGroup?.length ? `${WIDGET_ZONE_FIT_GROUP_EDIT_PAD_PX}px` : undefined}
  >
    {#each renderedUnits as unit (unit.groupId ?? unit.widgetIds[0])}
      {#if variant === 'grid'}
        <div class="aw-widget-grid-cell" style={gridCellStyle(unit)}>
          {#if unit.groupId}
            <WidgetGroupHost groupId={unit.groupId} />
          {:else}
            {@const widget = $controller.activeLayout?.widgets[unit.widgetIds[0]]}
            {#if widget}
              <WidgetHost {widget} />
            {/if}
          {/if}
        </div>
      {:else}
        {#if unit.groupId}
          <WidgetGroupHost groupId={unit.groupId} forcedSize={forcedSizeFor(unit)} />
        {:else}
          {@const widget = $controller.activeLayout?.widgets[unit.widgetIds[0]]}
          {#if widget}
            <WidgetHost {widget} forcedSize={forcedSizeFor(unit)} />
          {/if}
        {/if}
      {/if}
    {/each}
    {#if canAdd && units.length}
      <!-- Hidden (but keeping its place, so nothing shifts) while a drag or a
           placement runs. -->
      <button
        class="aw-zone-add"
        class:stepped-aside={dragging}
        type="button"
        data-zone-add={zone}
        style:width={`${WIDGET_ZONE_ADD_BUTTON_PX}px`}
        title={`Add a widget to ${zoneName}`}
        aria-label={`Add a widget to ${zoneName}`}
        tabindex={dragging ? -1 : undefined}
        onclick={openAdd}
      >+</button>
    {/if}
    {#if overflowUnits.length}
      <button class="aw-overflow-chip" type="button" title="Hidden — not enough space" onclick={() => (overflowOpen = !overflowOpen)}>
        ⋯ {overflowUnits.length}
      </button>
      {#if overflowOpen}
        <button class="aw-overflow-scrim" type="button" aria-label="Close overflow menu" onclick={() => (overflowOpen = false)}></button>
        <div class="aw-overflow-menu">
          <h2>Hidden · Not Enough Space</h2>
          {#each overflowUnits as unit (unitKey(unit))}
            <div class="aw-overflow-row">
              <span></span>
              <strong>{unitLabel(unit)}</strong>
              <i>{zone}</i>
            </div>
          {/each}
          <button type="button" class="aw-overflow-customize" onclick={() => { controller.setEditMode(true); overflowOpen = false; }}>
            ✥ Rearrange in Customize
          </button>
        </div>
      {/if}
    {/if}
    {#if !units.length && canAdd}
      <!-- Editing: an empty zone is one "+ Widget" button (the drag hint stays
           as its second line in panel bodies). A tight bar collapses it to the
           compact "+". During a drag it stays (inert) and lights up when the
           drop would land here. -->
      <button
        class="aw-zone-empty aw-zone-add-empty"
        class:body={variant !== 'bar'}
        class:compact={emptyAddCompact}
        class:ins={dropTarget}
        class:stepped-aside={dragging}
        type="button"
        data-zone-add={zone}
        style:width={emptyAddCompact ? `${WIDGET_ZONE_ADD_BUTTON_PX}px` : undefined}
        title={`Add a widget to ${zoneName}`}
        aria-label={`Add a widget to ${zoneName}`}
        tabindex={dragging ? -1 : undefined}
        onclick={openAdd}
      >
        {#if variant !== 'bar'}
          <b>+ Widget</b>
          <i>{emptyLabel ? `or ${emptyLabel.charAt(0).toLowerCase()}${emptyLabel.slice(1)}` : 'or drag widgets & params here'}</i>
        {:else if emptyAddCompact}+{:else}+ Widget{/if}
      </button>
    {:else if !units.length && (variant !== 'bar' || $controller.editMode)}
      <!-- Design §2.2: empty custom panels always show the dashed drag hint;
           bar zones only surface it while editing. -->
      <span class="aw-zone-empty" class:body={variant !== 'bar'} class:ins={dropTarget}>
        {#if variant !== 'bar'}
          <b>Empty Panel</b>
          <i>{emptyLabel ?? 'drag widgets & params here'}</i>
        {:else}{emptyLabel ?? zone}{/if}
      </span>
    {/if}
  </section>
{/if}

<style>
  .aw-widget-zone {
    min-width: 0;
    max-width: 100%;
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    /* Fill the cross-axis of the bar that hosts us (top bar / bottom bar are
       `align-items: center`, which would otherwise shrink this section to its
       content height and leave a dead strip of bar above/below that is NOT a
       `[data-zone]` — so widget-drop hit-testing (elementFromPoint →
       closest('[data-zone]')) misses the bar entirely). Stretching the section
       makes the whole visible bar strip a drop target; inner content stays
       vertically centred via this element's own `align-items: center`. */
    align-self: stretch;
  }
  .aw-widget-zone.overflow-open {
    overflow: visible;
    z-index: 42;
  }
  /* In edit mode a widget's drag-surface dashed outline sits just outside the
     chip (outline-offset); bar zones must not clip it. The button clusters
     themselves are inset (V13b) and stay inside the chip. Panel/grid zones keep
     their own scroll/overflow. */
  :global(.aw-root.aw-editing) .aw-widget-zone:not(.panel):not(.grid) {
    overflow: visible;
  }
  /* Slice 4b (AXIS-66): the jointly fitted top-bar zones never spill over a
     neighbour while editing. The fit already reserves the "+" buttons and the
     edit gap; if a crowded bar still does not fit at mini, the zone clips and
     scrolls sideways instead of wrapping or overlapping. Its inline padding
     (set inline, reserved by the fit) keeps the units' dashed outlines inside;
     `safe` alignment keeps the start reachable when it overflows. */
  :global(.aw-root.aw-editing) .aw-widget-zone.fit-group {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }
  :global(.aw-root.aw-editing) .aw-widget-zone.fit-group[data-zone='top.right'] {
    justify-content: safe flex-end;
  }
  :global(.aw-root.aw-editing) .aw-widget-zone.fit-group[data-zone='top.center'] {
    justify-content: safe center;
  }
  .aw-widget-zone[data-zone='top.right'] {
    justify-content: flex-end;
  }
  .aw-widget-zone[data-zone='top.center'] {
    justify-content: center;
  }
  .aw-widget-zone[data-zone='rail'] {
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
  }
  .aw-widget-zone.floating {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
  .aw-widget-zone.panel {
    width: 100%;
    min-height: 100%;
    align-content: flex-start;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    overflow: auto;
  }
  .aw-widget-zone.grid {
    width: 100%;
    min-height: 100%;
    display: grid;
    grid-template-columns: repeat(var(--aw-zone-grid-columns), minmax(0, 1fr));
    /* T21 directive #4: rows GROW to fit tall units (the row-height is a floor,
       not a cap). A param-control tile (Block-Editor square, ~92px) is far taller
       than the 42px default row — a fixed row clipped the tile so the customize
       dashed outline (bound to the host box) cut straight through it. `minmax(…,
       auto)` lets each row take its tallest unit, so the host wraps the full
       rendered tile and the outline wraps the host. */
    grid-auto-rows: minmax(var(--aw-zone-grid-row-height), auto);
    gap: var(--aw-zone-grid-gap);
    /* `start` (not `stretch`): a cell hugs its unit's own height instead of being
       stretched to the (possibly taller) row, so a short chip sharing a row with a
       tall tile keeps a tight outline. Widths still fill via the cell/host below. */
    align-items: start;
    align-content: flex-start;
    overflow: auto;
    padding: 1px;
  }
  .aw-widget-grid-cell {
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  .aw-widget-grid-cell :global(.aw-widget-host),
  .aw-widget-grid-cell :global(.axis-widget) {
    width: 100%;
  }
  .aw-zone-empty {
    min-width: 72px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--aw-border-2);
    border-radius: 8px;
    color: var(--aw-text-faint);
    background: color-mix(in srgb, var(--aw-surface) 36%, transparent);
    font: 700 9px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
  }
  .aw-widget-zone.panel .aw-zone-empty,
  .aw-widget-zone.grid .aw-zone-empty {
    width: 100%;
    min-height: 116px;
    height: auto;
    border-radius: 11px;
  }
  .aw-widget-zone.grid .aw-zone-empty {
    grid-column: 1 / -1;
  }
  /* Design §2.2 empty-custom-panel hint: dashed box, two mono lines, faint. */
  .aw-zone-empty.body {
    flex-direction: column;
    gap: 7px;
    text-transform: none;
    letter-spacing: 0.12em;
    color: var(--aw-text-faint);
    background: color-mix(in srgb, var(--aw-surface) 20%, transparent);
    border-color: color-mix(in srgb, var(--aw-border-2) 70%, transparent);
  }
  .aw-zone-empty.body b {
    color: color-mix(in srgb, var(--aw-text-muted) 90%, var(--aw-text));
    font: 800 10px/1 var(--aw-font-mono);
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .aw-zone-empty.body i {
    font: 600 10px/1.6 var(--aw-font-mono);
    font-style: normal;
    letter-spacing: 0.1em;
  }
  :global(.aw-root.aw-dragging-widget) .aw-widget-zone {
    outline: 1px dashed color-mix(in srgb, var(--aw-accent) 34%, transparent);
    outline-offset: 3px;
    border-radius: 10px;
  }
  /* Hovered drop zone gets a faint accent wash (design `hl` background tint on
     the drag-over zone) so the target strip reads at a glance. The insert line
     itself is drawn by the DragLayer (slice 4b: no slot box in the flow). */
  .aw-widget-zone.drop-target {
    background: color-mix(in srgb, var(--aw-accent) 7%, transparent);
  }
  /* An empty zone the drop would land in lights up (design `.wempty.ins`). */
  .aw-zone-empty.ins {
    background: color-mix(in srgb, var(--aw-accent) 16%, transparent);
    box-shadow: inset 0 0 0 2px var(--aw-accent);
  }
  :global(.aw-root.aw-dragging-widget) .aw-widget-zone.panel {
    outline-offset: -3px;
  }
  :global(.aw-root.aw-dragging-widget) .aw-widget-zone.grid {
    outline-offset: -3px;
  }
  /* Edit mode: the compact "+" at a zone's free end (width from
     WIDGET_ZONE_ADD_BUTTON_PX) and the "+ Widget" button of an empty zone. */
  .aw-zone-add {
    flex: none;
    align-self: center;
    height: 26px;
    padding: 0;
    border: 1px dashed color-mix(in srgb, var(--aw-accent) 70%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
    color: var(--aw-accent);
    cursor: pointer;
    font: 600 16px/1 var(--aw-font-ui);
  }
  .aw-zone-add:hover,
  .aw-zone-add:focus-visible {
    background: color-mix(in srgb, var(--aw-accent) 20%, transparent);
    outline: none;
  }
  .aw-widget-zone.grid .aw-zone-add {
    align-self: start;
  }
  /* While a drag / placement runs the "+" buttons keep their place (nothing
     shifts) but are invisible and inert — they are not drop targets. */
  .aw-zone-add.stepped-aside {
    visibility: hidden;
    pointer-events: none;
  }
  .aw-zone-add-empty.stepped-aside {
    pointer-events: none;
  }
  .aw-zone-add-empty {
    flex: none;
    cursor: pointer;
    border-color: color-mix(in srgb, var(--aw-accent) 55%, var(--aw-border-2));
    color: var(--aw-accent);
    font: 700 11px/1 var(--aw-font-ui);
    letter-spacing: 0.02em;
    padding: 0 12px;
    white-space: nowrap;
  }
  /* A tight bar collapses an empty zone's "+ Widget" to the compact "+". */
  .aw-zone-add-empty.compact {
    min-width: 0;
    height: 26px;
    padding: 0;
    font: 600 16px/1 var(--aw-font-ui);
  }
  .aw-widget-zone.panel .aw-zone-add-empty,
  .aw-widget-zone.grid .aw-zone-add-empty {
    white-space: normal;
  }
  .aw-zone-add-empty:hover,
  .aw-zone-add-empty:focus-visible {
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
    outline: none;
  }
  .aw-zone-add-empty.body b {
    color: var(--aw-accent);
    font: 700 13px/1 var(--aw-font-ui);
    letter-spacing: 0.02em;
    text-transform: none;
  }
  .aw-overflow-chip {
    height: 30px;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid var(--aw-border-3);
    border-radius: 8px;
    background: var(--aw-surface-2);
    color: var(--aw-text-2);
    cursor: pointer;
    font: 800 12px/1 var(--aw-font-mono);
  }
  .aw-overflow-scrim {
    position: fixed;
    inset: 0;
    z-index: 43;
    border: 0;
    background: transparent;
  }
  .aw-overflow-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 44;
    width: 270px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 22%, var(--aw-border));
    border-radius: 12px;
    background: color-mix(in srgb, var(--aw-accent) 4%, var(--aw-bg));
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  }
  .aw-widget-zone:not([data-zone='top.right']) .aw-overflow-menu {
    left: 0;
    right: auto;
  }
  .aw-overflow-menu h2 {
    margin: 0;
    color: var(--aw-text-faint);
    font: 800 9px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .aw-overflow-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 9px;
    border: 1px solid var(--aw-border);
    border-radius: 8px;
    background: var(--aw-surface);
  }
  .aw-overflow-row span {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--aw-danger);
  }
  .aw-overflow-row strong {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--aw-text-2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .aw-overflow-row i {
    flex: none;
    color: var(--aw-text-faint);
    font: 600 9px/1 var(--aw-font-mono);
    font-style: normal;
  }
  .aw-overflow-customize {
    height: 32px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 34%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 10%, var(--aw-bg-2));
    color: var(--aw-accent);
    cursor: pointer;
    font: 700 12px/1 var(--aw-font-ui);
  }
  .aw-overflow-customize:hover {
    border-color: var(--aw-accent);
  }
</style>
