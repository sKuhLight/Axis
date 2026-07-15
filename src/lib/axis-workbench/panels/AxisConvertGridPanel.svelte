<script lang="ts">
  // Cross-device converter — REAL SignalGrid over the OFFLINE convertEditor surface (M4 · META-24).
  // Every convert panel sets the offline editor surface into its OWN context (context does not cross
  // PanelHost subtrees), so the embedded SignalGrid reads the converted scratch buffer, not the device.
  import { setContext } from 'svelte';
  import { EDITOR_SURFACE_KEY } from '../../editorSurface';
  import { convertEditor } from '../../convertEditor.svelte';
  setContext(EDITOR_SURFACE_KEY, convertEditor);

  import SignalGrid from '../../SignalGrid.svelte';
  import type { PanelInstance } from '../../workbench';
  import { convert } from '../../convert.svelte';
  import { convertScratch } from '../../convertScratch.svelte';
  import { validateSlot } from '../../convertScratch';
  import { deviceName, deviceIdFromModel } from '../../convertReport';
  import { editor } from '../../editor.svelte';
  import { library } from '../../library.svelte';
  import { forgefx } from '../../forgefx';
  import { entrySyxBytes, bytesToBase64 } from '../../presetConvertSource';
  import { canExportTarget, isFm3Model, syxFilename, exportToast } from '../../convertExport';
  import { AXIS_DEFAULT_GRID_VIEW } from '../gridView';
  import { cellDecorationFor, type CellDecoration } from '../../convertDecorations';

  let { panel: _panel }: { panel: PanelInstance } = $props();

  // Render the converted grid with the 'full' view: full-size tiles (floored at the M size, growing to
  // fill), never the glyph-map. 'auto' would fit-to-pane and — because this pane is shorter than a
  // full-screen grid (the Source panel + Block Editor share the page) — step DOWN to the 25px glyph-map.
  // The operator wants the grid to stay big, so we pin 'full'; the pane is wide enough that the full grid
  // fits without horizontal scroll. (Bare <SignalGrid/> with no view would hit the old-shell mobile pager
  // via editor.isMobile, which is statically <1366 on the offline surface.)
  const gridView = { ...AXIS_DEFAULT_GRID_VIEW, mode: 'full' as const };

  // (Re)build the editable grid Layout for grid targets whenever a new conversion is seeded (tracks
  // convertScratch.seedEpoch inside syncGrid). Runs outside render → safe to mutate the surface's $state.
  $effect(() => convertEditor.syncGrid());

  const sourceDevice = $derived(convert.result?.source.device ?? 'source');
  const targetDeviceId = $derived(convert.lastRequest?.targetDevice);
  const targetDevice = $derived(targetDeviceId ? deviceName(targetDeviceId) : 'target');
  const presetName = $derived(convert.result?.source.name || '(unnamed preset)');
  const canCommit = $derived(convertScratch.canCommit);
  const remaining = $derived(convertScratch.remaining);
  const applying = $derived(convertScratch.apply.running);

  // ── per-cell conflict decorations (badge + severity ring) fed to SignalGrid's optional overlay prop ──
  // Transient ok-tick: when a block's conflict newly resolves, flash a ✓ on its cell for ~1.4 s.
  let tickKey = $state<string | null>(null);
  let tickT: ReturnType<typeof setTimeout> | null = null;
  let prevResolved = new Set<string>();
  $effect(() => {
    const s = convertScratch.state;
    const now = new Set<string>(s ? s.conflicts.filter((c) => c.resolved && c.blockKey).map((c) => c.blockKey!) : []);
    for (const k of now) {
      if (!prevResolved.has(k)) {
        tickKey = k;
        if (tickT) clearTimeout(tickT);
        tickT = setTimeout(() => (tickKey = null), 1400);
      }
    }
    prevResolved = now;
  });

  const decorations = $derived.by(() => {
    const map = new Map<string, CellDecoration>();
    const s = convertScratch.state;
    if (!s) return map;
    const events = convert.result?.events ?? [];
    for (const cell of convertEditor.layout.cells) {
      const key = convertEditor.blockKeyAt(cell.row, cell.col);
      if (!key) continue;
      const deco = cellDecorationFor(events, s, key, targetDeviceId);
      const tick = tickKey === key;
      if (deco || tick) map.set(`${cell.row},${cell.col}`, { ...(deco ?? {}), tick });
    }
    return map;
  });

  // ── save flow: name + slot popover ────────────────────────────────────────────────────────────
  // The operator names the converted preset and picks an optional target slot before it lands in the
  // library. The slot is validated against the target device's preset count ONLY when the target IS the
  // connected device (the only case where the count is locally known); otherwise it's a free-form,
  // non-negative number. NOTE: a true ".syx export" lives in the separate codec-authoring task — the seam
  // is left here (a disabled control) but deliberately not implemented as a no-op.
  let saveOpen = $state(false);
  let saveName = $state('');
  let saveSlot = $state('');
  const targetCount = $derived.by(() => {
    const tgt = convert.lastRequest?.targetDevice;
    const connected = deviceIdFromModel(editor.detected?.modelId);
    return tgt && tgt === connected ? editor.presetCount : undefined;
  });
  const slotCheck = $derived(validateSlot(saveSlot, targetCount));

  // Slot chooser: open the real device-preset picker (PresetPicker) in "pick a slot" mode and thread the
  // chosen slot into `saveSlot` (still validated by `slotCheck`). Falls back gracefully with no device —
  // the picker shows the library / last-known preset list (presetCount defaults, names from the library).
  const slotPad = $derived(saveSlot === '' ? '' : String(Number(saveSlot)).padStart(3, '0'));
  const slotName = $derived(saveSlot === '' ? '' : library.nameOfSlot(Number(saveSlot)));
  function pickSlot() {
    editor.openSlotPicker((slot) => {
      saveSlot = String(slot);
    });
  }

  function openSave() {
    saveName = convertScratch.state?.name ?? presetName;
    saveSlot = '';
    initBaseChoice();
    saveOpen = true;
  }
  function cancelSave() {
    saveOpen = false;
  }
  async function confirmSave() {
    if (!slotCheck.ok) return;
    const r = await convertScratch.saveToLibrary({ name: saveName.trim() || undefined, slot: slotCheck.slot });
    editor.showToast(r.ok ? 'Saved to library' : r.error || 'Could not save to the library.', r.ok ? '#33c46b' : '#d6543f');
    if (r.ok) {
      saveOpen = false;
      void library.loadConverted(); // surface it in the preset library immediately
    }
  }
  async function applyToDevice() {
    await convertScratch.applyToDevice();
    const summary = convertScratch.apply.summary;
    if (summary) editor.showToast(summary, convertScratch.apply.failed ? '#f5a623' : '#33c46b');
  }

  // ── .syx export (FM3-only for now) ──────────────────────────────────────────────────────────────
  // HONESTY: FM3 is the ONLY supported export target today; every other target keeps the control disabled
  // with a clear hint. A file-valid .syx is NOT proof of device acceptance — a hardware load test on a
  // real FM3 is still required, which the success toast reminds the user of.
  //
  // Base template (Option A): the converted preset is AUTHORED ONTO an FM3 base the user provides.
  // Default = the connected device's current preset when it's an FM3; otherwise an FM3 preset from the
  // library, or an uploaded .syx. The source is re-authored from the retained OFFLINE source bytes, or —
  // when the last conversion had no offline source — the connected device (server dumps its current
  // preset). A re-opened saved doc carries neither, so export is unavailable for it.
  const canExportTargetFm3 = $derived(canExportTarget(targetDeviceId));
  const connectedIsFm3 = $derived(deviceIdFromModel(editor.detected?.modelId) === 'fm3');
  const sourceAvailable = $derived(!!convert.lastSource || convert.lastRequest?.hasSource === false);
  const fm3LibEntries = $derived(library.entries.filter((e) => isFm3Model(e.summary.model)));

  type BaseChoice = 'connected' | 'library' | 'upload';
  let baseChoice = $state<BaseChoice>('upload');
  let baseLibId = $state('');
  let uploadedBase = $state<{ b64: string; name: string } | null>(null);
  let exporting = $state(false);

  // Preselect the connected-FM3 default (else a library FM3, else upload) each time the popover opens.
  function initBaseChoice() {
    uploadedBase = null;
    if (connectedIsFm3) {
      baseChoice = 'connected';
    } else if (fm3LibEntries.length > 0) {
      baseChoice = 'library';
      baseLibId = fm3LibEntries[0].id;
    } else {
      baseChoice = 'upload';
    }
  }

  const baseReady = $derived(
    baseChoice === 'connected'
      ? connectedIsFm3
      : baseChoice === 'library'
        ? !!fm3LibEntries.find((e) => e.id === baseLibId)
        : !!uploadedBase
  );
  const canExport = $derived(canExportTargetFm3 && sourceAvailable && baseReady && !exporting);

  async function onBaseFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) {
      uploadedBase = null;
      return;
    }
    const buf = await file.arrayBuffer();
    uploadedBase = { b64: bytesToBase64(new Uint8Array(buf)), name: file.name.replace(/\.syx$/i, '') };
  }

  /** Resolve the chosen base template to base64 FM3 `.syx` bytes (throws a user-facing message on failure). */
  async function resolveBaseB64(): Promise<string> {
    if (baseChoice === 'upload') {
      if (!uploadedBase) throw new Error('Choose an FM3 .syx to use as the base template.');
      return uploadedBase.b64;
    }
    if (baseChoice === 'library') {
      const e = fm3LibEntries.find((x) => x.id === baseLibId);
      if (!e) throw new Error('Pick an FM3 preset from the library.');
      return bytesToBase64(new Uint8Array(await entrySyxBytes(e)));
    }
    // connected FM3: dump the current preset (active buffer) as the base template
    const b = await forgefx.presetBackup();
    return bytesToBase64(Uint8Array.from(b.bytes));
  }

  function downloadSyx(bytes: number[], name: string) {
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = syxFilename(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function exportSyx() {
    if (!canExport) return;
    exporting = true;
    try {
      const baseSyx = await resolveBaseB64();
      const res = await forgefx.exportConvertedSyx('fm3', {
        sourceSyx: convert.lastSource?.b64,
        baseSyx,
        name: saveName.trim() || undefined,
        slot: slotCheck.ok ? slotCheck.slot : undefined
      });
      downloadSyx(res.syx, res.name || saveName);
      // File-level valid only — the FM3 must still accept it on a real hardware load.
      editor.showToast(`${exportToast(res.written.length, res.skipped.length)} — load-test on a real FM3`, '#33c46b');
      saveOpen = false;
    } catch (e) {
      editor.showToast((e as Error)?.message || 'Export failed', '#d6543f');
    } finally {
      exporting = false;
    }
  }
</script>

<div class="axis-convert-grid">
  <header class="axis-convert-head">
    <div class="route">
      <span class="dev">{sourceDevice}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="dev tgt">{targetDevice}</span>
      <span class="pname" title={presetName}>{presetName}</span>
    </div>
    <div class="commit">
      <div class="gate" class:ready={canCommit}>
        <span class="gate-dot"></span>
        {canCommit ? '0 unresolved · commit enabled' : `${remaining} unresolved · commit disabled`}
      </div>
      <div class="save-wrap">
        <button type="button" class="commit-btn" class:on={saveOpen} disabled={!canCommit || applying} onclick={() => (saveOpen ? cancelSave() : openSave())}>
          Save to library…
        </button>
        {#if saveOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="save-pop" role="dialog" tabindex="-1" aria-label="Save converted preset" onkeydown={(e) => { if (e.key === 'Escape') cancelSave(); }}>
            <label class="save-field">
              <span>Name</span>
              <!-- svelte-ignore a11y_autofocus -->
              <input type="text" maxlength="32" autofocus spellcheck="false" bind:value={saveName} onkeydown={(e) => { if (e.key === 'Enter') confirmSave(); }} />
            </label>
            <div class="save-field">
              <span>Slot {targetCount ? `(0–${targetCount - 1}, optional)` : '(optional)'}</span>
              <!-- Reuse the app's real device-preset picker (PresetPicker, via editor.openSlotPicker) to
                   choose a slot from the numbered + named preset list — not a bare number spinner. -->
              <div class="slot-row">
                <button type="button" class="slot-pick" onclick={pickSlot}>
                  {#if saveSlot === ''}
                    <span class="slot-ph">Choose a slot…</span>
                  {:else}
                    <span class="slot-num">PRE {slotPad}</span>
                    <span class="slot-name">{slotName || `Preset ${saveSlot}`}</span>
                  {/if}
                </button>
                {#if saveSlot !== ''}
                  <button type="button" class="slot-clear" title="Clear slot" onclick={() => (saveSlot = '')}>✕</button>
                {/if}
              </div>
            </div>
            {#if !slotCheck.ok}<div class="save-err">{slotCheck.error}</div>{/if}
            <!-- .syx export (FM3-only). Authors the converted preset ONTO an FM3 base template. The bytes
                 are file-valid only — a hardware load test on a real FM3 is still required. -->
            {#if canExportTargetFm3}
              <div class="export-box">
                <span class="export-title">Export .syx (FM3)</span>
                {#if !sourceAvailable}
                  <div class="export-hint">Re-open this preset from a source file or device to export it.</div>
                {:else}
                  <label class="save-field">
                    <span>Base template</span>
                    <select bind:value={baseChoice}>
                      {#if connectedIsFm3}<option value="connected">Connected FM3 (current preset)</option>{/if}
                      {#if fm3LibEntries.length > 0}<option value="library">FM3 preset from library</option>{/if}
                      <option value="upload">Upload an FM3 .syx…</option>
                    </select>
                  </label>
                  {#if baseChoice === 'library'}
                    <select class="export-liblist" bind:value={baseLibId}>
                      {#each fm3LibEntries as e (e.id)}<option value={e.id}>{e.summary.name || e.id}</option>{/each}
                    </select>
                  {:else if baseChoice === 'upload'}
                    <input type="file" accept=".syx" class="export-file" onchange={onBaseFile} />
                  {/if}
                  <button type="button" class="save-export" disabled={!canExport} onclick={exportSyx}>
                    {exporting ? 'Exporting…' : 'Export .syx'}
                  </button>
                  <div class="export-hint">File-valid only — load-test the export on a real FM3 before trusting it.</div>
                {/if}
              </div>
            {:else}
              <button type="button" class="save-export" disabled title="FM3 only for now — other export targets come later">Export .syx (FM3 only for now)</button>
            {/if}
            <div class="save-actions">
              <button type="button" class="commit-btn" onclick={cancelSave}>Cancel</button>
              <button type="button" class="commit-btn primary" disabled={!slotCheck.ok} onclick={confirmSave}>Save</button>
            </div>
          </div>
        {/if}
      </div>
      <button type="button" class="commit-btn primary" disabled={!canCommit || applying} onclick={applyToDevice}>
        {applying ? 'Applying…' : 'Apply to device'}
      </button>
    </div>
  </header>
  <div class="axis-convert-surface">
    <SignalGrid view={gridView} cellDecorations={decorations} externalDropPreview={convertEditor.externalDrop} />
  </div>
</div>

<style>
  .axis-convert-grid {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .axis-convert-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 6px 12px;
    background: var(--aw-bg-2, var(--bg2));
    border-bottom: 1px solid var(--aw-border, var(--border));
  }
  .route {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    font-weight: 700;
    font-size: 13px;
    color: var(--text);
  }
  .arrow {
    color: var(--textdim);
    font-weight: 400;
  }
  .dev.tgt {
    color: var(--accent);
  }
  .pname {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--textdim);
    font: 500 12px/1 var(--font-mono, monospace);
  }
  .pname::before {
    content: '· ';
  }
  .commit {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .gate {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 11px;
    border-radius: 9px;
    font: 700 10.5px/1 var(--font-mono, monospace);
    letter-spacing: 0.02em;
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
    color: var(--danger);
  }
  .gate.ready {
    background: color-mix(in srgb, var(--ok) 12%, transparent);
    border-color: color-mix(in srgb, var(--ok) 45%, transparent);
    color: var(--ok);
  }
  .gate-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }
  .commit-btn {
    padding: 6px 13px;
    border-radius: 8px;
    border: 1px solid var(--border2, var(--border));
    background: transparent;
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .commit-btn:hover:not(:disabled) {
    border-color: var(--border3, var(--border));
  }
  .commit-btn.primary {
    border: none;
    background: var(--accent);
    color: var(--accentink, #fff);
    font-weight: 700;
  }
  .commit-btn.primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .commit-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .commit-btn.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .save-wrap {
    position: relative;
  }
  .save-pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    width: 260px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: 11px;
    border: 1px solid var(--border2, var(--border));
    background: var(--surface, var(--bg2));
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);
  }
  .save-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .save-field span {
    font: 700 10px/1 var(--font-mono, monospace);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--textdim);
  }
  .save-field input {
    height: 30px;
    padding: 0 9px;
    border-radius: 8px;
    border: 1px solid var(--border2, var(--border));
    background: var(--bg2);
    color: var(--text);
    font: 500 13px/1 var(--font-mono, monospace);
    outline: none;
  }
  .save-field input:focus {
    border-color: var(--accent);
  }
  .slot-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }
  .slot-pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    height: 30px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--border2, var(--border));
    background: var(--bg2);
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .slot-pick:hover {
    border-color: var(--accent);
  }
  .slot-ph {
    color: var(--textdim);
    font: 500 12px/1 var(--font-mono, monospace);
  }
  .slot-num {
    flex: none;
    font: 700 11px/1 var(--font-mono, monospace);
    color: var(--accent);
  }
  .slot-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 600 12px/1 var(--font-mono, monospace);
    color: var(--text);
  }
  .slot-clear {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    border: 1px solid var(--border2, var(--border));
    background: transparent;
    color: var(--textdim);
    cursor: pointer;
    font-size: 12px;
  }
  .slot-clear:hover {
    border-color: var(--border3, var(--border));
    color: var(--text);
  }
  .save-err {
    font-size: 11px;
    color: var(--danger);
  }
  .save-export {
    height: 28px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .save-export:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .save-export:disabled {
    border-color: var(--border2, var(--border));
    color: var(--textdim);
    cursor: not-allowed;
    opacity: 0.6;
  }
  .export-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 9px;
    border-radius: 9px;
    border: 1px solid var(--border2, var(--border));
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }
  .export-title {
    font: 700 10px/1 var(--font-mono, monospace);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--textdim);
  }
  .export-box select,
  .export-liblist {
    height: 28px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--border2, var(--border));
    background: var(--bg2);
    color: var(--text);
    font: 500 12px/1 var(--font-mono, monospace);
    outline: none;
  }
  .export-file {
    font-size: 11px;
    color: var(--textdim);
  }
  .export-hint {
    font-size: 10.5px;
    line-height: 1.35;
    color: var(--textdim);
  }
  .save-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .axis-convert-surface {
    flex: 1;
    /* MUST be a flex column: the embedded SignalGrid root (.gridwrap) is `flex: 1` and only fills the
     * height inside a flex parent. As a plain block/relative box it collapsed to content height, so the
     * grid measured a tiny pane and 'auto' stepped down to the glyph-map (25px cells floating in an empty
     * pane). Matching the normal grid panel's `.axis-pane-fill` gives SignalGrid the full height → 'auto'
     * resolves to the full-size grid. */
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
