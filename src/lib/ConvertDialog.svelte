<script lang="ts">
  // Convert-preset dialog (P4a · META-24 · AXIS-47/48). Entry point: pick a target device + an optional
  // .syx source file (omit → convert the connected device's current preset), Convert, then read the diff
  // report. Mounted unconditionally in +page.svelte; gated on `convert.open`. The block-focus hook is
  // wired here to the live editor (best-effort family match) and passed to ConvertReport as a prop — the
  // P4b seam that the fake-grid phase re-points.
  import { editor } from './editor.svelte';
  import { convert } from './convert.svelte';
  import { convertScratch } from './convertScratch.svelte';
  import ConvertReport from './ConvertReport.svelte';
  import { CONVERTER_DEVICES, deviceName, deviceIdFromModel } from './convertReport';
  import type { ConverterDeviceId } from './types';

  let target = $state<ConverterDeviceId | null>(null);
  let useFile = $state(false);
  let fileName = $state('');
  let fileB64 = $state<string | null>(null);
  let fileErr = $state('');

  const connectedId = $derived(deviceIdFromModel(editor.detected?.modelId));
  const canConvert = $derived(!!target && !convert.running && (!useFile || !!fileB64));

  function close() {
    convert.close();
  }

  function bytesToB64(bytes: Uint8Array): string {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  async function pickFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    fileErr = '';
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      fileB64 = bytesToB64(bytes);
      fileName = f.name;
      useFile = true;
    } catch {
      fileErr = 'Could not read that file.';
      fileB64 = null;
      fileName = '';
    }
  }

  async function runConvert() {
    if (!target) return;
    const src = useFile ? (fileB64 ?? undefined) : undefined;
    await convert.run(target, src, useFile ? fileName : undefined);
  }

  function newConversion() {
    convert.reset();
  }

  function openInGrid() {
    convert.close();
    convertScratch.openView();
  }

  // ── block-focus seam (P4b) ──────────────────────────────────────────────────────────────────────
  // Re-pointed at the fake-grid scratch buffer: a report row focuses its converted block in the scratch
  // view (opening it if needed). `blockAvailable` reflects whether that block exists in the conversion.
  function blockAvailable(blockKey: string, _family: string): boolean {
    return convertScratch.hasBlock(blockKey);
  }
  function focusBlock(blockKey: string, _family: string): boolean {
    const ok = convertScratch.focusBlock(blockKey);
    if (ok) convert.close(); // reveal the scratch view
    return ok;
  }
</script>

{#if convert.open}
  <div class="bg" role="presentation" onclick={close}>
    <div
      class="card"
      role="dialog"
      aria-label="Convert preset"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') close(); }}
    >
      <header>
        <h2>Convert preset</h2>
        <span class="spacer"></span>
        <button class="x" aria-label="Close" onclick={close}>✕</button>
      </header>

      {#if convert.hasReport && convert.result}
        <div class="body">
          <ConvertReport result={convert.result} targetDevice={convert.lastRequest?.targetDevice} onFocusBlock={focusBlock} {blockAvailable} />
        </div>
        <footer>
          <button class="ghost" onclick={newConversion}>Convert another…</button>
          <span class="spacer"></span>
          <button class="ghost" onclick={openInGrid}>Open in grid…</button>
          <button class="primary" onclick={close}>Done</button>
        </footer>
      {:else}
        <div class="body setup">
          <section>
            <h3>Target device</h3>
            <div class="devgrid">
              {#each CONVERTER_DEVICES as d (d)}
                <button
                  class="dev"
                  class:sel={target === d}
                  onclick={() => (target = d)}
                >
                  <span class="dname">{deviceName(d)}</span>
                  {#if connectedId === d}<span class="tag">connected</span>{/if}
                </button>
              {/each}
            </div>
          </section>

          <section>
            <h3>Source preset</h3>
            <label class="opt" class:sel={!useFile}>
              <input type="radio" name="src" checked={!useFile} onchange={() => (useFile = false)} />
              <span>
                <b>Current preset</b>
                <span class="sub">{editor.preset?.name ? `“${editor.preset.name}” on the connected device` : 'The connected device’s edit buffer'}</span>
              </span>
            </label>
            <label class="opt" class:sel={useFile}>
              <input type="radio" name="src" checked={useFile} onchange={() => (useFile = true)} />
              <span>
                <b>From a .syx file</b>
                <span class="sub">{fileName ? fileName : 'Convert an exported preset file'}</span>
              </span>
              <label class="filebtn">Choose…<input type="file" accept=".syx" onchange={pickFile} /></label>
            </label>
            {#if fileErr}<div class="err">{fileErr}</div>{/if}
          </section>

          {#if convert.status === 'error' && convert.error}
            <div class="err banner">{convert.error}</div>
          {/if}
        </div>
        <footer>
          <span class="spacer"></span>
          <button class="primary" disabled={!canConvert} onclick={runConvert}>
            {convert.running ? 'Converting…' : 'Convert'}
          </button>
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: grid; place-items: center; z-index: 70; }
  .card { width: min(720px, 94vw); max-height: 90vh; display: flex; flex-direction: column; background: var(--surface); color: var(--text); border: 1px solid var(--border2); border-radius: 13px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5); }
  header { display: flex; align-items: center; gap: 10px; padding: 14px 18px 12px; border-bottom: 1px solid var(--border2); }
  h2 { margin: 0; font-size: 16px; }
  .spacer { flex: 1; }
  .x { background: none; border: none; color: var(--textdim); font-size: 15px; cursor: pointer; }
  .x:hover { color: var(--text); }
  .body { padding: 16px 18px; overflow: auto; }
  .setup { display: flex; flex-direction: column; gap: 18px; }
  section h3 { margin: 0 0 9px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--textdim); }

  .devgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .dev { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border2); background: var(--bg2); color: var(--text); cursor: pointer; font-size: 13px; font-weight: 600; }
  .dev:hover { border-color: var(--border3); }
  .dev.sel { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--bg2)); }
  .dname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { flex: none; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); border-radius: 999px; padding: 1px 6px; }

  .opt { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--border2); background: var(--bg2); cursor: pointer; margin-bottom: 8px; }
  .opt.sel { border-color: var(--accent); }
  .opt input[type='radio'] { accent-color: var(--accent); }
  .opt > span { display: flex; flex-direction: column; gap: 1px; flex: 1; }
  .opt b { font-size: 13px; }
  .opt .sub { font-size: 11px; color: var(--textdim); }
  .filebtn { position: relative; overflow: hidden; flex: none; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border2); background: var(--surface); font-size: 12px; cursor: pointer; }
  .filebtn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  .err { font-size: 12px; color: var(--danger, #d6543f); }
  .err.banner { padding: 9px 12px; border-radius: 9px; border: 1px solid color-mix(in srgb, var(--danger, #d6543f) 45%, transparent); background: color-mix(in srgb, var(--danger, #d6543f) 10%, transparent); }

  footer { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border2); }
  .primary { padding: 8px 18px; border-radius: 9px; border: none; background: var(--accent); color: var(--accentink, #fff); font-size: 13px; font-weight: 700; cursor: pointer; }
  .primary:hover:not(:disabled) { filter: brightness(1.08); }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .ghost { padding: 8px 15px; border-radius: 9px; border: 1px solid var(--border2); background: transparent; color: var(--text); font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .ghost:hover { border-color: var(--border3); }
</style>
