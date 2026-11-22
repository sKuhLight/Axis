<script lang="ts">
  import { tick, untrack } from 'svelte';
  import ContextMenu from './ContextMenu.svelte';
  import WorkbenchLayoutDrawer from './WorkbenchLayoutDrawer.svelte';
  import WorkbenchLibraryDrawer from './WorkbenchLibraryDrawer.svelte';
  import { createCustomPanelCommands, createWorkbenchId, type ViewportClass, type WorkbenchCommandResult } from '../core';
  import { getWorkbenchContext } from './context';
  import type { WorkbenchMenuItem } from './contextMenu';
  import {
    buildAddMenuItems,
    buildLayoutMenuItems,
    buildMoreMenuItems,
    buildPageMenuItems,
    buildProfileMenuItems,
    editBarMoreLabel,
    resolveEditBarStatus,
    type WorkbenchEditBarExtension
  } from './editBarMenus';
  import {
    editBarIsTouch,
    estimateEditBarGroups,
    estimateErrorWidth,
    estimateStatusWidth,
    resolveEditBarLayout,
    type EditBarGroupId,
    type EditBarOverflowGroupId
  } from './editBarLayout';
  import {
    applySavedPageLayout,
    exportActivePageLayout,
    importLayoutFile,
    listWorkbenchBackups,
    restoreWorkbenchBackup,
    runWorkbenchExport,
    savePageAsLayout,
    type WorkbenchBackupEntry,
    type WorkbenchLayoutActionStatus
  } from './layoutActions';
  import { layoutHistoryShortcut } from './layoutHistory';
  import { instantiatePanelTemplateCommands } from './library';
  import { canDeleteNavigationPage } from './navigation';

  /**
   * The full-window-width edit bar (Customize mode). Rendered by WorkbenchHost
   * ABOVE the app, in normal flow, only while editing. One slim row: CUSTOMIZE
   * tag · Undo/Redo · PAGE ▾ · LAYOUT ▾ · profile · Add ▾ · status · ⋯ · Done.
   * Groups collapse into ⋯ More when the bar is too narrow (editBarLayout.ts).
   * The host contributes LAYOUT items and the PROFILE control as data
   * (`extension`); everything else is generic.
   */
  let { extension }: { extension?: WorkbenchEditBarExtension } = $props();

  const { controller } = getWorkbenchContext();

  type MenuId = EditBarOverflowGroupId | 'more';

  // Drawers (Library: pages / widgets views; Layouts) — owned here, as before.
  let libraryView = $state<'pages' | 'widgets' | null>(null);
  let layoutsOpen = $state(false);
  // The one open bar menu and its trigger.
  let openMenu = $state<MenuId | null>(null);
  let menuAnchor = $state.raw<HTMLElement | null>(null);
  let backups = $state.raw<WorkbenchBackupEntry[]>([]);
  // Inline feedback of layout actions (save / apply / import / export / restore).
  let notice = $state<WorkbenchLayoutActionStatus | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  // The command result whose error is not shown (compared by identity): the one
  // the user dismissed — initially whatever result already existed when the bar
  // mounted, so an error from before entering Customize never resurfaces.
  let dismissedResult = $state.raw<WorkbenchCommandResult | null>(untrack(() => controller.lastResult));
  let fileInput = $state<HTMLInputElement | null>(null);

  // ── Geometry: the bar measures its own width ────────────────────────────
  let barEl = $state<HTMLElement | null>(null);
  let barWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1440);
  let contentWidth = $state(typeof window !== 'undefined' ? window.innerWidth - 22 : 1418);
  $effect(() => {
    const el = barEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const style = getComputedStyle(el);
      barWidth = el.offsetWidth;
      contentWidth = el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
  const touch = $derived(editBarIsTouch(barWidth));

  // ── Labels (re-read on every controller change) ─────────────────────────
  const pages = $derived($controller.pages);
  const activePage = $derived($controller.activePage);
  const pageLabel = $derived(activePage?.label ?? 'None');
  const layoutLabel = $derived.by(() => {
    void $controller;
    return extension?.layout?.label() ?? 'Saved';
  });
  const profileLabel = $derived.by(() => {
    void $controller;
    return extension?.profile?.label() ?? '';
  });
  const profileOptions = $derived.by(() => {
    void $controller;
    return extension?.profile?.options() ?? [];
  });

  // ── Status / error (pure derivation in editBarMenus.ts) ─────────────────
  const barStatus = $derived(
    resolveEditBarStatus({
      dragging: !!$controller.drag,
      notice,
      lastResult: $controller.lastResult,
      dismissedResult
    })
  );
  const errorMessage = $derived(barStatus.error);
  const statusText = $derived(barStatus.text);

  function showNotice(status: WorkbenchLayoutActionStatus) {
    notice = status;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = null;
    if (status.tone === 'ok') {
      noticeTimer = setTimeout(() => {
        notice = null;
        noticeTimer = null;
      }, 5000);
    }
  }
  $effect(() => () => {
    if (noticeTimer) clearTimeout(noticeTimer);
  });

  function dismissError() {
    if (notice?.tone === 'error') notice = null;
    dismissedResult = $controller.lastResult;
  }

  // ── Overflow layout ─────────────────────────────────────────────────────
  // `slack` self-corrects estimate drift: if the rendered row still overflows,
  // the overflow is added to the estimate (reset whenever the inputs change).
  // Each measure captures its base synchronously and only the LATEST queued
  // measure may write, so two pending measures never add the same overflow twice.
  let slack = $state(0);
  let slackKey = '';
  let slackGeneration = 0;
  const groups = $derived(
    estimateEditBarGroups({
      touch,
      pageLabel,
      layoutLabel,
      profile: extension?.profile
        ? { label: profileLabel, options: profileOptions.map((o) => ({ label: o.label, icon: !!o.viewportClass })) }
        : null
    })
  );
  const layout = $derived(
    resolveEditBarLayout({
      available: contentWidth,
      touch,
      groups,
      statusWidth: estimateStatusWidth(statusText),
      errorWidth: errorMessage ? estimateErrorWidth(errorMessage) : 0,
      slack
    })
  );
  const hidden = $derived(new Set<EditBarGroupId>(layout.hidden));
  const profileAlt = $derived(layout.alt.includes('profile'));
  // A primitive summary of the rendered arrangement: the measure below re-runs
  // only when what is on screen changes, not on every controller emit (drags).
  const layoutKey = $derived(
    `${layout.hidden.join(',')}|${layout.alt.join(',')}|${layout.showStatus}|${layout.showMore}`
  );
  $effect(() => {
    const key = `${Math.round(contentWidth)}|${touch}|${pageLabel}|${layoutLabel}|${profileLabel}|${!!errorMessage}`;
    if (key !== slackKey) {
      slackKey = key;
      slack = 0;
    }
    void layoutKey;
    const base = slack;
    const generation = ++slackGeneration;
    const wrapping = touch; // touch rows wrap instead of clipping
    void tick().then(() => {
      const el = barEl;
      if (!el || wrapping || generation !== slackGeneration) return;
      const over = el.scrollWidth - el.clientWidth;
      if (over > 1 && base + over <= 600) slack = base + over;
    });
  });

  // A menu whose trigger collapsed away closes rather than float loose — but
  // ONLY on an actual resize of the bar. State changes made from inside a menu
  // (e.g. a rejected rename showing the error chip) must never close it.
  let lastResizeWidth = -1;
  $effect(() => {
    const width = Math.round(contentWidth);
    if (width === lastResizeWidth) return;
    const first = lastResizeWidth < 0;
    lastResizeWidth = width;
    if (first) return;
    untrack(() => {
      if (openMenu && openMenu !== 'more' && hidden.has(openMenu)) openMenu = null;
      if (openMenu === 'more' && !layout.showMore) openMenu = null;
    });
  });

  // ── Drawers ─────────────────────────────────────────────────────────────
  function openLibrary(view: 'pages' | 'widgets') {
    layoutsOpen = false;
    libraryView = view;
  }
  function openLayouts() {
    libraryView = null;
    layoutsOpen = true;
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  function undoLayout() {
    controller.undoLayout();
  }
  function redoLayout() {
    controller.redoLayout();
  }

  function done() {
    openMenu = null;
    libraryView = null;
    layoutsOpen = false;
    if ($controller.editMode) controller.toggleEditMode();
  }

  function addCustomPanel() {
    const template = Object.values($controller.document.panelLibrary).find(
      (item) => item.id.toLowerCase().includes('custom') || item.title.toLowerCase().includes('custom')
    );
    const commands = template
      ? instantiatePanelTemplateCommands($controller.document, template, { region: 'main' })
      : createCustomPanelCommands($controller.document, { region: 'main' });
    controller.dispatchMany(commands);
  }

  function duplicatePage(pageId: string) {
    const newPageId = createWorkbenchId('page');
    const result = controller.duplicatePage(pageId, { newPageId });
    if (result.success) controller.activatePage(newPageId);
  }

  function addPage() {
    controller.addPage({ label: `Page ${$controller.pages.length + 1}` });
  }

  async function onImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-importing the same file
    if (!file) return;
    showNotice(await importLayoutFile(controller, file));
  }

  // Layout undo/redo keyboard shortcuts — ONLY while editing, and ONLY when focus
  // is not inside a text field. We stopPropagation + preventDefault so the app's
  // device-history handler (Ctrl/Cmd+Z on the same window) never also fires. When
  // not editing, this listener is not mounted at all, so the device shortcuts win.
  const editing = $derived($controller.editMode);
  $effect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const action = layoutHistoryShortcut(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      if (action === 'undo') controller.undoLayout();
      else controller.redoLayout();
    };
    // Capture phase so we intercept before the app-level document listener.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ── Menus ───────────────────────────────────────────────────────────────
  function toggleMenu(id: MenuId, trigger: HTMLElement) {
    if (openMenu === id) {
      openMenu = null;
      return;
    }
    // The backup list is fetched each time a menu that can show it opens.
    if (id === 'layout' || id === 'more') backups = listWorkbenchBackups();
    menuAnchor = trigger;
    openMenu = id;
  }

  function pageItems(): WorkbenchMenuItem[] {
    return buildPageMenuItems({
      pages: pages.map((page) => ({ id: page.id, label: page.label })),
      activePageId: activePage?.id,
      canDelete: canDeleteNavigationPage($controller.activeLayout),
      actions: {
        activate: (pageId) => controller.activatePage(pageId),
        rename: (pageId, label) => controller.renamePage(pageId, label).success,
        duplicate: duplicatePage,
        move: (pageId, index) => controller.movePage(pageId, index),
        manage: () => openLibrary('pages'),
        remove: (pageId) => controller.removePage(pageId)
      }
    });
  }

  function layoutItems(): WorkbenchMenuItem[] {
    return buildLayoutMenuItems({
      hostItems: extension?.layout?.items() ?? [],
      savedLayouts: $controller.pageLayouts.map((entry) => ({ id: entry.id, label: entry.label })),
      backups,
      hasActivePage: !!activePage,
      actions: {
        save: () => showNotice(savePageAsLayout(controller)),
        apply: (pageLayoutId) => showNotice(applySavedPageLayout(controller, pageLayoutId)),
        manage: openLayouts,
        restore: (entry) => {
          showNotice(restoreWorkbenchBackup(entry));
          backups = listWorkbenchBackups();
        },
        importFile: () => fileInput?.click(),
        exportPage: () => showNotice(runWorkbenchExport(exportActivePageLayout(controller.document)))
      }
    });
  }

  function profileItems(): WorkbenchMenuItem[] {
    const profile = extension?.profile;
    return profile ? buildProfileMenuItems(profileOptions, (id) => profile.select(id)) : [];
  }

  function addItems(): WorkbenchMenuItem[] {
    return buildAddMenuItems({
      pageLabel: activePage?.label,
      actions: {
        addPanel: () => openLibrary('pages'),
        addCustomPanel,
        addWidget: () => openLibrary('widgets'),
        addPage,
        openLibrary: () => openLibrary('pages')
      }
    });
  }

  function groupItems(id: EditBarOverflowGroupId): WorkbenchMenuItem[] {
    switch (id) {
      case 'page':
        return pageItems();
      case 'layout':
        return layoutItems();
      case 'profile':
        return profileItems();
      case 'add':
        return addItems();
    }
  }

  const menuItems = $derived.by((): WorkbenchMenuItem[] => {
    void $controller;
    if (!openMenu) return [];
    if (openMenu !== 'more') return groupItems(openMenu);
    const labels = { page: pageLabel, layout: layoutLabel, profile: profileLabel };
    return buildMoreMenuItems(
      layout.overflow.map((id) => ({ id, label: editBarMoreLabel(id, labels), items: groupItems(id) }))
    );
  });

  const MENU_LABELS: Record<MenuId, string> = {
    page: 'Page',
    layout: 'Layout',
    profile: 'Device profile',
    add: 'Add',
    more: 'More edit tools'
  };
</script>

{#snippet viewportIcon(cls: ViewportClass)}
  {#if cls === 'phone'}
    <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4.5" y="1.75" width="7" height="12.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"></rect>
      <path d="M7 11.75h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
    </svg>
  {:else if cls === 'tablet'}
    <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.75" y="1.75" width="10.5" height="12.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"></rect>
      <path d="M7 11.75h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
    </svg>
  {:else}
    <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"></rect>
      <path d="M5.5 13.75h5M8 11v2.75" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>
    </svg>
  {/if}
{/snippet}

{#snippet chevron()}
  <svg class="aw-eb-chev" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
{/snippet}

{#snippet layersIcon()}
  <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2 14 5.2 8 8.4 2 5.2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"></path>
    <path d="M2 8.2 8 11.4 14 8.2M2 11 8 14.2 14 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"></path>
  </svg>
{/snippet}

{#snippet plusIcon()}
  <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
  </svg>
{/snippet}

<div class="aw-editbar" class:touch bind:this={barEl} role="toolbar" aria-label="Customize layout" data-editbar>
  {#if !hidden.has('tag')}
    <span class="aw-eb-tag" title="Customize mode · every layout change can be undone">
      <span class="aw-eb-pulse" aria-hidden="true"></span>CUSTOMIZE
    </span>
    <span class="aw-eb-sep" aria-hidden="true"></span>
  {/if}

  <button
    class="aw-eb-ib"
    type="button"
    data-eb="undo"
    title="Undo layout change (Ctrl/Cmd+Z)"
    aria-label="Undo layout change"
    disabled={!$controller.canUndoLayout}
    onclick={undoLayout}
  >
    <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.5 3.5 2.5 6.5l3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M2.75 6.5H10a3.5 3.5 0 0 1 0 7H7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
    </svg>
  </button>
  <button
    class="aw-eb-ib"
    type="button"
    data-eb="redo"
    title="Redo layout change (Ctrl/Cmd+Shift+Z)"
    aria-label="Redo layout change"
    disabled={!$controller.canRedoLayout}
    onclick={redoLayout}
  >
    <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.5 3.5l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M13.25 6.5H6a3.5 3.5 0 0 0 0 7h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
    </svg>
  </button>

  {#if !hidden.has('page')}
    <span class="aw-eb-sep" aria-hidden="true"></span>
    <button
      class="aw-eb-dd"
      class:open={openMenu === 'page'}
      type="button"
      data-eb="page"
      aria-haspopup="menu"
      aria-expanded={openMenu === 'page'}
      aria-label={`Page: ${pageLabel}`}
      title="This page: switch, rename, duplicate, reorder, delete"
      onclick={(e) => toggleMenu('page', e.currentTarget)}
    >
      <span class="k">Page</span>
      <span class="v">{pageLabel}</span>
      {@render chevron()}
    </button>
  {/if}

  {#if !hidden.has('layout')}
    <span class="aw-eb-sep" aria-hidden="true"></span>
    <button
      class="aw-eb-dd"
      class:open={openMenu === 'layout'}
      type="button"
      data-eb="layout"
      aria-haspopup="menu"
      aria-expanded={openMenu === 'layout'}
      aria-label={`Layout: ${layoutLabel}`}
      title="Layout: presets, saved page layouts, backups, import / export"
      onclick={(e) => toggleMenu('layout', e.currentTarget)}
    >
      {@render layersIcon()}
      <span class="k">Layout</span>
      <span class="v">{layoutLabel}</span>
      {@render chevron()}
    </button>
  {/if}

  {#if extension?.profile && !hidden.has('profile')}
    <span class="aw-eb-sep" aria-hidden="true"></span>
    {#if profileAlt}
      <button
        class="aw-eb-dd"
        class:open={openMenu === 'profile'}
        type="button"
        data-eb="profile"
        aria-haspopup="menu"
        aria-expanded={openMenu === 'profile'}
        aria-label={`Profile: ${profileLabel}`}
        title="Device profile"
        onclick={(e) => toggleMenu('profile', e.currentTarget)}
      >
        <span class="k">Profile</span>
        <span class="v">{profileLabel}</span>
        {@render chevron()}
      </button>
    {:else}
      <span class="aw-eb-seg" role="group" aria-label="Device profile" data-eb="profile">
        {#each profileOptions as option (option.id ?? '__auto__')}
          <button
            type="button"
            class:active={option.active}
            class:resolved={option.resolved}
            class:icon={!!option.viewportClass}
            aria-pressed={option.active}
            aria-label={option.label}
            title={option.title}
            onclick={() => extension?.profile?.select(option.id)}
          >
            {#if option.viewportClass}{@render viewportIcon(option.viewportClass)}{:else}{option.label}{/if}
          </button>
        {/each}
      </span>
    {/if}
  {/if}

  {#if !hidden.has('add')}
    <span class="aw-eb-sep" aria-hidden="true"></span>
    <button
      class="aw-eb-dd aw-eb-add"
      class:open={openMenu === 'add'}
      type="button"
      data-eb="add"
      aria-haspopup="menu"
      aria-expanded={openMenu === 'add'}
      aria-label="Add"
      title="Add a panel, widget or page"
      onclick={(e) => toggleMenu('add', e.currentTarget)}
    >
      {@render plusIcon()}
      <span class="v">Add</span>
      {@render chevron()}
    </button>
  {/if}

  <span class="aw-eb-flex" aria-hidden="true"></span>

  {#if errorMessage}
    <span class="aw-eb-error" role="alert" title={errorMessage}>
      <span class="aw-eb-edot" aria-hidden="true"></span>
      <span class="aw-eb-etext">{errorMessage}</span>
      <button type="button" aria-label="Dismiss error" title="Dismiss" onclick={dismissError}>×</button>
    </span>
  {:else if layout.showStatus}
    <span class="aw-eb-status" class:ok={barStatus.tone === 'ok'} role="status" title={statusText}>
      {statusText}
    </span>
  {/if}

  {#if layout.showMore}
    <button
      class="aw-eb-ib aw-eb-more"
      class:open={openMenu === 'more'}
      type="button"
      data-eb="more"
      aria-haspopup="menu"
      aria-expanded={openMenu === 'more'}
      aria-label="More edit tools"
      title="More: the groups that do not fit"
      onclick={(e) => toggleMenu('more', e.currentTarget)}
    >
      <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="3.5" cy="8" r="1.3" fill="currentColor"></circle>
        <circle cx="8" cy="8" r="1.3" fill="currentColor"></circle>
        <circle cx="12.5" cy="8" r="1.3" fill="currentColor"></circle>
      </svg>
    </button>
  {/if}

  <button class="aw-eb-done" type="button" data-eb="done" title="Leave Customize mode" onclick={done}>
    <svg class="aw-eb-ic" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
    Done
  </button>
</div>

<input
  bind:this={fileInput}
  class="aw-eb-file"
  type="file"
  accept="application/json,.json"
  aria-label="Import page layout package"
  tabindex="-1"
  onchange={onImportFile}
/>

<ContextMenu
  open={openMenu !== null}
  anchor={menuAnchor}
  boundary={barEl}
  items={menuItems}
  label={openMenu ? MENU_LABELS[openMenu] : 'Menu'}
  {touch}
  overlay
  onClose={() => (openMenu = null)}
/>

<WorkbenchLibraryDrawer
  open={libraryView !== null && $controller.editMode}
  view={libraryView ?? 'pages'}
  onClose={() => (libraryView = null)}
/>
<WorkbenchLayoutDrawer open={layoutsOpen && $controller.editMode} onClose={() => (layoutsOpen = false)} />

<style>
  /* One slim strip OUTSIDE the app, above rail and top bar, full window width.
     Neutral surface a shade darker than the app; its 1px accent line is where it
     meets the app below. 28px controls; 44px touch targets on a narrow window. */
  .aw-editbar {
    --aw-eb-hc: 28px;
    flex: none;
    position: relative;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: calc(var(--aw-editbar-h, 36px) + var(--aw-safe-top, 0px));
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    padding: var(--aw-safe-top, 0px) calc(12px + var(--aw-safe-right, 0px)) 0 calc(10px + var(--aw-safe-left, 0px));
    overflow: hidden;
    background: var(--aw-editbar-bg);
    box-shadow: inset 0 -1px 0 var(--aw-editbar-line);
    color: var(--aw-text);
    font-family: var(--aw-font-ui);
    -webkit-tap-highlight-color: transparent;
  }
  .aw-editbar.touch {
    --aw-eb-hc: 44px;
    height: auto;
    min-height: calc(52px + var(--aw-safe-top, 0px));
    padding: calc(4px + var(--aw-safe-top, 0px)) calc(10px + var(--aw-safe-right, 0px)) 4px
      calc(10px + var(--aw-safe-left, 0px));
    flex-wrap: wrap;
    row-gap: 4px;
  }
  .aw-editbar *,
  .aw-editbar *::before,
  .aw-editbar *::after {
    box-sizing: border-box;
  }
  .aw-editbar button {
    font-family: inherit;
  }
  .aw-editbar button:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
  }
  .aw-eb-ic {
    width: 14px;
    height: 14px;
    flex: none;
  }
  .aw-eb-chev {
    width: 12px;
    height: 12px;
    flex: none;
    color: var(--aw-text-muted);
  }
  .aw-eb-sep {
    flex: none;
    width: 1px;
    height: 18px;
    background: var(--aw-border-2);
  }

  .aw-eb-tag {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 8px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 32%, var(--aw-border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--aw-accent) 12%, var(--aw-editbar-bg));
    color: color-mix(in srgb, var(--aw-accent) 78%, var(--aw-text));
    font: 700 10px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
    white-space: nowrap;
  }
  .aw-eb-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--aw-accent);
    box-shadow: 0 0 6px var(--aw-accent);
    animation: awEbPulse 2.4s ease-in-out infinite;
  }

  /* Icon buttons (Undo / Redo / More). */
  .aw-eb-ib {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--aw-eb-hc);
    height: var(--aw-eb-hc);
    padding: 0 6px;
    border: 1px solid var(--aw-border);
    border-radius: 8px;
    background: var(--aw-surface);
    color: var(--aw-text-2);
    cursor: pointer;
  }
  .aw-eb-ib:hover:not(:disabled) {
    border-color: var(--aw-border-3);
    color: var(--aw-text);
  }
  .aw-eb-ib:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .aw-eb-ib.open {
    border-color: var(--aw-accent);
    color: var(--aw-text);
  }

  /* Dropdown triggers: a mono KEY, the value, a chevron. The value ellipsizes
     before anything clips. */
  .aw-eb-dd {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 220px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--aw-eb-hc);
    padding: 0 7px 0 9px;
    border: 1px solid var(--aw-border);
    border-radius: 8px;
    background: var(--aw-surface);
    color: var(--aw-text-2);
    cursor: pointer;
    white-space: nowrap;
    font: 600 12px/1 var(--aw-font-ui);
  }
  .aw-eb-dd:hover {
    border-color: var(--aw-border-3);
    color: var(--aw-text);
  }
  .aw-eb-dd.open {
    border-color: var(--aw-accent);
    box-shadow: inset 0 0 0 1px var(--aw-accent);
    color: var(--aw-text);
  }
  .aw-eb-dd .k {
    flex: none;
    color: var(--aw-text-muted);
    font: 600 10px/1 var(--aw-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .aw-eb-dd .v {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--aw-text);
    font-weight: 700;
  }
  .aw-eb-add {
    flex: none;
  }

  /* Profile segmented control (Auto + viewport-class glyphs). */
  .aw-eb-seg {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: var(--aw-eb-hc);
    padding: 2px;
    border: 1px solid var(--aw-border);
    border-radius: 8px;
    background: var(--aw-bg-2);
  }
  .aw-eb-seg button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-width: calc(var(--aw-eb-hc) - 6px);
    padding: 0 7px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--aw-text-muted);
    cursor: pointer;
    white-space: nowrap;
    font: 600 11.5px/1 var(--aw-font-ui);
  }
  .aw-eb-seg button.icon {
    padding: 0 5px;
  }
  .aw-eb-seg button:hover {
    color: var(--aw-text);
  }
  .aw-eb-seg button.active {
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  /* The profile Auto resolved to: a small accent marker under the glyph. */
  .aw-eb-seg button.resolved::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 1px;
    width: 10px;
    height: 2px;
    margin-left: -5px;
    border-radius: 1px;
    background: var(--aw-accent);
  }
  .aw-editbar.touch .aw-eb-seg {
    height: auto;
    padding: 0;
    border: 0;
    background: none;
  }
  .aw-editbar.touch .aw-eb-seg button {
    height: var(--aw-eb-hc);
    min-width: var(--aw-eb-hc);
    border: 1px solid var(--aw-border);
    border-radius: 8px;
  }

  .aw-eb-flex {
    flex: 1 1 0;
    min-width: 0;
  }
  .aw-eb-status {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--aw-text-muted);
    font: 500 12px/1.2 var(--aw-font-ui);
  }
  .aw-eb-status.ok {
    color: color-mix(in srgb, var(--aw-accent) 70%, var(--aw-text));
  }
  .aw-eb-error {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 340px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: var(--aw-eb-hc);
    padding: 0 2px 0 9px;
    border: 1px solid color-mix(in srgb, var(--aw-danger) 55%, var(--aw-border-2));
    border-radius: 8px;
    background: var(--aw-surface-2);
    color: var(--aw-text);
    font: 600 12px/1 var(--aw-font-ui);
  }
  .aw-eb-edot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--aw-danger);
  }
  .aw-eb-etext {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-eb-error button {
    flex: none;
    width: calc(var(--aw-eb-hc) - 4px);
    height: calc(var(--aw-eb-hc) - 4px);
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--aw-text-muted);
    cursor: pointer;
    font: 500 16px/1 var(--aw-font-ui);
  }
  /* Touch: the error chip takes its own second row (outside the single-row
     budget in editBarLayout.ts), so it never pushes a group into More. */
  .aw-editbar.touch .aw-eb-error {
    order: 1;
    flex: 1 1 100%;
    max-width: none;
  }
  .aw-editbar.touch .aw-eb-error button {
    width: var(--aw-eb-hc);
    height: var(--aw-eb-hc);
  }
  .aw-eb-error button:hover {
    background: var(--aw-border);
    color: var(--aw-text);
  }

  .aw-eb-done {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--aw-eb-hc);
    padding: 0 12px;
    border: 1px solid var(--aw-accent);
    border-radius: 8px;
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
    cursor: pointer;
    white-space: nowrap;
    font: 700 12px/1 var(--aw-font-ui);
  }
  .aw-eb-done:hover {
    background: color-mix(in srgb, var(--aw-accent) 78%, white);
    border-color: color-mix(in srgb, var(--aw-accent) 78%, white);
  }
  .aw-eb-file {
    display: none;
  }

  @keyframes awEbPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aw-eb-pulse {
      animation: none;
    }
  }
</style>
