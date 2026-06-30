<script lang="ts">
  // Cloud account + sync panel. Functional first pass — login/register, sync status, sign out.
  // Only reachable when the engine reports cloud enabled (AXIS_CLOUD). Visual polish later.
  import { editor } from './editor.svelte';

  let mode = $state<'login' | 'register'>('login');
  let email = $state('');
  let password = $state('');
  const c = $derived(editor.cloud);
  const ago = $derived(c.lastSync ? `${Math.round((Date.now() - c.lastSync) / 1000)}s ago` : '');

  function submit() {
    if (!email.trim() || !password) return;
    if (mode === 'login') editor.cloudLogin(email.trim(), password);
    else editor.cloudRegister(email.trim(), password);
  }
</script>

{#if editor.cloudOpen}
  <div class="bg" role="presentation" onclick={() => (editor.cloudOpen = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="head">
        <span class="title">☁ Axis Cloud</span>
        <button class="x" aria-label="Close" onclick={() => (editor.cloudOpen = false)}>✕</button>
      </div>

      {#if !c.enabled}
        <p class="muted">Cloud sync isn't enabled on this engine.</p>
      {:else if c.user}
        <!-- signed in -->
        <div class="who"><span class="dot"></span><span class="email">{c.user.email}</span></div>
        <p class="muted">Your config (tags, collections, favorites, saved filters, layouts) syncs to the cloud.</p>
        <div class="row">
          <button class="primary" onclick={() => editor.cloudSync()} disabled={c.syncing}>{c.syncing ? 'Syncing…' : 'Sync now'}</button>
          <button class="ghost" onclick={() => editor.cloudLogout()}>Sign out</button>
        </div>
        {#if c.lastSync}<p class="status">Last synced {ago}</p>{/if}
        {#if c.note}<p class="note">{c.note}</p>{/if}
      {:else}
        <!-- auth -->
        <div class="tabs">
          <button class="tab" class:on={mode === 'login'} onclick={() => (mode = 'login')}>Sign in</button>
          <button class="tab" class:on={mode === 'register'} onclick={() => (mode = 'register')}>Create account</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
          <input class="in" type="email" placeholder="email" bind:value={email} autocomplete="email" />
          <input class="in" type="password" placeholder="password" bind:value={password} autocomplete="current-password" />
          <button class="primary wide" type="submit">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        {#if c.note}<p class="note">{c.note}</p>{/if}
        <p class="muted sm">Sync backs up your config + (soon) presets. Open-source — self-host your own backend.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 350; display: flex; align-items: center; justify-content: center; }
  .card { width: 360px; max-width: calc(100% - 32px); background: #141417; border: 1px solid #2a2a31; border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); padding: 16px; color: #e9e9ee; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .title { font-size: 15px; font-weight: 800; }
  .x { background: none; border: none; color: #8a8a94; font-size: 15px; cursor: pointer; border-radius: 7px; width: 26px; height: 26px; }
  .x:hover { background: #1c1c22; color: #fff; }
  .muted { font-size: 12px; color: #8a8a94; line-height: 1.45; margin: 6px 0; }
  .muted.sm { font-size: 11px; margin-top: 12px; }
  .tabs { display: flex; gap: 4px; background: #0e0e11; border: 1px solid #26262c; border-radius: 9px; padding: 3px; margin-bottom: 12px; }
  .tab { flex: 1; padding: 7px; border-radius: 7px; border: none; background: transparent; color: #9a9aa3; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .tab.on { background: var(--accent, #35c9d6); color: #06181a; }
  form { display: flex; flex-direction: column; gap: 8px; }
  .in { background: #0e0e11; border: 1px solid #2e2e36; border-radius: 9px; padding: 10px 12px; color: #e9e9ee; font-size: 13px; outline: none; }
  .in:focus { border-color: var(--accent, #35c9d6); }
  .primary { background: var(--accent, #35c9d6); color: #06181a; border: none; border-radius: 9px; padding: 10px 14px; font-size: 13px; font-weight: 800; cursor: pointer; }
  .primary:disabled { opacity: 0.6; cursor: default; }
  .primary.wide { width: 100%; margin-top: 2px; }
  .ghost { background: transparent; border: 1px solid #2e2e36; color: #cfcfd6; border-radius: 9px; padding: 10px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .ghost:hover { border-color: #3f3f48; color: #fff; }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  .row .primary { flex: 1; }
  .who { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .who .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok, #33c46b); box-shadow: 0 0 8px var(--ok, #33c46b); }
  .email { font-size: 13.5px; font-weight: 700; }
  .status { font: 600 11px/1 'JetBrains Mono', monospace; color: #6e6e78; margin-top: 10px; }
  .note { font: 600 11.5px/1.4 'JetBrains Mono', monospace; color: var(--accent, #35c9d6); margin-top: 10px; }
</style>
