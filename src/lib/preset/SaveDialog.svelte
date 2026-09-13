<script lang="ts">
  import { deviceSession, presetBuffer } from '$lib/editor/editorClients.svelte';
  import { editorViewport } from '$lib/editor/editorClients.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
  import Button from '$lib/ui/Button.svelte';

  let target = $state(0);
  $effect(() => {
    if (presetBuffer.saveOpen) target = presetBuffer.saveTarget;
  });
  const maxSlot = $derived(Math.max(0, deviceSession.presetCount - 1));
  // Bank-letter devices (caps presets.addressing === 'bankLetter') address locations as A01..Z04.
  const bankCode = (n: number) => `${String.fromCharCode(65 + Math.floor(n / 4))}${String((n % 4) + 1).padStart(2, '0')}`;
  const pad = $derived((n: number) => (deviceSession.bankLetterAddressing ? bankCode(n) : String(n).padStart(3, '0')));
  const overwritingCurrent = $derived(deviceSession.preset?.number === target);
  const mob = $derived(editorViewport.isMobile);
  // Buffer loaded from a local Presets/ file → offer writing the edits back to that file too.
  const src = $derived(presetBuffer.bufferSource);
</script>

<Dialog
  overlay="save"
  open={presetBuffer.saveOpen}
  onClose={() => (presetBuffer.saveOpen = false)}
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
        <Button size="md" class="disk" onclick={() => presetBuffer.saveLocalFile()}>💾 Save to disk — Presets/{src.path}</Button>
        <div class="or"><span>or store to a device slot</span></div>
      {:else}
        <p class="body">
          Store the current edit buffer to a preset location on the device.
          <strong>This overwrites whatever is in that location.</strong>
        </p>
      {/if}
      <form class="frm" onsubmit={(e) => { e.preventDefault(); presetBuffer.save(target); }}>
        <label class="field">
          <span class="lbl mono">SAVE TO</span>
          <input class="num mono" type="number" min="0" max={maxSlot} bind:value={target} />
          {#if deviceSession.bankLetterAddressing}<span class="code mono">{bankCode(target)}</span>{/if}
        </label>
        <p class="hint">
          {#if overwritingCurrent}
            Overwrites the current preset <b>{pad(target)}</b>{deviceSession.preset?.name ? ` · ${deviceSession.preset.name}` : ''}.
          {:else}
            Writes to preset <b>{pad(target)}</b> (not the one loaded — verify it's a slot you can overwrite).
          {/if}
        </p>
        <p class="beta mono">⚠ Destructive — overwrites this slot on the unit.</p>
        <div class="actions">
          <Button variant="secondary" size="md" class="sd-cancel" onclick={() => (presetBuffer.saveOpen = false)}>Cancel</Button>
          <Button variant="amber" size="md" type="submit">{src ? `Save to device ${pad(target)}` : `Save to ${pad(target)}`}</Button>
        </div>
      </form>
  </div>
</Dialog>

<style>
  /* card frame comes from Dialog; this is the layout-only remainder of the old `.card`.
     The mobile bottom-sheet's safe-area padding is added by Dialog on the card itself. */
  .wrap { padding: 20px; }
  /* Form exists so Enter submits Save; strip the UA margin. */
  .frm { margin: 0; }
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
     BlockLibrarySaveDialog's cancel button, preserved rather than silently homogenized.
     `!important`: Button's own `.b[data-variant='secondary']` rule outranks a plain `:global(.x)`
     class on specificity alone, so a normal override here would silently lose to it. */
  :global(.sd-cancel) {
    background: var(--surface) !important;
  }
  /* save-to-disk (local-file write-back) — safe action, accent-colored, full width above the slot
     form. Same specificity note as .sd-cancel above. */
  :global(.disk) {
    display: block;
    width: 100%;
    margin: 0 0 14px;
    background: var(--surface2) !important;
    border: 1px solid var(--accent-border) !important;
    color: var(--accent) !important;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.disk:hover) {
    background: var(--accent-tint) !important;
    border-color: var(--accent) !important;
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
