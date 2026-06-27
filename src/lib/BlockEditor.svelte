<script lang="ts">
  import { editor, baseName } from './editor.svelte';
  import { catFor, shade } from './catalog';
  import Knob from './Knob.svelte';

  const sel = $derived(editor.selected);
  const cat = $derived(sel ? catFor(sel.pack, baseName(sel.display)) : null);
  const isAmp = $derived(sel?.pack === 'Amp');

  // page tabs by block kind + view mode
  const pages = $derived.by(() => {
    const m = editor.effMode;
    if (isAmp) return m === 'basic' ? ['Ideal', 'Input EQ', 'Output EQ'] : ['Tone', 'Ideal', 'Preamp', 'Speaker', 'Input EQ', 'Output EQ', 'Dynamics'];
    return m === 'basic' ? ['Controls'] : ['Controls', 'Tone', 'Mix', 'Modifiers'];
  });
  const activePage = $derived(pages.includes(editor.activePage) ? editor.activePage : pages[0]);
  const isKnobs = $derived(isAmp ? activePage === 'Ideal' || activePage === 'Tone' : activePage === 'Controls');
  const isEq = $derived(activePage === 'Input EQ' || activePage === 'Output EQ');

  const CHAN = ['A', 'B', 'C', 'D'];

  // ── docked resize (desktop) ──
  let resizing = false;
  function resizeDown(e: PointerEvent) {
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

{#if editor.editorOpen && sel && cat}
  <div
    class="ed"
    class:mob={editor.isMobile}
    style="--c:{cat.accent}; {editor.isMobile ? '' : `height:${editor.editorH}px;`}"
    data-screen="Block Editor"
  >
    {#if editor.isMobile}<div class="overlaybg" role="presentation" onclick={() => editor.closeEditor()}></div>{/if}
    <div class="card" class:sheet={editor.isMobile}>
      {#if !editor.isMobile}
        <div class="resize" role="separator" aria-label="Resize panel" title="Drag to resize" onpointerdown={resizeDown}>
          <span class="grip"></span>
        </div>
      {/if}

      <!-- header -->
      <header class="head">
        <div class="icon" style="background:linear-gradient(180deg,{shade(cat.accent, 0.16)},{shade(cat.accent, -0.18)}); border-color:{shade(cat.accent, -0.3)};">{cat.glyph}</div>
        <button class="typebtn" onclick={() => editor.openRetype()} disabled={!sel.pack} title="Change type">
          <div class="t-wrap">
            <div class="t-title">{cat.short}</div>
            <div class="t-type mono">{sel.pack ?? '—'} {#if sel.pack}▾{/if}</div>
          </div>
          {#if sel.pack}
            <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="#35c9d6" stroke-width="1.5" /><path d="M10.6 10.6 L14 14" stroke="#35c9d6" stroke-width="1.5" stroke-linecap="round" /></svg>
          {/if}
        </button>

        {#if isAmp}
          <div class="ch">
            <span class="ch-lbl mono">CH</span>
            {#each CHAN as id}
              <button class="ch-btn" class:on={sel.channel === id} onclick={() => editor.setChannel(id)}>{id}</button>
            {/each}
          </div>
        {/if}

        <span class="spacer"></span>

        <div class="modeseg">
          <button class="ms" class:on={editor.effMode === 'basic'} onclick={() => editor.setBlockMode('basic')}>Basic</button>
          <button class="ms" class:on={editor.effMode === 'advanced'} onclick={() => editor.setBlockMode('advanced')}>Advanced</button>
        </div>
        {#if editor.overriding}
          <button class="ovr" title="Overrides the global view — click to follow global" onclick={() => editor.resetBlockMode()}>OVR <span class="x">✕</span></button>
        {/if}
        <button class="close" aria-label="Close" onclick={() => editor.closeEditor()}>✕</button>
      </header>

      <!-- tabs -->
      <div class="tabs scroll">
        {#each pages as p}
          <button class="tab" class:on={p === activePage} onclick={() => (editor.activePage = p)}>{p}</button>
        {/each}
      </div>

      <!-- content -->
      <div class="content scroll">
        {#if editor.sheetState === 'nopack'}
          <p class="hint">No parameter pack for <b>{cat.short}</b> yet — bypass/channel still work.</p>
        {:else if editor.sheetState === 'loading'}
          <p class="hint">Reading parameters…</p>
        {:else if editor.sheetState === 'error'}
          <p class="hint">Couldn't read this block.</p>
        {:else if isKnobs}
          <div class="knobs">
            {#each editor.params as p (p.name)}
              <Knob
                value={p.norm ?? 0}
                label={p.name}
                valueText={((p.norm ?? 0) * 10).toFixed(1)}
                color={cat.accent}
                onInput={(v) => editor.setParam(p, v)}
              />
            {/each}
          </div>
        {:else if isEq}
          <div class="stub">
            <div class="stub-t">{activePage}</div>
            <div class="stub-s">Interactive EQ editor — coming next.</div>
          </div>
        {:else}
          <div class="stub">
            <div class="stub-t">{activePage}</div>
            <div class="stub-s">Advanced page — not built yet.</div>
          </div>
        {/if}
      </div>

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
    border-top: 1px solid #20202a;
    background: #0e0e10;
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
  .overlaybg {
    position: absolute;
    inset: 0;
    background: rgba(6, 6, 8, 0.62);
    backdrop-filter: blur(3px);
  }
  .card {
    width: 100%;
    height: 100%;
    background: linear-gradient(180deg, #141418, #0f0f12);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .card.sheet {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, #15151a, #0f0f12);
    animation: axsSheet 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
  }

  .resize {
    height: 15px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ns-resize;
    background: #0d0d10;
    border-bottom: 1px solid #1a1a1f;
    touch-action: none;
  }
  .resize:hover {
    background: #141418;
  }
  .grip {
    width: 48px;
    height: 4px;
    border-radius: 3px;
    background: #3a3a44;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    border-bottom: 1px solid #1c1c22;
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
    color: #fff;
    border: 1px solid;
  }
  .typebtn {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    height: 42px;
    padding: 0 12px;
    background: #0d0d10;
    border: 1px solid #2c2c34;
    border-radius: 11px;
    cursor: pointer;
  }
  .typebtn:hover {
    border-color: var(--accent);
  }
  .typebtn:disabled {
    cursor: default;
  }
  .t-wrap {
    min-width: 0;
    line-height: 1.1;
    text-align: left;
  }
  .t-title {
    font-weight: 700;
    font-size: 14px;
    color: #fff;
    white-space: nowrap;
  }
  .t-type {
    font: 500 11px/1.25 var(--font-mono);
    color: var(--amber);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 210px;
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
    background: #0d0d10;
    border: 1px solid var(--surface-3);
    color: var(--text-faint);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
  }
  .ch-btn.on {
    background: #1d2a2c;
    border-color: var(--accent);
    color: var(--amber);
  }
  .spacer {
    flex: 1;
    min-width: 6px;
  }
  .modeseg {
    display: flex;
    gap: 4px;
    background: #0d0d10;
    border: 1px solid var(--surface-3);
    border-radius: 10px;
    padding: 3px;
    flex: none;
  }
  .ms {
    height: 34px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #8a8a93;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .ms.on {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .ovr {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 9px;
    background: #1a1510;
    border: 1px solid #4a3a1f;
    border-radius: 9px;
    cursor: pointer;
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.04em;
    color: #f5c878;
    flex: none;
  }
  .ovr .x {
    font-size: 12px;
    color: #caa05a;
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

  .tabs {
    display: flex;
    gap: 8px;
    padding: 11px 16px 4px;
    overflow-x: auto;
    flex: none;
  }
  .tab {
    flex: none;
    padding: 9px 15px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    background: #15151a;
    border: 1px solid var(--surface-3);
    color: #8a8a93;
  }
  .tab.on {
    background: rgba(245, 166, 35, 0.12);
    border-color: #5a3f1f;
    color: var(--amber);
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 18px 16px;
  }
  .knobs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 16px 8px;
    padding: 6px 4px;
    align-items: start;
    justify-items: center;
  }
  .hint {
    color: var(--text-dim);
  }
  .stub {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #4a4a52;
    padding: 50px 20px;
  }
  .stub-t {
    font-size: 13px;
    font-weight: 600;
  }
  .stub-s {
    font-size: 12px;
    color: #3c3c44;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid #1e1e25;
    background: #101013;
    flex: none;
  }
  .act {
    height: 44px;
    padding: 0 16px;
    border: 1px solid var(--border-2);
    background: #15151a;
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
    background: #142417;
    border-color: #2c4a31;
    color: #5fc46b;
  }
  .act.byp.on {
    background: #241516;
    border-color: #5a2f33;
    color: var(--danger);
  }
  .act.rem {
    background: #1a1113;
    border-color: #4a2226;
    color: var(--danger);
  }
</style>
