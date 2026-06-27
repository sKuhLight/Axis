<script lang="ts">
  import { editor } from './editor.svelte';

  const RAIL = [
    { id: 'build', label: 'Build', short: 'Grid', icon: '▦' },
    { id: 'controllers', label: 'Controllers', short: 'Ctrl', icon: '⊜' },
    { id: 'fc', label: 'Footswitches', short: 'FC', icon: '⬚' },
    { id: 'scenes', label: 'Scene Mgr', short: 'Scn', icon: '❏' },
    { id: 'perform', label: 'Perform', short: 'Live', icon: '▷' },
    { id: 'sets', label: 'Sets & Songs', short: 'Sets', icon: '≣' },
    { id: 'settings', label: 'Settings', short: 'Setup', icon: '⚙' }
  ];

  function pick(id: string, label: string) {
    editor.railActive = id;
    if (id !== 'build') editor.showToast(label + ' — coming soon', '#35c9d6');
  }

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
  <div class="conn" title={editor.conn.device ?? editor.conn.state}>
    <span class="led" style="background:{dot}; box-shadow:0 0 8px {dot}"></span>
    <span class="mono fw">{editor.conn.fw ? `FW${editor.conn.fw}` : editor.conn.state === 'offline' ? 'OFF' : '···'}</span>
  </div>
</nav>

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
    padding: 6px 0;
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
</style>
