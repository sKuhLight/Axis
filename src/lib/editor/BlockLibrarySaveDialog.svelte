<script lang="ts">
  // Save-to-library overlay: asks for a block name and whether to save the current channel only or
  // all channels, then hands off to the parent (which calls forgefx.saveBlockLibraryBlock).
  let {
    open,
    defaultName,
    libraryPath,
    onSave,
    onClose,
  }: {
    open: boolean;
    defaultName: string;
    libraryPath: string;
    onSave: (name: string, scope: 'current' | 'all') => Promise<string | null>;
    onClose: () => void;
  } = $props();

  let name = $state('');
  let scope = $state<'current' | 'all'>('current');
  let saving = $state(false);
  let error = $state('');
  let nameEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open) {
      name = defaultName;
      scope = 'current';
      error = '';
      nameEl?.focus();
    }
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation(); // don't let the central Escape handler close the block editor too
      onClose();
    }
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    saving = true;
    error = '';
    const message = await onSave(trimmed, scope);
    saving = false;
    if (message) error = message;
    else onClose();
  }
</script>

{#if open}
  <div class="overlay">
    <button class="bg" type="button" aria-label="Close save dialog" onclick={() => onClose()}></button>
    <div class="card" role="dialog" aria-modal="true" tabindex="-1" onkeydown={onKeydown}>
      <div class="head">
        <span class="dot"></span>
        <span class="title">Save block to library</span>
      </div>
      {#if !libraryPath}
        <p class="body">
          No block library folder is set. Choose one under
          <b class="mono">Settings → Storage → Block library</b> first.
        </p>
      {:else}
        <p class="body">
          Saves <b>{defaultName}</b> into <b class="mono">{libraryPath}</b>. The editor derives the
          category folder and timestamp.
        </p>
      {/if}
      <label class="field">
        <span class="lbl mono">NAME</span>
        <input class="name mono" type="text" maxlength="40" bind:value={name} bind:this={nameEl} placeholder="Block name" onkeydown={(e) => { if (e.key === 'Enter') void submit(); }} />
      </label>
      <label class="field">
        <span class="lbl mono">CHANNELS</span>
        <select class="sel mono" bind:value={scope}>
          <option value="current">Current channel only</option>
          <option value="all">All channels</option>
        </select>
      </label>
      <p class="hint">
        {scope === 'current'
          ? 'Writes the current channel and resets the other three to their defaults.'
          : 'Writes all four channels exactly as they are now.'}
      </p>
      {#if error}
        <p class="error mono">{error}</p>
      {/if}
      <div class="actions">
        <button class="btn cancel" onclick={() => onClose()}>Cancel</button>
        <button class="btn save" disabled={!name.trim() || !libraryPath || saving} onclick={() => void submit()}>
          {saving ? 'Saving…' : 'Save to library'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    animation: axsOverlay 0.12s ease;
  }
  .bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(3px);
    border: 0;
    cursor: default;
    animation: axsOverlay 0.12s ease;
  }
  .card {
    position: relative;
    width: 380px;
    max-width: 100%;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    padding: 20px;
    animation: axsPalette 0.15s cubic-bezier(0.2, 0.8, 0.3, 1);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }
  .title {
    font-weight: 700;
    font-size: var(--d-font-lg);
    color: var(--text);
  }
  .body {
    margin: 0;
    font-size: var(--d-font-sm);
    color: var(--text-dim);
    line-height: 1.4;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: calc(var(--d-font-sm) * 0.95);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lbl {
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: var(--text-mut);
  }
  .name,
  .sel {
    height: var(--d-ctl-h);
    padding: 0 12px;
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 10px;
    color: var(--text);
    font: 600 var(--d-font) var(--font-mono);
    outline: none;
  }
  .name:focus,
  .sel:focus {
    border-color: var(--accent);
  }
  .hint {
    margin: 0;
    font-size: var(--d-font-sm);
    color: var(--text-dim);
  }
  .error {
    margin: 0;
    font-size: var(--d-font-sm);
    color: var(--danger);
  }
  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 2px;
  }
  .btn {
    height: var(--d-ctl-h);
    padding: 0 16px;
    border-radius: 10px;
    border: 1px solid var(--border2);
    cursor: pointer;
    font-weight: 700;
    font-size: var(--d-font);
  }
  .btn.cancel {
    background: var(--bg2);
    color: var(--text-dim);
  }
  .btn.cancel:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .btn.save {
    background: var(--accent);
    color: #0b0b0d;
    border-color: transparent;
  }
  .btn.save:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .btn.save:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
