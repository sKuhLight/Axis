<script lang="ts">
  import { deviceSession, editorOverlays, editorViewport, presetBuffer } from '$lib/editor/editorClients.svelte';
  import { library } from './library.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
  import FavoriteStar from '$lib/ui/FavoriteStar.svelte';

  type Recent = { n: number; name: string };
  let recents = $state<Recent[]>([]);
  let favs = $state<Recent[]>([]);
  let query = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  const KEY = 'axs.presets';
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ rec: recents, fav: favs }));
    } catch {
      /* */
    }
  }
  function loadStore() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Array.isArray(j?.rec)) recents = j.rec;
      if (Array.isArray(j?.fav)) favs = j.fav;
    } catch {
      /* */
    }
  }
  function pushRecent(n: number, name: string) {
    recents = [{ n, name }, ...recents.filter((r) => r.n !== n)].slice(0, 12);
    persist();
  }
  const isFav = (n: number) => favs.some((f) => f.n === n);
  function toggleFav(n: number, name: string) {
    favs = isFav(n) ? favs.filter((f) => f.n !== n) : [{ n, name: name || nameOf(n) }, ...favs].slice(0, 60);
    persist();
  }

  let filter = $state<'all' | 'fav' | 'recent'>('all');
  // Pick-a-slot mode: when the editor set a pick request, the picker RETURNS the chosen slot (number +
  // name) and closes, instead of loading the preset onto the device. Used by the cross-device converter
  // save dialog (plain chooser) and by the browser's "Save to device…" / the top-bar Save while
  // auditioning (`save` = the save-to-device chrome: names the preset, defaults to first empty).
  const pickReq = $derived(editorOverlays.presetPick);
  const pickMode = $derived(!!pickReq);
  const saveMode = $derived(!!pickReq?.save);
  // Save-to-device mode preselects a destination but never commits it: a row click only moves the
  // selection, and the footer's explicit button is the one write.
  let selectedSlot = $state<number | null>(null);
  // The reset must fire only on the closed→open TRANSITION: `firstEmptySlot()` reads reactive library
  // state, so without this guard a background scan landing while the picker is open would re-run the
  // effect and throw away the user's slot choice.
  let wasPickOpen = false;
  $effect(() => {
    const open = editorOverlays.presetOpen;
    if (open && !wasPickOpen) {
      query = '';
      filter = 'all';
      selectedSlot = saveMode ? firstEmptySlot() : null;
      loadStore();
      setTimeout(() => inputEl?.focus(), 0);
    }
    wasPickOpen = open;
  });

  /** First slot the library can certify as empty, or null when the device hasn't been scanned (no
   *  slot is provably free, so the user must choose — the confirm button stays disabled). */
  function firstEmptySlot(): number | null {
    for (let n = 0; n < deviceSession.presetCount; n++) {
      if (library.slotIsEmpty(n)) return n;
    }
    return null;
  }

  const pad = (n: number) => String(n).padStart(3, '0');
  const typedNum = $derived.by(() => {
    const q = query.trim();
    return /^\d+$/.test(q) ? Number(q) : null;
  });
  function nameOf(n: number): string {
    if (deviceSession.preset?.number === n && deviceSession.preset.name) return deviceSession.preset.name;
    if (library.slotIsEmpty(n)) return ''; // scanned + cleared on the device — don't fall back to stale recents
    return library.nameOfSlot(n) || recents.find((r) => r.n === n)?.name || '';
  }
  // full slot list, filtered by number or known name
  const rows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const all = Array.from({ length: deviceSession.presetCount }, (_, n) => ({ n, name: nameOf(n) }));
    if (!q) return all;
    return all.filter((r) => r.name.toLowerCase().includes(q) || pad(r.n).includes(q) || String(r.n).includes(q));
  });

  // the list shown under the tabs (search overrides the active filter)
  const mainList = $derived.by(() => {
    if (query.trim()) return rows;
    if (filter === 'fav') return favs.map((f) => ({ n: f.n, name: f.name || nameOf(f.n) }));
    if (filter === 'recent') return recents.map((r) => ({ n: r.n, name: r.name || nameOf(r.n) }));
    return rows;
  });

  const selectedOccupied = $derived(selectedSlot != null && !library.slotIsEmpty(selectedSlot));
  const selectedName = $derived(selectedSlot != null ? nameOf(selectedSlot) : '');
  const selectedPad = $derived(selectedSlot == null ? '' : pad(selectedSlot));
  function close() {
    editorOverlays.presetOpen = false;
    editorOverlays.presetPick = null;
  }
  async function go(n: number, name = '') {
    const pick = editorOverlays.presetPick;
    if (pick) {
      // In save mode the row click only moves the destination; the footer button commits it.
      if (saveMode) {
        selectedSlot = n;
        return;
      }
      editorOverlays.presetOpen = false;
      editorOverlays.presetPick = null;
      pick.onPick(n, name || nameOf(n));
      return;
    }
    await presetBuffer.selectPreset(n);
    pushRecent(n, name || deviceSession.preset?.name || '');
  }
  function confirmSave() {
    const pick = editorOverlays.presetPick;
    const n = selectedSlot;
    if (!pick || n == null) return;
    editorOverlays.presetOpen = false;
    editorOverlays.presetPick = null;
    pick.onPick(n, nameOf(n));
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (saveMode) {
        // A typed number moves the destination; Enter again (or the button) commits it.
        if (typedNum !== null) go(typedNum);
        else if (selectedSlot != null) confirmSave();
        return;
      }
      if (typedNum !== null) go(typedNum);
      else if (rows[0]) go(rows[0].n, rows[0].name);
    }
    // Escape is handled by the dialog shell.
  }
