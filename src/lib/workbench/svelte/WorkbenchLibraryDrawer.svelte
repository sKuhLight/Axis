<script lang="ts">
  /**
   * Purpose-built Customize browser. The Edit ribbon opens this in one of two
   * views (R16 / AXIS-24 — reworked from the V13a panels/widgets split into a
   * searchable, sectioned drawer that matches the design's library pattern):
   *
   *   - `view="pages"`   → PAGES manager: create / rename / delete / reorder /
   *     jump-to the layout's pages (each page is its own dock arrangement), plus
   *     an "add panel to this page" section (saved panel templates + a new
   *     custom panel + hidden nav restore). Panels live on pages, so the old
   *     standalone panel browser folds in here.
   *   - `view="widgets"` → WIDGET browser: saved widget templates, the
   *     hidden-widget shelf, and the on-layout widgets you can hide.
   *
   * Both views carry a search field that filters every section at once. Saved
   * page LAYOUTS, backups and import/export live in WorkbenchLayoutDrawer (the
   * "Layouts" ribbon button). Placement stays contextual — click-to-add drops
   * into a sane default zone/region; the drag layer covers exact placement.
   */
  import {
    createCustomPanelCommands,
    exportPanelPackage,
    layoutPackageFilename,
    selectActiveLayout,
    selectHiddenWidgets,
    type DockRegionId,
    type NavigationEntryState,
    type WidgetInstance,
    type WidgetZoneId,
    type WorkbenchPage
  } from '../core';
  import { getWorkbenchContext } from './context';
  import { focusTrap } from './focusTrap';
  import { bottomSheetSwipe } from './bottomSheet';
  import {
    instantiatePanelTemplateCommands,
    instantiateWidgetTemplateCommands,
    labelFromWorkbenchType
  } from './library';
  import { startPanelDragOut, startWidgetDragOut } from './libraryDrag';
  import { startListReorder } from './listReorderDrag';

  let {
    open,
    view,
    onClose
  }: { open: boolean; view: 'pages' | 'widgets'; onClose: () => void } = $props();

  // Contextual placement defaults — no global TARGET selects. Panels land in the
  // main region; widgets land in the top-right zone (matching the legacy
  // defaults). Drag-to-place (drag layer) covers "put it exactly here".
  const DEFAULT_PANEL_REGION: DockRegionId = 'main';
  const DEFAULT_WIDGET_ZONE: WidgetZoneId = 'top.right';

  // T23: phone flag (matches the 760px breakpoint) — the drawer presents as a
  // bottom sheet with swipe-to-close below phone width, a right-edge drawer above.
  let isPhone = $state(false);
  let scrollEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 760px)');
    const sync = () => (isPhone = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  const { controller } = getWorkbenchContext();
  const layout = $derived(selectActiveLayout($controller.document));

  // ── Search (filters every section of the active view) ────────────────────
  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const matches = (text: string): boolean => !q || text.toLowerCase().includes(q);

  // ── Pages ────────────────────────────────────────────────────────────────
  const pages = $derived($controller.pages);
  const activePageId = $derived($controller.activePage?.id);
  const filteredPages = $derived(pages.filter((page) => matches(page.label)));

  // ── Panels (add to the active page) ──────────────────────────────────────
  const panelTemplates = $derived(
    Object.values($controller.document.panelLibrary)
      .filter((template) => matches(template.title))
      .sort((a, b) => a.title.localeCompare(b.title))
  );
  const hiddenNav = $derived.by(() =>
    Object.values(layout?.navigation.entries ?? {})
      .filter((entry) => entry.hidden && matches(entry.label ?? entry.id))
      .sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id))
  );

  // ── Widgets ───────────────────────────────────────────────────────────────
  const widgetTemplates = $derived(
    Object.values($controller.document.widgetLibrary)
      .filter((template) => matches(template.title))
      .sort((a, b) => a.title.localeCompare(b.title))
  );
  const hiddenWidgets = $derived(selectHiddenWidgets($controller.document).filter((w) => matches(widgetTitle(w))));
  const placedWidgets = $derived.by(() =>
    Object.values(layout?.widgets ?? {})
      .filter((widget) => widget.zone !== 'hidden' && matches(widgetTitle(widget)))
      .sort((a, b) => a.zone.localeCompare(b.zone) || a.order - b.order || a.id.localeCompare(b.id))
  );

  const title = $derived(view === 'pages' ? 'Pages' : 'Widgets');

  // Unified inline-rename state: pages, panel templates and widget templates all
  // rename in place through the same little input, keyed by kind + id.
  let renaming = $state<{ kind: 'page' | 'panel' | 'widget'; id: string } | null>(null);
  let renameDraft = $state('');

  // Inline status line (a parallel agent owns the toast surface — do NOT import
  // toasts.ts here; each `setStatus` call marks where a toast could later
  // replace the inline feedback).
  let status = $state<{ tone: 'ok' | 'error'; message: string } | null>(null);
  function setStatus(tone: 'ok' | 'error', message: string) {
    status = { tone, message };
  }

  // Clear any stale rename/status/search when the drawer opens or its view changes.
  $effect(() => {
    void open;
    void view;
    renaming = null;
    renameDraft = '';
    status = null;
    query = '';
  });

  function downloadJson(stem: string, data: unknown) {
    if (typeof window === 'undefined') return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${stem}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportPanelTemplate(templateId: string, title: string) {
    const pkg = exportPanelPackage($controller.document, templateId);
    if (!pkg) {
      setStatus('error', `Could not export "${title}".`); // toast candidate
      return;
    }
    downloadJson(layoutPackageFilename(title, 'panel'), pkg);
    setStatus('ok', `Exported "${title}".`); // toast candidate
  }

  function widgetTitle(widget: WidgetInstance): string {
    return widget.state?.label && typeof widget.state.label === 'string'
      ? widget.state.label
      : labelFromWorkbenchType(widget.type);
  }

  function navTitle(entry: NavigationEntryState): string {
    return entry.label ?? entry.id;
  }

  function startRename(kind: 'page' | 'panel' | 'widget', id: string, current: string) {
    renaming = { kind, id };
    renameDraft = current;
  }

  function cancelRename() {
    renaming = null;
    renameDraft = '';
  }

  function commitRename() {
    if (!renaming) return;
    const { kind, id } = renaming;
    const result =
      kind === 'page'
        ? controller.renamePage(id, renameDraft)
        : controller.dispatch(
            kind === 'panel'
              ? { type: 'library.panel.rename', templateId: id, title: renameDraft }
              : { type: 'library.widget.rename', templateId: id, title: renameDraft }
          );
    if (result.success) cancelRename();
  }

  function renameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitRename();
    if (event.key === 'Escape') cancelRename();
  }

  // ── Page actions ──────────────────────────────────────────────────────────
  function addPage() {
    const id = controller.addPage({ label: `Page ${pages.length + 1}` });
    if (id) setStatus('ok', 'New page added — it is now active.'); // toast candidate
  }

  // Jump to a page and close the drawer so the user lands on it.
  function goToPage(page: WorkbenchPage) {
    controller.activatePage(page.id);
    onClose();
  }

  function deletePage(page: WorkbenchPage) {
    if (pages.length <= 1) return;
    controller.removePage(page.id);
  }

  function addCustomPanel() {
    controller.dispatchMany(createCustomPanelCommands($controller.document, { region: DEFAULT_PANEL_REGION }));
    setStatus('ok', 'Custom panel added to this page.'); // toast candidate
  }

  // ── Page reorder by drag (R18 / AXIS-29 — the shared list-reorder drag) ────
  // Grab a page row's handle and drag it up/down. Routed through the generic
  // `startListReorder` primitive, so it rides the SAME machinery as every other
  // drag: a DragLayer ghost (a clone of the real row, anchored at the grab
  // offset) travels with the pointer, an in-flow dashed slot is spliced into the
  // list where it will land, and the .aw-dragging-list body class lights up.
  // Disabled while a search filter is active (the visible order isn't canonical).
  const drag = $derived($controller.drag);
  const reorderingPageId = $derived(drag?.kind === 'list' && drag.listId === 'pages' ? drag.itemId : null);
  // Insert index among the NON-dragged visible rows (what the slot renders against).
  const pageSlotIndex = $derived(
    drag?.kind === 'list' && drag.listInsert?.listId === 'pages' ? drag.listInsert.index : -1
  );
  // Slot height mirrors the lifted row's footprint so the flow stays neutral.
  const pageSlotHeight = $derived(drag?.kind === 'list' ? drag.size?.height ?? 44 : 44);
  // Position in `filteredPages` to render the slot BEFORE, skipping the lifted row
  // (mirrors WidgetZone's `slotPos`); past-the-end renders after the last row.
  const pageSlotPos = $derived.by(() => {
    if (pageSlotIndex < 0) return -1;
    let visible = 0;
    for (let i = 0; i < filteredPages.length; i++) {
      if (filteredPages[i].id === reorderingPageId) continue;
      if (visible === pageSlotIndex) return i;
      visible += 1;
    }
    return filteredPages.length;
  });

  function pageReorderDown(page: WorkbenchPage, event: PointerEvent) {
    if (!!q || pages.length <= 1) return;
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('.aw-lib-row.page');
    if (!row) return;
    event.stopPropagation();
    startListReorder({
      controller,
      event,
      listId: 'pages',
      itemId: page.id,
      item: row,
      orientation: 'vertical',
      targetLabel: page.label,
      // All page rows in canonical (DOM) order; the primitive excludes the lifted
      // one from the hit-test. No search filter is active during a reorder.
      items: () => Array.from(document.querySelectorAll<HTMLElement>('.aw-lib-row.page')),
      commit: (toIndex) => {
        controller.movePage(page.id, toIndex);
      }
    });
  }

  // ── Drag-OUT: drag a saved panel / widget row onto the layout (AXIS-26) ────
  // The primary placement path (design `startLibDrag`): drag the row out and drop
  // it exactly where wanted. Tap stays as the add-to-default fallback (the row's
  // onclick). The drawer auto-collapses the instant the drag activates.
  function panelTemplateDragOut(template: { id: string; title: string }, event: PointerEvent) {
    startPanelDragOut({
      controller,
      event,
      onActivate: onClose,
      commit: ({ region }) => {
        const found = $controller.document.panelLibrary[template.id];
        return found ? instantiatePanelTemplateCommands($controller.document, found, { region }) : null;
      }
    });
  }
  function widgetTemplateDragOut(template: { id: string }, event: PointerEvent) {
    startWidgetDragOut({
      controller,
      event,
      onActivate: onClose,
      commit: ({ zone, index }) => {
        const found = $controller.document.widgetLibrary[template.id];
        return found
          ? instantiateWidgetTemplateCommands($controller.document, found, { zone: zone as WidgetZoneId, index })
          : null;
      }
    });
  }
  function hiddenWidgetDragOut(widget: WidgetInstance, event: PointerEvent) {
    startWidgetDragOut({
      controller,
      event,
      onActivate: onClose,
      commit: ({ zone, index }) => [
        { type: 'widget.move', widgetIds: [widget.id], zone: zone as WidgetZoneId, index }
      ]
    });
  }
