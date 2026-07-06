<script lang="ts">
  import WidgetHost from './WidgetHost.svelte';
  import { getWorkbenchContext } from './context';
  import ContextMenu from './ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { pointerDistance, widgetDropCommand, widgetDropIndex, type WorkbenchRect } from './drag';
  import { createWidgetTemplateFromGroup } from './library';
  import { nextOrderedIndex, WIDGET_ZONE_MOVE_OPTIONS } from './moveAlternatives';
  import { createCustomPanelFromWidgetsCommands, type DockRegionId, type WidgetInstance, type WidgetSize } from '../core';

  let { groupId, forcedSize }: { groupId: string; forcedSize?: WidgetSize } = $props();
  const { controller } = getWorkbenchContext();
  const group = $derived($controller.activeLayout?.widgetGroups[groupId]);
  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });

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
      separatorBefore: true,
      disabled: !group || group.locked,
      run: () => group && controller.dispatch({ type: 'widget.ungroup', groupId: group.id })
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
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      const pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragging && pointerDistance(startedAt, pointer) < 5) return;
      dragging = true;
      const target = widgetDropAt(pointer.x, pointer.y);
      const preview = widgetPreviewAt(pointer.x, pointer.y);
      const edgeDrop = !target ? workspaceEdgeDropAt(pointer.x, pointer.y) : null;
      controller.setDrag({
        kind: 'widget',
        widgetIds: group.widgetIds,
        startedAt,
        pointer,
        targetLabel: target ? target.zone : edgeDrop ? `New panel in ${edgeDrop.region}` : undefined,
        previewRect: preview?.rect ?? edgeDrop?.rect,
        previewKind: preview?.kind ?? (edgeDrop ? 'zone' : undefined),
        previewOrientation: preview?.orientation
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging && group) {
        const target = widgetDropAt(ev.clientX, ev.clientY);
        const edgeDrop = !target ? workspaceEdgeDropAt(ev.clientX, ev.clientY) : null;
        if (target) controller.dispatch(widgetDropCommand(group.widgetIds, target));
        else if (edgeDrop) {
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
  <div class="aw-widget-group" data-widget-group={group.id} role="group" oncontextmenu={openMenu}>
    {#if $controller.editMode && !group.locked}
      <!-- Whole-group grip is in-flow (a stretched column at the module's left
           edge — design AxisGroup grip), so it never escapes the module box. -->
      <button class="aw-group-grip" type="button" title="Move group" onpointerdown={dragPointerDown} onkeydown={moveByKey}>⋮</button>
      <!-- Group edit chrome is INSET into the module's top-right corner (V13b: no
           negative offsets that bleed over the neighbouring unit or the workbench
           chrome). -->
      <div class="aw-group-edit">
        <button
          class="aw-group-edit-btn"
          type="button"
          title="Ungroup widgets"
          onclick={() => controller.dispatch({ type: 'widget.ungroup', groupId: group.id })}
        >⧉</button>
        <button class="aw-group-edit-btn" type="button" title="Group actions" aria-haspopup="menu" aria-expanded={menuOpen} onclick={openButtonMenu}>⋯</button>
      </div>
    {/if}
    {#each group.widgetIds as widgetId, index (widgetId)}
      {@const widget = $controller.activeLayout?.widgets[widgetId]}
      {#if widget}
        {#if index > 0}<span class="aw-widget-divider"></span>{/if}
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
  /* Hover-during-drag: while a drag hovers a group, the border swaps to full
     accent (design border-color swap from --aw-border to --aw-accent when an
     insert index is active). */
  :global(.aw-root.aw-dragging-widget) .aw-widget-group:hover {
    border-color: var(--aw-accent);
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
  /* Group edit chrome is INSET into the module's own top-right corner (design
     01-shell §5 anchors affordances to their unit; V13b: no negative offsets
     that escape the module into the neighbouring unit or the workbench chrome).
     A subtle backdrop keeps the glyphs legible over the grouped chips. */
  .aw-group-edit {
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
  .aw-group-edit-btn {
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
  .aw-group-edit-btn:hover {
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