</script>

<Dialog
  overlay="presetPicker"
  open={editorOverlays.presetOpen}
  onClose={close}
  width="680px"
  maxHeight="84vh"
  align="top"
  mobileFull={editorViewport.isMobile}
  class="preset-picker-dlg"
>
  <div class="wrap">
      <div class="head">
        <div class="title-row">
          <span class="title">{saveMode ? 'Save to device' : pickMode ? 'Choose a slot' : 'Presets'}</span>
          {#if deviceSession.preset && deviceSession.preset.number >= 0}
            <span class="cur mono">PRE {pad(deviceSession.preset.number)}</span>
          {/if}
          <span class="spacer"></span>
          <button class="close" aria-label="Close" onclick={close}>✕</button>
        </div>
        {#if saveMode && pickReq?.save}
          <p class="save-lede">
            <b>{pickReq.save.name}</b>{#if pickReq.save.source}<span> · {pickReq.save.source}</span>{/if} — choose the slot it should live on.
          </p>
        {/if}
        <div class="search">
          <svg width="18" height="18" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" stroke="#6a6a74" stroke-width="1.5" /><path d="M10.8 10.8 L14.5 14.5" stroke="#6a6a74" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input bind:this={inputEl} bind:value={query} onkeydown={onKey} placeholder="Type a preset number, then Enter…" />
        </div>
        {#if !saveMode}
          <div class="tabs scroll">
            <button class="tab" class:on={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
            <button class="tab" class:on={filter === 'fav'} onclick={() => (filter = 'fav')}>★ Favorites</button>
            <button class="tab" class:on={filter === 'recent'} onclick={() => (filter = 'recent')}>Recent</button>
          </div>
        {/if}
      </div>

      {#snippet presetRow(r: Recent)}
        {@const isEmptySlot = library.slotIsEmpty(r.n)}
        <div class="rowwrap" class:active={deviceSession.preset?.number === r.n} class:chosen={saveMode && selectedSlot === r.n}>
          <button class="row" onclick={() => go(r.n, r.name)}>
            <span class="num mono">{pad(r.n)}</span>
            <span class="rtext"><span class="rname" class:dim={isEmptySlot}>{isEmptySlot ? '<EMPTY>' : r.name || `Preset ${r.n}`}</span></span>
            {#if deviceSession.preset?.number === r.n}<span class="active-b mono">ACTIVE</span>{/if}
          </button>
          {#if !saveMode}<FavoriteStar on={isFav(r.n)} onclick={() => toggleFav(r.n, r.name)} />{/if}
        </div>
      {/snippet}

      <div class="list scroll">
        {#if !saveMode && !query.trim() && filter === 'all' && recents.length}
          <div class="section mono">RECENT</div>
          <div class="chiprow scroll">
            {#each recents as r (r.n)}
              <button class="chip" class:active={deviceSession.preset?.number === r.n} onclick={() => go(r.n, r.name)}>
                <span class="cnum mono">{pad(r.n)}</span><span class="cname">{r.name || `Preset ${r.n}`}</span>
              </button>
            {/each}
          </div>
        {/if}
        <div class="section mono">
          {query.trim() ? `${mainList.length} MATCH${mainList.length === 1 ? '' : 'ES'}` : saveMode ? 'DEVICE SLOTS' : filter === 'fav' ? 'FAVORITES' : filter === 'recent' ? 'RECENT' : 'ALL PRESETS'}
        </div>
        {#each mainList.slice(0, 300) as r (r.n)}{@render presetRow(r)}{/each}
        {#if mainList.length > 300}
          <div class="empty">+{mainList.length - 300} more — type a number or name to filter</div>
        {/if}
        {#if mainList.length === 0}
          <div class="empty">{filter === 'fav' ? 'No favorites yet — tap ☆ on a preset.' : `No presets match “${query}”.`}</div>
        {/if}
      </div>

      {#if saveMode}
        <div class="savefoot">
          {#if selectedSlot != null}
            {#if selectedOccupied}
              <div class="overwrite">Slot {pad(selectedSlot)} already holds “{selectedName || 'a preset'}”. Saving replaces it — this cannot be undone on the device.</div>
            {:else}
              <div class="target"><span class="ok-dot"></span>Save to empty slot {pad(selectedSlot)}.</div>
            {/if}
          {:else}
            <div class="target dim">No empty slot is certified yet — pick a destination slot.</div>
          {/if}
          <div class="savebtns">
            <button type="button" class="sbtn" onclick={close}>Cancel</button>
            <button
              type="button"
              class="sbtn primary"
              class:replace={selectedOccupied}
              disabled={selectedSlot == null}
              onclick={confirmSave}
            >
              {selectedOccupied ? `Replace preset ${selectedPad}` : selectedSlot != null ? `Save to slot ${selectedPad}` : 'Save to device'}
            </button>
          </div>
        </div>
      {:else}
        <div class="foot mono">
          <span>Type # + ⏎ {pickMode ? 'Choose' : 'Load'}</span><span>★ Favorite</span><span>Esc Close</span>
        </div>
      {/if}
  </div>
</Dialog>

<style>
  /* card frame comes from Dialog; this is the layout-only remainder of the old `.card`. */
  .wrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
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
  .cur {
    font: 700 10px/1 var(--font-mono);
    color: #f5c878;
    background: var(--surface2);
    border: 1px solid var(--amber-border);
    border-radius: 6px;
    padding: 5px 8px;
    letter-spacing: 0.04em;
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
  .tabs {
    display: flex;
    gap: 6px;
    margin-top: 11px;
    overflow-x: auto;
  }
  .tab {
    flex: none;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid var(--surface-3);
    background: var(--panel-2);
    color: var(--textdim);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    outline: none;
  }
  .tab:focus-visible {
    border-color: var(--accent);
  }
  .tab.on {
    background: rgba(53, 201, 214, 0.14);
    border-color: var(--accent-border);
    color: var(--accent);
  }
  .list {
    flex: 1;
    min-height: 140px;
    overflow-y: auto;
    padding: 8px 10px 12px;
  }
  .chiprow {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding: 2px 8px 8px;
  }
  .chip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--surface-3);
    background: var(--panel-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover {
    border-color: var(--border-strong);
  }
  .chip.active {
    border-color: var(--amber-border);
    background: rgba(245, 166, 35, 0.08);
  }
  .cnum {
    font: 700 11px/1 var(--font-mono);
    color: var(--accent);
  }
  .cname {
    font-size: 12px;
    font-weight: 600;
    color: var(--text2);
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
  .section {
    font: 600 10px/1 var(--font-mono);
    color: var(--textmuted);
    letter-spacing: 0.1em;
    padding: 13px 8px 9px;
  }
  .rowwrap {
    display: flex;
    align-items: center;
    border-radius: 11px;
  }
  .rowwrap:hover {
    background: var(--accent-tint);
  }
  .rowwrap.active {
    background: var(--amber-tint);
  }
  .row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 8px 10px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    cursor: pointer;
    text-align: left;
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
  }
  .rtext {
    flex: 1;
    min-width: 0;
  }
  .rname {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* An uninitialized slot reads "<EMPTY>" and dims, matching the preset browser's result list. */
  .rname.dim {
    color: var(--textdim);
    font-weight: 600;
  }
  .active-b {
    flex: none;
    font: 700 9px/1 var(--font-mono);
    color: #f5c878;
    background: var(--surface2);
    border: 1px solid var(--amber-border);
    border-radius: 5px;
    padding: 4px 7px;
    letter-spacing: 0.06em;
  }
  /* ── save-to-device chrome ── */
  .save-lede {
    margin: 10px 0 0;
    color: var(--text2);
    font-size: 13px;
    line-height: 1.4;
  }
  .save-lede b {
    color: var(--text);
  }
  .save-lede span {
    color: var(--textdim);
  }
  .rowwrap.chosen {
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .savefoot {
    flex: none;
    display: grid;
    gap: 10px;
    padding: 12px 16px 14px;
    border-top: 1px solid var(--surface2);
  }
  .overwrite {
    color: var(--amber);
    font-size: 12px;
    line-height: 1.45;
  }
  .target {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text2);
    font-size: 12px;
  }
  .target.dim {
    color: var(--textdim);
  }
  .ok-dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--ok);
  }
  .savebtns {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .sbtn {
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--text2);
    font: 700 12px/1 var(--font-ui);
    cursor: pointer;
  }
  .sbtn:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .sbtn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
  .sbtn.primary:hover {
    border-color: var(--accent);
    color: var(--bg);
    filter: brightness(1.08);
  }
  .sbtn.primary.replace {
    background: var(--amber);
    border-color: var(--amber);
    color: var(--bg);
  }
  .sbtn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
</style>
