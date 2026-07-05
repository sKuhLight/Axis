<script lang="ts">
  import { getWorkbenchContext } from './context';
  import { selectVisibleNavigationEntries, type WorkbenchCommand } from '../core';
  import { createMissingActionPanelCommand } from './actions';
  import ContextMenu from './ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { pointerDistance, widgetDropIndex } from './drag';
  import { canHideNavigationEntry, canMoveNavigationEntry, navigationEntryIndex } from './navigation';

  const { controller, registry } = getWorkbenchContext();
  const entries = $derived(selectVisibleNavigationEntries($controller.document));
  let draggingEntry = $state<string | null>(null);
  let menuOpen = $state(false);
  let menuPosition = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  let menuEntryId = $state<string | null>(null);
  const menuEntry = $derived(entries.find((entry) => entry.id === menuEntryId));
  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => {
    if (!menuEntry) return [];
    const index = navigationEntryIndex(entries, menuEntry.id);
    const movable = canMoveNavigationEntry(menuEntry);
    const hideable = canHideNavigationEntry(menuEntry);
    const mode = $controller.activeLayout?.navigation.mode ?? 'side';
    return [
      {
        id: 'open',
        label: `Open ${menuEntry.label ?? menuEntry.id}`,
        run: () => runNavigation(menuEntry)
      },
      {
        id: 'move-up',
        label: mode === 'bottom' ? 'Move Left' : 'Move Up',
        disabled: !$controller.editMode || !movable || index <= 0,
        run: () => controller.dispatch({ type: 'navigation.move', entryId: menuEntry.id, index: Math.max(0, index - 1) })
      },
      {
        id: 'move-down',
        label: mode === 'bottom' ? 'Move Right' : 'Move Down',
        disabled: !$controller.editMode || !movable || index < 0 || index >= entries.length - 1,
        run: () => controller.dispatch({ type: 'navigation.move', entryId: menuEntry.id, index: index + 1 })
      },
      {
        id: 'mode',
        label: mode === 'bottom' ? 'Use Side Navigation' : 'Use Bottom Navigation',
        separatorBefore: true,
        run: () => controller.dispatch({ type: 'navigation.mode', mode: mode === 'bottom' ? 'side' : 'bottom' })
      },
      {
        id: 'hide',
        label: 'Hide Navigation Entry',
        danger: true,
        separatorBefore: true,
        disabled: !$controller.editMode || !hideable,
        run: () => controller.dispatch({ type: 'navigation.hide', entryId: menuEntry.id })
      }
    ];
  });

  function navDropIndex(x: number, y: number, entryId: string): number {
    const nav = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-aw-nav]');
    if (!nav) return entries.findIndex((entry) => entry.id === entryId);
    const vertical = nav.dataset.navMode !== 'bottom';
    const itemEls = Array.from(nav.querySelectorAll<HTMLElement>('[data-nav-entry]')).filter((item) => item.dataset.navEntry !== entryId);
    const itemRects = itemEls.map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    return widgetDropIndex({ x, y }, itemRects, vertical ? 'vertical' : 'horizontal');
  }

  function dragDown(entryId: string, e: PointerEvent) {
    if (!$controller.editMode || e.button !== 0) return;
    const startedAt = { x: e.clientX, y: e.clientY };
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      const pointer = { x: ev.clientX, y: ev.clientY };
      if (!dragging && pointerDistance(startedAt, pointer) < 5) return;
      dragging = true;
      draggingEntry = entryId;
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) {
        controller.dispatch({ type: 'navigation.move', entryId, index: navDropIndex(ev.clientX, ev.clientY, entryId) });
      }
      draggingEntry = null;
    };

    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function runNavigation(entry: (typeof entries)[number]): void {
    const target = entry.target;
    if (!target) return;
    const handled = registry.runAction(target.command, {
      controller,
      source: 'navigation',
      entry,
      args: target.args
    });
    if (!handled) {
      controller.dispatch(createMissingActionPanelCommand($controller.document, target.command, { title: entry.label ?? target.command }));
    }
  }

  function openMenu(entry: (typeof entries)[number], event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    menuEntryId = entry.id;
    menuPosition = menuPositionFromPointer(event);
    menuOpen = true;
  }

  function openButtonMenu(entry: (typeof entries)[number], event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menuEntryId = entry.id;
    menuPosition = { x: rect.right - 8, y: rect.bottom + 6 };
    menuOpen = true;
  }
