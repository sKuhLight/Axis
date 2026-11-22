<script lang="ts">
  import PanelHost from './PanelHost.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { getWorkbenchContext } from './context';
  import { onDestroy, tick } from 'svelte';
  import {
    WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION,
    WORKBENCH_PARAMETER_SOURCE_MIME,
    type DockRegionId,
    type PanelInstance,
    type TabStackDockNode
  } from '../core';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { createPanelTemplateFromPanel } from './library';
  import { widgetDropIndex, type WorkbenchRect } from './drag';
  import { startPanelTabDrag } from './panelDrag';
  import {
    MAXIMIZE_ESCAPE_OVERLAYS,
    buildPanelMenuItems,
    collapsedStripLabel,
    shouldReleaseMaximize,
    shouldRestoreMaximizedOnEscape
  } from './panelChrome';
  import { enqueueToast } from './toasts';

  let {
    stack,
    region,
    stripVertical = false,
    overlay = false
  }: {
    stack: TabStackDockNode;
    region: DockRegionId;
    /** When collapsed, this stack is a vertical strip (rotated label) — it sits in a horizontal split / side region. */
    stripVertical?: boolean;
    /** Rendered inside a mobile dock drawer (never maximized from there). */
    overlay?: boolean;
  } = $props();

  const { controller, registry } = getWorkbenchContext();
  const layout = $derived($controller.activeLayout);
  // Held: a drag lifted this stack's ACTIVE tab (the lifted dock keeps the stale
  // activePanelId). The remaining tabs stay in the header, but none is mounted
  // for the duration of the drag — no neighbour panel spins up (device reads).
  const held = $derived(!!$controller.liftedPanelId && stack.activePanelId === $controller.liftedPanelId);
  const activePanelId = $derived(
    held ? undefined : stack.panelIds.includes(stack.activePanelId) ? stack.activePanelId : stack.panelIds[0]
  );
  const activePanel = $derived(activePanelId ? layout?.panels[activePanelId] : undefined);
  const single = $derived(stack.panelIds.length <= 1);
  const titleOf = (panel: PanelInstance | undefined, fallback: string) => panel?.title ?? panel?.type ?? fallback;
  const activeTitle = $derived(titleOf(activePanel, activePanelId ?? ''));

  let sectionEl = $state<HTMLElement | null>(null);

  // ── Maximize (transient controller state) ────────────────────────────────
  // The maximized stack is NOT re-parented (its panel components keep their DOM
  // and state): it is lifted visually — `position: fixed` over the measured
  // workspace rect, above the regions, below menus / drawers / the drag layer.
  // Only the INLINE instance owns it; when that owner goes away (unmounted, or
  // not laid out — a phone-hidden region) the maximize is released, so it can
  // never linger invisibly.
  const maximized = $derived(!overlay && !!$controller.maximizedPanelId && stack.panelIds.includes($controller.maximizedPanelId));
  let maxRect = $state<WorkbenchRect | null>(null);
  $effect(() => {
    if (!maximized || typeof document === 'undefined') {
      maxRect = null;
      return;
    }
    const workspace = document.querySelector<HTMLElement>('.aw-workspace');
    if (!workspace) return;
    // Fixed px inside an ancestor CSS zoom are LAYOUT px; gBCR is visual.
    const measure = () => {
      const rendered = !!sectionEl && sectionEl.getClientRects().length > 0;
      if (shouldReleaseMaximize({ maximizedPanelId: controller.maximizedPanelId, stackPanelIds: ownedPanelIds, overlay, rendered })) {
        controller.setMaximizedPanel(null);
        return;
      }
      const r = workspace.getBoundingClientRect();
      const zoom = workspace.offsetWidth > 0 && r.width > 0 ? r.width / workspace.offsetWidth : 1;
      maxRect = { left: r.left / zoom, top: r.top / zoom, width: r.width / zoom, height: r.height / zoom };
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(workspace);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  });
  const maxStyle = $derived(
    maximized && maxRect ? `left:${maxRect.left}px; top:${maxRect.top}px; width:${maxRect.width}px; height:${maxRect.height}px;` : ''
  );
  // The panels this instance last showed: during teardown the `stack` prop may
  // already read null (its region emptied), so remember them while mounted.
  let ownedPanelIds: string[] = [];
  $effect.pre(() => {
    if (stack) ownedPanelIds = stack.panelIds;
  });
  onDestroy(() => {
    if (shouldReleaseMaximize({ maximizedPanelId: controller.maximizedPanelId, stackPanelIds: ownedPanelIds, overlay, rendered: false })) {
      controller.setMaximizedPanel(null);
    }
  });

  // Escape restores — but only an Escape nothing else consumed. A window
  // CAPTURE listener (no stopPropagation — it only records) snapshots, before
  // any element handler runs, whether a menu / drawer / dialog was open and
  // whether a text field had focus: a dialog that closes itself on Escape
  // without preventDefault is gone by the time a later check could see it. The
  // decision is deferred to a macrotask, after the whole dispatch, so the app's
  // Escape chain and element handlers can mark the key with preventDefault (a
  // microtask would run right after this listener, before the others).
  $effect(() => {
    if (!maximized) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      const editableTarget = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const overlayOpenAtCapture = !!document.querySelector(MAXIMIZE_ESCAPE_OVERLAYS);
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        const restore = shouldRestoreMaximizedOnEscape({
          key: event.key,
          maximized: controller.maximizedPanelId != null && ownedPanelIds.includes(controller.maximizedPanelId),
          defaultPrevented: event.defaultPrevented,
          dragging: !!controller.drag,
          overlayOpenAtCapture,
          editableTarget
        });
        if (restore) controller.setMaximizedPanel(null);
      }, 0);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (pending) clearTimeout(pending);
    };
  });

  // ── Collapse ─────────────────────────────────────────────────────────────
  // A stack whose active panel is collapsed renders as a slim labelled strip
  // (DockNode gives it a fixed extent; its siblings take the freed space).
  // Maximize and collapse are exclusive (panelChrome / the controller).
  // A held stack follows the tab that becomes active after the drop (its first
  // remaining tab): when that one is collapsed it is a strip — still mounting nothing.
  const stripPanel = $derived(held ? layout?.panels[stack.panelIds[0]] : activePanel);
  const collapsedStrip = $derived(!!stripPanel?.collapsed && !maximized);
  const stripLabel = $derived(collapsedStripLabel(stack.panelIds.map((id) => titleOf(layout?.panels[id], id))));
  let stripEl = $state<HTMLElement | null>(null);

  /**
   * Collapse / expand the active panel. Focus follows (keyboard users keep their
   * place): collapsing lands on the strip, expanding on the active tab.
   */
  async function toggleCollapse(panel: PanelInstance, moveFocus = true) {
    const collapsing = !panel.collapsed;
    controller.dispatch({ type: 'panel.collapse', panelId: panel.id, collapsed: collapsing });
    if (!moveFocus) return;
    await tick();
    if (collapsing) stripEl?.focus();
    else (headEl?.querySelector<HTMLElement>('.aw-pane-tab.active') ?? headEl)?.focus();
  }

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
    return buildPanelMenuItems({
      panel,
      editMode: $controller.editMode,
      maximized: $controller.maximizedPanelId === panel.id,
      canMaximize: !overlay,
      pages: $controller.pages.map((page) => ({ id: page.id, label: page.label })),
      activePageId: layout?.activePageId,
      actions: {
        moveToRegion: (target) => controller.dispatch({ type: 'panel.move', panelId: panel.id, to: { kind: 'region', region: target } }),
        moveToPage: (pageId) => movePanelToPage(panel, pageId),
        toggleMaximize: () => controller.toggleMaximizedPanel(panel.id),
        toggleCollapse: () => toggleCollapse(panel),
        save: () => savePanelTemplate(panel),
        close: () => controller.dispatch({ type: 'panel.close', panelId: panel.id })
      }
    });
  });

  function movePanelToPage(panel: PanelInstance, pageId: string) {
    const result = controller.dispatch({ type: 'panel.move', panelId: panel.id, to: { kind: 'region', region: 'main' }, pageId });
    if (!result.success) return;
    const pageLabel = $controller.activeLayout?.pages[pageId]?.label ?? pageId;
    enqueueToast({ text: `Moved ${titleOf(panel, panel.id)} to ${pageLabel}` });
  }

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

  // Insertion index for a parameter-control tab drop (T21 directive #2: "insert
  // a new tab at that spot"): hit-test the pointer's x against the rendered tab
  // pills' midpoints. Dropping past the last pill appends. (Panel drags resolve
  // their tab index in dockDropTarget.ts from the same pill rects.)
  function tabInsertIndexAt(x: number, tabStackEl: HTMLElement): number {
    const tabRects = Array.from(tabStackEl.querySelectorAll<HTMLElement>('.aw-pane-tab')).map((el) => plainRect(rectOf(el)));
    return widgetDropIndex({ x, y: 0 }, tabRects, 'horizontal');
  }

  // Panel drag from a tab (edit mode): lifts the panel out of the dock, shows
  // the zones / edges / page targets, one `panel.move` on drop (panelDrag.ts).
  // A press that never moves activates the tab.
  function tabPointerDown(panelId: string, e: PointerEvent) {
    if (!$controller.editMode || e.button !== 0) return;
    startPanelTabDrag({
      controller,
      event: e,
      panelId,
      onTap: () => controller.dispatch({ type: 'panel.activate', panelId })
    });
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

  // A collapsed strip springs too: a dwell during any drag expands it, so the
  // drag can continue into the revealed panel (pointer drags + parameter drags).
  const EXPAND_SPRING = '__aw-expand__';
  function armExpandSpring(): void {
    if (springPanelId === EXPAND_SPRING && springTimer != null) return;
    cancelSpring();
    springPanelId = EXPAND_SPRING;
    springTimer = setTimeout(() => {
      springTimer = null;
      springPanelId = null;
      if (stripPanel?.collapsed) void toggleCollapse(stripPanel, false);
    }, SPRING_DWELL_MS);
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
    if (drag && pointer && collapsedStrip && stripEl) {
      const sr = stripEl.getBoundingClientRect();
      const overStrip = pointer.x >= sr.left && pointer.x <= sr.right && pointer.y >= sr.top && pointer.y <= sr.bottom;
      if (overStrip) armExpandSpring();
      else cancelSpring();
      return;
    }
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
    // collects into that panel (the header handles the tab-bar case). Over a
    // collapsed strip the dwell expands the stack instead.
    if (collapsedStrip) armExpandSpring();
    else {
      const springTarget = tabAtPointerX(event.clientX);
      if (springTarget) armSpring(springTarget);
    }
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

<section
  bind:this={sectionEl}
  class="aw-tabstack"
  class:maximized={maximized && !!maxRect}
  class:collapsed-strip={collapsedStrip}
  data-tabstack={stack.id}
  data-region={region}
  data-collapsed={collapsedStrip ? 'true' : undefined}
  data-maximized={maximized ? 'true' : undefined}
  style={maxStyle}
>
  {#if collapsedStrip && stripPanel}
    <!-- Collapsed: the whole stack is one slim strip labelled with its tabs;
         clicking it expands the active panel again. -->
    <button
      class="aw-pane-strip"
      class:vertical={stripVertical}
      class:param-tab-hover={paramTabHover}
      type="button"
      data-pane-strip
      bind:this={stripEl}
      title={`Expand ${stripLabel}`}
      aria-label={`Expand ${stripLabel}`}
      onclick={() => toggleCollapse(stripPanel)}
      oncontextmenu={(e) => openHeaderMenu(stripPanel.id, e)}
      ondragover={onHeaderParameterDragOver}
      ondragleave={onHeaderParameterDragLeave}
      ondrop={onHeaderParameterDrop}
    >
      <span class="aw-pane-strip-text"><span class="aw-pane-strip-icon" aria-hidden="true">+</span> {stripLabel}</span>
    </button>
  {:else}
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
            title={$controller.editMode ? 'Drag to move · double-click to maximize' : 'Double-click to maximize'}
            onpointerdown={(e) => tabPointerDown(panelId, e)}
            onclick={() => !$controller.editMode && controller.dispatch({ type: 'panel.activate', panelId })}
            ondblclick={() => !overlay && controller.toggleMaximizedPanel(panelId)}
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
        {#if !overlay}
        <button
          class="aw-pane-btn"
          class:on={maximized}
          type="button"
          title={maximized ? `Restore ${activeTitle}` : `Maximize ${activeTitle}`}
          aria-label={maximized ? `Restore ${activeTitle}` : `Maximize ${activeTitle}`}
          aria-pressed={maximized}
          data-pane-maximize
          onclick={() => controller.toggleMaximizedPanel(activePanel.id)}
        >{maximized ? '⤡' : '⤢'}</button>
        {/if}
        {#if activePanel.collapsible !== false && !maximized}
          <button
            class="aw-pane-btn"
            type="button"
            title={activePanel.collapsed ? 'Expand panel' : 'Collapse panel'}
            aria-label={activePanel.collapsed ? `Expand ${activeTitle}` : `Collapse ${activeTitle}`}
            onclick={() => toggleCollapse(activePanel)}
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
    {:else if held}
      <!-- The active tab is being dragged: keep the body quiet (no other tab mounts). -->
      <div class="aw-tabbody-held" data-tabbody-held aria-hidden="true"></div>
    {/if}
  </div>
  {/if}
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
  /* Maximized: the stack's own DOM is lifted over the measured workspace rect
     (inline left/top/width/height) — above the regions (z ≤ 5) and the rail
     overlay's resting layer, below the expanded rail (60), menus (120), dock
     drawers (180), the Customize drawers (237+), toasts and the drag layer. */
  .aw-tabstack.maximized {
    position: fixed;
    right: auto;
    bottom: auto;
    z-index: 50;
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--aw-accent) 30%, transparent),
      0 18px 60px rgba(0, 0, 0, 0.45);
  }
  .aw-pane-btn.on {
    color: var(--aw-accent);
  }
  /* Collapsed stack: one slim labelled strip (DockNode sizes it to 36px along
     its split axis); a vertical strip rotates its label. */
  .aw-pane-strip {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    background: var(--aw-bg-2);
    color: var(--aw-text-2);
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    font: 600 11px/1 var(--aw-font-mono);
    letter-spacing: 0.08em;
  }
  .aw-pane-strip:hover {
    background: color-mix(in srgb, var(--aw-surface) 60%, var(--aw-bg-2));
    color: var(--aw-text);
  }
  .aw-pane-strip:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: -2px;
  }
  .aw-pane-strip-text {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .aw-pane-strip.vertical .aw-pane-strip-text {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  .aw-pane-strip-icon {
    color: var(--aw-accent);
  }
  /* A parameter control over a collapsed strip: the strip is the drop target. */
  .aw-pane-strip.param-tab-hover {
    background: color-mix(in srgb, var(--aw-accent) 16%, var(--aw-bg-2));
    box-shadow: inset 0 0 0 2px var(--aw-accent);
  }
  .aw-tabbody-held {
    position: absolute;
    inset: 0;
    background: var(--aw-bg);
  }
</style>
