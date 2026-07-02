<script lang="ts">
  import { editor } from './editor.svelte';

  const RAIL = [
    { id: 'build', label: 'Build', short: 'Grid', icon: '▦' },
    { id: 'library', label: 'Preset Browser', short: 'Lib', icon: '≣' },
    { id: 'controllers', label: 'Controllers', short: 'Ctrl', icon: '⊜' },
    { id: 'fc', label: 'Footswitches', short: 'FC', icon: '⬚' },
    { id: 'scenes', label: 'Scene Mgr', short: 'Scn', icon: '❏' },
    { id: 'perform', label: 'Perform', short: 'Live', icon: '▷' },
    { id: 'sets', label: 'Sets & Songs', short: 'Sets', icon: '≣' },
    { id: 'settings', label: 'Settings', short: 'Setup', icon: '⚙' }
  ];

  // Rail items backed by a virtual effect: "the block editor pointed at effectId N".
  const VIRTUAL: Record<string, { eid: number; slug: string; name: string }> = {
    settings: { eid: 1, slug: 'global', name: 'Setup' },
    controllers: { eid: 2, slug: 'controllers', name: 'Controllers' },
    fc: { eid: 199, slug: 'fc', name: 'Footswitches' }
  };

  const closeDrawer = () => (editor.drawerOpen = false);

  function pick(id: string, label: string) {
    closeDrawer(); // mobile: dismiss the drawer on any nav pick
    if (id === 'build') {
      editor.openBuild();
      return;
    }
    if (id === 'library') {
      editor.openLibrary();
      return;
    }
    const v = VIRTUAL[id];
    if (v) {
      editor.railActive = id;
      editor.openVirtual(v.eid, v.slug, v.name);
      return;
    }
    // not-yet-built screens stay un-highlighted and just announce WIP
    editor.showToast(label + ' — coming soon', '#35c9d6');
  }

  // USB-MIDI units (Axe-Fx III / FM9) expose In + Out as separate ports — pick one and pair the
  // matching opposite-direction port by name stem (e.g. "Axe-Fx III MIDI In" ⇄ "… MIDI Out").
  const stem = (s: string) =>
    s.toLowerCase().replace(/\b(midi|usb)\b/g, '').replace(/\b(in|out|input|output|rx|tx)\b/g, '').replace(/\s+/g, ' ').trim();
  type Port = { transport: 'serial' | 'midi'; id: string; dir?: 'input' | 'output' };
  function pickConn(p: Port) {
    if (p.transport !== 'midi') {
      editor.pickPort({ transport: 'serial', id: p.id });
      return;
    }
    const opp = editor.ports.filter((o) => o.transport === 'midi' && o.dir !== p.dir);
    const mate = opp.find((o) => stem(o.id) === stem(p.id)) ?? opp[0];
    const inId = p.dir === 'input' ? p.id : (mate?.id ?? p.id); // ForgeFX receives here (device's "Out")
    const outId = p.dir === 'output' ? p.id : (mate?.id ?? p.id); // ForgeFX sends here (device's "In")
    editor.pickPort({ transport: 'midi', id: p.id, inId, outId });
  }
  const rowSel = (p: Port) => {
    const c = editor.portChosen;
    return !!c && c.transport === p.transport && (c.id === p.id || c.inId === p.id || c.outId === p.id);
  };

  const dot = $derived(
    editor.conn.state === 'online' ? 'var(--ok)' : editor.conn.state === 'offline' ? 'var(--danger)' : 'var(--amber)'
  );
  const connText = $derived(
    editor.conn.state === 'online' ? `Connected${editor.conn.fw ? ` · FW ${editor.conn.fw}` : ''}` : editor.conn.state === 'offline' ? 'Offline' : 'Connecting…'
  );
</script>

