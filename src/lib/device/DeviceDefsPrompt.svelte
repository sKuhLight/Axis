<script lang="ts">
  // Device-definitions prompt (A4, AXIS-17/44 · META-22). Appears on connect when the device can
  // self-describe but has no persisted definition profile for its firmware — offering, in order of
  // preference: pull a shared cloud profile · import a discovered editor cache (Electron) · drag-drop an
  // effectDefinitions_*.cache anywhere on the card · read the definitions off the device (live SSE
  // progress) · locate an editor folder (Chromium). Dismissible per device+firmware. Clones the
  // CachePrompt bottom-sheet UX. All ordering/gating lives in deviceDefs.ts (pure, tested).
  import { editor } from '$lib/editor/editor.svelte';
  import { deviceDefs } from './deviceDefs.svelte';
  import PromptToast from '$lib/ui/PromptToast.svelte';
  import PromptRow from '$lib/ui/PromptRow.svelte';
  import PromptProgressRow from '$lib/ui/PromptProgressRow.svelte';
  import Button from '$lib/ui/Button.svelte';

  const online = $derived(editor.conn.state === 'online');
  const building = $derived(deviceDefs.building);
  const busy = $derived(deviceDefs.importing);
  const actions = $derived(deviceDefs.actions);
  const candidates = $derived(deviceDefs.sources?.candidates ?? []);
  // Show while: a build is running · a source was just acquired (success state) · the prompt is offered.
  const show = $derived(online && (!!building || deviceDefs.succeeded || deviceDefs.shouldShow));

  let dragging = $state(false);
  // Explicit consent gate for the full (taper) capture — no request is made until the user confirms.
  let fullConsent = $state(false);
  // Drop a stale consent if the prompt goes away (dismiss / disconnect / device change) so it never
  // resurfaces unbidden on the next device.
  $effect(() => { if (!show) fullConsent = false; });

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }
  function onDragLeave() {
    dragging = false;
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await deviceDefs.importBytes(bytes, file.name);
  }
</script>

