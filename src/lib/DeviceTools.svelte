<script lang="ts">
  // Device Tools modal — capability-gated sections (API v2): preset backup (caps.backupDump),
  // restore (caps.restoreDump), offline .syx decode (works for both device families), firmware
  // validation (caps.firmwareValidate) and a read-only modifier-model view (caps.modifiers.model).
  // Legacy v1 fallback: an AM4 on a pre-v2 server keeps the old /am4/* routes behind the same UI.
  import { editor } from './editor.svelte';
  import { forgefx } from './forgefx';
  import type { SyxDecodeResult } from './types';

  // Loose display view over BOTH modifier-model DTOs (unified gen-3 ModModel + legacy Am4ModifierModel).
  type ModView = {
    slotCount?: number;
    fields?: Record<string, unknown>;
    sources?: { name: string }[];
    note?: unknown;
    sourcesNote?: unknown;
  };

  let busy = $state(false);
  let msg = $state('');
  let msgAccent = $state('#8fbf7f');
  let backupLoc = $state<number | ''>(''); // '' = active edit buffer
  let decoded = $state<{ index: number; code: string | null; name: string }[] | null>(null);
  let fw = $state<string>('');
  let modModel = $state<ModView | null>(null);
  let modOpen = $state(false);
  let storeLoc = $state(0);

  const caps = $derived(editor.caps);
  const legacyAm4 = $derived(!editor.isV2 && editor.isAm4); // v1 fallback path (old /am4/* routes)
  const canBackup = $derived(legacyAm4 || !!caps?.backupDump);
  const canRestore = $derived(legacyAm4 || !!caps?.restoreDump);
  const canFirmware = $derived(legacyAm4 || !!caps?.firmwareValidate);
  const canModView = $derived(legacyAm4 || !!caps?.modifiers?.model);
  const modBindable = $derived(!legacyAm4 && !!caps?.modifiers?.bind);
  // bank-letter store convenience (Save-to-slot with A01..Z04 codes) — AM4-family addressing only
  const canStoreSlot = $derived(legacyAm4 || (editor.bankLetterAddressing && !!caps?.supportsSave));
  const locCount = $derived(caps?.presets?.count ?? 104);
  const bankCode = (i: number) => `${String.fromCharCode(65 + Math.floor(i / 4))}${String((i % 4) + 1).padStart(2, '0')}`;

  function close() { editor.deviceToolsOpen = false; }
  function say(text: string, ok = true) { msg = text; msgAccent = ok ? '#8fbf7f' : '#ff6b6b'; }

  async function fileBytes(f: File): Promise<number[]> {
    return [...new Uint8Array(await f.arrayBuffer())];
  }
  function download(name: string, bytes: number[]) {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  async function backup() {
    busy = true; say('');
    try {
      const loc = backupLoc === '' ? undefined : Number(backupLoc);
      const r = legacyAm4 ? await forgefx.am4BackupPreset(loc) : await forgefx.presetBackup(loc);
      const label = r.code ?? (r.location != null ? String(r.location) : 'active');
      download(`${editor.conn.device ?? 'preset'}-${label}-${(r.name || 'preset').replace(/[^\w-]+/g, '_')}.syx`, r.bytes);
      say(`Backed up ${label} — "${r.name || '(unnamed)'}" (${r.bytes.length} B) → downloaded`);
    } catch (e) { say('Backup failed: ' + (e as Error).message, false); }
    finally { busy = false; }
  }

  async function restore(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    busy = true; say('');
    try {
      const bytes = await fileBytes(f);
      const r = legacyAm4 ? await forgefx.am4RestorePreset(bytes) : await forgefx.presetRestore(bytes);
      say(`Restored → ${r.code ?? (r.location != null ? String(r.location) : '(active)')}`);
    } catch (err) { say('Restore rejected: ' + (err as Error).message, false); }
    finally { busy = false; (e.target as HTMLInputElement).value = ''; }
  }

  async function decode(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    busy = true; say(''); decoded = null;
    try {
      const bytes = await fileBytes(f);
      const r: SyxDecodeResult = legacyAm4 ? { model: 'am4', ...(await forgefx.am4DecodeSyx(bytes)) } : await forgefx.decodeSyxBytes(bytes);
      if ('presets' in r) {
        // AM4-style multi-preset bank: location codes + names
        decoded = r.presets.map((p) => ({ index: p.index, code: p.code, name: p.name }));
        say(`Decoded ${r.count} preset(s) from "${f.name}"`);
      } else {
        // gen-3 preset summary: one preset — name + its blocks
        decoded = [{ index: 0, code: r.model, name: `${r.name || '(unnamed)'} · ${r.blocks.length} blocks${r.blocks.length ? ' — ' + r.blocks.map((b) => b.name).join(', ') : ''}` }];
        say(`Decoded "${f.name}" (${r.model})`);
      }
    } catch (err) { say('Decode failed: ' + (err as Error).message, false); }
    finally { busy = false; (e.target as HTMLInputElement).value = ''; }
  }

  async function validateFw(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    busy = true; fw = ''; say('');
    try {
      const bytes = await fileBytes(f);
      const r = legacyAm4 ? await forgefx.am4ValidateFirmware(bytes) : await forgefx.validateFirmware(bytes);
      if (r.valid) { fw = `✓ valid — ${r.blocks} data blocks, ${r.messages} messages`; say(`"${f.name}" is a valid firmware envelope`); }
      else { fw = `✗ invalid — ${r.error}`; say('Not a valid firmware file', false); }
    } catch (err) { fw = ''; say('Validation failed: ' + (err as Error).message, false); }
    finally { busy = false; (e.target as HTMLInputElement).value = ''; }
  }

  async function loadModModel() {
    modOpen = !modOpen;
    if (modOpen && !modModel) {
      try {
        modModel = (legacyAm4 ? await forgefx.am4ModModel() : await forgefx.modModel()) as ModView | null;
        if (!modModel) say('This device has no decoded modifier model.', false);
      } catch (e) { say('Modifier model load failed: ' + (e as Error).message, false); }
    }
  }
  /** One display line per modifier field — the AM4 model carries a catalog `symbol`, gen-3 a `pid`. */
  const fieldSub = (f: unknown): string => {
    const o = f as { symbol?: string; pid?: number };
    return o.symbol ?? (o.pid != null ? `pid ${o.pid}` : '');
  };

  async function storeToSlot() {
    busy = true;
    try {
      const r = legacyAm4 ? await forgefx.am4StorePreset(storeLoc) : await forgefx.store(storeLoc);
      say(`Saved active buffer → ${('code' in r && r.code) || bankCode(storeLoc)}`);
    } catch (e) { say('Store failed: ' + (e as Error).message, false); }
    finally { busy = false; }
  }
</script>

{#if editor.deviceToolsOpen}
  <div class="bg" role="presentation" onclick={close}>
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') close(); }}>
      <header>
        <h2>Device Tools</h2>
        <span class="sub mono">{editor.conn.device ?? 'no device'}</span>
        <span class="spacer"></span>
        <button class="x" aria-label="Close" onclick={close}>✕</button>
      </header>

      {#if msg}<div class="msg" style="--a:{msgAccent}">{msg}</div>{/if}

      {#if canBackup || canRestore || canStoreSlot}
        <section>
          <h3>Preset backup / restore</h3>
          {#if canBackup}
            <div class="line">
              <label>Backup
                <select bind:value={backupLoc} disabled={busy}>
                  <option value="">Active edit buffer</option>
                  {#each Array(locCount) as _, i (i)}<option value={i}>{bankCode(i)}</option>{/each}
                </select>
              </label>
              <button onclick={backup} disabled={busy}>Download .syx</button>
            </div>
          {/if}
          {#if canRestore}
            <div class="line">
              <span>Restore .syx (verbatim, to its own location)</span>
              <label class="filebtn">Choose file…<input type="file" accept=".syx" onchange={restore} disabled={busy} /></label>
            </div>
          {/if}
          {#if canStoreSlot}
            <div class="line">
              <label class="filebtn">Save active buffer → slot
                <select bind:value={storeLoc} disabled={busy}>
                  {#each Array(locCount) as _, i (i)}<option value={i}>{bankCode(i)}</option>{/each}
                </select>
              </label>
              <button onclick={storeToSlot} disabled={busy}>Store</button>
            </div>
          {/if}
        </section>
      {/if}

      <section>
        <h3>Offline .syx browse</h3>
        <div class="line">
          <span>Decode a preset .syx (single preset or a full bank) — no device needed</span>
          <label class="filebtn">Choose file…<input type="file" accept=".syx" onchange={decode} disabled={busy} /></label>
        </div>
        {#if decoded}
          <div class="list">
            {#each decoded as p (p.index)}
              <div class="prow"><span class="code mono">{p.code ?? '—'}</span><span class="nm">{p.name || '(unnamed)'}</span></div>
            {/each}
          </div>
        {/if}
      </section>

      {#if canFirmware}
        <section>
          <h3>Firmware</h3>
          <div class="line">
            <span>Validate a firmware .syx (integrity check only — <b>not</b> a flasher; use Fractal-Bot to flash)</span>
            <label class="filebtn">Choose file…<input type="file" accept=".syx" onchange={validateFw} disabled={busy} /></label>
          </div>
          {#if fw}<div class="fwres mono">{fw}</div>{/if}
        </section>
      {/if}

      {#if canModView}
        <section>
          <h3><button class="disc" onclick={loadModModel}>{modOpen ? '▾' : '▸'} Modifier model{#if modModel?.slotCount}&nbsp;({modModel.slotCount} slots){/if}</button></h3>
          {#if modOpen && modModel}
            {#if !modBindable}
              <p class="note">Read-only: this device's modifier model is data-only — the wire binding isn't supported here.</p>
            {/if}
            {#if typeof modModel.note === 'string'}<p class="note">{modModel.note}</p>{/if}
            {#if typeof modModel.sourcesNote === 'string'}<p class="note">{modModel.sourcesNote}</p>{/if}
            <div class="grid2">
              {#each Object.entries(modModel.fields ?? {}) as [name, f] (name)}
                <div class="fld"><span class="mono">{name}</span><span class="sym mono">{fieldSub(f)}</span></div>
              {/each}
            </div>
            {#if modModel.sources?.length}
              <p class="note">Sources: {modModel.sources.map((s) => s.name).join(', ')}</p>
            {/if}
          {/if}
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: grid; place-items: center; z-index: 60; }
  .card { width: min(680px, 94vw); max-height: 90vh; overflow: auto; background: var(--panel, #1b1c20); color: var(--fg, #e8e8ea);
    border: 1px solid var(--line, #33343a); border-radius: 12px; padding: 0 18px 18px; }
  header { position: sticky; top: 0; background: inherit; display: flex; align-items: center; gap: 10px; padding: 14px 0 10px; border-bottom: 1px solid var(--line, #33343a); }
  h2 { margin: 0; font-size: 16px; }
  .sub { opacity: 0.6; font-size: 11px; }
  .spacer { flex: 1; }
  .x { background: none; border: none; color: inherit; font-size: 15px; cursor: pointer; opacity: 0.7; }
  .x:hover { opacity: 1; }
  section { padding: 14px 0; border-bottom: 1px solid var(--line, #2a2b30); }
  h3 { margin: 0 0 10px; font-size: 13px; opacity: 0.85; }
  .line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0; font-size: 13px; }
  .line > span { opacity: 0.75; }
  select, button, .filebtn { background: var(--btn, #2a2b31); color: inherit; border: 1px solid var(--line, #3a3b42); border-radius: 7px; padding: 6px 10px; font-size: 12px; cursor: pointer; }
  button:disabled, select:disabled { opacity: 0.5; cursor: default; }
  .filebtn { position: relative; overflow: hidden; }
  .filebtn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .msg { margin: 10px 0 0; padding: 8px 10px; border-left: 3px solid var(--a); background: rgba(255,255,255,0.04); border-radius: 4px; font-size: 12px; }
  .list { margin-top: 8px; max-height: 240px; overflow: auto; border: 1px solid var(--line, #2a2b30); border-radius: 6px; }
  .prow { display: flex; gap: 12px; padding: 4px 10px; font-size: 12px; border-bottom: 1px solid var(--line, #232428); }
  .code { opacity: 0.6; min-width: 34px; }
  .fwres { margin-top: 8px; font-size: 12px; opacity: 0.9; }
  .disc { background: none; border: none; color: inherit; font-size: 13px; padding: 0; cursor: pointer; }
  .note { font-size: 11px; opacity: 0.6; margin: 6px 0; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px 12px; }
  .fld { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
  .sym { opacity: 0.5; }
  .mono { font-family: ui-monospace, monospace; }
</style>
