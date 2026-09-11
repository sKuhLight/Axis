<script lang="ts">
  /**
   * The full-screen "connect your device" gate chrome shared by DirectGate (Browser Direct) and
   * MobileGate (native mobile) — background, card frame, brand header and the legal-links footer
   * were byte-identical between the two. Not built on `Dialog`: this replaces the ENTIRE app
   * before the runtime is ready (nothing behind it to scrim/blur, no Escape-to-close, no overlay
   * stacking), which is a materially different job than a modal over existing content. `children`
   * is the phase-specific body (connecting/ready/error/pick), which still differs enough between
   * the two callers to stay local.
   */
  import type { Snippet } from 'svelte';
  import { LEGAL } from '$lib/ancillary/legal';
  import { COPYRIGHT } from '$lib/ancillary/support';

  let { subtitle, children }: { subtitle: string; children: Snippet } = $props();
</script>

<div class="bg">
  <div class="card">
    <div class="brand">
      <svg width="34" height="34" viewBox="0 0 30 30">
        <circle cx="9" cy="9" r="3.4" fill="#35c9d6" />
        <circle cx="21" cy="9" r="3.4" fill="#4f6bed" />
        <circle cx="15" cy="21" r="3.4" fill="#f5a623" />
        <path d="M9 9 L21 9 L15 21 Z" fill="none" stroke="#3a3a44" stroke-width="1.6" />
      </svg>
      <div><div class="h1">Axis</div><div class="sub">{subtitle}</div></div>
    </div>
    {@render children()}
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
  .bg {
    position: fixed;
    inset: 0;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif);
  }
  .card {
    width: 420px;
    max-width: 100%;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    padding: 26px 24px 22px;
    color: var(--text);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 13px;
    margin-bottom: 22px;
  }
  .h1 {
    font-size: 20px;
    font-weight: 800;
    color: var(--text);
  }
  .sub {
    font-size: 12.5px;
    color: var(--textdim);
    margin-top: 2px;
  }
  .foot {
    position: absolute;
    bottom: 16px;
    left: 0;
    right: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 16px;
    font-size: 11px;
    color: var(--textfaint);
  }
  .foot a {
    color: var(--textdim);
    text-decoration: none;
  }
  .foot a:hover {
    color: var(--text2);
  }
  .foot .dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--border3);
  }
  .foot .cr {
    flex-basis: 100%;
    text-align: center;
    color: var(--textmuted);
    margin-top: 2px;
  }
</style>
