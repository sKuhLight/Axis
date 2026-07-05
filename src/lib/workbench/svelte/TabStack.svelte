<script lang="ts">
  import PanelHost from './PanelHost.svelte';
  import { getWorkbenchContext } from './context';
  import type { DockRegionId, TabStackDockNode } from '../core';
  import { dockTargetLabel, panelDropCommand, pointerDistance, splitIntentFromRect, type PanelDropIntent, type WorkbenchRect } from './drag';

  let {
    stack,
    region
  }: {
    stack: TabStackDockNode;
    region: DockRegionId;
  } = $props();

  const { controller } = getWorkbenchContext();
  const layout = $derived($controller.activeLayout);
  const activePanelId = $derived(stack.panelIds.includes(stack.activePanelId) ? stack.activePanelId : stack.panelIds[0]);
  const activePanel = $derived(activePanelId ? layout?.panels[activePanelId] : undefined);

  function rectOf(el: Element): DOMRect {
    return el.getBoundingClientRect();
  }

  function plainRect(rect: DOMRect): WorkbenchRect {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function panelPreviewAt(x: number, y: number, draggedPanelId: string): { intent: PanelDropIntent; rect: WorkbenchRect; kind: 'region' | 'tab' | 'split' } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;

    const panelEl = el.closest<HTMLElement>('[data-panel]');
    if (panelEl && panelEl.dataset.panel && panelEl.dataset.panel !== draggedPanelId) {
      const regionEl = panelEl.closest<HTMLElement>('[data-region]');
      const panelRect = rectOf(panelEl);
      const split = splitIntentFromRect(
        { x, y },
        panelRect,
        panelEl.dataset.panel,
        regionEl?.dataset.region as DockRegionId | undefined
      );
      if (split) {
        const edge = split.axis === 'horizontal' ? panelRect.width * 0.34 : panelRect.height * 0.34;
        const rect =
          split.axis === 'horizontal'
            ? {
                left: split.position === 'before' ? panelRect.left : panelRect.right - edge,
                top: panelRect.top,
                width: edge,
                height: panelRect.height
              }
            : {
                left: panelRect.left,
                top: split.position === 'before' ? panelRect.top : panelRect.bottom - edge,
                width: panelRect.width,
                height: edge
              };
        return { intent: split, rect, kind: 'split' };
      }
    }

    const tabStack = el.closest<HTMLElement>('[data-tabstack]');
    if (tabStack?.dataset.tabstack) {
      return { intent: { kind: 'tab', tabStackId: tabStack.dataset.tabstack }, rect: plainRect(rectOf(tabStack)), kind: 'tab' };
    }

    const regionEl = el.closest<HTMLElement>('[data-region]');
    const region = regionEl?.dataset.region as DockRegionId | undefined;
    return region && regionEl ? { intent: { kind: 'region', region }, rect: plainRect(rectOf(regionEl)), kind: 'region' } : null;
  }

  function panelDropIntentAt(x: number, y: number, draggedPanelId: string): PanelDropIntent | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;

    const tabStack = el.closest<HTMLElement>('[data-tabstack]');
    const panelEl = el.closest<HTMLElement>('[data-panel]');
    if (panelEl && panelEl.dataset.panel && panelEl.dataset.panel !== draggedPanelId) {
      const regionEl = panelEl.closest<HTMLElement>('[data-region]');
      const split = splitIntentFromRect(
        { x, y },
        rectOf(panelEl),
        panelEl.dataset.panel,
        regionEl?.dataset.region as DockRegionId | undefined
      );
      if (split) return split;
    }

    if (tabStack?.dataset.tabstack) return { kind: 'tab', tabStackId: tabStack.dataset.tabstack };

    const regionEl = el.closest<HTMLElement>('[data-region]');
    const region = regionEl?.dataset.region as DockRegionId | undefined;
    return region ? { kind: 'region', region } : null;
  }

  function tabPointerDown(panelId: string, e: PointerEvent) {
    if (!$controller.editMode || e.button !== 0) return;
    const startedAt = { x: e.clientX, y: e.clientY };
    let dragging = false;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragging && pointerDistance(startedAt, pointer) < 5) return;
      dragging = true;
      moved = true;
      const intent = panelDropIntentAt(pointer.x, pointer.y, panelId);
      const preview = panelPreviewAt(pointer.x, pointer.y, panelId);
      controller.setDrag({
        kind: 'panel',
        panelId,
        startedAt,
        pointer,
        targetLabel: intent ? dockTargetLabel(intent) : undefined,
        previewRect: preview?.rect,
        previewKind: preview?.kind
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) {
        const intent = panelDropIntentAt(ev.clientX, ev.clientY, panelId);
        if (intent) controller.dispatch(panelDropCommand(panelId, intent));
        controller.setDrag(null);
      } else if (!moved) {
        controller.dispatch({ type: 'panel.activate', panelId });
      }
    };

    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
</script>

<section class="aw-tabstack" data-tabstack={stack.id} data-region={region}>
  <header class="aw-tabs">
    {#each stack.panelIds as panelId (panelId)}
      {@const panel = layout?.panels[panelId]}
      {#if panel}
        <button
          class="aw-tab"
          class:active={panelId === activePanelId}
          type="button"
          onpointerdown={(e) => tabPointerDown(panelId, e)}
          onclick={() => !$controller.editMode && controller.dispatch({ type: 'panel.activate', panelId })}
        >
          <span>{panel.title ?? panel.type}</span>
        </button>
      {/if}
    {/each}
  </header>

  <div class="aw-tabbody">
    {#if activePanel}
      <PanelHost panel={activePanel} />
    {/if}
  </div>
</section>

<style>
  .aw-tabstack {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--aw-bg-2);
  }
  .aw-tabs {
    height: 36px;
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 34px 4px 6px;
    background: color-mix(in srgb, var(--aw-bg-2) 92%, black);
    border-bottom: 1px solid color-mix(in srgb, var(--aw-border) 68%, transparent);
    overflow: hidden;
  }
  .aw-tab {
    min-width: 0;
    max-width: 180px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    border: 1px solid transparent;
    border-radius: 7px;
    padding: 0 10px;
    color: var(--aw-text-muted);
    background: transparent;
    cursor: pointer;
    font: 800 10.5px/1 var(--aw-font-ui);
  }
  .aw-tab span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-tab.active {
    color: var(--aw-text);
    background: var(--aw-surface);
    border-color: color-mix(in srgb, var(--aw-border-2) 72%, transparent);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) inset;
  }
  .aw-tabbody {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
