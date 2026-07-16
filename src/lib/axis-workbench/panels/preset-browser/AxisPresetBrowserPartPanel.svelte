<script lang="ts">
  import { onMount } from 'svelte';
  import { library, type LibEntry } from '../../../library.svelte';
  import { editor } from '../../../editor.svelte';
  import { cloud, browseEntries } from '../../../cloud.svelte';
  import { startCrossConvert, openConvertedInConverter } from '../../../presetConvertSource';
  import { convert } from '../../../convert.svelte';
  import type { SyncState } from '../../../types';
  import type { PanelInstance } from '../../../workbench';
  import { bindAxisRuntimeHost } from '../../runtimeBinding';
  import {
    createAxisPresetBrowserDataView,
    type AxisPresetBrowserEntrySummary,
    type AxisPresetBrowserLibEntryLike
  } from '../../presetBrowser/presetBrowserWorkbenchData';
  import { presenceViewsForAuth } from '../../presetBrowser/presetBrowserWorkbenchPresence';
  import {
    loadSavedFilters,
    persistSavedFilters,
    addSavedFilter,
    removeSavedFilter,
    isSavedFilterActive,
    savedFilterDotColor,
    type AxisPbSavedFilter
  } from '../../presetBrowser/presetBrowserWorkbenchSavedFilters';
  import {
    axisPresetBrowserPartFromPanelType,
    parseAxisPresetBrowserPart,
    type AxisPresetBrowserPart
  } from '../../presetBrowser/types';
  import {
    axisPresetBrowserWorkbenchController,
    type AxisPresetBrowserControllerSnapshot
  } from '../../presetBrowser/presetBrowserWorkbenchController';
  import {
    axisPresetBrowserWorkbenchRuntime,
    type AxisPresetBrowserRuntimeSnapshot
  } from '../../presetBrowser/presetBrowserWorkbenchRuntime';
  import { createAxisPresetBrowserWorkbenchHost } from '../../presetBrowser/presetBrowserWorkbenchHost';
  import { applyRowCap } from '../../presetBrowser/presetBrowserWorkbenchLayout';
  import { AXIS_PB_QUICK_TAGS } from '../../presetBrowser/presetBrowserWorkbenchQuery';
  import { axisPbRowAnatomy } from '../../presetBrowser/presetBrowserWorkbenchRowChips';
  import { tick } from 'svelte';
  import {
    specsBySlug,
    type SpecLibEntry
  } from '../../presetBrowser/presetBrowserWorkbenchSpecs';
  import {
    buildAutocompleteContext,
    suggest,
    applyAcceptance,
    tidyQuery,
    type AxisPbAcItem
  } from '../../presetBrowser/presetBrowserWorkbenchAutocomplete';
  import {
    buildFiltersContext,
    pickerItems as buildPickerItems,
    applyPick,
    addCondFromPayload,
    chipDescriptor,
    type AxisPbPickerKind,
    type AxisPbPickerCtx,
    type AxisPbDragPayload
  } from '../../presetBrowser/presetBrowserWorkbenchFilters';
  import {
    buildDetailBlockCards,
    encodeDragPayload,
    parseDragPayload,
    AXIS_PB_DND_MIME,
    type DetailBlock
  } from '../../presetBrowser/presetBrowserWorkbenchParams';
  import {
    buildAxisPbMenuActions,
    toWorkbenchMenuItems,
    type AxisPbMenuActionId
  } from '../../presetBrowser/presetBrowserWorkbenchMenu';
  import ContextMenu from '../../../workbench/svelte/ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from '../../../workbench/svelte/contextMenu';
  import { longPress } from '../../longPress';

  let { panel }: { panel: PanelInstance } = $props();
  let snapshot = $state<AxisPresetBrowserControllerSnapshot>(axisPresetBrowserWorkbenchController.snapshot);
  let runtimeSnapshot = $state<AxisPresetBrowserRuntimeSnapshot>(axisPresetBrowserWorkbenchRuntime.snapshot);
  let lastDetailEntryId: string | null = null;
  const part = $derived<AxisPresetBrowserPart>(
    parseAxisPresetBrowserPart(panel.state?.part, axisPresetBrowserPartFromPanelType(panel.type))
  );
  // Live conditions the query filters by (advanced typed query, or simple chips + typed text).
  const activeConditions = $derived.by(() => {
    void snapshot; // re-derive on any snapshot change
    return axisPresetBrowserWorkbenchController.activeConditions;
  });
  // Cloud is live only when the engine has cloud enabled AND the user is signed in (mirrors the monolith's
  // `cloudOn`, PresetBrowser.svelte). Signed out → base library only + honest 'none' sync state (no dead
  // cloud rows); signed in → device library + cloud-only presets merged (browseEntries) so cloud-only rigs
  // are browseable, and each entry's sync state resolves through the reactive cloud store.
  const cloudOn = $derived(editor.cloud.enabled && !!editor.cloud.user);
  const baseEntries = $derived.by<AxisPresetBrowserLibEntryLike[]>(() => {
    void cloud.index; // re-derive when the cloud index refreshes
    return (cloudOn ? browseEntries() : library.entries) as AxisPresetBrowserLibEntryLike[];
  });
  function syncStateOf(entry: AxisPresetBrowserLibEntryLike): SyncState {
    if (!cloudOn) return 'none';
    if (entry.id.startsWith('cloud:')) return 'cloudOnly';
    // dev: entries came from a device scan — they ARE on the unit even without a comparable CRC; never let
    // those read as cloud-only (verbatim rule from the monolith syncStateOf).
    return cloud.stateOf(
      entry.summary.number ?? -1,
      entry.summary.crc ?? undefined,
      entry.id.startsWith('dev:') || entry.summary.crc != null
    );
  }
  const presenceViews = $derived(presenceViewsForAuth(cloudOn));
  const data = $derived(createAxisPresetBrowserDataView({
    entries: baseEntries,
    // When a presence view is active, filter over the full base set (the presence predicate needs the
    // cloud-only rows too); otherwise reuse the library's pre-filtered list.
    filteredEntries: snapshot.presenceView === 'all' && !cloudOn ? library.filtered : baseEntries,
    sourceId: snapshot.sourceId,
    selectedEntryId: snapshot.entryId,
    tagsOf: library.tagsOf,
    conditions: activeConditions,
    simpleQuery: snapshot.advanced ? '' : snapshot.simpleQ,
    sort: snapshot.sort,
    syncStateOf,
    presenceView: snapshot.presenceView,
    presenceViews
  }));

  // Saved filters — shared list (localStorage["axs.pb.saved"] + config mirror), reused from the monolith.
  let savedFilters = $state<AxisPbSavedFilter[]>(loadSavedFilters());
  let saveName = $state('');
  function commitSaveFilter() {
    const name = saveName.trim();
    if (!name) {
      axisPresetBrowserWorkbenchController.setSaving(false);
      saveName = '';
      return;
    }
    savedFilters = addSavedFilter(savedFilters, name, axisPresetBrowserWorkbenchController.currentQueryText());
    persistSavedFilters(savedFilters);
    axisPresetBrowserWorkbenchController.setSaving(false);
    saveName = '';
  }
  function deleteSavedFilter(id: string) {
    savedFilters = removeSavedFilter(savedFilters, id);
    persistSavedFilters(savedFilters);
  }
  function applySavedFilter(filter: AxisPbSavedFilter) {
    axisPresetBrowserWorkbenchController.applyQueryText(filter.query);
  }
  // 14-row soft cap + "Show all" expander (§4.1).
  const rowCap = $derived(applyRowCap(data.visibleEntries, snapshot.showAllRows));
  const activeTags = $derived(
    new Set(activeConditions.filter((c) => c.kind === 'tag').map((c) => c.val.toLowerCase()))
  );
  const isOwner = $derived(snapshot.owner === part);
  const selectedDetail = $derived(snapshot.entryId ? runtimeSnapshot.details[snapshot.entryId] : null);

  // ── V13e/V13f shared vocabulary ─────────────────────────────────────────────────────────────
  // Filter specs (which blocks/params can be filtered, and their enum/numeric domains) are derived from
  // the SAME decoded blocks the monolith uses — library.paramsOf via the runtime host reaches the real
  // library store here, so autocomplete + the Filters block + detail param matching are FULL parity, not
  // a summary-only fallback. The summary block slugs + model names seed the Type enum before params hydrate.
  const specLibEntries = $derived.by<SpecLibEntry[]>(() => {
    void library.entries;
    return baseEntries.map((e) => {
      const raw = e as unknown as Parameters<typeof library.paramsOf>[0];
      const blocks = (library.paramsOf(raw) as DetailBlock[] | null) ?? null;
      const models: Record<string, string[]> = { ...(e.summary.models ?? {}) };
      return {
        summaryBlockSlugs: (e.summary.blocks ?? []).map((b) => (b.slug ?? '').toLowerCase()).filter(Boolean),
        models,
        blocks: blocks as SpecLibEntry['blocks']
      };
    });
  });
  const pbSpecs = $derived(specsBySlug(specLibEntries));
  const acContext = $derived(buildAutocompleteContext(specLibEntries, pbSpecs, library.allTags));
  const filtersContext = $derived(buildFiltersContext(specLibEntries, pbSpecs, library.allTags));

  // ── V13e autocomplete (advanced query bar) ──────────────────────────────────────────────────
  let queryEl: HTMLInputElement | undefined = $state();
  let caret = $state(0);
  let acOpen = $state(false);
  let acItems = $state<AxisPbAcItem[]>([]);
  let acIndex = $state(0);
  let acLabel = $state('');
  function recomputeAc() {
    if (!snapshot.advanced) { acOpen = false; return; }
    const c = queryEl?.selectionStart ?? caret;
    const r = suggest(acContext, queryEl?.value ?? snapshot.query, c);
    acItems = r.items; acLabel = r.label; acIndex = 0; acOpen = true;
  }
  const closeAc = () => { acOpen = false; };
  function onQueryInput(e: Event) {
    const el = e.target as HTMLInputElement;
    caret = el.selectionStart ?? el.value.length;
    if (snapshot.advanced) { axisPresetBrowserWorkbenchController.setQuery(el.value); recomputeAc(); }
    else axisPresetBrowserWorkbenchController.setSimpleQuery(el.value);
  }
  function onQuerySelect(e: Event) {
    const el = e.target as HTMLInputElement;
    caret = el.selectionStart ?? 0;
    if ('key' in e && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes((e as KeyboardEvent).key)) return;
    if (snapshot.advanced && acOpen) recomputeAc();
  }
  function onQueryKey(e: KeyboardEvent) {
    if (!snapshot.advanced) return;
    if (!acOpen) { if (e.key === 'ArrowDown') recomputeAc(); return; }
    const n = acItems.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = Math.min(n - 1, acIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = Math.max(0, acIndex - 1); }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (n) { e.preventDefault(); void acceptAc(acIndex); } }
    else if (e.key === 'Escape') { e.preventDefault(); acOpen = false; }
  }
  async function acceptAc(i: number) {
    const item = acItems[i];
    if (!item || !queryEl) return;
    const res = applyAcceptance(item, queryEl.value, caret);
    if (res.closed) { closeAc(); return; }
    axisPresetBrowserWorkbenchController.setQuery(res.text);
    caret = res.caret;
    await tick();
    queryEl.focus();
    try { queryEl.setSelectionRange(res.caret, res.caret); } catch { /* */ }
    recomputeAc();
  }
  function onQueryBlur() {
    setTimeout(() => {
      closeAc();
      picker = null;
      if (snapshot.advanced) axisPresetBrowserWorkbenchController.setQuery(tidyQuery(snapshot.query));
    }, 130);
  }

  // ── V13e Filters builder-chips + pickers ────────────────────────────────────────────────────
  const chipDescriptors = $derived(activeConditions.map((c) => ({ cond: c, desc: chipDescriptor(c) })));
  type PickerState = { kind: AxisPbPickerKind; ctx: AxisPbPickerCtx; x: number; y: number };
  let picker = $state<PickerState | null>(null);
  let pickerSearch = $state('');
  let pickerHi = $state(0);
  let lastAnchor: HTMLElement | null = null;
  const pickerList = $derived(picker ? buildPickerItems(filtersContext, picker.kind, picker.ctx, pickerSearch) : []);
  function openPicker(kind: AxisPbPickerKind, ctx: AxisPbPickerCtx, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    picker = { kind, ctx, x: Math.min(Math.max(12, r.left), window.innerWidth - 312), y: r.bottom + 6 };
    pickerSearch = ''; pickerHi = 0;
  }
  function pickerPick(v: string) {
    if (!picker) return;
    const res = applyPick(filtersContext, picker.kind, picker.ctx, v);
    if (res.type === 'chain') { openPickerKind(res.kind, res.ctx); return; }
    if (res.type === 'edit') { axisPresetBrowserWorkbenchController.editConds(res.edit); }
    picker = null;
  }
  function openPickerKind(kind: AxisPbPickerKind, ctx: AxisPbPickerCtx) { if (lastAnchor) openPicker(kind, ctx, lastAnchor); }
  function onAddFilter(e: MouseEvent) { e.stopPropagation(); lastAnchor = e.currentTarget as HTMLElement; openPicker('addfilter', {}, lastAnchor); }
  function onAddParam(e: MouseEvent, ci: number, block: string) { e.stopPropagation(); lastAnchor = e.currentTarget as HTMLElement; openPicker('param', { block, ci }, lastAnchor); }
  function onPickerKey(e: KeyboardEvent) {
    const items = pickerList;
    if (e.key === 'ArrowDown') { e.preventDefault(); pickerHi = Math.min(items.length - 1, pickerHi + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pickerHi = Math.max(0, pickerHi - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[pickerHi]) pickerPick(items[pickerHi].v); }
    else if (e.key === 'Escape') picker = null;
  }
  function removeCondAt(ci: number) { axisPresetBrowserWorkbenchController.editConds((cc) => cc.splice(ci, 1)); }
  function removeParamAt(ci: number, pi: number) {
    axisPresetBrowserWorkbenchController.editConds((cc) => { const t = cc[ci]; if (t?.kind === 'block') t.params.splice(pi, 1); });
  }

  // ── V13e/V13f drag param/block into the Filters row ─────────────────────────────────────────
  let dragOver = $state(false);
  function startDrag(e: DragEvent, payload: AxisPbDragPayload) {
    e.dataTransfer?.setData(AXIS_PB_DND_MIME, encodeDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }
  function addPayload(p: AxisPbDragPayload) {
    axisPresetBrowserWorkbenchController.editConds((c) => addCondFromPayload(c, p));
  }
  function onFiltersDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const p = parseDragPayload(e.dataTransfer?.getData(AXIS_PB_DND_MIME));
    if (p) addPayload(p);
  }

  // ── V13f detail block-parameter listing ─────────────────────────────────────────────────────
  // Reaches the SAME decoded blocks the monolith lists (library.paramsOf). When the selected entry has no
  // params hydrated yet, the "Load params" button triggers hydration via the runtime detail loader.
  const selectedDecodedBlocks = $derived.by<DetailBlock[] | null>(() => {
    const sel = data.selectedEntry;
    if (!sel) return null;
    const raw = baseEntries.find((e) => e.id === sel.id);
    if (!raw) return null;
    void runtimeSnapshot.details; // re-derive after hydrateParams populates the cache
    return (library.paramsOf(raw as unknown as Parameters<typeof library.paramsOf>[0]) as DetailBlock[] | null) ?? null;
  });
  const detailBlockCards = $derived(
    selectedDecodedBlocks
      ? buildDetailBlockCards(selectedDecodedBlocks, activeConditions, snapshot.focusedBlockEffectId)
      : null
  );

  onMount(() => {
    return bindAxisRuntimeHost({
      runtime: axisPresetBrowserWorkbenchRuntime,
      host: createAxisPresetBrowserWorkbenchHost(),
      onSnapshot: (next) => (runtimeSnapshot = next)
    });
  });

  // Register this part for overlay-owner election (§1); unregister on unmount.
  $effect(() => axisPresetBrowserWorkbenchController.registerPart(part));

  $effect(() => {
    axisPresetBrowserWorkbenchController.setPart(part);
  });

  $effect(() => axisPresetBrowserWorkbenchController.subscribe((next) => (snapshot = next)));

  function onRowClick(entry: AxisPresetBrowserEntrySummary, event: MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      axisPresetBrowserWorkbenchController.toggleMark(entry.id);
    } else if (event.shiftKey) {
      axisPresetBrowserWorkbenchController.markRange(data.order, entry.id);
    } else {
      selectEntry(entry);
    }
  }

  // The detail region hydrates whenever it is actually shown — as a dedicated `detail` part OR as the
  // right column of the composed `full` panel (§"full" = sources | list | detail).
  const showsDetail = $derived(part === 'detail' || part === 'full');
  $effect(() => {
    if (!showsDetail || !snapshot.entryId || snapshot.entryId === lastDetailEntryId) return;
    lastDetailEntryId = snapshot.entryId;
    void axisPresetBrowserWorkbenchRuntime.loadDetail(snapshot.entryId);
  });

  function selectSource(sourceId: string) {
    axisPresetBrowserWorkbenchController.openSource(sourceId);
  }

  function selectEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
  }

  function loadEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    // A saved conversion isn't a device slot — its primary action re-opens it in the converter.
    if (entry.converted) { openConverter(entry.id); return; }
    void axisPresetBrowserWorkbenchRuntime.loadEntry(entry.id);
  }

  // Re-open a SAVED conversion (source 'converted') back in the converter, rehydrated from its stored doc.
  function openConverter(entryId: string) {
    const raw = baseEntries.find((e) => e.id === entryId) as unknown as LibEntry | undefined;
    if (raw?.converted) void openConvertedInConverter(raw.converted);
  }
  // Delete a saved conversion (store doc + library entry) via the library store.
  function deleteConverted(entryId: string) {
    void library.removeConverted(entryId);
  }

  function auditionEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    void axisPresetBrowserWorkbenchRuntime.auditionEntry(entry.id);
  }

  // Cross-device converter (M4): read the row's raw .syx and open the convert dialog seeded with it.
  // The base entries carry the real LibEntry shape (library.entries / browseEntries), so the shared
  // startCrossConvert flow works identically to the monolith.
  function crossConvert(entryId: string) {
    const raw = baseEntries.find((e) => e.id === entryId);
    if (raw) void startCrossConvert(raw as unknown as LibEntry);
  }

  // ── §4.3 inline rename ──────────────────────────────────────────────────────────────────────
  // Double-click on a device-slot row name edits it inline; committing routes through the SAME path
  // the monolith uses (editor.renameStoredPreset → loads the slot, renames the buffer, stores, reflects
  // in the library). Only device slots on rename-capable devices are editable (editor.canRenamePresets).
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  function canRename(entry: AxisPresetBrowserEntrySummary): boolean {
    return editor.canRenamePresets && entry.sourceId === 'device' && !entry.cloudOnly && (entry.number ?? -1) >= 0;
  }
  function beginRename(entry: AxisPresetBrowserEntrySummary) {
    if (!canRename(entry)) return;
    renamingId = entry.id;
    renameValue = entry.name;
  }
  function commitRename(entry: AxisPresetBrowserEntrySummary) {
    const next = renameValue.trim();
    const id = renamingId;
    renamingId = null;
    if (!id || id !== entry.id || !next || next === entry.name || entry.number == null) return;
    void editor.renameStoredPreset(entry.number, next);
  }
  function cancelRename() {
    renamingId = null;
  }

  // ── §4.4 row context menu (right-click / long-press) ────────────────────────────────────────
  // The generic workbench ContextMenu, rendered by the overlay OWNER instance only (§1 rank rule) so a
  // split sources|list|detail layout never double-renders the menu. Actions carry real backing:
  // Load/Audition (runtime), Favorite (library.toggleFav), Rename (editor.renameStoredPreset), and the
  // cloud up/down actions (editor.backupPreset+cloudSync / runtime cloud-version load) only when signed in.
  let menuOpen = $state(false);
  let menuPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  let menuItems = $state<WorkbenchMenuItem[]>([]);
  let menuEntry: AxisPresetBrowserEntrySummary | null = null;

  function openRowMenu(entry: AxisPresetBrowserEntrySummary, pos: WorkbenchMenuPosition) {
    menuEntry = entry;
    const actions = buildAxisPbMenuActions(
      {
        id: entry.id,
        cloudOnly: entry.cloudOnly,
        deviceSlot: entry.sourceId === 'device' && (entry.number ?? -1) >= 0,
        fav: entry.fav,
        syncState: entry.syncState,
        converted: entry.converted
      },
      { canRename: editor.canRenamePresets, cloudOn }
    );
    menuItems = toWorkbenchMenuItems(actions, dispatchMenuAction);
    menuPos = pos;
    menuOpen = true;
  }
  function onRowContext(event: MouseEvent, entry: AxisPresetBrowserEntrySummary) {
    event.preventDefault();
    // The menu is a shared overlay — always select the row first so detail/menu act on the same entry.
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    openRowMenu(entry, menuPositionFromPointer(event));
  }
  function dispatchMenuAction(id: AxisPbMenuActionId) {
    const entry = menuEntry;
    if (!entry) return;
    switch (id) {
      case 'load':
        void axisPresetBrowserWorkbenchRuntime.loadEntry(entry.id);
        return;
      case 'audition':
        void axisPresetBrowserWorkbenchRuntime.auditionEntry(entry.id);
        return;
      case 'favorite':
        library.toggleFav(entry.id);
        return;
      case 'rename':
        beginRename(entry);
        return;
      case 'crossConvert':
        crossConvert(entry.id);
        return;
      case 'openConverter':
        openConverter(entry.id);
        return;
      case 'deleteConverted':
        deleteConverted(entry.id);
        return;
      case 'cloudUpload':
        void cloudUpload(entry);
        return;
      case 'cloudDownload':
        void cloudDownload(entry);
        return;
    }
  }
  // Cloud actions mirror the monolith cloudAction() verbatim: upload = snapshot the slot to the version
  // store then push to cloud; download = load the latest cloud version into the edit buffer.
  async function cloudUpload(entry: AxisPresetBrowserEntrySummary) {
    if (entry.number == null || entry.number < 0) {
      editor.showToast('No device slot to back up', '#f5a623');
      return;
    }
    await editor.backupPreset(entry.number);
    await editor.cloudSync();
  }
  async function cloudDownload(entry: AxisPresetBrowserEntrySummary) {
    const versionId = cloud.latestCloud(entry.number ?? -1)?.id;
    if (!versionId) {
      editor.showToast('No cloud version to download', '#d6543f');
      return;
    }
    await editor.loadVersion(versionId);
  }
