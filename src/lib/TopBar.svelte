<script lang="ts">
  import { editor } from './editor.svelte';

  const pnum = $derived(editor.preset && editor.preset.number >= 0 ? String(editor.preset.number).padStart(3, '0') : '—');
  const pname = $derived(editor.preset?.name || (editor.conn.state === 'online' ? '—' : 'offline'));
</script>

<header class="topbar" class:mob={editor.isMobile}>
  <!-- left region (scrolls if cramped) -->
  <div class="left scroll">
    {#if editor.isMobile}
      <svg class="mlogo" width="26" height="26" viewBox="0 0 30 30">
        <circle cx="9" cy="9" r="3.4" fill="#35c9d6" />
        <circle cx="21" cy="9" r="3.4" fill="#4f6bed" />
        <circle cx="15" cy="21" r="3.4" fill="#f5a623" />
      </svg>
    {/if}

    <div class="preset">
      <button class="pbtn l" title="Previous preset" onclick={() => editor.stepPreset(-1)}>‹</button>
      <button class="pset" onclick={() => (editor.presetOpen = true)}>
        <span class="mono tag">PRE</span>
        <span class="mono num">{pnum}</span>
        <span class="pname">{pname}</span>
        <span class="caret">▾</span>
      </button>
      <button class="pbtn r" title="Next preset" onclick={() => editor.stepPreset(1)}>›</button>
    </div>

    <div class="scenes">
      <span class="mono scn-lbl">SCN</span>
      <div class="scn-group">
        {#each [1, 2, 3, 4, 5, 6, 7, 8] as s}
          <button class="scn" class:on={editor.scene === s} onclick={() => (editor.scene = s)}>{s}</button>
        {/each}
      </div>
    </div>
  </div>

  <!-- right region (always visible) -->
  <div class="right">
    {#if !editor.isMobile}
      <div class="view" title="Default editor detail for every block">
        <span class="mono v-lbl">VIEW</span>
        <div class="seg">
          <button class="sg" class:on={editor.globalMode === 'basic'} onclick={() => editor.setGlobalMode('basic')}>Basic</button>
          <button class="sg" class:on={editor.globalMode === 'advanced'} onclick={() => editor.setGlobalMode('advanced')}>Advanced</button>
        </div>
      </div>
    {/if}

    <button class="addblk" onclick={() => { editor.paletteMode = 'place'; editor.paletteOpen = true; }}>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="5" fill="none" stroke="#35c9d6" stroke-width="1.6" />
        <path d="M10.6 10.6 L14 14" stroke="#35c9d6" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      Add block
      {#if !editor.isMobile}<span class="mono kbd">⌘K</span>{/if}
    </button>

    {#if !editor.isMobile}
      <div class="status">
        <button class="st" title="Tuner" onclick={() => editor.showToast('Tuner — coming soon', '#35c9d6')}>
          <span class="note">♪</span><span class="mono st-lbl">TUNE</span>
        </button>
        <div class="div"></div>
        <button class="st" title="Tap tempo" onclick={() => editor.showToast('Tap tempo — coming soon', '#35c9d6')}>
          <span class="mono bpm">{editor.bpm}</span><span class="mono st-lbl">BPM</span>
        </button>
        <div class="div"></div>
        <div class="st cpu" title="DSP usage (telemetry pending)">
          <span class="mono st-lbl">CPU</span>
          <div class="bar"><div class="fill"></div></div>
          <span class="mono cpu-t">—</span>
        </div>
      </div>
    {/if}

    <button class="save" title="Store the edit buffer to a preset (beta)" onclick={() => editor.openSave()}>
      <span class="save-dot"></span>Save
    </button>
  </div>
</header>

<style>
  .topbar {
    height: 60px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: linear-gradient(180deg, #141416, #0f0f12);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }
  .topbar.mob {
    gap: 8px;
    padding: 0 12px;
  }
  .left {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .mlogo {
    flex: none;
  }
  .right {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* preset cluster */
  .preset {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pbtn {
    width: 34px;
    height: 38px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #121214;
    border: 1px solid var(--border-2);
    color: var(--text-dim);
    font-size: 15px;
    cursor: pointer;
  }
  .pbtn.l {
    border-radius: 9px 4px 4px 9px;
  }
  .pbtn.r {
    border-radius: 4px 9px 9px 4px;
  }
  .pbtn:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .pset {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 38px;
    padding: 0 13px;
    background: var(--panel-2);
    border: 1px solid var(--border-2);
    border-radius: 4px;
    cursor: pointer;
    min-width: 0;
  }
  .pset:hover {
    border-color: var(--border-strong);
  }
  .tag {
    font-size: 8px;
    font-weight: 600;
    color: var(--text-mut);
    letter-spacing: 0.12em;
  }
  .num {
    font-size: 14px;
    font-weight: 700;
    color: var(--amber);
  }
  .pname {
    font-size: 13px;
    font-weight: 600;
    color: #e3e3e8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .caret {
    font-size: 10px;
    color: var(--text-faint);
  }

  /* scenes */
  .scenes {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .scn-lbl {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-mut);
    letter-spacing: 0.1em;
  }
  .scn-group {
    display: flex;
    gap: 3px;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    border-radius: 9px;
    padding: 3px;
  }
  .scn {
    width: 26px;
    height: 28px;
    flex: none;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #7a7a83;
    font: 700 11px/1 var(--font-mono);
    cursor: pointer;
  }
  .scn.on {
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* view switch */
  .view {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: none;
  }
  .v-lbl {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-mut);
    letter-spacing: 0.12em;
  }
  .seg {
    display: flex;
    gap: 3px;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    border-radius: 9px;
    padding: 3px;
  }
  .sg {
    height: 26px;
    padding: 0 11px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #8a8a93;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .sg.on {
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* add block */
  .addblk {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 38px;
    padding: 0 14px 0 13px;
    background: linear-gradient(180deg, #1d2a2c, #16201f);
    border: 1px solid #2c4a4b;
    border-radius: 10px;
    color: #bfeef2;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    flex: none;
    white-space: nowrap;
  }
  .kbd {
    font-size: 10px;
    font-weight: 600;
    color: #5e8a8c;
    background: #0d1516;
    border: 1px solid #234142;
    border-radius: 5px;
    padding: 4px 6px;
  }

  /* status module */
  .status {
    display: flex;
    align-items: stretch;
    height: 38px;
    flex: none;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    border-radius: 10px;
    overflow: hidden;
  }
  .st {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    background: transparent;
    border: 0;
    cursor: pointer;
    color: inherit;
  }
  button.st:hover {
    background: #16161b;
  }
  .note {
    font-size: 15px;
    color: var(--text-dim);
    line-height: 1;
  }
  .st-lbl {
    font-size: 8px;
    font-weight: 600;
    color: var(--text-mut);
    letter-spacing: 0.08em;
  }
  .bpm {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }
  .div {
    width: 1px;
    background: #20202a;
    flex: none;
  }
  .cpu {
    cursor: default;
  }
  .bar {
    width: 40px;
    height: 6px;
    background: #16161b;
    border: 1px solid var(--surface-3);
    border-radius: 4px;
    overflow: hidden;
  }
  .fill {
    width: 0;
    height: 100%;
    background: var(--text-mut);
  }
  .cpu-t {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-mut);
  }

  /* save */
  .save {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 15px;
    background: #241a12;
    border: 1px solid #5a3f1f;
    border-radius: 9px;
    color: #f5c878;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    flex: none;
    white-space: nowrap;
  }
  .save-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--amber);
    box-shadow: 0 0 7px var(--amber);
  }
</style>
