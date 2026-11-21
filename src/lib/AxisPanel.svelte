<script lang="ts">
  // The single "Axis" hub — one rail button opens this, replacing the separate Cloud + Privacy panels.
  // Tabs: Account (sign-in / register / sync / contact / delete), Privacy (diagnostics consent +
  // send debug report), About (version · support · legal), Debug (device diagnostics). Ported from CloudPanel + DiagnosticsPanel.
  import { editor } from './editor.svelte';
  import { library } from './library.svelte';
  import { deviceDefs } from './deviceDefs.svelte';
  import { isDirect } from './forgefx';
  import { directBoot } from './direct.svelte';
  import Icon from './Icon.svelte';
  import { tick, untrack } from 'svelte';
  import { computeTabOverflow, splitTabs, nextMenuIndex, toLayoutPx, menuAnchorPlacement } from './tabOverflow';
  import { effectiveZoom, resolveMenuPlacement } from './workbench/svelte/contextMenu';
  import DiagnosticsPanel from './DiagnosticsPanel.svelte';
  import { LEGAL, openExternal } from './legal';
  import { KOFI_URL, COPYRIGHT } from './support';

  const mob = $derived(editor.isMobile);

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
  /** Full device backup — on the free plan a new backup replaces the retained one in the cloud. */
  function fullBackup() {
    if (!c.paid && !confirm('The free plan keeps your most recent full backup in the cloud — this backup replaces the previous one there. (Your local versions and the local folder keep everything.) Continue?')) return;
    void editor.cloudFullBackup();
  }

  // ── Tab bar: one row; the trailing tabs that don't fit collapse into a "⋯" menu ──
  type TabId = typeof editor.axisTab;
  const tabs = $derived<{ id: TabId; label: string }[]>([
    { id: 'account', label: 'Account' },
    ...(loc.available ? [{ id: 'storage' as const, label: 'Storage' }] : []),
    { id: 'device', label: 'Connection' },
    ...(editor.hasTelemetryControl ? [{ id: 'performance' as const, label: 'Performance' }] : []),
    { id: 'privacy', label: 'Privacy' },
    { id: 'about', label: 'About' },
    { id: 'debug', label: 'Debug' }
  ]);
  /** Same behaviour as the old inline buttons: Connection goes through openAxis (loads the ports), the rest set the tab. */
  const selectTab = (id: TabId) => { if (id === 'device') editor.openAxis('device'); else editor.axisTab = id; };

  // Measurement: a hidden twin row (.tbmeasure) renders every tab at its natural width, so the real bar only
  // ever contains the tabs that fit. Re-measured by ResizeObserver (card width, desktop card <-> .mob sheet,
  // font load) and whenever the conditional tabs (Storage / Performance) appear or disappear.
  // The card reserves its scrollbar gutter permanently (`scrollbar-gutter: stable`), so the bar's width — with the
  // real scrollbar width, 0 for overlay scrollbars — is the same for short and tall tabs and the split never reshuffles.
  let cardEl = $state<HTMLElement>();
  let barEl = $state<HTMLElement>();
  let measureEl = $state<HTMLElement>();
  let measured = $state(false);
  let avail = $state(0);
  let gap = $state(0);
  let moreW = $state(0);
  let widthById = $state<Record<string, number>>({});

  /** Everything is measured in LAYOUT px. With the UI-scale setting (a CSS `zoom` on <html>), Chromium reports
   *  getBoundingClientRect() in zoomed (visual) px while offsetWidth / computed styles stay in layout px; mixing the
   *  two overestimates the room at >100%. The card's visual/layout width ratio is the effective zoom (1 without
   *  zoom), and every gBCR width is divided by it. */
  const zoomOf = () => (cardEl ? effectiveZoom(cardEl.getBoundingClientRect().width, cardEl.offsetWidth) : 1);

  function measureBar() {
    if (!cardEl || !barEl || !measureEl) return;
    const z = zoomOf();
    const cs = getComputedStyle(barEl);
    const inner = toLayoutPx(barEl.getBoundingClientRect().width, z) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (!(inner > 0)) return; // not laid out (yet) — keep the last good measurement
    const next: Record<string, number> = {};
    for (const el of measureEl.querySelectorAll<HTMLElement>('[data-m]')) next[el.dataset.m!] = Math.ceil(toLayoutPx(el.getBoundingClientRect().width, z));
    const nAvail = Math.floor(inner);
    const nGap = parseFloat(cs.columnGap) || 0;
    const nMore = next.more ?? 0;
    if (nAvail !== avail) avail = nAvail;
    if (nGap !== gap) gap = nGap;
    if (nMore !== moreW) moreW = nMore;
    if (JSON.stringify(next) !== JSON.stringify(widthById)) widthById = next;
    measured = true;
  }
  $effect(() => {
    if (!barEl || !measureEl) return;
    const ro = new ResizeObserver(() => measureBar());
    ro.observe(barEl);
    ro.observe(measureEl);
    untrack(measureBar); // synchronous first read; the observer then keeps it current
    return () => ro.disconnect();
  });
  $effect(() => { void tabs.length; void mob; untrack(measureBar); });

  // Until the first measurement every tab is shown (the effect above runs before the first paint).
  const overflow = $derived(measured ? computeTabOverflow(tabs.map((t) => widthById[t.id] ?? 0), avail, moreW, gap) : { visible: tabs.length, hasMore: false });
  const parts = $derived(splitTabs(tabs, overflow.visible, editor.axisTab));

  // The ⋯ menu. It is `position: fixed` (placed from the ⋯ button's rect) so the card's `overflow-y: auto` can't clip
  // it when the tab content is short, and it keeps working on the mobile sheet.
  let menuOpen = $state(false);
  let menuPos = $state<{ left: number; top: number } | null>(null);
  let moreWrap = $state<HTMLElement>();
  let moreBtn = $state<HTMLButtonElement>();
  let menuEl = $state<HTMLElement>();
  const activeLabel = $derived(parts.hidden.find((t) => t.id === editor.axisTab)?.label ?? '');
  const menuItems = () => (menuEl ? [...menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')] : []);

  /** Below the ⋯ button (above it when there is no room below, e.g. the bottom sheet), right edges aligned, clamped to
   *  the viewport; fed through the shared zoom-aware placement (visual coords in, layout left/top out) so it also
   *  lands correctly under the UI-scale zoom. */
  function placeMenu() {
    if (!menuOpen || !menuEl || !moreBtn) return;
    const z = zoomOf();
    const anchor = moreBtn.getBoundingClientRect();
    const box = menuEl.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const p = resolveMenuPlacement(
      menuAnchorPlacement(anchor, { width: box.width, height: box.height }, viewport, 4 * z),
      viewport,
      { width: box.width, height: box.height },
      z
    );
    if (!menuPos || menuPos.left !== p.x || menuPos.top !== p.y) menuPos = { left: p.x, top: p.y };
  }
  async function openMenu(at: 'active' | 'first' | 'last' = 'active') {
    menuOpen = true;
    await tick();
    placeMenu();
    await tick(); // the menu is visibility:hidden until placed, and a hidden item can't take focus
    const items = menuItems();
    const ai = parts.hidden.findIndex((t) => t.id === editor.axisTab);
    items[at === 'last' ? items.length - 1 : at === 'first' || ai < 0 ? 0 : ai]?.focus();
  }
  function closeMenu(refocus: boolean) {
    if (!menuOpen) return;
    menuOpen = false;
    menuPos = null;
    if (refocus) moreBtn?.focus();
  }
  const toggleMenu = () => (menuOpen ? closeMenu(true) : void openMenu());
  function onMoreKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); void openMenu('first'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); void openMenu('last'); }
  }
  function onMenuKey(e: KeyboardEvent) {
    const items = menuItems();
    const cur = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[nextMenuIndex(cur, e.key === 'ArrowDown' ? 1 : -1, items.length)]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') closeMenu(true); // focus lands on ⋯, the default Tab then moves on from there
  }
  function pickFromMenu(id: TabId) { selectTab(id); closeMenu(true); }
  // Escape closes only the menu (capture + stop, so the page-level Escape handler doesn't also act on it);
  // a press outside the ⋯ button + menu closes it without stealing focus from whatever was clicked.
  function onWinKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  }
  function onWinPointer(e: PointerEvent) {
    if (moreWrap && !moreWrap.contains(e.target as Node)) closeMenu(false);
  }
  // The mobile sheet slides in (CSS animation on the card): a menu opened — or placed — mid-slide used the button's
  // in-flight rect, so re-place once the slide has finished.
  function onCardAnimationEnd(e: AnimationEvent) {
    if (e.target === e.currentTarget) placeMenu();
  }
  // Window listeners exist only while the menu is open; the fixed menu follows the ⋯ button on resize / card scroll.
  $effect(() => {
    if (!menuOpen) return;
    const card = cardEl;
    window.addEventListener('keydown', onWinKey, true);
    window.addEventListener('pointerdown', onWinPointer, true);
    window.addEventListener('resize', placeMenu);
    card?.addEventListener('scroll', placeMenu, { passive: true });
    return () => {
      window.removeEventListener('keydown', onWinKey, true);
      window.removeEventListener('pointerdown', onWinPointer, true);
      window.removeEventListener('resize', placeMenu);
      card?.removeEventListener('scroll', placeMenu);
    };
  });
  // (Re)place when the menu mounts or the split moves the ⋯ button.
  $effect(() => { void menuEl; void overflow.visible; void avail; untrack(placeMenu); });
  // The menu can't outlive the dialog or the overflow, and a split change while it is open must not drop keyboard
  // focus to <body> when the focused item (or the whole ⋯ button) disappears.
  $effect(() => {
    const open = editor.axisOpen;
    const hasMore = overflow.hasMore;
    void parts.hidden.map((t) => t.id).join(',');
    untrack(() => {
      if (!menuOpen) return;
      const lost = !document.activeElement || document.activeElement === document.body;
      if (!open || !hasMore) {
        menuOpen = false;
        menuPos = null;
        if (open && lost) barEl?.querySelector<HTMLElement>('.tb.on')?.focus(); // the ⋯ is gone: land on the (now visible) active tab
      } else if (lost) (menuItems()[0] ?? moreBtn)?.focus();
    });
  });
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
    <div class="card" class:mob role="dialog" tabindex="-1" bind:this={cardEl} onclick={(e) => e.stopPropagation()} onanimationend={onCardAnimationEnd}>
      <button class="x" aria-label="Close" onclick={close}><Icon name="close" size={13} /></button>

      <div class="tabbar" bind:this={barEl}>
        {#each parts.shown as t (t.id)}
          <button class="tb" class:on={editor.axisTab === t.id} aria-current={editor.axisTab === t.id ? 'true' : undefined} onclick={() => selectTab(t.id)}>{t.label}</button>
        {/each}
        {#if overflow.hasMore}
          <div class="more" bind:this={moreWrap}>
            <button class="tb more-btn" class:on={parts.activeHidden} bind:this={moreBtn} aria-label={parts.activeHidden ? `More tabs (${activeLabel} selected)` : 'More tabs'} title="More"
                    aria-haspopup="menu" aria-expanded={menuOpen} onclick={toggleMenu} onkeydown={onMoreKey}>&#x22EF;</button>
            {#if menuOpen}
              <div class="menu" role="menu" aria-label="More tabs" tabindex="-1" bind:this={menuEl} onkeydown={onMenuKey}
                   style:left={menuPos ? `${menuPos.left}px` : undefined} style:top={menuPos ? `${menuPos.top}px` : undefined} style:visibility={menuPos ? undefined : 'hidden'}>
                {#each parts.hidden as t (t.id)}
                  <button class="mi" class:on={editor.axisTab === t.id} role="menuitem" tabindex="-1" aria-current={editor.axisTab === t.id ? 'true' : undefined} onclick={() => pickFromMenu(t.id)}>
                    <span>{t.label}</span>
                    {#if editor.axisTab === t.id}<Icon name="check" size={13} />{/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <!-- Hidden twin of the bar: every tab (+ the ⋯ button) at natural width, measured to decide the split. Inert + aria-hidden: never focusable or announced. -->
      <div class="tbclip" aria-hidden="true" inert>
        <div class="tbmeasure" bind:this={measureEl}>
          {#each tabs as t (t.id)}<button class="tb tbm" tabindex="-1" data-m={t.id}>{t.label}</button>{/each}
          <button class="tb tbm more-btn" tabindex="-1" data-m="more">&#x22EF;</button>
        </div>
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
              <button class="item" onclick={() => editor.setCloudScope('presets', !c.scopes.presets)}>
                <span class="chk" class:on={c.scopes.presets}>{#if c.scopes.presets}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
                <span class="item-label">Presets</span>
                <span class="item-meta">{c.paid ? 'preset versions' : 'newest backup + snapshots'}</span>
              </button>
              <button class="item backup" onclick={fullBackup} disabled={c.syncing}>
                <span class="chk action"><Icon name="cloud" size={13} /></span>
                <span class="item-body">
                  <span class="item-label">Full device backup</span>
                  <span class="item-desc">Snapshot every preset on the device, then sync{c.paid ? '' : ' — the free plan keeps your most recent full backup in the cloud'}</span>
                </span>
              </button>
            </div>

            {#if !c.paid && c.quota?.limits}
              {@const q = c.quota}
              {@const pct = Math.min(100, Math.round((q.usedBytes / q.limits!.maxStoredBytes) * 100))}
              <div class="quota" class:warn={pct >= 80} class:full={pct >= 100}>
                <div class="q-row">
                  <span class="q-lbl">CLOUD STORAGE</span>
                  <span class="q-val mono">{(q.usedBytes / 1048576).toFixed(2)} / {(q.limits!.maxStoredBytes / 1048576).toFixed(0)} MB · {q.snapshots} of {q.limits!.maxSnapshots} snapshots</span>
                </div>
                <div class="q-bar"><div class="q-fill" style="width:{pct}%"></div></div>
              </div>
            {/if}

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

      {:else if editor.axisTab === 'storage'}
        <!-- Local storage folder: Presets/ (library on disk) + Sync/ (plain-syx version mirror) -->
        <div class="pad">
          <div class="head">
            <div class="logo sm">🗀</div>
            <div><div class="h1">Local Storage</div><div class="sub">Your library &amp; backups on disk — unlimited, no account needed</div></div>
          </div>

          <div class="sec">FOLDER</div>
          <p class="muted">Pick a folder and Axis manages two subfolders inside it: <strong>Presets/</strong> — a browsable .syx library (drop your collections in, audition without touching device slots) — and <strong>Sync/</strong> — plain .syx backups of your preset versions, readable by FM3-Edit and Fractal-Bot. Works with or without cloud sync.</p>
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

      {:else if editor.axisTab === 'debug'}
        <!-- Debugging: device diagnostics (gated probe run → redacted result → save locally / upload) -->
        <DiagnosticsPanel />

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
            <span class="badge" class:ok={deviceDefs.activeSource.origin !== 'bundled'} class:warn={deviceDefs.activeSource.stale}>{deviceDefs.activeSource.origin === 'bundled' ? 'BUNDLED' : 'PROFILE'}</span>
            {deviceDefs.activeSource.label}{#if editor.conn.fw} · fw {editor.conn.fw}{/if}
          </p>
          {#if deviceDefs.canRebuild}
            {#if deviceDefs.activeSource.stale}
              <p class="muted">{deviceDefs.staleCopy.panel}</p>
            {:else}
              <p class="muted">After a firmware update, discard the definitions and read them from the device again.</p>
            {/if}
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
  .card { position: relative; scrollbar-gutter: stable; width: 440px; max-width: calc(100% - 24px); max-height: 86vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border2); border-radius: 16px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6); color: var(--text); font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .bg.mob { align-items: flex-end; padding: 0; }
  .card.mob { width: 100%; max-width: 100%; max-height: 92vh; border-radius: 18px 18px 0 0; animation: axsSheet 0.28s cubic-bezier(0.2, 0.85, 0.25, 1); }
  .card::-webkit-scrollbar { width: 9px; }
  .card::-webkit-scrollbar-track { background: transparent; }
  .card::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
  .x { position: absolute; top: 12px; right: 12px; z-index: 2; background: var(--surface2); border: 1px solid var(--border2); color: var(--textdim); font-size: 13px; cursor: pointer; border-radius: 8px; width: 28px; height: 28px; }
  .x:hover { color: var(--text); border-color: var(--border3); }

  /* ONE row. Up to 7 tabs don't fit a 440px card (or a ~375px sheet), so the trailing ones that don't fit collapse
     into the ⋯ menu (.more / .menu) instead of scrolling sideways behind a hidden scrollbar — the script measures a
     hidden twin row (.tbclip > .tbmeasure) and renders only the tabs that fit. The right padding reserves the
     absolutely positioned close button (.x: right 12 + 28 wide = 40px, plus a 12px gutter), so neither a tab nor
     the ⋯ button can sit under it. */
  .tabbar { display: flex; gap: 2px; padding: 14px 52px 0 20px; }
  .tb { flex: 1 0 auto; padding: 0 8px; height: 34px; border: none; background: transparent; color: var(--textdim); font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer; border-bottom: 2px solid transparent; }
  .tb:hover { color: var(--text2); }
  .tb.on { color: var(--accent); border-bottom-color: var(--accent); }
  .more-btn { padding: 0 10px; font-size: 16px; line-height: 1; }
  .more { position: relative; flex: 0 0 auto; display: flex; }
  .menu { position: fixed; z-index: 5; min-width: 156px; padding: 4px; display: flex; flex-direction: column; gap: 1px; background: var(--surface2); border: 1px solid var(--border2); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); }
  .mi { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 34px; padding: 0 10px; border: none; border-radius: 7px; background: transparent; color: var(--textdim); font: inherit; font-size: 12.5px; font-weight: 700; text-align: left; white-space: nowrap; cursor: pointer; }
  .mi:hover, .mi:focus-visible { background: var(--accent-tint); color: var(--text); outline: none; }
  .mi.on { color: var(--accent); }
  /* hidden measuring twin: out of flow, zero-height + clipped so it never adds scrollable overflow to the card */
  .tbclip { position: absolute; left: 0; top: 0; width: 100%; height: 0; overflow: hidden; visibility: hidden; pointer-events: none; }
  .tbmeasure { display: flex; gap: 2px; width: max-content; }
  .tbm { flex: 0 0 auto; }

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
  .quota { margin-top: 14px; padding: 12px 14px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; }
  .quota.warn { border-color: rgba(245, 166, 35, 0.45); }
  .quota.full { border-color: rgba(214, 84, 63, 0.55); }
  .q-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .q-lbl { font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.12em; color: var(--textmuted); }
  .q-val { font-size: 10.5px; color: var(--textdim); }
  .q-bar { height: 6px; margin-top: 9px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
  .q-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s ease; }
  .quota.warn .q-fill { background: var(--amber); }
  .quota.full .q-fill { background: var(--danger); }
</style>
