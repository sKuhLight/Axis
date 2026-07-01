<script lang="ts">
  // Persistent bottom bar. Left: the hover-hint for the parameter/control under the cursor (falls back to
  // the current selection / connection state). Right: Ko-fi support link · copyright · imprint.
  import { editor } from './editor.svelte';
  import { LEGAL, openExternal } from './legal';
  import { KOFI_URL, COPYRIGHT } from './support';

  const left = $derived(
    editor.hint ??
      (editor.selected ? editor.selected.display : editor.conn.state === 'online' ? 'Ready' : editor.conn.state === 'offline' ? 'Device offline' : 'Connecting…')
  );
</script>

<footer class="sb">
  <div class="left" data-tour="statushint" title={left}>{left}</div>
  <div class="right">
    <button class="kofi" onclick={() => openExternal(KOFI_URL)} title="Support Axis development on Ko-fi">☕ Support on Ko-fi</button>
    <span class="sep"></span>
    <span class="cr">{COPYRIGHT}</span>
    <span class="sep"></span>
    <button class="lnk" onclick={() => openExternal(LEGAL.imprint)}>Imprint</button>
  </div>
</footer>

<style>
  .sb {
    flex: none;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
    background: var(--bg-rail, #0d0d10);
    border-top: 1px solid var(--border, #26262c);
    font-size: 11px;
    color: var(--text-mut, #8a8a94);
    user-select: none;
  }
  .left {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    color: #9a9aa3;
  }
  .right { flex: none; display: flex; align-items: center; gap: 10px; }
  .kofi { background: none; border: none; color: #13c3ff; font-size: 11px; font-weight: 700; cursor: pointer; padding: 0; }
  .kofi:hover { filter: brightness(1.12); }
  .lnk { background: none; border: none; color: var(--text-mut, #8a8a94); font-size: 11px; cursor: pointer; padding: 0; }
  .lnk:hover { color: #cfcfd6; }
  .cr { color: #56565e; }
  .sep { width: 3px; height: 3px; border-radius: 50%; background: #3a3a44; }
  @media (max-width: 640px) {
    .cr { display: none; }
  }
</style>
