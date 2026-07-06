<script lang="ts">
  import { getWorkbenchContext } from './context';
  import type { PanelInstance, WorkbenchCommand } from '../core';
  import ContextMenu from './ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { createPanelTemplateFromPanel } from './library';
  import { PANEL_REGION_MOVE_OPTIONS } from './moveAlternatives';

  let { panel }: { panel: PanelInstance } = $props();
  const { controller, registry } = getWorkbenchContext();
  const Component = $derived(registry.panel(panel.type));
  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });

  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => [
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
      run: savePanelTemplate
    },
    {
      id: 'close',
      label: 'Close Panel',
      danger: true,
      separatorBefore: true,
      disabled: !$controller.editMode || panel.locked || panel.closable === false,
      run: () => controller.dispatch({ type: 'panel.close', panelId: panel.id })
    }
  ]);

  function savePanelTemplate() {
    const template = createPanelTemplateFromPanel($controller.document, panel.id);
    if (template) controller.dispatch({ type: 'library.panel.save', template });
  }

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    menuPosition = menuPositionFromPointer(event);
    menuOpen = true;
  }

  function openButtonMenu(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menuPosition = { x: rect.right - 8, y: rect.bottom + 6 };
    menuOpen = true;
  }
</script>

<article class="aw-panel" class:collapsed={panel.collapsed} data-panel={panel.id} data-panel-type={panel.type} oncontextmenu={openMenu}>
  <div class="aw-panel-toolbar">
    <span class="aw-panel-title">{panel.title ?? panel.type}</span>
    <span class="aw-panel-spacer"></span>
    <button
      class="aw-panel-btn"
      type="button"
      title="Panel actions"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onclick={openButtonMenu}
    >⋯</button>
    {#if $controller.editMode && !panel.locked}
      <button
        class="aw-panel-btn"
        type="button"
        title="Save panel to library"
        onclick={savePanelTemplate}
      >▤</button>
    {/if}
    {#if panel.collapsible !== false}
      <button
        class="aw-panel-btn"
        type="button"
        title={panel.collapsed ? 'Expand panel' : 'Collapse panel'}
        onclick={() => controller.dispatch({ type: 'panel.collapse', panelId: panel.id, collapsed: !panel.collapsed })}
      >{panel.collapsed ? '+' : '−'}</button>
    {/if}
    {#if $controller.editMode && panel.closable !== false && !panel.locked}
      <button
        class="aw-panel-btn danger"
        type="button"
        title="Close panel"
        onclick={() => controller.dispatch({ type: 'panel.close', panelId: panel.id })}
      >×</button>
    {/if}
  </div>

  {#if !panel.collapsed}
    <div class="aw-panel-body">
      {#if Component}
        <Component panel={panel} dispatch={(command: WorkbenchCommand) => controller.dispatch(command)} editMode={$controller.editMode} />
      {/if}
    </div>
  {/if}
</article>

<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} label="Panel actions" onClose={() => (menuOpen = false)} />

<style>
  .aw-panel {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--aw-bg-2);
  }
  .aw-panel-toolbar {
    height: 0;
    min-height: 0;
    position: absolute;
    top: 4px;
    right: 6px;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 4px;
    pointer-events: none;
  }
  .aw-panel-title {
    display: none;
  }
  .aw-panel-btn {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid var(--aw-border);
    border-radius: 6px;
    background: color-mix(in srgb, var(--aw-surface) 92%, transparent);
    color: var(--aw-text-muted);
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
  }
  .aw-panel-btn:hover {
    color: var(--aw-text);
    border-color: var(--aw-border-2);
  }
  .aw-panel-btn.danger:hover {
    color: var(--aw-danger);
  }
  .aw-panel-body {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--aw-bg);
  }
  .aw-panel.collapsed .aw-panel-toolbar {
    position: relative;
    height: 32px;
    min-height: 32px;
    inset: auto;
    padding: 0 8px;
    background: var(--aw-bg-2);
    border-bottom: 1px solid var(--aw-border);
  }
  .aw-panel.collapsed .aw-panel-title {
    display: inline;
    color: var(--aw-text-muted);
    font: 700 11px/1 var(--aw-font-ui);
  }
  .aw-panel.collapsed .aw-panel-spacer {
    flex: 1;
  }
</style>
