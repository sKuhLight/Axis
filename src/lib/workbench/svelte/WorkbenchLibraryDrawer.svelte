<script lang="ts" module>
  /**
   * App-provided backup seam. The drawer is generic — it cannot know where (or
   * whether) the host keeps document backups. A host that has them registers a
   * provider here (module singleton, the same seam shape as toasts.ts) and the
   * drawer grows a "Backups" section. Chosen over threading a prop from the
   * host shell because the drawer is instantiated by EditRibbon inside the
   * generic renderer — a prop would have to travel WorkbenchHost → EditRibbon →
   * drawer for one optional integration.
   */
  export interface WorkbenchBackupEntry {
    /** 1-based generation slot (1 = newest). */
    slot: number;
    /** Host revision counter carried by the backup (0 when unknown). */
    rev: number;
    /** ISO timestamp of the backup's last change, when known. */
    updatedAt: string | null;
    /** Number of layouts inside the backup. */
    layoutCount: number;
  }

  export interface WorkbenchBackupProvider {
    list(): WorkbenchBackupEntry[];
    /** Restore a generation; returns false when the slot is empty/unreadable. */
    restore(slot: number): boolean;
  }

  let workbenchBackupProvider: WorkbenchBackupProvider | null = null;

  export function registerWorkbenchBackupProvider(provider: WorkbenchBackupProvider | null): void {
    workbenchBackupProvider = provider;
  }
</script>

