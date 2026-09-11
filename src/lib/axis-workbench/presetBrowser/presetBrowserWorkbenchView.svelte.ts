import { onMount, tick } from 'svelte';
import { library, type LibEntry } from '$lib/preset/library.svelte';
import { editor } from '$lib/editor/editor.svelte';
import { history } from '$lib/editor/history.svelte';
import { startCrossConvert, openConvertedInConverter } from '$lib/preset/presetConvertSource';
import { convert } from '$lib/convert/convert.svelte';
import { bindAxisRuntimeHost } from '../runtimeBinding';
import { isSaveDirty } from '../widgets/saveDirtyState';
import { loadActionWarning } from './presetBrowserWorkbenchLoadWarning';
import {
  createAxisPresetBrowserDataView,
  buildEmptyDeviceSlotEntries,
  shouldSynthesizeEmptyDeviceSlots,
  type AxisPresetBrowserEntrySummary,
  type AxisPresetBrowserLibEntryLike
} from './presetBrowserWorkbenchData';
import { presenceViews as presenceViewDefs } from './presetBrowserWorkbenchPresence';
import {
  loadSavedFilters,
  persistSavedFilters,
  addSavedFilter,
  removeSavedFilter,
  type AxisPbSavedFilter
} from './presetBrowserWorkbenchSavedFilters';
import type { AxisPresetBrowserPart } from './types';
import {
  axisPresetBrowserWorkbenchController,
  type AxisPresetBrowserControllerSnapshot,
  type AxisPresetBrowserSort
} from './presetBrowserWorkbenchController';
import {
  axisPresetBrowserWorkbenchRuntime,
  type AxisPresetBrowserRuntimeSnapshot
} from './presetBrowserWorkbenchRuntime';
import { createAxisPresetBrowserWorkbenchHost } from './presetBrowserWorkbenchHost';
import { resolvePresetLoadAction } from './presetBrowserWorkbenchLoadAction';
import { applyRowCap } from './presetBrowserWorkbenchLayout';
import {
  incrementTagCount,
  loadTagCounts,
  persistTagCounts,
  renameTagCount,
  frequentTagRow
} from './presetBrowserWorkbenchFrequentTags';
import { presetRecency } from '$lib/preset/presetRecency.svelte';
import { deviceRealNames } from '$lib/device/deviceRealNames.svelte';
import { axisPbRowClickIntent } from './presetBrowserWorkbenchRowGesture';
import {
  specsBySlug,
  type SpecLibEntry
} from './presetBrowserWorkbenchSpecs';
import {
  buildAutocompleteContext,
  suggestInQuery,
  applyAcceptance,
  tidyQuery,
  type AxisPbAcItem
} from './presetBrowserWorkbenchAutocomplete';
import {
  buildFiltersContext,
  pickerItems as buildPickerItems,
  applyPick,
  addCondFromPayload,
  chipDescriptor,
  type AxisPbPickerKind,
  type AxisPbPickerCtx,
  type AxisPbDragPayload
} from './presetBrowserWorkbenchFilters';
import {
  buildDetailBlockCards,
  encodeDragPayload,
  parseDragPayload,
  AXIS_PB_DND_MIME,
  type DetailBlock
} from './presetBrowserWorkbenchParams';
import {
  buildAxisPbMenuActions,
  toWorkbenchMenuItems,
  type AxisPbMenuActionId
} from './presetBrowserWorkbenchMenu';
import {
  effectiveZoom,
  menuPositionBelowRect,
  menuPositionFromPointer,
  resolveMenuPlacement,
  type WorkbenchMenuItem,
  type WorkbenchMenuPosition
} from '../../workbench/svelte/contextMenu';
import { createPresetBrowserIndex } from './presetBrowserWorkbenchIndex.svelte';

// Comfortably under a native dblclick interval, but enough that a fast double-click's loadEntry
// sets loadingEntryId before this fires — the busy check below then skips hydration instead of
// racing loadEntry's device-slot load for the presetGrid read (see runtime.ts loadEntry comment).
const ROW_DETAIL_HYDRATE_DELAY_MS = 220;

