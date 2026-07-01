<script lang="ts">
  // Transient, self-dismissing popups that live outside the Axis hub:
  //  • first-run telemetry consent (accept/decline) — shown once if the build ships live diagnostics
  //  • one-time "support development on Ko-fi" nudge
  //  • the major-error "upload a debug report" prompt (with an optional contact field)
  import { editor } from '$lib/editor.svelte';
  import Icon from '$lib/Icon.svelte';
  import { LEGAL, openExternal } from '$lib/legal';
  import { KOFI_URL } from '$lib/support';

  const t = $derived(editor.telemetry);
  let showDetail = $state(false);

  async function sendNow(trigger?: { kind: string; route?: string; status?: number; message?: string }) {
    await editor.uploadDebugReport(trigger);
    editor.dismissReportPrompt();
  }
</script>

<!-- ── first-run telemetry consent ── -->
{#if editor.consentPromptOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bg" role="presentation">
    <div class="card" role="dialog" tabindex="-1">
      <div class="pad">
        <div class="head"><div class="logo">🛡</div><div><div class="h1">Help improve Axis?</div><div class="sub">Anonymous diagnostics — your choice</div></div></div>
        <p class="muted">Axis can send <strong>anonymous</strong> error &amp; performance data when something goes wrong, so bugs get fixed faster. No personal data, no presets, no account info — just what broke and on which device.</p>
        <div class="incl">
          <div><span class="ok">sends</span> crashes, device-comm errors, app performance, an anonymous ID</div>
          <div><span class="no">never</span> your presets, email, files, or anything identifying you</div>
        </div>
        <div class="row2">
          <button class="cta ghost" onclick={() => editor.decideTelemetry(false)}>No thanks</button>
          <button class="cta" onclick={() => editor.decideTelemetry(true)}>Enable diagnostics</button>
        </div>
        <p class="legal">You can change this any time in <strong>Axis → Privacy</strong>. See our <button class="link" onclick={() => openExternal(LEGAL.privacy)}>Privacy Policy</button>.</p>
      </div>
    </div>
  </div>
{/if}

<!-- ── one-time Ko-fi nudge ── -->
{#if editor.kofiNoticeOpen}
  <div class="toast">
    <span class="ki">☕</span>
    <div class="tbody">
      <div class="tt">Enjoying Axis?</div>
      <div class="td">It's free &amp; open-source. You can support development on Ko-fi.</div>
    </div>
    <button class="tgo" onclick={() => { openExternal(KOFI_URL); editor.dismissKofiNotice(); }}>Support</button>
    <button class="tx" aria-label="Dismiss" onclick={editor.dismissKofiNotice}><Icon name="close" size={12} /></button>
  </div>
{/if}

<!-- ── major-error → upload report ── -->
{#if editor.reportPrompt}
  {@const p = editor.reportPrompt}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bg" role="presentation" onclick={editor.dismissReportPrompt}>
    <div class="card sm" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="pad">
        <div class="head"><div class="logo warn">⚠</div><div><div class="h1">Something went wrong</div><div class="sub">{[p.route, p.status].filter(Boolean).join(' · ') || p.kind}</div></div></div>
        <p class="muted">Axis hit an error{p.route ? ` talking to your device (${p.route}${p.status ? ` · ${p.status}` : ''})` : ''}. You can send a debug report so we can fix it.</p>
        <label class="cfield" for="rp-contact">
          <span class="clbl">CONTACT <span class="opt">optional</span></span>
          <input id="rp-contact" class="in" type="text" maxlength="100" placeholder="Fractal forum / Reddit / email — so we can follow up"
                 value={editor.contact} oninput={(e) => editor.setContact((e.currentTarget as HTMLInputElement).value)} />
        </label>
        {#if showDetail}
          <ul class="incl2">
            <li><span class="ok">included</span> diagnostic log, recent events, the error, device/OS/app versions, an anonymous ID, and the contact above (if any)</li>
            <li><span class="no">never</span> your presets, preset names, email, or file contents</li>
          </ul>
        {:else}<button class="link" onclick={() => (showDetail = true)}>View what's sent</button>{/if}
        <button class="cta" disabled={!t.uploadEnabled || t.sending} onclick={() => sendNow(p)}>{t.sending ? 'Sending…' : 'Upload report'}</button>
        <button class="link dim center" onclick={editor.dismissReportPrompt}>Not now</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .bg { position: fixed; inset: 0; background: rgba(6, 6, 8, 0.62); backdrop-filter: blur(3px); z-index: 360; display: flex; align-items: flex-start; justify-content: center; padding: 8vh 12px 12px; }
  .card { position: relative; width: 440px; max-width: calc(100% - 24px); max-height: 86vh; overflow-y: auto; background: #161619; border: 1px solid #2e2e36; border-radius: 16px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6); color: #e9e9ee; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .card.sm { width: 400px; }
  .pad { padding: 26px 24px 22px; }
  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  .logo { width: 46px; height: 46px; flex: none; border-radius: 13px; background: rgba(53, 201, 214, 0.12); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 22px; color: #35c9d6; }
  .logo.warn { background: rgba(245, 166, 35, 0.12); border-color: rgba(245, 166, 35, 0.4); color: #f5a623; }
  .h1 { font-size: 19px; font-weight: 800; color: #fff; }
  .sub { font-size: 12.5px; color: #9a9aa3; margin-top: 2px; }
  .muted { font-size: 12.5px; color: #9a9aa3; line-height: 1.5; margin: 6px 0 14px; }
  .incl { margin: 4px 0 16px; padding: 12px; background: #0e0e10; border: 1px solid #26262c; border-radius: 10px; font-size: 12px; color: #b9b9c2; line-height: 1.7; display: flex; flex-direction: column; gap: 4px; }
  .incl2 { list-style: none; margin: 10px 0 0; padding: 12px; background: #0e0e10; border: 1px solid #26262c; border-radius: 10px; font-size: 12px; color: #b9b9c2; line-height: 1.6; }
  .ok { color: #35c9d6; font: 700 9px/1 'JetBrains Mono', monospace; margin-right: 7px; }
  .no { color: #d6543f; font: 700 9px/1 'JetBrains Mono', monospace; margin-right: 7px; }
  .cfield { display: flex; flex-direction: column; gap: 7px; margin: 4px 0 12px; }
  .clbl { font: 600 9px/1 'JetBrains Mono', monospace; color: #7a7a83; letter-spacing: 0.1em; }
  .opt { color: #56565e; margin-left: 4px; }
  .in { width: 100%; height: 44px; padding: 0 14px; background: #0e0e10; border: 1px solid #2a2a31; border-radius: 11px; color: #e9e9ee; font-size: 13px; outline: none; }
  .in:focus { border-color: #35c9d6; }
  .row2 { display: flex; gap: 11px; margin-top: 6px; }
  .cta { flex: 1; width: 100%; height: 46px; margin-top: 6px; background: #35c9d6; color: #06181a; border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .cta:hover { background: #46d6e2; }
  .cta:disabled { opacity: 0.5; cursor: default; }
  .cta.ghost { background: transparent; border: 1px solid #2e2e36; color: #cfcfd6; }
  .cta.ghost:hover { border-color: #3f3f48; color: #fff; background: transparent; }
  .link { background: none; border: none; color: #35c9d6; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; }
  .link.dim { color: #9a9aa3; }
  .link.center { display: block; width: 100%; text-align: center; margin-top: 12px; }
  .legal { text-align: center; margin-top: 16px; font-size: 11px; color: #7a7a83; line-height: 1.55; }

  /* ko-fi toast (bottom-right, above the status bar) */
  .toast { position: fixed; right: 16px; bottom: 46px; z-index: 340; width: 340px; max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 12px; padding: 13px 14px; background: #161619; border: 1px solid #2e2e36; border-radius: 13px; box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5); animation: axsPop 0.16s ease; }
  @keyframes axsPop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .ki { font-size: 22px; flex: none; }
  .tbody { flex: 1; min-width: 0; }
  .tt { font-size: 13.5px; font-weight: 800; color: #fff; }
  .td { font-size: 11.5px; color: #9a9aa3; margin-top: 2px; line-height: 1.4; }
  .tgo { flex: none; height: 34px; padding: 0 14px; background: #13c3ff; color: #06181a; border: none; border-radius: 9px; font-size: 12.5px; font-weight: 800; cursor: pointer; }
  .tgo:hover { filter: brightness(1.08); }
  .tx { flex: none; width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent; color: #7a7a83; cursor: pointer; }
  .tx:hover { background: #1c1c21; color: #fff; }
</style>
