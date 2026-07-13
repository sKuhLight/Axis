<script lang="ts">
  // Device-definitions prompt (A4, AXIS-17/44 · META-22). Appears on connect when the device can
  // self-describe but has no persisted definition profile for its firmware — offering, in order of
  // preference: pull a shared cloud profile · import a discovered editor cache (Electron) · drag-drop an
  // effectDefinitions_*.cache anywhere on the card · read the definitions off the device (live SSE
  // progress) · locate an editor folder (Chromium). Dismissible per device+firmware. Clones the
  // CachePrompt bottom-sheet UX. All ordering/gating lives in deviceDefs.ts (pure, tested).
  import { editor } from './editor.svelte';
  import { deviceDefs } from './deviceDefs.svelte';
  import { isRemote } from './forgefx';

  const online = $derived(editor.conn.state === 'online');
  const building = $derived(deviceDefs.building);
  const busy = $derived(deviceDefs.importing);
  const actions = $derived(deviceDefs.actions);
  const candidates = $derived(deviceDefs.sources?.candidates ?? []);
  // Show while: a build is running · a source was just acquired (success state) · the prompt is offered.
  const show = $derived(online && !isRemote() && (!!building || deviceDefs.succeeded || deviceDefs.shouldShow));
  const pct = $derived(building && building.total ? Math.round((building.done / building.total) * 100) : 0);

  let dragging = $state(false);

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
    <div class="dd building">
      <div class="row">
        <span class="dot"></span>
        <span class="txt">
          Reading definitions from device…
          {#if building.total}<b>{building.done}/{building.total}</b>{/if}
          {#if building.phase}<span class="phase">{building.phase}</span>{/if}
        </span>
        {#if building.total}<div class="bar"><div class="fill" style="width:{pct}%"></div></div>{/if}
        <button class="later" onclick={() => deviceDefs.cancel()}>Cancel</button>
      </div>
    </div>
  {:else if deviceDefs.succeeded}
    <div class="dd">
      <div class="row">
        <span class="ic ok">✓</span>
        <div class="msg">
          <b>Definitions ready</b>
          <span class="sub">Axis is now using definitions matched to this device &amp; firmware.</span>
        </div>
        {#if deviceDefs.canPublish}
          <button class="go" disabled={deviceDefs.publishing} onclick={() => deviceDefs.cloudPublish()}>
            {deviceDefs.publishing ? 'Sharing…' : 'Share to cloud'}
          </button>
        {/if}
        <button class="later" onclick={() => deviceDefs.dismiss()}>Done</button>
      </div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dd offer"
      class:drag={dragging}
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
        <button class="later" onclick={() => deviceDefs.dismiss()} title="Keep using the bundled definitions">Later</button>
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
          {/if}
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .dd {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 400;
    max-width: 620px;
    width: calc(100% - 40px);
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 13px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    padding: 12px 14px;
    animation: ddUp 0.18s ease-out;
  }
  .dd.building {
    max-width: 460px;
  }
  .dd.offer.drag {
    border-color: var(--accent);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), inset 0 0 0 2px var(--accent);
  }
  @keyframes ddUp {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
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
  .ic.ok {
    color: var(--ok, #33c46b);
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
  .go {
    flex: none;
    height: 34px;
    padding: 0 15px;
    border-radius: 9px;
    border: none;
    background: var(--accent);
    color: var(--accentink);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .go:hover:not(:disabled) { filter: brightness(1.08); }
  .go:disabled { opacity: 0.6; cursor: default; }
  .later {
    flex: none;
    height: 30px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid var(--border2);
    background: transparent;
    color: var(--textdim);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .later:hover { color: var(--text); border-color: var(--border3); }
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
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    flex: none;
    animation: ddPulse 1s ease-in-out infinite;
  }
  @keyframes ddPulse {
    50% { opacity: 0.3; }
  }
  .txt {
    font-size: 12px;
    color: var(--text2);
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .phase {
    font-size: 10.5px;
    color: var(--textdim);
    text-transform: capitalize;
  }
  .bar {
    flex: 1;
    height: 6px;
    background: var(--track);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
</style>
