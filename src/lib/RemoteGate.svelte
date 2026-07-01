<script lang="ts">
  // Full-screen gate for the remote web app (axisapp.live): sign in, then connect to the user's PC over
  // the relay. Shown until the remote session is live; once ready, +page renders the normal Axis UI.
  import { remoteBoot } from './remote.svelte';
  import { LEGAL } from './legal';
  import { COPYRIGHT } from './support';

  let email = $state('');
  let password = $state('');
  const b = $derived(remoteBoot);
</script>

<div class="bg">
  <div class="card">
    <div class="brand">
      <svg width="34" height="34" viewBox="0 0 30 30"><circle cx="9" cy="9" r="3.4" fill="#35c9d6" /><circle cx="21" cy="9" r="3.4" fill="#4f6bed" /><circle cx="15" cy="21" r="3.4" fill="#f5a623" /><path d="M9 9 L21 9 L15 21 Z" fill="none" stroke="#3a3a44" stroke-width="1.6" /></svg>
      <div><div class="h1">Axis Remote</div><div class="sub">Control your rig from anywhere</div></div>
    </div>

    {#if b.phase === 'connecting'}
      <div class="state"><div class="spinner"></div><div class="st">Connecting to your PC…</div><div class="ss">Reaching Axis on your computer over the secure relay.</div></div>
    {:else if b.phase === 'ready'}
      <div class="state"><div class="st ok">Connected</div></div>
    {:else if b.phase === 'error'}
      <div class="state">
        <div class="st warn">Couldn't connect</div>
        <div class="ss">{b.note ?? 'The relay could not reach your PC.'}</div>
        <div class="hint">Make sure Axis is running on your computer and <strong>Remote Control</strong> is enabled (Axis → Account → Remote Control), then retry.</div>
        <button class="cta" onclick={() => b.retry()}>Back to sign in</button>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); b.signIn(email, password); }}>
        <div class="field"><div class="lbl">EMAIL</div><input class="in" type="email" placeholder="you@band.com" bind:value={email} autocomplete="email" /></div>
        <div class="field"><div class="lbl">PASSWORD</div><input class="in" type="password" placeholder="••••••••" bind:value={password} autocomplete="current-password" /></div>
        <button class="cta" type="submit">Sign in &amp; connect</button>
        {#if b.note}<p class="note">{b.note}</p>{/if}
        <p class="legal">Connects to the Axis running on your own PC — we never touch your presets.</p>
      </form>
    {/if}
  </div>

  <footer class="foot">
    <a href={LEGAL.privacy} target="_blank" rel="noreferrer">Privacy</a>
    <span class="dot"></span>
    <a href={LEGAL.terms} target="_blank" rel="noreferrer">Terms</a>
    <span class="dot"></span>
    <a href={LEGAL.imprint} target="_blank" rel="noreferrer">Imprint</a>
    <span class="cr">{COPYRIGHT} · Not affiliated with Fractal Audio Systems</span>
  </footer>
</div>

<style>
  .bg { position: fixed; inset: 0; background: var(--bg, #0b0b0d); display: flex; align-items: center; justify-content: center; padding: 24px; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .card { width: 380px; max-width: 100%; background: #161619; border: 1px solid #2e2e36; border-radius: 16px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6); padding: 26px 24px 22px; color: #e9e9ee; }
  .brand { display: flex; align-items: center; gap: 13px; margin-bottom: 22px; }
  .h1 { font-size: 20px; font-weight: 800; color: #fff; }
  .sub { font-size: 12.5px; color: #9a9aa3; margin-top: 2px; }
  form { display: flex; flex-direction: column; gap: 15px; }
  .field { display: flex; flex-direction: column; gap: 8px; }
  .lbl { font: 600 9px/1 'JetBrains Mono', monospace; color: #7a7a83; letter-spacing: 0.1em; }
  .in { width: 100%; height: 46px; padding: 0 14px; background: #0e0e10; border: 1px solid #2a2a31; border-radius: 11px; color: #e9e9ee; font-size: 14px; outline: none; }
  .in:focus { border-color: #35c9d6; }
  .cta { width: 100%; height: 48px; margin-top: 8px; background: #35c9d6; color: #06181a; border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .cta:hover { background: #46d6e2; }
  .note { font: 600 11.5px/1.4 'JetBrains Mono', monospace; color: #f5a623; margin: 4px 0 0; text-align: center; }
  .legal { text-align: center; margin-top: 14px; font-size: 11px; color: #56565e; line-height: 1.55; }
  .foot { position: absolute; bottom: 16px; left: 0; right: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; padding: 0 16px; font-size: 11px; color: #6e6e78; }
  .foot a { color: #9a9aa3; text-decoration: none; }
  .foot a:hover { color: #cfcfd6; }
  .foot .dot { width: 3px; height: 3px; border-radius: 50%; background: #3a3a44; }
  .foot .cr { flex-basis: 100%; text-align: center; color: #56565e; margin-top: 2px; }
  .state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 14px 0 6px; }
  .st { font-size: 16px; font-weight: 800; color: #fff; }
  .st.ok { color: #33c46b; }
  .st.warn { color: #f5a623; }
  .ss { font-size: 12.5px; color: #9a9aa3; }
  .hint { font-size: 12px; color: #b9b9c2; background: #0e0e10; border: 1px solid #26262c; border-radius: 10px; padding: 12px; margin-top: 8px; line-height: 1.5; }
  .spinner { width: 34px; height: 34px; border: 3px solid #2a2a31; border-top-color: #35c9d6; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 4px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
