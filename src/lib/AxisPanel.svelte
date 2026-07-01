<script lang="ts">
  // The single "Axis" hub — one rail button opens this, replacing the separate Cloud + Privacy panels.
  // Three tabs: Account (sign-in / register / sync / contact / delete), Privacy (diagnostics consent +
  // send debug report), About (version · support · legal). Ported from CloudPanel + DiagnosticsPanel.
  import { editor } from './editor.svelte';
  import Icon from './Icon.svelte';
  import { LEGAL, openExternal } from './legal';
  import { KOFI_URL, COPYRIGHT } from './support';

  // Badge label for a granted account. Shown only when the account has an active plan.
  const planLabel = (p: string | null | undefined): string => (p === 'early_supporter' ? 'Early Supporter' : p || 'Supporter');

  const c = $derived(editor.cloud);
  const t = $derived(editor.telemetry);

  let tab = $state<'signin' | 'register'>('signin');
  let email = $state('');
  let password = $state('');
  let confirmDelete = $state(false);
  let showDetail = $state(false); // Privacy: "View what's sent" disclosure

  const view = $derived<'auth' | 'verify' | 'account'>(c.user ? 'account' : c.pendingEmail ? 'verify' : 'auth');
  const initials = $derived((c.user?.email ?? c.pendingEmail ?? '?').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?');
  const ago = $derived(c.lastSync ? `${Math.round((Date.now() - c.lastSync) / 1000)}s ago` : '');

  // Free tier: everything synced lives in the `config` bundle (no preset blobs / device backups).
  const SCOPES: { id: 'scenes' | 'fc' | 'settings'; label: string; meta: string }[] = [
    { id: 'settings', label: 'Library & settings', meta: 'tags · filters · favorites' },
    { id: 'fc', label: 'Footswitch & controllers', meta: 'layouts' },
    { id: 'scenes', label: 'Scenes & setlists', meta: 'setlists' }
  ];

  const version = (globalThis as { axisDesktop?: { version?: string } }).axisDesktop?.version ?? 'dev';

  // ── Connection & Device tab ──
  const PROFILES: { key: import('./types').ProfileKey; label: string }[] = [
    { key: 'auto', label: 'Auto-detect' }, { key: 'fm3', label: 'FM3' }, { key: 'fm9', label: 'FM9' }, { key: 'axe3', label: 'Axe-Fx III' }, { key: 'am4', label: 'AM4' }
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

  function submit() {
    if (!email.trim() || !password) return;
    if (tab === 'signin') editor.cloudLogin(email.trim(), password);
    else editor.cloudRegister(email.trim(), password);
  }
  function confirmed() {
    if (c.pendingEmail) email = c.pendingEmail;
    tab = 'signin';
    editor.cloud = { ...editor.cloud, pendingEmail: null };
  }
  const close = () => (editor.axisOpen = false);
  const soon = (what: string) => editor.showToast(`${what} — coming soon`, '#9b8cf0');
  async function sendReport() { await editor.uploadDebugReport({ kind: 'manual' }); }
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
  <div class="bg" role="presentation" onclick={close}>
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <button class="x" aria-label="Close" onclick={close}><Icon name="close" size={13} /></button>

      <div class="tabbar">
        <button class="tb" class:on={editor.axisTab === 'account'} onclick={() => (editor.axisTab = 'account')}>Account</button>
        <button class="tb" class:on={editor.axisTab === 'device'} onclick={() => editor.openAxis('device')}>Connection</button>
        <button class="tb" class:on={editor.axisTab === 'privacy'} onclick={() => (editor.axisTab = 'privacy')}>Privacy</button>
        <button class="tb" class:on={editor.axisTab === 'about'} onclick={() => (editor.axisTab = 'about')}>About</button>
      </div>

      {#if editor.axisTab === 'account'}
        {#if !c.enabled}
          <div class="pad"><p class="muted">Cloud sync isn't enabled on this engine. The editor and local backups work fully offline.</p></div>

        {:else if view === 'auth'}
          <div class="pad">
            <div class="hero">
              <div class="logo"><Icon name="cloud" size={24} /></div>
              <div class="h1">{tab === 'signin' ? 'Welcome back' : 'Create your account'}</div>
              <div class="sub">Sync your Axis config across every device — free</div>
            </div>
            <div class="tabs">
              <button class="tab" class:on={tab === 'signin'} onclick={() => (tab = 'signin')}>Sign in</button>
              <button class="tab" class:on={tab === 'register'} onclick={() => (tab = 'register')}>Create account</button>
            </div>
            <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
              <div class="field">
                <div class="lbl">EMAIL</div>
                <input class="in" type="email" placeholder="you@band.com" bind:value={email} autocomplete="email" />
              </div>
              <div class="field">
                <div class="lbl-row"><span class="lbl">PASSWORD</span>{#if tab === 'signin'}<button type="button" class="link" onclick={() => soon('Password reset')}>Forgot?</button>{/if}</div>
                <input class="in" type="password" placeholder="••••••••" bind:value={password} autocomplete={tab === 'signin' ? 'current-password' : 'new-password'} />
              </div>
              <button class="cta" type="submit">{tab === 'signin' ? 'Sign in' : 'Create account'}</button>
            </form>
            {#if c.note}<p class="note">{c.note}</p>{/if}
            {#if tab === 'register'}<p class="legal">By creating an account you agree to the <button type="button" class="link" onclick={() => openExternal(LEGAL.terms)}>Terms of Service</button> &amp; <button type="button" class="link" onclick={() => openExternal(LEGAL.privacy)}>Privacy Policy</button>.</p>{/if}
          </div>

        {:else if view === 'verify'}
          <div class="pad verify">
            <div class="mailbox"><Icon name="mail" size={28} /></div>
            <div class="h1">Check your email</div>
            <div class="sub">We sent a confirmation link to</div>
            <div class="email-chip">{c.pendingEmail}</div>
            <button class="cta" onclick={confirmed}>I've confirmed — continue</button>
            <div class="verify-actions">
              <button class="link" onclick={() => editor.cloudRegister(c.pendingEmail ?? '', password)}>Resend email</button>
              <span class="dotsep"></span>
              <button class="link dim" onclick={() => (editor.cloud = { ...editor.cloud, pendingEmail: null })}>Use a different email</button>
            </div>
          </div>

        {:else}
          <div class="profile">
            <div class="avatar">{initials}</div>
            <div class="who">
              <div class="name-row"><span class="name">{c.user?.email}</span>{#if c.paid}<span class="plan pro">{planLabel(c.plan)}</span>{/if}</div>
              <div class="email">{c.user?.email}</div>
            </div>
          </div>

          <div class="pad">
            <div class="sec">CLOUD SYNC</div>
            <div class="sync-card">
              <div class="sync-head">
                <span class="dot" style="background:{c.syncing ? '#f5a623' : '#33c46b'}; box-shadow:0 0 8px {c.syncing ? '#f5a623' : '#33c46b'}"></span>
                <div class="sync-txt">
                  <div class="st">{c.syncing ? 'Syncing…' : c.lastSync ? 'All synced' : 'Not synced yet'}</div>
                  <div class="ss">{c.syncing ? 'Pushing & pulling your config' : c.lastSync ? `Last synced ${ago}` : 'Sync to back up your Axis config'}</div>
                </div>
              </div>
              {#if c.syncing}
                <div class="bar"><div class="fill"></div></div>
              {:else}
                <button class="sync-now" onclick={() => editor.cloudSync()}><Icon name="refresh" size={15} /> Sync now</button>
              {/if}
              {#if c.note}<p class="note">{c.note}</p>{/if}
            </div>

            <button class="item auto" onclick={() => editor.setAutoSync(!c.autoSync)}>
              <span class="chk" class:on={c.autoSync}>{#if c.autoSync}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
              <span class="item-body">
                <span class="item-label">Auto-sync</span>
                <span class="item-desc">Sync config changes to the cloud automatically, shortly after you make them</span>
              </span>
            </button>

            <div class="items">
              {#each SCOPES as s}
                <button class="item" onclick={() => editor.setCloudScope(s.id, !c.scopes[s.id])}>
                  <span class="chk" class:on={c.scopes[s.id]}>{#if c.scopes[s.id]}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
                  <span class="item-label">{s.label}</span>
                  <span class="item-meta">{s.meta}</span>
                </button>
              {/each}
              {#if c.paid}
                <button class="item" onclick={() => editor.setCloudScope('presets', !c.scopes.presets)}>
                  <span class="chk" class:on={c.scopes.presets}>{#if c.scopes.presets}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
                  <span class="item-label">Presets</span>
                  <span class="item-meta">preset versions</span>
                </button>
                <button class="item backup" onclick={() => editor.cloudFullBackup()} disabled={c.syncing}>
                  <span class="chk action"><Icon name="cloud" size={13} /></span>
                  <span class="item-body">
                    <span class="item-label">Full device backup</span>
                    <span class="item-desc">Snapshot every preset on the device, then sync</span>
                  </span>
                </button>
              {/if}
            </div>

            <div class="sec mt">CONTACT</div>
            <p class="muted">Optional — leave a way to reach you if we need to follow up on a bug report. Stored with your synced config; never used for marketing.</p>
            {@render contactField('acct-contact')}

            <div class="sec mt">REMOTE CONTROL <span class="soon">beta</span></div>
            <button class="item box" onclick={() => editor.setRemoteAccess(!editor.remote.enabled)}>
              <span class="chk" class:on={editor.remote.enabled}>{#if editor.remote.enabled}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
              <span class="item-body">
                <span class="item-label">Allow remote control {#if editor.remote.enabled && editor.remote.connected}<span class="soon on">LIVE</span>{/if}</span>
                <span class="item-desc">Control this device from any browser at axisapp.live while signed into the same account. Off by default; only you can connect. Turn off any time.</span>
              </span>
            </button>

            <button class="signout" onclick={() => editor.cloudLogout()}>Sign out</button>
            {#if confirmDelete}
              <div class="danger">
                <p class="muted sm">Permanently delete your account and <strong>all</strong> cloud data (synced config, contact). This cannot be undone.</p>
                <div class="drow">
                  <button class="del" onclick={() => { editor.cloudDeleteAccount(); confirmDelete = false; }}>Delete permanently</button>
                  <button class="link" onclick={() => (confirmDelete = false)}>Cancel</button>
                </div>
              </div>
            {:else}
              <button class="dellink" onclick={() => (confirmDelete = true)}>Delete account &amp; data</button>
            {/if}
          </div>
        {/if}

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
  .muted.sm { font-size: 11px; margin-top: 4px; }

  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  .hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; margin: 8px 0 22px; }
  .logo { width: 46px; height: 46px; border-radius: 13px; background: rgba(53, 201, 214, 0.12); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 22px; color: var(--accent); }
  .logo.sm { flex: none; }
  .h1 { font-size: 20px; font-weight: 800; color: var(--text); }
  .sub { font-size: 12.5px; color: var(--textdim); margin-top: 2px; }
  .tabs { display: flex; gap: 4px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 4px; margin-bottom: 20px; }
  .tab { flex: 1; height: 38px; border-radius: 9px; border: none; background: transparent; color: var(--textdim); font-size: 13px; font-weight: 700; cursor: pointer; }
  .tab.on { background: var(--accent); color: var(--accentink); }
  form { display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 8px; }
  .lbl { font: 600 9px/1 'JetBrains Mono', monospace; color: var(--textfaint); letter-spacing: 0.1em; }
  .lbl-row { display: flex; justify-content: space-between; align-items: center; }
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
  .verify { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 26px; }
  .mailbox { width: 66px; height: 66px; border-radius: 50%; background: rgba(53, 201, 214, 0.1); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 28px; color: var(--accent); margin-bottom: 20px; }
  .verify .h1 { margin-bottom: 10px; }
  .email-chip { margin-top: 14px; padding: 10px 16px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; font: 600 13px/1 'JetBrains Mono', monospace; color: var(--accent); }
  .verify .cta { margin-top: 24px; }
  .verify-actions { display: flex; align-items: center; gap: 14px; margin-top: 18px; }
  .dotsep { width: 3px; height: 3px; border-radius: 50%; background: var(--border3); display: inline-block; }

  /* account */
  .profile { display: flex; align-items: center; gap: 15px; padding: 18px 24px 18px; border-bottom: 1px solid var(--surface2); }
  .avatar { width: 52px; height: 52px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--accent); color: var(--accentink); font: 800 19px/1 'JetBrains Mono', monospace; }
  .who { flex: 1; min-width: 0; }
  .name-row { display: flex; align-items: center; gap: 9px; }
  .name { font-size: 15px; font-weight: 800; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plan { flex: none; font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; color: var(--accentink); background: var(--ok); border-radius: 5px; padding: 4px 7px; }
  .plan.pro { background: var(--amber); }
  .email { font-size: 12.5px; color: var(--textdim); margin-top: 4px; }
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
  .items { margin-top: 16px; display: flex; flex-direction: column; }
  .item { display: flex; align-items: center; gap: 13px; padding: 11px 2px; cursor: pointer; background: none; border: none; text-align: left; width: 100%; }
  .item.box { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 14px; align-items: flex-start; }
  .item.box:hover { border-color: var(--border3); }
  .item.auto { align-items: flex-start; }
  .chk { width: 20px; height: 20px; flex: none; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border3); color: transparent; }
  .chk.on { background: var(--accent); border-color: var(--accent); color: var(--accentink); }
  .item-label { flex: 1; font-size: 13.5px; font-weight: 600; color: var(--text); }
  .item-meta { font: 600 10px/1 'JetBrains Mono', monospace; color: var(--textfaint); }
  .item-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .item-desc { font-size: 11px; color: var(--textfaint); line-height: 1.45; }
  .soon { font: 700 8px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; color: var(--accentink); background: var(--textfaint); border-radius: 4px; padding: 3px 5px; margin-left: 6px; vertical-align: middle; }
  .soon.on { background: var(--amber); }
  .signout { width: 100%; margin-top: 22px; height: 44px; background: transparent; border: 1px solid var(--border2); color: var(--text2); border-radius: 11px; cursor: pointer; font-size: 13px; font-weight: 700; }
  .signout:hover { border-color: var(--border3); color: var(--text); }
  .dellink { display: block; width: 100%; margin-top: 10px; background: none; border: none; color: var(--danger-border); font-size: 12px; font-weight: 600; cursor: pointer; }
  .dellink:hover { color: var(--danger); }
  .danger { margin-top: 12px; padding: 14px; background: rgba(214, 84, 63, 0.06); border: 1px solid rgba(214, 84, 63, 0.35); border-radius: 11px; }
  .drow { display: flex; align-items: center; gap: 14px; margin-top: 10px; }
  .del { flex: 1; height: 40px; background: var(--danger); color: var(--text); border: none; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; }
  .del:hover { background: var(--danger); }

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
</style>
