<script lang="ts">
  import { getWorkbenchContext } from './context';
  import WorkbenchLayoutDrawer from './WorkbenchLayoutDrawer.svelte';
  import WorkbenchLibraryDrawer from './WorkbenchLibraryDrawer.svelte';
  import { createCustomPanelCommands } from '../core';
  import { instantiatePanelTemplateCommands } from './library';
  import type { Snippet } from 'svelte';

  // App-specific ribbon extras (e.g. Axis LAYOUT/PROFILE preset tabs). The
  // generic ribbon stays widget-type agnostic; the host injects a snippet.
  let { extras }: { extras?: Snippet } = $props();

  const { controller } = getWorkbenchContext();
  let libraryOpen = $state(false);
  let layoutsOpen = $state(false);

  function toggleEdit() {
    if ($controller.editMode) {
      libraryOpen = false;
      layoutsOpen = false;
    }
    controller.toggleEditMode();
  }

  function openLibrary() {
    layoutsOpen = false;
    libraryOpen = true;
  }

  function openLayouts() {
    libraryOpen = false;
    layoutsOpen = true;
  }

  function addCustomPanel() {
    const template = Object.values($controller.document.panelLibrary).find((item) =>
      item.id.toLowerCase().includes('custom') || item.title.toLowerCase().includes('custom')
    );
    const commands = template
      ? instantiatePanelTemplateCommands($controller.document, template, { region: 'main' })
      : createCustomPanelCommands($controller.document, { region: 'main' });
    controller.dispatchMany(commands);
  }
</script>

<div class="aw-edit-ribbon" class:active={$controller.editMode}>
  {#if $controller.editMode}
    <span class="aw-edit-label">Edit Layout</span>
    {#if extras}{@render extras()}{/if}
    <button class="aw-edit-action" type="button" title="Show dockable panels" onclick={openLibrary}>▤ Panels</button>
    <button class="aw-edit-action" type="button" title="Insert custom panel" onclick={addCustomPanel}>＋ Panel</button>
    <button class="aw-edit-action" type="button" title="Open widget library" onclick={openLibrary}>▤ Widgets</button>
    <button class="aw-edit-action" type="button" title="Open layout library" onclick={openLayouts}>▤ Layouts</button>
    {#if $controller.lastResult?.error}
      <span class="aw-edit-error">{$controller.lastResult.error.message}</span>
    {/if}
  {/if}
  <button class="aw-edit-toggle" type="button" onclick={toggleEdit}>
    {$controller.editMode ? 'Done' : 'Customize'}
  </button>
</div>

<WorkbenchLibraryDrawer open={libraryOpen && $controller.editMode} onClose={() => (libraryOpen = false)} />
<WorkbenchLayoutDrawer open={layoutsOpen && $controller.editMode} onClose={() => (layoutsOpen = false)} />

<style>
  .aw-edit-ribbon {
    position: absolute;
    left: 14px;
    bottom: calc(14px + var(--aw-safe-bottom, 0px));
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 9px;
    pointer-events: none;
  }
  .aw-edit-ribbon button {
    height: 36px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 44%, var(--aw-border));
    border-radius: 22px;
    background: color-mix(in srgb, var(--aw-accent) 8%, var(--aw-bg-2));
    color: var(--aw-accent);
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.4);
    font: 800 13px/1 var(--aw-font-ui);
  }
  .aw-edit-ribbon.active {
    left: var(--rail-w, 66px);
    right: 0;
    top: calc(58px + var(--aw-safe-top, 0px));
    bottom: auto;
    min-height: 52px;
    height: auto;
    max-width: none;
    padding: 11px 16px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--aw-accent) 24%, var(--aw-border));
    border-radius: 0;
    background: color-mix(in srgb, var(--aw-accent) 4%, var(--aw-bg));
    flex-wrap: wrap;
    pointer-events: auto;
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.22);
  }
  .aw-edit-label {
    flex: 0 0 auto;
    color: var(--aw-accent);
    font: 800 11px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .aw-edit-ribbon .aw-edit-action {
    height: 30px;
    padding: 0 13px;
    border-color: color-mix(in srgb, var(--aw-accent) 32%, var(--aw-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-accent) 8%, var(--aw-bg-2));
    color: var(--aw-accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-shadow: none;
    font-size: 12px;
  }
  .aw-edit-ribbon .aw-edit-action:hover {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-edit-error {
    min-width: 0;
    color: var(--aw-danger);
    font: 600 11px/1.2 var(--aw-font-ui);
  }
  .aw-edit-ribbon.active .aw-edit-toggle {
    height: 30px;
    margin-left: auto;
    border-radius: 8px;
    border-color: var(--aw-accent);
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
    box-shadow: none;
    font-size: 12px;
  }
  @media (max-width: 760px) {
    .aw-edit-ribbon.active {
      left: 0;
      top: calc(58px + var(--aw-safe-top, 0px));
    }
  }
</style>