{#if show}
  {#if building}
    <PromptToast maxWidth={460}>
      <PromptProgressRow
        label="Reading definitions from device…"
        done={building.done}
        total={building.total}
        phase={building.phase}
        grow
        onCancel={() => deviceDefs.cancel()}
      />
    </PromptToast>
  {:else if deviceDefs.succeeded}
    <PromptToast>
      <PromptRow icon="✓" iconVariant="ok">
        {#snippet message()}
          <b>Definitions ready</b>
          <span class="sub">Axis is now using definitions matched to this device &amp; firmware.</span>
        {/snippet}
        {#snippet actions()}
          <Button variant="secondary" size="sm" height="30px" onclick={() => deviceDefs.dismiss()}>Done</Button>
        {/snippet}
      </PromptRow>
    </PromptToast>
  {:else if fullConsent}
    <!-- Full (taper) capture — explicit consent BEFORE any request. Proceed → build('full'); cancel → nothing. -->
    <PromptToast>
      <div class="row top">
        <span class="ic">⚠</span>
        <div class="msg">
          <b>Start the full capture?</b>
          <span class="sub">Axis briefly writes test values into the current preset on the device and reloads it afterwards — nothing is saved permanently.</span>
          <span class="sub">Leave the device idle on its Home screen and don't save anything on it while the capture runs.</span>
          <span class="sub">A full capture takes noticeably longer than the normal read.</span>
        </div>
      </div>
      <div class="acts">
        <button class="act primary" onclick={() => { fullConsent = false; deviceDefs.build('full'); }}>
          <span class="alabel">Start full capture</span>
          <span class="ahint">Also captures the exact knob tapers</span>
        </button>
        <Button variant="secondary" size="sm" height="30px" onclick={() => (fullConsent = false)}>Cancel</Button>
      </div>
    </PromptToast>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <PromptToast
      class={dragging ? 'dd-offer drag' : 'dd-offer'}
      ondragover={onDragOver}
      ondragleave={onDragLeave}
      ondrop={onDrop}
    >
      <div class="row top">
        <span class="ic">⧉</span>
        <div class="msg">
          <b>Get definitions for this device?</b>
          <span class="sub">Axis is using bundled definitions. Match them to your exact firmware for accurate model names, ranges &amp; parameters.</span>
        </div>
        <Button variant="secondary" size="sm" height="30px" title="Keep using the bundled definitions" onclick={() => deviceDefs.dismiss()}>Later</Button>
      </div>

      {#if deviceDefs.error}
        <div class="err">
          {deviceDefs.error}
          {#if deviceDefs.mismatch}<button class="linkbtn" onclick={() => deviceDefs.forceImport()}>Import anyway</button>{/if}
        </div>
      {/if}

      <div class="acts">
        {#each actions as a (a)}
          {#if a === 'cloudPull'}
            <button class="act primary" disabled={busy} onclick={() => deviceDefs.cloudPull()}>
              <span class="alabel">☁ Get definitions</span>
              <span class="ahint">A community profile for this firmware is available</span>
            </button>
          {:else if a === 'importCandidate'}
            <div class="candidates">
              <div class="clabel">Found on this computer:</div>
              {#each candidates as c (c.path)}
                <button class="crow" disabled={busy} onclick={() => deviceDefs.importCandidate(c.path)}>
                  <span class="cfile">{c.file}</span>
                  <span class="cmeta">fw {c.fwMajor}.{c.fwMinor}</span>
                </button>
              {/each}
            </div>
          {:else if a === 'dropFile'}
            <div class="drop">
              <span class="dropic">⬇</span>
              <span>Drag an <code>effectDefinitions_*.cache</code> file here to import</span>
            </div>
          {:else if a === 'readFromDevice'}
            <button class="act" disabled={busy} onclick={() => deviceDefs.build()}>
              <span class="alabel">⟳ Read from device</span>
              <span class="ahint">Builds a profile by scanning the unit — takes a minute</span>
            </button>
          {:else if a === 'locateFolder'}
            <button class="act ghost" disabled={busy} onclick={() => deviceDefs.locateFolder()}>
              <span class="alabel">📂 Locate editor folder</span>
              <span class="ahint">Pick your Fractal editor folder once — Axis finds the file</span>
            </button>
          {:else if a === 'fullCapture'}
            <button class="act ghost" disabled={busy} onclick={() => (fullConsent = true)}>
              <span class="alabel">⤢ Full capture (knob tapers)</span>
              <span class="ahint">Also captures the exact knob tapers — takes longer</span>
            </button>
          {/if}
        {/each}
      </div>
    </PromptToast>
  {/if}
{/if}

<style>
  :global(.dd-offer.drag) {
    border-color: var(--accent);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), inset 0 0 0 2px var(--accent);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .row.top {
    align-items: flex-start;
  }
  .ic {
    font-size: 20px;
    color: var(--accent);
    flex: none;
    line-height: 1.3;
  }
  .msg {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .msg b {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }
  .sub {
    font-size: 11px;
    color: var(--textdim);
    line-height: 1.35;
  }
  .acts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }
  .act {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid var(--border2);
    background: var(--bg2);
    cursor: pointer;
  }
  .act:hover:not(:disabled) { border-color: var(--accent); }
  .act:disabled { opacity: 0.55; cursor: default; }
  .act.primary {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg2));
  }
  .act.ghost { background: transparent; }
  .alabel {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text);
  }
  .ahint {
    font-size: 10.5px;
    color: var(--textdim);
  }
  .candidates {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .clabel {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--textdim);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .crow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 11px;
    border-radius: 9px;
    border: 1px solid var(--border2);
    background: var(--bg2);
    cursor: pointer;
  }
  .crow:hover:not(:disabled) { border-color: var(--accent); }
  .crow:disabled { opacity: 0.55; cursor: default; }
  .cfile {
    font-family: var(--font-mono, monospace);
    font-size: 11.5px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmeta {
    flex: none;
    font-size: 10.5px;
    color: var(--textdim);
  }
  .drop {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px dashed var(--border3);
    color: var(--textdim);
    font-size: 11.5px;
  }
  .drop code {
    font-family: var(--font-mono, monospace);
    font-size: 10.5px;
    color: var(--text2);
  }
  .dropic { font-size: 15px; }
  .err {
    margin-top: 8px;
    font-size: 11.5px;
    color: var(--danger, #d6543f);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .linkbtn {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
</style>
