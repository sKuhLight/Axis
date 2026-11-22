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
  import { createWidgetTemplateFromGroup } from './library';
  import { nextOrderedIndex, WIDGET_ZONE_MOVE_OPTIONS } from './moveAlternatives';
  import { groupWithMenuItem } from './widgetDrop';
  import { beginWidgetDrag } from './widgetDragSession';
  import { type WidgetInstance, type WidgetSize } from '../core';

  let { groupId, forcedSize }: { groupId: string; forcedSize?: WidgetSize } = $props();
  const { controller, registry } = getWorkbenchContext();
  const group = $derived($controller.activeLayout?.widgetGroups[groupId]);
  let groupEl = $state<HTMLElement | null>(null);
  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });

  // ── Drag-state derivations ───────────────────────────────────────────────
  const drag = $derived($controller.drag);
  const draggingIds = $derived(drag?.kind === 'widget' ? drag.widgetIds : []);
  // Whole-group drag lifts the entire module out of the flow (design zone-unit
  // `display:none` while dragging) — the group travels as the DragLayer ghost
  // and the zone closes the freed space.
  const lifted = $derived(!!group && group.widgetIds.length > 0 && group.widgetIds.every((id) => draggingIds.includes(id)));
  // A member is being reordered inside this group (slice 4b: the insert LINE
  // is drawn by the DragLayer; the module border goes full accent).
  const reorderTarget = $derived(drag?.kind === 'widget' && !!group && drag.groupInsert?.groupId === group.id);
  // Dividers between the VISIBLE members (a dragged member is lifted out).
  const memberRows = $derived.by(() => {
    if (!group) return [] as { id: string; showDiv: boolean }[];
    let visible = 0;
    return group.widgetIds.map((id) => {
      if (draggingIds.includes(id)) return { id, showDiv: false };
      const row = { id, showDiv: visible > 0 };
      visible += 1;
      return row;
    });
  });

  // The host's catalog label for a widget type, for menus and chips.
  function catalogLabel(type: string): string | undefined {
    return registry.canonicalWidgets().find((spec) => spec.type === type)?.label;
  }

  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => [
    // Slice 4b: merge the whole group with a neighbour in this zone (a group
    // neighbour takes the members in; a loose one forms a new group with them).
    ...(group
      ? [
          groupWithMenuItem({
            doc: () => controller.document,
            self: { key: group.id, widgetIds: group.widgetIds },
            movingIds: group.widgetIds,
            locked: group.locked,
            typeLabel: catalogLabel,
            isAvailable: (type) => registry.widgetSizing?.isAvailable?.(type) ?? true,
            dispatch: (command) => controller.dispatch(command)
          })
        ]
      : []),
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

  // Whole-group drag (slice 4b, `widgetDragSession.ts`): a plain drop inserts
  // the group (insert line); resting 350 ms on a foreign unit merges it there
  // (Group frame); the workspace edge opens a new custom panel. A tap on the
  // grip (no drag) opens the group menu below the module.
  function dragPointerDown(e: PointerEvent) {
    if (!$controller.editMode || !group || group.locked || e.button !== 0) return;
    // Origin rect captured at pointerdown, BEFORE the module lifts to
    // display:none (design startDrag drag.w/h + offx/offy). `size` is layout px;
    // `grabOffset` is visual px (ghost anchoring).
    const originRect = groupEl?.getBoundingClientRect();
    const size = groupEl
      ? { width: groupEl.offsetWidth || 150, height: groupEl.offsetHeight || 38 }
      : { width: 150, height: 38 };
    const grabOffset = originRect ? { x: e.clientX - originRect.left, y: e.clientY - originRect.top } : { x: 75, y: 19 };
    beginWidgetDrag({
      controller,
      event: e,
      widgetIds: [...group.widgetIds],
      ownUnitKey: group.id,
      size,
      grabOffset,
      typeLabel: catalogLabel,
      onTap: openMenuBelowGroup
    });
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
    class:insert-target={reorderTarget}
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
    <!-- Members with the design AxisGroup flow: dividers between the visible
         members; a dragged member is lifted out of the flow. A reorder inside
         the group is marked by the DragLayer's insert line (slice 4b). -->
    {#each memberRows as row (row.id)}
      {@const widget = $controller.activeLayout?.widgets[row.id]}
      {#if widget}
        {#if row.showDiv}<span class="aw-widget-divider"></span>{/if}
        <WidgetHost {widget} {forcedSize} />
      {/if}
    {/each}
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
  /* Reorder-active: while a member is dragged inside its own group (an insert
     index is live — design border-color swap from --aw-border to --aw-accent),
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
