<script lang="ts">
  import { getWorkbenchContext } from './context';
  import {
    capWidgetSize,
    clampFloatingPosition,
    raiseFloatingOrder,
    resolveFloatingHeal,
    type WidgetInstance,
    type WidgetSize,
    type WorkbenchCommand
  } from '../core';
  import { onMount, untrack } from 'svelte';
  import ContextMenu from './ContextMenu.svelte';
  import {
    menuPositionBelowRect,
    menuPositionFromPointer,
    type WorkbenchMenuItem,
    type WorkbenchMenuPosition
  } from './contextMenu';
  import { pointerDistance } from './drag';
  import { createWidgetTemplateFromWidget } from './library';
  import { nextOrderedIndex, WIDGET_ZONE_MOVE_OPTIONS } from './moveAlternatives';
  import { beginPointerDrag } from './dragSession';
  import { groupWithMenuItem, widgetInLockedGroup } from './widgetDrop';
  import { beginWidgetDrag } from './widgetDragSession';

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
  // A member of a LOCKED group cannot leave it (drag, move, hide) nor join
  // another one: the group would change. Its own size stays its own.
  const placementLocked = $derived(!!widget.locked || widgetInLockedGroup($controller.activeLayout, widget.id));

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
    // Slice 4b: grouping by menu — the neighbours in this zone (a member's own
    // group is its own unit and is not listed). A group neighbour takes it in.
    groupWithMenuItem({
      doc: () => controller.document,
      self: { key: widget.groupId ?? widget.id, widgetIds: [widget.id] },
      movingIds: [widget.id],
      locked: placementLocked,
      typeLabel: catalogLabel,
      isAvailable: (type) => registry.widgetSizing?.isAvailable?.(type) ?? true,
      dispatch: (command) => controller.dispatch(command),
      separatorBefore: true
    }),
    ...WIDGET_ZONE_MOVE_OPTIONS.map((option, index): WorkbenchMenuItem => ({
      id: `move-${option.id}`,
      label: option.label,
      separatorBefore: index === 0,
      danger: option.id === 'hidden',
      disabled: placementLocked || widget.zone === option.id,
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
    },
    // The widget's "settings" surface is exactly the items above — size,
    // grouping, placement (move-to), and save. No widget type exposes per-widget custom
    // settings today, so there is nothing else to wire here. This explicit
    // danger item is the replacement for the removed inset × close button.
    {
      id: 'remove',
      label: 'Remove Widget',
      separatorBefore: true,
      danger: true,
      disabled: placementLocked,
      run: () => controller.dispatch({ type: 'widget.hide', widgetIds: [widget.id] })
    }
  ]);

  // The host's catalog label for a widget type (e.g. "CPU load"), for menus and chips.
  function catalogLabel(type: string): string | undefined {
    return registry.canonicalWidgets().find((spec) => spec.type === type)?.label;
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

  // Open the widget menu anchored BELOW the widget host (design R16b: a
  // touch-friendly menu replaces the tiny inset size/close buttons). The anchor
  // is the host's live rect; ContextMenu clamps + de-zooms it, so a widget near
  // the bottom edge still gets an on-screen menu.
  function openMenuBelowHost() {
    if (!hostEl) return;
    const rect = hostEl.getBoundingClientRect();
    menuPosition = menuPositionBelowRect(rect);
    menuOpen = true;
  }

  // Keyboard affordance on the drag surface (role="button"): Enter/Space opens
  // the same below-widget menu. Arrow keys still reorder via `moveByKey`.
  function surfaceKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenuBelowHost();
      return;
    }
    moveByKey(e);
  }

  // Widget drag (slice 4b, `widgetDragSession.ts`): plain drops insert (the
  // insert line marks where); resting 350 ms on a foreign unit arms grouping
  // (Group frame); inside its own group a member reorders directly; the
  // workspace edge opens a new custom panel. A tap (no drag past 5 px) opens the
  // widget menu below the host (touch-friendly replacement for the inset buttons).
  function dragPointerDown(e: PointerEvent) {
    if (!$controller.editMode || widget.locked || e.button !== 0) return;
    if (placementLocked) {
      // In a locked group: no drag — a tap still opens the menu.
      beginPointerDrag({ event: e, shouldActivate: () => false, onMove: () => {}, onDrop: () => {}, onTap: openMenuBelowHost });
      return;
    }
    // Origin rect captured at pointerdown (design startDrag: drag.w/h +
    // offx/offy), BEFORE the origin lifts (display:none makes later reads zero).
    // `size` is layout px (offset*); `grabOffset` is visual px (client coords)
    // for the DragLayer ghost, which self-calibrates the zoom factor.
    const originRect = hostEl?.getBoundingClientRect();
    const size = hostEl ? { width: hostEl.offsetWidth || 120, height: hostEl.offsetHeight || 38 } : { width: 120, height: 38 };
    const grabOffset = originRect ? { x: e.clientX - originRect.left, y: e.clientY - originRect.top } : { x: 60, y: 19 };
    beginWidgetDrag({
      controller,
      event: e,
      widgetIds: [widget.id],
      ownUnitKey: widget.groupId ?? widget.id,
      reorderGroupId: widget.groupId ?? null,
      size,
      grabOffset,
      typeLabel: catalogLabel,
      onTap: openMenuBelowHost
    });
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

  // Display-only clamp while editing (see `resolveFloatingHeal`): entering
  // Customize shrinks the stage, and that transition must never move or persist
  // a stored position. Valid only for the stored x/y it was computed from.
  let viewClamp = $state<{ x: number; y: number; fromX: number; fromY: number } | null>(null);
  const displayRect = $derived.by(() => {
    const rect = widget.floatingRect;
    if (!rect) return null;
    if (viewClamp && viewClamp.fromX === rect.x && viewClamp.fromY === rect.y) {
      return { ...rect, x: viewClamp.x, y: viewClamp.y };
    }
    return rect;
  });

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

    // Start from where the floater is SHOWN (a display clamp may be in effect).
    const origin = displayRect ?? { x: 0, y: 0 };
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
      window.removeEventListener('pointercancel', onCancel);
      if (!dragging) {
        // A tap on the grip (no reposition) opens the widget menu — floating
        // chips have no drag surface, so the grip is their menu affordance too.
        if ($controller.editMode) openMenuBelowHost();
        return;
      }
      // Persist the clamped position on drag end.
      controller.dispatch({
        type: 'widget.move',
        widgetIds: [widget.id],
        zone: 'floating',
        floatingRect: { ...(widget.floatingRect ?? {}), x: pending.x, y: pending.y }
      });
    };

    // Same pointercancel guard as dragPointerDown: abort the gesture without
    // persisting a position, so an interrupted drag doesn't leave the window
    // listeners live for a later stray pointerup to act on. Also undo the
    // imperative style write from onMove — since nothing is dispatched, the
    // reactive `style` binding (keyed off unchanged widget.floatingRect) would
    // otherwise never revert the node to its last persisted position.
    const onCancel = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragging && hostEl) {
        hostEl.style.left = `${origin.x}px`;
        hostEl.style.top = `${origin.y}px`;
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  // Self-heal: on mount and on viewport/zone resize, re-clamp a persisted
  // position so a floater saved offscreen (e.g. after the window shrank)
  // reappears with a grabbable strip in view. While editing the clamp is
  // display-only (never dispatched): the edit-mode transition itself (edit bar,
  // preview frame) must not rewrite stored positions. Leaving edit mode re-heals
  // against the full stage.
  function healFloatingIntoView() {
    const rect = widget.floatingRect;
    if (!isFloating || !rect || !hostEl) return;
    const { persist, view } = resolveFloatingHeal(rect, floatingSize(), floatingViewport(), controller.editMode);
    viewClamp = view ? { ...view, fromX: rect.x, fromY: rect.y } : null;
    if (persist) controller.dispatch({ type: 'widget.move', widgetIds: [widget.id], zone: 'floating', floatingRect: persist });
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
    const origin = displayRect ?? { x: 0, y: 0 };
    const next = clampFloatingPosition({ x: origin.x + dx, y: origin.y + dy }, floatingSize(), floatingViewport());
    controller.dispatch({
      type: 'widget.move',
      widgetIds: [widget.id],
      zone: 'floating',
      floatingRect: { ...(widget.floatingRect ?? {}), x: next.x, y: next.y }
    });
  }

  // Origin LIFT (V14 follow-up): while this widget is being dragged, its origin
  // collapses out of the flow (design zone-unit `display:none` while dragging +
  // AxisGroup `draggingId`) — the widget visibly travels as the DragLayer ghost
  // instead of staying put. Neighbours reflow into the freed space, so the
  // insert line sits between the units as they will be after the drop.
  // Floating chips reposition live and never set controller drag.
  const lifted = $derived(
    !isFloating && $controller.drag?.kind === 'widget' && $controller.drag.widgetIds.includes(widget.id)
  );

  // Entering / leaving edit mode re-runs the heal for the new stage: display-only
  // while editing, and leaving drops the display clamp (the stored position is
  // shown again; it is only persisted if it is out of view of the full stage).
  const editing = $derived($controller.editMode);
  $effect(() => {
    void editing;
    if (!untrack(() => isFloating)) return;
    const raf = requestAnimationFrame(healFloatingIntoView);
    return () => cancelAnimationFrame(raf);
  });

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
  class:lifted
  data-widget-host
  data-widget={widget.id}
  data-widget-type={widget.type}
  data-size={size}
  role="group"
  style={isFloating && displayRect ? `left:${displayRect.x}px; top:${displayRect.y}px; z-index:${50 + widget.order};` : ''}
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
    <!-- Tap (no drag) opens the widget menu below the host; drag inserts / moves
         (rest on another widget to group). The single gesture is disambiguated
         by the 5px threshold in `beginWidgetDrag` (R16b: the inset
         size/close/⋯ buttons are gone). -->
    <div
      class="aw-widget-drag-surface"
      class:member={!!widget.groupId}
      role="button"
      tabindex="0"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label={placementLocked ? 'Widget actions' : widget.groupId ? 'Widget actions (drag to move out of group)' : 'Widget actions (drag to move)'}
      onpointerdown={dragPointerDown}
      onkeydown={surfaceKeydown}
    ></div>
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
  /* Origin lifted while dragging (design zone-unit + AxisGroup `display:none`):
     the widget travels as the DragLayer ghost; the freed space closes, so the
     insert line sits between the units as they will be after the drop. */
  .aw-widget-host.lifted {
    display: none;
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
  .aw-widget-drag-surface {
    position: absolute;
    inset: 0;
    z-index: 5;
    cursor: grab;
    /* Touch: none so a tap fires pointerup without the browser claiming the
       gesture for scroll/pan — the tap-vs-drag disambiguation needs the full
       pointer sequence on touch devices. */
    touch-action: none;
    border-radius: 10px;
    /* Subtle dashed outline sitting just outside the chip — no background fill
       (design overlay is a transparent grab layer, the dashed outline marks
       the unit). offset keeps it clear of the widget's own border. */
    outline: 1px dashed color-mix(in srgb, var(--aw-accent) 40%, transparent);
    outline-offset: 3px;
    background: transparent;
  }
  /* A grouped member's grab surface is a bare, borderless grab layer (design
     `memberOverlay`: transparent, inset:0, cursor:grab). The GROUP module draws
     the single dashed unit border in edit mode — members must NOT each carry the
     loose-widget dashed outline (V14a: that duplicated chrome is what made a
     group read as a row of separate widgets). A faint hover tint marks which
     member is grabbed without adding a per-member box. */
  .aw-widget-drag-surface.member {
    outline: none;
    outline-offset: 0;
    border-radius: 8px;
  }
  .aw-widget-drag-surface.member:hover {
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
  }
</style>
