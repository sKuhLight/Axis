<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { forgefx } from '$lib/forgefx';

  let { children } = $props();

  type Conn = { state: 'connecting' | 'online' | 'offline'; fw?: string; device?: string };
  let conn = $state<Conn>({ state: 'connecting' });
  let preset = $state<{ number: number; name: string } | null>(null);
  let scene = $state(1);

  const rail = [
    { id: 'grid', icon: '▦', label: 'Signal Grid' },
    { id: 'presets', icon: '☰', label: 'Presets' },
    { id: 'library', icon: '◫', label: 'Library' },
    { id: 'tuner', icon: '♪', label: 'Tuner' },
    { id: 'settings', icon: '⚙', label: 'Settings' }
  ];
  let active = $state('grid');

  async function poll() {
    try {
      const h = await forgefx.health();
      const dev = await forgefx.device().catch(() => null);
      conn = { state: 'online', fw: dev?.firmware?.version, device: h.device };
      // 0x0D returns -1 on a transient failure / modified edit buffer; keep the
      // last good preset rather than flashing "-1".
      const p = await forgefx.currentPreset().catch(() => null);
      if (p && p.number >= 0) preset = p;
    } catch {
      conn = { state: 'offline' };
    }
  }
  onMount(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  });

  const dot = $derived(
    conn.state === 'online' ? 'var(--ok)' : conn.state === 'offline' ? 'var(--danger)' : 'var(--amber)'
  );
</script>

<div class="app">
  <!-- Tool rail -->
  <nav class="rail">
    <div class="logo" aria-label="Axis">
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="9" cy="9" r="3.4" fill="#35c9d6" />
        <circle cx="21" cy="9" r="3.4" fill="#4f6bed" />
        <circle cx="15" cy="21" r="3.4" fill="#f5a623" />
        <path d="M9 9 L21 9 L15 21 Z" fill="none" stroke="#3a3a44" stroke-width="1.6" />
      </svg>
    </div>
    {#each rail as r}
      <button class="rail-item" class:active={active === r.id} title={r.label} onclick={() => (active = r.id)}>
        <span class="ic">{r.icon}</span>
        <span class="lbl">{r.label.split(' ')[0]}</span>
      </button>
    {/each}
    <div class="spacer"></div>
    <div class="conn" title={conn.device ?? conn.state}>
      <span class="led" style="background:{dot}; box-shadow:0 0 8px {dot}"></span>
      <span class="mono fw">{conn.fw ? `FW${conn.fw}` : conn.state === 'offline' ? 'OFF' : '···'}</span>
    </div>
  </nav>

  <!-- Main column -->
  <div class="main">
    <header class="topbar">
      <!-- preset cluster -->
      <div class="preset-cluster">
        <button class="pbtn left" title="Previous preset">‹</button>
        <button class="pset">
          <span class="mono tag">PRE</span>
          <span class="mono num">{preset && preset.number >= 0 ? preset.number : '—'}</span>
          <span class="pname">{preset?.name || (conn.state === 'online' ? '—' : 'offline')}</span>
          <span class="caret">▾</span>
        </button>
        <button class="pbtn right" title="Next preset">›</button>
      </div>

      <!-- scenes -->
      <div class="scenes">
        <span class="mono scn-lbl">SCN</span>
        <div class="scn-group">
          {#each [1, 2, 3, 4, 5, 6, 7, 8] as s}
            <button class="scn" class:on={scene === s} onclick={() => (scene = s)}>{s}</button>
          {/each}
        </div>
      </div>

      <div class="spacer"></div>

      <button class="addblk">
        <svg width="15" height="15" viewBox="0 0 16 16"
          ><circle cx="7" cy="7" r="5" fill="none" stroke="#35c9d6" stroke-width="1.6" /><path
            d="M10.6 10.6 L14 14"
            stroke="#35c9d6"
            stroke-width="1.6"
            stroke-linecap="round"
          /></svg
        >
        <span class="addlbl">Add block</span>
        <span class="mono kbd">⌘K</span>
      </button>

      <div class="meters">
        <button class="mbtn" title="Tuner">♪</button>
        <div class="tempo" title="Tempo"><span class="mono bpm">120</span><span class="bpmlbl">BPM</span></div>
      </div>

      <button class="save"><span class="save-dot"></span>Save</button>
    </header>

    <div class="content scroll">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .app {
    position: fixed;
    inset: 0;
    display: flex;
    overflow: hidden;
  }
  /* rail */
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
  .rail-item {
    width: 48px;
    height: 48px;
    border: 0;
    border-radius: var(--r-md);
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
  .rail-item:hover {
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .rail-item.active {
    background: var(--surface-2);
    color: var(--accent);
  }
  .ic {
    font-size: 19px;
    line-height: 1;
  }
  .lbl {
    font-size: 8.5px;
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .conn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 0;
  }
  .led {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .fw {
    font-size: 8px;
    color: var(--text-faint);
  }

  /* main */
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    height: 60px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-2);
  }

  /* preset cluster */
  .preset-cluster {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pbtn {
    width: 34px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #121214;
    border: 1px solid var(--border-2);
    color: var(--text-dim);
    font-size: 15px;
    cursor: pointer;
  }
  .pbtn.left {
    border-radius: 9px 4px 4px 9px;
  }
  .pbtn.right {
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
    color: var(--text);
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
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    width: 24px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-mut);
    font: 600 12px/1 var(--font-mono);
    cursor: pointer;
  }
  .scn:hover {
    color: var(--text);
  }
  .scn.on {
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* add block */
  .addblk {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 12px;
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 9px;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }
  .addblk:hover {
    border-color: var(--accent);
  }
  .kbd {
    font-size: 10px;
    font-weight: 600;
    color: #5e8a8c;
    background: #0d1516;
    border: 1px solid #234142;
    border-radius: 5px;
    padding: 3px 5px;
  }

  /* meters */
  .meters {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .mbtn {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #121214;
    border: 1px solid var(--border-2);
    border-radius: 9px;
    color: var(--text-dim);
    font-size: 16px;
    cursor: pointer;
  }
  .mbtn:hover {
    border-color: var(--border-strong);
  }
  .tempo {
    display: flex;
    align-items: baseline;
    gap: 4px;
    height: 38px;
    padding: 0 12px;
    background: #121214;
    border: 1px solid var(--border-2);
    border-radius: 9px;
  }
  .bpm {
    font-size: 13px;
    font-weight: 700;
  }
  .bpmlbl {
    font-size: 9px;
    color: var(--text-mut);
    font-weight: 600;
  }

  /* save */
  .save {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 14px;
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 9px;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .save-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--amber);
    box-shadow: 0 0 7px var(--amber);
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  /* hide non-essential top-bar items on narrow screens */
  @media (max-width: 720px) {
    .meters,
    .addlbl,
    .kbd {
      display: none;
    }
    .scenes {
      display: none;
    }
  }
</style>
