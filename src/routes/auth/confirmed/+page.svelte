<script lang="ts">
  // Email-confirmation landing page. Supabase redirects here after verifying the sign-up link
  // (emailRedirectTo → see ForgeFX runtime/cloud.ts). Auth is headless (email/password), so this page
  // carries NO session and does NOT sign anyone in — it only needs to be a stable, friendly page that
  // works for every client (desktop, portable, cloud, mobile), because the link always opens in a
  // normal browser. The user returns to the app and signs in with their password.
  import { theme } from '$lib/theme.svelte';
  if (typeof document !== 'undefined') theme.init();
</script>

<svelte:head><title>Axis — E-Mail bestätigt</title></svelte:head>

<main>
  <div class="card">
    <div class="check" aria-hidden="true">✓</div>
    <h1>E-Mail bestätigt</h1>
    <p>Dein Axis-Konto ist jetzt aktiv. Du kannst dieses Fenster schließen und dich in der Axis-App mit deiner E-Mail und deinem Passwort anmelden.</p>
    <a class="btn" href="/">Axis öffnen</a>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-ui);
  }
  .card {
    max-width: 26rem;
    text-align: center;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 2.5rem 2rem;
  }
  .check {
    width: 3rem;
    height: 3rem;
    margin: 0 auto 1.25rem;
    display: grid;
    place-items: center;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--ok);
    background: var(--ok-tint);
    border: 1px solid var(--ok-border);
    border-radius: 999px;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
  p {
    margin: 0 0 1.5rem;
    color: var(--text-mut);
    line-height: 1.5;
  }
  .btn {
    display: inline-block;
    padding: 0.6rem 1.4rem;
    border-radius: var(--r-md);
    background: var(--accent);
    color: var(--accent-ink);
    text-decoration: none;
    font-weight: 600;
  }
  .btn:hover { background: var(--accentbright); }
</style>
