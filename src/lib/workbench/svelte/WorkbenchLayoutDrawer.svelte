<script lang="ts" module>
  /**
   * App-provided backup seam. The drawer is generic — it cannot know where (or
   * whether) the host keeps document backups. A host that has them registers a
   * provider here (module singleton, the same seam shape as toasts.ts) and the
   * Layouts drawer grows a "Backups" section. Chosen over threading a prop from
   * the host shell because the drawer is instantiated by EditRibbon inside the
   * generic renderer — a prop would have to travel WorkbenchHost → EditRibbon →
   * drawer for one optional integration.
   *
   * (V13a: moved here from WorkbenchLibraryDrawer — backups/restore now live in
   * the Layouts view alongside saved-layout export and layout import.)
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
    exportLayoutPackage,
    importLayoutPackage,
    importPanelPackage,
    layoutPackageFilename,
    selectActiveLayout
  } from '../core';
  import { getWorkbenchContext } from './context';
  import { focusTrap } from './focusTrap';
  import { bottomSheetSwipe } from './bottomSheet';
  import { canDeleteLayout, createLayoutSnapshot } from './layouts';

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
  const activeLayoutId = $derived($controller.activeProfile?.layoutId);
  const activeLayout = $derived(selectActiveLayout($controller.document));
  const layouts = $derived(Object.values($controller.document.layouts).sort((a, b) => a.label.localeCompare(b.label)));
  let renamingLayoutId = $state<string | null>(null);
  let renameDraft = $state('');

  // Inline status line (a parallel agent owns the toast surface — do NOT import
  // toasts.ts here; each `setStatus` call marks where a toast could later
  // replace the inline feedback).
  let status = $state<{ tone: 'ok' | 'error'; message: string } | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  function setStatus(tone: 'ok' | 'error', message: string) {
    status = { tone, message };
  }

  function saveSnapshot() {
    const index = Object.keys($controller.document.layouts).length + 1;
    const layout = createLayoutSnapshot($controller.document, { label: `Saved Layout ${index}` });
    if (layout) controller.dispatch({ type: 'layout.save', layout });
  }

  function startRename(layoutId: string, label: string) {
    renamingLayoutId = layoutId;
    renameDraft = label;
  }

  function commitRename() {
    if (!renamingLayoutId) return;
    const result = controller.dispatch({ type: 'layout.rename', layoutId: renamingLayoutId, label: renameDraft });
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

  function exportSavedLayout(layoutId: string, label: string) {
    const pkg = exportLayoutPackage($controller.document, layoutId);
    if (!pkg) {
      setStatus('error', `Could not export "${label}".`); // toast candidate
      return;
    }
    downloadJson(layoutPackageFilename(label), pkg);
    setStatus('ok', `Exported "${label}".`); // toast candidate
  }

  // Import a layout OR panel package. Imported layouts are ADDED (layout.save)
  // and NOT auto-applied; imported panels land in the panel library; every id
  // is re-minted upstream.
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
      if (result.success) setStatus('ok', `Imported layout "${asLayout.payload.label}" — apply it below.`); // toast candidate
      else setStatus('error', 'Imported layout could not be saved.'); // toast candidate
      return;
    }

    const asPanel = importPanelPackage(parsed);
    if (asPanel.success) {
      const result = controller.dispatch({ type: 'library.panel.save', template: asPanel.payload });
      if (result.success) setStatus('ok', `Imported panel "${asPanel.payload.title}" — add it from the Panels browser.`); // toast candidate
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
    status = null;
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
</script>

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
      <button type="button" onclick={saveSnapshot}>Save Current Layout</button>
      <div class="aw-layout-io">
        <button type="button" class="aw-layout-io-btn" onclick={() => fileInput?.click()}>Import .json</button>
        <button type="button" class="aw-layout-io-btn" disabled={!activeLayout} onclick={() => activeLayout && exportSavedLayout(activeLayout.id, activeLayout.label)}>
          Export Current
        </button>
        <input
          bind:this={fileInput}
          class="aw-layout-file"
          type="file"
          accept="application/json,.json"
          aria-label="Import layout or panel package"
          onchange={onImportFile}
        />
      </div>
      {#if status}
        <p class="aw-layout-status" class:error={status.tone === 'error'} role="status">{status.message}</p>
      {/if}
    </div>

    <div class="aw-layout-scroll" bind:this={scrollEl}>
      {#if backups.length}
        <section class="aw-layout-section">
          <h2>Backups · Restore</h2>
          <div class="aw-layout-list">
            {#each backups as entry (entry.slot)}
              <div class="aw-layout-row backup" title={`Backup generation ${entry.slot}`}>
                <span class="aw-layout-ico">⧗</span>
                <span>{backupTimestamp(entry)}</span>
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
        <h2>Saved Layouts</h2>
        <div class="aw-layout-list">
          {#each layouts as layout (layout.id)}
            <div
              class="aw-layout-row"
              class:active={layout.id === activeLayoutId}
              title={layout.label}
            >
              {#if renamingLayoutId === layout.id}
                <input class="aw-layout-rename" bind:value={renameDraft} aria-label="Layout name" onkeydown={renameKeydown} />
                <button class="aw-layout-save" type="button" onclick={commitRename}>Save</button>
                <button class="aw-layout-cancel" type="button" onclick={cancelRename}>Cancel</button>
              {:else}
                <span>{layout.label}</span>
                <i>{layout.id === activeLayoutId ? 'active' : 'apply'}</i>
                <button
                  class="aw-layout-apply"
                  type="button"
                  disabled={layout.id === activeLayoutId}
                  onclick={() => controller.dispatch({ type: 'layout.apply', layoutId: layout.id })}
                >
                  Apply
                </button>
                <button class="aw-layout-rename-btn" type="button" onclick={() => startRename(layout.id, layout.label)}>
                  Rename
                </button>
                <button
                  class="aw-layout-export"
                  type="button"
                  title={`Export ${layout.label}`}
                  onclick={() => exportSavedLayout(layout.id, layout.label)}
                >
                  Export
                </button>
                <button
                  class="aw-layout-delete"
                  type="button"
                  disabled={!canDeleteLayout($controller.document, layout.id)}
                  title={canDeleteLayout($controller.document, layout.id) ? `Delete ${layout.label}` : 'Layout is in use'}
                  onclick={() => controller.dispatch({ type: 'layout.delete', layoutId: layout.id })}
                >
                  Delete
                </button>
              {/if}
            </div>
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
    z-index: 130;
    border: 0;
    background: rgba(0, 0, 0, 0.4);
    animation: awLayoutIn 0.16s ease;
  }
  .aw-layout-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 131;
    width: 336px;
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
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--aw-border-2);
    border-radius: 9px;
    background: var(--aw-surface);
    color: var(--aw-text-2);
    text-align: left;
  }
  .aw-layout-row:hover {
    border-color: var(--aw-accent);
  }
  .aw-layout-row.active {
    border-color: var(--aw-border);
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
  .aw-layout-row span:not(.aw-layout-ico) {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
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
  .aw-layout-delete:hover:not(:disabled) {
    color: var(--aw-danger);
    border-color: var(--aw-danger);
  }
  .aw-layout-export:hover:not(:disabled),
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
