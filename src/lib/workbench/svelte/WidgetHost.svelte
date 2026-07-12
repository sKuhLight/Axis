<script lang="ts">
  import { getWorkbenchContext } from './context';
  import {
    capWidgetSize,
    clampFloatingPosition,
    createCustomPanelFromWidgetsCommands,
    healFloatingRect,
    raiseFloatingOrder,
    selectVisibleWidgetsByZone,
    type DockRegionId,
    type WidgetInstance,
    type WidgetSize,
    type WorkbenchCommand
  } from '../core';
  import { onMount } from 'svelte';
  import ContextMenu from './ContextMenu.svelte';
  import {
    menuPositionBelowRect,
    menuPositionFromPointer,
    type WorkbenchMenuItem,
    type WorkbenchMenuPosition
  } from './contextMenu';
  import {
    anchoredWidgetIndex,
    pointerDistance,
    rectContainsPointer,
    widgetDropCommand,
    widgetDropIndex,
    widgetIndexForUnitIndex,
    zoneUnitWidgetCounts,
    type WorkbenchRect
  } from './drag';
  import { groupInsertIndex, groupHitArea } from './groupInsertion';
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
    },
    // The widget's "settings" surface is exactly the items above — size,
    // placement (move-to), and save. No widget type exposes per-widget custom
    // settings today, so there is nothing else to wire here. This explicit
    // danger item is the replacement for the removed inset × close button.
    {
      id: 'remove',
      label: 'Remove Widget',
      separatorBefore: true,
      danger: true,
      disabled: widget.locked,
      run: () => controller.dispatch({ type: 'widget.hide', widgetIds: [widget.id] })
    }
  ]);

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

  // Measured member rects for a group, in member order, excluding the widget
  // being dragged (it renders `display:none` while dragged, so its slot must not
  // count toward the insertion math — design `draggingId`).
  function memberRectsOf(groupEl: HTMLElement, groupWidgetIds: string[]): { id: string; rect: WorkbenchRect }[] {
    return groupWidgetIds
      .filter((id) => id !== widget.id)
      .map((id) => {
        const el = groupEl.querySelector<HTMLElement>(`[data-widget="${CSS.escape(id)}"]`);
        return el ? { id, rect: rectOf(el) } : null;
      })
      .filter((entry): entry is { id: string; rect: WorkbenchRect } => !!entry);
  }

  // Resolve an in-group insert (or same-group reorder) for the dragged widget at
  // a pointer. Returns the target group, the computed insertion index, and the
  // resulting member sequence. Ported from the design's group hover scan: every
  // group module is tested with its hit-area expanded ±8px/±4px (03-groups §3),
  // so a near-miss still targets the group. The index is measured against live
  // member rects EXCLUDING the lifted (display:none) dragged member and the
  // in-flow slot — the slot only ever pushes members away from the pointer, so
  // the index is reflow-stable without a snapshot.
  function groupInsertAt(
    x: number,
    y: number
  ): { groupId: string; index: number; memberOrder: string[]; zone: string; anchorOrder: number } | null {
    const layout = $controller.activeLayout;
    if (!layout) return null;
    const pointer = { x, y };
    for (const groupEl of Array.from(document.querySelectorAll<HTMLElement>('[data-widget-group]'))) {
      const groupId = groupEl.dataset.widgetGroup;
      if (!groupId) continue;
      const group = layout.widgetGroups[groupId];
      if (!group || group.locked) continue;
      const moduleRect = rectOf(groupEl);
      // A hidden module (collapsed panel, lifted unit) measures 0×0 — never a target.
      if (moduleRect.width <= 0 || moduleRect.height <= 0) continue;
      if (!rectContainsPointer(groupHitArea(moduleRect), pointer)) continue;
      const membersWithRects = memberRectsOf(groupEl, group.widgetIds);
      const index = groupInsertIndex(pointer, membersWithRects.map((m) => m.rect), 'horizontal');
      const remaining = membersWithRects.map((m) => m.id);
      const memberOrder = [...remaining.slice(0, index), widget.id, ...remaining.slice(index)];
      const anchor = group.widgetIds.map((id) => layout.widgets[id]).filter(Boolean).sort((a, b) => a.order - b.order)[0];
      return {
        groupId,
        index,
        memberOrder,
        zone: anchor?.zone ?? widget.zone,
        anchorOrder: anchor?.order ?? widget.order
      };
    }
    return null;
  }

  // Create a fresh group by dropping onto a LOOSE widget's centre band (design
  // create rule: pointer inside the target's middle 28% width). Outside that
  // band the drop is a plain zone insert next to it, not a group.
  function groupCreateAt(x: number, y: number): { command: WorkbenchCommand; rect: WorkbenchRect } | null {
    const layout = $controller.activeLayout;
    if (!layout || widget.groupId) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    // Never create a group from a widget already inside a group module here —
    // that path is handled as an insert by `groupInsertAt`.
    if (el?.closest<HTMLElement>('[data-widget-group]')) return null;
    const widgetEl = el?.closest<HTMLElement>('[data-widget-host]');
    const targetId = widgetEl?.dataset.widget;
    if (!widgetEl || !targetId || targetId === widget.id) return null;
    const target = layout.widgets[targetId];
    if (!target || target.locked || target.groupId) return null;
    // Centre 28% band (0.36 insets) of the target's width (design create rule).
    const r = widgetEl.getBoundingClientRect();
    if (x < r.left + r.width * 0.36 || x > r.right - r.width * 0.36) return null;
    return {
      command: {
        type: 'widget.group',
        widgetIds: [target.id, widget.id],
        zone: target.zone,
        // Anchor the new group where the TARGET currently sits (count of
        // non-moving zone widgets before it — `placeWidgets` splices into the
        // zone minus the moved ids, so the raw `target.order` would drift by
        // one whenever the dragged widget sat before the target).
        index: anchoredWidgetIndex(selectVisibleWidgetsByZone($controller.document, target.zone), [target.id, widget.id], target.order)
      },
      rect: rectOf(widgetEl)
    };
  }

  function rectOf(el: Element): WorkbenchRect {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
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

  // Top-level zone units under a zone element: loose widget hosts + group
  // modules, in DOM order. Nested member hosts (inside a module) and the
  // in-flow drag slot are NOT units; the lifted (display:none) dragged widget
  // is excluded so its empty slot never skews the midpoint math.
  function zoneUnitEls(zoneEl: HTMLElement): HTMLElement[] {
    return Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-widget-host], [data-widget-group]')).filter((item) => {
      if (item.dataset.widget != null && item.closest('[data-widget-group]')) return false;
      if (item.dataset.widget === widget.id) return false;
      return true;
    });
  }

  // Zone drop resolution: `index` is the UNIT index among visible top-level
  // units (what the in-flow gap renders against — design `overIndex`). It is
  // converted to a widget-order index only at drop time.
  function widgetDropAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>('[data-zone]');
    const zone = zoneEl?.dataset.zone;
    if (!zone || !zoneEl) return null;
    const orientation = zone === 'rail' ? 'vertical' : 'horizontal';
    const index = widgetDropIndex({ x, y }, zoneUnitEls(zoneEl).map(rectOf), orientation);
    if (zone === 'floating') {
      const root = zoneEl.getBoundingClientRect();
      return { zone, index, floatingRect: { x: x - root.left, y: y - root.top } };
    }
    return { zone, index };
  }

  // Single source of truth for what a drop at (x,y) does. Priority (design §7):
  // in-group insert/reorder → group-create on a loose widget's centre band →
  // plain zone insert → new-panel workspace edge. The pull-OUT case is just a
  // plain zone drop that resolves outside the member's group; the reducer's
  // `detachPartialGroupMembers` handles the detach (regression-tested).
  function resolveDropAt(x: number, y: number): { command: WorkbenchCommand } | { edgeDrop: { region: DockRegionId } } | null {
    const insert = groupInsertAt(x, y);
    if (insert) {
      // Same-group drop = reorder (no detach); foreign/loose = insert. Both are
      // `widget.group` with an explicit member sequence, so neither routes
      // through `widget.move` / detach. The zone index keeps the group BLOCK
      // anchored where it currently sits (design zone re-numbering) — without
      // it, `placeWidgets` would append the whole group to the end of the zone.
      return {
        command: {
          type: 'widget.group',
          groupId: insert.groupId,
          widgetIds: insert.memberOrder,
          memberOrder: insert.memberOrder,
          zone: insert.zone as WidgetInstance['zone'],
          index: anchoredWidgetIndex(
            selectVisibleWidgetsByZone($controller.document, insert.zone),
            insert.memberOrder,
            insert.anchorOrder
          )
        }
      };
    }
    const groupCreate = groupCreateAt(x, y);
    if (groupCreate) return { command: groupCreate.command };
    const target = widgetDropAt(x, y);
    if (target) {
      // Unit index → widget-order index (a 3-member group before the gap
      // counts 3), computed against the zone's widgets minus the dragged one —
      // matching the reducer's `placeWidgets` exclusion.
      const counts = zoneUnitWidgetCounts(selectVisibleWidgetsByZone($controller.document, target.zone), [widget.id]);
      return {
        command: widgetDropCommand([widget.id], {
          zone: target.zone,
          index: widgetIndexForUnitIndex(counts, target.index),
          floatingRect: target.floatingRect
        })
      };
    }
    const edge = workspaceEdgeDropAt(x, y);
    return edge ? { edgeDrop: { region: edge.region } } : null;
  }

  function dragPointerDown(e: PointerEvent) {
    if (!$controller.editMode || widget.locked || e.button !== 0) return;
    const startedAt = { x: e.clientX, y: e.clientY };
    // Origin rect captured at pointerdown (design startDrag: drag.w/h +
    // offx/offy) — it sizes the in-flow slots and anchors the full-size ghost.
    // Captured BEFORE the origin lifts (display:none makes later reads zero).
    // `size` is layout px (offset*) so in-flow slots stay correct under an
    // ancestor CSS zoom; `grabOffset` is visual px (client coords) for the
    // DragLayer ghost, which self-calibrates the zoom factor.
    const originRect = hostEl?.getBoundingClientRect();
    const size = hostEl ? { width: hostEl.offsetWidth || 120, height: hostEl.offsetHeight || 38 } : { width: 120, height: 38 };
    const grabOffset = originRect ? { x: e.clientX - originRect.left, y: e.clientY - originRect.top } : { x: 60, y: 19 };
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      const pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragging && pointerDistance(startedAt, pointer) < 5) return;
      dragging = true;
      // Setting the drag state lifts the origin (display:none) on the NEXT
      // flush; the very first tick therefore measures pre-lift geometry, which
      // self-corrects one pointermove later — same ordering as the design's
      // startDrag → pointermove sequence.
      const base = { kind: 'widget' as const, widgetIds: [widget.id], startedAt, pointer, size, grabOffset };
      const insert = groupInsertAt(pointer.x, pointer.y);
      const create = insert ? null : groupCreateAt(pointer.x, pointer.y);
      const target = insert || create ? null : widgetDropAt(pointer.x, pointer.y);
      const edgeDrop = insert || create || target ? null : workspaceEdgeDropAt(pointer.x, pointer.y);
      controller.setDrag({
        ...base,
        targetLabel: insert
          ? insert.groupId === widget.groupId ? 'Reorder in group' : 'Place in group'
          : create
            ? 'Group widgets'
            : target
              ? target.zone
              : edgeDrop
                ? `New panel in ${edgeDrop.region}`
                : undefined,
        previewRect: create?.rect ?? edgeDrop?.rect,
        previewKind: create ? 'group' : edgeDrop ? 'zone' : undefined,
        groupInsert: insert ? { groupId: insert.groupId, index: insert.index } : undefined,
        zoneInsert: target ? { zone: target.zone, index: target.index } : undefined
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) {
        const resolved = resolveDropAt(ev.clientX, ev.clientY);
        if (resolved && 'command' in resolved) controller.dispatch(resolved.command);
        else if (resolved && 'edgeDrop' in resolved) {
          controller.dispatchMany(
            createCustomPanelFromWidgetsCommands($controller.document, {
              widgetIds: [widget.id],
              title: 'Custom Panel',
              region: resolved.edgeDrop.region
            })
          );
        }
        controller.setDrag(null);
      } else {
        // A tap that never crossed the drag threshold opens the widget menu
        // below the host (touch-friendly replacement for the inset buttons).
        openMenuBelowHost();
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

  // Origin LIFT (V14 follow-up): while this widget is being dragged, its origin
  // collapses out of the flow (design zone-unit `display:none` while dragging +
  // AxisGroup `draggingId`) — the widget visibly travels as the DragLayer ghost
  // instead of staying put. Neighbours reflow into the freed space, which is
  // also what makes the in-flow insertion slot read as the true post-drop
  // layout. Floating chips reposition live and never set controller drag.
  const lifted = $derived(
    !isFloating && $controller.drag?.kind === 'widget' && $controller.drag.widgetIds.includes(widget.id)
  );

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
    <!-- Tap (no drag) opens the widget menu below the host; drag reorders/moves.
         The single gesture is disambiguated by the 5px threshold in
         `dragPointerDown` (R16b: the inset size/close/⋯ buttons are gone). -->
    <div
      class="aw-widget-drag-surface"
      class:member={!!widget.groupId}
      role="button"
      tabindex="0"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label={widget.groupId ? 'Widget actions (drag to move out of group)' : 'Widget actions (drag to move)'}
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
     the widget travels as the DragLayer ghost; the freed space closes so the
     in-flow slot previews the true post-drop layout. */
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
