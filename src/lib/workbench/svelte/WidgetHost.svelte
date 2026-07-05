<script lang="ts">
  import { getWorkbenchContext } from './context';
  import type { WidgetInstance, WidgetSize, WorkbenchCommand } from '../core';
  import ContextMenu from './ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { pointerDistance, widgetDropCommand, widgetDropIndex, type WorkbenchRect } from './drag';
  import { createWidgetTemplateFromWidget } from './library';

  let {
    widget,
    forcedSize
  }: {
    widget: WidgetInstance;
    forcedSize?: WidgetSize;
  } = $props();

  const { controller, registry } = getWorkbenchContext();
  const Component = $derived(registry.widget(widget.type));
  const size = $derived(forcedSize ?? widget.size ?? 'default');
  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });

  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => [
    {
      id: 'size-default',
      label: 'Default Size',
      hint: widget.size === 'default' ? 'Current' : undefined,
      disabled: widget.locked || widget.size === 'default',
      run: () => controller.dispatch({ type: 'widget.resize', widgetId: widget.id, size: 'default' })
    },
    {
      id: 'size-compact',
      label: 'Compact Size',
      hint: widget.size === 'compact' ? 'Current' : undefined,
      disabled: widget.locked || widget.size === 'compact',
      run: () => controller.dispatch({ type: 'widget.resize', widgetId: widget.id, size: 'compact' })
    },
    {
      id: 'size-mini',
      label: 'Mini Size',
      hint: widget.size === 'mini' ? 'Current' : undefined,
      disabled: widget.locked || widget.size === 'mini',
      run: () => controller.dispatch({ type: 'widget.resize', widgetId: widget.id, size: 'mini' })
    },
    {
      id: 'save',
      label: 'Save To Library',
      separatorBefore: true,
      disabled: widget.locked,
      run: saveWidgetTemplate
    },
    {
      id: 'hide',
      label: 'Hide Widget',
      danger: true,
      separatorBefore: true,
      disabled: widget.locked,
      run: () => controller.dispatch({ type: 'widget.hide', widgetIds: [widget.id] })
    }
  ]);

  function cycleSize() {
    const next = size === 'default' ? 'compact' : size === 'compact' ? 'mini' : 'default';
    controller.dispatch({ type: 'widget.resize', widgetId: widget.id, size: next });
  }

  function saveWidgetTemplate() {
    const template = createWidgetTemplateFromWidget($controller.document, widget.id);
    if (template) controller.dispatch({ type: 'library.widget.save', template });
  }

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

  function groupCommandFor(target: WidgetInstance): WorkbenchCommand | null {
    const layout = $controller.activeLayout;
    if (!layout || target.id === widget.id || target.locked) return null;
    if (target.groupId && target.groupId === widget.groupId) return null;

    const targetGroup = target.groupId ? layout.widgetGroups[target.groupId] : undefined;
    if (targetGroup?.locked) return null;
    if (targetGroup) {
      const widgetIds = [...targetGroup.widgetIds.filter((id) => id !== widget.id), widget.id];
      const anchor = targetGroup.widgetIds.map((id) => layout.widgets[id]).filter(Boolean).sort((a, b) => a.order - b.order)[0];
      return {
        type: 'widget.group',
        groupId: targetGroup.id,
        widgetIds,
        zone: anchor?.zone ?? target.zone,
        index: anchor?.order ?? target.order
      };
    }

    return {
      type: 'widget.group',
      widgetIds: [target.id, widget.id],
      zone: target.zone,
      index: target.order
    };
  }

  function groupCommandAt(x: number, y: number): WorkbenchCommand | null {
    const layout = $controller.activeLayout;
    if (!layout || widget.groupId) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const groupEl = el?.closest<HTMLElement>('[data-widget-group]');
    const groupId = groupEl?.dataset.widgetGroup;
    if (groupId) {
      const group = layout.widgetGroups[groupId];
      if (!group || group.locked || group.widgetIds.includes(widget.id)) return null;
      const anchor = group.widgetIds.map((id) => layout.widgets[id]).filter(Boolean).sort((a, b) => a.order - b.order)[0];
      return {
        type: 'widget.group',
        groupId,
        widgetIds: [...group.widgetIds, widget.id],
        zone: anchor?.zone ?? widget.zone,
        index: anchor?.order ?? widget.order
      };
    }

    const widgetEl = el?.closest<HTMLElement>('[data-widget-host]');
    const targetId = widgetEl?.dataset.widget;
    const target = targetId ? layout.widgets[targetId] : undefined;
    return target ? groupCommandFor(target) : null;
  }

  function rectOf(el: Element): WorkbenchRect {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function widgetPreviewAt(x: number, y: number): {
    rect: WorkbenchRect;
    kind: 'zone' | 'insert' | 'group';
    orientation?: 'horizontal' | 'vertical';
    label?: string;
  } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const groupEl = el?.closest<HTMLElement>('[data-widget-group]');
    if (!widget.groupId && groupEl?.dataset.widgetGroup) return { rect: rectOf(groupEl), kind: 'group', label: 'Group widgets' };

    const targetWidgetEl = el?.closest<HTMLElement>('[data-widget-host]');
    if (!widget.groupId && targetWidgetEl?.dataset.widget && targetWidgetEl.dataset.widget !== widget.id) {
      return { rect: rectOf(targetWidgetEl), kind: 'group', label: 'Group widgets' };
    }

    const zoneEl = el?.closest<HTMLElement>('[data-zone]');
    if (!zoneEl?.dataset.zone) return null;
    const zone = zoneEl.dataset.zone;
    const orientation = zone === 'rail' ? 'vertical' : 'horizontal';
    const target = widgetDropAt(x, y);
    if (!target) return { rect: rectOf(zoneEl), kind: 'zone', label: zone };

    const itemEls = Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-widget-host], [data-widget-group]')).filter(
      (item) => item.dataset.widget !== widget.id
    );
    const ref = itemEls[Math.min(target.index ?? 0, Math.max(0, itemEls.length - 1))];
    if (!ref || itemEls.length === 0) return { rect: rectOf(zoneEl), kind: 'zone', label: zone };
    const rect = ref.getBoundingClientRect();
    const before = (target.index ?? 0) < itemEls.length;
    const line =
      orientation === 'vertical'
        ? { left: rect.left, top: before ? rect.top - 4 : rect.bottom + 4, width: rect.width, height: 2 }
        : { left: before ? rect.left - 4 : rect.right + 4, top: rect.top, width: 2, height: rect.height };
    return { rect: line, kind: 'insert', orientation, label: zone };
  }

  function widgetDropAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>('[data-zone]');
    const zone = zoneEl?.dataset.zone;
    if (!zone) return null;
    const orientation = zone === 'rail' ? 'vertical' : 'horizontal';
    const itemEls = Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-widget-host], [data-widget-group]'))
      .filter((item) => item.dataset.widget !== widget.id);
    const itemRects = itemEls.map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    const index = widgetDropIndex({ x, y }, itemRects, orientation);
    if (zone === 'floating') {
      const root = zoneEl.getBoundingClientRect();
      return { zone, index, floatingRect: { x: x - root.left, y: y - root.top } };
    }
    return { zone, index };
  }

  function dragPointerDown(e: PointerEvent) {
    if (!$controller.editMode || widget.locked || e.button !== 0) return;
    const startedAt = { x: e.clientX, y: e.clientY };
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      const pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragging && pointerDistance(startedAt, pointer) < 5) return;
      dragging = true;
      const groupCommand = groupCommandAt(pointer.x, pointer.y);
      const target = widgetDropAt(pointer.x, pointer.y);
      const preview = widgetPreviewAt(pointer.x, pointer.y);
      controller.setDrag({
        kind: 'widget',
        widgetIds: [widget.id],
        startedAt,
        pointer,
        targetLabel: groupCommand ? 'Group widgets' : target ? target.zone : undefined,
        previewRect: preview?.rect,
        previewKind: preview?.kind,
        previewOrientation: preview?.orientation
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) {
        const groupCommand = groupCommandAt(ev.clientX, ev.clientY);
        const target = widgetDropAt(ev.clientX, ev.clientY);
        if (groupCommand) controller.dispatch(groupCommand);
        else if (target) controller.dispatch(widgetDropCommand([widget.id], target));
        controller.setDrag(null);
      }
    };

    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