</script>

{#snippet iconPencil()}
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M11.4 2.1 13.9 4.6 5.1 13.4 2 14l.6-3.1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"></path>
  </svg>
{/snippet}
{#snippet iconTrash()}
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13.5h6l.5-9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
{/snippet}
{#snippet iconExport()}
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12v2h10v-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
{/snippet}
{#snippet iconGrip()}
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <g fill="currentColor"><circle cx="4" cy="3" r="1"></circle><circle cx="8" cy="3" r="1"></circle><circle cx="4" cy="6" r="1"></circle><circle cx="8" cy="6" r="1"></circle><circle cx="4" cy="9" r="1"></circle><circle cx="8" cy="9" r="1"></circle></g>
  </svg>
{/snippet}

{#if open}
  <button class="aw-lib-scrim" type="button" aria-label={`Close ${title.toLowerCase()}`} onclick={onClose}></button>
  <aside
    class="aw-lib-drawer"
    class:aw-sheet={isPhone}
    aria-label={`${title} browser`}
    use:focusTrap={{ onClose }}
    use:bottomSheetSwipe={{ enabled: isPhone, onClose, scrollContainer: () => scrollEl }}
  >
    <!-- T23: grab bar for the phone bottom-sheet presentation (CSS-hidden on desktop). -->
    <div class="aw-lib-grip" aria-hidden="true"></div>
    <header class="aw-lib-head">
      <span>{title}</span>
      <button type="button" class="aw-lib-close" title="Close" aria-label={`Close ${title.toLowerCase()}`} data-autofocus onclick={onClose}>×</button>
    </header>

    <!-- Search field (design library pattern): a magnifier + input that filters
         every section of the active view. -->
    <div class="aw-lib-searchbar">
      <div class="aw-lib-search">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
          <path d="M10.8 10.8 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
        </svg>
        <input
          bind:value={query}
          placeholder={view === 'pages' ? 'Search pages & panels…' : 'Search widgets…'}
          aria-label={`Search ${title.toLowerCase()}`}
        />
        {#if query}
          <button type="button" class="aw-lib-search-clear" title="Clear search" aria-label="Clear search" onclick={() => (query = '')}>×</button>
        {/if}
      </div>
    </div>

    <div class="aw-lib-scroll" bind:this={scrollEl}>
      {#if status}
        <p class="aw-lib-status" class:error={status.tone === 'error'} role="status">{status.message}</p>
      {/if}

      {#if view === 'pages'}
        <section class="aw-lib-section">
          <div class="aw-lib-section-head">
            <h2>Pages</h2>
            <button class="aw-lib-add-page" type="button" onclick={addPage}>＋ Add Page</button>
          </div>
          <div class="aw-lib-list">
            {#each filteredPages as page, pagePos (page.id)}
              {#if pageSlotPos === pagePos}
                <!-- In-flow drop slot (same dashed-spacer semantics as WidgetZone):
                     a real list child at the live insert index, so neighbours
                     reflow to show the true post-drop position. -->
                <div class="aw-lib-slot" data-drag-slot aria-hidden="true" style="height:{pageSlotHeight}px;"></div>
              {/if}
              <div
                class="aw-lib-row page"
                class:active={page.id === activePageId}
                class:aw-lifted={reorderingPageId === page.id}
                title={page.label}
              >
                {#if renaming?.kind === 'page' && renaming.id === page.id}
                  <input class="aw-lib-rename" bind:value={renameDraft} aria-label="Page name" onkeydown={renameKeydown} />
                  <button class="aw-lib-save" type="button" onclick={commitRename}>Save</button>
                  <button type="button" onclick={cancelRename}>Cancel</button>
                {:else}
                  <button
                    class="aw-lib-drag-grip"
                    type="button"
                    title={!!q ? 'Clear the search to reorder pages' : 'Drag to reorder page'}
                    aria-label="Drag to reorder page"
                    disabled={!!q || pages.length <= 1}
                    onpointerdown={(e) => pageReorderDown(page, e)}
                  >{@render iconGrip()}</button>
                  <button class="aw-lib-page-open" type="button" title={`Go to ${page.label}`} onclick={() => goToPage(page)}>
                    <span class="aw-lib-ico">{page.id === activePageId ? '◉' : '◎'}</span>
                    <span class="aw-lib-page-label">{page.label}</span>
                  </button>
                  <i>{page.id === activePageId ? 'active' : 'open'}</i>
                  <span class="aw-lib-actions">
                    <button class="aw-lib-icon-btn" type="button" title={`Rename ${page.label}`} aria-label={`Rename ${page.label}`} onclick={() => startRename('page', page.id, page.label)}>{@render iconPencil()}</button>
                    <button
                      class="aw-lib-icon-btn danger"
                      type="button"
                      disabled={pages.length <= 1}
                      title={pages.length <= 1 ? 'The last page cannot be deleted' : `Delete ${page.label}`}
                      aria-label={`Delete ${page.label}`}
                      onclick={() => deletePage(page)}
                    >{@render iconTrash()}</button>
                  </span>
                {/if}
              </div>
            {:else}
              <p class="aw-lib-empty">{q ? 'No pages match your search.' : 'No pages yet.'}</p>
            {/each}
            {#if pageSlotPos >= filteredPages.length && pageSlotPos >= 0}
              <div class="aw-lib-slot" data-drag-slot aria-hidden="true" style="height:{pageSlotHeight}px;"></div>
            {/if}
          </div>
        </section>

        <section class="aw-lib-section">
          <div class="aw-lib-section-head">
            <h2>Add Panel · To This Page</h2>
            <button class="aw-lib-add-page" type="button" onclick={addCustomPanel}>＋ Custom Panel</button>
          </div>
          <div class="aw-lib-list">
            {#each panelTemplates as template (template.id)}
              <div class="aw-lib-row saved" title={template.title}>
                {#if renaming?.kind === 'panel' && renaming.id === template.id}
                  <span class="aw-lib-ico">▤</span>
                  <input class="aw-lib-rename" bind:value={renameDraft} aria-label="Panel title" onkeydown={renameKeydown} />
                  <button class="aw-lib-save" type="button" onclick={commitRename}>Save</button>
                  <button type="button" onclick={cancelRename}>Cancel</button>
                {:else}
                  <button
                    class="aw-lib-grab"
                    type="button"
                    title={`Drag ${template.title} onto the layout · tap to add to this page`}
                    onpointerdown={(e) => panelTemplateDragOut(template, e)}
                    onclick={() => controller.dispatchMany(instantiatePanelTemplateCommands($controller.document, template, { region: DEFAULT_PANEL_REGION }))}
                  >
                    <span class="aw-lib-ico">▤</span>
                    <span class="aw-lib-label">{template.title}</span>
                    <i>{Object.keys(template.panels).length} {Object.keys(template.panels).length === 1 ? 'panel' : 'panels'}</i>
                  </button>
                  <span class="aw-lib-actions">
                    <button class="aw-lib-icon-btn" type="button" title={`Rename ${template.title}`} aria-label={`Rename ${template.title}`} onclick={() => startRename('panel', template.id, template.title)}>{@render iconPencil()}</button>
                    <button class="aw-lib-icon-btn" type="button" title={`Export ${template.title}`} aria-label={`Export ${template.title}`} onclick={() => exportPanelTemplate(template.id, template.title)}>{@render iconExport()}</button>
                    <button
                      class="aw-lib-icon-btn danger"
                      type="button"
                      title={`Delete ${template.title}`}
                      aria-label={`Delete ${template.title}`}
                      onclick={() => controller.dispatch({ type: 'library.panel.delete', templateId: template.id })}
                    >{@render iconTrash()}</button>
                  </span>
                {/if}
              </div>
            {:else}
              <p class="aw-lib-empty">{q ? 'No saved panels match.' : 'No saved panels — use ＋ Custom Panel.'}</p>
            {/each}

            {#each hiddenNav as entry (entry.id)}
              <button class="aw-lib-row add" type="button" title={`Restore ${navTitle(entry)}`} onclick={() => controller.dispatch({ type: 'navigation.show', entryId: entry.id })}>
                <span class="aw-lib-ico">＋</span>
                <span>{navTitle(entry)}</span>
                <i>hidden nav</i>
              </button>
            {/each}
          </div>
        </section>
      {:else}
        <section class="aw-lib-section">
          <h2>Saved Widgets</h2>
          <div class="aw-lib-list">
            {#each widgetTemplates as template (template.id)}
              <div class="aw-lib-row saved" title={template.title}>
                {#if renaming?.kind === 'widget' && renaming.id === template.id}
                  <span class="aw-lib-ico">⛁</span>
                  <input class="aw-lib-rename" bind:value={renameDraft} aria-label="Widget title" onkeydown={renameKeydown} />
                  <button class="aw-lib-save" type="button" onclick={commitRename}>Save</button>
                  <button type="button" onclick={cancelRename}>Cancel</button>
                {:else}
                  <button
                    class="aw-lib-grab"
                    type="button"
                    title={`Drag ${template.title} onto the layout · tap to add`}
                    onpointerdown={(e) => widgetTemplateDragOut(template, e)}
                    onclick={() => controller.dispatchMany(instantiateWidgetTemplateCommands($controller.document, template, { zone: DEFAULT_WIDGET_ZONE }))}
                  >
                    <span class="aw-lib-ico">⛁</span>
                    <span class="aw-lib-label">{template.title}</span>
                    <i>{Object.keys(template.widgets).length} {Object.keys(template.widgets).length === 1 ? 'widget' : 'widgets'}</i>
                  </button>
                  <span class="aw-lib-actions">
                    <button class="aw-lib-icon-btn" type="button" title={`Rename ${template.title}`} aria-label={`Rename ${template.title}`} onclick={() => startRename('widget', template.id, template.title)}>{@render iconPencil()}</button>
                    <button class="aw-lib-icon-btn danger" type="button" title={`Delete ${template.title}`} aria-label={`Delete ${template.title}`} onclick={() => controller.dispatch({ type: 'library.widget.delete', templateId: template.id })}>{@render iconTrash()}</button>
                  </span>
                {/if}
              </div>
            {:else}
              <p class="aw-lib-empty">{q ? 'No saved widgets match.' : 'No saved widgets yet.'}</p>
            {/each}
          </div>
        </section>

        <section class="aw-lib-section">
          <h2>Hidden · Drag To Place Or Tap To Add</h2>
          <div class="aw-lib-list">
            {#each hiddenWidgets as widget (widget.id)}
              <button
                class="aw-lib-row add aw-lib-draggable"
                type="button"
                title={`Drag ${widgetTitle(widget)} onto the layout · tap to add`}
                onpointerdown={(e) => hiddenWidgetDragOut(widget, e)}
                onclick={() => controller.dispatch({ type: 'widget.move', widgetIds: [widget.id], zone: DEFAULT_WIDGET_ZONE })}
              >
                <span class="aw-lib-ico">＋</span>
                <span class="aw-lib-label">{widgetTitle(widget)}</span>
                <i>hidden</i>
              </button>
            {:else}
              <p class="aw-lib-empty">{q ? 'No hidden widgets match.' : 'All widgets are placed.'}</p>
            {/each}
          </div>
        </section>

        <section class="aw-lib-section">
          <h2>On Your Layout · Tap To Hide</h2>
          <div class="aw-lib-list">
            {#each placedWidgets as widget (widget.id)}
              <button
                class="aw-lib-row placed"
                type="button"
                disabled={widget.locked}
                title={widget.locked ? 'Locked widget' : `Hide ${widgetTitle(widget)}`}
                onclick={() => !widget.locked && controller.dispatch({ type: 'widget.hide', widgetIds: [widget.id] })}
              >
                <span class="aw-lib-dot"></span>
                <span>{widgetTitle(widget)}</span>
                <i>{widget.zone}</i>
              </button>
            {:else}
              <p class="aw-lib-empty">{q ? 'No placed widgets match.' : 'No widgets on your layout.'}</p>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .aw-lib-scrim {
    position: fixed;
    inset: 0;
    z-index: 130;
    border: 0;
    background: rgba(0, 0, 0, 0.4);
    animation: awLibIn 0.16s ease;
  }
  .aw-lib-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 131;
    width: 348px;
    max-width: 90vw;
    /* T21: right-edge drawer clears the landscape right + vertical insets. */
    padding-right: var(--aw-safe-right, 0px);
    padding-top: var(--aw-safe-top, 0px);
    padding-bottom: var(--aw-safe-bottom, 0px);
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--aw-accent) 3%, var(--aw-bg-2));
    border-left: 1px solid color-mix(in srgb, var(--aw-accent) 24%, var(--aw-border));
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.5);
    animation: awLibSlide 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .aw-lib-grip {
    display: none;
  }
  /* T23: below phone width the browser becomes a bottom sheet — full width,
     rounded top, grab bar, slides up. Swipe the sheet down (when the list is
     scrolled to the top) to close. */
  @media (max-width: 760px) {
    .aw-lib-drawer {
      top: auto;
      right: var(--aw-safe-right, 0px);
      left: var(--aw-safe-left, 0px);
      bottom: 0;
      width: auto;
      max-width: none;
      max-height: min(86vh, calc(100vh - 32px - var(--aw-safe-top, 0px)));
      padding-right: 0;
      padding-top: 0;
      border-left: 0;
      border-top: 1px solid color-mix(in srgb, var(--aw-accent) 24%, var(--aw-border));
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -14px 46px rgba(0, 0, 0, 0.5);
      animation: awLibSheetUp 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-lib-grip {
      flex: none;
      align-self: center;
      width: 40px;
      height: 4px;
      margin: 8px 0 2px;
      border-radius: 3px;
      display: block;
      background: var(--aw-border-3);
    }
  }
  .aw-lib-head {
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 17px 18px 13px;
    border-bottom: 1px solid color-mix(in srgb, var(--aw-accent) 18%, var(--aw-border));
  }
  .aw-lib-head span {
    color: var(--aw-text);
    font-size: 15px;
    font-weight: 800;
  }
  .aw-lib-head button {
    width: 30px;
    height: 30px;
    margin-left: auto;
    border: 0;
    border-radius: 8px;
    background: var(--aw-surface-2);
    color: var(--aw-text-muted);
    cursor: pointer;
    font-size: 15px;
  }
  .aw-lib-searchbar {
    flex: none;
    padding: 12px 14px;
    border-bottom: 1px solid var(--aw-border);
  }
  .aw-lib-search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--aw-border-2);
    border-radius: 9px;
    background: var(--aw-bg);
    color: var(--aw-text-faint);
  }
  .aw-lib-search:focus-within {
    border-color: var(--aw-accent);
  }
  .aw-lib-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--aw-text);
    font: 600 12.5px/1 var(--aw-font-ui);
  }
  .aw-lib-search-clear {
    flex: none;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 6px;
    background: var(--aw-surface-2);
    color: var(--aw-text-muted);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
  .aw-lib-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
  }
  .aw-lib-scroll::-webkit-scrollbar {
    width: 9px;
  }
  .aw-lib-scroll::-webkit-scrollbar-thumb {
    background: var(--aw-border-2);
    border: 2px solid transparent;
    border-radius: 6px;
    background-clip: padding-box;
  }
  .aw-lib-section {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-bottom: 20px;
  }
  .aw-lib-section-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .aw-lib-section h2 {
    margin: 0;
    flex: 1;
    min-width: 0;
    color: var(--aw-text-faint);
    font: 800 9px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .aw-lib-add-page {
    flex: none;
    height: 26px;
    padding: 0 11px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 40%, var(--aw-border));
    border-radius: 7px;
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
    color: var(--aw-accent);
    cursor: pointer;
    font: 800 10px/1 var(--aw-font-ui);
  }
  .aw-lib-add-page:hover {
    border-color: var(--aw-accent);
  }
  .aw-lib-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .aw-lib-row {
    min-width: 0;
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    border: 1px solid var(--aw-border-2);
    border-radius: 10px;
    background: var(--aw-surface);
    color: var(--aw-text-2);
    cursor: pointer;
    text-align: left;
  }
  .aw-lib-row:hover {
    border-color: var(--aw-border-3);
  }
  /* T18: consistent keyboard focus ring on every interactive element. */
  .aw-lib-drawer :is(button, input):focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
  }
  .aw-lib-row:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
    border-color: var(--aw-accent);
  }
  .aw-lib-row.saved {
    background: color-mix(in srgb, var(--aw-accent) 5%, var(--aw-surface));
    border-color: color-mix(in srgb, var(--aw-accent) 30%, var(--aw-border));
  }
  .aw-lib-row.add {
    background: color-mix(in srgb, var(--aw-accent) 8%, var(--aw-bg-2));
    border-color: color-mix(in srgb, var(--aw-accent) 32%, var(--aw-border));
  }
  .aw-lib-row.add:hover,
  .aw-lib-row.saved:hover {
    border-color: var(--aw-accent);
  }
  /* Page rows carry their own open-button; the row itself is not clickable. */
  .aw-lib-row.page {
    cursor: default;
  }
  .aw-lib-row.page.active {
    background: color-mix(in srgb, var(--aw-accent) 9%, var(--aw-surface));
    border-color: color-mix(in srgb, var(--aw-accent) 40%, var(--aw-border));
  }
  .aw-lib-page-open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--aw-text-2);
    cursor: pointer;
    text-align: left;
  }
  .aw-lib-page-open:hover .aw-lib-page-label {
    color: var(--aw-text);
  }
  .aw-lib-page-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 800;
  }
  /* R17 (AXIS-26): the row body is a single grab button (icon + name + meta) that
     drags onto the layout / taps to add; the label owns the free space so names
     are never truncated to a couple of letters. Rename/export/delete are compact
     ICON buttons that no longer overflow the drawer's right edge. */
  /* Scoped under `.aw-lib-row button` so they beat the generic bordered-button
     rule (which otherwise forces min-width:54px + flex:none and pushed the grip
     off the drawer's right edge). */
  .aw-lib-row button.aw-lib-grab {
    flex: 1;
    min-width: 0;
    height: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--aw-text-2);
    cursor: grab;
    /* Touch: claim the gesture so a drag-out isn't stolen by list scroll. */
    touch-action: none;
    text-align: left;
  }
  .aw-lib-row button.aw-lib-grab:hover:not(:disabled) {
    border-color: transparent;
  }
  .aw-lib-row button.aw-lib-grab:active {
    cursor: grabbing;
  }
  .aw-lib-row.aw-lib-draggable {
    cursor: grab;
    touch-action: none;
  }
  .aw-lib-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 700;
    color: var(--aw-text-2);
  }
  .aw-lib-grab:hover .aw-lib-label {
    color: var(--aw-text);
  }
  /* Page reorder handle (replaces the ▲▼ buttons). */
  .aw-lib-row button.aw-lib-drag-grip {
    flex: none;
    width: 22px;
    min-width: 22px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--aw-text-faint);
    cursor: grab;
    touch-action: none;
  }
  .aw-lib-row button.aw-lib-drag-grip:hover:not(:disabled) {
    color: var(--aw-text-2);
  }
  .aw-lib-row button.aw-lib-drag-grip:active {
    cursor: grabbing;
  }
  .aw-lib-row button.aw-lib-drag-grip:disabled {
    opacity: 0.32;
    cursor: default;
  }
  /* Compact square icon actions (rename / export / delete). */
  .aw-lib-row button.aw-lib-icon-btn {
    flex: none;
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--aw-border);
    border-radius: 8px;
    background: var(--aw-bg-2);
    color: var(--aw-text-muted);
  }
  .aw-lib-row button.aw-lib-icon-btn:hover:not(:disabled) {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-lib-row button.aw-lib-icon-btn.danger:hover:not(:disabled) {
    color: var(--aw-danger);
    border-color: var(--aw-danger);
  }
  .aw-lib-row button.aw-lib-icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* Right-aligned action column: a fixed-width slot sized for the widest cluster
     (rename + export + delete) so the icons line up at the SAME x on every row
     and across every view — never trailing directly behind the variable-width
     name/meta. Rows with fewer icons right-align within it (delete always far
     right). The flex:1 body absorbs the leftover width + the meta `<i>`. */
  .aw-lib-actions {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    width: 102px;
  }
  /* Page being dragged: lifted out of the flow entirely — the DragLayer ghost
     (clone of the row) travels, and the in-flow slot marks where it lands. */
  .aw-lib-row.page.aw-lifted {
    display: none;
  }
  /* In-flow drop slot for the page reorder (same dashed-spacer language as the
     WidgetZone `.aw-zone-slot`): a real list child, so neighbours reflow. */
  .aw-lib-slot {
    flex: none;
    box-sizing: border-box;
    border: 1.5px dashed var(--aw-accent);
    border-radius: 9px;
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
  }
  .aw-lib-row:disabled {
    opacity: 0.48;
    cursor: default;
  }
  .aw-lib-row > span:not(.aw-lib-ico):not(.aw-lib-dot):not(.aw-lib-actions) {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 700;
  }
  .aw-lib-row i {
    flex: none;
    color: var(--aw-text-faint);
    font: 600 9px/1 var(--aw-font-mono);
    font-style: normal;
  }
  .aw-lib-row button {
    flex: none;
    min-width: 54px;
    height: 26px;
    border: 1px solid var(--aw-border);
    border-radius: 7px;
    background: var(--aw-bg-2);
    color: var(--aw-text-muted);
    cursor: pointer;
    font: 800 10px/1 var(--aw-font-ui);
  }
  /* Scoped over the generic `.aw-lib-row button` (0,1,1) — which forces flex:none
     AND paints a bordered chip — so the page name is a PLAIN label that owns the
     row width: no chip background/border (AXIS-29 #2), and the body expands so the
     meta + icon column pin to the row's right edge instead of trailing the name
     (AXIS-29 #3). Mirrors the `.aw-lib-grab` treatment on panel/widget rows. */
  .aw-lib-row button.aw-lib-page-open {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
  }
  .aw-lib-row button:hover:not(:disabled) {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-lib-row .aw-lib-page-open:hover {
    border: 0;
  }
  .aw-lib-save:hover:not(:disabled) {
    color: var(--aw-accent);
  }
  .aw-lib-rename {
    min-width: 0;
    flex: 1;
    height: 30px;
    border: 1px solid var(--aw-border-2);
    border-radius: 7px;
    background: var(--aw-bg);
    color: var(--aw-text);
    padding: 0 9px;
    font: 800 12px/1 var(--aw-font-ui);
  }
  .aw-lib-rename:focus {
    border-color: var(--aw-accent);
    outline: none;
  }
  .aw-lib-ico {
    flex: none;
    color: var(--aw-accent);
    font-size: 14px;
  }
  .aw-lib-dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--aw-accent);
  }
  .aw-lib-empty {
    margin: 0;
    padding: 14px;
    color: var(--aw-text-faint);
    text-align: center;
    font: 600 11px/1.4 var(--aw-font-mono);
  }
  .aw-lib-status {
    margin: 0 0 12px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 30%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 8%, transparent);
    color: var(--aw-text-2);
    font: 600 11px/1.4 var(--aw-font-mono);
    word-break: break-word;
  }
  .aw-lib-status.error {
    border-color: color-mix(in srgb, var(--aw-danger) 44%, var(--aw-border));
    background: color-mix(in srgb, var(--aw-danger) 10%, transparent);
    color: var(--aw-danger);
  }
  @keyframes awLibIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes awLibSlide {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes awLibSheetUp {
    from { transform: translateY(calc(100% + 24px)); }
    to { transform: translateY(0); }
  }
</style>
