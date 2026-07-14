<script lang="ts">
  // Cross-device conversion "fake grid" (P4b · META-24 · AXIS-48). A full-screen OFFLINE scratch editor:
  // the converted preset laid out on the target device's topology (grid / VP4 chain / AM4 slot list),
  // with severity-colored conflict badges on affected cells. Clicking a block opens a resolve panel
  // (type picker · clamp review); unplaced blocks live in a side tray with place/discard. NOTHING here
  // writes to a device until the explicit Commit step (save-to-library always; apply-to-device only when
  // the connected unit matches the target). All logic is the pure convertScratch.ts core via the store.
  import { convert } from './convert.svelte';
  import { convertScratch } from './convertScratch.svelte';
  import { editor } from './editor.svelte';
  import { deviceName, deviceIdFromModel, formatEvent, eventSeverity, type Severity } from './convertReport';
  import { conflictsForBlock, blockBadgeSeverity, type ScratchBlock } from './convertScratch';
  import { catFor, shade } from './catalog';
  import { baseName } from './blocks';
  import { theme } from './theme.svelte';

  const s = $derived(convertScratch.state);
  const light = $derived(theme.cfg.base === 'light');

  // family slug → visual catalog entry (title-cased families map onto the pack-keyed CATALOG).
  function titleCase(f: string): string {
    return (f ?? '')
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }
  function cat(family: string) {
    return catFor(titleCase(family), titleCase(family));
  }
  function tileBg(accent: string) {
    return light
      ? `linear-gradient(180deg, ${shade(accent, 0.66)}, ${shade(accent, 0.5)})`
      : `linear-gradient(180deg, ${shade(accent, -0.42)}, ${shade(accent, -0.62)})`;
  }
  const tileInk = (accent: string) => (light ? shade(accent, -0.52) : 'rgba(255,255,255,0.94)');

  const SEV_COLOR: Record<Severity, string> = { loss: 'var(--danger, #d6543f)', warn: 'var(--amber, #e0a53a)', info: 'var(--accent)' };

  // ── header context ──
  const targetName = $derived(s ? deviceName(s.targetDevice) : '');
  const remaining = $derived(convertScratch.remaining);
  // non-actionable info notes come straight from the event log (dropped/collapsed/unverified/partial).
  const infoNotes = $derived(
    (convert.result?.events ?? []).filter((e) =>
      ['block-dropped', 'param-dropped', 'scene-collapsed', 'channel-collapsed', 'param-unverified', 'source-partial'].includes(e.kind)
    )
  );
  const routingConflict = $derived(s?.conflicts.find((c) => c.kind === 'routing'));

  // ── focus / resolve panel ──
  const focused = $derived<ScratchBlock | undefined>(s ? s.blocks.find((b) => b.key === convertScratch.focusKey) : undefined);
  const focusedConflicts = $derived(s && focused ? conflictsForBlock(s, focused.key) : []);
  const typeConflict = $derived(focusedConflicts.find((c) => c.kind === 'type'));
  const clampConflict = $derived(focusedConflicts.find((c) => c.kind === 'clamps'));

  // load the target family's type catalog whenever a type conflict is in focus (cached per family)
  $effect(() => {
    if (focused && typeConflict) void convertScratch.loadTypes(focused.family);
  });
  const typeList = $derived(focused ? convertScratch.typesFor(focused.family) : undefined);
  let pickValue = $state<number | null>(null);
  // reset the picker selection when the focused block changes
  $effect(() => {
    void convertScratch.focusKey;
    pickValue = focused?.typeValue ?? null;
  });

  function pickType() {
    if (!focused || pickValue == null) return;
    const list = Array.isArray(typeList) ? typeList : [];
    const opt = list.find((t) => t.value === pickValue);
    convertScratch.setType(focused.key, { typeValue: pickValue, typeName: opt?.name });
  }

  // ── connected-device / apply gating ──
  const connectedId = $derived(deviceIdFromModel(editor.detected?.modelId));
  // apply is offered only when the connected unit's family equals the target AND the server advertises
  // the placement + type + param write endpoints (caps-driven — hidden otherwise).
  const canApply = $derived(
    !!s &&
      connectedId === s.targetDevice &&
      !!editor.caps?.gridRouting &&
      !!editor.detected?.connected
  );

  // ── commit dialog ──
  let commitOpen = $state(false);
  let saveResult = $state<{ ok: boolean; id?: string; error?: string } | null>(null);
  let saving = $state(false);

  async function doSave() {
    saving = true;
    saveResult = await convertScratch.saveToLibrary();
    saving = false;
  }
  async function doApply() {
    await convertScratch.applyToDevice();
  }

  function backToReport() {
    convertScratch.close();
    convert.openDialog();
  }
  function discardAll() {
    if (confirm('Discard this converted preset and all your resolutions?')) {
      convertScratch.discardAll();
      convert.openDialog();
    }
  }

  function badge(key: string): Severity | null {
    return s ? blockBadgeSeverity(s, key) : null;
  }

  function onCellClick(row: number, col: number) {
    if (!s) return;
    const occ = convertScratch.blockAt(row, col);
    if (occ) {
      convertScratch.focusKey = occ.key;
      return;
    }
    // empty cell: drop an armed tray block here
    if (convertScratch.placingKey) convertScratch.placeArmed(row, col);
  }
