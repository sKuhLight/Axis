<script lang="ts">
  // The single "Axis" hub — one rail button opens this. Tabs: Storage (local folder + backups),
  // Connection, Performance, Privacy (diagnostics consent + send debug report), About
  // (version · support · legal).
  import { editor } from './editor.svelte';
  import { library } from './library.svelte';
  import { deviceDefs } from './deviceDefs.svelte';
  import { isDirect } from './forgefx';
  import { directBoot } from './direct.svelte';
  import Icon from './Icon.svelte';
  import { LEGAL, openExternal } from './legal';
  import { KOFI_URL, COPYRIGHT } from './support';

  const mob = $derived(editor.isMobile);

  const t = $derived(editor.telemetry);

  let showDetail = $state(false); // Privacy: "View what's sent" disclosure

  const version = (globalThis as { axisDesktop?: { version?: string } }).axisDesktop?.version ?? 'dev';

  // ── Performance tab (device-telemetry polling mode, META-17) ──
  const POLL_MODES: { key: import('./types').TelemetryMode; label: string; desc: string }[] = [
    { key: 'performance', label: 'Performance', desc: 'Snappiest reflection — the most device traffic.' },
    { key: 'balanced', label: 'Balanced', desc: 'The default — responsive with moderate background traffic.' },
    { key: 'reduced', label: 'Reduced (Live)', desc: 'Minimal background traffic for stage use — on AM4, successive front-panel edits reflect only on save / scene / channel change.' }
  ];
  const pm = $derived(editor.pollingMode);

  // ── Connection & Device tab ──
  const PROFILES: { key: import('./types').ProfileKey; label: string }[] = [
    { key: 'auto', label: 'Auto-detect' }, { key: 'fm3', label: 'FM3' }, { key: 'fm9', label: 'FM9' }, { key: 'axe3', label: 'Axe-Fx III' }, { key: 'axe2', label: 'Axe-Fx II' }, { key: 'vp4', label: 'VP4' }, { key: 'am4', label: 'AM4' }, { key: 'gen1', label: 'Axe-Fx Std/Ultra' }
  ];
  const serialPorts = $derived(editor.ports.filter((p) => p.transport === 'serial'));
  const midiIns = $derived(editor.ports.filter((p) => p.transport === 'midi' && p.dir === 'input'));
  const midiOuts = $derived(editor.ports.filter((p) => p.transport === 'midi' && p.dir === 'output'));
  let mode = $state<'serial' | 'midi'>('serial');
  let inSel = $state('');
  let outSel = $state('');
  let serSel = $state('');
  // sync the local selectors from the engine's chosen connection whenever the tab is shown
  $effect(() => {
    if (editor.axisTab !== 'device') return;
    const cc = editor.portChosen;
    mode = cc?.transport === 'midi' ? 'midi' : 'serial';
    inSel = cc?.inId ?? (cc?.transport === 'midi' ? cc.id : '') ?? '';
    outSel = cc?.outId ?? '';
    serSel = cc?.transport === 'serial' ? cc.id : '';
  });
  const applyMidi = () => { if (inSel && outSel) editor.pickPort({ transport: 'midi', id: inSel, inId: inSel, outId: outSel }); };
  const detName = $derived(editor.detected?.connected ? `${editor.detected.name}` : 'No device detected');

  const close = () => (editor.axisOpen = false);
  const soon = (what: string) => editor.showToast(`${what} — coming soon`, '#9b8cf0');
  async function sendReport() { await editor.uploadDebugReport({ kind: 'manual' }); }

  // ── Storage tab (local folder: Presets/ library + Sync/ version mirror) ──
  const loc = $derived(editor.local);
  const locAgo = $derived(loc.lastSync ? `${Math.round((Date.now() - loc.lastSync) / 1000)}s ago` : '');
  const localCount = $derived(library.entries.filter((e) => e.source === 'local').length);
  // Browser Direct: the "path" is a File System Access directory handle — the browser picker replaces
  // the native one, and the config root is just the folder's display name.
  const directPicker = isDirect() && directBoot.support.folder;
  const hasPicker = directPicker || !!(globalThis as { axisDesktop?: { pickFolder?: unknown } }).axisDesktop?.pickFolder;
  let manualPath = $state(''); // web fallback: no native dialog → type the absolute path
  async function chooseFolder() {
    if (directPicker) {
      const name = await directBoot.pickFolder();
      if (name) await editor.setLocalRoot(name);
      return;
    }
    const pick = (globalThis as { axisDesktop?: { pickFolder?: () => Promise<string | null> } }).axisDesktop?.pickFolder;
    if (!pick) return;
    const p = await pick();
    if (p) await editor.setLocalRoot(p);
  }
  function restoreFromFolder() {
    if (confirm('Import preset versions from the Sync/ folder into this PC’s version store? Existing versions are kept; nothing is overwritten.')) void editor.localRestore();
  }
