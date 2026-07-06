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
  // V13a: the old single "library" drawer is split into purpose-built views.
  // `libraryView` selects which browser the shared drawer renders; a null value
  // means it is closed. Layouts open their own drawer.
  let libraryView = $state<'panels' | 'widgets' | null>(null);
  let layoutsOpen = $state(false);

  function toggleEdit() {
    if ($controller.editMode) {
      libraryView = null;
      layoutsOpen = false;
    }
    controller.toggleEditMode();
  }

  function openPanels() {
    layoutsOpen = false;
    libraryView = 'panels';
  }

  function openWidgets() {
    layoutsOpen = false;
    libraryView = 'widgets';
  }

  function openLayouts() {
    libraryView = null;
    layoutsOpen = true;
  }

  function undoLayout() {
    controller.undoLayout();
  }

  function redoLayout() {
    controller.redoLayout();
  }

  // Layout undo/redo keyboard shortcuts — ONLY while editing, and ONLY when focus
  // is not inside a text field. We stopPropagation + preventDefault so the app's
  // device-history handler (Ctrl/Cmd+Z on the same window) never also fires. When
  // not editing, this listener is not mounted at all, so the device shortcuts win.
  $effect(() => {
    if (!$controller.editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      if (isUndo) controller.undoLayout();
      else controller.redoLayout();
    };
    // Capture phase so we intercept before the app-level document listener.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

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

<!-- Directive 3: the collapsed Customize control now lives inside the bottom bar
     (WorkbenchHost renders it, leftmost, in both nav modes). This component is
     the EXPANDED edit ribbon only — an overlay that appears while editing. It
     renders nothing when not in edit mode. -->
{#if $controller.editMode}
  <div class="aw-edit-ribbon active">
    <span class="aw-edit-label">Edit Layout</span>
    {#if extras}{@render extras()}{/if}
    <button
      class="aw-edit-action"
      type="button"
      title="Undo layout change (Ctrl/Cmd+Z)"
      aria-label="Undo layout change"
      disabled={!$controller.canUndoLayout}
      onclick={undoLayout}>↶ Undo</button>
    <button
      class="aw-edit-action"
      type="button"
      title="Redo layout change (Ctrl/Cmd+Shift+Z)"
      aria-label="Redo layout change"
      disabled={!$controller.canRedoLayout}
      onclick={redoLayout}>↷ Redo</button>
    <button class="aw-edit-action" type="button" title="Browse and add panels" onclick={openPanels}>▤ Panels</button>
    <button class="aw-edit-action" type="button" title="Insert custom panel" onclick={addCustomPanel}>＋ Panel</button>
    <button class="aw-edit-action" type="button" title="Browse and add widgets" onclick={openWidgets}>▤ Widgets</button>
    <button class="aw-edit-action" type="button" title="Saved layouts, backups, import/export" onclick={openLayouts}>▤ Layouts</button>
    {#if $controller.lastResult?.error}
      <span class="aw-edit-error">{$controller.lastResult.error.message}</span>
    {/if}
    <button class="aw-edit-toggle" type="button" onclick={toggleEdit}>Done</button>
  </div>
{/if}

<WorkbenchLibraryDrawer
  open={libraryView !== null && $controller.editMode}
  view={libraryView ?? 'panels'}
  onClose={() => (libraryView = null)}
/>
<WorkbenchLayoutDrawer open={layoutsOpen && $controller.editMode} onClose={() => (layoutsOpen = false)} />

<style>
  /* Directive 3: the collapsed Customize control lives in the bottom bar now.
     This ribbon is only ever the EXPANDED overlay (always `.active`) — a
     top-anchored strip below the topbar spanning from the rail to the right
     edge. */
  .aw-edit-ribbon {
    position: absolute;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 9px;
    pointer-events: none;
  }
  .aw-edit-ribbon button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    pointer-events: auto;
    font: 700 12px/1 var(--aw-font-ui);
  }
  /* T18: keyboard focus ring on every ribbon button. focus-visible only. */
  .aw-edit-ribbon button:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
  }
  .aw-edit-ribbon.active {
    left: var(--aw-rail-w, 58px);
    right: 0;
    top: calc(58px + var(--aw-safe-top, 0px));
    min-height: 52px;
    height: auto;
    max-width: none;
    padding: 11px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--aw-accent) 24%, var(--aw-border));
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
  .aw-edit-ribbon .aw-edit-action:hover:not(:disabled) {
    color: var(--aw-text);
    border-color: var(--aw-accent);
  }
  .aw-edit-ribbon .aw-edit-action:disabled {
    cursor: default;
    opacity: 0.42;
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
