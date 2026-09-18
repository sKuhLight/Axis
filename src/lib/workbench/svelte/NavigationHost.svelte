<script lang="ts">
  import { getWorkbenchContext } from './context';
  import { selectVisibleNavigationEntries, type WorkbenchCommand } from '../core';
  import { createFailedActionPanelCommand, createMissingActionPanelCommand } from './actions';
  import { navigationEntryActive, navigationEntryCommand } from './navigation';

  const { controller, registry } = getWorkbenchContext();
  const entries = $derived(selectVisibleNavigationEntries($controller.document));
  // Page and action state are independent: an overlay action can remain tinted
  // while the page beneath it is active. Read providers inside the derived so
  // their reactive sources are tracked alongside document changes.
  const activeEntryIds = $derived.by<Set<string>>(() => {
    void $controller; // track controller/document changes
    const layout = $controller.activeLayout;
    return new Set(
      entries
        .filter((entry) => navigationEntryActive(entry, layout, (entryId) => registry.isNavigationEntryActive(entryId)))
        .map((entry) => entry.id)
    );
  });
  function addPage(): void {
    const count = $controller.pages.length;
    controller.addPage({ label: `Page ${count + 1}` });
  }

  async function runNavigation(entry: (typeof entries)[number]): Promise<void> {
    // Page-bound entries activate their page — the generic behavior; entries
    // without a page binding run the app-provided navigation action.
    const pageCommand = navigationEntryCommand(entry);
    if (pageCommand) {
      controller.dispatch(pageCommand);
      return;
    }
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

</script>

<nav class="aw-nav" data-aw-nav data-nav-mode={$controller.activeLayout?.navigation.mode ?? 'side'}>
  {#each entries as entry (entry.id)}
    {@const Component = registry.navigation(entry.id)}
    {#if Component}
      <div
        class="aw-nav-entry"
        class:active={activeEntryIds.has(entry.id)}
        data-nav-entry={entry.id}
        data-nav-active={activeEntryIds.has(entry.id) ? 'true' : undefined}
        data-fixed={entry.fixedSlot ?? 'none'}
        role="group"
      >
        <Component
          entry={entry}
          active={activeEntryIds.has(entry.id)}
          dispatch={(command: WorkbenchCommand) => controller.dispatch(command)}
          runAction={() => runNavigation(entry)}
          editMode={$controller.editMode}
        />
      </div>
    {/if}
  {/each}
  <!-- Pages: trailing "+" affordance (edit mode only, side rail and bottom nav)
       adds an empty default page and activates it. -->
  {#if $controller.editMode}
    <button class="aw-nav-add-page" type="button" title="Add Page" aria-label="Add Page" data-nav-add-page onclick={addPage}>+</button>
  {/if}
</nav>

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
  /* Pages: the edit-mode "+" (add page) affordance. In the vertical rail it is a
     full-width row like an entry; in bottom-nav mode it shrinks to entry width. */
  .aw-nav-add-page {
    flex: none;
    min-width: 0;
    height: 32px;
    border: 1px dashed var(--aw-border-3);
    border-radius: 8px;
    background: transparent;
    color: var(--aw-text-muted);
    cursor: pointer;
    font: 700 14px/1 var(--aw-font-ui);
  }
  .aw-nav-add-page:hover {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-nav[data-nav-mode='bottom'] .aw-nav-add-page {
    width: 40px;
    flex: 0 1 40px;
    height: 32px;
    align-self: center;
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