</script>

{#snippet disclosure()}
  <ul class="incl">
    <li><span class="ok">included</span> the diagnostic log for this session (console + device diagnostics)</li>
    <li><span class="ok">included</span> recent app events and any error that triggered this</li>
    <li><span class="ok">included</span> your device / OS / app versions and an anonymous ID</li>
    <li><span class="ok">included</span> the contact you optionally enter below (if any)</li>
    <li><span class="no">never</span> your presets, preset names, email, file contents, or anything else identifying you</li>
  </ul>
{/snippet}

{#snippet contactField(id: string)}
  <label class="cfield" for={id}>
    <span class="clbl">CONTACT <span class="opt">optional</span></span>
    <input {id} class="in sm" type="text" maxlength="100" placeholder="Fractal forum / Reddit / email — so we can follow up"
           value={editor.contact} oninput={(e) => editor.setContact((e.currentTarget as HTMLInputElement).value)} />
  </label>
{/snippet}

{#if editor.axisOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bg" class:mob role="presentation" onclick={close}>
    <div class="card" class:mob role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <button class="x" aria-label="Close" onclick={close}><Icon name="close" size={13} /></button>

      <div class="tabbar">
        {#if loc.available}
          <button class="tb" class:on={editor.axisTab === 'storage'} onclick={() => (editor.axisTab = 'storage')}>Storage</button>
        {/if}
        <button class="tb" class:on={editor.axisTab === 'device'} onclick={() => editor.openAxis('device')}>Connection</button>
        {#if editor.hasTelemetryControl}
          <button class="tb" class:on={editor.axisTab === 'performance'} onclick={() => (editor.axisTab = 'performance')}>Performance</button>
        {/if}
        <button class="tb" class:on={editor.axisTab === 'privacy'} onclick={() => (editor.axisTab = 'privacy')}>Privacy</button>
        <button class="tb" class:on={editor.axisTab === 'about'} onclick={() => (editor.axisTab = 'about')}>About</button>
      </div>

      {#if editor.axisTab === 'storage'}
        <!-- Local storage folder: Presets/ (library on disk) + Sync/ (plain-syx version mirror) -->
        <div class="pad">
          <div class="head">
            <div class="logo sm">🗀</div>
            <div><div class="h1">Local Storage</div><div class="sub">Your library &amp; backups on disk — unlimited, no account needed</div></div>
          </div>

          <div class="sec">FOLDER</div>
          <p class="muted">Pick a folder and Axis manages two subfolders inside it: <strong>Presets/</strong> — a browsable .syx library (drop your collections in, audition without touching device slots) — and <strong>Sync/</strong> — plain .syx backups of your preset versions, readable by FM3-Edit and Fractal-Bot.</p>
          {#if loc.configured}
            <p class="statline">
              {#if loc.exists}<span class="badge ok">SET</span>{:else}<span class="badge warn">MISSING</span>{/if}
              <span class="mono pathtxt">{loc.root}</span>
            </p>
            {#if !loc.exists}
              <p class="slownote"><span class="badge warn">FOLDER MISSING</span> The folder isn't reachable (unmounted drive?). Remount it and everything recovers — or pick a new folder.</p>
            {/if}
          {/if}
          {#if hasPicker}
            <div class="drow">
              <button class="sync-now" onclick={chooseFolder}>{loc.configured ? 'Change folder…' : 'Choose folder…'}</button>
              {#if loc.configured}<button class="link dim" onclick={() => editor.setLocalRoot(null)}>Clear</button>{/if}
            </div>
          {:else}
            <label class="fld" for="loc-path"><span class="flbl">ABSOLUTE PATH</span>
              <input id="loc-path" class="in sm" type="text" placeholder="/home/you/Axis" bind:value={manualPath} />
            </label>
            <div class="drow">
              <button class="sync-now" onclick={() => manualPath.trim() && editor.setLocalRoot(manualPath.trim())}>Set folder</button>
              {#if loc.configured}<button class="link dim" onclick={() => editor.setLocalRoot(null)}>Clear</button>{/if}
            </div>
          {/if}

          {#if loc.configured}
            <div class="sec mt">PRESET LIBRARY</div>
            <p class="muted">{localCount} preset{localCount === 1 ? '' : 's'} indexed from Presets/{library.localSkipped ? ` · ${library.localSkipped} non-preset .syx skipped (IRs/firmware)` : ''}. They show up in the Preset Browser under “Local”.</p>
            <button class="sync-now" disabled={!loc.exists} onclick={() => library.refreshLocal(true).then(() => editor.showToast('Local library refreshed', '#33c46b'))}><Icon name="refresh" size={15} /> Re-scan Presets/</button>

            <div class="sec mt">LOCAL SYNC</div>
            <div class="sync-card">
              <div class="sync-head">
                <span class="dot" style="background:{loc.syncing ? '#f5a623' : loc.exists ? '#33c46b' : '#d6543f'}; box-shadow:0 0 8px {loc.syncing ? '#f5a623' : loc.exists ? '#33c46b' : '#d6543f'}"></span>
                <div class="sync-txt">
                  <div class="st">{loc.syncing ? 'Syncing…' : loc.lastSync ? 'Folder up to date' : 'Not synced yet'}</div>
                  <div class="ss">{loc.syncing ? 'Writing versions to Sync/' : loc.lastSync ? `Last synced ${locAgo}` : 'Mirror your preset versions to the folder'}</div>
                </div>
              </div>
              {#if loc.syncing}
                <div class="bar"><div class="fill"></div></div>
              {:else}
                <button class="sync-now" disabled={!loc.exists} onclick={() => editor.localSync()}><Icon name="refresh" size={15} /> Sync to folder now</button>
              {/if}
              {#if loc.note}<p class="note">{loc.note}</p>{/if}
            </div>
            <button class="item auto" onclick={() => editor.setLocalAutoSync(!loc.autoSync)}>
              <span class="chk" class:on={loc.autoSync}>{#if loc.autoSync}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
              <span class="item-body">
                <span class="item-label">Auto-sync to folder</span>
                <span class="item-desc">Mirror new snapshots &amp; backups to Sync/ automatically, shortly after they're made. Unlimited — no tier restrictions.</span>
              </span>
            </button>

            <div class="sec mt">FULL DEVICE BACKUP</div>
            <p class="muted">Snapshot every preset on the device into this PC's version store, then mirror it to Sync/ when a folder is set. Takes a few minutes on a full unit.</p>
            <button class="sync-now" disabled={loc.syncing} onclick={() => editor.fullDeviceBackup()}><Icon name="device" size={15} /> Back up every preset</button>

            <div class="sec mt">RESTORE</div>
            <p class="muted">On a fresh machine (or after data loss), re-import every version from the folder's Sync/ back into Axis. Verified against the index; never overwrites existing versions.</p>
            <button class="signout" disabled={!loc.exists || loc.syncing} onclick={restoreFromFolder}>Restore from folder…</button>
          {/if}
        </div>

      {:else if editor.axisTab === 'performance' && editor.hasTelemetryControl}
        <!-- Device polling mode (META-17): how aggressively Axis reads the device in the background. -->
        <div class="pad">
          <div class="head">
            <div class="logo sm">⚡</div>
            <div><div class="h1">Performance</div><div class="sub">How often Axis polls your device in the background</div></div>
          </div>

          <div class="sec">POLLING MODE</div>
          <p class="muted">Faster modes reflect front-panel and footswitch changes sooner, at the cost of more traffic on the device link. Slower modes keep a stage rig quiet.</p>
          <div class="modes tri">
            {#each POLL_MODES as m}
              <button class="mbtn" class:on={pm === m.key} onclick={() => editor.setPollingMode(m.key)}>{m.label}</button>
            {/each}
          </div>

          <div class="pmodes">
            {#each POLL_MODES as m}
              <div class="pmode" class:on={pm === m.key}>
                <span class="pmk">{m.label}</span>
                <span class="pmd">{m.desc}</span>
              </div>
            {/each}
          </div>
        </div>

      {:else if editor.axisTab === 'privacy'}
        <div class="pad">
          <div class="head">
            <div class="logo sm">🛡</div>
            <div><div class="h1">Privacy &amp; Diagnostics</div><div class="sub">Help fix bugs faster — anonymously</div></div>
          </div>

          <div class="sec">ANONYMOUS DIAGNOSTICS</div>
          {#if t.enabled}
            <button class="item box" onclick={() => editor.setTelemetryConsent(!t.consent)}>
              <span class="chk" class:on={t.consent}>{#if t.consent}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
              <span class="item-body">
                <span class="item-label">Send error &amp; performance data</span>
                <span class="item-desc">Anonymous diagnostics when something goes wrong. No personal data, no presets. Off by default; turn off any time.</span>
              </span>
            </button>
          {:else}
            <p class="muted">Live diagnostics aren't enabled in this build. You can still send a one-off debug report below when something breaks.</p>
          {/if}

          <div class="sec mt">SEND A DEBUG REPORT</div>
          <p class="muted">Hit a bug? Send a one-off report so we can fix it. This is a separate, explicit action — it works even with diagnostics off.</p>
          {@render contactField('diag-contact')}
          {#if showDetail}{@render disclosure()}{:else}<button class="link" onclick={() => (showDetail = true)}>View what's sent</button>{/if}
          <button class="cta" disabled={!t.uploadEnabled || t.sending} onclick={sendReport}>
            {t.sending ? 'Sending…' : 'Send debug report'}
          </button>
          {#if !t.uploadEnabled}<p class="note dim">Report upload isn't configured in this build.</p>{/if}

          <p class="legal"><button class="link" onclick={() => openExternal(LEGAL.privacy)}>Privacy Policy</button> · Anonymous ID: <span class="mono">{t.instanceId.slice(0, 8)}</span> · Axis is open-source; self-hosters can point diagnostics at their own server.</p>
        </div>

      {:else if editor.axisTab === 'device'}
        <!-- Connection & Device -->
        <div class="pad">
          <div class="head">
            <div class="logo sm">🔌</div>
            <div><div class="h1">Connection &amp; Device</div><div class="sub">Auto-detected — override if needed</div></div>
          </div>

          <div class="sec">DEVICE PROFILE</div>
          <p class="muted">Axis auto-detects your unit. Override this if you're reaching an FM3 over a MIDI→USB adapter (auto-detect can't identify it), or to force a specific model.</p>
          <select class="sel" value={editor.profileOverride ?? 'auto'} onchange={(e) => editor.pickProfile((e.currentTarget as HTMLSelectElement).value as import('./types').ProfileKey)}>
            {#each PROFILES as p}<option value={p.key}>{p.label}</option>{/each}
          </select>
          <p class="statline">
            {#if editor.profileOverride}<span class="badge warn">FORCED</span> {editor.profileOverride.toUpperCase()}
            {:else}<span class="badge ok">AUTO</span> {detName}{/if}
          </p>

          <div class="sec mt">DEFINITIONS</div>
          <p class="statline" title={deviceDefs.activeSource.detail}>
            <span class="badge" class:ok={deviceDefs.activeSource.origin !== 'bundled'}>{deviceDefs.activeSource.origin === 'bundled' ? 'BUNDLED' : 'PROFILE'}</span>
            {deviceDefs.activeSource.label}{#if editor.conn.fw} · fw {editor.conn.fw}{/if}
          </p>
          {#if deviceDefs.canRebuild}
            <p class="muted">After a firmware update, discard the definitions and read them from the device again.</p>
            <button class="signout" onclick={() => deviceDefs.rebuild()}>Re-read definitions</button>
          {/if}

          <div class="sec mt">CONNECTION</div>
          <div class="modes">
            <button class="mbtn" class:on={mode === 'serial'} onclick={() => (mode = 'serial')}>Serial (USB)</button>
            <button class="mbtn" class:on={mode === 'midi'} onclick={() => (mode = 'midi')}>MIDI</button>
          </div>

          {#if mode === 'serial'}
            <label class="fld" for="ser-port"><span class="flbl">SERIAL PORT</span>
              <select id="ser-port" class="sel" value={serSel} onchange={(e) => { serSel = (e.currentTarget as HTMLSelectElement).value; if (serSel) editor.pickPort({ transport: 'serial', id: serSel }); }}>
                <option value="">Auto-detect</option>
                {#each serialPorts as p}<option value={p.id}>{p.label}{p.fractal ? ' ★' : ''}</option>{/each}
              </select>
            </label>
          {:else}
            <p class="muted">Pick the two endpoints of your MIDI interface. For an FM3 adapter: <strong>In</strong> = the interface input carrying the FM3's MIDI Out, <strong>Out</strong> = the interface output to the FM3's MIDI In. If nothing responds, swap them.</p>
            <label class="fld" for="midi-in"><span class="flbl">MIDI IN</span>
              <select id="midi-in" class="sel" value={inSel} onchange={(e) => { inSel = (e.currentTarget as HTMLSelectElement).value; applyMidi(); }}>
                <option value="">— select —</option>
                {#each midiIns as p}<option value={p.id}>{p.label}{p.fractal ? ' ★' : ''}</option>{/each}
              </select>
            </label>
            <label class="fld" for="midi-out"><span class="flbl">MIDI OUT</span>
              <select id="midi-out" class="sel" value={outSel} onchange={(e) => { outSel = (e.currentTarget as HTMLSelectElement).value; applyMidi(); }}>
                <option value="">— select —</option>
                {#each midiOuts as p}<option value={p.id}>{p.label}{p.fractal ? ' ★' : ''}</option>{/each}
              </select>
            </label>
          {/if}

          <p class="statline">
            {#if editor.portOverride}<span class="badge warn">MANUAL</span> {editor.portChosen?.transport === 'midi' ? 'MIDI' : 'Serial'}
            {:else}<span class="badge ok">AUTO</span> {editor.portChosen ? (editor.portChosen.transport === 'midi' ? 'MIDI (auto)' : 'Serial (auto)') : 'searching…'}{/if}
          </p>

          {#if editor.slowLink}
            <p class="slownote"><span class="badge warn">SLOW LINK</span> 5-pin MIDI (~31 kbaud). Live meters &amp; CPU are paused and background polling is throttled to keep editing responsive — automatically. Switch to USB for the full-speed experience.</p>
          {/if}

          {#if editor.profileOverride || editor.portOverride}
            <button class="signout" onclick={() => { editor.pickProfile('auto'); editor.pickPort(null); }}>Reset to auto-detect</button>
          {/if}
        </div>

      {:else}
        <!-- About -->
        <div class="pad">
          <div class="head">
            <div class="logo sm">◈</div>
            <div><div class="h1">Axis</div><div class="sub">v{version} · beta</div></div>
          </div>
          <p class="muted">Axis is a free, open-source editor for Fractal devices. If it's useful to you, you can support ongoing development on Ko-fi — entirely optional, and it keeps the project going.</p>
          <button class="kofi" onclick={() => openExternal(KOFI_URL)}>☕ Support development on Ko-fi</button>
          <div class="links">
            <button class="link" onclick={() => { close(); editor.startTour(); }}>Replay app tour</button>
            <span class="dotsep"></span>
            <button class="link" onclick={() => openExternal(LEGAL.privacy)}>Privacy Policy</button>
            <span class="dotsep"></span>
            <button class="link" onclick={() => openExternal(LEGAL.terms)}>Terms</button>
            <span class="dotsep"></span>
            <button class="link" onclick={() => openExternal(LEGAL.imprint)}>Imprint</button>
          </div>
          <p class="legal">{COPYRIGHT} · Open-source · Not affiliated with Fractal Audio Systems</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; background: rgba(6, 6, 8, 0.62); backdrop-filter: blur(3px); z-index: 350; display: flex; align-items: flex-start; justify-content: center; padding: 6vh 12px 12px; }
  .card { position: relative; width: 440px; max-width: calc(100% - 24px); max-height: 86vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border2); border-radius: 16px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6); color: var(--text); font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .bg.mob { align-items: flex-end; padding: 0; }
  .card.mob { width: 100%; max-width: 100%; max-height: 92vh; border-radius: 18px 18px 0 0; animation: axsSheet 0.28s cubic-bezier(0.2, 0.85, 0.25, 1); }
  .card::-webkit-scrollbar { width: 9px; }
  .card::-webkit-scrollbar-track { background: transparent; }
  .card::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
  .x { position: absolute; top: 12px; right: 12px; z-index: 2; background: var(--surface2); border: 1px solid var(--border2); color: var(--textdim); font-size: 13px; cursor: pointer; border-radius: 8px; width: 28px; height: 28px; }
  .x:hover { color: var(--text); border-color: var(--border3); }

  .tabbar { display: flex; gap: 2px; padding: 14px 52px 0 20px; }
  .tb { flex: 1; height: 34px; border: none; background: transparent; color: var(--textdim); font-size: 12.5px; font-weight: 700; cursor: pointer; border-bottom: 2px solid transparent; }
  .tb:hover { color: var(--text2); }
  .tb.on { color: var(--accent); border-bottom-color: var(--accent); }

  .pad { padding: 18px 24px 24px; }
  .muted { font-size: 12px; color: var(--textdim); line-height: 1.5; margin: 6px 0 12px; }

  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  .logo { width: 46px; height: 46px; border-radius: 13px; background: rgba(53, 201, 214, 0.12); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 22px; color: var(--accent); }
  .logo.sm { flex: none; }
  .h1 { font-size: 20px; font-weight: 800; color: var(--text); }
  .sub { font-size: 12.5px; color: var(--textdim); margin-top: 2px; }
  .in { width: 100%; height: 46px; padding: 0 14px; background: var(--bg2); border: 1px solid var(--border2); border-radius: 11px; color: var(--text); font-size: 14px; outline: none; }
  .in.sm { height: 40px; font-size: 13px; }
  .in:focus { border-color: var(--accent); }
  .cta { width: 100%; height: 48px; margin-top: 12px; background: var(--accent); color: var(--accentink); border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .cta:hover { background: var(--accentbright); }
  .cta:disabled { opacity: 0.5; cursor: default; }
  .link { background: none; border: none; color: var(--accent); font-size: 11.5px; font-weight: 600; cursor: pointer; padding: 0; }
  .link.dim { color: var(--textdim); }
  .link:hover { filter: brightness(1.15); }
  .legal { text-align: center; margin-top: 18px; font-size: 11px; color: var(--textmuted); line-height: 1.55; }
  .note { font: 600 11.5px/1.4 'JetBrains Mono', monospace; color: var(--accent); margin-top: 12px; text-align: center; }
  .note.dim { color: var(--textfaint); }
  .mono { font-family: 'JetBrains Mono', monospace; color: var(--textdim); }

  .cfield { display: flex; flex-direction: column; gap: 7px; margin: 4px 0 6px; }
  .clbl { font: 600 9px/1 'JetBrains Mono', monospace; color: var(--textfaint); letter-spacing: 0.1em; }
  .opt { color: var(--textmuted); margin-left: 4px; }

  /* verify */
  .dotsep { width: 3px; height: 3px; border-radius: 50%; background: var(--border3); display: inline-block; }

  /* account */
  .sec { font: 700 9px/1 'JetBrains Mono', monospace; color: var(--textmuted); letter-spacing: 0.14em; margin-bottom: 12px; }
  .sec.mt { margin-top: 22px; }
  .sync-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
  .sync-head { display: flex; align-items: center; gap: 12px; }
  .dot { width: 10px; height: 10px; flex: none; border-radius: 50%; }
  .sync-txt { flex: 1; min-width: 0; }
  .st { font-size: 14px; font-weight: 700; }
  .ss { font-size: 12px; color: var(--textfaint); margin-top: 3px; }
  .bar { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-top: 15px; }
  .fill { height: 100%; width: 40%; background: var(--amber); border-radius: 3px; animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
  .sync-now { width: 100%; margin-top: 15px; height: 42px; background: transparent; border: 1px solid var(--accent-border); border-radius: 11px; cursor: pointer; color: var(--accent); font-size: 13px; font-weight: 700; }
  .sync-now:hover { background: var(--accent-tint); border-color: var(--accent); }
  .item { display: flex; align-items: center; gap: 13px; padding: 11px 2px; cursor: pointer; background: none; border: none; text-align: left; width: 100%; }
  .item.box { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 14px; align-items: flex-start; }
  .item.box:hover { border-color: var(--border3); }
  .item.auto { align-items: flex-start; }
  .chk { width: 20px; height: 20px; flex: none; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border3); color: transparent; }
  .chk.on { background: var(--accent); border-color: var(--accent); color: var(--accentink); }
  .item-label { flex: 1; font-size: 13.5px; font-weight: 600; color: var(--text); }
  .item-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .item-desc { font-size: 11px; color: var(--textfaint); line-height: 1.45; }
  .signout { width: 100%; margin-top: 22px; height: 44px; background: transparent; border: 1px solid var(--border2); color: var(--text2); border-radius: 11px; cursor: pointer; font-size: 13px; font-weight: 700; }
  .signout:hover { border-color: var(--border3); color: var(--text); }
  .drow { display: flex; align-items: center; gap: 14px; margin-top: 10px; }

  /* diagnostics disclosure */
  .incl { list-style: none; margin: 10px 0 0; padding: 12px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; font-size: 12px; color: var(--text2); line-height: 1.7; }
  .incl .ok { color: var(--accent); font: 700 9px/1 'JetBrains Mono', monospace; margin-right: 7px; }
  .incl .no { color: var(--danger); font: 700 9px/1 'JetBrains Mono', monospace; margin-right: 7px; }

  /* about */
  .kofi { width: 100%; height: 46px; margin-top: 6px; background: #13c3ff; color: var(--accentink); border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .kofi:hover { filter: brightness(1.08); }
  .links { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 18px; }

  /* connection & device tab */
  .sel { width: 100%; height: 42px; padding: 0 12px; background: var(--bg2); border: 1px solid var(--border2); border-radius: 10px; color: var(--text); font-size: 13.5px; outline: none; cursor: pointer; }
  .sel:focus { border-color: var(--accent); }
  .fld { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
  .flbl { font: 600 9px/1 'JetBrains Mono', monospace; color: var(--textfaint); letter-spacing: 0.1em; }
  .statline { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--textdim); }
  .badge { font: 700 8px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; border-radius: 4px; padding: 3px 5px; color: var(--accentink); }
  .badge.ok { background: var(--ok); }
  .badge.warn { background: var(--amber); }
  .modes { display: flex; gap: 4px; background: var(--bg2); border: 1px solid var(--border); border-radius: 11px; padding: 4px; }
  .mbtn { flex: 1; height: 36px; border-radius: 8px; border: none; background: transparent; color: var(--textdim); font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .mbtn.on { background: var(--accent); color: var(--accentink); }
  .slownote { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-top: 14px; padding: 10px 12px; background: rgba(245, 166, 35, 0.06); border: 1px solid rgba(245, 166, 35, 0.3); border-radius: 10px; font-size: 11.5px; line-height: 1.5; color: var(--text2); }

  /* performance tab */
  .modes.tri .mbtn { font-size: 12px; }
  .pmodes { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
  .pmode { display: flex; flex-direction: column; gap: 3px; padding: 11px 13px; border: 1px solid var(--border); border-radius: 11px; background: var(--bg2); }
  .pmode.on { border-color: var(--accent); background: var(--accent-tint, var(--bg2)); }
  .pmk { font-size: 12.5px; font-weight: 700; color: var(--text2); }
  .pmode.on .pmk { color: var(--accent); }
  .pmd { font-size: 11px; color: var(--textfaint); line-height: 1.5; }

  /* storage tab */
  .pathtxt { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }

  /* free-tier quota bar */
</style>
