<script lang="ts">
  // Save-to-library overlay: asks for a block name and whether to save the current channel only or
  // all channels, then hands off to the parent (which calls forgefx.saveBlockLibraryBlock).
  import Dialog from '$lib/ui/Dialog.svelte';

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

<Dialog {open} onClose={onClose} width="380px" labelledBy="blsd-title" class="bl-save-dlg">
  <div class="wrap">
      <div class="head" id="blsd-title">
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
</Dialog>

<style>
  /* card frame comes from Dialog; this is the layout-only remainder of the old `.card`. */
  .wrap {
    padding: 20px;
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
