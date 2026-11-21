<script lang="ts">
  import { untrack } from 'svelte';
  import { editor } from './editor.svelte';
  import { checkSaveTarget, saveBlockedText, seedOnOpen, slotRangeWarning } from './saveTarget';

  // `null` = no slot chosen. Seeded from `editor.saveTarget` (set by `openSave` from a FRESH device read) ONLY
  // on the closed → open transition: the poll replaces `editor.preset` every few seconds, so seeding on every
  // re-evaluation would reset what the user typed (and could silently move the target). The reads inside the
  // effect are untracked on purpose.
  let target = $state<number | null>(null);
  let wasOpen = false;
  $effect(() => {
    const open = editor.saveOpen;
    const next = seedOnOpen({ wasOpen, value: untrack(() => target) }, open, () => untrack(() => editor.saveTarget));
    wasOpen = next.wasOpen;
    target = next.value;
  });
  // Only a valid, explicit slot enables Save — with the current preset unknown there is nothing to default to.
  const check = $derived(checkSaveTarget(target));
  // The slot the device reported as current when the dialog was opened (null = unknown / unverified).
  const cur = $derived(editor.saveCurrent);
  const overwritingCurrent = $derived(check.ok && cur !== null && cur === check.slot);
  const curName = $derived(cur !== null && editor.preset?.number === cur ? editor.preset.name : '');
  // Advisory only: the reported slot count can be wrong for a device, so a higher slot is warned about, never blocked.
  const rangeWarning = $derived(check.ok ? slotRangeWarning(check.slot, editor.caps?.presets?.count) : null);
  // Bank-letter devices (caps presets.addressing === 'bankLetter') address locations as A01..Z04.
  const bankCode = (n: number) => `${String.fromCharCode(65 + Math.floor(n / 4))}${String((n % 4) + 1).padStart(2, '0')}`;
  const pad = $derived((n: number) => (editor.bankLetterAddressing ? bankCode(n) : String(n).padStart(3, '0')));
  const mob = $derived(editor.isMobile);
  // Buffer loaded from a local Presets/ file → offer writing the edits back to that file too.
  const src = $derived(editor.bufferSource);
</script>

{#if editor.saveOpen}
  <div class="bg" class:mob role="presentation" onclick={() => (editor.saveOpen = false)}>
    <div class="card" class:mob role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="head">
        <span class="dot"></span>
        <span class="title">Save preset</span>
      </div>
      {#if src}
        <p class="body">
          This preset was loaded from your local folder. Save the edits back to
          <b class="mono">{src.path}</b> on disk — or store them to a device slot below.
        </p>
        <button class="btn disk" onclick={() => editor.saveLocalFile()}>💾 Save to disk — Presets/{src.path}</button>
        <div class="or"><span>or store to a device slot</span></div>
      {:else}
        <p class="body">
          Store the current edit buffer to a preset location on the device.
          <strong>This overwrites whatever is in that location.</strong>
        </p>
      {/if}
      <label class="field">
        <span class="lbl mono">SAVE TO</span>
        <input class="num mono" type="number" min="0" placeholder="slot" bind:value={target} />
        {#if editor.bankLetterAddressing && check.ok}<span class="code mono">{bankCode(check.slot)}</span>{/if}
      </label>
      <p class="hint" class:warn={!check.ok}>
        {#if !check.ok}
          {saveBlockedText(check.reason, cur !== null)}
        {:else if overwritingCurrent && editor.presetLiveQuery}
          Overwrites the current preset <b>{pad(check.slot)}</b>{curName ? ` · ${curName}` : ''}.
        {:else if overwritingCurrent}
          Overwrites preset <b>{pad(check.slot)}</b> — the last one selected here. This device can't report its current preset, so verify it's the one you mean.
        {:else if cur === null}
          Writes to preset <b>{pad(check.slot)}</b>. The loaded preset is unknown — verify it's a slot you can overwrite.
        {:else}
          Writes to preset <b>{pad(check.slot)}</b> (not the one loaded — verify it's a slot you can overwrite).
        {/if}
      </p>
      {#if rangeWarning}<p class="hint warn">{rangeWarning}</p>{/if}
      <p class="beta mono">⚠ Destructive — overwrites this slot on the unit.</p>
      <div class="actions">
        <button class="btn cancel" onclick={() => (editor.saveOpen = false)}>Cancel</button>
        <button
          class="btn save"
          disabled={!check.ok}
          onclick={() => { if (check.ok) void editor.save(check.slot); }}
        >{src ? 'Save to device' : 'Save to'} {check.ok ? pad(check.slot) : 'slot'}</button>
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
    padding: 20px 18px calc(20px + var(--axis-safe-bottom));
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
  .hint.warn {
    color: var(--amber);
  }
  .save:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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
  /* save-to-disk (local-file write-back) — safe action, accent-colored, full width above the slot form */
  .disk {
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
  .disk:hover {
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
