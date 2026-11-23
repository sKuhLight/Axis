<script lang="ts">
  import { baseName } from './editor.svelte';
  import { getEditorSurface } from './editorSurface';
  import { catFor, familyLabel, shade } from './catalog';
  import BeSurface from './blockEditor/BeSurface.svelte';
  import { trackDeviceClass } from './blockEditor/deviceClass.svelte';
  import { browserFlagStore, readGridMapShown, writeGridMapShown } from './blockEditor/gridMapPrefs';
  import { blockStateView, type BeBlockChrome } from './blockEditor/headerModel';
  import GridMap from './GridMap.svelte';
  import { type EQBand } from './EQGraph.svelte';
  import { geqFreqs, shapeFromLabel } from './eq';
  import type { CabState, CabSlot } from './types';

  const editor = getEditorSurface();

  let { embedded = false }: { embedded?: boolean } = $props();

  // the editor's device class (workbench profile, else window width): phone chrome and the grid map's
  // default fold follow it, the same value the board uses for its storage key
  const dc = trackDeviceClass();
  const isPhone = $derived(dc.current === 'phone');
  const isTouch = $derived(dc.current !== 'desktop'); // phone and tablet: ≥ 40 px hit targets
  // Grid map: folded by default in the workbench (every device class; its grid panel is right there) and
  // on a phone in the monolith; unfolded by default only in the monolith on desktop / tablet. A stored
  // fold state always wins. ⋯ "Grid map" shows / hides the whole strip (stored separately).
  const gridMapFolded = $derived(embedded || dc.current === 'phone');

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

  // ── header: the type chip and block actions the surface's header shows ──
  // Scene Ignore and Bypass mode come from the device (ForgeFX tags them on the block params, cap
  // `blockState`) and write through the board's own enum write; unavailable = disabled with the reason.
  let gridMapShown = $state(readGridMapShown(browserFlagStore()));
  function setGridMapShown(show: boolean) {
    gridMapShown = show;
    writeGridMapShown(browserFlagStore(), show);
  }
  const blockStateUi = $derived(
    blockStateView({
      live: !!editor.setBlockStateParam,
      cap: editor.blockStateCap,
      device: editor.detected?.name,
      status: editor.sheetState,
      state: editor.blockState,
      stale: !!editor.blockStateStale,
      channel: sel?.channel
    })
  );
  const chrome = $derived.by((): BeBlockChrome | null => {
    if (!sel || !cat) return null;
    const bs = blockStateUi;
    return {
      glyph: cat.glyph,
      glyphBg: `linear-gradient(180deg,${shade(cat.accent, 0.14)},${shade(cat.accent, -0.5)})`,
      glyphBorder: shade(cat.accent, -0.25),
      family: familyLabel(sel.pack, baseName(sel.display)),
      typeName: editor.blockType?.name,
      pack: sel.pack,
      isCab,
      cabSummary,
      channel: sel.channel,
      bypassed: !!sel.bypassed,
      blockState: bs,
      gridMapShown,
      onType: () => (isCab ? editor.openCabPicker() : editor.openRetype()),
      onChannel: (ch) => void editor.setChannel(ch),
      onBypass: () => void editor.toggleBypass(),
      onSceneIgnore: (on) => {
        if (bs.scene.enabled && bs.scene.paramId != null) editor.setBlockStateParam?.(bs.scene.paramId, on ? 1 : 0);
      },
      onBypassMode: (value) => {
        if (bs.bypassMode.enabled && bs.bypassMode.paramId != null) editor.setBlockStateParam?.(bs.bypassMode.paramId, value);
      },
      onRemove: () => void editor.removeSelected(),
      onGridMap: setGridMapShown
    };
  });
  const message = $derived(
    editor.sheetState === 'nopack'
      ? `No parameter pack for ${sel ? familyLabel(sel.pack, baseName(sel.display)) : 'this block'} yet.`
      : editor.sheetState === 'loading'
        ? 'Reading parameters…'
        : editor.sheetState === 'error'
          ? "Couldn't read this block."
          : ''
  );
  /** Identity of the block shown: another block (or effect) starts a fresh view of the surface; a reload
   *  of the same block keeps its board. The surface itself stays mounted (so does the grid map). */
  const surfaceKey = $derived(sel ? `${sel.effectId}@${sel.row},${sel.col}` : '');

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

<!-- monolith: close at the end of the header row (the workbench pane has its own) -->
{#snippet closeButton()}
  <button class="close" type="button" aria-label="Close" title="Close" onclick={() => editor.closeEditor()}>✕</button>
{/snippet}

{#if (embedded || editor.editorOpen) && sel && cat}
  <div
    class="ed"
    class:mob={editor.isMobile && !embedded}
    class:embedded
    class:phone={isPhone}
    class:touch={isTouch}
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

      <!-- header (type chip · pages · search · Engaged | Bypass mode ▾ | Scene Ignore · ⋯), the grid map strip under
           it (default fold above, so the board keeps the height where space is short; ⋯ shows / hides it),
           then the block's control board (every page at once, always fitted; arrange mode). The no-pack /
           reading / error states show in the board area while the header stays usable. -->
      <BeSurface
        slug={sel.pack ?? sel.display ?? 'block'}
        accent={cat.accent}
        eqBands={isEQ ? eqBands : []}
        eqGainRange={sel.pack === 'Geq' ? 12 : 20}
        eqTitle={editor.blockType?.name || (sel.pack === 'Geq' ? 'Graphic EQ' : 'Parametric EQ')}
        hideIds={isCab ? CAB_PICKER_IDS : []}
        block={chrome}
        status={editor.sheetState}
        {message}
        headerEnd={embedded ? undefined : closeButton}
        resetKey={surfaceKey}
      >
        {#snippet belowHeader()}
          {#if gridMapShown}<div class="gridmap-wrap"><GridMap defaultCollapsed={gridMapFolded} /></div>{/if}
        {/snippet}
      </BeSurface>
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
  /* In a workbench pane the editor keeps a stacking context of its own (z-index 0): its in-panel
     z-indexes never meet the dock chrome. Its floating parts (⋯ menu, search popover, select, value
     bubble, modifier flyout, pin chip) live in layers on the workbench shell root (overlayLayer.ts). */
  .ed.embedded {
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    border-top: 0;
    box-shadow: none;
    z-index: 0;
  }
  .gridmap-wrap {
    flex: none;
    display: flex;
    flex-direction: column;
    isolation: isolate;
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

  /* monolith: close at the end of the header row */
  .close {
    width: 30px;
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--textdim);
  }
  .close:hover {
    border-color: var(--border3);
    color: var(--text);
  }
  /* phone and tablet: ≥ 40 px hit target */
  .ed.touch .close {
    width: 40px;
    height: 40px;
  }
</style>
