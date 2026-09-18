<script lang="ts">
  // Save-as-template overlay: writes the CURRENT edit buffer (unsaved edits included) into the
  // templates folder as `<name>.syx`. Mirrors the New-from-template picker's shape — it is the
  // write half of the same folder. A name that already exists turns into an explicit replace.
  import Dialog from '$lib/ui/Dialog.svelte';
  import DialogBody from '$lib/ui/DialogBody.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { overlays } from '$lib/overlay/overlays.svelte';
  import { presetTemplates } from './presetTemplates.svelte';
  import { normalizeTemplateName, templateNameProblem } from './templateName';

  const open = $derived(overlays.isOpen('presetTemplateSave'));
  const close = () => overlays.close('presetTemplateSave');

  let name = $state('');
  let saving = $state(false);
  let error = $state('');
  let exists = $state(false);

  $effect(() => {
    if (!open) return;
    name = normalizeTemplateName(presetTemplates.defaultTemplateName);
    saving = false;
    error = '';
    exists = false;
  });

  const problem = $derived(templateNameProblem(name));
  const canSave = $derived(!problem && !saving && !!presetTemplates.effectivePath);

  async function submit(overwrite = false) {
    if (saving || problem) return;
    saving = true;
    error = '';
    exists = false;
    const outcome = await presetTemplates.saveCurrentAsTemplate(normalizeTemplateName(name), overwrite);
    saving = false;
    if (outcome.ok) close();
    else if (outcome.reason === 'exists') exists = true;
    else error = outcome.message;
  }
</script>

<Dialog overlay="presetTemplateSave" {open} onClose={close} title="Save preset as template" width="480px">
  <DialogBody>
    <div class="tpl">
      <div class="tpl-dir mono">{presetTemplates.effectivePath || 'No templates folder configured'}</div>

      {#if !presetTemplates.effectivePath}
        <p class="tpl-empty">
          Pick a templates folder in <b>Setup ▸ Storage</b>, or connect an FM3, FM9, or Axe-Fx III to use its editor's default folder.
        </p>
      {:else}
        <label class="fld" for="tpl-name">
          <span class="flbl">TEMPLATE NAME</span>
          <input
            id="tpl-name"
            class="in mono"
            type="text"
            maxlength="64"
            data-autofocus
            bind:value={name}
            placeholder="Template name"
            oninput={() => { exists = false; error = ''; }}
            onkeydown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
        </label>
        <p class="tpl-note">
          Saves the preset currently in the edit buffer — including unsaved edits — as
          <span class="mono">{normalizeTemplateName(name) || '…'}.syx</span> in the folder above.
        </p>
        {#if problem}
          <p class="tpl-msg bad">{problem}</p>
        {:else if exists}
          <p class="tpl-msg warn">A template named “{normalizeTemplateName(name)}” already exists.</p>
        {:else if error}
          <p class="tpl-msg bad">{error}</p>
        {/if}
      {/if}
    </div>
  </DialogBody>

  {#snippet footer()}
    <div class="tpl-foot">
      <Button variant="secondary" size="lg" onclick={close}>Cancel</Button>
      {#if exists}
        <Button variant="amber" size="lg" disabled={saving} onclick={() => void submit(true)}>
          {saving ? 'Saving…' : 'Replace existing'}
        </Button>
      {:else}
        <Button variant="primary" size="lg" disabled={!canSave} onclick={() => void submit()}>
          {saving ? 'Saving…' : 'Save as template'}
        </Button>
      {/if}
    </div>
  {/snippet}
</Dialog>

<style>
  .tpl {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 14px 16px 6px;
  }
  .tpl-dir {
    color: var(--textfaint);
    font-size: 10px;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tpl-empty {
    margin: 0;
    color: var(--textdim);
    font-size: 13px;
    line-height: 1.5;
    padding: 4px 2px 12px;
  }
  .fld {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .flbl {
    color: var(--textfaint);
    font: 700 10px/1 var(--font-ui);
    letter-spacing: 0.12em;
  }
  .in {
    width: 100%;
    min-width: 0;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--border2);
    border-radius: 10px;
    background: var(--bg2);
    color: var(--text);
    font: 600 14px var(--font-mono);
    outline: none;
  }
  .in:focus {
    border-color: var(--accent);
  }
  .tpl-note {
    margin: 0;
    color: var(--textfaint);
    font-size: 12px;
    line-height: 1.5;
  }
  .tpl-msg {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
  }
  .tpl-msg.bad {
    color: var(--danger);
  }
  .tpl-msg.warn {
    color: var(--amber);
  }
  .tpl-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
    padding: 12px 16px;
  }
</style>
