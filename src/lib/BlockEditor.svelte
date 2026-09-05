<script lang="ts">
  import { baseName } from './editor.svelte';
  import { getEditorSurface } from './editorSurface';
  import { catFor, shade } from './catalog';
  import DeviceCanvas from './DeviceCanvas.svelte';
  import GridMap from './GridMap.svelte';
  import QuickBuild from './QuickBuild.svelte';
  import { deriveEqGraphs } from './eqGraphs';
  import { deriveModulationGraphs } from './modulationGraphs';
  import { deriveCompressorGraphs } from './compressorGraphs';
  import { deriveCabAlignmentGraphs } from './cabAlignmentGraphs';
  import { deriveAdsrGraphs } from './adsrGraphs';
  import { deriveMegaTapGraphs } from './megaTapGraphs';
  import { deriveCabMicGraphs } from './cabMicGraphs';
  import type { CabState, CabSlot } from './types';

  const editor = getEditorSurface();

  let { embedded = false }: { embedded?: boolean } = $props();

  const sel = $derived(editor.selected);
  const cat = $derived(sel ? catFor(sel.pack, baseName(sel.display)) : null);
  const isCab = $derived(sel?.pack === 'Cab');
  // DynaCab is a per-block MODE value (param 31 "MODE" = 0 LEGACY / 1 DYNA-CAB) on the OPEN block. Derive it
  // from editor.enums — reloaded on every preset/block read — rather than the async `cabState` snapshot below,
  // which is only re-fetched when the effectId or the picker changes and so goes stale across preset switches
  // (Cab 1 keeps the same effectId in every preset, so the fetch effect never re-runs).
  const dynaMode = $derived(editor.enums.find((e) => e.name === 'MODE')?.value === 1);

  // what's actually loaded in each cab slot, shown on the type button so you don't have to
  // open the picker to see it. Re-read on select + whenever the picker closes (a pick may have changed it).
  let cabState = $state<CabState | null>(null);
  $effect(() => {
    const eid = isCab ? sel?.effectId : undefined;
    void editor.cabPickerOpen; // re-read after the picker closes, in case a pick changed the slots
    if (eid == null) {
      cabState = null;
      return;
    }
    editor
      .cabState(eid)
      .then((s) => {
        if (isCab && sel?.effectId === eid) cabState = s;
      })
      .catch(() => (cabState = null));
  });
  const cabSlotLabel = (s: CabSlot, dyna: boolean) => (dyna ? s.dyna.label : `${s.bank.label} ${s.irName}`);
  const cabSummary = $derived.by(() => {
    const cs = cabState;
    if (!cs?.slots.length) return null;
    const dyna = cs.mode.value === 1;
    if (cs.slots.length === 1) return cabSlotLabel(cs.slots[0], dyna);
    return cs.slots.map((s) => `Slot ${s.slot}: ${cabSlotLabel(s, dyna)}`).join('   ');
  });
  // Frequency-response graphs, bound to the pages the device draws them on (see eqGraphs.ts).
  const eqGraphs = $derived(
    deriveEqGraphs({
      layout: editor.blockLayout,
      params: editor.params,
      enums: editor.enums,
      pack: sel?.pack,
      blockTypeName: editor.blockType?.name
    })
  );
  const modulationGraphs = $derived(deriveModulationGraphs({ layout: editor.blockLayout, params: editor.params, enums: editor.enums }));
  const compressorGraphs = $derived(deriveCompressorGraphs({ layout: editor.blockLayout, params: editor.params, enums: editor.enums }));
  const cabAlignmentGraphs = $derived(deriveCabAlignmentGraphs({ layout: editor.blockLayout, params: editor.params, enums: editor.enums }));
  const adsrGraphs = $derived(deriveAdsrGraphs({ layout: editor.blockLayout, params: editor.params }));
  // The DynaCab speaker cone. The served layout says whether the block has one (a `dynaCabControl`
  // control) and where — no mode flag needed here: ForgeFX already picked the DynaCab variant.
  const cabMicGraphs = $derived(deriveCabMicGraphs({ layout: editor.blockLayout, params: editor.params, enums: editor.enums }));
  const megaTapGraphs = $derived(deriveMegaTapGraphs({ layout: editor.blockLayout, params: editor.params, enums: editor.enums }));

  // ── cab pseudo-params ──
  // The Cab page authors five controls per slot whose `paramId` is a UI pseudo-id (0xFF00+): the slot
  // heading, the cabinet NAME, and the Picker / Mute / Solo buttons. The block protocol has no value
  // for those, so the canvas asks the host what to show and what a click means. Everything the cab
  // page draws now comes from the device's own layout — which is what retires the hand-built
  // `cabIdentityCards` slot cards (`MAX_SLOTS`, the `CAB n` title literals, the page/row anchoring).
  const cabSlotIndex = (paramName: string | null | undefined) => {
    const m = /(\d+)$/.exec(paramName ?? '');
    return m ? Number(m[1]) : null;
  };
  const cabSlotOf = (paramName: string | null | undefined): CabSlot | null => {
    const n = cabSlotIndex(paramName);
    return n == null ? null : (cabState?.slots.find((s) => s.slot === n) ?? null);
  };
  const pseudoText = (c: { paramName: string | null; paramId: number | null }): string | null => {
    if (!isCab || !c.paramName) return null;
    const slot = cabSlotOf(c.paramName);
    if (/^CABINET_NAME/.test(c.paramName)) return slot ? cabSlotLabel(slot, dynaMode) : '—';
    if (/^CABINET_TYPE/.test(c.paramName)) return slot ? String(slot.irName) : null;
    return null;
  };
  const onPseudoClick = (c: { paramName: string | null }) => {
    const n = cabSlotIndex(c.paramName);
    if (isCab && /^CABINET_PICKER/.test(c.paramName ?? '') && n != null) editor.openCabPicker(n - 1);
  };

  const CHAN = ['A', 'B', 'C', 'D'];

  // The name shown on the type button. Held here (not inline) because the header also sizes the title
  // from its length and puts the full text in the button's tooltip.
  const typeName = $derived(
    isCab ? (cabSummary ?? 'Browse cabinet library') : (editor.blockType?.name || sel?.pack || '—')
  );

  let q = $state('');
  const searching = $derived(q.trim().length > 0);

  // ── docked resize (desktop) ──
  let resizing = false;
  function resizeDown(e: PointerEvent) {
    if (embedded) return;
    e.preventDefault();
    resizing = true;
    const startY = e.clientY;
    const startH = editor.editorH;
    const onMove = (ev: PointerEvent) => {
      if (!resizing) return;
      editor.editorH = Math.max(240, Math.min(editor.vh - 150, startH + (startY - ev.clientY)));
    };
    const onUp = () => {
      resizing = false;
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    document.body.style.cursor = 'pointer';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
</script>

<!-- The GRID MAP is the editor's block navigator, so it has to outlive the selection — otherwise the
     one control that lets you PICK a block is hidden exactly when nothing is picked. Embedded (the
     workbench panel) the card therefore always renders and only the block-specific header / control
     surface gate on `sel`. The docked/mobile shell still opens on a selection only. -->
{#if embedded || (editor.editorOpen && sel && cat)}
  <div
    class="ed"
    class:mob={editor.isMobile && !embedded}
    class:embedded
    style="--c:{cat?.accent ?? 'var(--accent)'}; {embedded ? '' : editor.isMobile ? '' : `height:${editor.editorH}px;`}"
    data-screen="Block Editor"
  >
    {#if editor.isMobile && !embedded}<div class="overlaybg" role="presentation" onclick={() => editor.closeEditor()}></div>{/if}
    <div class="card" class:sheet={editor.isMobile && !embedded}>
      {#if !editor.isMobile && !embedded}
        <div class="resize" role="separator" aria-label="Resize panel" title="Drag to resize" onpointerdown={resizeDown}>
          <span class="grip"></span>
        </div>
      {/if}

      <!-- grid map navigator: hop between blocks / add / route without leaving the editor.
           Deliberately OUTSIDE the `sel` gates — it's how you pick a block in the first place, and
           it sits ABOVE the header so selecting a block grows the card downwards from the map
           instead of shoving the map down the pane. -->
      <GridMap />

      <!-- header: search + close. The block's identity (icon/name), channel and type now live in the
           left rail beside the canvas so they stay put on every page. -->
      {#if sel && cat}
        <header class="head">
          <div class="csearch" class:active={searching}>
            <svg width="15" height="15" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.8 10.8 L14.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
            <input class="csin" placeholder="Find a control…" aria-label="Find a control" bind:value={q} />
            {#if searching}<button class="csx" aria-label="Clear search" onclick={() => (q = '')}>✕</button>{/if}
          </div>
          {#if !embedded}<button class="close" aria-label="Close" onclick={() => editor.closeEditor()}>✕</button>{/if}
        </header>
      {/if}

      <!-- body: left rail (identity / channel / type) + the device-canvas control surface. The rail is
           the block's identity controls moved out of the header so they sit to the left of every page. -->
      <div class="body">
        {#if sel && cat}
          <aside class="side">
            <!-- block type icon + name, mirroring the Signal Grid tile's glyph-over-label anatomy -->
            <div class="identity">
              <div class="icon" style="background:linear-gradient(180deg,{shade(cat.accent, 0.16)},{shade(cat.accent, -0.18)}); border-color:{shade(cat.accent, -0.3)};">{@html cat.glyph}</div>
              <span class="name" title={sel.display}>{cat.short}</span>
            </div>

            {#if sel.pack && sel.channel != null}
              <div class="ch">
                <span class="ch-lbl mono">CH</span>
                {#each CHAN as id}
                  <button class="ch-btn" class:on={sel.channel === id} onclick={() => editor.setChannel(id)}>{id}</button>
                {/each}
              </div>
            {/if}

            <button class="typebtn" onclick={() => (isCab ? editor.openCabPicker() : editor.openRetype())} disabled={!sel.pack} title={isCab ? (cabSummary ?? 'Browse cabinet library') : `${typeName} — change type`}>
              <span class="t-wrap">
                <span class="t-type" class:long={typeName.length > 16 && typeName.length <= 24} class:xlong={typeName.length > 24}>{typeName}</span>
              </span>
            </button>
          </aside>
        {/if}

        <div class="stage">
          {#if !sel || !cat}
            <div class="empty">
              <strong>Block Editor</strong>
              <span>Select a block in the grid to edit its parameters.</span>
            </div>
          {:else if editor.sheetState === 'nopack'}
            <div class="content scroll"><p class="hint">No parameter pack for <b>{cat.short}</b> yet — bypass/channel still work.</p></div>
          {:else if editor.sheetState === 'loading'}
            <div class="content scroll"><p class="hint">Reading parameters…</p></div>
          {:else if editor.sheetState === 'error'}
            <div class="content scroll"><p class="hint">Couldn't read this block.</p></div>
          {:else}
            <DeviceCanvas
              slug={sel.pack ?? sel.display ?? 'block'}
              accent={cat.accent}
              {eqGraphs}
              {modulationGraphs}
              {compressorGraphs}
              {cabAlignmentGraphs}
              {adsrGraphs}
              {megaTapGraphs}
              {cabMicGraphs}
              {pseudoText}
              {onPseudoClick}
              bind:q
            />
          {/if}
        </div>
      </div>

    </div>

    <!-- Quick Build: q toggles this bottom sheet of placeable blocks, anchored to the Block Editor pane
         so it works docked or embedded. -->
    <QuickBuild />
  </div>
{/if}

<style>
  .ed {
    flex: none;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--surface2);
    background: var(--bg2);
    position: relative;
    z-index: 40;
    box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.4);
  }
  .ed.mob {
    position: absolute;
    inset: 0;
    z-index: 95;
    border-top: 0;
    box-shadow: none;
  }
  .ed.embedded {
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    border-top: 0;
    box-shadow: none;
    z-index: 0;
  }
  .overlaybg {
    position: absolute;
    inset: 0;
    background: rgba(6, 6, 8, 0.62);
    backdrop-filter: blur(3px);
  }
  .card {
    width: 100%;
    height: 100%;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .card.sheet {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    animation: axsSheet 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
  }

  .resize {
    height: 15px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: var(--bg2);
    border-bottom: 1px solid var(--surface2);
    touch-action: none;
  }
  .resize:hover {
    background: var(--surface);
  }
  .grip {
    width: 48px;
    height: 4px;
    border-radius: 3px;
    background: var(--border3);
  }

  .head {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--d-gap);
    padding: var(--d-pad-y) var(--d-pad-x);
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  /* body = rail + canvas side by side; the rail is the block's identity column and the stage holds
     the device canvas (or an empty/loading state). Both fill the space below the header. */
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  .side {
    flex: none;
    width: 176px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: calc(var(--d-pad-y) * 2) var(--d-pad-x);
    border-right: 1px solid var(--surface2);
    background: var(--bg2);
    overflow-y: auto;
  }
  .stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .identity {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    container-type: inline-size;
  }
  .name {
    font-weight: 700;
    font-size: var(--d-font-lg);
    color: var(--text);
    text-align: center;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  /* The icon is the rail's hero: fill the rail's inner width and size the glyph to it (the glyph is a
     24×24 viewBox at 1em, so font-size sets its rendered size). Leave a little breathing room inside. */
  .icon {
    width: 50%;
    aspect-ratio: 1;
    flex: none;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(50cqw - 20px);
    color: var(--text);
    border: 1px solid;
  }
  .typebtn {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    min-width: 0;
    height: calc(var(--d-ctl-h) + 8px);
    padding: 0 var(--d-pad-x);
    background: linear-gradient(180deg, var(--bg2), var(--bg));
    border: 1px solid var(--border2);
    border-radius: 11px;
    cursor: pointer;
    color: var(--accent);
  }
  .typebtn:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--surface);
  }
  .typebtn:disabled {
    cursor: default;
    opacity: 0.7;
  }
  .t-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    text-align: left;
  }
  /* Sized below the TopBar preset name (17px) so the block type reads as context, not the
     headline — this button changes type, it doesn't name what you're editing. Long device
     names still step DOWN through two buckets rather than being measured and fitted: the
     width is fixed, so a bucket cannot start a size→width→size loop, and a deterministic
     rule needs no measurement pass. */
  .t-type {
    font-weight: 700;
    font-size: var(--d-font-lg);
    letter-spacing: -0.01em;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t-type.long {
    font-size: calc(var(--d-font-lg) * 0.93);
    letter-spacing: -0.005em;
  }
  .t-type.xlong {
    font-size: calc(var(--d-font-lg) * 0.87);
    letter-spacing: 0;
  }
  /* Channels sit below the block name in the rail: they are a property OF the selected type, and
     reading "Brit 800 Mod / CH C" as one phrase is the point. One horizontal track, each button
     sharing the rail width equally. */
  .ch {
    display: flex;
    gap: 2px;
    align-items: center;
    flex: none;
  }
  .ch-lbl {
    font: 700 9px/1 var(--font-mono);
    color: var(--text-mut);
    letter-spacing: 0.1em;
    padding: 0 6px 0 4px;
    flex: none;
  }
  .ch-btn {
    flex: 1;
    min-width: 0;
    height: 30px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-dim);
    font-weight: 700;
    font-size: calc(var(--d-font) * 1.12);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .ch-btn:hover:not(.on) {
    background: var(--surface2);
    color: var(--text2);
  }
  .ch-btn.on {
    background: var(--amber-tint);
    border-color: var(--amber-border);
    color: var(--amber);
  }

  .csearch {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 1 340px;
    min-width: 0;
    height: var(--d-ctl-h);
    padding: 0 calc(var(--d-pad-x) * 0.8);
    border-radius: 10px;
    background: var(--input);
    border: 1px solid var(--border2);
    color: var(--text-mut);
  }
  .csearch:focus-within,
  .csearch.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .csearch svg,
  .csx {
    flex: none;
  }
  .csin {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    outline: none;
    color: var(--text);
    font: inherit;
    font-size: var(--d-font);
  }
  .csin::placeholder {
    color: var(--text-faint);
  }
  .csx {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 0;
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
  }

  .close {
    margin-left: auto;
    width: var(--d-ctl-h-sm);
    height: var(--d-ctl-h-sm);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 10px;
    cursor: pointer;
    font-size: var(--d-font-lg);
    color: var(--text-dim);
  }
  .close:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }

  .hint {
    color: var(--text-dim);
  }

  /* no selection: the grid map keeps its band, this fills whatever is left below it */
  .empty {
    flex: 1;
    min-height: 0;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--text-dim);
  }
  .empty strong {
    color: var(--text);
    font-size: var(--d-font-lg);
  }
  .empty span {
    font-size: var(--d-font-sm);
  }

</style>
