<script lang="ts">
  import { getWorkbenchContext } from './context';
  import {
    capWidgetSize,
    clampFloatingPosition,
    createCustomPanelFromWidgetsCommands,
    healFloatingRect,
    raiseFloatingOrder,
    type DockRegionId,
    type WidgetInstance,
    type WidgetSize,
    type WorkbenchCommand
  } from '../core';
  import { onMount } from 'svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { pointerDistance, widgetDropCommand, widgetDropIndex, type WorkbenchRect } from './drag';
  import { createWidgetTemplateFromWidget } from './library';
  import { nextOrderedIndex, WIDGET_ZONE_MOVE_OPTIONS } from './moveAlternatives';

  let {
    widget,
    forcedSize
  }: {
    widget: WidgetInstance;
    forcedSize?: WidgetSize;
  } = $props();

  const { controller, registry } = getWorkbenchContext();
  const Component = $derived(registry.widget(widget.type));
  // Auto-fit (`forcedSize`) may only shrink below the widget's manual size,
  // never grow above it — manual density is a ceiling (design mkW §3).
  const size = $derived(
    forcedSize != null ? capWidgetSize(forcedSize, widget.size ?? 'default') : widget.size ?? 'default'
  );
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
    ...WIDGET_ZONE_MOVE_OPTIONS.map((option, index): WorkbenchMenuItem => ({
      id: `move-${option.id}`,
      label: option.label,
      separatorBefore: index === 0,
      danger: option.id === 'hidden',
      disabled: widget.locked || widget.zone === option.id,
      run: () =>
        controller.dispatch({
          type: 'widget.move',
          widgetIds: [widget.id],
          zone: option.id,
          floatingRect: option.id === 'floating' ? (widget.floatingRect ?? { x: 48, y: 72 }) : undefined
        })
    })),
    {
      id: 'save',
      label: 'Save To Library',
      separatorBefore: true,
      disabled: widget.locked,
      run: saveWidgetTemplate
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

  function workspaceEdgeDropAt(x: number, y: number): { region: DockRegionId; rect: WorkbenchRect } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const workspace = el?.closest<HTMLElement>('.aw-workspace');
    if (!workspace) return null;
    const rect = workspace.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const nx = (x - rect.left) / rect.width;
    const ny = (y - rect.top) / rect.height;
    const edge = 0.18;
    if (nx < edge) return { region: 'left', rect: { left: rect.left, top: rect.top, width: Math.min(rect.width * 0.24, 220), height: rect.height } };
    if (nx > 1 - edge) return { region: 'right', rect: { left: rect.right - Math.min(rect.width * 0.24, 220), top: rect.top, width: Math.min(rect.width * 0.24, 220), height: rect.height } };
    if (ny < edge) return { region: 'top', rect: { left: rect.left, top: rect.top, width: rect.width, height: Math.min(rect.height * 0.22, 150) } };
    if (ny > 1 - edge) return { region: 'bottom', rect: { left: rect.left, top: rect.bottom - Math.min(rect.height * 0.22, 150), width: rect.width, height: Math.min(rect.height * 0.22, 150) } };
    return null;
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
      const edgeDrop = !groupCommand && !target ? workspaceEdgeDropAt(pointer.x, pointer.y) : null;
      controller.setDrag({
        kind: 'widget',
        widgetIds: [widget.id],
        startedAt,
        pointer,
        targetLabel: groupCommand ? 'Group widgets' : target ? target.zone : edgeDrop ? `New panel in ${edgeDrop.region}` : undefined,
        previewRect: preview?.rect ?? edgeDrop?.rect,
        previewKind: preview?.kind ?? (edgeDrop ? 'zone' : undefined),
        previewOrientation: preview?.orientation
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) {
        const groupCommand = groupCommandAt(ev.clientX, ev.clientY);
        const target = widgetDropAt(ev.clientX, ev.clientY);
        const edgeDrop = !groupCommand && !target ? workspaceEdgeDropAt(ev.clientX, ev.clientY) : null;
        if (groupCommand) controller.dispatch(groupCommand);
        else if (target) controller.dispatch(widgetDropCommand([widget.id], target));
        else if (edgeDrop) {
          controller.dispatchMany(
            createCustomPanelFromWidgetsCommands($controller.document, {
              widgetIds: [widget.id],
              title: 'Custom Panel',
              region: edgeDrop.region
            })
          );
        }
        controller.setDrag(null);
      }
    };

    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function moveByKey(e: KeyboardEvent) {
    if (!$controller.editMode || widget.locked || widget.groupId) return;
    const direction = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!direction) return;
    const siblings = Object.values($controller.activeLayout?.widgets ?? {})
      .filter((item) => item.zone === widget.zone && !item.groupId)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const currentIndex = siblings.findIndex((item) => item.id === widget.id);
    if (currentIndex < 0) return;
    e.preventDefault();
    controller.dispatch({
      type: 'widget.move',
      widgetIds: [widget.id],
      zone: widget.zone,
      index: nextOrderedIndex(currentIndex, direction as -1 | 1, siblings.length)
    });
  }

  // ── Floating widgets (design 01-shell §4/§7) ────────────────────────────
  // Floating chips reposition freely over the content, stack by `order`, and
  // never get lost offscreen. Positions persist in `widget.floatingRect` via
  // `widget.move`. Repositioning is pointer-based (no HTML5 DnD) and available
  // whether or not edit mode is on, since a floater has no bar to grab from.
  let hostEl = $state<HTMLElement | null>(null);
  const isFloating = $derived(widget.zone === 'floating');

  // Container = the floating zone element (inset:0 over the root); its client
  // box is the clamp viewport. Falls back to the widget's parent.
  function floatingViewport(): { width: number; height: number } {
    const zoneEl = hostEl?.closest<HTMLElement>('[data-zone="floating"]') ?? hostEl?.parentElement;
    if (!zoneEl) return { width: 0, height: 0 };
    return { width: zoneEl.clientWidth, height: zoneEl.clientHeight };
  }

  function floatingSize(): { width: number; height: number } {
    if (!hostEl) return { width: 150, height: 40 };
    return { width: hostEl.offsetWidth || 150, height: hostEl.offsetHeight || 40 };
  }

  // Raise this floater above its siblings (deterministic order bump). Pure
  // resolution in core/floating.ts; returns null when already topmost.
  function raiseFloating() {
    const widgets = Object.values($controller.activeLayout?.widgets ?? {});
    const order = raiseFloatingOrder(widgets, widget.id);
    if (order == null) return;
    controller.dispatch({ type: 'widget.move', widgetIds: [widget.id], zone: 'floating', index: order });
  }

  function floatingPointerDown(e: PointerEvent) {
    if (!isFloating || widget.locked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    raiseFloating();

    const origin = widget.floatingRect ?? { x: 0, y: 0 };
    const startedAt = { x: e.clientX, y: e.clientY };
    let dragging = false;
    let pending: { x: number; y: number } = { x: origin.x, y: origin.y };

    const onMove = (ev: PointerEvent) => {
      if (!dragging && pointerDistance(startedAt, { x: ev.clientX, y: ev.clientY }) < 4) return;
      dragging = true;
      const raw = { x: origin.x + (ev.clientX - startedAt.x), y: origin.y + (ev.clientY - startedAt.y) };
      pending = clampFloatingPosition(raw, floatingSize(), floatingViewport());
      // Live feedback without a dispatch per frame — write directly to the node
      // (top/left are untransitioned, so no geometry-transition restart loop).
      if (hostEl) {
        hostEl.style.left = `${pending.x}px`;
        hostEl.style.top = `${pending.y}px`;
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging) return;
      // Persist the clamped position on drag end.
      controller.dispatch({
        type: 'widget.move',
        widgetIds: [widget.id],
        zone: 'floating',
        floatingRect: { ...(widget.floatingRect ?? {}), x: pending.x, y: pending.y }
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Self-heal: on mount and on viewport/zone resize, re-clamp a persisted
  // position so a floater saved offscreen (e.g. after the window shrank)
  // reappears with a grabbable strip in view.
  function healFloatingIntoView() {
    if (!isFloating || !widget.floatingRect || !hostEl) return;
    const healed = healFloatingRect(widget.floatingRect, floatingSize(), floatingViewport());
    if (!healed) return;
    controller.dispatch({ type: 'widget.move', widgetIds: [widget.id], zone: 'floating', floatingRect: healed });
  }

  // Keyboard reposition for the floating grip: arrows nudge by a step (Shift =
  // coarse), clamped + persisted like a drag end.
  function moveFloatingByKey(e: KeyboardEvent) {
    if (!isFloating || widget.locked) return;
    const step = e.shiftKey ? 16 : 4;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const origin = widget.floatingRect ?? { x: 0, y: 0 };
    const next = clampFloatingPosition({ x: origin.x + dx, y: origin.y + dy }, floatingSize(), floatingViewport());
    controller.dispatch({
      type: 'widget.move',
      widgetIds: [widget.id],
      zone: 'floating',
      floatingRect: { ...(widget.floatingRect ?? {}), x: next.x, y: next.y }
    });
  }

  onMount(() => {
    if (!isFloating) return;
    // Defer to let the widget measure its own size before the first heal.
    const raf = requestAnimationFrame(healFloatingIntoView);
    const zoneEl = hostEl?.closest<HTMLElement>('[data-zone="floating"]') ?? hostEl?.parentElement ?? null;
    const ro = zoneEl ? new ResizeObserver(() => healFloatingIntoView()) : null;
    if (zoneEl && ro) ro.observe(zoneEl);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  });
</script>

<div
  bind:this={hostEl}
  class="aw-widget-host"
  class:floating={isFloating}
  data-widget-host
  data-widget={widget.id}
  data-widget-type={widget.type}
  data-size={size}
  role="group"
  style={isFloating && widget.floatingRect ? `left:${widget.floatingRect.x}px; top:${widget.floatingRect.y}px; z-index:${50 + widget.order};` : ''}
  onpointerdowncapture={isFloating ? () => raiseFloating() : undefined}
  oncontextmenu={openMenu}
>
  {#if isFloating && !widget.locked}
    <!-- Persistent grab handle across the top of the chip: floaters have no bar
         to grab from, so they reposition whether or not edit mode is on
         (design §7 free move). Inner widget controls stay interactive. -->
    <button
      class="aw-widget-float-grip"
      type="button"
      title="Move widget"
      aria-label="Move widget"
      onpointerdown={floatingPointerDown}
      onkeydown={moveFloatingByKey}
    >⠿</button>
  {/if}
  {#if Component}
    <Component widget={widget} {size} dispatch={(command: WorkbenchCommand) => controller.dispatch(command)} editMode={$controller.editMode} />
  {/if}
  {#if $controller.editMode && !widget.locked && !isFloating}
    <!-- The grab surface is present for standalone AND grouped widgets: grabbing
         a grouped member drags it out of (or reorders it against) the group. The
         whole-group grip lives on WidgetGroupHost. -->
    <div
      class="aw-widget-drag-surface"
      class:member={!!widget.groupId}
      role="button"
      tabindex="0"
      aria-label={widget.groupId ? 'Move widget out of group' : 'Move widget'}
      onpointerdown={dragPointerDown}
      onkeydown={moveByKey}
    ></div>
  {/if}
  {#if $controller.editMode && !widget.locked && !widget.groupId}
    <!-- Edit chrome is INSET into the widget's own top-right corner (never a
         negative offset that escapes the box into a neighbour or the workbench
         chrome — see V13b). It sits above the drag surface (z-index) so the
         buttons stay clickable, and collapses to a single ⋯ at compact/mini so
         the cluster never has to shrink below tap size. -->
    <div class="aw-widget-edit" data-density={size}>
      {#if size === 'default'}
        <button type="button" title="Cycle size" onclick={cycleSize}>↕</button>
        <button type="button" title="Hide widget" onclick={() => controller.dispatch({ type: 'widget.hide', widgetIds: [widget.id] })}>×</button>
      {/if}
      <button type="button" title="Widget actions" aria-haspopup="menu" aria-expanded={menuOpen} onclick={openButtonMenu}>⋯</button>
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
    /* Design §7.4: floating chip wrap — padding 6, radius 11, subtle shell. No
       geometry transitions on top/left (a ResizeObserver heal loop would
       restart them mid-flight). */
    padding: 6px;
    border-radius: 11px;
    background: var(--aw-bg-2);
    border: 1px solid var(--aw-border);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }
  :global(.aw-root.aw-editing) .aw-widget-host.floating {
    border-color: color-mix(in srgb, var(--aw-accent) 45%, var(--aw-border));
  }
  /* Drag handle strip across the top of the floating chip. Grabbable whether
     or not edit mode is on; inner widget controls remain interactive. */
  .aw-widget-float-grip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 12px;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 11px 11px 0 0;
    background: transparent;
    color: var(--aw-text-faint);
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.2em;
    cursor: grab;
    touch-action: none;
    opacity: 0;
  }
  .aw-widget-host.floating:hover .aw-widget-float-grip,
  .aw-widget-float-grip:focus-visible {
    opacity: 1;
  }
  .aw-widget-float-grip:active {
    cursor: grabbing;
  }
  /* Edit chrome is INSET into the widget's own top-right corner (design 01-shell
     §5 anchors affordances to their unit; V13b: no negative offsets that escape
     the box into a neighbouring widget or the workbench chrome). It overlays the
     widget without taking layout space, so the chip keeps its normal proportions
     in edit mode. A subtle backdrop keeps the glyphs legible over widget content,
     and z-index sits above the drag surface so the buttons stay clickable. */
  .aw-widget-edit {
    position: absolute;
    top: 2px;
    right: 2px;
    z-index: 9;
    display: flex;
    gap: 2px;
    padding: 1px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-bg-2) 78%, transparent);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .aw-widget-drag-surface {
    position: absolute;
    inset: 0;
    z-index: 5;
    cursor: grab;
    border-radius: 10px;
    /* Subtle dashed outline sitting just outside the chip — no background fill
       (design overlay is a transparent grab layer, the dashed outline marks
       the unit). offset keeps it clear of the widget's own border. */
    outline: 1px dashed color-mix(in srgb, var(--aw-accent) 40%, transparent);
    outline-offset: 3px;
    background: transparent;
  }
  /* A grouped member's grab surface hugs the member (no negative offset) so it
     doesn't bleed over its neighbours inside the shared group module. */
  .aw-widget-drag-surface.member {
    outline-offset: -1px;
    border-radius: 8px;
  }
  .aw-widget-edit button {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    border: 1px solid var(--aw-border-3);
    border-radius: 6px;
    background: var(--aw-surface-2);
    color: var(--aw-text-muted);
    font-size: 11px;
    cursor: pointer;
  }
  /* Compact/mini widgets are short: the cluster collapses to a lone ⋯ that still
     meets tap size, kept fully inside the shorter box. */
  .aw-widget-edit[data-density='compact'] button,
  .aw-widget-edit[data-density='mini'] button {
    width: 16px;
    height: 16px;
    font-size: 10px;
  }
  .aw-widget-edit button:hover {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
</style>