</script>

{#snippet sourcesBody()}
  <div class="axis-source-total">
    <strong>{data.entries.length}</strong>
    <span>indexed presets</span>
  </div>

  <!-- §3 LIBRARY: cloud-presence views with live counts. Selecting one filters the list exactly like the
       monolith's equivalent (In cloud / Cloud only / Not backed up / Needs upload / Needs update). Cloud
       views only render signed-in; signed-out we surface an honest "Sign in for cloud sync" row. -->
  <header class="section-head"><span>Library</span></header>
  <div class="axis-part-list views-list">
    {#each data.presenceViews as view}
      <button
        type="button"
        class="view-row"
        class:active={data.activePresenceView === view.id}
        onclick={() => axisPresetBrowserWorkbenchController.setPresenceView(view.id)}
      >
        <span class="view-glyph" style:color={view.color} aria-hidden="true">{view.glyph}</span>
        <strong>{view.label}</strong>
        <em>{view.count}</em>
      </button>
    {/each}
    {#if !cloudOn}
      <div class="cloud-signin" title="Cloud sync views appear once you sign in">
        <span aria-hidden="true">☁</span>
        <span>Sign in for cloud sync</span>
      </div>
    {/if}
  </div>

  <header class="section-head"><span>Sources</span></header>
  <div class="axis-part-list">
    {#each data.sources as source}
      <button type="button" class:active={data.activeSourceId === source.id} onclick={() => selectSource(source.id)}>
        <span class="source-main">
          <strong>{source.label}</strong>
          <i style:width={`${data.entries.length ? Math.max(4, (source.count / data.entries.length) * 100) : 0}%`}></i>
        </span>
        <em>{source.count}</em>
      </button>
    {/each}
  </div>

  <!-- §3.3 SAVED FILTERS: name + query subtitle + active highlight (parsed-query equality) + delete ×.
       Applying one loads its query via applyQueryText. Persisted to the shared axs.pb.saved store. -->
  <header class="section-head saved-head">
    <span>Saved filters</span>
    <em>{savedFilters.length}</em>
  </header>
  {#if snapshot.saving}
    <div class="save-in">
      <input
        type="text"
        bind:value={saveName}
        placeholder="Name this filter…"
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Enter') commitSaveFilter();
          else if (e.key === 'Escape') axisPresetBrowserWorkbenchController.setSaving(false);
        }}
      />
    </div>
  {/if}
  <div class="saved-list">
    {#each savedFilters as filter (filter.id)}
      {@const active = isSavedFilterActive(filter, activeConditions)}
      <div class="sv" class:active>
        <button type="button" class="sv-main" onclick={() => applySavedFilter(filter)}>
          <span class="sv-dot" style:background={savedFilterDotColor(filter)}></span>
          <span class="sv-txt">
            <strong>{filter.name}</strong>
            <small>{filter.query || '(empty)'}</small>
          </span>
        </button>
        <button type="button" class="sv-x" title="Delete filter" onclick={() => deleteSavedFilter(filter.id)}>×</button>
      </div>
    {/each}
    {#if !savedFilters.length}
      <div class="empty-s">No saved filters yet. Build a query and hit Save filter.</div>
    {/if}
  </div>

  <header class="section-head"><span>Quick tags</span></header>
  <div class="quick-tags">
    {#each AXIS_PB_QUICK_TAGS as tag}
      {@const on = activeTags.has(tag.label.toLowerCase())}
      <button
        type="button"
        class="quick-tag"
        class:on
        style:--tag-col={tag.color}
        onclick={() => axisPresetBrowserWorkbenchController.toggleTag(tag.label)}
      >
        {tag.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet listTopBar()}
  <div class="query-bar">
    <div class="query-input" class:focus={acOpen && snapshot.advanced}>
      <span class="magnifier" aria-hidden="true">⌕</span>
      {#if snapshot.advanced}
        <!-- V13e: advanced mode gets the caret-aware autocomplete engine -->
        <input
          bind:this={queryEl}
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder="AMP(Type=5153, Gain>7)  +  REVERB(Mix>30)  +  tag:Lead"
          value={snapshot.query}
          oninput={onQueryInput}
          onkeydown={onQueryKey}
          onfocus={recomputeAc}
          onblur={onQueryBlur}
          onclick={onQuerySelect}
          onkeyup={onQuerySelect}
        />
      {:else}
        <input
          type="text"
          spellcheck="false"
          placeholder="Search presets, tags, amps, params…"
          value={snapshot.simpleQ}
          oninput={onQueryInput}
        />
      {/if}
      {#if (snapshot.advanced ? snapshot.query : snapshot.simpleQ)}
        <button type="button" class="clear-btn" title="Clear" onclick={() => axisPresetBrowserWorkbenchController.clearQuery()}>×</button>
      {/if}
      {#if acOpen && snapshot.advanced}
        <!-- V13e autocomplete dropdown (§2.4) -->
        <div class="ac">
          {#if acLabel}<div class="ac-ctx">{acLabel}</div>{/if}
          {#each acItems as a, i}
            <button
              type="button"
              class="ac-item"
              class:hi={i === acIndex}
              onmousedown={(e) => { e.preventDefault(); void acceptAc(i); }}
              onmouseenter={() => (acIndex = i)}
            >
              <span class="ac-dot" style:background={a.dot ? a.color : 'transparent'} style:border={a.dot ? 'none' : `1px solid ${a.color}`}></span>
              <span class="ac-l">{a.label}</span><span class="ac-sp"></span><span class="ac-h">{a.hint}</span>
            </button>
          {/each}
          {#if !acItems.length}<div class="ac-empty">No matches — keep typing</div>{/if}
          <div class="ac-foot"><span>↑↓ move</span><span>↵ insert</span><span>esc close</span></div>
        </div>
      {/if}
    </div>
    <div class="query-controls">
      <button
        type="button"
        class="adv-toggle"
        class:on={snapshot.advanced}
        onclick={() => axisPresetBrowserWorkbenchController.toggleAdvanced()}
        title="Toggle advanced query"
      >
        <i></i>{snapshot.advanced ? 'Advanced' : 'Simple'}
      </button>
      <div class="sort-seg" role="group" aria-label="Sort">
        <button type="button" class:on={snapshot.sort === 'num'} onclick={() => axisPresetBrowserWorkbenchController.setSort('num')}>#</button>
        <button type="button" class:on={snapshot.sort === 'name'} onclick={() => axisPresetBrowserWorkbenchController.setSort('name')}>A-Z</button>
        <button type="button" class:on={snapshot.sort === 'cpu'} onclick={() => axisPresetBrowserWorkbenchController.setSort('cpu')}>CPU</button>
      </div>
      <!-- §2.2/§3.3 Save filter → opens the inline name input in the sources sidebar. -->
      <button
        type="button"
        class="save-filter"
        class:on={snapshot.saving}
        title="Save the current query as a filter"
        onclick={() => axisPresetBrowserWorkbenchController.setSaving(!snapshot.saving)}
      >
        ☆ Save filter
      </button>
      <!-- General cross-device converter entry point (not only the per-row menu): opens the ConvertDialog
           FRESH (no pre-seeded source) so the user picks a target device + Chooses a .syx directly. -->
      <button
        type="button"
        class="convert-preset"
        title="Convert a preset to another Fractal device — pick a target device, then Choose a .syx file"
        onclick={() => convert.openBlank()}
      >
        ⇄ Convert Preset…
      </button>
    </div>
    <!-- V13e FILTERS builder-chips row (§2.5) — also a drop target for params/blocks dragged from detail -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="filters-row"
      class:dragover={dragOver}
      role="group"
      ondragenter={(e) => { e.preventDefault(); dragOver = true; }}
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragOver = false; }}
      ondrop={onFiltersDrop}
    >
      <span class="filters-lbl">FILTERS</span>
      {#if dragOver}<span class="drop-hint">drop to add filter</span>{/if}
      {#each chipDescriptors as item, ci}
        <div class="fchip">
          {#if item.desc.kind === 'block'}
            <button type="button" class="fchip-head blk" style:--c={item.desc.color} onclick={(e) => onAddParam(e, ci, item.desc.kind === 'block' ? item.desc.block : '')} title="Add a parameter condition">
              <span class="fdot" style:background={item.desc.color}></span>{item.desc.label}
            </button>
            {#each item.desc.params as p, pi}
              <span class="fparam">{p.name} {p.glyph} {p.val}<button type="button" class="fpx" onclick={() => removeParamAt(ci, pi)}>×</button></span>
            {/each}
            <button type="button" class="faddp" onclick={(e) => onAddParam(e, ci, item.desc.kind === 'block' ? item.desc.block : '')}>+ param</button>
          {:else}
            <span class="fchip-head">
              <span class="fdot" style:background={item.desc.color}></span>{item.desc.text}
            </span>
          {/if}
          <button type="button" class="fcx" onclick={() => removeCondAt(ci)}>×</button>
        </div>
      {/each}
      <button type="button" class="faddf" onclick={onAddFilter}><span class="plus">+</span> Add filter</button>
      {#if !activeConditions.length}<span class="filters-hint">{snapshot.advanced ? 'Type a query above, or add filters →' : 'Add block, parameter & tag filters →'}</span>{/if}
      <span class="fsp"></span>
      {#if activeConditions.length}<button type="button" class="fclrall" onclick={() => axisPresetBrowserWorkbenchController.clearQuery()}>Clear all</button>{/if}
    </div>
  </div>
{/snippet}

{#snippet listBody()}
  {#if data.visibleEntries.length}
    {@const markedCount = Object.keys(snapshot.marked).length}
    {#if markedCount}
      <div class="select-head">
        <span>{markedCount} selected</span>
        <button type="button" onclick={() => axisPresetBrowserWorkbenchController.clearMarks()}>Clear</button>
      </div>
    {:else}
      <div class="axis-list-summary">
        <span>{rowCap.totalRows} presets</span>
        <strong>{data.sources.find((source) => source.id === data.activeSourceId)?.label ?? data.activeSourceId}</strong>
      </div>
    {/if}
    <div class="axis-preset-list" role="listbox" aria-label="Preset list" aria-multiselectable="true">
      {#each rowCap.rows as entry}
        {@const anatomy = axisPbRowAnatomy(entry)}
        <div
          class="preset-row"
          class:active={snapshot.entryId === entry.id}
          class:marked={snapshot.marked[entry.id]}
          class:fav={entry.fav}
          role="option"
          aria-selected={snapshot.entryId === entry.id}
          tabindex="0"
          onclick={(e) => onRowClick(entry, e)}
          ondblclick={() => (canRename(entry) ? beginRename(entry) : loadEntry(entry))}
          oncontextmenu={(e) => onRowContext(e, entry)}
          onkeydown={(e) => {
            if (e.key === 'Enter') loadEntry(entry);
          }}
          use:longPress={{
            onLongPress: (d) => {
              axisPresetBrowserWorkbenchController.selectEntry(entry.id);
              openRowMenu(entry, { x: d.x, y: d.y });
            }
          }}
        >
          <button
            type="button"
            class="checkbox"
            class:on={snapshot.marked[entry.id]}
            aria-label={snapshot.marked[entry.id] ? 'Unmark preset' : 'Mark preset'}
            onclick={(e) => {
              e.stopPropagation();
              axisPresetBrowserWorkbenchController.toggleMark(entry.id);
            }}
          >{snapshot.marked[entry.id] ? '✓' : ''}</button>
          <span class="preset-number" class:sel={snapshot.entryId === entry.id}>{entry.number == null ? entry.sourceLabel : String(entry.number).padStart(3, '0')}</span>
          <span class="preset-main">
            {#if renamingId === entry.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="rename-in"
                type="text"
                maxlength="32"
                autofocus
                spellcheck="false"
                bind:value={renameValue}
                onclick={(e) => e.stopPropagation()}
                ondblclick={(e) => e.stopPropagation()}
                onkeydown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commitRename(entry);
                  else if (e.key === 'Escape') cancelRename();
                }}
                onblur={() => commitRename(entry)}
              />
            {:else}
              <strong>{entry.name}</strong>
            {/if}
            {#if entry.converted && entry.provenance}
              <span class="conv-prov" title={`Converted from ${entry.provenance}`}>{entry.provenance}</span>
            {/if}
            {#if anatomy.tagPills.length}
              <span class="tag-pills">
                {#each anatomy.tagPills as tag}<em class="tag-pill">{tag}</em>{/each}
              </span>
            {/if}
            {#if anatomy.blockChips.length}
              <span class="block-chips">
                {#each anatomy.blockChips as chip}
                  <em class="block-chip" style:--c={chip.color} title={chip.title}>{chip.label}</em>
                {/each}
              </span>
            {/if}
          </span>
          <span class="preset-meta">
            <span class="meta-top">
              <i class="scenes">{anatomy.sceneCount} scn</i>
              {#if anatomy.cloud}
                <i class="cloud-chip" style:--c={anatomy.cloud.color} title={anatomy.cloud.label}>{anatomy.cloud.glyph} {anatomy.cloud.short}</i>
              {/if}
            </span>
            <span class="cpu-meter" title="Estimated DSP load from block makeup — not the device's live CPU">
              <i class="cpu-l">~CPU</i>
              <i class="cpu-bar"><b style:width={`${anatomy.cpu.pct}%`} style:background={anatomy.cpu.color}></b></i>
              <i class="cpu-t" style:color={anatomy.cpu.color}>{anatomy.cpu.pct}%</i>
            </span>
          </span>
        </div>
      {/each}
    </div>
    {#if rowCap.capped}
      <button type="button" class="show-all" onclick={() => axisPresetBrowserWorkbenchController.setShowAllRows(true)}>
        Show all {rowCap.totalRows} presets
      </button>
    {/if}
  {:else}
    <div class="axis-part-empty">
      <strong>{data.entries.length ? 'No presets match this filter' : 'Library is empty'}</strong>
      <span>{data.entries.length
        ? 'Loosen a parameter range or remove a block condition.'
        : 'Scan the connected device or import .syx files to populate the library.'}</span>
    </div>
  {/if}
{/snippet}

{#snippet detailBody()}
  {#if data.selectedEntry}
    <article class="axis-preset-detail">
      <div class="detail-title">
        <span>{data.selectedEntry.number == null ? data.selectedEntry.sourceLabel : `Preset ${String(data.selectedEntry.number).padStart(3, '0')}`}</span>
        <h3>{data.selectedEntry.name}</h3>
        {#if data.selectedEntry.model}<p>{data.selectedEntry.model}</p>{/if}
      </div>

      <div class="detail-status">
        <span class:on={selectedDetail?.gridLoaded}>Grid</span>
        <span class:on={selectedDetail?.paramsLoaded}>Params</span>
        <span class:on={(selectedDetail?.versions.length ?? 0) > 0}>Versions</span>
      </div>

      <dl>
        <div><dt>Source</dt><dd>{data.selectedEntry.sourceLabel}</dd></div>
        {#if data.selectedEntry.converted && data.selectedEntry.provenance}<div><dt>Converted</dt><dd>{data.selectedEntry.provenance}</dd></div>{/if}
        <div><dt>Scenes</dt><dd>{data.selectedEntry.sceneCount}</dd></div>
        <div><dt>Blocks</dt><dd>{data.selectedEntry.blockCount}</dd></div>
        {#if data.selectedEntry.folder}<div><dt>Folder</dt><dd>{data.selectedEntry.folder}</dd></div>{/if}
      </dl>

      {#if data.selectedEntry.tags.length}
        <div class="tag-row">
          {#each data.selectedEntry.tags as tag}<span>{tag}</span>{/each}
        </div>
      {/if}

      {#if data.selectedEntry.blocks.length}
        <div class="block-list">
          {#each data.selectedEntry.blocks as block, index}
            <button
              type="button"
              class:active={snapshot.focusedBlockEffectId != null && snapshot.focusedBlockEffectId === block.effectId}
              onclick={() => axisPresetBrowserWorkbenchController.focusBlock(block.effectId ?? null)}
            >
              <span>{block.name ?? block.slug ?? `Block ${index + 1}`}</span>
              {#if block.slug}<em>{block.slug}</em>{/if}
            </button>
          {/each}
        </div>
      {/if}
      <div class="detail-actions">
        {#if data.selectedEntry.converted}
          <!-- A saved conversion re-opens in the converter (not a device load). True .syx export is wired in
               the separate codec-authoring task. -->
          <button type="button" class="load-action" onclick={() => openConverter(data.selectedEntry!.id)}>
            Open in converter
          </button>
          <button type="button" class="load-action secondary danger" onclick={() => deleteConverted(data.selectedEntry!.id)}>
            Delete
          </button>
        {:else}
          <button type="button" class="load-action" onclick={() => axisPresetBrowserWorkbenchRuntime.loadEntry(data.selectedEntry!.id)}>
            {runtimeSnapshot.loadingEntryId === data.selectedEntry.id ? 'Loading...' : 'Load preset'}
          </button>
          {#if data.selectedEntry.sourceId === 'device' && data.selectedEntry.number != null}
            <button type="button" class="load-action audition" onclick={() => auditionEntry(data.selectedEntry!)}>
              {runtimeSnapshot.auditioningEntryId === data.selectedEntry.id ? 'Auditioning...' : 'Audition'}
            </button>
          {/if}
          <button type="button" class="load-action secondary" onclick={() => axisPresetBrowserWorkbenchRuntime.loadDetail(data.selectedEntry!.id)}>
            {runtimeSnapshot.hydratingEntryId === data.selectedEntry.id ? 'Refreshing...' : 'Refresh detail'}
          </button>
          <button type="button" class="load-action secondary" title="Port this preset to another Fractal device — best-effort, with a full diff report" onclick={() => crossConvert(data.selectedEntry!.id)}>
            ⇄ Convert…
          </button>
        {/if}
      </div>

      {#if selectedDetail}
        <div class="runtime-detail">
          <span>{selectedDetail.paramsLoaded ? 'Params loaded' : 'Summary params only'}</span>
          <span>{selectedDetail.gridLoaded ? 'Grid preview ready' : 'No grid preview'}</span>
          <span>{selectedDetail.versions.length} version{selectedDetail.versions.length === 1 ? '' : 's'}</span>
        </div>
      {/if}

      <!-- V13f BLOCK PARAMETERS (§"detail" step 4): every param of every non-IO block with its value.
           Drag or double-click a block header / param cell to add it to the FILTERS row. Cells matched
           by an active block-param condition are highlighted. Reaches the same decoded blocks as the
           monolith via library.paramsOf; when unhydrated, "Load params" pulls them through the runtime. -->
      <div class="d-blocks">
        <div class="d-blocks-lbl">BLOCK PARAMETERS</div>
        {#if !selectedDecodedBlocks}
          <div class="d-blocks-empty">
            Full params not loaded for this preset.
            <button type="button" class="link" onclick={() => axisPresetBrowserWorkbenchRuntime.loadDetail(data.selectedEntry!.id)}>
              {runtimeSnapshot.hydratingEntryId === data.selectedEntry.id ? 'Loading…' : 'Load params'}
            </button>
          </div>
        {:else if detailBlockCards && detailBlockCards.length}
          {#each detailBlockCards as card}
            <div class="d-blk">
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="d-blk-h"
                draggable="true"
                ondragstart={(e) => startDrag(e, card.blockPayload)}
                ondblclick={() => addPayload(card.blockPayload)}
                title="Drag or double-click to filter by this block"
              >
                <span class="fdot" style:background={card.color}></span>
                <span class="d-blk-n">{card.category}{card.title ? ` · ${card.title}` : ''}</span>
                <span class="fsp"></span>
                <span class="d-blk-grip">⠿</span>
                <span class="d-blk-i">{card.instanceLabel}</span>
              </div>
              <div class="d-blk-grid">
                {#each card.cells as cell}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="d-pr"
                    class:hit={cell.hit}
                    draggable="true"
                    ondragstart={(e) => startDrag(e, cell.payload)}
                    ondblclick={() => addPayload(cell.payload)}
                    title="Drag or double-click to filter on this param"
                  >
                    <span class="d-pk">{cell.key}</span>
                    <span class="d-pv">{cell.value}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        {:else}
          <div class="d-blocks-empty">No filterable block parameters in this preset.</div>
        {/if}
      </div>

      {#if runtimeSnapshot.error && isOwner}
        <!-- shared runtime error renders only on the overlay-owner part (§1) so split layouts
             don't duplicate the banner across sources/list/detail. -->
        <p class="runtime-error">{runtimeSnapshot.error}</p>
      {/if}
    </article>
  {:else}
    <div class="axis-part-empty">
      <strong>Select a preset</strong>
      <span>Its full block + parameter breakdown shows up here.</span>
    </div>
  {/if}
{/snippet}

{#if part === 'full'}
  <!-- §"full": the docked panel composes the three parts (sources | list | detail) itself, backed by
       the shared controller + real library data — it does NOT embed the legacy monolith (which stays the
       standalone library surface, still reachable in the classic shell / via the .full sub-parts). -->
  <section class="axis-pb-full" data-part="full">
    <aside class="axis-pb-col axis-pb-sources">{@render sourcesBody()}</aside>
    <div class="axis-pb-col axis-pb-list">
      {@render listTopBar()}
      <div class="axis-pb-list-scroll">{@render listBody()}</div>
    </div>
    <aside class="axis-pb-col axis-pb-detail">{@render detailBody()}</aside>
  </section>
{:else}
  <section class="axis-part-pane" data-part={part}>
    <header>
      <span>Preset Browser</span>
      <strong>{part}</strong>
    </header>

    {#if part === 'sources'}
      {@render sourcesBody()}
    {:else if part === 'list'}
      {@render listTopBar()}
      {@render listBody()}
    {:else if part === 'detail'}
      {@render detailBody()}
    {/if}
  </section>
{/if}

<!-- §4.4 row context menu — rendered once, on the overlay-owner part (§1 rank rule: list < detail <
     sources < full) so split layouts don't duplicate it. Anchored in fixed/viewport coords so it works
     cross-panel. -->
{#if isOwner}
  <ContextMenu open={menuOpen} position={menuPos} items={menuItems} label="Preset actions" onClose={() => (menuOpen = false)} />
{/if}

<!-- V13e add-filter / param / value picker popover (§2.5, §4.4). Local to the instance that owns the query
     bar (list/full); anchored in viewport coords. A window click closes it. -->
<svelte:window onclick={() => { if (picker) picker = null; }} ondragend={() => (dragOver = false)} />
{#if picker}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pk-pop"
    style:left={picker.x + 'px'}
    style:top={picker.y + 'px'}
    role="dialog"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={onPickerKey}
  >
    <div class="pk-h">
      <div class="pk-lbl">{picker.kind === 'addfilter' ? 'Add a filter' : picker.kind === 'tag' ? 'Pick a tag' : picker.kind === 'param' ? 'Pick a parameter' : 'Pick a value'}</div>
      <div class="pk-search">
        <span aria-hidden="true">⌕</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={pickerSearch} onkeydown={onPickerKey} placeholder="Search…" spellcheck="false" autocomplete="off" autofocus />
      </div>
    </div>
    <div class="pk-list">
      {#each pickerList as it, i}
        <button type="button" class="pk-item" class:hi={i === pickerHi} onclick={() => pickerPick(it.v)} onmouseenter={() => (pickerHi = i)}>
          {#if it.dot}<span class="fdot" style:background={it.color}></span>{/if}
          <span class="pk-l">{it.label}</span><span class="fsp"></span><span class="pk-s">{it.sub}</span>
        </button>
      {/each}
      {#if !pickerList.length}<div class="pk-empty">No matches</div>{/if}
    </div>
  </div>
{/if}

<style>
  /* §"full": three-column split (sources | list | detail). Absolute-fills the panel body so it always
     has a resolved height even inside flex dock nodes; each column scrolls independently. */
  .axis-pb-full {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    overflow: hidden;
    background: var(--bg);
    color: var(--text2);
    container-type: inline-size;
  }
  .axis-pb-col {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .axis-pb-sources {
    width: 248px;
    flex: none;
    gap: 12px;
    padding: 14px;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--bg2);
  }
  .axis-pb-list {
    flex: 1;
    gap: 12px;
    padding: 14px;
    overflow: hidden;
  }
  .axis-pb-list-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }
  .axis-pb-detail {
    width: 368px;
    flex: none;
    gap: 14px;
    padding: 14px;
    overflow-y: auto;
    border-left: 1px solid var(--border);
    background: var(--bg2);
  }
  /* Below the sources sidebar width the detail column collapses first, then sources, so a narrow dock
     still shows the list. */
  @container (max-width: 860px) {
    .axis-pb-detail {
      display: none;
    }
  }
  @container (max-width: 620px) {
    .axis-pb-sources {
      display: none;
    }
  }
  .axis-part-pane {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    overflow: auto;
    background: var(--bg);
    color: var(--text2);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  header strong {
    color: var(--accent);
  }
  .axis-part-list {
    display: grid;
    gap: 8px;
  }
  .axis-source-total,
  .axis-list-summary {
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
    border-radius: 8px;
    padding: 0 11px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 9%, transparent), transparent);
  }
  .axis-source-total strong,
  .axis-list-summary strong {
    color: var(--text);
    font: 900 18px/1 var(--font-mono);
  }
  .axis-source-total span,
  .axis-list-summary span {
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .axis-list-summary strong {
    font-size: 12px;
    text-transform: uppercase;
  }
  button {
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text2);
    cursor: pointer;
    text-align: left;
    text-transform: capitalize;
    font: 700 12px/1 var(--font-ui);
  }
  .axis-part-list button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 10px;
  }
  .source-main {
    min-width: 0;
    display: grid;
    gap: 6px;
    flex: 1;
  }
  .source-main strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .source-main i {
    height: 3px;
    max-width: 100%;
    border-radius: 999px;
    background: var(--accent);
  }
  .axis-part-list em {
    color: var(--textdim);
    font-style: normal;
    font-size: 11px;
  }
  button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .axis-preset-list {
    display: grid;
    gap: 4px;
  }
  /* §4.3 row: checkbox | number | main(name+tags+block chips) | meta(scenes/cloud + CPU meter). */
  .preset-row {
    min-height: 42px;
    display: grid;
    grid-template-columns: 18px 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-left: 2px solid transparent;
    border-radius: 8px;
    background: var(--bg2);
    cursor: pointer;
  }
  .preset-row:hover {
    background: color-mix(in srgb, var(--accent) 4%, var(--bg2));
  }
  .preset-row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .preset-number {
    color: var(--textdim);
    font: 800 11px/1 var(--font-mono);
  }
  .preset-main {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .preset-main strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font: 700 13px/1.15 var(--font-ui);
  }
  .rename-in {
    width: 100%;
    box-sizing: border-box;
    height: 26px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    padding: 0 8px;
    font: 600 12px/1 var(--font-mono);
    outline: none;
  }
  .tag-pills,
  .block-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }
  .tag-pill {
    padding: 2px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    font: 700 9.5px/1 var(--font-mono);
    font-style: normal;
    white-space: nowrap;
  }
  /* Cross-device conversion provenance chip ("FM3 → AM4") on saved-conversion rows. */
  .conv-prov {
    align-self: flex-start;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--amber, #f5a623) 45%, transparent);
    border-radius: 5px;
    background: color-mix(in srgb, var(--amber, #f5a623) 14%, transparent);
    color: var(--amber, #f5a623);
    font: 700 9.5px/1 var(--font-mono);
    white-space: nowrap;
  }
  .block-chip {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--c) 33%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--c) 17%, transparent);
    color: var(--c);
    font: 600 10px/1.2 var(--font-mono);
    font-style: normal;
  }
  .preset-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
  }
  .meta-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .preset-meta i {
    font-style: normal;
  }
  .scenes {
    color: var(--textdim);
    font: 600 9.5px/1 var(--font-mono);
  }
  .cloud-chip {
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
    border-radius: 5px;
    background: color-mix(in srgb, var(--c) 12%, transparent);
    color: var(--c);
    font: 700 9px/1 var(--font-mono);
    white-space: nowrap;
  }
  .cpu-meter {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cpu-l {
    color: var(--textmuted, var(--textdim));
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.06em;
  }
  .cpu-bar {
    width: 46px;
    height: 6px;
    display: block;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--track, var(--bg));
  }
  .cpu-bar b {
    display: block;
    height: 100%;
  }
  .cpu-t {
    font: 700 10px/1 var(--font-mono);
  }
  .preset-row.fav .preset-number {
    color: var(--accent);
  }
  .preset-row.active {
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, var(--bg2));
  }
  .preset-row.marked {
    border-color: var(--accent);
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg2));
  }
  .checkbox {
    width: 18px;
    height: 18px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--border3, var(--border));
    border-radius: 5px;
    background: transparent;
    color: var(--bg);
    cursor: pointer;
    font: 700 11px/1 var(--font-mono);
  }
  .checkbox.on {
    border-color: var(--accent);
    background: var(--accent);
  }
  .preset-number.sel {
    color: #f5a623;
  }

  /* query bar (§2) */
  .query-bar {
    display: grid;
    gap: 8px;
  }
  .query-input {
    position: relative;
    display: flex;
    align-items: center;
    height: 40px;
    border: 1px solid var(--border2, var(--border));
    border-radius: 12px;
    background: var(--bg2);
    padding: 0 8px 0 30px;
  }
  .magnifier {
    position: absolute;
    left: 10px;
    color: var(--textdim);
    font-size: 15px;
  }
  .query-input input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: 500 13px/1 var(--font-mono);
    outline: none;
  }
  .clear-btn {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--textdim);
    font-size: 15px;
  }
  .query-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .adv-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    text-transform: none;
  }
  .adv-toggle i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--textdim);
  }
  .adv-toggle.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink, var(--bg));
  }
  .adv-toggle.on i {
    background: var(--accentink, var(--bg));
  }
  .sort-seg {
    display: flex;
    gap: 4px;
  }
  .sort-seg button {
    height: 28px;
    padding: 0 9px;
    border-radius: 7px;
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .sort-seg button.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink, var(--bg));
  }
  /* V13e autocomplete dropdown (§2.4) */
  .query-input.focus {
    border-color: var(--accent);
  }
  .ac {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    z-index: 40;
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border2, var(--border));
    border-radius: 13px;
    background: var(--surface, var(--bg2));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    padding: 5px;
  }
  .ac-ctx {
    padding: 5px 9px 4px;
    color: var(--textdim);
    font: 800 9px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .ac-item {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    text-transform: none;
  }
  .ac-item.hi {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .ac-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 3px;
  }
  .ac-l {
    color: var(--text);
    font: 500 13px/1 var(--font-mono);
  }
  .ac-sp,
  .fsp {
    flex: 1;
  }
  .ac-h {
    color: var(--textdim);
    font: 500 10px/1 var(--font-mono);
  }
  .ac-empty,
  .pk-empty {
    padding: 10px;
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
    text-align: center;
  }
  .ac-foot {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 9px 3px;
    color: var(--textdim);
    font: 600 9px/1 var(--font-mono);
  }

  /* V13e FILTERS builder-chips row (§2.5) */
  .filters-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg2) 60%, var(--bg));
  }
  .filters-row.dragover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg2));
  }
  .filters-lbl {
    color: var(--textdim);
    font: 800 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
  }
  .drop-hint {
    color: var(--accent);
    font: 700 10px/1 var(--font-mono);
  }
  .fchip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px 3px 6px;
    border: 1px solid var(--border2, var(--border));
    border-radius: 8px;
    background: var(--bg2);
  }
  .fchip-head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text2);
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .fchip-head.blk {
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
    background: color-mix(in srgb, var(--c) 15%, transparent);
    color: var(--c);
  }
  .fdot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 3px;
  }
  .fparam {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 7px;
    border-radius: 6px;
    background: var(--surface2, color-mix(in srgb, var(--accent) 8%, var(--bg)));
    color: var(--text2);
    font: 600 11px/1 var(--font-mono);
  }
  .fpx,
  .fcx {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--textdim);
    font-size: 13px;
  }
  .fcx {
    border-left: 1px solid var(--border);
    border-radius: 0;
  }
  .faddp {
    height: 22px;
    padding: 0 7px;
    border: 1px dashed var(--border2, var(--border));
    border-radius: 6px;
    background: transparent;
    color: var(--textdim);
    font: 600 10px/1 var(--font-mono);
    text-transform: none;
  }
  .faddf {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--border2, var(--border));
    background: var(--bg2);
    color: var(--text2);
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .faddf .plus {
    color: var(--accent);
    font-size: 13px;
  }
  .filters-hint {
    color: var(--textdim);
    font: 500 10.5px/1.2 var(--font-mono);
  }
  .fclrall {
    height: 24px;
    padding: 0 8px;
    border-radius: 7px;
    color: var(--textdim);
    font-size: 11px;
    text-transform: none;
  }

  /* V13e picker popover (§2.5, §4.4) */
  .pk-pop {
    position: fixed;
    z-index: 60;
    width: 300px;
    max-width: calc(100vw - 24px);
    border: 1px solid var(--border2, var(--border));
    border-radius: 12px;
    background: var(--surface, var(--bg2));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  .pk-h {
    display: grid;
    gap: 7px;
    padding: 10px;
    border-bottom: 1px solid var(--border);
  }
  .pk-lbl {
    color: var(--textdim);
    font: 800 9px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .pk-search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--textdim);
  }
  .pk-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: 500 12px/1 var(--font-mono);
    outline: none;
  }
  .pk-list {
    max-height: 280px;
    overflow-y: auto;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pk-item {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    text-transform: none;
  }
  .pk-item.hi {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .pk-l {
    color: var(--text);
    font: 500 13px/1 var(--font-mono);
  }
  .pk-s {
    color: var(--textdim);
    font: 500 10px/1 var(--font-mono);
  }

  /* V13f BLOCK PARAMETERS listing (detail §4) */
  .d-blocks {
    display: grid;
    gap: 8px;
  }
  .d-blocks-lbl {
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .d-blocks-empty {
    padding: 8px 10px;
    color: var(--textdim);
    font: 500 11px/1.4 var(--font-mono);
  }
  .d-blocks-empty .link {
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .d-blk {
    border: 1px solid var(--surface2, var(--border));
    border-radius: 12px;
    background: var(--bg2);
    overflow: hidden;
  }
  .d-blk-h {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    cursor: grab;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }
  .d-blk-n {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font: 700 12px/1 var(--font-mono);
  }
  .d-blk-grip {
    color: var(--textdim);
    font-size: 11px;
  }
  .d-blk-i {
    color: var(--textdim);
    font: 600 10px/1 var(--font-mono);
  }
  .d-blk-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    background: var(--surface2, var(--border));
  }
  .d-pr {
    flex: 1 1 calc(50% - 1px);
    min-width: 0;
    display: grid;
    gap: 3px;
    padding: 7px 9px;
    background: var(--bg2);
    cursor: grab;
  }
  .d-pr.hit {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg2));
  }
  .d-pk {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--textdim);
    font: 500 9px/1 var(--font-mono);
  }
  .d-pv {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font: 700 12.5px/1 var(--font-mono);
  }
  .d-pr.hit .d-pv {
    color: var(--accent);
  }

  /* section head + quick tags (§3) */
  .section-head {
    margin-top: 4px;
  }
  .section-head.saved-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-head em {
    color: var(--textdim);
    font-style: normal;
    font: 800 10px/1 var(--font-mono);
  }

  /* §3 presence views (LIBRARY list) */
  .views-list button.view-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    text-transform: none;
  }
  .view-glyph {
    display: grid;
    place-items: center;
    font-size: 13px;
  }
  .view-row strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 12.5px/1 var(--font-ui);
  }
  .view-row.active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--accent);
  }
  .view-row.active strong {
    color: var(--accent);
  }
  .cloud-signin {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--textdim);
    font: 600 11px/1.2 var(--font-mono);
  }

  /* §3.3 saved filters */
  .save-in input {
    width: 100%;
    height: 32px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text);
    padding: 0 10px;
    font: 500 12px/1 var(--font-mono);
    outline: none;
  }
  .saved-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sv {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }
  .sv-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    height: auto;
    min-height: 38px;
    padding: 6px 10px;
    text-transform: none;
  }
  .sv.active .sv-main {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .sv-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 999px;
    background: var(--textdim);
  }
  .sv-txt {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .sv-txt strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 12.5px/1 var(--font-ui);
  }
  .sv.active .sv-txt strong {
    color: var(--accent);
  }
  .sv-txt small {
    min-width: 0;
    overflow: hidden;
    color: var(--textdim);
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 500 9.5px/1.2 var(--font-mono);
  }
  .sv-x {
    width: 28px;
    flex: none;
    display: grid;
    place-items: center;
    color: var(--textdim);
    font-size: 15px;
    text-transform: none;
  }
  .empty-s {
    padding: 8px 10px;
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
  }
  .save-filter {
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    text-transform: none;
    font: 700 11px/1 var(--font-mono);
  }
  .save-filter.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink, var(--bg));
  }
  .convert-preset {
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    text-transform: none;
    font: 700 11px/1 var(--font-mono);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    color: var(--accent);
  }
  .convert-preset:hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .quick-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .quick-tag {
    height: auto;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--tag-col) 33%, transparent);
    background: color-mix(in srgb, var(--tag-col) 14%, transparent);
    color: var(--tag-col);
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .quick-tag.on {
    background: var(--tag-col);
    color: var(--bg);
  }

  /* selection header + expander (§4) */
  .select-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 42px;
    padding: 0 11px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    font: 700 11px/1 var(--font-mono);
    text-transform: uppercase;
  }
  .select-head button {
    height: 28px;
    padding: 0 10px;
    text-transform: none;
  }
  .show-all {
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--border2, var(--border));
    background: var(--surface, var(--bg2));
    color: var(--text2);
    text-align: center;
    text-transform: none;
    font: 700 12px/1 var(--font-ui);
  }
  .axis-preset-detail {
    display: grid;
    gap: 14px;
  }
  .detail-title {
    display: grid;
    gap: 6px;
  }
  .detail-title span {
    color: var(--accent);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .detail-title h3 {
    margin: 0;
    color: var(--text);
    font-size: 18px;
    line-height: 1.2;
  }
  .detail-title p {
    margin: 0;
    color: var(--textdim);
    font-size: 12px;
  }
  .detail-status {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .detail-status span {
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .detail-status span.on {
    border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
    color: var(--accent);
  }
  dl {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    padding-bottom: 6px;
  }
  dt,
  dd {
    margin: 0;
    font-size: 11px;
  }
  dt {
    color: var(--textdim);
  }
  dd {
    color: var(--text2);
    text-align: right;
  }
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .tag-row span {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 7px;
    color: var(--text2);
    font-size: 10px;
  }
  .block-list {
    display: grid;
    gap: 5px;
  }
  .detail-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
    gap: 7px;
  }
  .load-action {
    height: 34px;
    text-align: center;
    text-transform: none;
  }
  .load-action.audition {
    color: var(--accent);
  }
  .load-action.secondary {
    color: var(--textdim);
  }
  .load-action.danger {
    color: var(--danger, #d6543f);
    border-color: color-mix(in srgb, var(--danger, #d6543f) 40%, var(--border));
  }
  .runtime-detail {
    display: grid;
    gap: 5px;
    color: var(--textdim);
    font-size: 11px;
  }
  .runtime-error {
    margin: 0;
    color: var(--danger, #d6543f);
    font-size: 11px;
    line-height: 1.4;
  }
  .block-list button {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 9px;
    text-transform: none;
  }
  .block-list span,
  .block-list em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .block-list em {
    color: var(--textdim);
    font-style: normal;
    font-size: 10px;
  }
  .axis-part-empty {
    flex: 1;
    min-height: 140px;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--textdim);
  }
  .axis-part-empty strong {
    color: var(--text);
    font-size: 13px;
  }
  .axis-part-empty span {
    font-size: 12px;
  }
</style>
