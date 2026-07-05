<script lang="ts">
  import { getWorkbenchContext } from './context';
  import { canDeleteLayout, createLayoutSnapshot } from './layouts';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  const { controller } = getWorkbenchContext();
  const activeLayoutId = $derived($controller.activeProfile?.layoutId);
  const layouts = $derived(Object.values($controller.document.layouts).sort((a, b) => a.label.localeCompare(b.label)));
  let renamingLayoutId = $state<string | null>(null);
  let renameDraft = $state('');

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
</script>

{#if open}
  <button class="aw-layout-scrim" type="button" aria-label="Close layouts" onclick={onClose}></button>
  <aside class="aw-layout-drawer" aria-label="Layout Library">
    <header class="aw-layout-head">
      <span>Layout Library</span>
      <button type="button" title="Close" onclick={onClose}>x</button>
    </header>

    <div class="aw-layout-actions">
      <button type="button" onclick={saveSnapshot}>Save Current Layout</button>
    </div>

    <div class="aw-layout-scroll">
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
    display: flex;
    flex-direction: column;
    background: var(--aw-bg-2);
    border-left: 1px solid var(--aw-border-2);
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.5);
    animation: awLayoutSlide 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
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
  .aw-layout-actions {
    flex: none;
    padding: 14px;
    border-bottom: 1px solid var(--aw-border);
  }
  .aw-layout-actions button {
    width: 100%;
    min-height: 38px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 44%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
    color: var(--aw-accent);
    cursor: pointer;
    font: 800 12px/1 var(--aw-font-ui);
  }
  .aw-layout-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    overflow-y: auto;
    padding: 14px;
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
  .aw-layout-row span {
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
    min-width: 58px;
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
  .aw-layout-save:hover:not(:disabled) {
    color: var(--aw-accent);
  }
  @keyframes awLayoutIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes awLayoutSlide {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
</style>
