<script lang="ts">
  // The save / apply / import / export / backup actions (and the app-provided
  // backup seam) live in layoutActions.ts, shared with the edit bar's LAYOUT menu.
  import { selectActivePage, type WorkbenchPageLayout } from '../core';
  import { getWorkbenchContext } from './context';
  import { focusTrap } from './focusTrap';
  import { bottomSheetSwipe } from './bottomSheet';
  import {
    applySavedPageLayout,
    exportActivePageLayout,
    exportSavedPageLayout,
    importLayoutFile,
    listWorkbenchBackups,
    restoreWorkbenchBackup,
    runWorkbenchExport,
    savePageAsLayout,
    workbenchBackupTimestamp,
    type WorkbenchBackupEntry,
    type WorkbenchLayoutActionStatus
  } from './layoutActions';

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
  // R16 / AXIS-24: the Layouts drawer is PAGE-scoped now. The big per-profile
  // layouts are the profiles (edit bar LAYOUT / PROFILE); here we manage the
  // ONE shared page-layout store — save the ACTIVE page's dock into it, apply a
  // stored layout ONTO the active page. Import/export uses the page-layout
  // package (older whole-layout / panel packages still import for compatibility).
  const activePage = $derived(selectActivePage($controller.document));
  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const pageLayouts = $derived(
    $controller.pageLayouts
      .filter((entry) => !q || entry.label.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label))
  );
  let renamingLayoutId = $state<string | null>(null);
  let renameDraft = $state('');

  // Inline status line (a parallel agent owns the toast surface — do NOT import
  // toasts.ts here; each status a layout action returns is a toast candidate).
  let status = $state<WorkbenchLayoutActionStatus | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  function saveSnapshot() {
    status = savePageAsLayout(controller);
  }

  function applyLayout(entry: WorkbenchPageLayout) {
    status = applySavedPageLayout(controller, entry.id);
  }

  function startRename(layoutId: string, label: string) {
    renamingLayoutId = layoutId;
    renameDraft = label;
  }

  function commitRename() {
    if (!renamingLayoutId) return;
    const result = controller.renamePageLayout(renamingLayoutId, renameDraft);
    if (result.success) renamingLayoutId = null;
  }

  function cancelRename() {
    renamingLayoutId = null;
    renameDraft = '';
  }

  function renameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitRename();
    if (event.key === 'Escape') cancelRename();
  }

  function exportSavedLayout(pageLayoutId: string, label: string) {
    status = runWorkbenchExport(exportSavedPageLayout($controller.document, pageLayoutId, label));
  }

  // Export the ACTIVE page directly as a page-layout package (snapshot without
  // storing it first).
  function exportCurrentPage() {
    status = runWorkbenchExport(exportActivePageLayout($controller.document));
  }

  // Import a page-layout package (primary) — ADDED to the shared store and NOT
  // auto-applied. Older whole-layout / panel packages still import for
  // compatibility (see layoutActions.applyLayoutImport).
  async function onImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-importing the same file
    if (!file) return;
    status = await importLayoutFile(controller, file);
  }

  // Backups (app-provided seam in layoutActions.ts): the list is re-read every
  // time the drawer opens; restore is a two-step inline confirm.
  let backups = $state<WorkbenchBackupEntry[]>([]);
  let confirmBackupSlot = $state<number | null>(null);
  $effect(() => {
    if (!open) return;
    backups = listWorkbenchBackups();
    confirmBackupSlot = null;
    status = null;
    query = '';
  });

  function restoreBackup(entry: WorkbenchBackupEntry): void {
    confirmBackupSlot = null;
    status = restoreWorkbenchBackup(entry);
    backups = listWorkbenchBackups();
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

{#if open}
  <button class="aw-layout-scrim" type="button" aria-label="Close layouts" onclick={onClose}></button>
  <aside
    class="aw-layout-drawer"
    class:aw-sheet={isPhone}
    aria-label="Layouts"
    use:focusTrap={{ onClose }}
    use:bottomSheetSwipe={{ enabled: isPhone, onClose, scrollContainer: () => scrollEl }}
  >
    <div class="aw-layout-grip" aria-hidden="true"></div>
    <header class="aw-layout-head">
      <span>Layouts</span>
      <button type="button" title="Close" aria-label="Close layouts" data-autofocus onclick={onClose}>×</button>
    </header>

    <div class="aw-layout-actions">
      <button type="button" onclick={saveSnapshot}>Save This Page As Layout</button>
      <div class="aw-layout-io">
        <button type="button" class="aw-layout-io-btn" onclick={() => fileInput?.click()}>Import .json</button>
        <button type="button" class="aw-layout-io-btn" disabled={!activePage} onclick={exportCurrentPage}>
          Export This Page
        </button>
        <input
          bind:this={fileInput}
          class="aw-layout-file"
          type="file"
          accept="application/json,.json"
          aria-label="Import page layout package"
          onchange={onImportFile}
        />
      </div>
      <p class="aw-layout-hint">
        Layouts apply to the active page{#if activePage} — <strong>{activePage.label}</strong>{/if}. The big
        pre-built layouts live in the edit bar’s Layout and Profile controls.
      </p>
      {#if status}
        <p class="aw-layout-status" class:error={status.tone === 'error'} role="status">{status.message}</p>
      {/if}
    </div>

    <div class="aw-layout-searchbar">
      <div class="aw-layout-search">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
          <path d="M10.8 10.8 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
        </svg>
        <input bind:value={query} placeholder="Search saved layouts…" aria-label="Search saved page layouts" />
        {#if query}
          <button type="button" class="aw-layout-search-clear" title="Clear search" aria-label="Clear search" onclick={() => (query = '')}>×</button>
        {/if}
      </div>
    </div>

    <div class="aw-layout-scroll" bind:this={scrollEl}>
      {#if backups.length}
        <section class="aw-layout-section">
          <h2>Backups · Restore</h2>
          <div class="aw-layout-list">
            {#each backups as entry (entry.slot)}
              <div class="aw-layout-row backup" title={`Backup generation ${entry.slot}`}>
                <span class="aw-layout-ico">⧗</span>
                <span>{workbenchBackupTimestamp(entry)}</span>
                <i>{entry.layoutCount} {entry.layoutCount === 1 ? 'layout' : 'layouts'}</i>
                {#if confirmBackupSlot === entry.slot}
                  <button class="aw-layout-save" type="button" onclick={() => restoreBackup(entry)}>Confirm</button>
                  <button type="button" onclick={() => (confirmBackupSlot = null)}>Cancel</button>
                {:else}
                  <button
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

      <section class="aw-layout-section">
        <h2>Saved Page Layouts</h2>
        <div class="aw-layout-list">
          {#each pageLayouts as entry (entry.id)}
            <div class="aw-layout-row" title={entry.label}>
              {#if renamingLayoutId === entry.id}
                <input class="aw-layout-rename" bind:value={renameDraft} aria-label="Layout name" onkeydown={renameKeydown} />
                <button class="aw-layout-save" type="button" onclick={commitRename}>Save</button>
                <button class="aw-layout-cancel" type="button" onclick={cancelRename}>Cancel</button>
              {:else}
                <span>{entry.label}</span>
                <i>{Object.keys(entry.panels ?? {}).length} {Object.keys(entry.panels ?? {}).length === 1 ? 'panel' : 'panels'}</i>
                <button
                  class="aw-layout-apply"
                  type="button"
                  title={`Apply “${entry.label}” to ${activePage?.label ?? 'the active page'}`}
                  onclick={() => applyLayout(entry)}
                >
                  Apply
                </button>
                <span class="aw-layout-row-actions">
                  <button class="aw-layout-icon-btn" type="button" title={`Rename ${entry.label}`} aria-label={`Rename ${entry.label}`} onclick={() => startRename(entry.id, entry.label)}>{@render iconPencil()}</button>
                  <button
                    class="aw-layout-icon-btn"
                    type="button"
                    title={`Export ${entry.label}`}
                    aria-label={`Export ${entry.label}`}
                    onclick={() => exportSavedLayout(entry.id, entry.label)}
                  >{@render iconExport()}</button>
                  <button
                    class="aw-layout-icon-btn danger"
                    type="button"
                    title={`Delete ${entry.label}`}
                    aria-label={`Delete ${entry.label}`}
                    onclick={() => controller.deletePageLayout(entry.id)}
                  >{@render iconTrash()}</button>
                </span>
              {/if}
            </div>
          {:else}
            <p class="aw-layout-empty">{q ? 'No saved layouts match your search.' : 'No saved page layouts yet — “Save This Page As Layout” above.'}</p>
          {/each}
        </div>
      </section>
    </div>
  </aside>
{/if}

<style>
  .aw-layout-scrim {
    position: fixed;
    inset: 0;
    /* Shell-overlay band: the drawers open from the edit bar and must sit above
       app chrome (nav sheet 230, dock drawer 180); edit-bar menus 239/240,
       toasts 300 and the drag layer 1000 stay above. */
    z-index: 237;
    border: 0;
    background: rgba(0, 0, 0, 0.4);
    animation: awLayoutIn 0.16s ease;
  }
  .aw-layout-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 238;
    width: 348px;
    max-width: 90vw;
    padding-right: var(--aw-safe-right, 0px);
    padding-top: var(--aw-safe-top, 0px);
    padding-bottom: var(--aw-safe-bottom, 0px);
    display: flex;
    flex-direction: column;
    background: var(--aw-bg-2);
    border-left: 1px solid var(--aw-border-2);
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.5);
    animation: awLayoutSlide 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .aw-layout-grip {
    display: none;
  }
  /* T23: below phone width the layouts drawer becomes a bottom sheet, matching
     the panel/widget browsers. */
  @media (max-width: 760px) {
    .aw-layout-drawer {
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
      border-top: 1px solid var(--aw-border-2);
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -14px 46px rgba(0, 0, 0, 0.5);
      animation: awLayoutSheetUp 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-layout-grip {
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
  .aw-layout-head {
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 17px 18px;
    border-bottom: 1px solid var(--aw-border);
  }
  .aw-layout-head span {
    color: var(--aw-text);
    font-size: 15px;
    font-weight: 800;
  }
  .aw-layout-head button {
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
  .aw-layout-drawer :is(button, input):focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
  }
  .aw-layout-actions {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border-bottom: 1px solid var(--aw-border);
  }
  .aw-layout-actions > button:first-child {
    width: 100%;
    min-height: 38px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 44%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
    color: var(--aw-accent);
    cursor: pointer;
    font: 800 12px/1 var(--aw-font-ui);
  }
  .aw-layout-io {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .aw-layout-io-btn {
    min-height: 34px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 32%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 8%, var(--aw-bg-2));
    color: var(--aw-accent);
    cursor: pointer;
    font: 800 11px/1 var(--aw-font-ui);
  }
  .aw-layout-io-btn:hover:not(:disabled) {
    border-color: var(--aw-accent);
  }
  .aw-layout-io-btn:disabled {
    opacity: 0.48;
    cursor: default;
  }
  .aw-layout-file {
    display: none;
  }
  .aw-layout-status {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 30%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 8%, transparent);
    color: var(--aw-text-2);
    font: 600 11px/1.4 var(--aw-font-mono);
    word-break: break-word;
  }
  .aw-layout-status.error {
    border-color: color-mix(in srgb, var(--aw-danger) 44%, var(--aw-border));
    background: color-mix(in srgb, var(--aw-danger) 10%, transparent);
    color: var(--aw-danger);
  }
  .aw-layout-hint {
    margin: 0;
    color: var(--aw-text-faint);
    font: 600 10.5px/1.5 var(--aw-font-ui);
  }
  .aw-layout-hint strong {
    color: var(--aw-text-2);
    font-weight: 800;
  }
  .aw-layout-searchbar {
    flex: none;
    padding: 12px 14px;
    border-bottom: 1px solid var(--aw-border);
  }
  .aw-layout-search {
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
  .aw-layout-search:focus-within {
    border-color: var(--aw-accent);
  }
  .aw-layout-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--aw-text);
    font: 600 12.5px/1 var(--aw-font-ui);
  }
  .aw-layout-search-clear {
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
  .aw-layout-empty {
    margin: 0;
    padding: 14px;
    color: var(--aw-text-faint);
    text-align: center;
    font: 600 11px/1.4 var(--aw-font-mono);
  }
  .aw-layout-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
  }
  .aw-layout-scroll::-webkit-scrollbar {
    width: 9px;
  }
  .aw-layout-scroll::-webkit-scrollbar-thumb {
    background: var(--aw-border-2);
    border: 2px solid transparent;
    border-radius: 6px;
    background-clip: padding-box;
  }
  .aw-layout-section {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-bottom: 20px;
  }
  .aw-layout-section h2 {
    margin: 0;
    color: var(--aw-text-faint);
    font: 800 9px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .aw-layout-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .aw-layout-row {
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
    text-align: left;
  }
  /* Right-aligned icon column — same fixed width as the Pages/Widgets drawer so
     rename/export/delete sit at the SAME x across every drawer view. The Apply
     text button (primary verb) stays to its left. */
  .aw-layout-row-actions {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    width: 102px;
  }
  .aw-layout-row:hover {
    border-color: var(--aw-accent);
  }
  .aw-layout-row.backup {
    background: color-mix(in srgb, var(--aw-accent) 5%, var(--aw-surface));
    border-color: color-mix(in srgb, var(--aw-accent) 30%, var(--aw-border));
  }
  .aw-layout-ico {
    flex: none;
    color: var(--aw-accent);
    font-size: 14px;
  }
  .aw-layout-row span:not(.aw-layout-ico):not(.aw-layout-row-actions) {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 800;
  }
  .aw-layout-row i {
    flex: none;
    color: var(--aw-text-faint);
    font: 700 9px/1 var(--aw-font-mono);
    font-style: normal;
  }
  .aw-layout-row button {
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
  .aw-layout-row button:hover:not(:disabled) {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-layout-row button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  /* R17 (AXIS-26): rename / export / delete are compact square ICON actions so
     the label owns the row width and nothing clips the drawer's right edge. */
  .aw-layout-row button.aw-layout-icon-btn {
    flex: none;
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .aw-layout-row button.aw-layout-icon-btn.danger:hover:not(:disabled) {
    color: var(--aw-danger);
    border-color: var(--aw-danger);
  }
  .aw-layout-save:hover:not(:disabled) {
    color: var(--aw-accent);
    border-color: var(--aw-accent);
  }
  .aw-layout-rename {
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
  .aw-layout-rename:focus {
    border-color: var(--aw-accent);
    outline: none;
  }
  @keyframes awLayoutIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes awLayoutSlide {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes awLayoutSheetUp {
    from { transform: translateY(calc(100% + 24px)); }
    to { transform: translateY(0); }
  }
</style>