</script>

<nav class="aw-nav" data-aw-nav data-nav-mode={$controller.activeLayout?.navigation.mode ?? 'side'}>
  {#each entries as entry (entry.id)}
    {@const Component = registry.navigation(entry.id)}
    {#if Component}
      <div
        class="aw-nav-entry"
        class:dragging={draggingEntry === entry.id}
        data-nav-entry={entry.id}
        data-fixed={entry.fixedSlot ?? 'none'}
        role="group"
        oncontextmenu={(event) => openMenu(entry, event)}
      >
        <Component
          entry={entry}
          dispatch={(command: WorkbenchCommand) => controller.dispatch(command)}
          runAction={() => runNavigation(entry)}
          editMode={$controller.editMode}
        />
        {#if $controller.editMode && canMoveNavigationEntry(entry)}
          <div class="aw-nav-drag" role="button" tabindex="0" aria-label="Move navigation entry" onpointerdown={(e) => dragDown(entry.id, e)}></div>
          <button class="aw-nav-hide" type="button" title="Hide navigation entry" onclick={() => controller.dispatch({ type: 'navigation.hide', entryId: entry.id })}>×</button>
        {/if}
        <button
          class="aw-nav-menu"
          type="button"
          title="Navigation actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen && menuEntryId === entry.id}
          onclick={(event) => openButtonMenu(entry, event)}
        >⋯</button>
      </div>
    {/if}
  {/each}
</nav>

<ContextMenu open={menuOpen} position={menuPosition} items={menuItems} label="Navigation actions" onClose={() => (menuOpen = false)} />

<style>
  .aw-nav {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .aw-nav-entry {
    position: relative;
    min-width: 0;
  }
  .aw-nav-entry.dragging {
    opacity: 0.38;
  }
  .aw-nav-entry[data-fixed='rail.footer'] {
    margin-top: auto;
  }
  .aw-nav-drag {
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: 9px;
    outline: 1px dashed color-mix(in srgb, var(--aw-accent) 40%, transparent);
    outline-offset: 2px;
    cursor: grab;
  }
  .aw-nav-hide {
    position: absolute;
    top: -5px;
    right: -5px;
    z-index: 4;
    width: 17px;
    height: 17px;
    border: 1px solid var(--aw-border);
    border-radius: 50%;
    background: var(--aw-surface);
    color: var(--aw-text-muted);
    cursor: pointer;
    font-size: 10px;
  }
  .aw-nav-menu {
    position: absolute;
    right: -5px;
    bottom: -5px;
    z-index: 4;
    width: 17px;
    height: 17px;
    border: 1px solid var(--aw-border);
    border-radius: 50%;
    background: var(--aw-surface);
    color: var(--aw-text-muted);
    cursor: pointer;
    font-size: 10px;
    opacity: 0;
    pointer-events: none;
  }
  .aw-nav-entry:hover .aw-nav-menu,
  .aw-nav-entry:focus-within .aw-nav-menu,
  :global(.aw-root.aw-editing) .aw-nav-menu {
    opacity: 1;
    pointer-events: auto;
  }
  .aw-nav-menu:hover {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  @media (max-width: 760px) {
    .aw-nav {
      flex: 1;
      flex-direction: row;
      overflow-x: auto;
    }
    .aw-nav-entry {
      width: 56px;
      flex: none;
    }
  }
</style>
