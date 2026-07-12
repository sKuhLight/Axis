<script lang="ts">
  import { editor } from '../../editor.svelte';
  import { history } from '../../history.svelte';

  const rows = $derived(history.entries.map((e, i) => ({ e, i })).reverse().slice(0, 80));
  const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false });
</script>

<section class="hist">
  <header>
    <div>
      <h2>History</h2>
      <p>{editor.preset ? `${String(editor.preset.number).padStart(3, '0')} · ${editor.preset.name || '(unnamed)'}` : 'No preset'}</p>
    </div>
    <button onclick={() => history.undo()} disabled={!history.canUndo}>Undo</button>
    <button onclick={() => history.redo()} disabled={!history.canRedo}>Redo</button>
  </header>

  {#if rows.length === 0}
    <div class="empty">No edits recorded yet.</div>
  {:else}
    <div class="list">
      {#each rows as { e, i } (e.id)}
        <button class="row" class:undone={i >= history.cursor} onclick={() => e.undoable && i < history.cursor && history.revertTo(i)}>
          <span class="mono">{time(e.t)}</span>
          <span>{e.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .hist {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg2);
    color: var(--text);
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid var(--border);
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 15px;
  }
  p {
    color: var(--textdim);
    font-size: 11px;
  }
  header div {
    flex: 1;
    min-width: 0;
  }
  button {
    border: 1px solid var(--border2);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text2);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  header button {
    height: 30px;
    padding: 0 10px;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px;
  }
  .row {
    width: 100%;
    display: flex;
    gap: 8px;
    margin-bottom: 3px;
    padding: 7px 8px;
    text-align: left;
    font-size: 12px;
  }
  .row.undone {
    opacity: 0.45;
  }
  .mono {
    color: var(--textdim);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .empty {
    flex: 1;
    display: grid;
    place-items: center;
    color: var(--textdim);
    font-size: 12px;
  }
</style>
