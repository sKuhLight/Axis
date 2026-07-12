<script lang="ts">
  import PanelHost from './PanelHost.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { getWorkbenchContext } from './context';
  import { onDestroy } from 'svelte';
  import {
    WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION,
    WORKBENCH_PARAMETER_SOURCE_MIME,
    type DockRegionId,
    type PanelInstance,
    type TabStackDockNode
  } from '../core';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { createPanelTemplateFromPanel } from './library';
  import { PANEL_REGION_MOVE_OPTIONS } from './moveAlternatives';
  import { dockTargetLabel, panelDropCommand, pointerDistance, splitIntentFromRect, widgetDropIndex, type PanelDropIntent, type WorkbenchRect } from './drag';
  import { enqueueToast } from './toasts';

  let {
    stack,
    region
  }: {
    stack: TabStackDockNode;
    region: DockRegionId;
  } = $props();

  const { controller, registry } = getWorkbenchContext();
  const layout = $derived($controller.activeLayout);
  const activePanelId = $derived(stack.panelIds.includes(stack.activePanelId) ? stack.activePanelId : stack.panelIds[0]);
  const activePanel = $derived(activePanelId ? layout?.panels[activePanelId] : undefined);
  const single = $derived(stack.panelIds.length <= 1);

  let headEl = $state<HTMLElement | null>(null);
  // A parameter control dragged over this stack's tab bar (HTML5 drag): dropping
  // it makes a NEW "Controls" tab here (T21 directive #2).
  let paramTabHover = $state(false);

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
    if (!template) return;
    controller.dispatch({ type: 'library.panel.save', template });
    // Generic (app-agnostic) confirmation: the panel title is generic document
    // data, so this message carries no Axis-specific vocabulary.
    const title = panel.title ?? panel.type;
    enqueueToast({ text: `Saved "${title}" to library` });
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

  // Insertion index for a tab drop (T21 directive #2: "insert a new tab at that
  // spot"): hit-test the pointer's x against the rendered tab pills' midpoints.
  // Dropping past the last pill (e.g. anywhere in the panel body) appends.
  function tabInsertIndexAt(x: number, tabStackEl: HTMLElement): number {
    const tabRects = Array.from(tabStackEl.querySelectorAll<HTMLElement>('.aw-pane-tab')).map((el) => plainRect(rectOf(el)));
    return widgetDropIndex({ x, y: 0 }, tabRects, 'horizontal');
  }

  // The tab bar (header) rect — the drop-highlight surface for a tab drop, so a
  // panel dropped onto a stack's tabs lights the BAR (not the whole body).
  function tabBarRect(tabStackEl: HTMLElement): WorkbenchRect {
    const head = tabStackEl.querySelector<HTMLElement>('.aw-pane-head');
    return plainRect(rectOf(head ?? tabStackEl));
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
      return {
        intent: { kind: 'tab', tabStackId: tabStack.dataset.tabstack, index: tabInsertIndexAt(x, tabStack) },
        rect: tabBarRect(tabStack),
        kind: 'tab'
      };
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

    if (tabStack?.dataset.tabstack) return { kind: 'tab', tabStackId: tabStack.dataset.tabstack, index: tabInsertIndexAt(x, tabStack) };

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

  // ── Spring-loaded tabs (T21 directive #3) ───────────────────────────────
  // Hovering an EXISTING (inactive) tab during ANY drag activates it after a
  // short dwell, so the user can continue the drag into the freshly-revealed
  // panel content and drop there. One shared timer drives both the pointer-based
  // controller drags (panel/widget/list — via the reactive $controller.drag
  // pointer) and the HTML5 parameter-source drag (via the header dragover).
  const SPRING_DWELL_MS = 500;
  let springPanelId: string | null = null;
  let springTimer: ReturnType<typeof setTimeout> | null = null;

  function armSpring(panelId: string): void {
    // Never spring the already-active tab, and keep an in-flight dwell alive when
    // the pointer merely jitters over the SAME tab (don't reset it every move).
    if (panelId === activePanelId) { cancelSpring(); return; }
    if (springPanelId === panelId && springTimer != null) return;
    cancelSpring();
    springPanelId = panelId;
    springTimer = setTimeout(() => {
      springTimer = null;
      if (springPanelId) controller.dispatch({ type: 'panel.activate', panelId: springPanelId });
    }, SPRING_DWELL_MS);
  }

  function cancelSpring(): void {
    if (springTimer != null) clearTimeout(springTimer);
    springTimer = null;
    springPanelId = null;
  }

  onDestroy(cancelSpring);

  // Which tab pill sits under an x coordinate (spring target).
  function tabAtPointerX(x: number): string | null {
    if (!headEl) return null;
    for (const button of Array.from(headEl.querySelectorAll<HTMLElement>('[data-panel-tab]'))) {
      const r = button.getBoundingClientRect();
      if (x >= r.left && x <= r.right) return button.dataset.panelTab ?? null;
    }
    return null;
  }

  // Pointer-drag spring: while a controller drag is active with a live pointer,
  // dwell-activate whichever inactive tab of this stack the pointer rests on.
  $effect(() => {
    const drag = $controller.drag;
    const pointer = drag?.pointer;
    if (!drag || single || !pointer || !headEl) { cancelSpring(); return; }
    const hr = headEl.getBoundingClientRect();
    const overHead = pointer.x >= hr.left && pointer.x <= hr.right && pointer.y >= hr.top && pointer.y <= hr.bottom;
    if (!overHead) { cancelSpring(); return; }
    const panelId = tabAtPointerX(pointer.x);
    if (panelId) armSpring(panelId);
    else cancelSpring();
  });

  // ── Parameter-source drops on the tab bar (T21 directive #2) ─────────────
  function hasParameterSource(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(WORKBENCH_PARAMETER_SOURCE_MIME);
  }

  function onHeaderParameterDragOver(event: DragEvent) {
    if (!hasParameterSource(event) || !registry.hasAction(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION)) return;
    // Claim it so the workspace edge-drop (which would spawn a panel in a region)
    // doesn't also fire — a tab-bar drop means "new Controls tab HERE".
    event.preventDefault();
    event.stopPropagation();
    paramTabHover = true;
    // Spring the hovered tab too, so dropping into a revealed panel's BODY still
    // collects into that panel (the header handles the tab-bar case).
    const springTarget = tabAtPointerX(event.clientX);
    if (springTarget) armSpring(springTarget);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onHeaderParameterDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    paramTabHover = false;
    cancelSpring();
  }

  async function onHeaderParameterDrop(event: DragEvent) {
    if (!hasParameterSource(event) || !registry.hasAction(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION)) return;
    const source = event.dataTransfer?.getData(WORKBENCH_PARAMETER_SOURCE_MIME);
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    paramTabHover = false;
    cancelSpring();
    const args: Record<string, string | number> = { source, region, tabStackId: stack.id };
    if (headEl) args.index = tabInsertIndexAt(event.clientX, headEl);
    await registry.runActionResult(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION, {
      controller,
      source: 'host',
      args
    });
  }
</script>

<section class="aw-tabstack" data-tabstack={stack.id} data-region={region}>
  <header
    class="aw-pane-head"
    class:single
    class:param-tab-hover={paramTabHover}
    role="toolbar"
    tabindex="-1"
    bind:this={headEl}
    oncontextmenu={(e) => activePanelId && openHeaderMenu(activePanelId, e)}
    ondragover={onHeaderParameterDragOver}
    ondragleave={onHeaderParameterDragLeave}
    ondrop={onHeaderParameterDrop}
  >
    <span class="aw-pane-grip" aria-hidden="true">⠿</span>
    <div class="aw-pane-tabs">
      {#each stack.panelIds as panelId (panelId)}
        {@const panel = layout?.panels[panelId]}
        {#if panel}
          <button
            class="aw-pane-tab"
            class:active={panelId === activePanelId}
            type="button"
            data-panel-tab={panelId}
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
  /* T21 directive #2: a parameter control dragged over the tab bar highlights
     the whole bar as an accepting "new Controls tab" drop target. */
  .aw-pane-head.param-tab-hover {
    background: color-mix(in srgb, var(--aw-accent) 16%, transparent);
    box-shadow: inset 0 -2px 0 0 var(--aw-accent);
    border-radius: 8px;
  }
  .aw-pane-grip {
    flex: none;
    padding: 0 3px;
    color: var(--aw-text-faint);
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
    color: var(--aw-text-muted);
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
    color: color-mix(in srgb, var(--aw-accent) 68%, white);
    background: color-mix(in srgb, var(--aw-accent) 15%, var(--aw-surface));
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
    color: var(--aw-text-muted);
    cursor: pointer;
    font-size: 12px;
  }
  .aw-pane-btn:hover {
    color: var(--aw-text);
    background: color-mix(in srgb, var(--aw-surface) 70%, transparent);
  }
  /* T18: keyboard focus ring for the pane header (tab pills + mini actions).
     focus-visible only, accent token — no always-on outline for pointer use. */
  .aw-pane-tab:focus-visible,
  .aw-pane-btn:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: -1px;
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
