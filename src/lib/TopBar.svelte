<script lang="ts">
  import { editor } from './editor.svelte';

  // ── inline scene rename (active scene) ──
  let editingScene = $state(false);
  let draftName = $state('');
  const startRename = () => {
    draftName = editor.sceneNames[editor.scene - 1]?.trim() ?? '';
    editingScene = true;
  };
  const commitName = () => {
    if (!editingScene) return; // Escape already cancelled
    editingScene = false;
    const v = draftName.trim();
    if (v !== (editor.sceneNames[editor.scene - 1]?.trim() ?? '')) editor.renameScene(editor.scene, v);
  };
  const onNameKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); // blur → commit
    else if (e.key === 'Escape') editingScene = false; // cancel (blur fires but commit is guarded)
  };
  const focusSel = (el: HTMLInputElement) => { el.focus(); el.select(); };

  // ── inline preset rename ──
  let editingPreset = $state(false);
  let draftPreset = $state('');
  const startRenamePreset = () => {
    draftPreset = editor.preset?.name ?? '';
    editingPreset = true;
  };
  const commitPreset = () => {
    if (!editingPreset) return;
    editingPreset = false;
    const v = draftPreset.trim();
    if (v && v !== (editor.preset?.name ?? '')) editor.renamePreset(v);
  };
  const onPresetKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
    else if (e.key === 'Escape') editingPreset = false;
  };

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
  // global output level: the FM3's Preset Leveling meters (fn 0x19, Output 1 & 2 × L/R), pushed over SSE
  // in real dB (−40…0), server-smoothed. Shows the main output (Output 1 L/R); Output 2 appears only when
  // it's actually carrying signal (above the −40 floor). Costs no per-block serial reads.
  const dbFill = (db: number) => Math.max(0, Math.min(100, Math.round(((db + 40) / 40) * 100))); // −40..0 → 0..100%
  const io = $derived(editor.levels);
  const out2Active = $derived(!!io && (io.out2L > -39.5 || io.out2R > -39.5));
  const lvlColor = (db: number) => (db >= -1 ? '#d6543f' : db >= -6 ? '#f5a623' : '#33c46b');
</script>

