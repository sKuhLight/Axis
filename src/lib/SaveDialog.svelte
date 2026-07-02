<script lang="ts">
  import { editor } from './editor.svelte';

  let target = $state(0);
  $effect(() => {
    if (editor.saveOpen) target = editor.saveTarget;
  });
  const pad = (n: number) => String(n).padStart(3, '0');
  const overwritingCurrent = $derived(editor.preset?.number === target);
  const mob = $derived(editor.isMobile);
</script>

{#if editor.saveOpen}
  <div class="bg" class:mob role="presentation" onclick={() => (editor.saveOpen = false)}>
    <div class="card" class:mob role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="head">
        <span class="dot"></span>
        <span class="title">Save preset</span>
      </div>
      <p class="body">
        Store the current edit buffer to a preset location on the FM3.
        <strong>This overwrites whatever is in that location.</strong>
      </p>
      <label class="field">
        <span class="lbl mono">SAVE TO</span>
        <input class="num mono" type="number" min="0" max="511" bind:value={target} />
      </label>
      <p class="hint">
        {#if overwritingCurrent}
          Overwrites the current preset <b>{pad(target)}</b>{editor.preset?.name ? ` · ${editor.preset.name}` : ''}.
        {:else}
          Writes to preset <b>{pad(target)}</b> (not the one loaded — verify it's a slot you can overwrite).
        {/if}
      </p>
      <p class="beta mono">⚠ save is unverified on FM3 — confirm the result on the unit</p>
      <div class="actions">
        <button class="btn cancel" onclick={() => (editor.saveOpen = false)}>Cancel</button>
        <button class="btn save" onclick={() => editor.save(target)}>Save to {pad(target)}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bg {
    position: absolute;
    inset: 0;
    z-index: 210;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    animation: axsOverlay 0.12s ease;
  }
  .card {
    width: 420px;
    max-width: 100%;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    padding: 20px;
    animation: axsPalette 0.15s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .bg.mob {
    align-items: flex-end;
    padding: 0;
  }
  .card.mob {
    width: 100%;
    max-width: 100%;
    border-radius: 18px 18px 0 0;
    padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
    animation: axsSheet 0.28s cubic-bezier(0.2, 0.85, 0.25, 1);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--amber);
    box-shadow: 0 0 7px var(--amber);
  }
  .title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }
  .body {
    font-size: 13px;
    color: var(--text-dim);
    line-height: 1.5;
    margin: 0 0 16px;
  }
  .body strong {
    color: #f5c878;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .lbl {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-mut);
    letter-spacing: 0.12em;
  }
  .num {
    flex: 1;
    height: 42px;
    padding: 0 14px;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    border-radius: 10px;
    color: var(--amber);
    font: 700 16px/1 var(--font-mono);
    outline: none;
  }
  .num:focus {
    border-color: var(--accent);
  }
  .hint {
    font-size: 12px;
    color: var(--text-mut);
    margin: 0 0 10px;
  }
  .hint b {
    color: var(--text);
  }
  .beta {
    font-size: 10px;
    color: var(--amber);
    margin: 0 0 16px;
  }
  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  .btn {
    height: 40px;
    padding: 0 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .cancel {
    background: var(--surface);
    border: 1px solid var(--border-2);
    color: var(--text-dim);
  }
  .cancel:hover {
    border-color: var(--border-strong);
  }
  .save {
    background: var(--surface2);
    border: 1px solid var(--amber-border);
    color: #f5c878;
  }
  .save:hover {
    border-color: var(--amber-border);
  }
</style>
