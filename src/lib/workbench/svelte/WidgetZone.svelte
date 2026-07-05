<script lang="ts">
  import WidgetHost from './WidgetHost.svelte';
  import WidgetGroupHost from './WidgetGroupHost.svelte';
  import { getWorkbenchContext } from './context';
  import { selectVisibleWidgetsByZone } from '../core';
  import { onMount } from 'svelte';
  import { pickWidgetSize } from './sizing';
  import { labelFromWorkbenchType } from './library';

  type WidgetUnit = { groupId?: string; widgetIds: string[] };

  let {
    zone,
    floating = false,
    variant = 'bar',
    emptyLabel
  }: {
    zone: string;
    floating?: boolean;
    variant?: 'bar' | 'panel';
    emptyLabel?: string;
  } = $props();

  const { controller } = getWorkbenchContext();
  let zoneEl = $state<HTMLElement | null>(null);
  let zoneWidth = $state(0);
  let overflowOpen = $state(false);
  const widgets = $derived(selectVisibleWidgetsByZone($controller.document, zone));
  const units = $derived.by(() => {
    const out: WidgetUnit[] = [];
    const seenGroups = new Set<string>();
    for (const widget of widgets) {
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
  });
  const visible = $derived(units.length > 0 || $controller.editMode);
  const vertical = $derived(zone === 'rail');
  const overflowEnabled = $derived(
    variant === 'bar' &&
      !floating &&
      !vertical &&
      !$controller.editMode &&
      (zone.startsWith('top.') || zone === 'bottom' || zone === 'gridbar')
  );
  const overflowKeys = $derived.by(() => {
    if (!overflowEnabled || units.length < 3 || zoneWidth < 150) return new Set<string>();
    const minUnitWidth = zone === 'top.right' ? 46 : 58;
    const slots = Math.max(1, Math.floor((zoneWidth - 48) / (minUnitWidth + 6)));
    const overflowCount = Math.max(0, units.length - slots);
    if (!overflowCount) return new Set<string>();
    return new Set(
      [...units]
        .sort((a, b) => unitPriority(a) - unitPriority(b) || units.indexOf(b) - units.indexOf(a))
        .slice(0, overflowCount)
        .map(unitKey)
    );
  });
  const renderedUnits = $derived(units.filter((unit) => !overflowKeys.has(unitKey(unit))));
  const overflowUnits = $derived(units.filter((unit) => overflowKeys.has(unitKey(unit))));
  const itemWidth = $derived(
    vertical ? 52 : Math.max(44, (zoneWidth - Math.max(0, renderedUnits.length - 1) * 6) / Math.max(1, renderedUnits.length))
  );

  function unitKey(unit: WidgetUnit): string {
    return unit.groupId ?? unit.widgetIds[0] ?? 'unit';
  }

  function unitPriority(unit: WidgetUnit): number {
    const layout = $controller.activeLayout;
    const widgets = unit.widgetIds.map((id) => layout?.widgets[id]).filter(Boolean);
    if (widgets.some((widget) => widget?.locked)) return 100;
    const priorities = widgets
      .map((widget) => widget?.state?.overflowPriority ?? widget?.state?.priority)
      .filter((priority): priority is number => typeof priority === 'number');
    return priorities.length ? Math.max(...priorities) : 30;
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

  onMount(() => {
    if (!zoneEl) return;
    const measure = () => {
      if (zoneEl) zoneWidth = zoneEl.clientWidth;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(zoneEl);
    return () => ro.disconnect();
  });
</script>

{#if visible}
  <section
    class="aw-widget-zone"
    class:floating
    class:panel={variant === 'panel'}
    class:overflow-open={overflowOpen}
    bind:this={zoneEl}
    data-zone={zone}
  >
    {#each renderedUnits as unit (unit.groupId ?? unit.widgetIds[0])}
      {#if unit.groupId}
        <WidgetGroupHost groupId={unit.groupId} />
      {:else}
        {@const widget = $controller.activeLayout?.widgets[unit.widgetIds[0]]}
        {#if widget}
          <WidgetHost {widget} forcedSize={pickWidgetSize(itemWidth, widget.size)} />
        {/if}
      {/if}
    {/each}
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
    {#if !units.length && $controller.editMode}
      <span class="aw-zone-empty">{emptyLabel ?? zone}</span>
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
  }
  .aw-widget-zone.overflow-open {
    overflow: visible;
    z-index: 42;
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
  .aw-widget-zone.panel .aw-zone-empty {
    width: 100%;
    min-height: 116px;
    height: auto;
    border-radius: 11px;
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
    border: 1px solid #1a3a3c;
    border-radius: 12px;
    background: #0c1213;
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
    border: 1px solid #234d4f;
    border-radius: 8px;
    background: #101d1e;
    color: #4fd1dc;
    cursor: pointer;
    font: 700 12px/1 var(--aw-font-ui);
  }
  .aw-overflow-customize:hover {
    border-color: var(--aw-accent);
  }
</style>
