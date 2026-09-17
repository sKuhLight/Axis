<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import DialogBody from '$lib/ui/DialogBody.svelte';
  import { overlays } from '$lib/overlay/overlays.svelte';
  import { presetTemplates } from './presetTemplates.svelte';
  import type { PresetSummary, TemplateCandidate } from '$lib/api/types';

  const open = $derived(overlays.isOpen('presetTemplates'));
  const close = () => overlays.close('presetTemplates');

  let selected = $state<TemplateCandidate | null>(null);
  let detail = $state<PresetSummary | null>(null);
  let detailLoading = $state(false);
  let loading = $state(false);

  $effect(() => {
    if (open) void presetTemplates.load(presetTemplates.effectivePath);
  });

  $effect(() => {
    if (selected && !presetTemplates.candidates.some((c) => c.path === selected!.path)) {
      selected = null;
      detail = null;
    }
  });

  async function select(candidate: TemplateCandidate) {
    selected = candidate;
    detail = null;
    detailLoading = true;
    detail = await presetTemplates.summaryOf(candidate);
    detailLoading = false;
  }

  async function load() {
    const candidate = selected ?? presetTemplates.candidates[0];
    if (!candidate || loading) return;
    loading = true;
    const ok = await presetTemplates.loadIntoBuffer(candidate);
    loading = false;
    if (ok) close();
  }

  function meta(candidate: TemplateCandidate): string {
    if (detail && selected?.path === candidate.path) {
      const parts = [
        detail.scenes?.length ? `${detail.scenes.length} scene${detail.scenes.length === 1 ? '' : 's'}` : null,
        detail.blocks?.length ? `${detail.blocks.length} block${detail.blocks.length === 1 ? '' : 's'}` : null
      ].filter(Boolean);
      if (parts.length) return parts.join(' · ');
    }
    return `${Math.max(1, Math.round(candidate.size / 1024))} KB`;
  }
</script>

<Dialog overlay="presetTemplates" {open} onClose={close} title="New preset from template" width="540px" maxHeight="78vh">
  <DialogBody>
    <div class="tpl">
      <div class="tpl-dir mono">{presetTemplates.effectivePath || 'No templates folder configured'}</div>

      {#if !presetTemplates.effectivePath}
        <div class="tpl-empty">Pick a templates folder in Setup ▸ Storage, or connect an FM3, FM9, or Axe-Fx III to use its editor's default folder.</div>
      {:else if presetTemplates.status === 'loading'}
        <div class="tpl-empty">Loading templates…</div>
      {:else if presetTemplates.status === 'error'}
        <div class="tpl-empty bad">Couldn't read that folder. Check the path in Setup ▸ Storage.</div>
      {:else if !presetTemplates.candidates.length}
        <div class="tpl-empty">No templates yet. In FM3-Edit use Preset ▸ Save as Template, or drop <span class="mono">.syx</span> files into this folder.</div>
      {:else}
        <ul class="tpl-list">
          {#each presetTemplates.candidates as candidate (candidate.path)}
            <li>
              <button type="button" class="tpl-row" class:on={selected?.path === candidate.path} onclick={() => select(candidate)}>
                <span class="tpl-ic" aria-hidden="true">⊞</span>
                <span class="tpl-txt">
                  <span class="tpl-name">{selected?.path === candidate.path && detail ? detail.name : candidate.name}</span>
                  <span class="tpl-meta mono">{meta(candidate)}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="tpl-note">Loading a template replaces the current preset in the edit buffer{detailLoading ? ' · decoding…' : ''}.</p>
    </div>
  </DialogBody>

  {#snippet footer()}
    <div class="tpl-foot">
      <button type="button" class="tpl-btn" onclick={close}>Cancel</button>
      <button type="button" class="tpl-btn accent" disabled={loading || !presetTemplates.candidates.length} onclick={load}>
        {loading ? 'Loading…' : 'Load into current preset'}
      </button>
    </div>
  {/snippet}
</Dialog>

<style>
  .tpl {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 14px 16px 4px;
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
    color: var(--textdim);
    font-size: 13px;
    line-height: 1.5;
    padding: 14px 2px 18px;
  }
  .tpl-empty.bad {
    color: var(--danger);
  }
  .tpl-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .tpl-row {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--text2);
    text-align: left;
    cursor: pointer;
  }
  .tpl-row:hover {
    background: var(--surface2);
  }
  .tpl-row.on {
    border-color: var(--accent-border);
    background: var(--accent-tint);
  }
  .tpl-ic {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--accent);
    font-size: 14px;
  }
  .tpl-txt {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 4px;
  }
  .tpl-name {
    color: var(--text);
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tpl-meta {
    color: var(--textfaint);
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .tpl-note {
    color: var(--textfaint);
    font-size: 12px;
    margin: 4px 0 0;
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
  .tpl-btn {
    font: 700 12px/1 var(--font-ui);
    padding: 9px 13px;
    border-radius: 8px;
    border: 1px solid var(--border3);
    background: var(--surface2);
    color: var(--text2);
    cursor: pointer;
    white-space: nowrap;
  }
  .tpl-btn.accent {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accentink);
  }
  .tpl-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
