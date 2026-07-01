<script lang="ts">
  import { editor } from './editor.svelte';
  import { forgefx } from './forgefx';
  import { catFor } from './catalog';
  import type { CabState } from './types';

  let cs = $state<CabState | null>(null);
  let irs = $state<Record<string, string[]>>({});
  let loading = $state(false);
  let slot = $state(0); // 0-based slot index
  let mode = $state<'legacy' | 'dyna'>('legacy');
  let bank = $state('FACTORY 1');
  let query = $state('');
  let hi = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  const cat = catFor('Cab', 'Cab'); // cab accent for chips

  const curSlot = $derived(cs?.slots[slot]);

  // favorites + recents (persisted), keyed by `${mode}:${bank}:${name}`
  let favs = $state<string[]>([]);
  let recents = $state<string[]>([]);
  const KEY = 'axs.cabirs';
  function loadStore() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      favs = Array.isArray(j?.fav) ? j.fav : [];
      recents = Array.isArray(j?.rec) ? j.rec : [];
    } catch {
      /* */
    }
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ fav: favs, rec: recents }));
    } catch {
      /* */
    }
  }
  const idOf = (name: string) => `${mode}:${mode === 'legacy' ? bank : 'dyna'}:${name}`;
  const isFav = (id: string) => favs.includes(id);
  function toggleFav(id: string) {
    favs = isFav(id) ? favs.filter((x) => x !== id) : [id, ...favs].slice(0, 120);
    persist();
  }
  function pushRecent(id: string) {
    recents = [id, ...recents.filter((x) => x !== id)].slice(0, 16);
    persist();
  }

  // load cab state + IR catalog when opened
  $effect(() => {
    if (!editor.cabPickerOpen || !editor.selected?.pack) return;
    query = '';
    hi = 0;
    loadStore();
    loading = true;
    const eid = editor.selected.effectId;
    Promise.all([forgefx.cabState(eid), forgefx.cabIrs()])
      .then(([state, banks]) => {
        cs = state;
        irs = banks;
        slot = 0;
        mode = state.mode.label.toUpperCase().includes('DYNA') ? 'dyna' : 'legacy';
        bank = state.slots[0]?.bank.label ?? state.bankOptions[0] ?? 'FACTORY 1';
      })
      .catch(() => (cs = null))
      .finally(() => (loading = false));
    setTimeout(() => inputEl?.focus(), 0);
  });

  // when slot changes, follow that slot's current bank
  function selectSlot(i: number) {
    slot = i;
    bank = cs?.slots[i]?.bank.label ?? bank;
    hi = 0;
  }

  type Row = { id: string; name: string; sub: string; index: number; value: number };

  // all selectable rows for the current mode/bank
  const allRows = $derived.by<Row[]>(() => {
    if (mode === 'dyna') return (cs?.dynaOptions ?? []).map((o) => ({ id: `dyna:dyna:${o.label}`, name: o.label, sub: `Dyna #${o.value}`, index: o.value, value: o.value }));
    const list = irs[bank] ?? [];
    return list.map((name, i) => ({ id: `legacy:${bank}:${name}`, name, sub: `${bank} #${i + 1}`, index: i, value: i }));
  });

  const CAP = 250; // cap rendered rows (Factory banks have 1024 IRs) — search to narrow
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? allRows.filter((r) => r.name.toLowerCase().includes(q)) : allRows;
  });

  // sectioned: query overrides; else Favorites / Recent / All (capped)
  const view = $derived.by(() => {
    let i = 0;
    const seq = (rows: Row[]) => rows.map((r) => ({ ...r, fi: i++ }));
    if (query.trim()) {
      const rows = seq(filtered.slice(0, CAP));
      return { sections: [{ label: `${filtered.length} result${filtered.length === 1 ? '' : 's'}`, rows }], flat: rows, total: filtered.length };
    }
    const byId = new Map(allRows.map((r) => [r.id, r]));
    const mk = (ids: string[]) => ids.map((id) => byId.get(id)).filter((r): r is Row => !!r);
    const raw: { label: string; rows: Row[] }[] = [];
    const fr = mk(favs);
    if (fr.length) raw.push({ label: 'FAVORITES', rows: fr });
    const rr = mk(recents).filter((r) => !favs.includes(r.id));
    if (rr.length) raw.push({ label: 'RECENT', rows: rr });
    raw.push({ label: mode === 'dyna' ? 'ALL DYNA-CABS' : `ALL · ${bank}`, rows: allRows.slice(0, CAP) });
    const sections = raw.map((s) => ({ label: s.label, rows: seq(s.rows) }));
    return { sections, flat: sections.flatMap((s) => s.rows), total: allRows.length };
  });

  // is a row the live selection?
  function isCurrent(r: Row): boolean {
    if (!curSlot) return false;
    if (mode === 'dyna') return cs?.mode.value === 1 && curSlot.dyna.value === r.value;
    return cs?.mode.value === 0 && curSlot.bank.label === bank && curSlot.irIndex === r.index;
  }

  async function pick(r: Row | undefined) {
    if (!r || !cs || !curSlot) return;
    pushRecent(r.id);
    if (mode === 'dyna') {
      await editor.applyCab([
        { paramId: cs.modeParam, value: 1 },
        { paramId: curSlot.dynaParam, value: r.value }
      ]);
      editor.showToast(`Slot ${slot + 1}: ${r.name}`, '#35c9d6');
    } else {
      const bankOrd = cs.bankOptions.indexOf(bank);
      await editor.applyCab([
        { paramId: cs.modeParam, value: 0 },
        { paramId: curSlot.bankParam, value: bankOrd < 0 ? 0 : bankOrd },
        { paramId: curSlot.irParam, value: r.index }
      ]);
      editor.showToast(`Slot ${slot + 1}: ${r.name}`, '#35c9d6');
    }
    // refresh so the highlight + header follow the device
    forgefx
      .cabState(editor.selected!.effectId)
      .then((s) => (cs = s))
      .catch(() => {});
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      hi = Math.min(view.flat.length - 1, hi + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      hi = Math.max(0, hi - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(view.flat[hi]);
    } else if (e.key === 'Escape') {
      editor.cabPickerOpen = false;
    }
  }
</script>

{#if editor.cabPickerOpen}
  <div class="bg" role="presentation" onclick={() => (editor.cabPickerOpen = false)}>
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="search">
        <svg width="19" height="19" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" stroke="#6a6a74" stroke-width="1.5" /><path d="M10.8 10.8 L14.5 14.5" stroke="#6a6a74" stroke-width="1.5" stroke-linecap="round" /></svg>
        <input bind:this={inputEl} bind:value={query} oninput={() => (hi = 0)} onkeydown={onKey} placeholder={mode === 'dyna' ? 'Search DynaCabs…' : 'Search cab IRs…'} />
        <span class="count mono">{view.total} cab{view.total === 1 ? '' : 's'}</span>
        <button class="x" aria-label="Close" onclick={() => (editor.cabPickerOpen = false)}>✕</button>
      </div>

      <div class="chips">
        <!-- mode = the Legacy / DynaCab swap, right in the search -->
        <div class="seg">
          <button class:on={mode === 'legacy'} onclick={() => { mode = 'legacy'; hi = 0; }}>Legacy</button>
          <button class:on={mode === 'dyna'} onclick={() => { mode = 'dyna'; hi = 0; }}>DynaCab</button>
        </div>
        {#if cs && cs.slots.length > 1}
          <div class="seg slots">
            {#each cs.slots as s, i (s.slot)}
              <button class:on={slot === i} onclick={() => selectSlot(i)}>Slot {s.slot}</button>
            {/each}
          </div>
        {/if}
        {#if curSlot}
          <span class="cur" title="Current selection">{mode === 'dyna' ? curSlot.dyna.label : curSlot.irName}</span>
        {/if}
      </div>

      {#if mode === 'legacy'}
        <div class="cats scroll">
          {#each cs?.bankOptions ?? [] as b (b)}
            <button class="cat" class:on={bank === b} onclick={() => { bank = b; hi = 0; }}>{b}</button>
          {/each}
        </div>
      {/if}

      <div class="list scroll">
        {#if loading}
          <div class="empty">Loading…</div>
        {:else if mode === 'legacy' && bank === 'USER'}
          <div class="empty">User IRs are stored on the unit — names aren't in the editor catalog. Pick a slot # by index.</div>
        {:else if view.flat.length === 0}
          <div class="empty">{query ? `No cabs match “${query}”.` : 'No cabs in this bank.'}</div>
        {:else}
          {#each view.sections as s (s.label)}
            <div class="section mono">{s.label}{#if s.label.startsWith('ALL') && view.total > CAP && !query}<span class="more"> · showing {CAP} of {view.total}, search to narrow</span>{/if}</div>
            {#each s.rows as r (`${r.id}#${r.fi}`)}
              <div class="rowwrap" class:hi={r.fi === hi} class:sel={isCurrent(r)}>
                <button class="row" onmouseenter={() => (hi = r.fi)} onclick={() => pick(r)}>
                  <span class="chip" style="background:linear-gradient(180deg,{cat.accent}, {cat.accent}88); border-color:{cat.accent};">{cat.glyph}</span>
                  <span class="rtext">
                    <span class="rname">{r.name}</span>
                    <span class="rsub">{r.sub}</span>
                  </span>
                  {#if isCurrent(r)}<span class="now mono">● live</span>{:else if r.fi === hi}<span class="ret mono">↵</span>{/if}
                </button>
                <button class="star" class:on={isFav(r.id)} aria-label="Favorite" title={isFav(r.id) ? 'Unfavorite' : 'Favorite'} onclick={() => toggleFav(r.id)}>{isFav(r.id) ? '★' : '☆'}</button>
              </div>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="foot mono"><span>↑↓ Navigate</span><span>⏎ Load</span><span>★ Favorite</span><span>Esc Close</span></div>
    </div>
  </div>
{/if}

<style>
  .bg {
    position: absolute;
    inset: 0;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(3px);
    z-index: 200;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 7vh 12px 12px;
    animation: axsOverlay 0.12s ease;
  }
  .card {
    width: 760px;
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
  .search {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--surface2);
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 17px;
    font-weight: 500;
  }
  .count {
    font-size: 12px;
    color: var(--textmuted);
    white-space: nowrap;
  }
  .x {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--border-2);
    background: var(--surface2);
    color: var(--textdim);
    cursor: pointer;
    font-size: 13px;
  }
  .chips {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--surface2);
  }
  .seg {
    display: flex;
    gap: 2px;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    border-radius: 9px;
    padding: 2px;
  }
  .seg button {
    border: 0;
    background: transparent;
    color: var(--textdim);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 13px;
    border-radius: 7px;
    cursor: pointer;
  }
  .seg button.on {
    background: rgba(53, 201, 214, 0.16);
    color: var(--accent);
  }
  .seg.slots button.on {
    background: rgba(214, 168, 53, 0.16);
    color: var(--amber);
  }
  .cur {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--accentbright);
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    border-radius: 7px;
    padding: 6px 11px;
    max-width: 46%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cats {
    display: flex;
    gap: 6px;
    padding: 10px 16px;
    overflow-x: auto;
    border-bottom: 1px solid var(--surface2);
  }
  .cat {
    flex: none;
    padding: 6px 12px;
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
  .cat.on {
    background: rgba(53, 201, 214, 0.14);
    border-color: var(--accent-border);
    color: var(--accent);
  }
  .list {
    flex: 1;
    min-height: 160px;
    overflow-y: auto;
    padding: 8px 8px 10px;
  }
  .section {
    font: 600 10px/1 var(--font-mono);
    color: var(--textmuted);
    letter-spacing: 0.1em;
    padding: 13px 10px 8px;
  }
  .more {
    color: var(--border3);
    letter-spacing: 0;
  }
  .rowwrap {
    display: flex;
    align-items: center;
    border-radius: 10px;
  }
  .rowwrap.hi {
    background: rgba(53, 201, 214, 0.1);
    box-shadow: inset 0 0 0 1px rgba(53, 201, 214, 0.3);
  }
  .rowwrap.sel {
    background: rgba(95, 196, 107, 0.08);
  }
  .row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 10px 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }
  .chip {
    flex: none;
    width: 46px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--text);
    border: 1px solid;
  }
  .rtext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rname {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rsub {
    font-size: 11px;
    color: var(--textfaint);
  }
  .now {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--ok, var(--ok));
  }
  .ret {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    border-radius: 5px;
    padding: 4px 6px;
  }
  .star {
    flex: none;
    width: 38px;
    height: 38px;
    margin-right: 6px;
    border: 0;
    background: transparent;
    color: var(--border3);
    font-size: 16px;
    cursor: pointer;
    border-radius: 9px;
  }
  .star:hover,
  .star.on {
    color: var(--amber);
  }
  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
    line-height: 1.5;
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
</style>
