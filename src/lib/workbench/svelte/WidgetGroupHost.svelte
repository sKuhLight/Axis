<script lang="ts">
  import WidgetHost from './WidgetHost.svelte';
  import { getWorkbenchContext } from './context';
  import ContextMenu from './ContextMenu.svelte';
  import {
    menuPositionBelowRect,
    menuPositionFromPointer,
    type WorkbenchMenuItem,
    type WorkbenchMenuPosition
  } from './contextMenu';
  import {
    pointerDistance,
    widgetDropCommand,
    widgetDropIndex,
    widgetIndexForUnitIndex,
    zoneUnitWidgetCounts,
    type WorkbenchRect
  } from './drag';
  import { createWidgetTemplateFromGroup } from './library';
  import { nextOrderedIndex, WIDGET_ZONE_MOVE_OPTIONS } from './moveAlternatives';
  import {
    createCustomPanelFromWidgetsCommands,
    selectVisibleWidgetsByZone,
    type DockRegionId,
    type WidgetInstance,
    type WidgetSize
  } from '../core';

  let { groupId, forcedSize }: { groupId: string; forcedSize?: WidgetSize } = $props();
  const { controller } = getWorkbenchContext();
  const group = $derived($controller.activeLayout?.widgetGroups[groupId]);
  let groupEl = $state<HTMLElement | null>(null);
  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });

  // ── Drag-state derivations (V14 follow-up: in-flow slot + origin lift) ──
  const drag = $derived($controller.drag);
  const draggingIds = $derived(drag?.kind === 'widget' ? drag.widgetIds : []);
  // Whole-group drag lifts the entire module out of the flow (design zone-unit
  // `display:none` while dragging) — the group travels as the DragLayer ghost
  // and the zone closes the freed space.
  const lifted = $derived(!!group && group.widgetIds.length > 0 && group.widgetIds.every((id) => draggingIds.includes(id)));
  // In-flow insertion slot (design AxisGroup `indIndex`): while a compatible
  // widget drag hovers this group, a REAL dashed spacer is spliced into the
  // module's flex flow at the live index — members physically move apart so the
  // preview shows the true post-drop layout (V14 follow-up: no overlay rect).
  const slotIndex = $derived(
    drag?.kind === 'widget' && group && drag.groupInsert?.groupId === group.id ? drag.groupInsert.index : -1
  );
  // Slot = the dragged unit's own size (design `phW/phH` = drag.w/h; layout px).
  const slotSize = $derived(drag?.kind === 'widget' && drag.size ? drag.size : { width: 120, height: 38 });
  // Design AxisGroup renderVals port: showInd/showDiv computed against the
  // VISIBLE member sequence (a lifted dragged member is display:none and must
  // neither count for the slot index nor leave a dangling divider). The divider
  // at the slot position is suppressed — the slot replaces it.
  const memberRows = $derived.by(() => {
    if (!group) return [] as { id: string; showInd: boolean; showDiv: boolean }[];
    let visible = 0;
    return group.widgetIds.map((id) => {
      if (draggingIds.includes(id)) return { id, showInd: false, showDiv: false };
      const row = { id, showInd: slotIndex === visible, showDiv: visible > 0 && slotIndex !== visible };
      visible += 1;
      return row;
    });
  });
  // Slot after the last member (design `endInd`: indIndex === members.length).
  const endInd = $derived.by(() => {
    if (!group || slotIndex < 0) return false;
    return slotIndex >= group.widgetIds.filter((id) => !draggingIds.includes(id)).length;
  });

  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => [
    ...WIDGET_ZONE_MOVE_OPTIONS.map((option, index): WorkbenchMenuItem => ({
      id: `move-${option.id}`,
      label: option.label,
      separatorBefore: index === 0,
      danger: option.id === 'hidden',
      disabled: !group || group.locked,
      run: () =>
        group &&
        controller.dispatch({
          type: 'widget.move',
          widgetIds: group.widgetIds,
          zone: option.id,
          floatingRect: option.id === 'floating' ? { x: 48, y: 72 } : undefined
        })
    })),
    {
      id: 'save',
      label: 'Save Group To Library',
      separatorBefore: true,
      disabled: !group || group.locked,
      run: saveGroupTemplate
    },
    {
      id: 'ungroup',
      label: 'Ungroup Widgets',
      disabled: !group || group.locked,
      run: () => group && controller.dispatch({ type: 'widget.ungroup', groupId: group.id })
    },
    // The group's "settings" surface is placement (move-to), save, and ungroup —
    // the group carries no size control today (members keep their own sizes), so
    // nothing else is wired. This explicit danger item replaces the removed inset
    // chrome: it hides every member, so the whole group leaves the layout.
    {
      id: 'remove',
      label: 'Remove Group',
      separatorBefore: true,
      danger: true,
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

  // Open the group menu anchored BELOW the whole module (R16b: touch-friendly
  // menu replaces the inset ungroup/⋯ buttons). Anchored on the module rect so
  // it drops under the entire group, not under the grip alone.
  function openMenuBelowGroup() {
    if (!groupEl) return;
    const rect = groupEl.getBoundingClientRect();
    menuPosition = menuPositionBelowRect(rect);
    menuOpen = true;
  }

  // Grip keyboard affordance: Enter/Space opens the group menu; arrows reorder
  // the whole module via `moveByKey`.
  function gripKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenuBelowGroup();
      return;
    }
    moveByKey(e);
  }

  function saveGroupTemplate() {
    if (!group) return;
    const template = createWidgetTemplateFromGroup($controller.document, group.id);
    if (template) controller.dispatch({ type: 'library.widget.save', template });
  }

  // Top-level zone units under a zone element: loose widget hosts + group
  // modules, in DOM order. Nested member hosts and this group itself (lifted
  // while dragging) are excluded, so the UNIT index aligns with the zone's
  // visible flow — the same index the zone's in-flow gap renders against.
  function zoneUnitEls(zoneEl: HTMLElement): HTMLElement[] {
    if (!group) return [];
    return Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-widget-host], [data-widget-group]')).filter((item) => {
      if (item.dataset.widgetGroup === group.id) return false;
      if (item.dataset.widget != null && item.closest('[data-widget-group]')) return false;
      return !item.dataset.widget || !group.widgetIds.includes(item.dataset.widget);
    });
  }

  function widgetDropAt(x: number, y: number) {
    if (!group) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>('[data-zone]');
    const zone = zoneEl?.dataset.zone;
    if (!zone || !zoneEl) return null;
    const orientation: 'horizontal' | 'vertical' = zone === 'rail' ? 'vertical' : 'horizontal';
    return { zone, index: widgetDropIndex({ x, y }, zoneUnitEls(zoneEl).map(rectOf), orientation) };
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

  function dragPointerDown(e: PointerEvent) {
    if (!$controller.editMode || !group || group.locked || e.button !== 0) return;
    const startedAt = { x: e.clientX, y: e.clientY };
    // Origin rect captured at pointerdown, BEFORE the module lifts to
    // display:none (design startDrag drag.w/h + offx/offy). `size` is layout px
    // (in-flow slot sizing); `grabOffset` is visual px (ghost anchoring).
    const originRect = groupEl?.getBoundingClientRect();
    const size = groupEl
      ? { width: groupEl.offsetWidth || 150, height: groupEl.offsetHeight || 38 }
      : { width: 150, height: 38 };
    const grabOffset = originRect ? { x: e.clientX - originRect.left, y: e.clientY - originRect.top } : { x: 75, y: 19 };
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      const pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragging && pointerDistance(startedAt, pointer) < 5) return;
      dragging = true;
      // Setting the drag state lifts the module (display:none) on the NEXT
      // flush; the first tick measures pre-lift geometry and self-corrects one
      // pointermove later (design startDrag → pointermove ordering).
      const base = { kind: 'widget' as const, widgetIds: group.widgetIds, startedAt, pointer, size, grabOffset };
      const target = widgetDropAt(pointer.x, pointer.y);
      const edgeDrop = !target ? workspaceEdgeDropAt(pointer.x, pointer.y) : null;
      controller.setDrag({
        ...base,
        targetLabel: target ? target.zone : edgeDrop ? `New panel in ${edgeDrop.region}` : undefined,
        previewRect: edgeDrop?.rect,
        previewKind: edgeDrop ? 'zone' : undefined,
        zoneInsert: target ? { zone: target.zone, index: target.index } : undefined
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging) {
        // A tap on the grip (no drag) opens the group menu below the module.
        openMenuBelowGroup();
        return;
      }
      if (dragging && group) {
        const target = widgetDropAt(ev.clientX, ev.clientY);
        const edgeDrop = !target ? workspaceEdgeDropAt(ev.clientX, ev.clientY) : null;
        if (target) {
          // Unit index → widget-order index against the zone minus this group's
          // own members (matching the reducer's `placeWidgets` exclusion).
          const counts = zoneUnitWidgetCounts(selectVisibleWidgetsByZone($controller.document, target.zone), group.widgetIds);
          controller.dispatch(
            widgetDropCommand(group.widgetIds, { zone: target.zone, index: widgetIndexForUnitIndex(counts, target.index) })
          );
        } else if (edgeDrop) {
          controller.dispatchMany(
            createCustomPanelFromWidgetsCommands($controller.document, {
              widgetIds: group.widgetIds,
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
    if (!$controller.editMode || !group || group.locked) return;
    const direction = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!direction) return;
    const layout = $controller.activeLayout;
    const anchor = group.widgetIds
      .map((id) => layout?.widgets[id])
      .filter((widget): widget is WidgetInstance => !!widget)
      .sort((a, b) => a.order - b.order)[0];
    if (!layout || !anchor) return;
    const units = Object.values(layout.widgets)
      .filter((item) => item.zone === anchor.zone)
      .reduce<{ id: string; order: number }[]>((acc, item) => {
        const id = item.groupId ?? item.id;
        if (acc.some((unit) => unit.id === id)) return acc;
        acc.push({ id, order: item.order });
        return acc;
      }, [])
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const currentIndex = units.findIndex((unit) => unit.id === group.id);
    if (currentIndex < 0) return;
    e.preventDefault();
    controller.dispatch({
      type: 'widget.move',
      widgetIds: group.widgetIds,
      zone: anchor.zone,
      index: nextOrderedIndex(currentIndex, direction as -1 | 1, units.length)
    });
  }
</script>

{#if group}
  <div
    bind:this={groupEl}
    class="aw-widget-group"
    class:lifted
    class:insert-target={slotIndex >= 0}
    data-widget-group={group.id}
    role="group"
    oncontextmenu={openMenu}
  >
    {#if $controller.editMode && !group.locked}
      <!-- Whole-group grip is in-flow (a stretched column at the module's left
           edge — design AxisGroup grip), so it never escapes the module box. It
           is both the drag handle and the menu affordance: a tap opens the group
           menu below the module, a drag moves the whole group (R16b — the inset
           ungroup/⋯ buttons are gone). -->
      <button
        class="aw-group-grip"
        type="button"
        title="Group actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Group actions (drag to move group)"
        onpointerdown={dragPointerDown}
        onkeydown={gripKeydown}
      >⋮</button>
    {/if}
    <!-- Members with the design AxisGroup flow: the insertion slot is a REAL
         in-flow spacer spliced between members at the live index (members move
         apart to make room — V14 follow-up), the divider at that index is
         suppressed, and a dragged member is lifted out of the flow. -->
    {#each memberRows as row (row.id)}
      {@const widget = $controller.activeLayout?.widgets[row.id]}
      {#if widget}
        {#if row.showInd}
          <span class="aw-group-slot" style="width:{slotSize.width}px; height:{slotSize.height}px;" data-drag-slot aria-hidden="true"></span>
        {/if}
        {#if row.showDiv}<span class="aw-widget-divider"></span>{/if}
        <WidgetHost {widget} {forcedSize} />
      {/if}
    {/each}
    {#if endInd}
      <span class="aw-group-slot" style="width:{slotSize.width}px; height:{slotSize.height}px;" data-drag-slot aria-hidden="true"></span>
    {/if}
  </div>
{/if}

<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} label="Widget group actions" onClose={() => (menuOpen = false)} />

<style>
  /* Design AxisGroup module chrome: bg --aw-bg-2, border 1px --aw-border, radius
     10, padding 0 2px, overflow visible so the grip + edit bubbles float above.
     The module is the ONLY chrome — members render borderless inside it (V14a). */
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
  /* In edit mode the WHOLE group reads as one bounded unit: a dashed accent
     border around the module (design edit-mode group treatment — the dashed teal
     box in the reference). Members inside carry no separate dashed chrome, so the
     group no longer looks like a row of loose widgets (V14a). */
  :global(.aw-root.aw-editing) .aw-widget-group {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--aw-accent) 55%, var(--aw-border));
  }
  /* Insert-active: while a drag targets this group (an insert index is live —
     design border-color swap from --aw-border to --aw-accent on indIndex>=0),
     the whole module border goes full accent. State-driven, not :hover — the
     hit-area is expanded ±8/±4 beyond the module box. */
  .aw-widget-group.insert-target {
    border-color: var(--aw-accent);
    border-style: solid;
  }
  /* Whole-group drag lifts the module out of the flow (design zone-unit
     display:none while dragging); it travels as the DragLayer ghost. */
  .aw-widget-group.lifted {
    display: none;
  }
  /* In-flow insertion slot (design AxisGroup indStyle: widget-sized, radius 9,
     1.5px dashed accent, accent-tinted fill, flex:none, margin 0 2px). A real
     flex child — inserting it is what pushes the members apart. */
  .aw-group-slot {
    flex: none;
    margin: 0 2px;
    border: 1.5px dashed var(--aw-accent);
    border-radius: 9px;
    background: color-mix(in srgb, var(--aw-accent) 16%, transparent);
    box-sizing: border-box;
    max-height: 100%;
  }
  .aw-group-grip {
    align-self: stretch;
    width: 18px;
    border: 0;
    border-right: 1px solid var(--aw-border);
    background: transparent;
    color: var(--aw-text-muted);
    cursor: grab;
    /* Touch: none so a tap fires pointerup without the browser claiming the
       gesture — tap opens the menu, drag moves the group. */
    touch-action: none;
    font-size: 13px;
  }
  .aw-group-grip:hover {
    color: var(--aw-accent);
  }
  .aw-widget-divider {
    width: 1px;
    align-self: stretch;
    margin: 8px 1px;
    background: var(--aw-border);
  }
</style>
