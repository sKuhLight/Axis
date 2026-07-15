<script lang="ts">
  import { baseName } from './editor.svelte';
  import { getEditorSurface } from './editorSurface';
  import { catFor, shade } from './catalog';
  import ControlSurface from './ControlSurface.svelte';
  import GridMap from './GridMap.svelte';
  import { type EQBand } from './EQGraph.svelte';
  import { geqFreqs, shapeFromLabel } from './eq';
  import type { CabState, CabSlot } from './types';

  const editor = getEditorSurface();

  let { embedded = false }: { embedded?: boolean } = $props();

  const sel = $derived(editor.selected);
  const cat = $derived(sel ? catFor(sel.pack, baseName(sel.display)) : null);
  const isEQ = $derived(sel?.pack === 'Peq' || sel?.pack === 'Geq');
  const isCab = $derived(sel?.pack === 'Cab');

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
  // EQ bands from the live params (PEQ: freq 0-4 / Q 5-9 / gain 10-14; GEQ: fixed-freq gains 0-9)
  const eqBands = $derived.by((): EQBand[] => {
    if (!isEQ) return [];
    const byId = new Map(editor.params.filter((p) => p.id != null).map((p) => [p.id as number, p]));
    if (sel?.pack === 'Geq') {
      // band frequencies depend on the selected GEQ model (10-band vs 7-band, Mark, …)
      const freqs = geqFreqs(editor.blockType?.name ?? '', 10);
      const out: EQBand[] = [];
      for (let i = 0; i < freqs.length && i <= 9; i++) {
        const g = byId.get(i);
        if (g) out.push({ key: `g${i}`, gain: g, centerHz: freqs[i], shape: 'bell' });
      }
      return out;
    }
    const enumById = new Map(editor.enums.map((e) => [e.id, e]));
    const out: EQBand[] = [];
    for (let i = 0; i < 5; i++) {
      const g = byId.get(10 + i);
      const f = byId.get(i);
      if (g && f) {
        const te = enumById.get(15 + i);
        const label = te?.options.find((o) => o.value === te.value)?.label;
        out.push({ key: `b${i}`, gain: g, freq: f, q: byId.get(5 + i), shape: shapeFromLabel(label, i < 2) });
      }
    }
    return out;
  });
  // cab IR picker owns mode/bank/IR/dyna params — hide them from the generic surface catalog
  const CAB_PICKER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 31, 85, 86];

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

{#if (embedded || editor.editorOpen) && sel && cat}
  <div
    class="ed"
    class:mob={editor.isMobile && !embedded}
    class:embedded
    style="--c:{cat.accent}; {embedded ? '' : editor.isMobile ? '' : `height:${editor.editorH}px;`}"
    data-screen="Block Editor"
  >
    {#if editor.isMobile && !embedded}<div class="overlaybg" role="presentation" onclick={() => editor.closeEditor()}></div>{/if}
    <div class="card" class:sheet={editor.isMobile && !embedded}>
      {#if !editor.isMobile && !embedded}
        <div class="resize" role="separator" aria-label="Resize panel" title="Drag to resize" onpointerdown={resizeDown}>
          <span class="grip"></span>
        </div>
      {/if}

      <!-- header -->
      <header class="head">
        <div class="icon" style="background:linear-gradient(180deg,{shade(cat.accent, 0.16)},{shade(cat.accent, -0.18)}); border-color:{shade(cat.accent, -0.3)};">{cat.glyph}</div>
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

      <!-- grid map navigator: hop between blocks / add / route without leaving the editor -->
      <GridMap />

      <!-- body: widget-grid control surface (pages, per-control views, arrange mode) -->
      {#if editor.sheetState === 'nopack'}
        <div class="content scroll"><p class="hint">No parameter pack for <b>{cat.short}</b> yet — bypass/channel still work.</p></div>
      {:else if editor.sheetState === 'loading'}
        <div class="content scroll"><p class="hint">Reading parameters…</p></div>
      {:else if editor.sheetState === 'error'}
        <div class="content scroll"><p class="hint">Couldn't read this block.</p></div>
      {:else}
        <ControlSurface
          slug={sel.pack ?? sel.display ?? 'block'}
          accent={cat.accent}
          eqBands={isEQ ? eqBands : []}
          eqGainRange={sel.pack === 'Geq' ? 12 : 20}
          eqTitle={editor.blockType?.name || (sel.pack === 'Geq' ? 'Graphic EQ' : 'Parametric EQ')}
          hideIds={isCab ? CAB_PICKER_IDS : []}
        />
      {/if}

      <!-- footer -->
      <footer class="foot">
        <button class="act" onclick={() => editor.showToast('Mute — coming soon', '#35c9d6')}>Mute</button>
        <button class="act" onclick={() => editor.showToast('Scene Ignore — coming soon', '#35c9d6')}>Scene Ignore</button>
        <span class="spacer"></span>
        <button class="act byp" class:on={sel.bypassed} disabled={!sel.pack} onclick={() => editor.toggleBypass()}>
          {sel.bypassed ? 'Bypassed' : 'Engaged'}
        </button>
        <button class="act rem" onclick={() => editor.removeSelected()}>Remove</button>
      </footer>
    </div>
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
    gap: 10px;
    padding: 9px 14px;
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  .icon {
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
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
    height: 46px;
    padding: 0 12px 0 13px;
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
    font: 700 9px/1 var(--font-mono);
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-mut);
  }
  .t-type {
    font-weight: 700;
    font-size: 15px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t-go {
    flex: none;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    padding: 6px 10px;
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
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 9px;
    background: var(--bg2);
    border: 1px solid var(--surface-3);
    color: var(--text-faint);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
  }
  .ch-btn.on {
    background: var(--accent-tint);
    border-color: var(--accent);
    color: var(--amber);
  }
  .spacer {
    flex: 1;
    min-width: 6px;
  }
  .close {
    width: 38px;
    height: 38px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 10px;
    cursor: pointer;
    font-size: 16px;
    color: var(--text-dim);
  }
  .close:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }

  .hint {
    color: var(--text-dim);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid var(--surface2);
    background: var(--bg2);
    flex: none;
  }
  .act {
    height: 44px;
    padding: 0 16px;
    border: 1px solid var(--border-2);
    background: var(--surface);
    color: var(--text-dim);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .act:hover {
    border-color: var(--border-strong);
  }
  .act.byp {
    background: var(--ok-tint);
    border-color: var(--ok-border);
    color: var(--ok);
  }
  .act.byp.on {
    background: var(--surface2);
    border-color: var(--danger-border);
    color: var(--danger);
  }
  .act.rem {
    background: var(--surface);
    border-color: var(--danger-tint);
    color: var(--danger);
  }
</style>
