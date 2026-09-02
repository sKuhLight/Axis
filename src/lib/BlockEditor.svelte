<script lang="ts">
  import { baseName } from './editor.svelte';
  import { getEditorSurface } from './editorSurface';
  import { catFor, shade } from './catalog';
  import ControlSurface from './ControlSurface.svelte';
  import GridMap from './GridMap.svelte';
  import QuickBuild from './QuickBuild.svelte';
  import { geqBandsFromLayout } from './eq';
  import { deriveEqGraphs } from './eqGraphs';
  import { deriveModulationGraphs } from './modulationGraphs';
  import { deriveCompressorGraphs } from './compressorGraphs';
  import { deriveCabAlignmentGraphs } from './cabAlignmentGraphs';
  import { deriveCabMicGraphs } from './cabMicGraphs';
  import { deriveAdsrGraphs } from './adsrGraphs';
  import { deriveMegaTapGraphs } from './megaTapGraphs';
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
  // DynaCab is a per-slot MODE (see `dynaMode` above), not a separate layout — gate the mic graphic on it
  // so a legacy IR cab never draws one.
  const cabMicGraphs = $derived(deriveCabMicGraphs({ layout: editor.blockLayout, params: editor.params, enums: editor.enums, dyna: dynaMode }));
  const adsrGraphs = $derived(deriveAdsrGraphs({ layout: editor.blockLayout, params: editor.params }));
  const megaTapGraphs = $derived(deriveMegaTapGraphs({ layout: editor.blockLayout, params: editor.params, enums: editor.enums }));
  // Fixed-frequency gain bands (GEQ blocks + the amp's built-in output EQ) → one vertical fader bank
  // on the control surface, in device order with the device's own band labels.
  const geqBands = $derived.by(() => {
    const byId = new Map(editor.params.filter((p) => p.id != null).map((p) => [p.id as number, p]));
    return geqBandsFromLayout(editor.blockLayout)
      .map((b) => ({ key: `gb${b.paramId}`, label: b.label, gain: byId.get(b.paramId)! }))
      .filter((b) => !!b.gain);
  });
  // cab IR picker owns mode/bank/IR/dyna params — hide them from the generic surface catalog
  const CAB_PICKER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 31, 85, 86];
  // Legacy-only Cab params that DynaCab mode does not use: IR Length (70/71) and Proximity (20/21). Hidden
  // when the cab is a DynaCab so the surface shows only the controls the DynaCab actually exposes — the
  // mic graphic + Level/Pan/Low Cut/High Cut/slopes + the Position/Distance knobs.
  const CAB_LEGACY_ONLY_IDS = [70, 71, 20, 21];
  const hideIds = $derived(isCab ? (dynaMode ? [...CAB_PICKER_IDS, ...CAB_LEGACY_ONLY_IDS] : CAB_PICKER_IDS) : []);

  const CHAN = ['A', 'B', 'C', 'D'];

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
    document.body.style.cursor = 'ns-resize';
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

      <!-- header -->
      {#if sel && cat}
        <header class="head">
          <div class="icon" style="background:linear-gradient(180deg,{shade(cat.accent, 0.16)},{shade(cat.accent, -0.18)}); border-color:{shade(cat.accent, -0.3)};">{@html cat.glyph}</div>
          <button class="typebtn" onclick={() => (isCab ? editor.openCabPicker() : editor.openRetype())} disabled={!sel.pack} title={isCab ? (cabSummary ?? 'Browse cabinet library') : 'Change type — search models'}>
            <svg class="t-mag" width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.7" /><path d="M10.8 10.8 L14.5 14.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
            <span class="t-wrap">
              <span class="t-title">{isCab ? 'Cab IR · DynaCab' : `${cat.short} · type`}</span>
              <span class="t-type">{isCab ? (cabSummary ?? 'Browse cabinet library') : (editor.blockType?.name || sel.pack || '—')}</span>
            </span>
            {#if sel.pack}<span class="t-go">{isCab ? 'Open' : 'Change ▾'}</span>{/if}
          </button>

          {#if sel.pack && sel.channel != null}
            <div class="ch">
              <span class="ch-lbl mono">CH</span>
              {#each CHAN as id}
                <button class="ch-btn" class:on={sel.channel === id} onclick={() => editor.setChannel(id)}>{id}</button>
              {/each}
            </div>
          {/if}

          {#if !embedded}<button class="close" aria-label="Close" onclick={() => editor.closeEditor()}>✕</button>{/if}
        </header>
      {/if}

      <!-- body: widget-grid control surface (pages, per-control views, arrange mode) -->
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
        <ControlSurface
          slug={sel.pack ?? sel.display ?? 'block'}
          accent={cat.accent}
          {eqGraphs}
          {modulationGraphs}
          {compressorGraphs}
          {cabAlignmentGraphs}
          {cabMicGraphs}
          {adsrGraphs}
          {megaTapGraphs}
          {geqBands}
          geqTitle={editor.blockType?.name || 'Graphic EQ'}
          {hideIds}
        />
      {/if}

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
    cursor: ns-resize;
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
    display: flex;
    align-items: center;
    gap: var(--d-gap);
    padding: var(--d-pad-y) var(--d-pad-x);
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  .icon {
    width: var(--d-ctl-h);
    height: var(--d-ctl-h);
    flex: none;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--d-font-lg);
    color: var(--text);
    border: 1px solid;
  }
  /* the type button doubles as the model search — grows to fill the header so the full name shows */
  .typebtn {
    display: flex;
    align-items: center;
    gap: 11px;
    flex: 1;
    min-width: 0;
    height: var(--d-ctl-h);
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
  .t-mag {
    flex: none;
    color: var(--accent);
  }
  .t-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    text-align: left;
  }
  .t-title {
    font: 700 calc(var(--d-font-sm) * 0.82) / 1 var(--font-mono);
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-mut);
  }
  .t-type {
    font-weight: 700;
    font-size: var(--d-font-lg);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t-go {
    flex: none;
    font-size: var(--d-font-sm);
    font-weight: 700;
    color: var(--accent);
    padding: calc(var(--d-pad-y) * 0.6) calc(var(--d-pad-x) * 0.7);
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    white-space: nowrap;
  }
  .ch {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .ch-lbl {
    font: 600 8px/1 var(--font-mono);
    color: var(--text-mut);
    letter-spacing: 0.08em;
    margin-right: 2px;
  }
  .ch-btn {
    width: var(--d-ctl-h-sm);
    height: var(--d-ctl-h-sm);
    flex: none;
    border-radius: 9px;
    background: var(--bg2);
    border: 1px solid var(--surface-3);
    color: var(--text-faint);
    font-weight: 700;
    font-size: var(--d-font);
    cursor: pointer;
  }
  .ch-btn.on {
    background: var(--accent-tint);
    border-color: var(--accent);
    color: var(--amber);
  }
  .close {
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
