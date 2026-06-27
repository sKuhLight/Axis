<script lang="ts">
  import { onMount } from 'svelte';
  import { forgefx, ForgeError } from '$lib/forgefx';
  import type { NamedParam } from '$lib/types';
  import { layoutFromGrid, cablesFor, type Cell, type Layout } from '$lib/grid';
  import Knob from '$lib/Knob.svelte';

  let status = $state<'loading' | 'ready' | 'offline'>('loading');
  let layout = $state<Layout>({ cells: [], shunts: [], rows: 1, cols: 1, name: '', model: '', crcValid: true });

  const CW = 96, CH = 72, GAP = 8;
  const gw = $derived(Math.max(1, layout.cols) * (CW + GAP) - GAP);
  const gh = $derived(Math.max(1, layout.rows) * (CH + GAP) - GAP);
  const cables = $derived(cablesFor(layout, CW, CH, GAP));

  // ── block editor (live) ──
  let editing = $state<Cell | null>(null);
  let params = $state<NamedParam[]>([]);
  let sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('loading');
  const CHANNELS = ['A', 'B', 'C', 'D'];
  const sendTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  let lastPreset = $state<number | null>(null);
  let everLoaded = $state(false);
  onMount(() => {
    init();
    const t = setInterval(watchPreset, 4000); // live-update when the preset changes on the device
    return () => clearInterval(t);
  });
  async function init() {
    try {
      const n = (await forgefx.currentPreset()).number;
      if (n >= 0) lastPreset = n;
    } catch { /* */ }
    await load();
  }
  async function watchPreset() {
    try {
      const n = (await forgefx.currentPreset()).number;
      // 0x0D is flaky on a modified edit buffer and returns -1; ignore those
      // so a transient failure doesn't masquerade as a preset change (= reload flicker).
      if (n >= 0 && n !== lastPreset) { lastPreset = n; await load(); }
      else if (status === 'offline') await load(); // recover once the server is back
    } catch { /* keep showing the last good grid */ }
  }
  async function load() {
    if (!everLoaded) status = 'loading';
    try {
      // real grid (placement + routing); placed blocks add live bypass/channel
      const [grid, blocks] = await Promise.all([
        forgefx.grid(),
        forgefx.presetBlocks().catch(() => [])
      ]);
      layout = layoutFromGrid(grid, blocks);
      everLoaded = true;
      status = 'ready';
    } catch {
      // don't blank an already-rendered grid on a transient dump failure
      if (!everLoaded) status = 'offline';
    }
  }

  const slugOf = (c: Cell) => (c.pack ?? '').toLowerCase();

  async function open(c: Cell) {
    editing = c;
    if (!c.pack) { sheetState = 'nopack'; params = []; return; }
    await loadParams();
  }
  async function loadParams() {
    if (!editing?.pack) return;
    sheetState = 'loading';
    try {
      const r = await forgefx.blockParams(slugOf(editing));
      // knobs = editable params (drop the model-type selector + the inner bypass flag)
      params = r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase()));
      sheetState = 'ready';
    } catch (e) {
      sheetState = 'error';
      if (e instanceof ForgeError) console.warn(e.message);
    }
  }
  const close = () => (editing = null);

  // live knob → device (optimistic + debounced continuous write)
  function setKnob(p: NamedParam, v: number) {
    p.norm = v;
    if (!editing?.pack) return;
    const slug = slugOf(editing);
    clearTimeout(sendTimers[p.name]);
    sendTimers[p.name] = setTimeout(() => forgefx.setParam(slug, p.name, v).catch(() => {}), 60);
  }
  async function toggleBypass() {
    if (!editing?.pack) return;
    const next = !(editing.bypassed ?? false);
    editing.bypassed = next; // editing IS the grid cell → updates the grid too
    try { await forgefx.setBypass(slugOf(editing), next); } catch { editing.bypassed = !next; }
  }
  async function setChannel(ch: string) {
    if (!editing?.pack || editing.channel === ch) return;
    const prev = editing.channel;
    editing.channel = ch;
    try { await forgefx.setChannel(slugOf(editing), ch); await loadParams(); }
    catch { editing.channel = prev; }
  }

  // ── full grid matrix lookup (block/shunt by position; everything else empty) ──
  const cellAt = $derived.by(() => {
    const m = new Map<string, Cell>();
    for (const c of [...layout.cells, ...layout.shunts]) m.set(`${c.row},${c.col}`, c);
    return m;
  });
  // write endpoints are 1-indexed; the decoded grid is 0-indexed
  const W = (n: number) => n + 1;

  // ── add-block picker (tap an empty cell) ──
  type Family = { slug: string; name: string; page: number };
  let picker = $state<{ row: number; col: number } | null>(null);
  let families = $state<Family[]>([]);
  async function openPicker(row: number, col: number) {
    picker = { row, col };
    if (families.length === 0) {
      try { families = (await forgefx.blocks()).map((b) => ({ slug: b.slug, name: b.name, page: b.page })); } catch { /* */ }
    }
  }
  async function addBlock(page: number) {
    if (!picker) return;
    const { row, col } = picker;
    picker = null;
    try { await forgefx.placeCell(W(row), W(col), page); await load(); } catch { /* */ }
  }

  // ── drag a block to an empty cell to move it ──
  // The device no-ops an insert of an already-placed instance, so a move =
  // clear the source cell, then place the same block at the target.
  // (Block settings reset on move for now — a settings-preserving move needs
  //  an FM3-Edit capture of the real move op.)
  let dragSrc = $state<Cell | null>(null);
  async function dropOn(row: number, col: number) {
    const src = dragSrc;
    dragSrc = null;
    if (!src || cellAt.get(`${row},${col}`)) return; // empty targets only
    if (col !== src.col) return; // same-column moves only — cross-column needs re-cabling (TODO)
    try {
      await forgefx.clearCell(W(src.row), W(src.col));
      await forgefx.placeCell(W(row), W(col), src.effectId);
      await load();
    } catch { /* */ }
  }

  async function removeBlock() {
    if (!editing) return;
    const c = editing;
    close();
    try { await forgefx.clearCell(W(c.row), W(c.col)); await load(); } catch { /* */ }
  }

  // ── type / model picker ──
  type TypeOpt = { value: number; name: string; manufacturer: string | null; basedOn: string | null };
  let typePicker = $state(false);
  let types = $state<TypeOpt[]>([]);
  let typeState = $state<'loading' | 'ready' | 'error'>('loading');
  let realNames = $state(false);
  let typeFilter = $state('');
  const TYPE_CAP = 60; // don't render hundreds of DOM nodes at once
  const shownTypes = $derived.by(() => {
    const q = typeFilter.trim().toLowerCase();
    const match = q
      ? types.filter((t) =>
          (t.name + ' ' + (t.manufacturer ?? '') + ' ' + (t.basedOn ?? '')).toLowerCase().includes(q)
        )
      : types;
    return match.slice(0, TYPE_CAP);
  });
  async function openTypePicker() {
    if (!editing?.pack) return;
    typePicker = true;
    typeState = 'loading';
    types = [];
    typeFilter = '';
    try { types = await forgefx.blockTypes(slugOf(editing)); typeState = 'ready'; }
    catch (e) { typeState = 'error'; if (e instanceof ForgeError) console.warn(e.message); }
  }
  async function pickType(t: TypeOpt) {
    if (!editing?.pack) return;
    typePicker = false;
    // t.value is the device-true model ordinal (from the dictionary) = the discrete-SET value
    try { await forgefx.setParam(slugOf(editing), 'Type', t.value, false); await loadParams(); } catch { /* */ }
  }
  const typeLabel = (t: TypeOpt) =>
    realNames && (t.basedOn || t.manufacturer) ? `${t.manufacturer ?? ''} ${t.basedOn ?? ''}`.trim() : t.name;

  const pos = (row: number, col: number) =>
    `left:${col * (CW + GAP)}px; top:${row * (CH + GAP)}px; width:${CW}px; height:${CH}px;`;
