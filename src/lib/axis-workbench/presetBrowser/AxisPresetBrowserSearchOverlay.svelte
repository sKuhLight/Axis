<script lang="ts">
  // Slim, non-destructive preset switcher opened from the Grid page's top-bar preset widget
  // (presetWidgetTarget.ts → editor.presetSearchOpen). Search bar + results list ONLY — no sources
  // sidebar, no detail pane — mounted unconditionally like PresetPicker.svelte so the Grid panel
  // underneath never unmounts. Reuses the SAME controller/runtime/data engine as the full docked
  // Preset Browser (tag filters, saved-search grammar, device-name matching all work here for free);
  // it shares those singletons rather than a separate instance, which is safe because this overlay
  // only opens from Grid, where no Preset Browser page/panel is concurrently mounted to collide with.
  import { onMount, tick } from 'svelte';
  import { editor } from '../../editor.svelte';
  import { library, type LibEntry } from '../../library.svelte';
  import { presetRecency } from '../../presetRecency.svelte';
  import { deviceRealNames } from '../../deviceRealNames.svelte';
  import { bindAxisRuntimeHost } from '../runtimeBinding';
  import {
    createAxisPresetBrowserDataView,
    buildEmptyDeviceSlotEntries,
    type AxisPresetBrowserEntrySummary,
    type AxisPresetBrowserLibEntryLike
  } from './presetBrowserWorkbenchData';
  import { presenceViews as presenceViewDefs } from './presetBrowserWorkbenchPresence';
  import {
    axisPresetBrowserWorkbenchController,
    type AxisPresetBrowserControllerSnapshot
  } from './presetBrowserWorkbenchController';
  import { axisPresetBrowserWorkbenchRuntime } from './presetBrowserWorkbenchRuntime';
  import { createAxisPresetBrowserWorkbenchHost } from './presetBrowserWorkbenchHost';
  import { resolvePresetLoadAction } from './presetBrowserWorkbenchLoadAction';
  import { axisPbRowBlockChips } from './presetBrowserWorkbenchRowChips';
  import { matchingChainChips } from './presetBrowserWorkbenchChainMatch';
  import { openConvertedInConverter } from '../../presetConvertSource';
  import AxisPresetBrowserRowMain from './AxisPresetBrowserRowMain.svelte';

  // 512 covers every device's full preset count with room to spare, so the cap is invisible in the
  // common case (browsing one device, no search) and only bites on a huge combined "All presets" view.
  const ROW_LIMIT = 600;

  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  let snapshot = $state<AxisPresetBrowserControllerSnapshot>(axisPresetBrowserWorkbenchController.snapshot);
  // Keyboard cursor into `rows`, independent of `snapshot.entryId` (the currently LOADED preset) —
  // Enter loads whichever row this points at, defaulting to the top result.
  let highlightIndex = $state(0);

  onMount(() => {
    const unbindRuntime = bindAxisRuntimeHost({
      runtime: axisPresetBrowserWorkbenchRuntime,
      host: createAxisPresetBrowserWorkbenchHost(),
      // The overlay closes itself the moment a load is kicked off (see loadEntry), so it never needs
      // to render load-in-progress/error state from the runtime snapshot.
      onSnapshot: () => {}
    });
    const unsubscribe = axisPresetBrowserWorkbenchController.subscribe((next) => (snapshot = next));
    return () => {
      unsubscribe();
      unbindRuntime();
    };
  });

  // Fresh search every time the overlay opens, same as PresetPicker's open effect.
  $effect(() => {
    if (!editor.presetSearchOpen) return;
    axisPresetBrowserWorkbenchController.setQuery('');
    highlightIndex = 0;
    void tick().then(() => inputEl?.focus());
  });

  const baseEntries = $derived(library.entries as AxisPresetBrowserLibEntryLike[]);
  const emptyDeviceSlots = $derived.by<AxisPresetBrowserLibEntryLike[]>(() => {
    if (!library.cacheBuilt) return [];
    return buildEmptyDeviceSlotEntries(editor.presetCount, (n) => library.slotIsEmpty(n));
  });
  const activeConditions = $derived.by(() => {
    void snapshot; // re-derive on any snapshot change
    return axisPresetBrowserWorkbenchController.activeConditions;
  });
  const freeText = $derived.by(() => {
    void snapshot;
    return axisPresetBrowserWorkbenchController.freeText;
  });
  const data = $derived(createAxisPresetBrowserDataView({
    entries: baseEntries,
    filteredEntries: snapshot.presenceView === 'all' ? library.filtered : baseEntries,
    emptySlots: emptyDeviceSlots,
    sourceId: snapshot.sourceId,
    selectedEntryId: snapshot.entryId,
    tagsOf: library.tagsOf,
    lastLoadedAt: presetRecency.at,
    conditions: activeConditions,
    simpleQuery: freeText,
    realNameFor: deviceRealNames.realNameFor,
    sort: snapshot.sort,
    sortDir: snapshot.sortDir,
    presenceView: snapshot.presenceView,
    presenceViews: presenceViewDefs()
  }));
  const rows = $derived(data.visibleEntries.slice(0, ROW_LIMIT));
  // True only once the user has actually typed/filtered something — distinct from the ROW_LIMIT cap,
  // so the count/hint below never claims a "match" when nothing was searched.
  const searching = $derived(!!freeText.trim() || activeConditions.length > 0);
  // `highlightIndex` only ever moves by explicit user action (arrow keys, hover, reset-on-open/typed);
  // clamp it against the CURRENT `rows` here rather than chasing every place rows can shrink (e.g. a
  // background library refresh) with an effect — a derived clamp can't fall out of sync the way an
  // effect-driven reset can.
  const cursor = $derived(rows.length ? Math.min(highlightIndex, rows.length - 1) : 0);

  // Keep the highlighted row in view as the cursor moves past the visible scroll window.
  $effect(() => {
    if (!editor.presetSearchOpen) return;
    listEl?.querySelectorAll<HTMLElement>('.rowwrap')[cursor]?.scrollIntoView({ block: 'nearest' });
  });

  function close() {
    editor.presetSearchOpen = false;
  }

  function loadEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    const action = resolvePresetLoadAction(entry);
    if (action.kind === 'openConverter') {
      // Same cast the docked panel uses: baseEntries IS library.entries, just retyped to the summary
      // shape — casting back to LibEntry recovers the real `converted` doc.
      const raw = baseEntries.find((e) => e.id === entry.id) as unknown as LibEntry | undefined;
      if (raw?.converted) void openConvertedInConverter(raw.converted);
    } else if (action.kind === 'loadEmptySlot') {
      void editor.selectPreset(action.number, { recency: false });
    } else {
      void axisPresetBrowserWorkbenchRuntime.loadEntry(entry.id);
    }
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      if (!rows.length) return;
      e.preventDefault();
      highlightIndex = Math.min(cursor + 1, rows.length - 1);
    } else if (e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      highlightIndex = Math.max(cursor - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[cursor]) loadEntry(rows[cursor]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  const pad = (n: number) => String(n).padStart(3, '0');
</script>

{#if editor.presetSearchOpen}
  <div class="bg" class:mob={editor.isMobile} role="presentation" onclick={close}>
    <div class="card" class:sheet={editor.isMobile} role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="head">
        <div class="title-row">
          <span class="title">Find a preset</span>
          <span class="spacer"></span>
          <button class="close" aria-label="Close" onclick={close}>✕</button>
        </div>
        <div class="search">
          <svg width="18" height="18" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" stroke="var(--text-dim)" stroke-width="1.5" /><path d="M10.8 10.8 L14.5 14.5" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input
            bind:this={inputEl}
            value={snapshot.queryText}
            oninput={(e) => {
              axisPresetBrowserWorkbenchController.setQuery(e.currentTarget.value);
              highlightIndex = 0;
            }}
            onkeydown={onKey}
            placeholder="Search by name, tag, or device…"
          />
        </div>
      </div>

      <div class="list scroll" bind:this={listEl}>
        <div class="section mono">
          {#if searching}
            {rows.length} of {data.scopedTotal} MATCH{rows.length === 1 ? '' : 'ES'}
          {:else if rows.length === data.scopedTotal}
            {data.scopedTotal} PRESETS
          {:else}
            SHOWING {rows.length} OF {data.scopedTotal}
          {/if}
        </div>
        {#each rows as entry, i (entry.id)}
          {@const chainChips = matchingChainChips(axisPbRowBlockChips(entry), activeConditions, freeText)}
          <div
            class="rowwrap"
            class:active={snapshot.entryId === entry.id}
            class:highlighted={i === cursor}
            class:dimmed={entry.empty}
            role="option"
            aria-selected={i === cursor}
            tabindex="0"
            onclick={() => loadEntry(entry)}
            onmouseenter={() => (highlightIndex = i)}
            onkeydown={(e) => { if (e.key === 'Enter') loadEntry(entry); }}
          >
            <span class="num mono">{entry.number == null ? entry.sourceLabel : pad(entry.number)}</span>
            <span class="rtext">
              <AxisPresetBrowserRowMain {entry} {chainChips} />
            </span>
            {#if entry.fav}<span class="fav-b" aria-hidden="true">★</span>{/if}
          </div>
        {/each}
        {#if data.visibleEntries.length > rows.length}
          <!-- Compare against visibleEntries (the real post-query match count), NOT scopedTotal — that's
               the PRE-query source/presence total (see its doc comment in presetBrowserWorkbenchData.ts)
               and stays huge even once a search has narrowed things down, which used to make this hint
               claim hundreds of "hidden matches" that were actually just non-matches the search excluded. -->
          <div class="empty-hint">+{data.visibleEntries.length - rows.length} more — {searching ? 'refine your search' : 'type to search'}</div>
        {/if}
        {#if rows.length === 0}
          <div class="empty-hint">No presets match “{freeText || snapshot.queryText}”.</div>
        {/if}
      </div>

      <div class="foot mono">
        <span>↑↓ Navigate</span><span>⏎ Load selected</span><span>Esc Close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .bg {
    position: absolute;
    inset: 0;
    z-index: 200;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 7vh 12px 12px;
    animation: axsOverlay 0.12s ease;
  }
  .bg.mob {
    align-items: stretch;
    padding: 0;
  }
  .card {
    width: 720px;
    max-width: 100%;
    max-height: 84vh;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: axsPalette 0.15s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .card.sheet {
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 0;
    animation: axsSheet 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .head {
    padding: 16px 18px 13px;
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 13px;
  }
  .title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }
  .spacer {
    flex: 1;
  }
  .close {
    width: 34px;
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 9px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-dim);
  }
  .close:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 46px;
    padding: 0 14px;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    border-radius: 11px;
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 15px;
    font-weight: 500;
  }
  .list {
    flex: 1;
    min-height: 140px;
    overflow-y: auto;
    padding: 8px 10px 12px;
  }
  .section {
    font: 600 10px/1 var(--font-mono);
    color: var(--textmuted);
    letter-spacing: 0.1em;
    padding: 13px 8px 9px;
  }
  .foot {
    display: flex;
    gap: 16px;
    padding: 10px 16px;
    border-top: 1px solid var(--surface2);
    font-size: 10px;
    color: var(--text-faint);
    flex: none;
  }
  .rowwrap {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 8px 10px;
    border-radius: 11px;
    cursor: pointer;
  }
  .rowwrap:hover {
    background: rgba(53, 201, 214, 0.1);
  }
  .rowwrap.active {
    background: rgba(245, 166, 35, 0.07);
  }
  /* Keyboard cursor (arrow-key navigation) — distinct from .active, which marks the currently
     LOADED preset and can point at a different row than the one the arrows are on. */
  .rowwrap.highlighted {
    background: rgba(53, 201, 214, 0.14);
    outline: 1px solid rgba(53, 201, 214, 0.4);
    outline-offset: -1px;
  }
  .rowwrap.dimmed {
    opacity: 0.6;
  }
  .num {
    flex: none;
    width: 56px;
    height: 42px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    font: 700 14px/1 var(--font-mono);
    color: var(--accent);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 4px;
  }
  .rtext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* Name / provenance / tag-pills / signal-chain live in AxisPresetBrowserRowMain.svelte, shared
     verbatim with the docked Preset Browser's row so the two never drift apart. */
  .fav-b {
    flex: none;
    color: var(--amber);
    font-size: 15px;
  }
  /* Distinct name from .rowwrap's `dimmed` modifier on purpose — a same-named `.empty` class here
     previously collided with the empty-DEVICE-SLOT row's modifier class and bled this padding/
     text-align into that row (found via a misaligned <EMPTY> row in review). */
  .empty-hint {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
</style>
