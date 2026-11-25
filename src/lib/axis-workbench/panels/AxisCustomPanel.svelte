<script lang="ts">
  // A custom panel body: the Quick Controls board. Widgets sit on a Block-Editor raster (2×2-cell controls),
  // block grouping draws a labelled divider above each block's controls, and the panel collects every control
  // dropped on it instead of spawning a panel per knob. The layout is pure (`workbench/core/customPanelBoard`).
  import WidgetHost from '../../workbench/svelte/WidgetHost.svelte';
  import { beginWidgetDrag } from '../../workbench/svelte/widgetDragSession';
  import { getWorkbenchContext } from '../../workbench/svelte/context';
  import {
    WORKBENCH_PARAMETER_SOURCE_MIME,
    controlAtCell,
    createParameterWidgetCommand,
    customPanelGridSettings,
    layoutPanelBoard,
    panelWidgetZoneId,
    parseWorkbenchParameterSource,
    selectVisibleWidgetsByZone,
    sortPanelWidgets,
    type PanelInstance,
    type PanelWidgetRef
  } from '../../workbench';
  import { customPanelAutoSort, customPanelGrouping, customPanelTiles } from '../customPanelTiles';
  import AxisQuickControlTile from './AxisQuickControlTile.svelte';

  let { panel, editMode = false }: { panel: PanelInstance; editMode?: boolean } = $props();
  const { controller, registry } = getWorkbenchContext();
  const zone = $derived(panelWidgetZoneId(panel.id));
  const settings = $derived(customPanelGridSettings(panel.state));
  /** Cell pitch of the block editor's medium density; the panel's own row-height setting still wins. */
  const cell = $derived(settings.rowHeight);
  const gap = $derived(Math.max(14, settings.gap));
  const step = $derived(cell + gap);
  const band = $derived(Math.max(10, gap));
  const grouping = $derived(customPanelGrouping(panel.state));
  const widgets = $derived(selectVisibleWidgetsByZone($controller.document, zone));
  const tiles = $derived(customPanelTiles(widgets));
  const refs: PanelWidgetRef[] = $derived(tiles.map((info, index) => ({
    id: info.widgetId,
    blockKey: info.blockKey,
    blockLabel: info.blockLabel,
    order: index
  })));
  const board = $derived(layoutPanelBoard({ widgets: refs, groupByBlock: grouping }));
  const controls = $derived(board.items.filter((item) => item.kind === 'control'));
  const dividers = $derived(board.items.filter((item) => item.kind === 'divider'));
  const tileById = $derived(new Map(tiles.map((info) => [info.widgetId, info])));
  const widgetById = $derived(new Map(widgets.map((widget) => [widget.id, widget])));
  const canvasWidth = $derived(board.cols * step - gap);
  const drag = $derived($controller.drag);
  const dropTarget = $derived(drag?.kind === 'widget' && !drag.groupInsert && drag.zoneInsert?.zone === zone);

  let gridEl = $state<HTMLElement | null>(null);
  let parameterDragHover = $state(false);
  let selectedId = $state<string | null>(null);
  let menuOpen = $state(false);
  let moveDrag: { widgetId: string; pointerId: number } | null = null;

  // Clear the drag-hover wash whenever any drag ends (drop anywhere, Escape-cancel, or release off-target).
  $effect(() => {
    if (typeof window === 'undefined') return;
    const clear = () => (parameterDragHover = false);
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

  /** The widget index a point over the grid inserts at (before or after the control under it). */
  function indexAtPoint(clientX: number, clientY: number): number {
    const order = controls.map((item) => item.widgetId!);
    if (!gridEl) return order.length;
    const rect = gridEl.getBoundingClientRect();
    const cx = Math.floor((clientX - rect.left) / step);
    const cy = Math.floor((clientY - rect.top) / step);
    const hit = controlAtCell(board, cx, cy);
    if (!hit) return order.length;
    const index = order.indexOf(hit.widgetId!);
    if (index < 0) return order.length;
    const leading = clientX - rect.left < hit.x * step + (hit.w * step - gap) / 2;
    return Math.max(0, Math.min(order.length, index + (leading ? 0 : 1)));
  }

  function onParameterDragOver(event: DragEvent) {
    if (!hasParameterSource(event)) return;
    // Claim the drop here so the workspace edge-drop (which would spawn a NEW panel per parameter) never fires.
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
    const command = createParameterWidgetCommand($controller.document, source, { zone, index: indexAtPoint(event.clientX, event.clientY) });
    if (command) controller.dispatch(command);
  }

  // ── moving, selecting, removing ─────────────────────────────────────────────────────────────────
  /** Edit mode: a plain drag hands the tile to the workbench's widget drag (out of the panel, into any
   *  zone, or onto another unit to group). The board keeps its own reorder on Ctrl/⌘-drag. */
  function startDragOut(widgetId: string, event: PointerEvent) {
    if (!editMode) return;
    const widget = widgetById.get(widgetId);
    if (!widget) return;
    const host = event.currentTarget as HTMLElement | null;
    const rect = host?.getBoundingClientRect();
    selectedId = widgetId;
    beginWidgetDrag({
      controller,
      event,
      widgetIds: [widget.id],
      ownUnitKey: widget.groupId ?? widget.id,
      reorderGroupId: widget.groupId ?? null,
      size: { width: host?.offsetWidth || 120, height: host?.offsetHeight || 120 },
      grabOffset: rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 60, y: 60 },
      onTap: () => (selectedId = widgetId),
      typeLabel: (type) => registry.canonicalWidgets().find((spec) => spec.type === type)?.label
    });
  }

  function startMove(widgetId: string, event: PointerEvent) {
    if (!editMode) return;
    moveDrag = { widgetId, pointerId: event.pointerId };
    const up = (e: PointerEvent): void => {
      if (moveDrag?.pointerId !== e.pointerId) return;
      const id = moveDrag.widgetId;
      moveDrag = null;
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const index = indexAtPoint(e.clientX, e.clientY);
      const current = controls.findIndex((item) => item.widgetId === id);
      if (current < 0 || index === current || index === current + 1) return;
      controller.dispatch({ type: 'widget.move', widgetIds: [id], zone, index });
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function remove(widgetId: string) {
    selectedId = null;
    controller.dispatch({ type: 'widget.hide', widgetIds: [widgetId] });
  }

  function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function onKeydown(event: KeyboardEvent) {
    if (!selectedId || isTyping(event.target)) return;
    if (event.key === 'Escape') {
      selectedId = null;
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(selectedId);
    }
  }

  // ── the panel's own options ─────────────────────────────────────────────────────────────────────
  function setGrouping(next: boolean) {
    controller.dispatch({ type: 'panel.state', panelId: panel.id, state: { groupByBlock: next, autoSort: customPanelAutoSort(panel.state) } });
    if (!next) return;
    // Switching grouping back on re-sorts the controls by block (and rewrites their order, so turning it off
    // keeps the sorted order as the plain one).
    const sorted = sortPanelWidgets(refs, true);
    controller.dispatchMany(
      sorted.map((ref, index) => ({ type: 'widget.move' as const, widgetIds: [ref.id], zone, index }))
    );
  }

  function openAdd() {
    if (!registry.addPalette) return;
    controller.openAddPalette({
      filter: 'widgets',
      target: { kind: 'widget', zone, label: widgets.length ? `End of ${panel.title ?? 'Quick Controls'}` : `Into ${panel.title ?? 'Quick Controls'}` }
    });
  }

  function closeMenuOnPointer(event: PointerEvent) {
    if (!menuOpen) return;
    const el = event.target as HTMLElement | null;
    if (!el?.closest('.qc-menu') && !el?.closest('[data-quick-controls-menu]')) menuOpen = false;
  }

  function closeMenuOnKey(event: KeyboardEvent) {
    if (menuOpen && event.key === 'Escape') menuOpen = false;
  }
</script>

<svelte:window onpointerdown={closeMenuOnPointer} onkeydown={(e) => { closeMenuOnKey(e); onKeydown(e); }} />

<section
  class="custom-panel"
  class:parameter-drag-hover={parameterDragHover}
  class:drop-target={dropTarget}
  class:editing={editMode}
  data-zone={zone}
  data-quick-controls={panel.id}
  role="group"
  aria-label={panel.title ?? 'Custom panel'}
  ondragover={onParameterDragOver}
  ondragleave={onParameterDragLeave}
  ondrop={onParameterDrop}
>
  <div class="qc-toolbar">
    <span class="qc-label mono">{board.cols} × {board.rows}</span>
    <button
      class="qc-menu-btn"
      type="button"
      data-quick-controls-menu
      title="Quick Controls options"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = !menuOpen)}
    >⋯</button>
  </div>

  {#if menuOpen}
    <div class="qc-menu" role="menu">
      <label class="qc-check">
        <input
          type="checkbox"
          checked={grouping}
          data-quick-controls-group
          onchange={(event) => setGrouping(event.currentTarget.checked)}
        />
        <span>Group by block</span>
      </label>
      <p>One labelled divider per block. Switching it back on sorts the controls by block.</p>
    </div>
  {/if}

  {#if widgets.length}
    <div
      class="qc-canvas"
      bind:this={gridEl}
      style:padding-top="{band}px"
    >
      <div
        class="qc-grid"
        data-quick-controls-grid
        data-cols={board.cols}
        data-rows={board.rows}
        style:grid-template-columns="repeat({board.cols}, {cell}px)"
        style:grid-auto-rows="{cell}px"
        style:gap="{gap}px"
        style:width="{canvasWidth}px"
        style:min-width="{canvasWidth}px"
      >
        {#each dividers as divider (divider.id)}
          <div
            class="qc-divider"
            role="separator"
            aria-label={divider.label}
            data-quick-controls-divider={divider.label}
            style:left="{divider.x * step}px"
            style:top="{divider.y * step - band}px"
            style:width="{divider.w * step - gap}px"
            style:height="{band}px"
          >
            {#if divider.label}<span class="qc-divider-label">{divider.label}</span>{/if}
            <span class="qc-divider-line"></span>
          </div>
        {/each}
        {#each controls as item (item.id)}
          {@const info = tileById.get(item.widgetId!)}
          {#if info}
            {@const widget = widgetById.get(info.widgetId)}
            {#if info.foreign}
              {#if widget}
                <div
                  class="qc-host"
                  data-widget={widget.type}
                  role="group"
                  aria-label={info.label}
                  style:grid-column="{item.x + 1} / span {item.w}"
                  style:grid-row="{item.y + 1} / span {item.h}"
                  oncontextmenu={(event) => {
                    event.preventDefault();
                    selectedId = info.widgetId;
                  }}
                  onpointerdown={(event) => {
                    if (editMode && (event.ctrlKey || event.metaKey)) startMove(info.widgetId, event);
                  }}
                >
                  <WidgetHost {widget} />
                  {#if selectedId === info.widgetId}
                    <button class="qc-remove" type="button" data-quick-control-remove title="Remove" aria-label="Remove {info.label}" onclick={() => remove(info.widgetId)}>×</button>
                  {/if}
                </div>
              {/if}
            {:else}
              <AxisQuickControlTile
                {info}
                x={item.x}
                y={item.y}
                c={cell}
                g={gap}
                page={zone}
                {editMode}
                selected={selectedId === info.widgetId}
                lifted={drag?.kind === 'widget' && drag.widgetIds.includes(info.widgetId)}
                onselect={() => (selectedId = info.widgetId)}
                onmove={(event) => startMove(info.widgetId, event)}
                ondragout={(event) => startDragOut(info.widgetId, event)}
                onremove={() => remove(info.widgetId)}
              />
            {/if}
          {/if}
        {/each}
      </div>
    </div>
  {:else if registry.addPalette}
    <button
      class="aw-widget-zone aw-zone-empty aw-zone-add-empty body"
      class:ins={dropTarget || parameterDragHover}
      type="button"
      data-zone-add={zone}
      title="Add a control to {panel.title ?? 'Quick Controls'}"
      aria-label="Add a control to {panel.title ?? 'Quick Controls'}"
      onclick={openAdd}
    >
      <b>+ Widget</b>
      <i>or drop widgets or parameters here</i>
    </button>
  {:else}
    <span class="aw-zone-empty body">
      <b>Empty Panel</b>
      <i>drag widgets or parameters here</i>
    </span>
  {/if}
</section>

<style>
  .custom-panel {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    padding: 10px 12px 14px;
    /* room above the first row for the first block's divider band */
    padding-top: 26px;
    overflow: auto;
    background:
      linear-gradient(rgba(255, 255, 255, 0.018), transparent 110px),
      var(--bg);
  }
  .custom-panel.parameter-drag-hover {
    outline: 1px solid color-mix(in srgb, var(--accent) 58%, transparent);
    outline-offset: -8px;
  }
  .custom-panel.drop-target {
    background: color-mix(in srgb, var(--accent) 7%, var(--bg));
  }
  .qc-toolbar {
    position: absolute;
    top: 3px;
    right: 6px;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .qc-label {
    color: var(--textfaint, var(--aw-text-faint, var(--textdim)));
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.08em;
  }
  .qc-menu-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border2);
    border-radius: 6px;
    background: var(--surface);
    color: var(--textdim);
    cursor: pointer;
    font: 700 13px/1 var(--font-ui);
  }
  .qc-menu-btn:hover {
    color: var(--text);
    border-color: var(--border3);
  }
  .qc-menu {
    position: absolute;
    top: 26px;
    right: 8px;
    z-index: 20;
    width: 230px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 4%, var(--bg));
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  }
  .qc-check {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text);
    font: 600 12px/1 var(--font-ui);
    cursor: pointer;
  }
  .qc-menu p {
    margin: 0;
    color: var(--textfaint, var(--textdim));
    font: 500 10px/1.45 var(--font-ui);
  }
  .qc-canvas {
    position: relative;
    min-width: 0;
  }
  .qc-grid {
    position: relative;
    display: grid;
    flex: none;
  }
  .qc-divider {
    position: absolute;
    z-index: 4;
    display: flex;
    align-items: flex-end;
    gap: 7px;
    pointer-events: none;
  }
  .qc-divider-label {
    flex: none;
    font: 700 9.5px/1 var(--font-mono);
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--textfaint, var(--textdim));
    white-space: nowrap;
  }
  .qc-divider-line {
    flex: 1;
    height: 1px;
    background: var(--border2);
  }
  .qc-host {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
  }
  .qc-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 9;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--danger-border, var(--border2));
    background: var(--danger-tint, var(--surface));
    color: var(--danger);
    font: 700 12px/1 var(--font-ui);
    cursor: pointer;
  }
  .aw-zone-empty {
    width: 100%;
    min-height: 116px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px dashed var(--border2);
    border-radius: 11px;
    color: var(--textfaint, var(--textdim));
    background: color-mix(in srgb, var(--surface) 20%, transparent);
    font-family: var(--font-ui);
    cursor: pointer;
  }
  .aw-zone-empty b {
    color: var(--accent);
    font: 700 13px/1 var(--font-ui);
  }
  .aw-zone-empty i {
    font: 600 10px/1.6 var(--font-mono);
    font-style: normal;
    letter-spacing: 0.1em;
  }
  .aw-zone-empty.ins {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }
</style>
