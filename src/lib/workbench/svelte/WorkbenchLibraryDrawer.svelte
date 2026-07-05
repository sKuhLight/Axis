<script lang="ts">
  import {
    selectActiveLayout,
    selectHiddenWidgets,
    type NavigationEntryState,
    type WidgetInstance
  } from '../core';
  import { getWorkbenchContext } from './context';
  import {
    instantiatePanelTemplateCommands,
    instantiateWidgetTemplateCommands,
    labelFromWorkbenchType
  } from './library';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

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
  let renamingKind = $state<'panel' | 'widget' | null>(null);
  let renamingTemplateId = $state<string | null>(null);
  let renameDraft = $state('');

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
  <aside class="aw-lib-drawer" aria-label="Widget Library">
    <header class="aw-lib-head">
      <span>Widget Library</span>
      <button type="button" title="Close" onclick={onClose}>×</button>
    </header>

    <div class="aw-lib-scroll">
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
                    onclick={() => controller.dispatchMany(instantiatePanelTemplateCommands($controller.document, template, { region: 'main' }))}
                  >
                    Load
                  </button>
                  <button class="aw-lib-rename-btn" type="button" onclick={() => startRename('panel', template.id, template.title)}>
                    Rename
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
                    onclick={() => controller.dispatchMany(instantiateWidgetTemplateCommands($controller.document, template, { zone: 'top.right' }))}
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
              onclick={() => controller.dispatch({ type: 'widget.move', widgetIds: [widget.id], zone: 'top.right' })}
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
    display: flex;
    flex-direction: column;
    background: #0c1213;
    border-left: 1px solid #1a3a3c;
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.5);
    animation: awLibSlide 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .aw-lib-head {
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 17px 18px;
    border-bottom: 1px solid #163032;
  }
  .aw-lib-head span {
    color: #fff;
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
  .aw-lib-row.saved {
    background: #12181c;
    border-color: #2a4a44;
  }
  .aw-lib-row.add {
    background: #101d1e;
    border-color: #234d4f;
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
    color: #4fd1dc;
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
  @keyframes awLibIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes awLibSlide {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
</style>