{#if !editor.isMobile}
  <!-- ── desktop tool rail ── -->
  <nav class="rail">
    <div class="logo" aria-label="Axis">
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="9" cy="9" r="3.4" fill="#35c9d6" />
        <circle cx="21" cy="9" r="3.4" fill="#4f6bed" />
        <circle cx="15" cy="21" r="3.4" fill="#f5a623" />
        <path d="M9 9 L21 9 L15 21 Z" fill="none" stroke="var(--border3)" stroke-width="1.6" />
      </svg>
    </div>
    {#each RAIL as r}
      <button class="item" data-tour={r.id} class:active={editor.railActive === r.id} title={r.label} onclick={() => pick(r.id, r.label)}>
        <span class="ic">{r.icon}</span>
        <span class="sh">{r.short}</span>
      </button>
    {/each}
    <div class="spacer"></div>
    {#if editor.isAm4}
      <button class="item" class:active={editor.am4ToolsOpen} title="AM4 Tools — preset backup/restore, .syx decode, firmware validate, modifiers" onclick={() => (editor.am4ToolsOpen = true)}>
        <span class="ic">⛃</span>
        <span class="sh">AM4</span>
      </button>
    {/if}
    <button class="item" class:active={editor.themeOpen} title="Appearance — theme, accent & scale" onclick={() => (editor.themeOpen = true)}>
      <span class="ic">◐</span>
      <span class="sh">Theme</span>
    </button>
    <button class="item acct" data-tour="axis" class:active={editor.axisOpen} title={editor.cloud.user ? `Axis · ${editor.cloud.user.email}` : 'Axis — account, privacy & about'} onclick={() => editor.openAxis('account')}>
      {#if editor.cloud.user}
        <span class="av">{editor.cloud.user.email.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?'}</span>
        {#if editor.cloud.syncing}<span class="syncdot"></span>{/if}
      {:else}
        <span class="ic">◈</span>
      {/if}
      <span class="sh">Axis</span>
    </button>
    <button class="conn" data-tour="conn" title="Connection — click to pick the port" onclick={() => editor.openPorts()}>
      <span class="led" style="background:{dot}; box-shadow:0 0 8px {dot}"></span>
      <span class="mono fw">{editor.conn.fw ? `FW${editor.conn.fw}` : editor.conn.state === 'offline' ? 'OFF' : '···'}</span>
    </button>
  </nav>
{:else if editor.drawerOpen}
  <!-- ── mobile nav drawer (replaces the rail) ── -->
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="scrim" onclick={closeDrawer} role="presentation"></div>
  <aside class="drawer">
    <div class="d-head">
      <svg width="26" height="26" viewBox="0 0 30 30" class="d-logo">
        <circle cx="9" cy="9" r="3.4" fill="#35c9d6" />
        <circle cx="21" cy="9" r="3.4" fill="#4f6bed" />
        <circle cx="15" cy="21" r="3.4" fill="#f5a623" />
      </svg>
      <div class="d-title">
        Axis
        <div class="d-sub"><span class="d-led" style="background:{dot}"></span>{connText}</div>
      </div>
      <button class="d-x" aria-label="Close menu" onclick={closeDrawer}>✕</button>
    </div>

    <div class="d-body scroll">
      <div class="d-nav">
        {#each RAIL as r}
          <button class="d-item" class:active={editor.railActive === r.id} onclick={() => pick(r.id, r.label)}>
            <span class="d-ic">{r.icon}</span><span class="d-lbl">{r.label}</span>
          </button>
        {/each}
      </div>

      <div class="d-sec">SCENE</div>
      <div class="d-scenes">
        {#each [1, 2, 3, 4, 5, 6, 7, 8] as s}
          <button class="d-scn" class:on={editor.scene === s} onclick={() => editor.selectScene(s)}>{s}</button>
        {/each}
      </div>

      <div class="d-sec">DEFAULT VIEW</div>
      <div class="d-seg">
        <button class:on={editor.globalMode === 'basic'} onclick={() => editor.setGlobalMode('basic')}>Basic</button>
        <button class:on={editor.globalMode === 'advanced'} onclick={() => editor.setGlobalMode('advanced')}>Advanced</button>
      </div>

      <div class="d-sec">STATUS</div>
      <div class="d-status">
        <button class="d-stat" class:on={editor.tuner.active} onclick={() => { editor.toggleTuner(); closeDrawer(); }}>
          <span class="d-stat-ic">♪</span><span>Tuner</span><span class="d-stat-v mono">{editor.tuner.active ? (editor.tuner.note ?? '…') : ''}</span>
        </button>
        <button class="d-stat" onclick={() => editor.tapTempo()}>
          <span class="d-stat-ic">◷</span><span>Tap tempo</span><span class="d-stat-v mono">{editor.bpm} BPM</span>
        </button>
      </div>
    </div>

    <div class="d-foot">
      <button class="d-foot-b" onclick={() => { closeDrawer(); editor.themeOpen = true; }}><span class="d-ic">◐</span>Theme</button>
      <button class="d-foot-b" onclick={() => { closeDrawer(); editor.openAxis('account'); }}>
        <span class="d-ic">◈</span>{editor.cloud.user ? 'Account' : 'Sign in'}
      </button>
      <button class="d-foot-b" onclick={() => { closeDrawer(); editor.openPorts(); }}><span class="d-led" style="background:{dot}"></span>Connection</button>
    </div>
  </aside>
{/if}

{#if editor.portsOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="ppbg" onclick={() => (editor.portsOpen = false)}></div>
  <div class="pp">
    <div class="pp-h">
      <span>Connection</span>
      <button class="pp-x" aria-label="Close" onclick={() => (editor.portsOpen = false)}>✕</button>
    </div>
    <div class="pp-note">Auto-detect picks a Fractal device. Override here if it grabs the wrong port — or for a USB-MIDI unit (Axe-Fx III).</div>
    <button class="pp-auto" class:on={!editor.portOverride} onclick={() => editor.pickPort(null)}>✦ Auto-detect</button>
    <div class="pp-list">
      {#each editor.ports as p (p.transport + ':' + (p.dir ?? '') + ':' + p.id)}
        {@const sel = rowSel(p)}
        <button class="pp-row" class:on={sel} class:fr={p.fractal} onclick={() => pickConn(p)}>
          <span class="pp-kind" class:midi={p.transport === 'midi'}>{p.transport === 'midi' ? (p.dir === 'output' ? 'M·OUT' : 'M·IN') : 'SER'}</span>
          <span class="pp-label">{p.label}</span>
          {#if p.fractal}<span class="pp-star" title="Fractal device">★</span>{/if}
          {#if sel}<span class="pp-dot">●</span>{/if}
        </button>
      {/each}
      {#if editor.ports.length === 0}<div class="pp-empty">No ports found — connect the unit.</div>{/if}
    </div>
    <button class="pp-adv" onclick={() => { editor.portsOpen = false; editor.openAxis('device'); }}>Advanced — force device profile &amp; MIDI in/out →</button>
  </div>
{/if}

<style>
  .rail {
    width: var(--rail-w);
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 13px 0;
    background: var(--bg-rail);
    border-right: 1px solid var(--border);
    z-index: 10;
  }
  .logo {
    margin-bottom: 10px;
  }
  .item {
    width: 52px;
    height: 50px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: var(--text-mut);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .item:hover {
    background: var(--surface-2);
    color: var(--text2);
  }
  .item.active {
    color: var(--accent);
    background: var(--accent-tint);
    border-color: var(--accent-border);
  }
  .acct { position: relative; }
  .av {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accentink);
    font: 800 11px/28px 'JetBrains Mono', monospace;
    text-align: center;
  }
  .syncdot {
    position: absolute;
    top: 6px;
    right: 9px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--amber);
    border: 2px solid var(--surface, var(--bg2));
    box-shadow: 0 0 6px var(--amber);
  }
  .ic {
    font-size: 19px;
    line-height: 1;
  }
  .sh {
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .spacer {
    flex: 1;
  }
  .conn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    width: 52px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
  }
  .conn:hover {
    background: var(--surface-2);
    border-color: var(--surface-3);
  }
  .led {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .fw {
    font-size: 8px;
    color: var(--border3);
  }

  /* ── mobile drawer ── */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(6, 6, 8, 0.6);
    backdrop-filter: blur(3px);
    animation: axsOverlay 0.14s ease;
  }
  .drawer {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 151;
    width: 286px;
    max-width: 84vw;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    border-right: 1px solid var(--border2);
    box-shadow: 8px 0 44px rgba(0, 0, 0, 0.55);
    animation: axsDrawer 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
    padding-top: env(safe-area-inset-top);
  }
  .d-head {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 18px 16px 15px;
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .d-logo { flex: none; }
  .d-title {
    flex: 1;
    min-width: 0;
    font-size: 16px;
    font-weight: 800;
    color: var(--text);
  }
  .d-sub {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    color: var(--textdim);
    margin-top: 2px;
  }
  .d-led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .d-x {
    flex: none;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 9px;
    background: var(--bg2);
    color: var(--textdim);
    font-size: 14px;
    cursor: pointer;
  }
  .d-x:active { background: var(--surface2); }
  .d-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 12px 8px;
  }
  .d-nav {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .d-item {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 46px;
    padding: 0 13px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: transparent;
    color: var(--text2);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }
  .d-item:active { background: var(--surface2); }
  .d-item.active {
    color: var(--accent);
    background: var(--accent-tint);
    border-color: var(--accent-border);
  }
  .d-ic {
    font-size: 18px;
    width: 22px;
    text-align: center;
    flex: none;
  }
  .d-sec {
    font: 700 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: var(--textfaint);
    margin: 16px 4px 9px;
  }
  .d-scenes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px;
  }
  .d-scn {
    height: 40px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--textdim);
    font: 700 13px/1 var(--font-mono);
    cursor: pointer;
  }
  .d-scn.on {
    background: var(--accent);
    color: var(--accentink);
    border-color: var(--accent);
  }
  .d-seg {
    display: flex;
    gap: 6px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 11px;
    padding: 4px;
  }
  .d-seg button {
    flex: 1;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--textdim);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .d-seg button.on {
    background: var(--accent);
    color: var(--accentink);
  }
  .d-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .d-stat {
    display: flex;
    align-items: center;
    gap: 11px;
    height: 44px;
    padding: 0 13px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--surface);
    color: var(--text2);
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }
  .d-stat.on {
    color: var(--accent);
    background: var(--accent-tint);
    border-color: var(--accent-border);
  }
  .d-stat-ic { font-size: 16px; width: 20px; text-align: center; flex: none; }
  .d-stat-v {
    margin-left: auto;
    font-size: 12px;
    font-weight: 700;
    color: var(--textdim);
  }
  .d-foot {
    flex: none;
    display: flex;
    gap: 6px;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }
  .d-foot-b {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px 4px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--surface);
    color: var(--text2);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .d-foot-b:active { background: var(--surface2); }

  /* connection picker popover */
  .ppbg {
    position: fixed;
    inset: 0;
    z-index: 300;
  }
  .pp {
    position: fixed;
    left: calc(var(--rail-w) + 8px);
    bottom: 12px;
    z-index: 301;
    width: 340px;
    max-width: calc(100vw - 24px);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    padding: 12px;
    animation: axsPalette 0.14s ease;
  }
  .pp-h {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 6px;
  }
  .pp-x {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-mut);
    cursor: pointer;
    font-size: 13px;
  }
  .pp-x:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .pp-note {
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-mut);
    margin-bottom: 10px;
  }
  .pp-auto {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 11px;
    margin-bottom: 8px;
    border-radius: 9px;
    border: 1px solid var(--surface-3);
    background: var(--panel-2);
    color: var(--text2);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .pp-auto.on {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-tint);
  }
  .pp-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }
  .pp-row {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 9px 11px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text2);
    cursor: pointer;
    text-align: left;
  }
  .pp-row:hover {
    background: var(--surface-2);
  }
  .pp-row.on {
    border-color: var(--accent);
    background: var(--accent-tint);
  }
  .pp-row.fr {
    color: var(--text);
  }
  .pp-kind {
    flex: none;
    font: 700 8px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: var(--textfaint);
    background: var(--surface2);
    border: 1px solid var(--border-2);
    border-radius: 5px;
    padding: 4px 5px;
  }
  .pp-kind.midi {
    color: #9b6ef5;
    border-color: #3a2c5a;
  }
  .pp-label {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pp-star {
    flex: none;
    color: var(--amber);
    font-size: 11px;
  }
  .pp-dot {
    flex: none;
    color: var(--accent);
    font-size: 10px;
  }
  .pp-empty {
    padding: 18px 8px;
    text-align: center;
    color: var(--text-faint);
    font-size: 12px;
  }
  .pp-adv {
    margin-top: 8px;
    width: 100%;
    padding: 8px;
    background: none;
    border: none;
    border-top: 1px solid var(--border-2, var(--border2));
    color: var(--accent);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
  }
  .pp-adv:hover {
    filter: brightness(1.15);
  }
  /* on phones the connection popover is centered near the bottom, not anchored to the (hidden) rail */
  @media (max-width: 760px) {
    .pp {
      left: 12px;
      right: 12px;
      width: auto;
    }
  }
</style>
