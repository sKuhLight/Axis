<script lang="ts">
  // Preset history panel — the changelog of the active preset with undo/redo. Entries above the
  // cursor (undone) render dimmed and can be redone; markers (saves) and barriers (buffer loads)
  // are separators. "⟲ here" reverts to just before that entry (sequential undo, stops on failure).
  import { editor } from './editor.svelte';
  import { history } from './history.svelte';

  function close() { history.panelOpen = false; }
  const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false });
  // newest first for display; keep the real index for cursor math
  const rows = $derived(history.entries.map((e, i) => ({ e, i })).reverse());
</script>

{#if history.panelOpen}
  <div class="bg" role="presentation" onclick={close}>
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') close(); }}>
      <header>
        <h2>History</h2>
        <span class="sub mono">{editor.preset ? `${String(editor.preset.number).padStart(3, '0')} · ${editor.preset.name || '(unnamed)'}` : 'no preset'}</span>
        <span class="spacer"></span>
        <button class="act" onclick={() => history.undo()} disabled={!history.canUndo} title="Ctrl+Z">↶ Undo</button>
        <button class="act" onclick={() => history.redo()} disabled={!history.canRedo} title="Ctrl+Shift+Z">↷ Redo</button>
        <button class="x" aria-label="Close" onclick={close}>✕</button>
      </header>

      {#if !editor.layout.crcValid}
        <div class="dirty">Edit buffer differs from the stored preset — Save to keep your changes.</div>
      {/if}

      {#if rows.length === 0}
        <p class="empty">No edits recorded yet — turn a knob, move a block…</p>
      {:else}
        <div class="list">
          {#each rows as { e, i } (e.id)}
            {#if e.undoable}
              <div class="row" class:undone={i >= history.cursor}>
                <span class="t mono">{time(e.t)}</span>
                <span class="lbl">{e.label}</span>
                {#if i < history.cursor}
                  <button class="rv" title="Revert to before this edit" onclick={() => history.revertTo(i)}>⟲ here</button>
                {/if}
              </div>
            {:else}
              <div class="mark" class:barrier={e.barrier}>
                <span class="t mono">{time(e.t)}</span>
                <span class="lbl">{e.barrier ? '⛔ ' : '💾 '}{e.label}</span>
              </div>
            {/if}
          {/each}
        </div>
        <footer>
          <span class="cnt mono">{history.entries.length} entries</span>
          <span class="spacer"></span>
          <button class="clear" onclick={() => history.clear()}>Clear history</button>
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: grid; place-items: center; z-index: 60; }
  .card { width: min(560px, 94vw); max-height: 86vh; display: flex; flex-direction: column; background: var(--panel, #1b1c20);
    color: var(--fg, #e8e8ea); border: 1px solid var(--line, #33343a); border-radius: 12px; padding: 0 16px 12px; }
  header { flex: none; display: flex; align-items: center; gap: 10px; padding: 14px 0 10px; border-bottom: 1px solid var(--line, #33343a); }
  h2 { margin: 0; font-size: 16px; }
  .sub { opacity: 0.6; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spacer { flex: 1; }
  .act { border: 1px solid var(--line, #33343a); border-radius: 8px; background: transparent; color: var(--fg, #e8e8ea);
    font-size: 12px; padding: 5px 10px; cursor: pointer; }
  .act:hover:not(:disabled) { background: var(--surface-2, #26272c); }
  .act:disabled { opacity: 0.35; cursor: default; }
  .x { width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent; color: var(--text-mut, #9a9aa3);
    cursor: pointer; font-size: 13px; }
  .x:hover { background: var(--surface-2, #26272c); }
  .dirty { flex: none; margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: 11.5px;
    background: rgba(245, 166, 35, 0.12); border: 1px solid rgba(245, 166, 35, 0.35); color: #f5a623; }
  .empty { padding: 26px 4px; text-align: center; color: var(--text-mut, #9a9aa3); font-size: 12.5px; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding: 10px 0; }
  .row, .mark { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; font-size: 12.5px; }
  .row:hover { background: var(--surface-2, #26272c); }
  .row.undone { opacity: 0.42; }
  .t { flex: none; font-size: 10.5px; color: var(--text-mut, #9a9aa3); }
  .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv { flex: none; border: 0; border-radius: 6px; background: transparent; color: var(--accent, #35c9d6);
    font-size: 11px; cursor: pointer; padding: 3px 7px; visibility: hidden; }
  .row:hover .rv { visibility: visible; }
  .rv:hover { background: var(--accent-tint, rgba(53, 201, 214, 0.12)); }
  .mark { color: var(--text-mut, #9a9aa3); font-size: 11.5px; border-top: 1px dashed var(--line, #33343a); border-radius: 0; }
  .mark.barrier { color: #f5a623; }
  footer { flex: none; display: flex; align-items: center; padding-top: 8px; border-top: 1px solid var(--line, #33343a); }
  .cnt { font-size: 10.5px; color: var(--text-mut, #9a9aa3); }
  .clear { border: 0; background: transparent; color: var(--danger, #d6543f); font-size: 11.5px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
  .clear:hover { background: rgba(214, 84, 63, 0.12); }
  .mono { font-family: var(--font-mono, 'JetBrains Mono', monospace); }
</style>