</script>

<section class="wrap scroll" data-screen="Signal Grid">
  {#if status === 'loading'}
    <p class="hint">Connecting to ForgeFX…</p>
  {:else if status === 'offline'}
    <div class="offline">
      <p class="hint">Device offline.</p>
      <p class="sub">Start the ForgeFX server (<code class="mono">localhost:5056</code>) and reconnect.</p>
      <button class="btn" onclick={load}>Retry</button>
    </div>
  {:else}
    <div class="gridbox" style="width:{gw}px; height:{gh}px;">
      <svg class="cables" width={gw} height={gh}>
        {#each cables as cab}<path d={cab.d} fill="none" stroke={cab.stroke} stroke-width="2" opacity="0.7" />{/each}
      </svg>

      <!-- full grid matrix: block · shunt · empty(drop target / add) -->
      {#each Array(layout.rows) as _, r}
        {#each Array(layout.cols) as _, c}
          {@const cell = cellAt.get(`${r},${c}`)}
          {#if cell?.kind === 'block'}
            <button class="cell block" class:byp={cell.bypassed} style="{pos(r, c)} --c:{cell.color}"
              draggable="true"
              ondragstart={() => (dragSrc = cell ?? null)}
              ondragend={() => (dragSrc = null)}
              onclick={() => cell && open(cell)}>
              <span class="b-label">{cell.display}</span>
              <span class="b-pack mono">{cell.pack ?? '—'}</span>
              {#if cell.channel}<span class="chan mono">{cell.channel}</span>{/if}
              {#if cell.bypassed}<span class="bypb mono">BYP</span>{/if}
            </button>
          {:else if cell?.kind === 'shunt'}
            <div class="cell shunt" style={pos(r, c)}><span class="sh-bar"></span></div>
          {:else}
            <button class="cell empty" class:droptarget={dragSrc && dragSrc.col === c} style={pos(r, c)}
              ondragover={(e) => { if (dragSrc && dragSrc.col === c) e.preventDefault(); }}
              ondrop={(e) => { e.preventDefault(); dropOn(r, c); }}
              onclick={() => openPicker(r, c)}>
              <span class="plus">+</span>
            </button>
          {/if}
        {/each}
      {/each}
    </div>
    <p class="preview mono">
      {layout.model} · {layout.name || 'unnamed'} · {layout.rows}×{layout.cols} grid · real placement + routing (live decode)
      {#if !layout.crcValid}<span class="edit"> · edit buffer (unsaved)</span>{/if}
      <button class="refresh" onclick={load} title="Re-read the grid from the device">↻</button>
    </p>
  {/if}
</section>

{#if editing}
  <div class="overlay" onclick={close} role="presentation"></div>
  <aside class="sheet scroll" data-screen="Block Editor" style="--c:{editing.color}">
    <header class="ed-head">
      <span class="ed-icon" style="background:{editing.color}"></span>
      <button class="ed-id" onclick={openTypePicker} disabled={!editing.pack} title="Change model/type">
        <div class="ed-title">{editing.display}</div>
        <div class="ed-type mono">{editing.pack ?? '—'} {#if editing.pack}▾{/if}</div>
      </button>
      {#if editing.pack}
        <div class="ch">
          <span class="ch-lbl mono">CH</span>
          {#each CHANNELS as ch}
            <button class="ch-btn" class:on={editing.channel === ch} onclick={() => setChannel(ch)}>{ch}</button>
          {/each}
        </div>
      {/if}
      <span class="ed-spacer"></span>
      <button class="x" onclick={close} aria-label="Close">✕</button>
    </header>

    {#if sheetState === 'nopack'}
      <p class="hint">No parameter pack for <b>{editing.display}</b> yet — bypass/channel still work.</p>
    {:else if sheetState === 'loading'}
      <p class="hint">Reading parameters…</p>
    {:else if sheetState === 'error'}
      <p class="hint">Couldn't read this block.</p>
    {:else}
      <div class="knobs">
        {#each params as p (p.name)}
          <Knob
            value={p.norm ?? 0}
            label={p.name}
            valueText={((p.norm ?? 0) * 10).toFixed(1)}
            color={editing.color}
            onInput={(v) => setKnob(p, v)}
          />
        {/each}
      </div>
      <p class="ro mono">live · drag a knob to set it on the device</p>
    {/if}

    <footer class="ed-foot">
      <button class="act byp" class:on={editing.bypassed} onclick={toggleBypass}>
        {editing.bypassed ? 'Bypassed' : 'Bypass'}
      </button>
      <span class="ed-spacer"></span>
      {#if editing.pack}<button class="act rem" onclick={removeBlock}>Remove</button>{/if}
    </footer>
  </aside>
{/if}

<!-- add-block picker -->
{#if picker}
  <div class="overlay" onclick={() => (picker = null)} role="presentation"></div>
  <div class="picker" data-screen="Add Block">
    <header class="pk-head">
      <span class="pk-title">Add block</span>
      <button class="x" onclick={() => (picker = null)} aria-label="Close">✕</button>
    </header>
    <ul class="pk-list scroll">
      {#each families as f (f.slug)}
        <li><button class="pk-item" onclick={() => addBlock(f.page)}>
          <span class="pk-name">{f.name}</span><span class="pk-sub mono">{f.slug}</span>
        </button></li>
      {/each}
    </ul>
    <p class="ro mono">⚠ grid edits are beta — verify on the device</p>
  </div>
{/if}

<!-- type / model picker -->
{#if typePicker && editing}
  <div class="overlay" onclick={() => (typePicker = false)} role="presentation"></div>
  <div class="picker" data-screen="Type Picker">
    <header class="pk-head">
      <span class="pk-title">{editing.display} · model</span>
      <label class="rn"><input type="checkbox" bind:checked={realNames} /> real names</label>
      <button class="x" onclick={() => (typePicker = false)} aria-label="Close">✕</button>
    </header>
    {#if typeState === 'ready' && types.length > 12}
      <input class="pk-search" placeholder="Filter {types.length} models…" bind:value={typeFilter} />
    {/if}
    <ul class="pk-list scroll">
      {#if typeState === 'loading'}
        <li class="pk-empty">Loading models…</li>
      {:else if typeState === 'error'}
        <li class="pk-empty">Couldn't load models (is the server reachable?).</li>
      {:else if types.length === 0}
        <li class="pk-empty">No model list for this block yet.</li>
      {:else}
        {#each shownTypes as t (t.value)}
          <li><button class="pk-item" onclick={() => pickType(t)}>
            <span class="pk-name">{typeLabel(t)}</span>
            {#if realNames && t.name && typeLabel(t) !== t.name}<span class="pk-sub mono">{t.name}</span>{/if}
          </button></li>
        {/each}
        {#if shownTypes.length < (typeFilter ? Infinity : types.length)}
          <li class="pk-empty">…{types.length - shownTypes.length} more — type to filter</li>
        {/if}
      {/if}
    </ul>
    <p class="ro mono">⚠ type change is beta — verify on the device</p>
  </div>
{/if}

<style>
  .wrap { padding: 22px; overflow: auto; }
  .gridbox { position: relative; }
  .cables { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: visible; }
  .cell { position: absolute; border-radius: var(--r-md); }

  .block {
    overflow: hidden; cursor: pointer; padding: 0;
    border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border-2));
    background: linear-gradient(180deg, var(--surface-2), var(--surface));
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    z-index: 2; transition: transform 0.08s, border-color 0.12s, opacity 0.12s;
  }
  .block:hover { border-color: var(--c); }
  .block:active { transform: scale(0.97); }
  .block.byp { opacity: 0.45; filter: grayscale(0.7); }
  .b-label { font-weight: 700; font-size: 14px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
  .b-pack { font-size: 9px; color: var(--c); opacity: 0.85; }
  .chan { position: absolute; top: 6px; right: 7px; font-size: 9px; font-weight: 700; color: rgba(255,255,255,.85); background: rgba(0,0,0,.3); border-radius: 4px; padding: 2px 4px; }
  .bypb { position: absolute; top: 6px; left: 7px; font-size: 8px; font-weight: 700; color: var(--bg); background: var(--text-dim); border-radius: 4px; padding: 2px 4px; letter-spacing: .05em; }

  .cell.empty { display: flex; align-items: center; justify-content: center; border: 1px dashed var(--hairline); background: transparent; cursor: pointer; z-index: 1; padding: 0; }
  .cell.empty:hover { border-color: var(--accent); }
  .cell.empty.droptarget { border-color: var(--accent); border-style: solid; background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .plus { font-size: 22px; color: #2f2f37; font-weight: 300; line-height: 1; }
  .cell.shunt { display: flex; align-items: center; justify-content: center; z-index: 1; }
  .sh-bar { width: 60%; height: 2px; background: #4a4a55; border-radius: 1px; }

  .preview { margin-top: 18px; font-size: 10px; color: var(--text-faint); display: flex; align-items: center; gap: 8px; }
  .edit { color: var(--amber, #f5a623); }
  .refresh { border: 1px solid var(--border-2); background: var(--surface-2); color: var(--text-dim); border-radius: var(--r-sm); width: 22px; height: 20px; cursor: pointer; font-size: 12px; line-height: 1; }
  .refresh:hover { border-color: var(--accent); color: var(--text); }
  .hint { color: var(--text-dim); }
  .sub { color: var(--text-mut); font-size: 11px; }
  .offline { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .btn { border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--text); border-radius: var(--r-sm); padding: 7px 14px; cursor: pointer; }
  code { color: var(--accent); }

  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); animation: axsOverlay .15s ease; z-index: 40; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; max-height: 80vh; overflow: auto; background: var(--panel-2); border-top: 2px solid var(--c); border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 16px 18px 24px; z-index: 50; animation: axsSheet .22s cubic-bezier(.16,1,.3,1); }
  @media (min-width: 900px) { .sheet { left: auto; top: 0; bottom: 0; width: 400px; max-height: none; border-top: 0; border-left: 2px solid var(--c); border-radius: 0; animation: none; } }
  /* block editor */
  .ed-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .ed-icon { width: 30px; height: 30px; flex: none; border-radius: 9px; opacity: 0.9; }
  .ed-id { min-width: 0; line-height: 1.15; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: inherit; }
  .ed-id:hover .ed-type { color: var(--text); }
  .ed-id:disabled { cursor: default; }
  .ed-title { font-weight: 700; font-size: 16px; color: #fff; }
  .ed-type { font-size: 11px; color: var(--c); }
  .ed-spacer { flex: 1; }
  .x { border: 0; background: transparent; color: var(--text-mut); font-size: 16px; cursor: pointer; }

  .ch { display: flex; align-items: center; gap: 3px; }
  .ch-lbl { font-size: 8px; font-weight: 600; color: var(--text-mut); letter-spacing: .08em; margin-right: 2px; }
  .ch-btn { width: 24px; height: 26px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text-mut); border-radius: 6px; font: 600 12px/1 var(--font-mono); cursor: pointer; }
  .ch-btn:hover { color: var(--text); }
  .ch-btn.on { background: var(--c); color: var(--bg, #06181a); border-color: var(--c); }

  .knobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 14px 6px; padding: 4px 0 8px; }
  .ro { margin: 8px 0 0; font-size: 10px; color: var(--text-faint); text-align: center; }

  .ed-foot { display: flex; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hairline); }
  .act { height: 38px; padding: 0 16px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text); border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .act:hover { border-color: var(--border-strong); }
  .act.byp.on { background: var(--coral, #d6543f); border-color: var(--coral, #d6543f); color: #fff; }
  .act.rem:hover { border-color: var(--coral, #d6543f); color: var(--coral, #d6543f); }

  /* add-block / type pickers */
  .picker { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, 92vw); max-height: 70vh; display: flex; flex-direction: column; background: var(--panel-2); border: 1px solid var(--border-strong); border-radius: var(--r-lg); padding: 14px 16px 12px; z-index: 60; animation: axsOverlay 0.15s ease; }
  .pk-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .pk-title { font-weight: 700; font-size: 15px; }
  .rn { margin-left: auto; font-size: 11px; color: var(--text-mut); display: flex; align-items: center; gap: 5px; cursor: pointer; }
  .pk-search { width: 100%; background: var(--surface); border: 1px solid var(--border-2); border-radius: var(--r-sm); color: var(--text); padding: 8px 10px; font: inherit; font-size: 13px; margin-bottom: 8px; }
  .pk-search:focus { outline: none; border-color: var(--accent); }
  .pk-list { list-style: none; margin: 0; padding: 0; overflow: auto; }
  .pk-item { width: 100%; display: flex; align-items: baseline; gap: 8px; background: transparent; border: 0; border-radius: var(--r-sm); padding: 9px 8px; cursor: pointer; color: var(--text); text-align: left; }
  .pk-item:hover { background: var(--surface-2); }
  .pk-name { font-size: 13px; font-weight: 600; }
  .pk-sub { font-size: 10px; color: var(--text-mut); }
  .pk-empty { color: var(--text-dim); padding: 10px 8px; font-size: 13px; }
</style>