<header class="topbar" class:mob={editor.isMobile}>
  <!-- left region (scrolls if cramped) -->
  <div class="left scroll">
    {#if editor.isMobile}
      <button class="burger" aria-label="Menu" onclick={() => (editor.drawerOpen = true)}>
        <span></span><span></span><span></span>
      </button>
    {/if}

    <div class="preset">
      <button class="pbtn l" title="Previous preset" onclick={() => editor.stepPreset(-1)}>‹</button>
      {#if editingPreset}
        <div class="pset editing">
          <span class="mono tag">PRE</span>
          <span class="mono num">{pnum}</span>
          <input class="pname-in mono" bind:value={draftPreset} maxlength="32" placeholder="Preset name" use:focusSel onkeydown={onPresetKey} onblur={commitPreset} />
        </div>
      {:else}
        <button class="pset" onclick={() => (editor.presetOpen = true)}>
          <span class="mono tag">PRE</span>
          <span class="mono num">{pnum}</span>
          <span class="pname">{pname}</span>
          <span class="caret">▾</span>
        </button>
      {/if}
      {#if editor.canRenamePresets && editor.preset && !editingPreset}
        <button class="prename" title="Rename preset" aria-label="Rename preset" onclick={startRenamePreset}>✎</button>
      {/if}
      <button class="pbtn r" title="Next preset" onclick={() => editor.stepPreset(1)}>›</button>
    </div>

    {#if !editor.isMobile && editor.sceneCount > 0}
      <div class="scenes">
        <span class="mono scn-lbl">SCN</span>
        <div class="scn-group">
          {#each Array(editor.sceneCount) as _, i}
            {@const s = i + 1}
            <button class="scn" class:on={editor.scene === s} title={editor.sceneName(s)} onclick={() => editor.selectScene(s)}>{s}</button>
          {/each}
        </div>
        {#if editor.canRenameScenes}
          {#if editingScene}
            <input
              class="scn-name-in mono"
              bind:value={draftName}
              maxlength="32"
              placeholder="Scene {editor.scene} name"
              use:focusSel
              onkeydown={onNameKey}
              onblur={commitName}
            />
          {:else}
            <button
              class="scn-name"
              class:empty={!editor.sceneNames[editor.scene - 1]?.trim()}
              title="Rename scene {editor.scene}"
              onclick={startRename}
            >{editor.sceneNames[editor.scene - 1]?.trim() || 'name…'}</button>
          {/if}
        {/if}
      </div>
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

    <button class="addblk" class:icon={editor.isMobile} title="Add block" onclick={() => { editor.paletteMode = 'place'; editor.paletteOpen = true; }}>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="5" fill="none" stroke="var(--accent)" stroke-width="1.6" />
        <path d="M10.6 10.6 L14 14" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      {#if !editor.isMobile}Add block<span class="mono kbd">⌘K</span>{/if}
    </button>

    {#if !editor.isMobile && (editor.hasTuner || editor.hasTempo || editor.conn.state === 'online')}
      <div class="status">
        {#if editor.hasTuner}
          <button class="st" class:on={editor.tuner.active} title="Tuner" onclick={() => editor.toggleTuner()}>
            <span class="note">♪</span><span class="mono st-lbl">{editor.tuner.active ? editor.tuner.note ?? '…' : 'TUNE'}</span>
          </button>
        {/if}
        {#if editor.hasTempo}
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
        {/if}
        <div class="st cpu link" title="Device link round-trip latency">
          <span class="mono st-lbl">LINK</span>
          <div class="bar"><div class="fill" style="width:{linkPct}%; background:{linkColor}"></div></div>
          <span class="mono cpu-t" style="color:{linkColor}">{editor.linkMs != null ? editor.linkMs + 'ms' : '—'}</span>
        </div>
        {#if cpu != null}
          <div class="st cpu load" title="Live CPU load (decoded from the device meters frame)">
            <span class="mono st-lbl">CPU</span>
            <div class="bar"><div class="fill" style="width:{pk(cpu / 100)}%; background:{cpuColor}"></div></div>
            <span class="mono cpu-t" style="color:{cpuColor}">{cpu.toFixed(1)}%</span>
          </div>
        {/if}
        {#if io}
          {@const pkDb = Math.max(io.out1L, io.out1R)}
          <div class="st io" title="Live output level — FM3 Preset Leveling meters (Output 1{out2Active ? ' + 2' : ''}, L/R), in dB">
            <span class="mono st-lbl">OUT{out2Active ? '1' : ''}</span>
            <div class="bar"><div class="fill" style="width:{dbFill(io.out1L)}%; background:{lvlColor(io.out1L)}"></div></div>
            <div class="bar"><div class="fill" style="width:{dbFill(io.out1R)}%; background:{lvlColor(io.out1R)}"></div></div>
            {#if out2Active}
              <span class="mono st-lbl">2</span>
              <div class="bar"><div class="fill" style="width:{dbFill(io.out2L)}%; background:{lvlColor(io.out2L)}"></div></div>
              <div class="bar"><div class="fill" style="width:{dbFill(io.out2R)}%; background:{lvlColor(io.out2R)}"></div></div>
            {/if}
            <span class="mono cpu-t" style="color:{lvlColor(pkDb)}">{pkDb <= -39.5 ? '−40' : (pkDb > 0 ? '+' : '') + pkDb.toFixed(0)}dB</span>
          </div>
        {/if}
        {#if editor.canMeterBlocks}
          <button
            class="st mtr-tgl mono"
            class:on={editor.meteringOn}
            title="Per-block audio meters — polls the OPEN block's level once per ~0.5s. Off by default; the global output meter above is always live."
            onclick={() => (editor.meteringOn = !editor.meteringOn)}
          >▊ METER {editor.meteringOn ? 'ON' : 'OFF'}</button>
        {/if}
      </div>
    {/if}

    <button class="save" title="Store the edit buffer to a preset" onclick={() => editor.openSave()}>
      <span class="save-dot"></span>Save
    </button>
  </div>
</header>

<style>
  .topbar {
    position: relative;
    /* Extend up into the iOS status-bar / notch safe area; the bar's own background fills it so the
       controls sit cleanly below the clock/battery instead of under them. 0 off native (env → 0). */
    height: calc(60px + var(--axis-safe-top));
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: var(--axis-safe-top) 16px 0;
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
    color: var(--accentbright);
    cursor: pointer;
    font-size: 12px;
  }
  .up-x:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.06);
  }
  .topbar.mob {
    gap: 8px;
    padding: var(--axis-safe-top) 12px 0;
  }
  .left {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    overflow: hidden; /* the top bar never scrolls/swipes — content fits, the preset name truncates */
  }
  .burger {
    flex: none;
    width: 42px;
    height: 42px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 11px;
    cursor: pointer;
  }
  .burger span {
    width: 17px;
    height: 2px;
    border-radius: 2px;
    background: var(--text2);
  }
  .burger:active {
    background: var(--surface2);
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
    min-width: 0; /* allow the name to truncate rather than overflow the bar */
  }
  /* on mobile the preset cluster fills the row so the name ellipsis-truncates cleanly (no scroll) */
  .topbar.mob .preset {
    flex: 1;
  }
  .topbar.mob .pset {
    flex: 1;
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
  .pset.editing {
    border-color: var(--accent);
    cursor: default;
  }
  .pname-in {
    font-size: 13px;
    font-weight: 600;
    width: 150px;
    color: var(--text);
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
  }
  .prename {
    flex: none;
    width: 30px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--panel-2);
    border: 1px solid var(--border-2);
    border-radius: 4px;
    color: var(--text-mut);
    cursor: pointer;
    font-size: 13px;
  }
  .prename:hover {
    border-color: var(--border-strong);
    color: var(--text);
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
  .scn-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2, var(--text-dim));
    max-width: 140px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 3px 6px;
    cursor: text;
  }
  .scn-name:hover {
    border-color: var(--surface-3);
    color: var(--text);
  }
  .scn-name.empty {
    color: var(--text-mut);
    font-style: italic;
  }
  .scn-name-in {
    font-size: 12px;
    font-weight: 600;
    width: 140px;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 3px 6px;
    outline: none;
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
  .addblk.icon {
    width: 42px;
    height: 42px;
    padding: 0;
    justify-content: center;
  }
  .kbd {
    font-size: 10px;
    font-weight: 600;
    color: var(--accent-border);
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
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
  .mtr-tgl {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .mtr-tgl.on {
    color: #33c46b;
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
  /* separators between telemetry items — a border on each non-first item, so items can be hidden
     from the right at narrow widths without leaving a dangling divider */
  .status > .st + .st {
    border-left: 1px solid var(--surface2);
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
    transition: width 80ms linear; /* glide between meter updates so bars read smooth, not steppy */
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
    border: 1px solid var(--amber-border);
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

  /* narrower desktop windows: shed telemetry from the right so the preset picker + scenes never get
     squeezed out of the bar. Order dropped: CPU meter → LINK meter → tempo. Tuner, preset, scenes,
     add-block and save always stay. */
  @media (max-width: 1320px) {
    .status .load {
      display: none;
    }
  }
  @media (max-width: 1180px) {
    .status .link {
      display: none;
    }
  }
  @media (max-width: 1060px) {
    .status .tempo {
      display: none;
    }
    .view {
      display: none;
    }
  }
</style>
