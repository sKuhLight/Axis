<script lang="ts">
  /**
   * Purpose-built browser drawer. The Edit ribbon opens this in one of two
   * views (V13a split — "a UX nightmare" was one drawer showing panels,
   * widgets, saved layouts, backups AND global target dropdowns at once):
   *
   *   - `view="panels"`  → panel browser ONLY: saved panel templates you can
   *     add to the layout (Load / Rename / Export / Delete) plus hidden nav
   *     entries you can restore.
   *   - `view="widgets"` → widget browser ONLY: saved widget templates plus
   *     the hidden-widget shelf, each addable to the layout.
   *
   * Layouts, backups and import/export now live in WorkbenchLayoutDrawer
   * (the "Layouts" ribbon button). No global TARGET dropdowns are exposed
   * here any more — placement is contextual: click-to-add drops into a sane
   * default zone/region, and the drag layer (owned elsewhere) still lets you
   * drop an item exactly where you want it.
   */
  import {
    exportPanelPackage,
    layoutPackageFilename,
    selectActiveLayout,
    selectHiddenWidgets,
    type DockRegionId,
    type NavigationEntryState,
    type WidgetInstance,
    type WidgetZoneId
  } from '../core';
  import { getWorkbenchContext } from './context';
  import { focusTrap } from './focusTrap';
  import { bottomSheetSwipe } from './bottomSheet';
  import {
    instantiatePanelTemplateCommands,
    instantiateWidgetTemplateCommands,
    labelFromWorkbenchType
  } from './library';

  let {
    open,
    view,
    onClose
  }: { open: boolean; view: 'panels' | 'widgets'; onClose: () => void } = $props();

  // Contextual placement defaults — no global TARGET selects any more. Panels
  // land in the main region; widgets land in the top-right zone (matching the
  // legacy defaults). Drag-to-place (drag layer) covers "put it exactly here".
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
  const panelTemplates = $derived(
    Object.values($controller.document.panelLibrary).sort((a, b) => a.title.localeCompare(b.title))
  );
  const widgetTemplates = $derived(
    Object.values($controller.document.widgetLibrary).sort((a, b) => a.title.localeCompare(b.title))
  );
  const hiddenWidgets = $derived(selectHiddenWidgets($controller.document));
  const placedWidgets = $derived.by(() =>
    Object.values(layout?.widgets ?? {})
      .filter((widget) => widget.zone !== 'hidden')
      .sort((a, b) => a.zone.localeCompare(b.zone) || a.order - b.order || a.id.localeCompare(b.id))
  );
  const hiddenNav = $derived.by(() =>
    Object.values(layout?.navigation.entries ?? {})
      .filter((entry) => entry.hidden)
      .sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id))
  );

  const title = $derived(view === 'panels' ? 'Panels' : 'Widgets');

  let renamingTemplateId = $state<string | null>(null);
  let renameDraft = $state('');

  // Inline status line (a parallel agent owns the toast surface — do NOT import
  // toasts.ts here; each `setStatus` call marks where a toast could later
  // replace the inline feedback).
  let status = $state<{ tone: 'ok' | 'error'; message: string } | null>(null);
  function setStatus(tone: 'ok' | 'error', message: string) {
    status = { tone, message };
  }

  // Clear any stale rename/status when the drawer opens or its view changes.
  $effect(() => {
    void open;
    void view;
    renamingTemplateId = null;
    renameDraft = '';
    status = null;
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

  function startRename(templateId: string, title: string) {
    renamingTemplateId = templateId;
    renameDraft = title;
  }

  function cancelRename() {
    renamingTemplateId = null;
    renameDraft = '';
  }

  function commitRename() {
    if (!renamingTemplateId) return;
    const result = controller.dispatch(
      view === 'panels'
        ? { type: 'library.panel.rename', templateId: renamingTemplateId, title: renameDraft }
        : { type: 'library.widget.rename', templateId: renamingTemplateId, title: renameDraft }
    );
    if (result.success) cancelRename();
  }

  function renameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitRename();
    if (event.key === 'Escape') cancelRename();
  }
</script>

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

    <div class="aw-lib-scroll" bind:this={scrollEl}>
      {#if status}
        <p class="aw-lib-status" class:error={status.tone === 'error'} role="status">{status.message}</p>
      {/if}

      {#if view === 'panels'}
        <section class="aw-lib-section">
          <h2>Saved Panels</h2>
          <div class="aw-lib-list">
            {#each panelTemplates as template (template.id)}
              <div class="aw-lib-row saved" title={template.title}>
                <span class="aw-lib-ico">▤</span>
                {#if renamingTemplateId === template.id}
                  <input class="aw-lib-rename" bind:value={renameDraft} aria-label="Panel title" onkeydown={renameKeydown} />
                  <button class="aw-lib-save" type="button" onclick={commitRename}>Save</button>
                  <button type="button" onclick={cancelRename}>Cancel</button>
                {:else}
                  <span>{template.title}</span>
                  <i>{Object.keys(template.panels).length} panel</i>
                  <button
                    class="aw-lib-load"
                    type="button"
                    title={`Add ${template.title} to your layout`}
                    onclick={() => controller.dispatchMany(instantiatePanelTemplateCommands($controller.document, template, { region: DEFAULT_PANEL_REGION }))}
                  >
                    Add
                  </button>
                  <button class="aw-lib-rename-btn" type="button" onclick={() => startRename(template.id, template.title)}>
                    Rename
                  </button>
                  <button class="aw-lib-export" type="button" title={`Export ${template.title}`} onclick={() => exportPanelTemplate(template.id, template.title)}>
                    Export
                  </button>
                  <button
                    class="aw-lib-delete"
                    type="button"
                    title={`Delete ${template.title}`}
                    onclick={() => controller.dispatch({ type: 'library.panel.delete', templateId: template.id })}
                  >
                    Delete
                  </button>
                {/if}
              </div>
            {:else}
              <p class="aw-lib-empty">No saved panels yet.</p>
            {/each}
          </div>
        </section>

        {#if hiddenNav.length}
          <section class="aw-lib-section">
            <h2>Hidden Nav · Tap To Restore</h2>
            <div class="aw-lib-list">
              {#each hiddenNav as entry (entry.id)}
                <button
                  class="aw-lib-row add"
                  type="button"
                  title={navTitle(entry)}
                  onclick={() => controller.dispatch({ type: 'navigation.show', entryId: entry.id })}
                >
                  <span class="aw-lib-ico">＋</span>
                  <span>{navTitle(entry)}</span>
                  <i>nav</i>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      {:else}
        <section class="aw-lib-section">
          <h2>Saved Widgets</h2>
          <div class="aw-lib-list">
            {#each widgetTemplates as template (template.id)}
              <div class="aw-lib-row saved" title={template.title}>
                <span class="aw-lib-ico">⛁</span>
                {#if renamingTemplateId === template.id}
                  <input class="aw-lib-rename" bind:value={renameDraft} aria-label="Widget title" onkeydown={renameKeydown} />
                  <button class="aw-lib-save" type="button" onclick={commitRename}>Save</button>
                  <button type="button" onclick={cancelRename}>Cancel</button>
                {:else}
                  <span>{template.title}</span>
                  <i>{Object.keys(template.widgets).length} widgets</i>
                  <button
                    class="aw-lib-load"
                    type="button"
                    title={`Add ${template.title} to your layout`}
                    onclick={() => controller.dispatchMany(instantiateWidgetTemplateCommands($controller.document, template, { zone: DEFAULT_WIDGET_ZONE }))}
                  >
                    Add
                  </button>
                  <button class="aw-lib-rename-btn" type="button" onclick={() => startRename(template.id, template.title)}>
                    Rename
                  </button>
                  <button
                    class="aw-lib-delete"
                    type="button"
                    title={`Delete ${template.title}`}
                    onclick={() => controller.dispatch({ type: 'library.widget.delete', templateId: template.id })}
                  >
                    Delete
                  </button>
                {/if}
              </div>
            {:else}
              <p class="aw-lib-empty">No saved widgets yet.</p>
            {/each}
          </div>
        </section>

        <section class="aw-lib-section">
          <h2>Hidden Widgets · Tap To Add</h2>
          <div class="aw-lib-list">
            {#each hiddenWidgets as widget (widget.id)}
              <button
                class="aw-lib-row add"
                type="button"
                title={widgetTitle(widget)}
                onclick={() => controller.dispatch({ type: 'widget.move', widgetIds: [widget.id], zone: DEFAULT_WIDGET_ZONE })}
              >
                <span class="aw-lib-ico">＋</span>
                <span>{widgetTitle(widget)}</span>
                <i>hidden</i>
              </button>
            {:else}
              <p class="aw-lib-empty">All widgets are placed.</p>
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
    width: 336px;
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
    padding: 17px 18px;
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
  .aw-lib-section h2 {
    margin: 0;
    color: var(--aw-text-faint);
    font: 800 9px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .aw-lib-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .aw-lib-row {
    min-width: 0;
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--aw-border-2);
    border-radius: 9px;
    background: var(--aw-surface);
    color: var(--aw-text-2);
    cursor: pointer;
    text-align: left;
  }
  .aw-lib-row:hover {
    border-color: var(--aw-border-3);
  }
  /* T18: consistent keyboard focus ring on every interactive element in the
     drawer — accent outline, focus-visible only so pointer UX is untouched. */
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
  .aw-lib-row:disabled {
    opacity: 0.48;
    cursor: default;
  }
  .aw-lib-row span:nth-child(2) {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
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
  .aw-lib-row button:hover:not(:disabled) {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-lib-delete:hover:not(:disabled) {
    color: var(--aw-danger);
    border-color: var(--aw-danger);
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
    font: 600 11px/1 var(--aw-font-mono);
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
  .aw-lib-export:hover:not(:disabled) {
    color: var(--aw-accent);
    border-color: var(--aw-accent);
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
