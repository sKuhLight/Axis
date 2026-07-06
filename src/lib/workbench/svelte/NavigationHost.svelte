<script lang="ts">
  import { getWorkbenchContext } from './context';
  import { selectVisibleNavigationEntries, type WorkbenchCommand } from '../core';
  import { createFailedActionPanelCommand, createMissingActionPanelCommand } from './actions';
  import ContextMenu from './ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './contextMenu';
  import { canHideNavigationEntry, canMoveNavigationEntry, navigationEntryIndex } from './navigation';

  const { controller, registry } = getWorkbenchContext();
  const entries = $derived(selectVisibleNavigationEntries($controller.document));
  // Active-section tint (01-shell.md §9). The app registers a navigation-state
  // provider on the registry (renderRegistry `registerNavigationState`); we read
  // it here inside a $derived so it re-resolves whenever the document — or any
  // reactive source the provider reads (editor runes) — changes. Keyed by entry
  // id; entries with no provider (or no active concept) resolve to false.
  const activeEntryId = $derived.by<string | null>(() => {
    void $controller; // track controller/document changes
    return entries.find((entry) => registry.isNavigationEntryActive(entry.id))?.id ?? null;
  });
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

  async function runNavigation(entry: (typeof entries)[number]): Promise<void> {
    const target = entry.target;
    if (!target) return;
    const result = await registry.runActionResult(target.command, {
      controller,
      source: 'navigation',
      entry,
      args: target.args
    });
    if (!result.handled) {
      controller.dispatch(createMissingActionPanelCommand($controller.document, target.command, { title: entry.label ?? target.command }));
    } else if (!result.success) {
      controller.dispatch(
        createFailedActionPanelCommand($controller.document, target.command, result.error.message, {
          title: `${entry.label ?? target.command} Error`
        })
      );
    }
  }

  function openMenu(entry: (typeof entries)[number], event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    menuEntryId = entry.id;
    menuPosition = menuPositionFromPointer(event);
    menuOpen = true;
  }
</script>

<nav class="aw-nav" data-aw-nav data-nav-mode={$controller.activeLayout?.navigation.mode ?? 'side'}>
  {#each entries as entry (entry.id)}
    {@const Component = registry.navigation(entry.id)}
    {#if Component}
      <!-- V13c: the rail carries no per-entry hover controls (drag/hide/menu
           buttons). Reorder / hide / nav-mode remain reachable via the entry's
           right-click context menu (openMenu below), which is the single path
           now. -->
      <div
        class="aw-nav-entry"
        class:active={activeEntryId === entry.id}
        data-nav-entry={entry.id}
        data-nav-active={activeEntryId === entry.id ? 'true' : undefined}
        data-fixed={entry.fixedSlot ?? 'none'}
        role="group"
        oncontextmenu={(event) => openMenu(entry, event)}
      >
        <Component
          entry={entry}
          active={activeEntryId === entry.id}
          dispatch={(command: WorkbenchCommand) => controller.dispatch(command)}
          runAction={() => runNavigation(entry)}
          editMode={$controller.editMode}
        />
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
  /* Bottom-nav mode (design §9): entries lay out horizontally. Directive 2 — the
     bar must NEVER scroll horizontally, so this row never gets `overflow-x:auto`.
     Entries are icon-only here (label hidden below) and shrink flexibly so a
     handful of entries always fit; the container clips as a last resort rather
     than paint a scrollbar. */
  .aw-nav[data-nav-mode='bottom'] {
    flex-direction: row;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    flex-wrap: nowrap;
  }
  .aw-nav[data-nav-mode='bottom'] .aw-nav-entry {
    width: 46px;
    flex: 0 1 46px;
    min-width: 40px;
  }
  /* Icon-only in the bottom bar: the entry component's label is dropped so the
     row stays compact and never overflows the bar (the glyph + tooltip carry it). */
  .aw-nav[data-nav-mode='bottom'] :global(.axis-nav-entry .lbl) {
    display: none;
  }
  .aw-nav[data-nav-mode='bottom'] :global(.axis-nav-entry) {
    height: 44px;
    gap: 0;
  }
  /* In the vertical rail a footer entry (e.g. account) sinks to the bottom;
     in the horizontal bottom nav it trails to the right instead. */
  .aw-nav[data-nav-mode='bottom'] .aw-nav-entry[data-fixed='rail.footer'] {
    margin-top: 0;
    margin-left: auto;
  }
  .aw-nav-entry {
    position: relative;
    min-width: 0;
  }
  .aw-nav-entry[data-fixed='rail.footer'] {
    margin-top: auto;
  }
  /* Phone: the SIDE-mode nav lives in the bottom-sheet rail and lays out as a
     horizontal row of full-size icon+label entries. This must NOT touch the
     bottom-nav-mode row — that stays icon-only and never scrolls (Directive 2 /
     V14d), so it is explicitly excluded via `:not([data-nav-mode='bottom'])`. */
  @media (max-width: 760px) {
    .aw-nav:not([data-nav-mode='bottom']) {
      flex: 1;
      flex-direction: row;
      overflow-x: auto;
    }
    .aw-nav:not([data-nav-mode='bottom']) .aw-nav-entry {
      width: 56px;
      flex: none;
    }
    /* V14d — bottom-nav on phone: persistent, icon-only, no horizontal scroll.
       Entries shrink flexibly so a handful always fit the bar width; the label is
       already hidden by the bottom-mode rule above (carried by title/aria). */
    .aw-nav[data-nav-mode='bottom'] {
      flex: 1 1 auto;
    }
  }
</style>
