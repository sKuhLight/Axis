<script lang="ts">
  // Axis Cloud account modal: auth (sign-in / register) → email-confirm → account (profile, sync
  // status, per-item sync toggles, full device backup, subscription). Ported from the Axis Editor
  // design. OAuth + "forgot" are rendered but deferred (toast); billing is a supporter link (Patreon).
  import { editor } from './editor.svelte';
  import Icon from './Icon.svelte';

  // Real Patreon campaign URL goes here once the page is live. Supporter tier drives `cloud.plan`.
  const SUPPORTER_URL = 'https://www.patreon.com';

  let tab = $state<'signin' | 'register'>('signin');
  let email = $state('');
  let password = $state('');
  let planOpen = $state(false);

  const c = $derived(editor.cloud);
  const view = $derived<'auth' | 'verify' | 'account'>(c.user ? 'account' : c.pendingEmail ? 'verify' : 'auth');
  const initials = $derived((c.user?.email ?? c.pendingEmail ?? '?').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?');
  const ago = $derived(c.lastSync ? `${Math.round((Date.now() - c.lastSync) / 1000)}s ago` : '');
  const planLabel = $derived((c.plan || 'Free').toUpperCase());

  const SCOPES: { id: 'presets' | 'scenes' | 'fc' | 'settings'; label: string; meta: string }[] = [
    { id: 'presets', label: 'Presets', meta: 'preset versions' },
    { id: 'scenes', label: 'Scenes & setlists', meta: 'setlists' },
    { id: 'fc', label: 'Footswitch & controllers', meta: 'layouts' },
    { id: 'settings', label: 'Global settings', meta: 'tags · filters · favorites' }
  ];
  const PERKS = ['Hosted cloud sync across devices', 'Full device backups & version history', 'Early access to new features'];

  function submit() {
    if (!email.trim() || !password) return;
    if (tab === 'signin') editor.cloudLogin(email.trim(), password);
    else editor.cloudRegister(email.trim(), password);
  }
  function confirmed() {
    // Supabase requires a fresh sign-in after email confirmation — drop to the sign-in tab, prefilled.
    if (c.pendingEmail) email = c.pendingEmail;
    tab = 'signin';
    editor.cloud = { ...editor.cloud, pendingEmail: null };
  }
  const close = () => (editor.cloudOpen = false);
  const soon = (what: string) => editor.showToast(`${what} — coming soon`, '#9b8cf0');
  const supporter = () => window.open(SUPPORTER_URL, '_blank', 'noopener');
</script>

{#if editor.cloudOpen}
  <div class="bg" role="presentation" onclick={close}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <button class="x" aria-label="Close" onclick={close}><Icon name="close" size={13} /></button>

      {#if !c.enabled}
        <div class="pad"><p class="muted">Cloud sync isn't enabled on this engine.</p></div>

      {:else if view === 'auth'}
        <!-- ── sign in / register ── -->
        <div class="pad">
          <div class="hero">
            <div class="logo"><Icon name="cloud" size={24} /></div>
            <div class="h1">{tab === 'signin' ? 'Welcome back' : 'Create your account'}</div>
            <div class="sub">Sync presets, scenes & rigs across every device</div>
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
          <div class="divider"><span>OR CONTINUE WITH</span></div>
          <div class="oauth">
            <button class="prov" onclick={() => soon('Google sign-in')}><span class="g">G</span>Google</button>
            <button class="prov" onclick={() => soon('Apple sign-in')}><span class="a"></span>Apple</button>
          </div>
          {#if tab === 'register'}<p class="legal">By creating an account you agree to the Axis Terms of Service & Privacy Policy.</p>{/if}
        </div>

      {:else if view === 'verify'}
        <!-- ── email confirmation ── -->
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
        <!-- ── account ── -->
        <div class="profile">
          <div class="avatar">{initials}</div>
          <div class="who">
            <div class="name-row"><span class="name">{c.user?.email}</span><span class="plan">{planLabel}</span></div>
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
                <div class="ss">{c.syncing ? 'Pushing & pulling changes' : c.lastSync ? `Last synced ${ago}` : 'Sync to back up your library'}</div>
              </div>
            </div>
            {#if c.syncing}
              <div class="bar"><div class="fill"></div></div>
            {:else}
              <button class="sync-now" onclick={() => editor.cloudSync()}><Icon name="refresh" size={15} /> Sync now</button>
            {/if}
            {#if c.note}<p class="note">{c.note}</p>{/if}
          </div>

          <div class="items">
            {#each SCOPES as s}
              <button class="item" onclick={() => editor.setCloudScope(s.id, !c.scopes[s.id])}>
                <span class="chk" class:on={c.scopes[s.id]}>{#if c.scopes[s.id]}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
                <span class="item-label">{s.label}</span>
                <span class="item-meta">{s.meta}</span>
              </button>
            {/each}
            <button class="item backup" onclick={() => editor.cloudFullBackup()} disabled={c.syncing}>
              <span class="chk action"><Icon name="cloud" size={13} /></span>
              <span class="item-body">
                <span class="item-label">Full device backup</span>
                <span class="item-desc">Snapshot every preset on the device, then sync</span>
              </span>
            </button>
          </div>

          <div class="sec mt">SUBSCRIPTION</div>
          <button class="row" onclick={() => (planOpen = !planOpen)}>
            <span class="row-ic"><Icon name="star" size={15} /></span>
            <span class="row-body">
              <span class="row-title">Subscription & plan</span>
              <span class="row-sub">{c.plan === 'Free' ? 'Free · become a supporter for cloud + early access' : `Axis ${c.plan}`}</span>
            </span>
            <span class="chev" class:open={planOpen}>›</span>
          </button>
          {#if planOpen}
            <div class="plan-detail">
              {#each PERKS as p}<div class="perk"><span class="tick"><Icon name="check" size={12} stroke={2.2} /></span>{p}</div>{/each}
              <button class="supporter" onclick={supporter}>{c.plan === 'Free' ? 'Become a supporter' : 'Manage on Patreon'}</button>
            </div>
          {/if}

          <button class="signout" onclick={() => editor.cloudLogout()}>Sign out</button>
          <p class="muted sm">Open-source — self-host your own cloud backend, or support the project for hosted sync.</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; background: rgba(6, 6, 8, 0.62); backdrop-filter: blur(3px); z-index: 350; display: flex; align-items: flex-start; justify-content: center; padding: 6vh 12px 12px; }
  .card { position: relative; width: 440px; max-width: calc(100% - 24px); max-height: 86vh; overflow-y: auto; background: #161619; border: 1px solid #2e2e36; border-radius: 16px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6); color: #e9e9ee; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .card::-webkit-scrollbar { width: 9px; }
  .card::-webkit-scrollbar-track { background: transparent; }
  .card::-webkit-scrollbar-thumb { background: #2a2a31; border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
  .card::-webkit-scrollbar-thumb:hover { background: #3a3a44; }
  .x { position: absolute; top: 12px; right: 12px; z-index: 2; background: #1c1c21; border: 1px solid #2a2a31; color: #8a8a94; font-size: 13px; cursor: pointer; border-radius: 8px; width: 28px; height: 28px; }
  .x:hover { color: #fff; border-color: #3f3f48; }
  .pad { padding: 22px 24px 24px; }
  .muted { font-size: 12px; color: #8a8a94; line-height: 1.45; margin: 6px 0; }
  .muted.sm { font-size: 11px; margin-top: 16px; text-align: center; }

  /* hero / auth */
  .hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; margin: 8px 0 22px; }
  .logo { width: 46px; height: 46px; border-radius: 13px; background: rgba(53, 201, 214, 0.12); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 22px; color: #35c9d6; }
  .h1 { font-size: 21px; font-weight: 800; color: #fff; }
  .sub { font-size: 13px; color: #9a9aa3; }
  .tabs { display: flex; gap: 4px; background: #0e0e10; border: 1px solid #26262c; border-radius: 12px; padding: 4px; margin-bottom: 20px; }
  .tab { flex: 1; height: 38px; border-radius: 9px; border: none; background: transparent; color: #8a8a93; font-size: 13px; font-weight: 700; cursor: pointer; }
  .tab.on { background: #35c9d6; color: #06181a; }
  form { display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 8px; }
  .lbl { font: 600 9px/1 'JetBrains Mono', monospace; color: #7a7a83; letter-spacing: 0.1em; }
  .lbl-row { display: flex; justify-content: space-between; align-items: center; }
  .in { width: 100%; height: 46px; padding: 0 14px; background: #0e0e10; border: 1px solid #2a2a31; border-radius: 11px; color: #e9e9ee; font-size: 14px; outline: none; }
  .in:focus { border-color: #35c9d6; }
  .cta { width: 100%; height: 48px; margin-top: 6px; background: #35c9d6; color: #06181a; border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .cta:hover { background: #46d6e2; }
  .link { background: none; border: none; color: #35c9d6; font-size: 11.5px; font-weight: 600; cursor: pointer; padding: 0; }
  .link.dim { color: #9a9aa3; }
  .link:hover { filter: brightness(1.15); }
  .divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #26262c; }
  .divider span { font: 600 9px/1 'JetBrains Mono', monospace; color: #56565e; letter-spacing: 0.1em; }
  .oauth { display: flex; gap: 11px; }
  .prov { flex: 1; height: 47px; display: flex; align-items: center; justify-content: center; gap: 9px; background: #1c1c21; border: 1px solid #2a2a31; border-radius: 11px; cursor: pointer; font-size: 13.5px; font-weight: 700; color: #e9e9ee; }
  .prov:hover { border-color: #3f3f48; }
  .prov .g { width: 19px; height: 19px; border-radius: 50%; background: #fff; color: #4285f4; font: 800 12px/19px sans-serif; text-align: center; }
  .prov .a { width: 19px; height: 19px; border-radius: 50%; background: #0a0a0a; border: 1px solid #3a3a44; }
  .legal { text-align: center; margin-top: 18px; font-size: 11px; color: #56565e; line-height: 1.55; }
  .note { font: 600 11.5px/1.4 'JetBrains Mono', monospace; color: #35c9d6; margin-top: 12px; text-align: center; }

  /* verify */
  .verify { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 36px; }
  .mailbox { width: 66px; height: 66px; border-radius: 50%; background: rgba(53, 201, 214, 0.1); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 28px; color: #35c9d6; margin-bottom: 20px; }
  .verify .h1 { margin-bottom: 10px; }
  .email-chip { margin-top: 14px; padding: 10px 16px; background: #0e0e10; border: 1px solid #26262c; border-radius: 10px; font: 600 13px/1 'JetBrains Mono', monospace; color: #35c9d6; }
  .verify .cta { margin-top: 24px; }
  .verify-actions { display: flex; align-items: center; gap: 14px; margin-top: 18px; }
  .dotsep { width: 3px; height: 3px; border-radius: 50%; background: #3a3a44; }

  /* account */
  .profile { display: flex; align-items: center; gap: 15px; padding: 28px 24px 20px; border-bottom: 1px solid #1d1d22; }
  .avatar { width: 58px; height: 58px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #35c9d6; color: #06181a; font: 800 21px/1 'JetBrains Mono', monospace; }
  .who { flex: 1; min-width: 0; }
  .name-row { display: flex; align-items: center; gap: 9px; }
  .name { font-size: 16px; font-weight: 800; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plan { flex: none; font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; color: #06181a; background: #f5a623; border-radius: 5px; padding: 4px 7px; }
  .email { font-size: 12.5px; color: #9a9aa3; margin-top: 5px; }
  .sec { font: 700 9px/1 'JetBrains Mono', monospace; color: #56565e; letter-spacing: 0.14em; margin-bottom: 12px; }
  .sec.mt { margin-top: 22px; }
  .sync-card { background: #0e0e10; border: 1px solid #26262c; border-radius: 14px; padding: 16px; }
  .sync-head { display: flex; align-items: center; gap: 12px; }
  .dot { width: 10px; height: 10px; flex: none; border-radius: 50%; }
  .sync-txt { flex: 1; min-width: 0; }
  .st { font-size: 14px; font-weight: 700; }
  .ss { font-size: 12px; color: #7a7a83; margin-top: 3px; }
  .bar { height: 6px; background: #1c1c21; border-radius: 3px; overflow: hidden; margin-top: 15px; }
  .fill { height: 100%; width: 40%; background: #f5a623; border-radius: 3px; animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
  .sync-now { width: 100%; margin-top: 15px; height: 42px; background: transparent; border: 1px solid #2e6f74; border-radius: 11px; cursor: pointer; color: #35c9d6; font-size: 13px; font-weight: 700; }
  .sync-now:hover { background: #0d1516; border-color: #35c9d6; }
  .items { margin-top: 16px; display: flex; flex-direction: column; }
  .item { display: flex; align-items: center; gap: 13px; padding: 11px 2px; cursor: pointer; background: none; border: none; text-align: left; }
  .item:disabled { opacity: 0.55; cursor: default; }
  .item.backup { padding: 13px 2px; margin-top: 4px; border-top: 1px solid #1d1d22; align-items: flex-start; }
  .chk { width: 20px; height: 20px; flex: none; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid #3a3a44; color: transparent; font: 700 12px/1 sans-serif; }
  .chk.on { background: #35c9d6; border-color: #35c9d6; color: #06181a; }
  .chk.action { background: #141417; border-color: #26262c; color: #35c9d6; }
  .item-label { flex: 1; font-size: 13.5px; font-weight: 600; color: #e3e3e8; }
  .item-meta { font: 600 10px/1 'JetBrains Mono', monospace; color: #6e6e78; }
  .item-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .item-desc { font-size: 11px; color: #7a7a83; }
  .row { width: 100%; display: flex; align-items: center; gap: 13px; padding: 13px; border-radius: 12px; cursor: pointer; background: none; border: none; text-align: left; }
  .row:hover { background: #1a1a1f; }
  .row-ic { width: 30px; height: 30px; flex: none; border-radius: 9px; background: #141417; border: 1px solid #26262c; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #f5a623; }
  .row-body { flex: 1; min-width: 0; }
  .row-title { display: block; font-size: 13.5px; font-weight: 700; color: #e3e3e8; }
  .row-sub { display: block; font-size: 11.5px; color: #7a7a83; margin-top: 2px; }
  .chev { color: #56565e; font-size: 18px; transition: transform 0.15s; }
  .chev.open { transform: rotate(90deg); }
  .plan-detail { padding: 4px 13px 12px 56px; display: flex; flex-direction: column; gap: 9px; }
  .perk { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: #cfcfd6; }
  .tick { color: #35c9d6; font-size: 12px; }
  .supporter { align-self: flex-start; margin-top: 4px; padding: 0 18px; height: 40px; background: #f5a623; color: #1a1206; border: none; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 800; }
  .supporter:hover { filter: brightness(1.08); }
  .signout { width: 100%; margin-top: 20px; height: 44px; background: transparent; border: 1px solid #2e2e36; color: #cfcfd6; border-radius: 11px; cursor: pointer; font-size: 13px; font-weight: 700; }
  .signout:hover { border-color: #3f3f48; color: #fff; }
</style>
