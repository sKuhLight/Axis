<script lang="ts">
  import WidgetHost from './WidgetHost.svelte';
  import { getWorkbenchContext } from './context';
  import ContextMenu from './ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { pointerDistance, widgetDropCommand, widgetDropIndex, type WorkbenchRect } from './drag';
  import { createWidgetTemplateFromGroup } from './library';

  let { groupId }: { groupId: string } = $props();
  const { controller } = getWorkbenchContext();
  const group = $derived($controller.activeLayout?.widgetGroups[groupId]);
  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });

  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => [
    {
      id: 'save',
      label: 'Save Group To Library',
      disabled: !group || group.locked,
      run: saveGroupTemplate
    },
    {
      id: 'ungroup',
      label: 'Ungroup Widgets',
      separatorBefore: true,
      disabled: !group || group.locked,
      run: () => group && controller.dispatch({ type: 'widget.ungroup', groupId: group.id })
    },
    {
      id: 'hide',
      label: 'Hide Group',
      danger: true,
      separatorBefore: true,
      disabled: !group || group.locked,
      run: () => group && controller.dispatch({ type: 'widget.hide', widgetIds: group.widgetIds })
    }
  ]);

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    menuPosition = menuPositionFromPointer(event);
    menuOpen = true;
  }

  function openButtonMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menuPosition = { x: rect.right - 8, y: rect.bottom + 6 };
    menuOpen = true;
  }

  function saveGroupTemplate() {
    if (!group) return;
    const template = createWidgetTemplateFromGroup($controller.document, group.id);
    if (template) controller.dispatch({ type: 'library.widget.save', template });
  }

  function widgetDropAt(x: number, y: number) {
    if (!group) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>('[data-zone]');
    const zone = zoneEl?.dataset.zone;
    if (!zone) return null;
    const orientation: 'horizontal' | 'vertical' = zone === 'rail' ? 'vertical' : 'horizontal';
    const itemEls = Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-widget-host], [data-widget-group]')).filter((item) => {
      if (item.dataset.widgetGroup === group.id) return false;
      const widgetId = item.dataset.widget;
      return !widgetId || !group.widgetIds.includes(widgetId);
    });
    const itemRects = itemEls.map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    return { zone, index: widgetDropIndex({ x, y }, itemRects, orientation) };
  }

  function rectOf(el: Element): WorkbenchRect {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function widgetPreviewAt(x: number, y: number): {
    rect: WorkbenchRect;
    kind: 'zone' | 'insert';
    orientation: 'horizontal' | 'vertical';
    label: string;
  } | null {
    if (!group) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>('[data-zone]');
    const zone = zoneEl?.dataset.zone;
    if (!zone || !zoneEl) return null;
    const orientation: 'horizontal' | 'vertical' = zone === 'rail' ? 'vertical' : 'horizontal';
    const target = widgetDropAt(x, y);
    if (!target) return { rect: rectOf(zoneEl), kind: 'zone' as const, orientation, label: zone };
    const itemEls = Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-widget-host], [data-widget-group]')).filter((item) => {
      if (item.dataset.widgetGroup === group.id) return false;
      const widgetId = item.dataset.widget;
      return !widgetId || !group.widgetIds.includes(widgetId);
    });
    const ref = itemEls[Math.min(target.index ?? 0, Math.max(0, itemEls.length - 1))];
    if (!ref || itemEls.length === 0) return { rect: rectOf(zoneEl), kind: 'zone' as const, orientation, label: zone };
    const rect = ref.getBoundingClientRect();
    const before = (target.index ?? 0) < itemEls.length;
    const line =
      orientation === 'vertical'
        ? { left: rect.left, top: before ? rect.top - 4 : rect.bottom + 4, width: rect.width, height: 2 }
        : { left: before ? rect.left - 4 : rect.right + 4, top: rect.top, width: 2, height: rect.height };
    return { rect: line, kind: 'insert' as const, orientation, label: zone };
  }

  function dragPointerDown(e: PointerEvent) {
    if (!$controller.editMode || !group || group.locked || e.button !== 0) return;
    const startedAt = { x: e.clientX, y: e.clientY };
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      const pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragging && pointerDistance(startedAt, pointer) < 5) return;
      dragging = true;
      const target = widgetDropAt(pointer.x, pointer.y);
      const preview = widgetPreviewAt(pointer.x, pointer.y);
      controller.setDrag({
        kind: 'widget',
        widgetIds: group.widgetIds,
        startedAt,
        pointer,
        targetLabel: target ? target.zone : undefined,
        previewRect: preview?.rect,
        previewKind: preview?.kind,
        previewOrientation: preview?.orientation
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging && group) {
        const target = widgetDropAt(ev.clientX, ev.clientY);
        if (target) controller.dispatch(widgetDropCommand(group.widgetIds, target));
        controller.setDrag(null);
      }
    };

    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
</script>

{#if group}
  <div class="aw-widget-group" data-widget-group={group.id} role="group" oncontextmenu={openMenu}>
    {#if $controller.editMode && !group.locked}
      <button class="aw-group-grip" type="button" title="Move group" onpointerdown={dragPointerDown}>⋮</button>
      <button
        class="aw-group-ungroup"
        type="button"
        title="Ungroup widgets"
        onclick={() => controller.dispatch({ type: 'widget.ungroup', groupId: group.id })}
      >
        ⧉
      </button>
      <button class="aw-group-menu" type="button" title="Group actions" aria-haspopup="menu" aria-expanded={menuOpen} onclick={openButtonMenu}>⋯</button>
    {/if}
    {#each group.widgetIds as widgetId, index (widgetId)}
      {@const widget = $controller.activeLayout?.widgets[widgetId]}
      {#if widget}
        {#if index > 0}<span class="aw-widget-divider"></span>{/if}
        <WidgetHost {widget} />
      {/if}
    {/each}
  </div>
{/if}

<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} label="Widget group actions" onClose={() => (menuOpen = false)} />

<style>
  .aw-widget-group {
    position: relative;
    min-width: 0;
    max-width: 100%;
    height: var(--aw-widget-h);
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 2px;
    border: 1px solid var(--aw-border);
    border-radius: 10px;
    background: var(--aw-bg-2);
  }
  .aw-group-grip {
    align-self: stretch;
    width: 18px;
    border: 0;
    border-right: 1px solid var(--aw-border);
    background: transparent;
    color: var(--aw-text-muted);
    cursor: grab;
    font-size: 13px;
  }
  .aw-group-grip:hover {
    color: var(--aw-accent);
  }
  .aw-group-ungroup {
    position: absolute;
    top: -9px;
    right: 13px;
    z-index: 8;
    width: 18px;
    height: 18px;
    border: 1px solid var(--aw-border);
    border-radius: 6px;
    background: var(--aw-surface-2);
    color: var(--aw-text-muted);
    font-size: 10px;
    cursor: pointer;
  }
  .aw-group-ungroup:hover {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-group-menu {
    position: absolute;
    top: -9px;
    right: -8px;
    z-index: 8;
    width: 18px;
    height: 18px;
    border: 1px solid var(--aw-border);
    border-radius: 6px;
    background: var(--aw-surface-2);
    color: var(--aw-text-muted);
    font-size: 10px;
    cursor: pointer;
  }
  .aw-group-menu:hover {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-widget-divider {
    width: 1px;
    align-self: stretch;
    margin: 8px 1px;
    background: var(--aw-border);
  }
</style>
