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

  function pick(id: string, label: string) {
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
    editor.conn.state === 'online'
      ? 'var(--ok)'
      : editor.conn.state === 'offline'
        ? 'var(--danger)'
        : 'var(--amber)'
  );
</script>

<nav class="rail">
  <div class="logo" aria-label="Axis">
    <svg width="30" height="30" viewBox="0 0 30 30">
      <circle cx="9" cy="9" r="3.4" fill="#35c9d6" />
      <circle cx="21" cy="9" r="3.4" fill="#4f6bed" />
      <circle cx="15" cy="21" r="3.4" fill="#f5a623" />
      <path d="M9 9 L21 9 L15 21 Z" fill="none" stroke="#3a3a44" stroke-width="1.6" />
    </svg>
  </div>
  {#each RAIL as r}
    <button class="item" class:active={editor.railActive === r.id} title={r.label} onclick={() => pick(r.id, r.label)}>
      <span class="ic">{r.icon}</span>
      <span class="sh">{r.short}</span>
    </button>
  {/each}
  <div class="spacer"></div>
  {#if editor.cloud.enabled}
    <button class="item" class:active={editor.cloudOpen} title={editor.cloud.user ? `Cloud · ${editor.cloud.user.email}` : 'Cloud sync — sign in'} onclick={() => (editor.cloudOpen = true)}>
      <span class="ic">☁</span>
      <span class="sh">{editor.cloud.user ? 'Synced' : 'Cloud'}</span>
    </button>
  {/if}
  <button class="conn" title="Connection — click to pick the port" onclick={() => editor.openPorts()}>
    <span class="led" style="background:{dot}; box-shadow:0 0 8px {dot}"></span>
    <span class="mono fw">{editor.conn.fw ? `FW${editor.conn.fw}` : editor.conn.state === 'offline' ? 'OFF' : '···'}</span>
  </button>
</nav>

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
    color: #cfcfd6;
  }
  .item.active {
    color: var(--accent);
    background: rgba(53, 201, 214, 0.12);
    border-color: rgba(53, 201, 214, 0.3);
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
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: #161619;
    border: 1px solid #2e2e36;
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
    color: #ededf2;
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
    color: #cfcfd6;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .pp-auto.on {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(53, 201, 214, 0.1);
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
    color: #cfcfd6;
    cursor: pointer;
    text-align: left;
  }
  .pp-row:hover {
    background: var(--surface-2);
  }
  .pp-row.on {
    border-color: var(--accent);
    background: rgba(53, 201, 214, 0.1);
  }
  .pp-row.fr {
    color: #ededf2;
  }
  .pp-kind {
    flex: none;
    font: 700 8px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: #7a7a83;
    background: #1a1a1f;
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
  .led {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .fw {
    font-size: 8px;
    color: #4a4a52;
  }
  /* phones: slim icon-only rail to reclaim width */
  @media (max-width: 760px) {
    .rail {
      width: 46px;
    }
    .item .sh {
      display: none;
    }
  }
</style>
