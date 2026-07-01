<script lang="ts">
  // Privacy & Diagnostics — sibling to CloudPanel. Two surfaces driven by the editor store:
  //  • the settings panel (editor.telemetryOpen): consent toggle + on-demand "Send debug report"
  //  • the major-error popup (editor.reportPrompt): per-incident "Upload Debug Log" nudge
  import { editor } from '$lib/editor.svelte';
  import Icon from '$lib/Icon.svelte';
  import { LEGAL, openExternal } from '$lib/legal';

  const t = $derived(editor.telemetry);
  let showDetail = $state(false); // "View what's sent" disclosure
  const closePanel = () => (editor.telemetryOpen = false);

  async function sendNow(trigger?: { kind: string; route?: string; status?: number; message?: string }) {
    await editor.uploadDebugReport(trigger);
    editor.dismissReportPrompt();
  }
</script>

{#snippet disclosure()}
  <ul class="incl">
    <li><span class="ok">included</span> the diagnostic log for this session (console + device diagnostics)</li>
    <li><span class="ok">included</span> recent app events and the error that triggered this</li>
    <li><span class="ok">included</span> your device / OS / app versions and an anonymous ID</li>
    <li><span class="no">never</span> your presets, preset names, email, file contents, or anything identifying you</li>
  </ul>
{/snippet}

<!-- ── settings panel ── -->
{#if editor.telemetryOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bg" role="presentation" onclick={closePanel}>
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <button class="x" aria-label="Close" onclick={closePanel}><Icon name="close" size={13} /></button>
      <div class="pad">
        <div class="head">
          <div class="logo">🛡</div>
          <div><div class="h1">Privacy &amp; Diagnostics</div><div class="sub">Help fix bugs faster — anonymously</div></div>
        </div>

        <div class="sec">ANONYMOUS DIAGNOSTICS</div>
        {#if t.enabled}
          <button class="item" onclick={() => editor.setTelemetryConsent(!t.consent)}>
            <span class="chk" class:on={t.consent}>{#if t.consent}<Icon name="check" size={13} stroke={2.4} />{/if}</span>
            <span class="item-body">
              <span class="item-label">Send error &amp; performance data</span>
              <span class="item-desc">Anonymous diagnostics when something goes wrong. No personal data, no presets. Off by default; turn off any time.</span>
            </span>
          </button>
        {:else}
          <p class="muted">Live diagnostics aren't enabled in this build. You can still send a one-off debug report below when something breaks.</p>
        {/if}

        <div class="sec" style="margin-top:20px">SEND A DEBUG REPORT</div>
        <p class="muted">If you hit a bug, send us a one-off report so we can fix it. This is a separate, explicit action — it works even with diagnostics off.</p>
        {#if showDetail}{@render disclosure()}{:else}<button class="link" onclick={() => (showDetail = true)}>View what's sent</button>{/if}
        <button class="cta" disabled={!t.uploadEnabled || t.sending} onclick={() => sendNow({ kind: 'manual' })}>
          {t.sending ? 'Sending…' : 'Send debug report'}
        </button>
        {#if !t.uploadEnabled}<p class="note dim">Report upload isn't configured in this build.</p>{/if}

        <p class="legal"><button class="link" onclick={() => openExternal(LEGAL.privacy)}>Privacy Policy</button> · Anonymous ID: <span class="mono">{t.instanceId.slice(0, 8)}</span> · Axis is open-source; self-hosters can point diagnostics at their own server.</p>
      </div>
    </div>
  </div>
{/if}

<!-- ── major-error popup ── -->
{#if editor.reportPrompt}
  {@const p = editor.reportPrompt}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="bg" role="presentation" onclick={editor.dismissReportPrompt}>
    <div class="card sm" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="pad">
        <div class="head"><div class="logo warn">⚠</div><div><div class="h1">Something went wrong</div><div class="sub">{[p.route, p.status].filter(Boolean).join(' · ') || p.kind}</div></div></div>
        <p class="muted">Axis hit an error{p.route ? ` talking to your device (${p.route}${p.status ? ` · ${p.status}` : ''})` : ''}. You can send a debug report so we can fix it.</p>
        {#if showDetail}{@render disclosure()}{:else}<button class="link" onclick={() => (showDetail = true)}>View what's sent</button>{/if}
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
  .x { position: absolute; top: 12px; right: 12px; z-index: 2; background: #1c1c21; border: 1px solid #2a2a31; color: #8a8a94; cursor: pointer; border-radius: 8px; width: 28px; height: 28px; }
  .x:hover { color: #fff; border-color: #3f3f48; }
  .pad { padding: 26px 24px 22px; }
  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
  .logo { width: 46px; height: 46px; flex: none; border-radius: 13px; background: rgba(53, 201, 214, 0.12); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 22px; color: #35c9d6; }
  .logo.warn { background: rgba(245, 166, 35, 0.12); border-color: rgba(245, 166, 35, 0.4); color: #f5a623; }
  .h1 { font-size: 19px; font-weight: 800; color: #fff; }
  .sub { font-size: 12.5px; color: #9a9aa3; margin-top: 2px; }
  .sec { font: 700 9px/1 'JetBrains Mono', monospace; color: #56565e; letter-spacing: 0.14em; margin-bottom: 12px; }
  .muted { font-size: 12.5px; color: #9a9aa3; line-height: 1.5; margin: 6px 0 12px; }
  .item { display: flex; gap: 12px; width: 100%; text-align: left; background: #0e0e10; border: 1px solid #26262c; border-radius: 12px; padding: 14px; cursor: pointer; }
  .item:hover { border-color: #3a3a44; }
  .chk { flex: none; width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid #3a3a44; background: #161619; display: flex; align-items: center; justify-content: center; color: #06181a; }
  .chk.on { background: #35c9d6; border-color: #35c9d6; }
  .item-body { display: flex; flex-direction: column; gap: 3px; }
  .item-label { font-size: 14px; font-weight: 700; color: #e9e9ee; }
  .item-desc { font-size: 12px; color: #8a8a94; line-height: 1.45; }
  .cta { width: 100%; height: 46px; margin-top: 14px; background: #35c9d6; color: #06181a; border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .cta:hover { background: #46d6e2; }
  .cta:disabled { opacity: 0.5; cursor: default; }
  .link { background: none; border: none; color: #35c9d6; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; }
  .link.dim { color: #9a9aa3; }
  .link.center { display: block; width: 100%; text-align: center; margin-top: 12px; }
  .note { font: 600 11px/1.4 'JetBrains Mono', monospace; color: #35c9d6; margin-top: 10px; text-align: center; }
  .note.dim { color: #7a7a83; }
  .legal { text-align: center; margin-top: 18px; font-size: 11px; color: #56565e; line-height: 1.55; }
  .mono { font-family: 'JetBrains Mono', monospace; color: #9a9aa3; }
  .incl { list-style: none; margin: 8px 0 0; padding: 12px; background: #0e0e10; border: 1px solid #26262c; border-radius: 10px; font-size: 12px; color: #b9b9c2; line-height: 1.7; }
  .incl .ok { color: #35c9d6; font: 700 9px/1 'JetBrains Mono', monospace; margin-right: 7px; }
  .incl .no { color: #d6543f; font: 700 9px/1 'JetBrains Mono', monospace; margin-right: 7px; }
</style>