<script lang="ts">
  import {
    DEFAULT_WIDGET_ZONES,
    DOCK_REGION_IDS,
    exportLayoutPackage,
    exportPanelPackage,
    importLayoutPackage,
    importPanelPackage,
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

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

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
  const panelTemplates = $derived(Object.values($controller.document.panelLibrary).sort((a, b) => a.title.localeCompare(b.title)));
  const widgetTemplates = $derived(Object.values($controller.document.widgetLibrary).sort((a, b) => a.title.localeCompare(b.title)));
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
  const savedLayouts = $derived(Object.values($controller.document.layouts).sort((a, b) => a.label.localeCompare(b.label)));
  let renamingKind = $state<'panel' | 'widget' | null>(null);
  let renamingTemplateId = $state<string | null>(null);
  let renameDraft = $state('');
  let targetRegion = $state<DockRegionId>('main');
  let targetZone = $state<WidgetZoneId>('top.right');

  // T29: import/export. Inline status line (a parallel agent owns the toast
  // surface — do NOT import toasts.ts here; each `setStatus` call marks where a
  // toast could later replace the inline feedback).
  let status = $state<{ tone: 'ok' | 'error'; message: string } | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  function setStatus(tone: 'ok' | 'error', message: string) {
    status = { tone, message };
  }

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

  // T29: export the ACTIVE layout as a self-contained, collision-safe package.
  function exportActiveLayout() {
    if (!layout) return;
    const pkg = exportLayoutPackage($controller.document, layout.id);
    if (!pkg) {
      setStatus('error', 'Could not export the current layout.'); // toast candidate
      return;
    }
    downloadJson(layoutPackageFilename(layout.label), pkg);
    setStatus('ok', `Exported "${layout.label}".`); // toast candidate
  }

  function exportSavedLayout(layoutId: string, label: string) {
    const pkg = exportLayoutPackage($controller.document, layoutId);
    if (!pkg) {
      setStatus('error', `Could not export "${label}".`); // toast candidate
      return;
    }
    downloadJson(layoutPackageFilename(label), pkg);
    setStatus('ok', `Exported "${label}".`); // toast candidate
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

  // T29: import a layout OR panel package. The imported layout is ADDED to the
  // library (layout.save) and NOT auto-applied; every id is re-minted upstream.
  async function onImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-importing the same file
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setStatus('error', 'File is not valid JSON.'); // toast candidate
      return;
    }

    const asLayout = importLayoutPackage(parsed);
    if (asLayout.success) {
      const result = controller.dispatch({ type: 'layout.save', layout: asLayout.payload });
      if (result.success) setStatus('ok', `Imported layout "${asLayout.payload.label}" — apply it from the Layout Library.`); // toast candidate
      else setStatus('error', 'Imported layout could not be saved.'); // toast candidate
      return;
    }

    const asPanel = importPanelPackage(parsed);
    if (asPanel.success) {
      const result = controller.dispatch({ type: 'library.panel.save', template: asPanel.payload });
      if (result.success) setStatus('ok', `Imported panel "${asPanel.payload.title}".`); // toast candidate
      else setStatus('error', 'Imported panel could not be saved.'); // toast candidate
      return;
    }

    // Report the most specific failure (layout parse is the primary path here).
    setStatus('error', asLayout.error.message); // toast candidate
  }

  // Backups (app-provided seam above): the list is re-read every time the
  // drawer opens; restore is a two-step inline confirm.
  let backups = $state<WorkbenchBackupEntry[]>([]);
  let confirmBackupSlot = $state<number | null>(null);
  $effect(() => {
    if (!open) return;
    backups = workbenchBackupProvider?.list() ?? [];
    confirmBackupSlot = null;
  });

  function backupTimestamp(entry: WorkbenchBackupEntry): string {
    if (!entry.updatedAt) return 'Unknown time';
    const parsed = new Date(entry.updatedAt);
    return Number.isNaN(parsed.getTime()) ? 'Unknown time' : parsed.toLocaleString();
  }

  function restoreBackup(entry: WorkbenchBackupEntry): void {
    if (!workbenchBackupProvider) return;
    let restored = false;
    try {
      restored = workbenchBackupProvider.restore(entry.slot);
    } catch {
      restored = false;
    }
    confirmBackupSlot = null;
    if (restored) setStatus('ok', `Restored backup ${entry.slot}.`); // toast candidate
    else setStatus('error', `Backup ${entry.slot} could not be restored.`); // toast candidate
    backups = workbenchBackupProvider.list();
  }

  function widgetTitle(widget: WidgetInstance): string {
    return widget.state?.label && typeof widget.state.label === 'string' ? widget.state.label : labelFromWorkbenchType(widget.type);
  }

  function navTitle(entry: NavigationEntryState): string {
    return entry.label ?? entry.id;
  }

  function startRename(kind: 'panel' | 'widget', templateId: string, title: string) {
    renamingKind = kind;
    renamingTemplateId = templateId;
    renameDraft = title;
  }

  function cancelRename() {
    renamingKind = null;
    renamingTemplateId = null;
    renameDraft = '';
  }

  function commitRename() {
    if (!renamingKind || !renamingTemplateId) return;
    const result = controller.dispatch(
      renamingKind === 'panel'
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
  <button class="aw-lib-scrim" type="button" aria-label="Close library" onclick={onClose}></button>
  <aside
    class="aw-lib-drawer"
    class:aw-sheet={isPhone}
    aria-label="Widget Library"
    use:focusTrap={{ onClose }}
    use:bottomSheetSwipe={{ enabled: isPhone, onClose, scrollContainer: () => scrollEl }}
  >
    <!-- T23: grab bar for the phone bottom-sheet presentation (CSS-hidden on desktop). -->
    <div class="aw-lib-grip" aria-hidden="true"></div>
    <header class="aw-lib-head">
      <span>Widget Library</span>
      <button type="button" class="aw-lib-close" title="Close" aria-label="Close library" data-autofocus onclick={onClose}>×</button>
    </header>

    <div class="aw-lib-scroll" bind:this={scrollEl}>
      <section class="aw-lib-section">
        <h2>Import · Export</h2>
        <div class="aw-lib-io">
          <button type="button" class="aw-lib-io-btn" onclick={() => fileInput?.click()}>Import .json</button>
          <button type="button" class="aw-lib-io-btn" disabled={!layout} onclick={exportActiveLayout}>
            Export Current Layout
          </button>
          <input
            bind:this={fileInput}
            class="aw-lib-file"
            type="file"
            accept="application/json,.json"
            aria-label="Import layout or panel package"
            onchange={onImportFile}
          />
        </div>
        {#if status}
          <p class="aw-lib-status" class:error={status.tone === 'error'} role="status">{status.message}</p>
        {/if}
      </section>

      {#if backups.length}
        <section class="aw-lib-section">
          <h2>Backups</h2>
          <div class="aw-lib-list">
            {#each backups as entry (entry.slot)}
              <div class="aw-lib-row saved" title={`Backup generation ${entry.slot}`}>
                <span class="aw-lib-ico">⧗</span>
                <span>{backupTimestamp(entry)}</span>
                <i>{entry.layoutCount} {entry.layoutCount === 1 ? 'layout' : 'layouts'}</i>
                {#if confirmBackupSlot === entry.slot}
                  <button class="aw-lib-save" type="button" onclick={() => restoreBackup(entry)}>Confirm</button>
                  <button type="button" onclick={() => (confirmBackupSlot = null)}>Cancel</button>
                {:else}
                  <button
                    class="aw-lib-load"
                    type="button"
                    title="Replace the current document with this backup (the current one is backed up first)"
                    onclick={() => (confirmBackupSlot = entry.slot)}
                  >
                    Restore
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if savedLayouts.length}
        <section class="aw-lib-section">
          <h2>Saved Layouts · Export</h2>
          <div class="aw-lib-list">
            {#each savedLayouts as saved (saved.id)}
              <div class="aw-lib-row saved" title={saved.label}>
                <span class="aw-lib-ico">▦</span>
                <span>{saved.label}</span>
                <button class="aw-lib-export" type="button" onclick={() => exportSavedLayout(saved.id, saved.label)}>
                  Export
                </button>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <section class="aw-lib-section">
        <h2>Target</h2>
        <div class="aw-lib-targets">
          <label>
            <span>Panels</span>
            <select bind:value={targetRegion}>
              {#each DOCK_REGION_IDS as region}
                <option value={region}>{region}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Widgets</span>
            <select bind:value={targetZone}>
              {#each DEFAULT_WIDGET_ZONES.filter((zone) => zone !== 'hidden') as zone}
                <option value={zone}>{zone}</option>
              {/each}
            </select>
          </label>
        </div>
      </section>

      {#if panelTemplates.length || widgetTemplates.length}
        <section class="aw-lib-section">
          <h2>Saved · Tap To Load</h2>
          <div class="aw-lib-list">
            {#each panelTemplates as template (template.id)}
              <div
                class="aw-lib-row saved"
                title={template.title}
              >
                <span class="aw-lib-ico">▤</span>
                {#if renamingKind === 'panel' && renamingTemplateId === template.id}
                  <input class="aw-lib-rename" bind:value={renameDraft} aria-label="Template title" onkeydown={renameKeydown} />
                  <button class="aw-lib-save" type="button" onclick={commitRename}>Save</button>
                  <button type="button" onclick={cancelRename}>Cancel</button>
                {:else}
                  <span>{template.title}</span>
                  <i>{Object.keys(template.panels).length} panel</i>
                  <button
                    class="aw-lib-load"
                    type="button"
                    onclick={() => controller.dispatchMany(instantiatePanelTemplateCommands($controller.document, template, { region: targetRegion }))}
                  >
                    Load
                  </button>
                  <button class="aw-lib-rename-btn" type="button" onclick={() => startRename('panel', template.id, template.title)}>
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
            {/each}
            {#each widgetTemplates as template (template.id)}
              <div
                class="aw-lib-row saved"
                title={template.title}
              >
                <span class="aw-lib-ico">⛁</span>
                {#if renamingKind === 'widget' && renamingTemplateId === template.id}
                  <input class="aw-lib-rename" bind:value={renameDraft} aria-label="Template title" onkeydown={renameKeydown} />
                  <button class="aw-lib-save" type="button" onclick={commitRename}>Save</button>
                  <button type="button" onclick={cancelRename}>Cancel</button>
                {:else}
                  <span>{template.title}</span>
                  <i>{Object.keys(template.widgets).length} widgets</i>
                  <button
                    class="aw-lib-load"
                    type="button"
                    onclick={() => controller.dispatchMany(instantiateWidgetTemplateCommands($controller.document, template, { zone: targetZone }))}
                  >
                    Load
                  </button>
                  <button class="aw-lib-rename-btn" type="button" onclick={() => startRename('widget', template.id, template.title)}>
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
            {/each}
          </div>
        </section>
      {/if}

      <section class="aw-lib-section">
        <h2>Hidden · Tap To Add</h2>
        <div class="aw-lib-list">
          {#each hiddenWidgets as widget (widget.id)}
            <button
              class="aw-lib-row add"
              type="button"
              title={widgetTitle(widget)}
              onclick={() => controller.dispatch({ type: 'widget.move', widgetIds: [widget.id], zone: targetZone })}
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
  /* T23: below phone width the library becomes a bottom sheet — full width,
     rounded top, grab bar, slides up. Swipe the sheet down (when the list is
     scrolled to the top) to close. Slide via keyframe animation (this component
     is not geometry-guarded, but keeping it consistent with the dock sheets). */
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
  .aw-lib-targets {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .aw-lib-targets label {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .aw-lib-targets span {
    color: var(--aw-text-faint);
    font: 800 9px/1 var(--aw-font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .aw-lib-targets select {
    width: 100%;
    height: 30px;
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 24%, var(--aw-border));
    border-radius: 8px;
    background: var(--aw-bg);
    color: var(--aw-text);
    font: 700 11px/1 var(--aw-font-mono);
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
  .aw-lib-drawer :is(button, select, input):focus-visible {
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
  /* T29: import/export toolbar + inline status line. */
  .aw-lib-io {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .aw-lib-io-btn {
    min-height: 34px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 32%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 8%, var(--aw-bg-2));
    color: var(--aw-accent);
    cursor: pointer;
    font: 800 11px/1 var(--aw-font-ui);
  }
  .aw-lib-io-btn:hover:not(:disabled) {
    border-color: var(--aw-accent);
  }
  .aw-lib-io-btn:disabled {
    opacity: 0.48;
    cursor: default;
  }
  .aw-lib-file {
    display: none;
  }
  .aw-lib-status {
    margin: 8px 0 0;
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