</script>

<div
  class="aw-widget-host"
  class:floating={widget.zone === 'floating'}
  data-widget-host
  data-widget={widget.id}
  data-widget-type={widget.type}
  data-size={size}
  role="group"
  style={widget.zone === 'floating' && widget.floatingRect ? `left:${widget.floatingRect.x}px; top:${widget.floatingRect.y}px;` : ''}
  oncontextmenu={openMenu}
>
  {#if Component}
    <Component widget={widget} {size} dispatch={(command: WorkbenchCommand) => controller.dispatch(command)} editMode={$controller.editMode} />
  {/if}
  {#if $controller.editMode && !widget.locked && !widget.groupId}
    <div class="aw-widget-drag-surface" role="button" tabindex="0" aria-label="Move widget" onpointerdown={dragPointerDown}></div>
  {/if}
  {#if $controller.editMode && !widget.locked && !widget.groupId}
    <div class="aw-widget-edit">
      <button type="button" title="Cycle size" onclick={cycleSize}>↕</button>
      <button type="button" title="Widget actions" aria-haspopup="menu" aria-expanded={menuOpen} onclick={openButtonMenu}>⋯</button>
      <button type="button" title="Hide widget" onclick={() => controller.dispatch({ type: 'widget.hide', widgetIds: [widget.id] })}>×</button>
    </div>
  {/if}
</div>

<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} label="Widget actions" onClose={() => (menuOpen = false)} />

<style>
  .aw-widget-host {
    position: relative;
    min-width: 0;
    max-width: 100%;
    flex: none;
  }
  .aw-widget-host.floating {
    position: absolute;
    pointer-events: auto;
  }
  .aw-widget-edit {
    position: absolute;
    top: -8px;
    right: -8px;
    z-index: 6;
    display: flex;
    gap: 2px;
  }
  .aw-widget-drag-surface {
    position: absolute;
    inset: 0;
    z-index: 5;
    cursor: grab;
    border-radius: 10px;
    outline: 1px dashed color-mix(in srgb, var(--aw-accent) 44%, transparent);
    outline-offset: 3px;
    background: color-mix(in srgb, var(--aw-accent) 5%, transparent);
  }
  .aw-widget-edit {
    z-index: 7;
  }
  .aw-widget-edit button {
    width: 18px;
    height: 18px;
    border: 1px solid var(--aw-border);
    border-radius: 6px;
    background: var(--aw-surface-2);
    color: var(--aw-text-muted);
    font-size: 10px;
    cursor: pointer;
  }
  .aw-widget-edit button:hover {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
</style>