// Shared reactive core for all four preset-browser panel parts (sources/list/detail/full). Every
// mounted leaf panel (see panels/preset-browser/*.svelte) calls this once and gets its OWN local UI
// state (autocomplete, pickers, menus, saved-filter editing, …) while reading/writing the module-level
// `axisPresetBrowserWorkbenchController` / `axisPresetBrowserWorkbenchRuntime` singletons — that split
// is what makes "owner election" (§1) and cross-part sync work in a split sources|list|detail dock: the
// query/filter/selection state is shared, but which instance currently renders the floating popovers is
// local per-instance state, elected by rank.
//
// This mirrors the pre-M5 AxisPresetBrowserPartPanel.svelte behaviour exactly — it is a factoring-out,
// not a redesign. Following the same rune-in-a-plain-function idiom as presetBrowserWorkbenchIndex.svelte.ts.
export function createAxisPresetBrowserPartView(part: AxisPresetBrowserPart) {
  let snapshot = $state<AxisPresetBrowserControllerSnapshot>(axisPresetBrowserWorkbenchController.snapshot);
  let runtimeSnapshot = $state<AxisPresetBrowserRuntimeSnapshot>(axisPresetBrowserWorkbenchRuntime.snapshot);
  let lastDetailEntryId: string | null = null;
  let detailHydrateTimer: ReturnType<typeof setTimeout> | null = null;

  // Live conditions the query filters by — parsed from the `` `...` `` spans in the one query field.
  // Read `snapshot.queryText` (a real property access) rather than `void snapshot` — a bare
  // `void <rune identifier>` does not register as a tracked read, so a derived built that way
  // never re-runs when the controller emits a new snapshot (found via e2e: a quick-tag click
  // updated the query text but never toggled the chip's `on` class).
  const activeConditions = $derived.by(() => {
    void snapshot.queryText;
    return axisPresetBrowserWorkbenchController.activeConditions;
  });
  const freeText = $derived.by(() => {
    void snapshot.queryText;
    return axisPresetBrowserWorkbenchController.freeText;
  });
  const baseEntries = $derived(library.entries as AxisPresetBrowserLibEntryLike[]);
  const presenceViews = presenceViewDefs();
  const presetIndex = createPresetBrowserIndex(
    () => baseEntries,
    library.tagsOf,
    deviceRealNames.realNameFor,
    presetRecency.at,
    library.paramsOf
  );
  const index = $derived(presetIndex.current);
  // Cleared/empty device slots render as muted `<EMPTY>` rows in the device view. Only meaningful with a
  // device actually connected: `editor.presetCount` is a 512-slot guess until a device is adopted, and a
  // cleared slot is a device concept — offline (even with a stale `cacheBuilt` flag from a past scan)
  // there is nothing to load into, so synthesizing hundreds of phantom rows is just noise.
  const emptyDeviceSlots = $derived.by<AxisPresetBrowserLibEntryLike[]>(() => {
    if (!shouldSynthesizeEmptyDeviceSlots(library.cacheBuilt, editor.conn.state)) return [];
    return buildEmptyDeviceSlotEntries(editor.presetCount, (n) => !index.deviceSlots.has(n));
  });
  const data = $derived(createAxisPresetBrowserDataView({
    entries: baseEntries,
    // When a library view is active, filter over the full base set; otherwise reuse the library's
    // pre-filtered list.
    filteredEntries: snapshot.presenceView === 'all' ? library.filtered : baseEntries,
    emptySlots: emptyDeviceSlots,
    sourceId: snapshot.sourceId,
    selectedEntryId: snapshot.entryId,
    tagsOf: library.tagsOf,
    // Reads presetRecency.map inside this $derived, so a load re-sorts the list live.
    lastLoadedAt: presetRecency.at,
    conditions: activeConditions,
    simpleQuery: freeText,
    realNameFor: deviceRealNames.realNameFor,
    prepared: index.match,
    sort: snapshot.sort,
    sortDir: snapshot.sortDir,
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
  // Frequent tags — local-only usage counts (localStorage["axs.pb.frequentTags"]), padded with the
  // user's real tag vocabulary so the row is never a canned/irrelevant palette (see
  // presetBrowserWorkbenchFrequentTags.ts). Counts decide only WHICH tags make the row; the row
  // itself is always alphabetical, so neither toggling a chip nor tagging a preset (recordTagUsage
  // fires from all three) can move a chip out from under the cursor. It reshuffles only when a tag
  // actually crosses in or out of the top MAX.
  let tagCounts = $state(loadTagCounts());
  const tagRow = $derived(frequentTagRow(tagCounts, library.allTags));
  function recordTagUsage(tag: string) {
    tagCounts = incrementTagCount(tagCounts, tag);
    persistTagCounts(tagCounts);
  }
  // 14-row soft cap + "Show all" expander (§4.1).
  const rowCap = $derived(applyRowCap(data.visibleEntries, snapshot.showAllRows));
  const activeTags = $derived(
    new Set(activeConditions.filter((c) => c.kind === 'tag').map((c) => c.val.toLowerCase()))
  );
  const isOwner = $derived(snapshot.owner === part);
  const selectedDetail = $derived(snapshot.entryId ? runtimeSnapshot.details[snapshot.entryId] : null);

  // Load preset / Audition both replace the edit buffer, so both discard unsaved edits to the
  // current preset. Same derivation as the Save widget chip, so the two can never disagree.
  const saveDirty = $derived(isSaveDirty(history.entries, history.cursor));
  const loadWarning = $derived(loadActionWarning(saveDirty, 'load'));
  const auditionWarning = $derived(loadActionWarning(saveDirty, 'audition'));

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
  const filtersContext = $derived(buildFiltersContext(specLibEntries, pbSpecs, library.allTags, (t) => library.colorOf(t)));

  // ── V13e autocomplete (advanced query bar) ──────────────────────────────────────────────────
  let queryEl: HTMLInputElement | undefined = $state();
  let caret = $state(0);
  let acOpen = $state(false);
  let acItems = $state<AxisPbAcItem[]>([]);
  let acIndex = $state(0);
  let acLabel = $state('');
  function recomputeAc() {
    const c = queryEl?.selectionStart ?? caret;
    const r = suggestInQuery(acContext, queryEl?.value ?? snapshot.queryText, c);
    if (!r.items.length && !r.label) { acOpen = false; return; } // caret outside any `` `...` `` span
    acItems = r.items; acLabel = r.label; acIndex = 0; acOpen = true;
  }
  // Tab return re-fires focus on the query input and would reopen the dropdown on
  // its own (same lingering-focus pattern as the nav rail). Unlike the rail we must
  // keep focus to type, so suppress the reopen only for the document-just-hidden case.
  let suppressAcOnFocus = $state(false);
  $effect(() => {
    const onVis = () => {
      if (document.hidden) suppressAcOnFocus = true;
      else setTimeout(() => (suppressAcOnFocus = false), 50);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });
  function onQueryFocus() {
    if (suppressAcOnFocus) { suppressAcOnFocus = false; return; }
    recomputeAc();
  }
  const closeAc = () => { acOpen = false; };
  function onQueryInput(e: Event) {
    const el = e.target as HTMLInputElement;
    let value = el.value;
    let pos = el.selectionStart ?? value.length;
    // Auto-pair a lone backtick: typing an unclosed ` opens a filter span and autocomplete right away,
    // so power users never have to type both ticks by hand.
    if (pos > 0 && value[pos - 1] === '`' && ((value.match(/`/g) ?? []).length % 2 === 1)) {
      value = value.slice(0, pos) + '`' + value.slice(pos);
      el.value = value;
      el.setSelectionRange(pos, pos);
    }
    caret = pos;
    axisPresetBrowserWorkbenchController.setQuery(value);
    recomputeAc();
  }
  function onQuerySelect(e: Event) {
    const el = e.target as HTMLInputElement;
    caret = el.selectionStart ?? 0;
    if ('key' in e && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes((e as KeyboardEvent).key)) return;
    if (acOpen) recomputeAc();
  }
  function onQueryKey(e: KeyboardEvent) {
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
      axisPresetBrowserWorkbenchController.setQuery(tidyQuery(snapshot.queryText));
    }, 130);
  }

  // ── V13e Filters builder-chips + pickers ────────────────────────────────────────────────────
  const chipDescriptors = $derived(activeConditions.map((c) => ({ cond: c, desc: chipDescriptor(c, (t) => library.colorOf(t)) })));
  type PickerState = { kind: AxisPbPickerKind; ctx: AxisPbPickerCtx; x: number; y: number };
  let picker = $state<PickerState | null>(null);
  let pickerSearch = $state('');
  let pickerHi = $state(0);

  // ── popover placement ───────────────────────────────────────────────────────────────────────
  // Both popovers here are `position: fixed` dropped at the pointer. Unclamped, they run off the
  // bottom of the window — Frequent Tags is the LAST sidebar section, so its chips are the lowest
  // thing you can right-click, and the swatch grid ended up unreachable. They also ignored the UI
  // scale: a fixed box in a zoomed subtree positions in LAYOUT px while pointer coords are VISUAL,
  // so at anything but 100% they drifted from the cursor. `resolveMenuPlacement` fixes both, and is
  // the same path every workbench menu already takes (see ContextMenu.svelte).
  //
  // The popover measures its OWN zoom rather than needing a scrim: it is fixed inside the same
  // zoomed subtree, so its visual/layout width ratio IS the factor a viewport-spanning probe would
  // report. `max-width: calc(100vw - 24px)` scales both measurements alike, so a narrow viewport
  // doesn't skew it.
  function placePopover(el: HTMLElement | null, at: WorkbenchMenuPosition): WorkbenchMenuPosition {
    if (!el?.offsetWidth) return at;
    const rect = el.getBoundingClientRect();
    return resolveMenuPlacement(
      at,
      { width: window.innerWidth, height: window.innerHeight },
      { width: rect.width, height: rect.height },
      effectiveZoom(rect.width, el.offsetWidth)
    );
  }
  // Placement needs the mounted box, so it lands one tick after the popover renders: first paint
  // sits at the raw pointer position (exactly where it sat before this existed), then the measured
  // clamp corrects it. ContextMenu accepts the same one-frame tradeoff. Do NOT hide the popover for
  // that frame — `visibility: hidden` cannot hold focus, and both popovers autofocus an input, so
  // hiding silently swallows the autofocus.
  let pickerEl = $state<HTMLElement | null>(null);
  let pickerPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  $effect(() => {
    const at = picker ? { x: picker.x, y: picker.y } : null;
    if (!at) return;
    pickerPos = at;
    void tick().then(() => {
      if (picker) pickerPos = placePopover(pickerEl, at);
    });
  });
  let lastAnchor: HTMLElement | null = null;
  const pickerList = $derived(picker ? buildPickerItems(filtersContext, picker.kind, picker.ctx, pickerSearch) : []);
  function openPicker(kind: AxisPbPickerKind, ctx: AxisPbPickerCtx, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    openPickerAt(kind, ctx, r.left, r.bottom + 6);
  }
  function openPickerAt(kind: AxisPbPickerKind, ctx: AxisPbPickerCtx, x: number, y: number) {
    tagMenu = null; // mutually exclusive with the tag swatch popover
    // Raw pointer position — `placePopover` clamps it against the MEASURED box once mounted, which
    // is what the hardcoded `innerWidth - 312` here used to approximate (badly, and only for x).
    picker = { kind, ctx, x, y };
    pickerSearch = ''; pickerHi = 0;
  }
  function pickerPick(v: string) {
    if (!picker) return;
    if (picker.kind === 'edittags') {
      const entryId = picker.ctx.entryId;
      if (entryId) {
        if (library.tagsOf(entryId).includes(v)) library.removeTag(entryId, v);
        else { library.addTag(entryId, v); recordTagUsage(v); }
        picker = { ...picker, ctx: { ...picker.ctx, entryTags: library.tagsOf(entryId) } };
      }
      return;
    }
    const res = applyPick(filtersContext, picker.kind, picker.ctx, v);
    if (res.type === 'chain') { openPickerKind(res.kind, res.ctx); return; }
    if (res.type === 'edit') {
      if (picker.kind === 'tag') recordTagUsage(v);
      axisPresetBrowserWorkbenchController.editConds(res.edit);
    }
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
  // Esc closes the picker wherever focus happens to be. The popover's own `onkeydown` only fires
  // while focus is inside it, which is not guaranteed for the `edittags` picker: it is opened from
  // the row context menu, whose focus trap restores focus to the row as it unmounts.
  function onWindowKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (picker) picker = null;
    if (tagMenu) tagMenu = null;
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

  // Warm the query vocabulary in IDLE time, never on the click path. `acContext` / `filtersContext`
  // are read ONLY from recomputeAc() (onfocus) and the picker, so without this the first click on the
  // query input synchronously builds the spec table over every param of every preset before the
  // dropdown can paint — the same "expensive build on the open path" bug the monolith's Orama index
  // hit (PresetBrowser.svelte). Both contexts share specLibEntries + pbSpecs, so this is ONE traversal.
  $effect(() => {
    if (part !== 'full' && part !== 'list') return; // only these parts render the query bar + Filters block
    void baseEntries.length; // track the library set → re-warm after a scan/import, not on every keystroke
    const warm = () => { void acContext; void filtersContext; };
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    const id = ric ? ric(warm, { timeout: 1500 }) : (setTimeout(warm, 250) as unknown as number);
    return () => { if (ric && cic) cic(id); else clearTimeout(id); };
  });

  // Warm the real-device-name cache for every family the library uses, so free-text search can match
  // "hiwatt" against a preset's internal "HIPOWER" model once the catalog resolves (see matchSimple).
  $effect(() => {
    const slugs = new Set<string>();
    for (const e of baseEntries) for (const slug of Object.keys(e.summary.models ?? {})) slugs.add(slug);
    deviceRealNames.prime(slugs);
  });

  function onRowClick(entry: AxisPresetBrowserEntrySummary, event: MouseEvent) {
    const intent = axisPbRowClickIntent(event);
    if (intent === 'mark') {
      axisPresetBrowserWorkbenchController.toggleMark(entry.id);
    } else if (intent === 'markRange') {
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
    // Empty slots have no preset to hydrate — findEntry would resolve null and loadDetail would no-op/error.
    if (data.selectedEntry?.empty) return;
    // The load/audition burst has priority on the serial device channel — hydrating detail
    // (grid/params/versions) at the same time queues behind or with it on the ForgeFX server.
    // This re-runs once the runtime clears the in-flight id (loadingEntryId/auditioningEntryId
    // are set synchronously before the first await, so the gate is armed by the time this flushes).
    // Check both independently — a `??` here would miss the case where a DIFFERENT, superseded
    // entry is still loading (its loadingEntryId lingers) while the selected entry is auditioning.
    const busy = (entryId: string) =>
      runtimeSnapshot.loadingEntryId === entryId || runtimeSnapshot.auditioningEntryId === entryId;
    if (busy(snapshot.entryId)) return;
    const entryId = snapshot.entryId;
    // Defer the actual fetch: a plain click here is often the first half of a double-click. Firing
    // detail hydration immediately means its presetGrid read is already in flight by the time
    // loadEntry's dblclick handler wants the device slot, which makes every double-click load wait
    // out the whole hydration. Give a fast dblclick a chance to set loadingEntryId first — the
    // re-checked busy() below then skips hydration entirely and it retries once the load completes.
    detailHydrateTimer = setTimeout(() => {
      detailHydrateTimer = null;
      if (busy(entryId)) return;
      lastDetailEntryId = entryId;
      void axisPresetBrowserWorkbenchRuntime.loadDetail(entryId);
    }, ROW_DETAIL_HYDRATE_DELAY_MS);
    return () => {
      if (detailHydrateTimer) {
        clearTimeout(detailHydrateTimer);
        detailHydrateTimer = null;
      }
    };
  });

  function selectSource(sourceId: string) {
    axisPresetBrowserWorkbenchController.openSource(sourceId);
  }

  // Plain click: select only. Populates the detail pane + sets the range anchor, no device I/O.
  function selectEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
  }

  function loadEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    const action = resolvePresetLoadAction(entry);
    if (action.kind === 'openConverter') openConverter(entry.id);
    else if (action.kind === 'loadEmptySlot') void editor.selectPreset(action.number, { recency: false });
    else void axisPresetBrowserWorkbenchRuntime.loadEntry(entry.id);
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
    return editor.canRenamePresets && entry.sourceId === 'device' && !entry.empty && (entry.number ?? -1) >= 0;
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

  // ── §4.1 column-header sorting ───────────────────────────────────────────────────────────────
  // Re-picking the active column flips its direction; picking a different one hands the direction back
  // to `setSort`, which resets to that field's natural default (A-Z ascending, CPU/recent descending).
  function toggleSort(key: AxisPresetBrowserSort) {
    if (snapshot.sort === key) {
      axisPresetBrowserWorkbenchController.setSortDir(snapshot.sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      axisPresetBrowserWorkbenchController.setSort(key);
    }
  }
  const sortArrow = (key: AxisPresetBrowserSort) =>
    snapshot.sort === key ? (snapshot.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const sortLabel = (key: AxisPresetBrowserSort, field: string) =>
    snapshot.sort === key
      ? `Sorted by ${field}, ${snapshot.sortDir === 'asc' ? 'ascending' : 'descending'} — click to reverse`
      : `Sort by ${field}`;

  // ── toolbar overflow (⋯) ─────────────────────────────────────────────────────────────────────
  // Occasional maintenance/tooling, one click deep. Local to the instance that owns the query bar
  // (list/full) — unlike the row menu it acts on nothing shared, so it needs no overlay-owner rank.
  let toolsOpen = $state(false);
  let toolsPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  const toolsItems = $derived<WorkbenchMenuItem[]>([
    {
      id: 'rescan',
      label: library.scanning ? `Scanning ${library.scanDone}/${library.scanTotal}…` : 'Re-scan device',
      hint: editor.scanNamesOnly ? 'Names only' : 'Full index',
      disabled: library.scanning,
      run: () => void library.buildCache()
    },
    {
      id: 'convert',
      label: 'Convert Preset…',
      hint: 'Cross-device',
      separatorBefore: true,
      run: () => convert.openBlank()
    }
  ]);
  function openToolsMenu(event: MouseEvent) {
    event.stopPropagation(); // the window click handler below closes menus — don't let it eat this open
    toolsPos = menuPositionBelowRect((event.currentTarget as HTMLElement).getBoundingClientRect());
    toolsOpen = true;
  }

  // ── §4.4 row context menu (right-click / long-press) ────────────────────────────────────────
  // The generic workbench ContextMenu, rendered by the overlay OWNER instance only (§1 rank rule) so a
  // split sources|list|detail layout never double-renders the menu. Actions carry real backing:
  // Load/Audition (runtime), Favorite (library.toggleFav) and Rename (editor.renameStoredPreset).
  let menuOpen = $state(false);
  let menuPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  let menuItems = $state<WorkbenchMenuItem[]>([]);
  let menuEntry: AxisPresetBrowserEntrySummary | null = null;

  function openRowMenu(entry: AxisPresetBrowserEntrySummary, pos: WorkbenchMenuPosition) {
    menuEntry = entry;
    const actions = buildAxisPbMenuActions(
      {
        id: entry.id,
        deviceSlot: entry.sourceId === 'device' && (entry.number ?? -1) >= 0,
        fav: entry.fav,
        converted: entry.converted,
        empty: entry.empty
      },
      { canRename: editor.canRenamePresets }
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
        loadEntry(entry);
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
      case 'tags': {
        // Deferred a tick: the menu-item click that reaches us here is still bubbling toward the
        // `<svelte:window onclick>` picker-closer below, which would otherwise null this picker back
        // out the instant it opens. Capture id/name/tags now (not read from `menuEntry` later) so a
        // second right-click before the timeout fires can't retarget this picker mid-flight.
        const pos = { ...menuPos };
        const ctx = { entryId: entry.id, entryName: entry.name, entryTags: library.tagsOf(entry.id) };
        setTimeout(() => openPickerAt('edittags', ctx, pos.x, pos.y));
        return;
      }
      case 'crossConvert':
        crossConvert(entry.id);
        return;
      case 'openConverter':
        openConverter(entry.id);
        return;
      case 'deleteConverted':
        deleteConverted(entry.id);
        return;
    }
  }
  // ── §4.5 tag color swatch grid (right-click / long-press a tag anywhere it renders) ───────────
  // Rendered only on the overlay-owner part (§1 rank rule), same as the row context menu.
  let tagMenu = $state<{ tag: string; x: number; y: number } | null>(null);
  let tagMenuEl = $state<HTMLElement | null>(null);
  let tagMenuPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  $effect(() => {
    const at = tagMenu ? { x: tagMenu.x, y: tagMenu.y } : null;
    if (!at) return;
    tagMenuPos = at;
    void tick().then(() => {
      if (tagMenu) tagMenuPos = placePopover(tagMenuEl, at);
    });
  });
  function openTagMenu(e: MouseEvent, tag: string) {
    e.preventDefault();
    e.stopPropagation(); // on a row pill, this is what makes the tag win over onRowContext
    picker = null; // mutually exclusive with the filter/edittags picker popover
    const pos = menuPositionFromPointer(e);
    tagRenameValue = tag;
    tagMenu = { tag, x: pos.x, y: pos.y };
  }
  function pickTagSwatch(i: number) {
    if (!tagMenu) return;
    library.setTagColor(tagMenu.tag, i);
    tagMenu = null;
  }
  // Rename from the same popover. A tag is a bare string repeated across presets, so the rewrite has
  // three owners: the assignments + color registry (library.renameTag) and the Frequent Tags counts,
  // which live here in panel state. Renaming onto an existing tag merges the two. Filters are left
  // alone by design — see the note in src/lib/tagRename.ts.
  let tagRenameValue = $state('');
  function commitTagRename() {
    const from = tagMenu?.tag;
    const to = tagRenameValue.trim();
    tagMenu = null;
    if (!from || !to || to === from) return;
    library.renameTag(from, to);
    tagCounts = renameTagCount(tagCounts, from, to);
    persistTagCounts(tagCounts);
  }
  // Long-press on a row shares one gesture with the row menu; if the hold landed on a tag pill,
  // open the tag menu there instead of the preset menu (the `longPress` detail only carries a
  // point, so resolve the pill under it the same way a native contextmenu would hit-test).
  function rowLongPress(entry: AxisPresetBrowserEntrySummary, d: { x: number; y: number }) {
    const pillTag = (document.elementFromPoint(d.x, d.y) as HTMLElement | null)?.closest<HTMLElement>('.tag-pill')?.dataset.tag;
    if (pillTag) { picker = null; tagRenameValue = pillTag; tagMenu = { tag: pillTag, x: d.x, y: d.y }; return; }
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    openRowMenu(entry, { x: d.x, y: d.y });
  }

  return {
    get snapshot() { return snapshot; },
    get runtimeSnapshot() { return runtimeSnapshot; },
    get activeConditions() { return activeConditions; },
    get data() { return data; },
    get presenceViews() { return presenceViews; },
    get savedFilters() { return savedFilters; },
    get saveName() { return saveName; },
    set saveName(v: string) { saveName = v; },
    commitSaveFilter,
    deleteSavedFilter,
    applySavedFilter,
    get tagRow() { return tagRow; },
    recordTagUsage,
    get rowCap() { return rowCap; },
    get activeTags() { return activeTags; },
    get isOwner() { return isOwner; },
    get selectedDetail() { return selectedDetail; },
    get saveDirty() { return saveDirty; },
    get loadWarning() { return loadWarning; },
    get auditionWarning() { return auditionWarning; },

    get queryEl() { return queryEl; },
    set queryEl(v: HTMLInputElement | undefined) { queryEl = v; },
    get acOpen() { return acOpen; },
    get acItems() { return acItems; },
    get acIndex() { return acIndex; },
    set acIndex(v: number) { acIndex = v; },
    get acLabel() { return acLabel; },
    onQueryFocus,
    onQueryInput,
    onQuerySelect,
    onQueryKey,
    onQueryBlur,
    acceptAc,

    get chipDescriptors() { return chipDescriptors; },
    get picker() { return picker; },
    set picker(v: PickerState | null) { picker = v; },
    get pickerEl() { return pickerEl; },
    set pickerEl(v: HTMLElement | null) { pickerEl = v; },
    get pickerPos() { return pickerPos; },
    get pickerList() { return pickerList; },
    get pickerSearch() { return pickerSearch; },
    set pickerSearch(v: string) { pickerSearch = v; },
    get pickerHi() { return pickerHi; },
    set pickerHi(v: number) { pickerHi = v; },
    onAddFilter,
    onAddParam,
    onPickerKey,
    onWindowKey,
    pickerPick,
    removeCondAt,
    removeParamAt,

    get dragOver() { return dragOver; },
    set dragOver(v: boolean) { dragOver = v; },
    startDrag,
    addPayload,
    onFiltersDrop,

    get selectedDecodedBlocks() { return selectedDecodedBlocks; },
    get detailBlockCards() { return detailBlockCards; },

    onRowClick,
    selectSource,
    selectEntry,
    loadEntry,
    openConverter,
    deleteConverted,
    auditionEntry,
    crossConvert,

    get renamingId() { return renamingId; },
    get renameValue() { return renameValue; },
    set renameValue(v: string) { renameValue = v; },
    canRename,
    beginRename,
    commitRename,
    cancelRename,

    toggleSort,
    sortArrow,
    sortLabel,

    get toolsOpen() { return toolsOpen; },
    set toolsOpen(v: boolean) { toolsOpen = v; },
    get toolsPos() { return toolsPos; },
    get toolsItems() { return toolsItems; },
    openToolsMenu,

    get menuOpen() { return menuOpen; },
    set menuOpen(v: boolean) { menuOpen = v; },
    get menuPos() { return menuPos; },
    get menuItems() { return menuItems; },
    onRowContext,

    get tagMenu() { return tagMenu; },
    set tagMenu(v: { tag: string; x: number; y: number } | null) { tagMenu = v; },
    get tagMenuEl() { return tagMenuEl; },
    set tagMenuEl(v: HTMLElement | null) { tagMenuEl = v; },
    get tagMenuPos() { return tagMenuPos; },
    get tagRenameValue() { return tagRenameValue; },
    set tagRenameValue(v: string) { tagRenameValue = v; },
    openTagMenu,
    pickTagSwatch,
    commitTagRename,
    rowLongPress
  };
}

export type AxisPresetBrowserPartView = ReturnType<typeof createAxisPresetBrowserPartView>;
