<script lang="ts">
  import { editor } from './editor.svelte';

  const pnum = $derived(editor.preset && editor.preset.number >= 0 ? String(editor.preset.number).padStart(3, '0') : '—');
  const pname = $derived(editor.preset?.name || (editor.conn.state === 'online' ? '—' : 'offline'));

  // link latency readout (fallback when no live CPU is available, e.g. AM4)
  const ms = $derived(editor.linkMs);
  const linkColor = $derived(ms == null ? '#56565e' : ms < 40 ? '#33c46b' : ms < 120 ? '#f5a623' : '#d6543f');
  const linkPct = $derived(ms == null ? 0 : Math.max(10, Math.min(100, 100 - ms / 2)));

  // live CPU% (decoded from the device meters frame) + audio level meters
  const cpu = $derived(editor.cpu);
  const cpuColor = $derived(cpu == null ? '#56565e' : cpu >= 80 ? '#d6543f' : cpu >= 62 ? '#f5a623' : '#33c46b');
  const pk = (x: number) => Math.max(0, Math.min(100, Math.round(x * 100)));
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
          <button class="scn" class:on={editor.scene === s} onclick={() => editor.selectScene(s)}>{s}</button>
        {/each}
      </div>
    </div>

    {#if editor.isMobile}
      <!-- tuner + tap-tempo live here on mobile (the desktop status strip is hidden) -->
      <button class="mbtn" class:on={editor.tuner.active} onclick={() => editor.toggleTuner()} title="Tuner">♪ {editor.tuner.active ? (editor.tuner.note ?? '…') : 'Tune'}</button>
      <button class="mbtn" onclick={() => editor.tapTempo()} title="Tap tempo">{editor.bpm}<span class="mono"> BPM</span></button>
    {/if}
  </div>

  <!-- center: new-version notification (desktop) -->
  {#if !editor.isMobile && editor.autoUpdate.state !== 'idle'}
    <div class="update">
      <span class="up-dot"></span>
      {#if editor.autoUpdate.state === 'available'}
        <span class="up-txt">Update <b>v{editor.autoUpdate.version}</b> available</span>
        <button class="up-go" onclick={() => editor.downloadUpdate()}>Download &amp; install</button>
      {:else if editor.autoUpdate.state === 'downloading'}
        <span class="up-txt">Downloading update… <b>{editor.autoUpdate.percent ?? 0}%</b></span>
      {:else if editor.autoUpdate.state === 'downloaded'}
        <span class="up-txt">Update <b>v{editor.autoUpdate.version}</b> ready</span>
        <button class="up-go" onclick={() => editor.installUpdate()}>Restart &amp; install</button>
      {/if}
    </div>
  {:else if !editor.isMobile && editor.update}
    <div class="update">
      <span class="up-dot"></span>
      <span class="up-txt">New version <b>v{editor.update.version}</b> available</span>
      <a class="up-go" href={editor.update.url} target="_blank" rel="noopener noreferrer">Update ↗</a>
      <button class="up-x" aria-label="Dismiss" onclick={() => editor.dismissUpdate()}>✕</button>
    </div>
  {/if}

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
        <button class="st" class:on={editor.tuner.active} title="Tuner" onclick={() => editor.toggleTuner()}>
          <span class="note">♪</span><span class="mono st-lbl">{editor.tuner.active ? editor.tuner.note ?? '…' : 'TUNE'}</span>
        </button>
        <div class="div"></div>
        <div class="st tempo" title="Tempo — type to set, TAP to tap">
          <input
            class="mono bpm"
            type="number"
            min="20"
            max="250"
            value={editor.bpm}
            onchange={(e) => editor.setBpm(Number((e.currentTarget as HTMLInputElement).value))}
          />
          <button class="taplbl mono st-lbl" title="Tap tempo" onclick={() => editor.tapTempo()}>TAP</button>
        </div>
        <div class="div"></div>
        <div class="st cpu" title="Device link round-trip latency">
          <span class="mono st-lbl">LINK</span>
          <div class="bar"><div class="fill" style="width:{linkPct}%; background:{linkColor}"></div></div>
          <span class="mono cpu-t" style="color:{linkColor}">{editor.linkMs != null ? editor.linkMs + 'ms' : '—'}</span>
        </div>
        {#if cpu != null}
          <div class="div"></div>
          <div class="st cpu" title="Live CPU load (decoded from the device meters frame)">
            <span class="mono st-lbl">CPU</span>
            <div class="bar"><div class="fill" style="width:{pk(cpu / 100)}%; background:{cpuColor}"></div></div>
            <span class="mono cpu-t" style="color:{cpuColor}">{cpu.toFixed(1)}%</span>
          </div>
        {/if}
        <!-- audio meters pulled: bytes 35/36/588 fluctuate even with no signal → not level meters.
             Needs a clean silence-vs-signal capture to find the real (peak/RMS) field. -->
      </div>
    {/if}

    <button class="save" title="Store the edit buffer to a preset (beta)" onclick={() => editor.openSave()}>
      <span class="save-dot"></span>Save
    </button>
  </div>
</header>

<style>
  .topbar {
    position: relative;
    height: 60px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }

  /* new-version pill, centered in the bar */
  .update {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 9px;
    height: 34px;
    padding: 0 6px 0 13px;
    max-width: 46%;
    border-radius: 10px;
    background: linear-gradient(180deg, var(--accent-tint), var(--accent-tint));
    border: 1px solid var(--accent-border);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  }
  .up-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 7px var(--accent);
  }
  .up-txt {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--accentbright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .up-txt b {
    color: var(--text);
  }
  .up-go {
    flex: none;
    font-size: 12px;
    font-weight: 700;
    color: var(--accent-ink);
    background: var(--accent);
    padding: 6px 10px;
    border-radius: 7px;
    text-decoration: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
  }
  .up-go:hover {
    filter: brightness(1.08);
  }
  .up-x {
    flex: none;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #7fb3b6;
    cursor: pointer;
    font-size: 12px;
  }
  .up-x:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.06);
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
    background: var(--surface);
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
    color: var(--text);
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
    color: var(--textfaint);
    font: 700 11px/1 var(--font-mono);
    cursor: pointer;
  }
  .scn.on {
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* mobile tuner / tempo buttons (desktop status strip is hidden on phones) */
  .mbtn {
    flex: none;
    height: 30px;
    padding: 0 11px;
    border-radius: 8px;
    border: 1px solid var(--surface-3);
    background: var(--panel-2);
    color: var(--text2);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  .mbtn.on {
    background: rgba(53, 201, 214, 0.16);
    border-color: var(--accent-border);
    color: var(--accent);
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
    color: var(--textdim);
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
    background: linear-gradient(180deg, var(--accent-tint), var(--accent-tint));
    border: 1px solid var(--accent-border);
    border-radius: 10px;
    color: var(--accentbright);
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
    background: var(--accent-tint);
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
    background: var(--track);
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
  button.st.on {
    background: var(--surface2);
  }
  button.st.on .note,
  button.st.on .st-lbl {
    color: var(--accent);
  }
  .tempo {
    gap: 7px;
    cursor: default;
  }
  .bpm {
    width: 38px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    background: transparent;
    border: 0;
    padding: 0;
    text-align: right;
    font-family: var(--font-mono);
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .bpm::-webkit-outer-spin-button,
  .bpm::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .bpm:focus {
    outline: none;
    color: var(--accent);
  }
  .taplbl {
    background: var(--track);
    border: 1px solid var(--surface-3);
    border-radius: 5px;
    padding: 3px 5px;
    cursor: pointer;
  }
  .taplbl:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .div {
    width: 1px;
    background: var(--surface2);
    flex: none;
  }
  .cpu {
    cursor: default;
  }
  .bar {
    width: 40px;
    height: 6px;
    background: var(--track);
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
    background: var(--surface2);
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
