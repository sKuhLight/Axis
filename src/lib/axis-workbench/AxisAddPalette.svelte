<script lang="ts">
  import { untrack } from 'svelte';
  import PaletteShell from '../PaletteShell.svelte';
  import ContextMenu from '../workbench/svelte/ContextMenu.svelte';
  import DockThumbnail from '../workbench/svelte/DockThumbnail.svelte';
  import { getWorkbenchContext } from '../workbench/svelte/context';
  import {
    ADD_PALETTE_FILTERS,
    addPaletteTargetChip,
    addResultCountLabel,
    filterAddCatalog,
    type AddCatalogItem,
    type AddPaletteFilter
  } from '../workbench/svelte/addCatalog';
  import type { WorkbenchAddPaletteApi } from '../workbench/svelte/addPalette';
  import type { WidgetInstance, WorkbenchCommand } from '../workbench';
  import { axisPanelGlyph, axisWidgetGlyph, axisWidgetPreviewIsStatic, axisWidgetPreviewScale } from './axisAddPalette';

  /**
   * The Axis Add palette (registered with `registerAddPalette`): the shared
   * PaletteShell (search, All · Panels · Pages · Widgets chips, keys, phone
   * sheet) with a preview GRID. Cards: widgets render the real widget at its
   * default size, inert (static previews for types with mount side effects);
   * panels a schematic pane with their glyph; pages a mini-map of their dock.
   * What a card does — place by click, drag, fixed context target — is the
   * workbench's (`api`).
   */
  let { api }: { api: WorkbenchAddPaletteApi } = $props();
  const { controller, registry } = getWorkbenchContext();

  let query = $state('');
  let filter = $state<AddPaletteFilter>(untrack(() => api.request.filter));
  let hi = $state(0);

  const all = $derived.by(() => {
    void $controller;
    return api.items();
  });
  const items = $derived(filterAddCatalog(all, filter, query));
  const pageNote = $derived.by(() => {
    void $controller;
    return api.pageNote();
  });
  const SECTION_LABELS: Record<AddCatalogItem['kind'], string> = { panel: 'PANELS', page: 'PAGES', widget: 'WIDGETS' };
  // Full-width rows inside the grid: a section header (All, no search) and the
  // page note. ↑↓ follow the grid rows they cut (PaletteShell `rowBreaks`).
  const sectionAt = (index: number): boolean =>
    filter === 'all' && !query.trim() && (index === 0 || items[index - 1].kind !== items[index].kind);
  const noteAt = (index: number): boolean =>
    items[index].kind === 'page' && !!pageNote && (index === 0 || items[index - 1].kind !== 'page');
  const rowBreaks = $derived(items.map((_, index) => index).filter((index) => index > 0 && (sectionAt(index) || noteAt(index))));

  // Phone: the palette is a bottom sheet.
  let narrow = $state(false);
  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 760px)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
  const mobile = $derived(narrow || $controller.activeProfile?.breakpoint === 'phone');

  // Columns of the card grid (↑↓ move by a row).
  let gridEl = $state<HTMLElement | null>(null);
  let columns = $state(1);
  $effect(() => {
    const el = gridEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const template = getComputedStyle(el).gridTemplateColumns;
      columns = Math.max(1, template.split(' ').filter(Boolean).length);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
  // Keep the highlighted card in view while the keyboard moves.
  $effect(() => {
    const index = hi;
    const el = gridEl?.querySelector<HTMLElement>(`[data-card-index="${index}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  });

  // Template ⋯ menu (rename · export · delete).
  let menuItem = $state<AddCatalogItem | null>(null);
  let menuAnchor = $state<HTMLElement | null>(null);
  const menuItems = $derived.by(() => {
    void $controller;
    return menuItem ? api.templateMenu(menuItem) : [];
  });
  function openTemplateMenu(item: AddCatalogItem, event: MouseEvent) {
    event.stopPropagation();
    menuAnchor = event.currentTarget as HTMLElement;
    menuItem = item;
  }

  function choose(item: AddCatalogItem, event: MouseEvent) {
    // A keyboard-activated button click has detail 0: no pointer, the first spot gets focus.
    api.choose(item, event.detail === 0 ? null : { x: event.clientX, y: event.clientY });
  }

  const noopDispatch = (_command: WorkbenchCommand) => {};
  const previewOf = (item: AddCatalogItem): WidgetInstance | null => api.widgetPreview(item);
  const staticPreview = (item: AddCatalogItem): boolean =>
    item.kind === 'widget' && (!!item.disabled || (item.entry.types ?? [item.entry.type]).some(axisWidgetPreviewIsStatic));
  const scaleOf = (type: string): number => axisWidgetPreviewScale(registry.widgetSizing?.estWidth(type) ?? 120);
  /**
   * Fit a live widget preview into its card: the estimated width is only the
   * first guess — measure the rendered widget and scale it down (never up) so
   * nothing is clipped.
   */
  function fitPreview(node: HTMLElement) {
    if (typeof ResizeObserver === 'undefined') return;
    const area = node.closest<HTMLElement>('.ap-preview');
    const fit = () => {
      const room = (area?.clientWidth ?? 0) - 16;
      const natural = node.offsetWidth;
      if (room > 0 && natural > 0) node.style.setProperty('--ap-scale', String(Math.min(1, room / natural)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    if (area) observer.observe(area);
    return { destroy: () => observer.disconnect() };
  }
  const panelGlyph = (item: AddCatalogItem): string => (item.kind === 'panel' ? axisPanelGlyph(item.entry.type) : '▢');
</script>

{#snippet manageLinks()}
  <span class="ap-manage">Manage:</span>
  <button type="button" class="ap-link" data-manage="pages" onclick={() => api.manage('pages')}>Pages &amp; panels</button>
  <button type="button" class="ap-link" data-manage="widgets" onclick={() => api.manage('widgets')}>Widgets</button>
{/snippet}

{#snippet preview(item: AddCatalogItem)}
  {#if item.kind === 'widget'}
    {#if staticPreview(item)}
      <span class="ap-static" data-preview="static">
        <span class="ap-static-glyph" aria-hidden="true">{axisWidgetGlyph(item.entry.type)}</span>
        <span class="ap-static-name">{item.title}</span>
      </span>
    {:else}
      {@const instance = previewOf(item)}
      {@const Widget = instance ? registry.widget(instance.type) : undefined}
      {#if instance && Widget}
        <span class="ap-live" data-preview="live" inert>
          <span class="ap-live-inner" style={`--ap-scale:${scaleOf(instance.type)}`} use:fitPreview>
            <Widget widget={instance} size="default" dispatch={noopDispatch} editMode={false} />
          </span>
        </span>
      {/if}
    {/if}
    {#if item.entry.source === 'template' && (item.entry.widgetCount ?? 1) > 1}
      <span class="ap-more-count">+{(item.entry.widgetCount ?? 1) - 1}</span>
    {/if}
  {:else if item.kind === 'panel'}
    <span class="ap-pane" data-preview="panel">
      <span class="ap-pane-head"><span class="ap-pane-tab">{item.title}</span></span>
      <span class="ap-pane-body"><span class="ap-pane-glyph" aria-hidden="true">{item.entry.multiple ? '✚' : panelGlyph(item)}</span></span>
    </span>
  {:else if item.page.action === 'host' && !item.dock}
    <span class="ap-static" data-preview="action"><span class="ap-static-glyph" aria-hidden="true">↺</span></span>
  {:else}
    <span class="ap-thumb" data-preview="page"><DockThumbnail dock={item.dock} titles={item.titles} label={`${item.title} layout`} /></span>
  {/if}
{/snippet}

<PaletteShell
  open={true}
  {mobile}
  overlay
  wide
  label="Add to the layout"
  bind:query
  bind:hi
  placeholder="Search panels, pages, widgets…"
  inputLabel="Search panels, pages and widgets"
  count={addResultCountLabel(items.length)}
  target={addPaletteTargetChip(api.request.target)}
  filters={ADD_PALETTE_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
  {filter}
  onFilter={(id) => (filter = id as AddPaletteFilter)}
  itemCount={items.length}
  {columns}
  {rowBreaks}
  onPick={(index) => {
    const item = items[index];
    if (item) api.choose(item, null);
  }}
  onClose={() => api.close()}
  hints={mobile ? [] : ['↑↓←→ Select', '⏎ Choose', 'Drag a card to place it', 'Esc Close']}
  footEnd={manageLinks}
  escapeAnywhere
>
  {#if items.length === 0}
    <div class="ap-empty">No matches for “{query}”.</div>
  {:else}
    <div class="ap-grid" class:mob={mobile} bind:this={gridEl} data-add-palette-grid>
      {#each items as item, index (item.key)}
        {#if sectionAt(index)}
          <div class="ap-section mono">{SECTION_LABELS[item.kind]}</div>
        {/if}
        {#if noteAt(index)}
          <div class="ap-note" data-page-note>{pageNote}</div>
        {/if}
        <div
          class="ap-cell"
          class:hi={index === hi}
          class:off={!!item.disabled}
          data-add-card={item.key}
          data-kind={item.kind}
          data-tone={item.tone}
          data-card-index={index}
        >
          <button
            class="ap-card"
            type="button"
            disabled={!!item.disabled}
            title={item.disabled ? `${item.title} · ${item.disabled}` : `${item.title} · click, then click a highlight · or drag it`}
            aria-label={`${item.title} · ${item.status}`}
            onpointerenter={() => (hi = index)}
            onpointerdown={(event) => api.startDrag(item, event)}
            onclick={(event) => choose(item, event)}
          >
            <span class="ap-preview">{@render preview(item)}</span>
            <span class="ap-title">{item.title}</span>
            <span class="ap-status" data-status>{item.status}</span>
          </button>
          {#if item.template}
            <button
              class="ap-dots"
              type="button"
              aria-haspopup="menu"
              title="Template actions"
              aria-label={`Template actions for ${item.title}`}
              onclick={(event) => openTemplateMenu(item, event)}
            >⋯</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</PaletteShell>

<ContextMenu
  open={!!menuItem}
  anchor={menuAnchor}
  items={menuItems}
  label="Template actions"
  overlay
  onClose={() => (menuItem = null)}
/>

<style>
  .ap-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    gap: 10px;
    padding: 4px 6px 6px;
  }
  .ap-grid.mob {
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 8px;
  }
  .ap-section {
    grid-column: 1 / -1;
    font: 600 10px/1 var(--font-mono);
    color: var(--textmuted);
    letter-spacing: 0.1em;
    padding: 10px 4px 0;
  }
  .ap-note {
    grid-column: 1 / -1;
    padding: 0 4px;
    color: var(--text-faint);
    font-size: 11px;
  }
  .ap-cell {
    position: relative;
    min-width: 0;
    border-radius: 12px;
  }
  .ap-card {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 8px 10px;
    border: 1px solid var(--surface-3);
    border-radius: 12px;
    background: var(--panel-2);
    color: var(--text);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    /* Touch: a vertical swipe scrolls the grid natively; a sideways pull drags
       the card out (addPalette.ts startDrag). */
    touch-action: pan-y;
  }
  .ap-card:hover {
    border-color: var(--border3);
  }
  .ap-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .ap-cell.hi .ap-card {
    background: var(--accent-tint);
    border-color: var(--accent-border);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .ap-cell.off .ap-card {
    cursor: default;
    opacity: 0.45;
  }
  .ap-cell.off.hi .ap-card {
    background: var(--panel-2);
    box-shadow: none;
  }
  .ap-preview {
    position: relative;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 8px;
    background: var(--bg2);
    box-shadow: inset 0 0 0 1px var(--surface2);
  }
  /* The real widget, inert (no pointer, no focus), scaled down when wider than the card. */
  .ap-live {
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ap-live-inner {
    flex: none;
    display: inline-flex;
    transform: scale(var(--ap-scale, 1));
    transform-origin: center;
  }
  .ap-static {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border: 1px dashed var(--border3);
    border-radius: 9px;
    color: var(--textdim);
  }
  .ap-static-glyph {
    font-size: 18px;
    color: var(--accent);
  }
  .ap-static-name {
    font-size: 12px;
    font-weight: 600;
  }
  .ap-more-count {
    position: absolute;
    right: 6px;
    bottom: 6px;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--surface2);
    color: var(--textdim);
    font: 600 10px/1.2 var(--font-mono);
  }
  /* Panel schematic: a mini pane — tab head + body with the panel glyph. */
  .ap-pane {
    width: 76%;
    height: 56px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 6px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--border2);
  }
  .ap-pane-head {
    flex: none;
    display: flex;
    padding: 4px;
  }
  .ap-pane-tab {
    max-width: 100%;
    overflow: hidden;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--accent-tint);
    color: var(--accentbright);
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 9px;
    font-weight: 700;
  }
  .ap-pane-body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--textdim);
    font-size: 18px;
  }
  .ap-thumb {
    display: flex;
    width: 82%;
    height: 60px;
  }
  .ap-title {
    min-width: 0;
    overflow: hidden;
    padding-right: 22px;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .ap-status {
    min-width: 0;
    overflow: hidden;
    color: var(--textfaint);
    font-size: 11px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .ap-cell[data-tone='here'] .ap-status,
  .ap-cell[data-tone='new'] .ap-status {
    color: var(--accent);
  }
  .ap-cell[data-tone='elsewhere'] .ap-status {
    color: var(--amber);
  }
  .ap-dots {
    position: absolute;
    right: 6px;
    bottom: 26px;
    width: 26px;
    height: 24px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--textdim);
    cursor: pointer;
    font-size: 15px;
  }
  .ap-dots:hover,
  .ap-dots:focus-visible {
    background: var(--surface2);
    color: var(--text);
    outline: none;
  }
  .ap-empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
  .ap-manage {
    color: var(--text-faint);
  }
  .ap-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
  }
  .ap-link:hover {
    text-decoration: underline;
  }
</style>
