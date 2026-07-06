<script lang="ts">
  import PanelHost from './PanelHost.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { getWorkbenchContext } from './context';
  import type { DockRegionId, PanelInstance, TabStackDockNode } from '../core';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { createPanelTemplateFromPanel } from './library';
  import { PANEL_REGION_MOVE_OPTIONS } from './moveAlternatives';
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
  const single = $derived(stack.panelIds.length <= 1);

  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  let menuPanelId = $state<string | null>(null);
  const menuPanel = $derived(menuPanelId ? layout?.panels[menuPanelId] : undefined);

  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => {
    const panel = menuPanel;
    if (!panel) return [];
    return [
      {
        id: 'collapse',
        label: panel.collapsed ? 'Expand Panel' : 'Collapse Panel',
        disabled: panel.collapsible === false,
        run: () => controller.dispatch({ type: 'panel.collapse', panelId: panel.id, collapsed: !panel.collapsed })
      },
      ...PANEL_REGION_MOVE_OPTIONS.map((option, index): WorkbenchMenuItem => ({
        id: `move-${option.id}`,
        label: option.label,
        separatorBefore: index === 0,
        disabled: !$controller.editMode || panel.locked,
        run: () => controller.dispatch({ type: 'panel.move', panelId: panel.id, to: { kind: 'region', region: option.id } })
      })),
      {
        id: 'save',
        label: 'Save To Library',
        separatorBefore: true,
        disabled: !$controller.editMode || panel.locked,
        run: () => savePanelTemplate(panel)
      },
      {
        id: 'close',
        label: 'Close Panel',
        danger: true,
        separatorBefore: true,
        disabled: !$controller.editMode || panel.locked || panel.closable === false,
        run: () => controller.dispatch({ type: 'panel.close', panelId: panel.id })
      }
    ];
  });

  function savePanelTemplate(panel: PanelInstance) {
    const template = createPanelTemplateFromPanel($controller.document, panel.id);
    if (template) controller.dispatch({ type: 'library.panel.save', template });
  }

  function openHeaderMenu(panelId: string, event: MouseEvent) {
    event.preventDefault();
    menuPanelId = panelId;
    menuPosition = menuPositionFromPointer(event);
    menuOpen = true;
  }

  function openButtonMenu(panelId: string, event: MouseEvent) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menuPanelId = panelId;
    menuPosition = { x: rect.right - 8, y: rect.bottom + 6 };
    menuOpen = true;
  }

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
  <header class="aw-pane-head" class:single role="toolbar" tabindex="-1" oncontextmenu={(e) => activePanelId && openHeaderMenu(activePanelId, e)}>
    <span class="aw-pane-grip" aria-hidden="true">⠿</span>
    <div class="aw-pane-tabs">
      {#each stack.panelIds as panelId (panelId)}
        {@const panel = layout?.panels[panelId]}
        {#if panel}
          <button
            class="aw-pane-tab"
            class:active={panelId === activePanelId}
            type="button"
            onpointerdown={(e) => tabPointerDown(panelId, e)}
            onclick={() => !$controller.editMode && controller.dispatch({ type: 'panel.activate', panelId })}
          >
            <span>{panel.title ?? panel.type}</span>
          </button>
        {/if}
      {/each}
    </div>
    <span class="aw-pane-spacer"></span>
    {#if activePanel}
      <div class="aw-pane-actions">
        <button
          class="aw-pane-btn"
          type="button"
          title="Panel actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onclick={(e) => openButtonMenu(activePanel.id, e)}
        >⋯</button>
        {#if $controller.editMode && !activePanel.locked}
          <button
            class="aw-pane-btn"
            type="button"
            title="Save panel to library"
            onclick={() => savePanelTemplate(activePanel)}
          >▤</button>
        {/if}
        {#if activePanel.collapsible !== false}
          <button
            class="aw-pane-btn"
            type="button"
            title={activePanel.collapsed ? 'Expand panel' : 'Collapse panel'}
            onclick={() => controller.dispatch({ type: 'panel.collapse', panelId: activePanel.id, collapsed: !activePanel.collapsed })}
          >{activePanel.collapsed ? '+' : '−'}</button>
        {/if}
        {#if $controller.editMode && activePanel.closable !== false && !activePanel.locked}
          <button
            class="aw-pane-btn danger"
            type="button"
            title="Close panel"
            onclick={() => controller.dispatch({ type: 'panel.close', panelId: activePanel.id })}
          >×</button>
        {/if}
      </div>
    {/if}
  </header>

  <div class="aw-tabbody">
    {#if activePanel}
      <PanelHost panel={activePanel} />
    {/if}
  </div>
</section>

<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} label="Panel actions" onClose={() => (menuOpen = false)} />

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
    /* Design §2.2: panes are separated by an inset 1px white-alpha box-shadow, not borders. */
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  /* Design §2.2 pane header: grip → tab chips → spacer → mini action buttons,
     transparent background, drag-to-dock handle. */
  .aw-pane-head {
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 36px;
    padding: 7px 9px;
    background: transparent;
    cursor: grab;
  }
  .aw-pane-grip {
    flex: none;
    padding: 0 3px;
    color: #5a5a63;
    font: 700 11px/1 var(--aw-font-mono);
    cursor: grab;
  }
  .aw-pane-tabs {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
  }
  /* Single-panel stacks read as one floating pill label; multi-tab stacks are
     compact pill tabs (design §2.2). */
  .aw-pane-tab {
    min-width: 0;
    max-width: 180px;
    display: inline-flex;
    align-items: center;
    border: 0;
    border-radius: 7px;
    padding: 5px 10px;
    color: #9a9aa3;
    background: transparent;
    cursor: pointer;
    font: 700 10px/1 var(--aw-font-ui);
  }
  .aw-pane-tab span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-pane-tab.active {
    color: #8fe3ea;
    background: #1c2b2c;
  }
  /* A lone panel label still reads as a pill so the head has a clear anchor. */
  .aw-pane-head.single .aw-pane-tab {
    color: var(--aw-text-2);
    background: color-mix(in srgb, var(--aw-surface) 80%, transparent);
  }
  .aw-pane-spacer {
    flex: 1;
    min-width: 8px;
  }
  .aw-pane-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .aw-pane-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #9a9aa3;
    cursor: pointer;
    font-size: 12px;
  }
  .aw-pane-btn:hover {
    color: var(--aw-text);
    background: color-mix(in srgb, var(--aw-surface) 70%, transparent);
  }
  .aw-pane-btn.danger:hover {
    color: var(--aw-danger);
  }
  .aw-tabbody {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