</script>

{#if convertScratch.open && s}
  <div class="scv" role="dialog" aria-label="Converted preset grid" tabindex="-1">
    <header class="top">
      <div class="route">
        <span class="dev">{s.sourceDevice}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <span class="dev tgt">{targetName}</span>
        <span class="pname" title={s.name}>{s.name || '(unnamed)'}</span>
      </div>
      <span class="spacer"></span>
      <div class="counter" class:clear={remaining === 0}>
        {#if remaining === 0}
          <span class="ok" aria-hidden="true">✓</span> All conflicts resolved
        {:else}
          <span class="num">{remaining}</span> conflict{remaining === 1 ? '' : 's'} to resolve
        {/if}
      </div>
      <button class="ghost" onclick={backToReport}>Back to report</button>
      <button class="ghost danger" onclick={discardAll}>Discard</button>
      <span class="commit-wrap">
        <button class="primary" disabled={remaining > 0} onclick={() => { saveResult = null; commitOpen = true; }}>Commit…</button>
        {#if remaining > 0}<span class="tip" role="tooltip">Resolve the remaining {remaining} conflict{remaining === 1 ? '' : 's'} first</span>{/if}
      </span>
    </header>

    <div class="body">
      <!-- ── the fake grid ── -->
      <div class="gridpane">
        {#if routingConflict && !routingConflict.resolved}
          <div class="routebar" role="note">
            <span class="ric" aria-hidden="true">⤳</span>
            <div class="rtxt"><b>Routing simplified.</b> {routingConflict.routing?.detail}</div>
            <button class="mini" onclick={() => convertScratch.acknowledgeRouting()}>Acknowledge</button>
          </div>
        {/if}

        <div class="topo-label mono">
          {s.topology.kind === 'grid' ? `${s.topology.rows}×${s.topology.cols} grid` : s.topology.kind === 'chain' ? 'Signal chain' : 'Slots'}
        </div>

        <div
          class="fakegrid"
          class:slots={s.topology.kind === 'slots'}
          style="grid-template-columns:repeat({s.topology.cols}, minmax(46px, 1fr)); grid-template-rows:repeat({s.topology.rows}, 54px);"
        >
          {#each Array(s.topology.rows) as _, r (r)}
            {#each Array(s.topology.cols) as _, c (c)}
              {@const block = convertScratch.blockAt(r, c)}
              {#if block}
                {@const ce = cat(block.family)}
                {@const bsev = badge(block.key)}
                <button
                  class="cell block"
                  class:sel={convertScratch.focusKey === block.key}
                  style="background:{tileBg(ce.accent)}; border-color:{shade(ce.accent, light ? 0.3 : -0.05)}; color:{tileInk(ce.accent)};"
                  onclick={() => onCellClick(r, c)}
                >
                  <span class="glyph">{ce.glyph}</span>
                  <span class="lbl">{ce.short}</span>
                  {#if block.typeName}<span class="ty mono">{block.typeName}</span>{/if}
                  {#if bsev}<span class="badge" style="background:{SEV_COLOR[bsev]};" title="{bsev === 'loss' ? 'Needs attention' : 'Review suggested'}">!</span>{/if}
                </button>
              {:else}
                {@const armedTarget = !!convertScratch.placingKey && convertScratch.canPlaceAt(r, c)}
                <button class="cell empty" class:armed={armedTarget} onclick={() => onCellClick(r, c)}>
                  {#if armedTarget}<span class="plus">+</span>{/if}
                </button>
              {/if}
            {/each}
          {/each}
        </div>

        {#if infoNotes.length > 0}
          <details class="notes">
            <summary>{infoNotes.length} informational note{infoNotes.length === 1 ? '' : 's'} (no action needed)</summary>
            <ul>
              {#each infoNotes as e, i (e.kind + i)}
                {@const f = formatEvent(e)}
                <li class="note {eventSeverity(e)}"><span class="nt">{f.title}</span>{#if f.detail}<span class="nd">{f.detail}</span>{/if}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>

      <!-- ── side rail: tray + resolve panel ── -->
      <aside class="rail">
        {#if convertScratch.tray.length > 0}
          <section class="tray">
            <h3>Unplaced blocks <span class="cnt">{convertScratch.tray.length}</span></h3>
            <p class="hint">Converted but left off — place them in a free cell or discard.</p>
            {#each convertScratch.tray as b (b.key)}
              {@const ce = cat(b.family)}
              <div class="trayrow" class:armed={convertScratch.placingKey === b.key}>
                <span class="tchip" style="background:{tileBg(ce.accent)}; color:{tileInk(ce.accent)};">{ce.glyph}</span>
                <span class="tname">{ce.short}{#if b.typeName}<span class="tsub mono">{b.typeName}</span>{/if}</span>
                <span class="spacer"></span>
                <button class="mini" class:on={convertScratch.placingKey === b.key} onclick={() => convertScratch.arm(b.key)}>
                  {convertScratch.placingKey === b.key ? 'Click a cell…' : 'Place'}
                </button>
                <button class="mini danger" onclick={() => convertScratch.discard(b.key)}>Discard</button>
              </div>
            {/each}
          </section>
        {/if}

        {#if focused}
          {@const ce = cat(focused.family)}
          <section class="resolve">
            <h3>
              <span class="rchip" style="background:{tileBg(ce.accent)}; color:{tileInk(ce.accent)};">{ce.glyph}</span>
              {ce.short}{focused.typeName ? ` · ${focused.typeName}` : ''}
            </h3>

            {#if typeConflict}
              <div class="conf warn">
                <div class="ctitle">Block type — review suggested</div>
                {#if typeConflict.type?.unresolved}
                  <p class="cdesc">Source type “{typeConflict.type.sourceTypeName}” has no match on {targetName}. A default was kept — pick the closest type.</p>
                {:else}
                  <p class="cdesc">“{typeConflict.type?.sourceTypeName}” → “{typeConflict.type?.targetTypeName}” ({typeConflict.type?.confidence}{typeConflict.type?.score != null ? `, score ${typeConflict.type.score}` : ''}). Accept it or pick another.</p>
                {/if}

                {#if typeList === 'loading'}
                  <div class="loading">Loading {targetName} types…</div>
                {:else if typeList === 'error' || typeList === undefined}
                  <div class="loading err">Couldn’t load the type list. You can still accept the suggestion.</div>
                {:else}
                  <div class="picker">
                    <select bind:value={pickValue}>
                      {#each typeList as t (t.value)}
                        <option value={t.value}>{t.name}{t.manufacturer ? ` — ${t.manufacturer}` : ''}</option>
                      {/each}
                    </select>
                    <button class="mini primary" disabled={pickValue == null} onclick={pickType}>Use this type</button>
                  </div>
                {/if}
                <button class="mini" onclick={() => convertScratch.acceptType(focused.key)}>Accept suggestion</button>
              </div>
            {/if}

            {#if clampConflict}
              <div class="conf warn">
                <div class="ctitle">Clamped parameters ({clampConflict.clamps?.length})</div>
                <ul class="clamps">
                  {#each clampConflict.clamps ?? [] as cl (cl.nativeName)}
                    <li>
                      <span class="cn">{cl.nativeName}</span>
                      <span class="cv mono">{cl.sourceValue} → {cl.targetValue}{cl.targetMin != null && cl.targetMax != null ? ` (${cl.targetMin}–${cl.targetMax})` : ''}</span>
                    </li>
                  {/each}
                </ul>
                <button class="mini primary" onclick={() => convertScratch.acknowledgeClamps(focused.key)}>Acknowledge</button>
              </div>
            {/if}

            {#if focusedConflicts.length === 0}
              <p class="allok"><span aria-hidden="true">✓</span> No conflicts on this block.</p>
            {/if}

            <div class="blkactions">
              {#if focused.position}<button class="mini" onclick={() => convertScratch.unplace(focused.key)}>Send to tray</button>{/if}
              <button class="mini danger" onclick={() => convertScratch.discard(focused.key)}>Remove block</button>
            </div>
          </section>
        {:else}
          <section class="resolve empty">
            <p class="hint">Select a block to review its conversion. Cells with a <span class="dotinfo"></span> badge need attention.</p>
          </section>
        {/if}
      </aside>
    </div>
  </div>

  <!-- ── commit confirm dialog ── -->
  {#if commitOpen}
    <div class="bg" role="presentation" onclick={() => (commitOpen = false)}>
      <div
        class="card"
        role="dialog"
        aria-label="Commit converted preset"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Escape') commitOpen = false; }}
      >
        <header><h2>Commit “{s.name}”</h2><span class="spacer"></span><button class="x" aria-label="Close" onclick={() => (commitOpen = false)}>✕</button></header>
        <div class="cbody">
          <section class="opt">
            <h3>Save to library</h3>
            <p>Store the resolved preset in your library as a {targetName} conversion. Always available — no device needed.</p>
            {#if saveResult?.ok}
              <div class="done"><span aria-hidden="true">✓</span> Saved to the library.</div>
            {:else}
              <button class="primary" disabled={saving} onclick={doSave}>{saving ? 'Saving…' : 'Save to library'}</button>
              {#if saveResult && !saveResult.ok}<div class="err">{saveResult.error}</div>{/if}
            {/if}
          </section>

          <section class="opt">
            <h3>Apply to connected device <span class="exp">experimental</span></h3>
            {#if canApply}
              <p>Push the placed blocks, types and parameters to your connected {targetName} over the device API. Best-effort — it stops on the first failed operation.</p>
              {#if convertScratch.apply.running}
                <div class="prog">
                  <div class="bar"><span style="width:{convertScratch.apply.total ? (convertScratch.apply.done / convertScratch.apply.total) * 100 : 0}%"></span></div>
                  <div class="pcap mono">{convertScratch.apply.current ?? ''} · {convertScratch.apply.done}/{convertScratch.apply.total}</div>
                  <button class="mini danger" onclick={() => convertScratch.abortApply()}>Abort</button>
                </div>
              {:else if convertScratch.apply.summary}
                <div class="done" class:err={convertScratch.apply.failed > 0}>{convertScratch.apply.summary}</div>
                <button class="mini" onclick={doApply}>Run again</button>
              {:else}
                <button class="primary warn" onclick={doApply}>Apply to {targetName}</button>
              {/if}
            {:else}
              <p class="muted">Connect a {targetName} to enable a best-effort apply. Otherwise, save to the library and load it later.</p>
            {/if}
          </section>
        </div>
        <footer><span class="spacer"></span><button class="ghost" onclick={() => (commitOpen = false)}>Close</button></footer>
      </div>
    </div>
  {/if}
{/if}

<style>
  .scv { position: fixed; inset: 0; z-index: 75; display: flex; flex-direction: column; background: var(--bg); color: var(--text); }
  .top { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border2); background: var(--surface); flex: none; }
  .route { display: flex; align-items: baseline; gap: 9px; min-width: 0; }
  .dev { font-size: 15px; font-weight: 700; }
  .dev.tgt { color: var(--accent); }
  .arrow { color: var(--textdim); }
  .pname { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--textdim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 30vw; }
  .spacer { flex: 1; }
  .counter { font-size: 12.5px; color: var(--textdim); }
  .counter .num { font-weight: 800; color: var(--amber, #e0a53a); font-variant-numeric: tabular-nums; }
  .counter.clear { color: var(--ok, #33c46b); }

  .commit-wrap { position: relative; display: inline-flex; }
  .commit-wrap:hover .tip { opacity: 1; }
  .tip { position: absolute; top: 110%; right: 0; z-index: 5; opacity: 0; pointer-events: none; transition: opacity 0.12s; white-space: nowrap; background: var(--surface2, #222); color: var(--text); border: 1px solid var(--border2); border-radius: 7px; padding: 5px 9px; font-size: 11px; }

  .body { flex: 1; min-height: 0; display: flex; gap: 0; overflow: hidden; }
  .gridpane { flex: 1; min-width: 0; overflow: auto; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .topo-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--textdim); }

  .routebar { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--amber, #e0a53a) 45%, transparent); background: color-mix(in srgb, var(--amber, #e0a53a) 12%, transparent); font-size: 12px; }
  .routebar .ric { color: var(--amber, #e0a53a); font-size: 16px; }
  .rtxt { flex: 1; color: var(--textdim); }
  .rtxt b { color: var(--text); }

  .fakegrid { display: grid; gap: 7px; align-content: start; width: 100%; }
  .fakegrid.slots { max-width: 320px; }
  .cell { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 10px; min-width: 0; overflow: hidden; cursor: pointer; padding: 2px; }
  .cell.block { border: 1px solid transparent; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 5px rgba(0,0,0,0.3); }
  .cell.block.sel { box-shadow: inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 2px var(--amber), 0 0 16px rgba(245,166,35,0.32); }
  .cell.empty { border: 1px dashed var(--border2); background: transparent; }
  .cell.empty.armed { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .cell .glyph { font-size: 14px; line-height: 1; }
  .cell .lbl { font-size: 11px; font-weight: 700; line-height: 1; }
  .cell .ty { font-size: 8px; opacity: 0.82; max-width: 96%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cell .badge { position: absolute; top: 3px; right: 4px; width: 14px; height: 14px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.5); }
  .cell .plus { font-size: 18px; color: var(--accent); }

  .notes { font-size: 12px; color: var(--textdim); border: 1px solid var(--border2); border-radius: 9px; padding: 8px 12px; }
  .notes summary { cursor: pointer; }
  .notes ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .note { display: flex; flex-direction: column; gap: 1px; padding-left: 9px; border-left: 2px solid var(--border2); }
  .note.loss { border-left-color: var(--danger, #d6543f); }
  .note.warn { border-left-color: var(--amber, #e0a53a); }
  .note.info { border-left-color: var(--accent); }
  .note .nt { color: var(--text); }
  .note .nd { font-size: 11px; color: var(--textdim); }

  .rail { width: 340px; flex: none; border-left: 1px solid var(--border2); background: var(--surface); overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 18px; }
  .rail h3 { margin: 0 0 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .tray .cnt { font-size: 11px; font-weight: 800; color: var(--amber, #e0a53a); }
  .hint { font-size: 11.5px; color: var(--textdim); margin: 0 0 10px; }
  .trayrow { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 9px; border: 1px solid var(--border2); background: var(--bg2); margin-bottom: 6px; }
  .trayrow.armed { border-color: var(--accent); }
  .tchip, .rchip { flex: none; width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 13px; }
  .tname { display: flex; flex-direction: column; gap: 1px; font-size: 12px; font-weight: 600; min-width: 0; }
  .tsub { font-size: 9px; color: var(--textdim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .resolve.empty .hint { margin-top: 4px; }
  .dotinfo { display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: var(--amber, #e0a53a); vertical-align: middle; }
  .conf { border: 1px solid var(--border2); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; }
  .conf.warn { border-color: color-mix(in srgb, var(--amber, #e0a53a) 40%, var(--border2)); }
  .ctitle { font-size: 12.5px; font-weight: 700; margin-bottom: 5px; }
  .cdesc { font-size: 11.5px; color: var(--textdim); margin: 0 0 9px; line-height: 1.4; }
  .picker { display: flex; gap: 7px; margin-bottom: 7px; }
  .picker select { flex: 1; min-width: 0; height: 30px; border-radius: 8px; border: 1px solid var(--border2); background: var(--bg2); color: var(--text); font-size: 12px; padding: 0 8px; }
  .loading { font-size: 11.5px; color: var(--textdim); margin-bottom: 8px; }
  .loading.err, .err { color: var(--danger, #d6543f); }
  .clamps { list-style: none; margin: 0 0 9px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .clamps li { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; }
  .clamps .cn { color: var(--text); }
  .clamps .cv { color: var(--textdim); }
  .allok { font-size: 12px; color: var(--ok, #33c46b); }
  .blkactions { display: flex; gap: 8px; margin-top: 6px; }

  /* buttons */
  .mini { padding: 5px 11px; border-radius: 8px; border: 1px solid var(--border2); background: var(--bg2); color: var(--text); font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .mini:hover { border-color: var(--border3); }
  .mini.on { border-color: var(--accent); color: var(--accent); }
  .mini.primary { background: var(--accent); color: var(--accentink, #fff); border-color: transparent; }
  .mini.danger { color: var(--danger, #d6543f); }
  .mini:disabled { opacity: 0.5; cursor: default; }
  .primary { padding: 8px 16px; border-radius: 9px; border: none; background: var(--accent); color: var(--accentink, #fff); font-size: 13px; font-weight: 700; cursor: pointer; }
  .primary:hover:not(:disabled) { filter: brightness(1.08); }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .primary.warn { background: var(--amber, #e0a53a); color: #1a1305; }
  .ghost { padding: 7px 13px; border-radius: 9px; border: 1px solid var(--border2); background: transparent; color: var(--text); font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .ghost:hover { border-color: var(--border3); }
  .ghost.danger { color: var(--danger, #d6543f); }

  /* commit dialog */
  .bg { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: grid; place-items: center; z-index: 80; }
  .card { width: min(560px, 94vw); max-height: 90vh; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border2); border-radius: 13px; box-shadow: 0 18px 50px rgba(0,0,0,0.5); }
  .card header { display: flex; align-items: center; gap: 10px; padding: 14px 18px 12px; border-bottom: 1px solid var(--border2); }
  .card h2 { margin: 0; font-size: 15px; }
  .x { background: none; border: none; color: var(--textdim); font-size: 15px; cursor: pointer; }
  .cbody { padding: 16px 18px; overflow: auto; display: flex; flex-direction: column; gap: 16px; }
  .opt { border: 1px solid var(--border2); border-radius: 11px; padding: 13px 14px; }
  .opt h3 { margin: 0 0 6px; font-size: 13.5px; display: flex; align-items: center; gap: 8px; }
  .opt p { margin: 0 0 11px; font-size: 12px; color: var(--textdim); line-height: 1.45; }
  .opt p.muted { color: var(--textdim); opacity: 0.8; margin-bottom: 0; }
  .exp { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--amber, #e0a53a); border: 1px solid color-mix(in srgb, var(--amber, #e0a53a) 50%, transparent); border-radius: 999px; padding: 1px 7px; }
  .done { font-size: 12px; color: var(--ok, #33c46b); }
  .done.err { color: var(--danger, #d6543f); }
  .prog { display: flex; flex-direction: column; gap: 7px; }
  .bar { height: 7px; border-radius: 4px; background: var(--bg2); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
  .pcap { font-size: 10.5px; color: var(--textdim); }
  .card footer { display: flex; align-items: center; padding: 12px 18px; border-top: 1px solid var(--border2); }

  @media (max-width: 720px) {
    .body { flex-direction: column; }
    .rail { width: auto; border-left: none; border-top: 1px solid var(--border2); }
  }
</style>
