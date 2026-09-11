<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
  import Button from '$lib/ui/Button.svelte';

  let target = $state(0);
  $effect(() => {
    if (editor.saveOpen) target = editor.saveTarget;
  });
  const maxSlot = $derived(Math.max(0, editor.presetCount - 1));
  // Bank-letter devices (caps presets.addressing === 'bankLetter') address locations as A01..Z04.
  const bankCode = (n: number) => `${String.fromCharCode(65 + Math.floor(n / 4))}${String((n % 4) + 1).padStart(2, '0')}`;
  const pad = $derived((n: number) => (editor.bankLetterAddressing ? bankCode(n) : String(n).padStart(3, '0')));
  const overwritingCurrent = $derived(editor.preset?.number === target);
  const mob = $derived(editor.isMobile);
  // Buffer loaded from a local Presets/ file → offer writing the edits back to that file too.
  const src = $derived(editor.bufferSource);
</script>

<Dialog
  overlay="save"
  open={editor.saveOpen}
  onClose={() => (editor.saveOpen = false)}
  size="sm"
  accent="amber"
  sheet={mob}
  labelledBy="save-dlg-title"
  class="save-dlg"
>
  <div class="wrap">
      <div class="head" id="save-dlg-title">
        <span class="dot"></span>
        <span class="title">Save preset</span>
      </div>
      {#if src}
        <p class="body">
          This preset was loaded from your local folder. Save the edits back to
          <b class="mono">{src.path}</b> on disk — or store them to a device slot below.
        </p>
        <Button size="md" class="disk" onclick={() => editor.saveLocalFile()}>💾 Save to disk — Presets/{src.path}</Button>
        <div class="or"><span>or store to a device slot</span></div>
      {:else}
        <p class="body">
          Store the current edit buffer to a preset location on the device.
          <strong>This overwrites whatever is in that location.</strong>
        </p>
      {/if}
      <label class="field">
        <span class="lbl mono">SAVE TO</span>
        <input class="num mono" type="number" min="0" max={maxSlot} bind:value={target} />
        {#if editor.bankLetterAddressing}<span class="code mono">{bankCode(target)}</span>{/if}
      </label>
      <p class="hint">
        {#if overwritingCurrent}
          Overwrites the current preset <b>{pad(target)}</b>{editor.preset?.name ? ` · ${editor.preset.name}` : ''}.
        {:else}
          Writes to preset <b>{pad(target)}</b> (not the one loaded — verify it's a slot you can overwrite).
        {/if}
      </p>
      <p class="beta mono">⚠ Destructive — overwrites this slot on the unit.</p>
      <div class="actions">
        <Button variant="secondary" size="md" class="sd-cancel" onclick={() => (editor.saveOpen = false)}>Cancel</Button>
        <Button variant="amber" size="md" onclick={() => editor.save(target)}>{src ? `Save to device ${pad(target)}` : `Save to ${pad(target)}`}</Button>
      </div>
  </div>
</Dialog>

<style>
  /* card frame comes from Dialog; this is the layout-only remainder of the old `.card`.
     The mobile bottom-sheet's safe-area padding is added by Dialog on the card itself. */
  .wrap { padding: 20px; }
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
  .code {
    flex: none;
    padding: 0 10px;
    font: 700 14px/1 var(--font-mono);
    color: var(--accent);
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
  /* SaveDialog's cancel button kept its pre-Button `--surface` background (one shade lighter
     than the shared secondary variant's `--bg2`) — a pre-existing, harmless inconsistency with
     BlockLibrarySaveDialog's cancel button, preserved rather than silently homogenized. */
  :global(.sd-cancel) {
    background: var(--surface);
  }
  /* save-to-disk (local-file write-back) — safe action, accent-colored, full width above the slot form */
  :global(.disk) {
    display: block;
    width: 100%;
    margin: 0 0 14px;
    background: var(--surface2);
    border: 1px solid var(--accent-border);
    color: var(--accent);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.disk:hover) {
    background: var(--accent-tint);
    border-color: var(--accent);
  }
  .or {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 14px;
    font-size: 10px;
    color: var(--text-mut);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-2, var(--border2));
  }
  .body b.mono {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 12px;
  }
</style>
