<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { forgefx } from '$lib/forgefx';

  let { children } = $props();

  type Conn = { state: 'connecting' | 'online' | 'offline'; fw?: string; device?: string };
  let conn = $state<Conn>({ state: 'connecting' });

  const rail = [
    { id: 'grid', icon: '▦', label: 'Signal Grid' },
    { id: 'presets', icon: '☰', label: 'Presets' },
    { id: 'library', icon: '◫', label: 'Library' },
    { id: 'tuner', icon: '𝅘𝅥', label: 'Tuner' },
    { id: 'settings', icon: '⚙', label: 'Settings' }
  ];
  let active = $state('grid');

  async function poll() {
    try {
      const h = await forgefx.health();
      const fw = await forgefx.firmware().catch(() => undefined);
      conn = { state: 'online', fw: fw?.version, device: h.device };
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
      <button
        class="rail-item"
        class:active={active === r.id}
        title={r.label}
        onclick={() => (active = r.id)}
      >
        <span class="ic">{r.icon}</span>
        <span class="lbl">{r.label.split(' ')[0]}</span>
      </button>
    {/each}
    <div class="spacer"></div>
    <div class="conn" title={conn.device ?? conn.state}>
      <span class="led" style="background:{dot}; box-shadow:0 0 8px {dot}"></span>
      <span class="mono fw">{conn.fw ? `FW${conn.fw}` : conn.state}</span>
    </div>
  </nav>

  <!-- Main column -->
  <div class="main">
    <header class="topbar">
      <div class="title">Axis</div>
      <div class="sub mono">ForgeFX · FM3</div>
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
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    height: var(--topbar-h);
    flex: none;
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 0 18px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-2);
  }
  .title {
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.01em;
  }
  .sub {
    font-size: 11px;
    color: var(--text-mut);
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
