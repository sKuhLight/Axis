<script lang="ts">
  // Settings → Debug → "Device diagnostics". A gated, staged diagnostic run against the connected device: what it does
  // + a disclaimer + a mandatory backup checkbox, a second confirmation dialog (Cancel is the default), live per-step
  // progress with Cancel, a final summary, then "Save locally" and/or "Upload for analysis" (signed-in, with a preview of
  // exactly what is sent and an explicit consent tick). Every decision — what is offered, gating, wording, sizes, file
  // names — comes from the pure, unit-tested `diagnostics.ts`; the run itself is driven by the `diagnostics` store.
  import { onMount } from 'svelte';
  import { editor } from './editor.svelte';
  import { diagnostics as d } from './diagnostics.svelte';
  import { isRemote } from './forgefx';
  import {
    BACKUP_ACK_TEXT,
    CONFIRM_TITLE,
    FULL_WALK_LABEL,
    FULL_WALK_WARNING,
    UPLOAD_CONSENT_TEXT,
    DEFAULT_STEPS,
    STEP_INFO,
    buildStartRequest,
    canOpenConfirm,
    cycleFocusIndex,
    diagnosticsAvailability,
    formatBytes,
    fullWalkAvailability,
    overallProgress,
    runSummary,
    stepRows,
    uploadPreconditions,
    uploadPreview
  } from './diagnostics';

  const view = $derived(d.view);
  const availability = $derived(diagnosticsAvailability({ caps: editor.caps, online: editor.conn.state === 'online', isRemote: isRemote() }));
  const fullWalk = $derived(fullWalkAvailability(editor.caps));

  // Form state. Each run needs a fresh acknowledgement: it is reset when a run starts and by "Run again".
  let acknowledged = $state(false);
  let wantFullWalk = $state(false);
  let confirmOpen = $state(false);
  let uploadConsent = $state(false);
  // A full-walk tick can never outlive the full walk becoming unavailable (device switched, firmware changed).
  $effect(() => { if (!fullWalk.available) wantFullWalk = false; });

  const canStart = $derived(canOpenConfirm({ acknowledged, view, available: availability.available }));
  const rows = $derived(stepRows(d.status, { includeFullWalk: d.includeFullWalk }));
  const overall = $derived(overallProgress(rows));
  const current = $derived(rows.find((r) => r.status === 'running') ?? null);
  const summary = $derived(d.status && d.finished ? runSummary(d.status, rows) : null);
  const preview = $derived(d.bundle && d.encoded ? uploadPreview(d.bundle, d.encoded) : null);
  const signedIn = $derived(!!editor.cloud.user);
  const pre = $derived(
    uploadPreconditions({
      hasResult: !!d.bundle,
      signedIn,
      cloudEnabled: editor.cloud.enabled,
      consent: uploadConsent,
      busy: d.uploading,
      gzBytes: d.encoded?.gzBytes ?? null
    })
  );
  // The ONE announcer for run progress, the final summary and the upload result: the boxes below are not live
  // regions themselves (that would read everything twice). Errors are separate role="alert" elements; the
  // lost-contact box is an alert too, so it has no entry here.
  const liveText = $derived(
    view === 'starting' ? 'Starting the diagnostic'
    : view === 'cancelling' ? 'Cancelling the diagnostic'
    : view === 'running' ? (current ? `Running: ${current.label}` : 'Diagnostic running')
    : view === 'finished' && d.uploaded ? (d.uploaded.deduped ? 'This result had already been uploaded.' : 'Uploaded. Thank you.')
    : summary ? [summary.headline, summary.detail, summary.restartAdvised ? 'Switch the device off and on again before you use it.' : null].filter(Boolean).join('. ')
    : ''
  );

  // Refresh the engine's view whenever the tab is opened (a run may be going from another window / before a reload).
  onMount(() => { if (editor.caps?.diagnosticCapture && !isRemote()) void d.refresh(); });

  // ── second confirmation dialog: Cancel is the default; Escape cancels; Tab stays inside; focus is restored ──
  let dlg = $state<HTMLElement | null>(null);
  let cancelBtn = $state<HTMLButtonElement | null>(null);
  let startBtn = $state<HTMLButtonElement | null>(null);

  function openConfirm() {
    if (canStart) confirmOpen = true;
  }
  function closeConfirm() {
    confirmOpen = false;
    queueMicrotask(() => startBtn?.focus());
  }
  async function runNow() {
    const request = buildStartRequest({ acknowledged, confirmed: true, includeFullWalk: wantFullWalk, fullWalk });
    confirmOpen = false;
    if (!request) return;
    if (await d.start(request)) {
      acknowledged = false;
      wantFullWalk = false;
      uploadConsent = false;
    }
  }
  $effect(() => {
    if (!confirmOpen) return;
    cancelBtn?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // the page's own Escape handling must not also act
        closeConfirm();
      } else if (e.key === 'Tab' && dlg) {
        const els = Array.from(dlg.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]'));
        const next = cycleFocusIndex(els.length, els.indexOf(document.activeElement as HTMLElement), e.shiftKey);
        if (next >= 0) {
          e.preventDefault();
          els[next]!.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true); // capture: runs before the page's bubble-phase handler
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function runAgain() {
    acknowledged = false;
    wantFullWalk = false;
    uploadConsent = false;
    d.dismiss();
  }
  function saveLocal() {
    const name = d.saveLocal();
    if (name) editor.showToast(`Saved ${name}`, '#33c46b');
  }
  async function upload() {
    const ok = await d.upload({ signedIn, cloudEnabled: editor.cloud.enabled, consent: uploadConsent });
    if (ok) uploadConsent = false;
  }
</script>

<div class="pad">
  <div class="head">
    <div class="logo sm" aria-hidden="true">🛠</div>
    <div><div class="h1">Debugging</div><div class="sub">Tools for tracking down problems with your device</div></div>
  </div>

  <div class="sec">DEVICE DIAGNOSTICS</div>
  <p class="sr-only" role="status" aria-live="polite">{liveText}</p>

  {#if view === 'idle'}
    <p class="muted">
      Runs a short series of checks on the connected device and records how it answers. The result helps us support new devices and
      firmware versions. Nothing is sent anywhere unless you choose to upload it afterwards.
    </p>

    <ul class="steps plain" aria-label="What the diagnostic does">
      {#each DEFAULT_STEPS as name (name)}
        <li><span class="sl">{STEP_INFO[name].label}</span><span class="sw">{STEP_INFO[name].what}</span></li>
      {/each}
    </ul>

    {#if !availability.available}
      <div class="box info" role="note">
        <b>Not available right now</b>
        <span>{availability.message}</span>
      </div>
    {:else}
      <div class="box warn" role="note">
        <b>Before you start</b>
        <span>
          The diagnostic sends queries to your device that Axis does not normally use. In rare cases a device stops responding and has to
          be switched off and on again, and unsaved changes on the device can be lost. Leave the device idle on its Home screen and
          do not use Axis or the device until it has finished.
        </span>
      </div>

      <label class="ack">
        <input type="checkbox" bind:checked={acknowledged} />
        <span>{BACKUP_ACK_TEXT}</span>
      </label>

      <label class="ack minor" class:off={!fullWalk.available}>
        <input type="checkbox" bind:checked={wantFullWalk} disabled={!fullWalk.available} aria-describedby={wantFullWalk && fullWalk.available ? 'diag-fw-note diag-fw-warn' : 'diag-fw-note'} />
        <span>{FULL_WALK_LABEL}</span>
      </label>
      <p id="diag-fw-note" class="muted sm">{fullWalk.available ? 'Off by default. It takes longer and changes the current preset temporarily — only turn it on if you were asked to.' : fullWalk.reason}</p>
      {#if wantFullWalk && fullWalk.available}
        <div id="diag-fw-warn" class="box danger" role="note"><b>Extra warning: full walk</b><span>{FULL_WALK_WARNING}</span></div>
      {/if}

      <button class="cta" bind:this={startBtn} disabled={!canStart} aria-describedby="diag-start-hint" onclick={openConfirm}>Start diagnostic…</button>
      <p id="diag-start-hint" class="muted sm center">{acknowledged ? 'You will be asked to confirm once more.' : 'Tick the box above to enable the button.'}</p>
    {/if}

    {#if d.error}<p class="err" role="alert">{d.error}</p>{/if}

  {:else if view === 'starting' || view === 'running' || view === 'cancelling' || view === 'lost'}
    <div class="runhead">
      <span class="pulse" class:still={view === 'lost'} aria-hidden="true"></span>
      <div>
        <div class="rt">{view === 'starting' ? 'Starting…' : view === 'cancelling' ? 'Cancelling…' : view === 'lost' ? 'Waiting for the engine' : 'Diagnostic running'}</div>
        <div class="rs">Leave the device idle and keep this window open. This can take a few minutes.</div>
      </div>
    </div>
    {#if view === 'lost'}
      <div class="box warn" role="alert">
        <b>Lost contact with the Axis engine</b>
        <span>It has not answered for over a minute. The diagnostic may still be running on the device. Axis keeps asking in the background and has stopped waiting, so the editor works again — but leave the device alone until you know the run has ended.</span>
        <button class="link" onclick={() => d.retryPolling()}>Refresh</button>
      </div>
    {/if}
    <div class="bar" role="progressbar" aria-label="Overall progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={overall}>
      <div class="fill" style="width:{overall}%"></div>
    </div>

    <ol class="steps" aria-label="Progress per step">
      {#each rows as r (r.name)}
        <li class="st {r.tone}">
          <div class="srow">
            <span class="chip {r.tone}">{r.statusText}</span>
            <span class="sl">{r.label}</span>
            {#if r.progressText}<span class="sp">{r.progressText}</span>{/if}
          </div>
          {#if r.pct !== null && r.status === 'running'}
            <div class="bar sm" role="progressbar" aria-label="{r.label} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={r.pct}><div class="fill" style="width:{r.pct}%"></div></div>
          {/if}
          {#if r.note}<div class="sn">{r.note}</div>{/if}
        </li>
      {/each}
    </ol>

    {#if d.error}<p class="err" role="alert">{d.error}</p>{/if}
    <button class="ghost" disabled={view !== 'running' && view !== 'lost'} onclick={() => d.cancel()}>{view === 'cancelling' ? 'Cancelling…' : 'Cancel run'}</button>

  {:else if summary}
    <div class="box {summary.tone}">
      <b>{summary.headline}</b>
      {#if summary.detail}<span>{summary.detail}</span>{/if}
      {#if summary.restartAdvised}<span><strong>Switch the device off and on again</strong> before you use it.</span>{/if}
      <span class="stats">
        {summary.counts.ok} done{summary.counts.failed ? ` · ${summary.counts.failed} failed` : ''}{summary.counts.aborted ? ` · ${summary.counts.aborted} aborted` : ''}{summary.counts.skipped ? ` · ${summary.counts.skipped} skipped` : ''}{summary.durationText ? ` · ${summary.durationText}` : ''}
      </span>
    </div>

    <ol class="steps" aria-label="Result per step">
      {#each rows as r (r.name)}
        <li class="st {r.tone}">
          <div class="srow">
            <span class="chip {r.tone}">{r.statusText}</span>
            <span class="sl">{r.label}</span>
          </div>
          {#if r.note}<div class="sn">{r.note}</div>{/if}
        </li>
      {/each}
    </ol>

    {#if d.loadingResult}
      <p class="muted">Preparing the result…</p>
    {:else if d.resultError}
      <p class="err" role="alert">{d.resultError} <button class="link" onclick={() => d.loadResult()}>Try again</button></p>
    {:else if !d.bundle}
      <p class="muted">No result was kept for this run, so there is nothing to save or upload.</p>
    {:else if d.encoded && preview}
      <div class="sec mt">SAVE LOCALLY</div>
      <p class="muted">Save the result as a file on this computer. Nothing leaves it.</p>
      <button class="sync-now" onclick={saveLocal}>Save locally (.{d.encoded.ext})</button>
      {#if d.savedAs}<p class="good sm center">Saved as <span class="mono">{d.savedAs}</span></p>{/if}
      {#if !d.encoded.compressed}<p class="muted sm center">Compression is not available here, so the file is plain JSON ({formatBytes(d.encoded.jsonBytes)}).</p>{/if}

      <div class="sec mt">UPLOAD FOR ANALYSIS</div>
      {#if d.uploaded}
        <div class="box ok">
          <b>{d.uploaded.deduped ? 'Already uploaded' : 'Uploaded — thank you'}</b>
          {#if d.uploaded.deduped}<span>The cloud already had this result, so nothing new was stored.</span>{/if}
          <span>Cloud reference <span class="mono">{d.uploaded.captureId}</span> · Result ID <span class="mono">{d.bundle.id}</span> ({formatBytes(d.uploaded.bytes)}). Quote both if you contact us about this result.</span>
        </div>
      {:else}
        <p class="muted">Send the result to Axis so it can be used to support your device and firmware. This is exactly what is uploaded:</p>
        <dl class="prev" aria-label="What is uploaded">
          {#each preview.rows as row (row.label)}
            <dt>{row.label}</dt><dd>{row.value}</dd>
          {/each}
        </dl>
        <p class="muted sm">{preview.notIncluded}</p>
        <p class="muted sm">{preview.retention}</p>

        {#if !editor.cloud.enabled}
          <p class="muted sm">{pre.blockers.includes('cloud-off') ? 'The Axis cloud is not available on this engine, so nothing can be uploaded. You can still save the result locally.' : ''}</p>
        {:else if !signedIn}
          <div class="box info" role="note">
            <b>Sign in to upload</b>
            <span>An Axis account is needed so uploads can be limited and removed again. You can still save the result locally.</span>
            <button class="link" onclick={() => editor.openAxis('account')}>Open the Account tab</button>
          </div>
        {/if}

        <label class="ack">
          <input type="checkbox" bind:checked={uploadConsent} disabled={d.uploading} />
          <span>{UPLOAD_CONSENT_TEXT}</span>
        </label>
        <button class="cta" disabled={!pre.ok} onclick={upload}>{d.uploading ? 'Uploading…' : 'Upload for analysis'}</button>
        {#if d.uploading && d.uploadSlow}<p class="muted sm center">Still uploading — a large result can take a few minutes. Keep this window open; if it fails, trying again is safe.</p>{/if}
        {#if d.uploadError}<p class="err" role="alert">{d.uploadError}</p>{/if}
      {/if}
    {/if}

    <button class="ghost" onclick={runAgain}>Run again</button>
  {/if}
</div>

{#if confirmOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="scrim" role="presentation" onclick={closeConfirm}>
    <div
      class="dlg"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="diag-confirm-title"
      aria-describedby="diag-confirm-desc"
      tabindex="-1"
      bind:this={dlg}
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="diag-confirm-title">{CONFIRM_TITLE}</h2>
      <div id="diag-confirm-desc" class="dd">
        <p>The diagnostic starts immediately and can take several minutes. Leave the device idle and do not use Axis or the device until it has finished.</p>
        <p>If the device stops responding, switch it off and on again.</p>
        {#if wantFullWalk && fullWalk.available}
          <p class="fw"><strong>Full walk is on.</strong> {FULL_WALK_WARNING}</p>
        {/if}
      </div>
      <div class="dact">
        <button class="dcancel" bind:this={cancelBtn} onclick={closeConfirm}>Cancel</button>
        <button class="dgo" onclick={runNow}>{wantFullWalk && fullWalk.available ? 'Run with full walk' : 'Run diagnostic'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pad { padding: 18px 24px 24px; }
  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  .logo { width: 46px; height: 46px; flex: none; border-radius: 13px; background: rgba(53, 201, 214, 0.12); border: 1px solid rgba(53, 201, 214, 0.3); display: flex; align-items: center; justify-content: center; font-size: 22px; color: var(--accent); }
  .h1 { font-size: 20px; font-weight: 800; color: var(--text); }
  .sub { font-size: 12.5px; color: var(--textdim); margin-top: 2px; }
  .sec { font: 700 9px/1 'JetBrains Mono', monospace; color: var(--textmuted); letter-spacing: 0.14em; margin-bottom: 12px; }
  .sec.mt { margin-top: 24px; }
  .muted { font-size: 12px; color: var(--textdim); line-height: 1.5; margin: 6px 0 12px; }
  .muted.sm { font-size: 11px; margin-top: 4px; }
  .center { text-align: center; }
  .mono { font-family: 'JetBrains Mono', monospace; color: var(--textdim); word-break: break-all; }
  .good { color: var(--ok); }
  .sm { font-size: 11px; }
  .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  /* explanation list */
  .steps { list-style: none; margin: 10px 0 14px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .steps.plain li { display: flex; flex-direction: column; gap: 2px; padding: 9px 12px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; }
  .sl { font-size: 12.5px; font-weight: 700; color: var(--text2); }
  .sw { font-size: 11px; color: var(--textfaint); line-height: 1.45; }

  /* boxes */
  .box { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; padding: 12px 14px; border-radius: 11px; border: 1px solid var(--border2); background: var(--bg2); font-size: 12px; line-height: 1.5; color: var(--text2); }
  .box b { font-size: 13px; color: var(--text); }
  .box.warn { border-color: var(--amber-border); background: var(--amber-tint); }
  .box.danger, .box.bad { border-color: var(--danger-border); background: var(--danger-tint); }
  .box.ok { border-color: var(--ok-border); background: var(--ok-tint); }
  .box.info { border-color: var(--accent-border); background: var(--accent-tint); }
  .box .stats { font: 600 11px/1.4 'JetBrains Mono', monospace; color: var(--textdim); }
  .err { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--danger-border); background: var(--danger-tint); font-size: 12px; line-height: 1.5; color: var(--text); }

  /* checkboxes */
  .ack { display: flex; align-items: flex-start; gap: 12px; margin-top: 12px; padding: 13px 14px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; font-size: 12.5px; line-height: 1.5; color: var(--text); cursor: pointer; }
  .ack:hover { border-color: var(--border3); }
  .ack:focus-within { border-color: var(--accent); }
  .ack input { width: 18px; height: 18px; flex: none; margin: 1px 0 0; accent-color: var(--accent); cursor: pointer; }
  .ack.minor { font-size: 12px; color: var(--text2); }
  .ack.off { opacity: 0.6; cursor: default; }
  .ack.off input { cursor: default; }

  /* buttons */
  .cta { width: 100%; height: 48px; margin-top: 14px; background: var(--accent); color: var(--accentink); border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .cta:hover:not(:disabled) { background: var(--accentbright); }
  .cta:disabled { opacity: 0.45; cursor: default; }
  .sync-now { width: 100%; height: 42px; background: transparent; border: 1px solid var(--accent-border); border-radius: 11px; cursor: pointer; color: var(--accent); font-size: 13px; font-weight: 700; }
  .sync-now:hover { background: var(--accent-tint); border-color: var(--accent); }
  .ghost { width: 100%; margin-top: 18px; height: 44px; background: transparent; border: 1px solid var(--border2); color: var(--text2); border-radius: 11px; cursor: pointer; font-size: 13px; font-weight: 700; }
  .ghost:hover:not(:disabled) { border-color: var(--border3); color: var(--text); }
  .ghost:disabled { opacity: 0.55; cursor: default; }
  .link { background: none; border: none; color: var(--accent); font-size: 11.5px; font-weight: 600; cursor: pointer; padding: 0; align-self: flex-start; text-decoration: underline; }
  button:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* progress */
  .runhead { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .rt { font-size: 14px; font-weight: 700; color: var(--text); }
  .rs { font-size: 11.5px; color: var(--textdim); margin-top: 2px; }
  .pulse { width: 10px; height: 10px; flex: none; border-radius: 50%; background: var(--accent); animation: dgPulse 1s ease-in-out infinite; }
  .pulse.still { animation: none; background: var(--amber); }
  @keyframes dgPulse { 50% { opacity: 0.3; } }
  .bar { height: 6px; background: var(--track); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
  .bar.sm { height: 4px; margin-top: 7px; }
  .fill { height: 100%; background: var(--accent); transition: width 0.25s; }
  .st { padding: 9px 12px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; }
  .st.busy { border-color: var(--accent-border); }
  .st.bad { border-color: var(--danger-border); }
  .srow { display: flex; align-items: center; gap: 9px; }
  .srow .sl { flex: 1; min-width: 0; }
  .sp { font: 600 10.5px/1 'JetBrains Mono', monospace; color: var(--textfaint); }
  .sn { margin-top: 5px; font-size: 11px; color: var(--textdim); line-height: 1.45; }
  .chip { flex: none; min-width: 58px; text-align: center; font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 5px; padding: 4px 6px; background: var(--surface2); color: var(--textdim); }
  .chip.busy { background: var(--accent); color: var(--accentink); }
  .chip.ok { background: var(--ok); color: var(--accentink); }
  .chip.warn { background: var(--amber); color: var(--accentink); }
  .chip.bad { background: var(--danger); color: var(--text); }

  /* upload preview */
  .prev { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 10px 0; padding: 12px 14px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; font-size: 12px; line-height: 1.45; }
  .prev dt { color: var(--textfaint); font: 600 9.5px/1.7 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; }
  .prev dd { margin: 0; color: var(--text2); word-break: break-word; }

  /* confirmation dialog */
  .scrim { position: fixed; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(6, 6, 8, 0.72); }
  .dlg { width: 380px; max-width: 100%; padding: 20px 20px 16px; background: var(--surface); border: 1px solid var(--border3); border-radius: 14px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6); color: var(--text); }
  .dlg:focus { outline: none; }
  .dlg h2 { margin: 0 0 10px; font-size: 16px; font-weight: 800; color: var(--text); }
  .dd { font-size: 12.5px; line-height: 1.55; color: var(--text2); }
  .dd p { margin: 0 0 8px; }
  .dd .fw { padding: 9px 11px; border: 1px solid var(--danger-border); background: var(--danger-tint); border-radius: 9px; font-size: 12px; }
  .dact { display: flex; gap: 10px; margin-top: 14px; }
  .dact button { flex: 1; height: 42px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; }
  .dcancel { background: var(--accent); color: var(--accentink); border: 1px solid var(--accent); }
  .dgo { background: transparent; color: var(--text2); border: 1px solid var(--border3); }
  .dgo:hover { color: var(--text); border-color: var(--text2); }
</style>
