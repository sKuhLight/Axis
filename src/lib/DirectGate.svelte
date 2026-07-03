<script lang="ts">
  // Full-screen gate for Browser Direct mode (axisapp.live/?mode=direct): pick how the device is
  // attached, grant the browser permission, connect. Shown until the in-page runtime is live; once
  // ready, +page renders the normal Axis UI. Sibling of RemoteGate.svelte.
  import { directBoot } from './direct.svelte';
  import { LEGAL } from './legal';
  import { COPYRIGHT } from './support';

  const b = $derived(directBoot);
  const supported = $derived(b.support.midi || b.support.serial);
</script>

<div class="bg">
  <div class="card">
    <div class="brand">
      <svg width="34" height="34" viewBox="0 0 30 30"><circle cx="9" cy="9" r="3.4" fill="#35c9d6" /><circle cx="21" cy="9" r="3.4" fill="#4f6bed" /><circle cx="15" cy="21" r="3.4" fill="#f5a623" /><path d="M9 9 L21 9 L15 21 Z" fill="none" stroke="#3a3a44" stroke-width="1.6" /></svg>
      <div><div class="h1">Axis</div><div class="sub">Direct — play from this browser</div></div>
    </div>

    {#if b.phase === 'connecting'}
      <div class="state"><div class="spinner"></div><div class="st">Connecting…</div><div class="ss">Talking to your device.</div></div>
    {:else if b.phase === 'ready'}
      <div class="state"><div class="st ok">Connected</div></div>
    {:else if b.phase === 'error'}
      <div class="state">
        <div class="st warn">Couldn't connect</div>
        <div class="ss">{b.note ?? 'The device did not answer.'}</div>
        <div class="hint">Make sure the device is on and no other editor (FM3-Edit / Axe-Edit / Axis desktop) is holding the connection, then retry.</div>
        <button class="cta" onclick={() => b.retry()}>Try again</button>
      </div>
    {:else if !supported}
      <div class="state">
        <div class="st warn">This browser can't reach devices</div>
        <div class="ss">Web MIDI / Web Serial aren't available here (iOS and Safari don't support them).</div>
        <div class="hint">Use <strong>Chrome or Edge on a computer</strong> for the full experience — or <a href="/?mode=remote">Axis Remote</a> to control the Axis desktop app from this browser.</div>
      </div>
    {:else if b.midiChoices.length > 0}
      <div class="pick">
        <div class="lead">Several MIDI devices found — which one is your Fractal unit?</div>
        {#each b.midiChoices as c (c.index)}
          <button class="opt" onclick={() => b.connectMidiPair(c.index)}>{c.label}</button>
        {/each}
        <button class="back" onclick={() => (b.midiChoices = [])}>Back</button>
      </div>
    {:else}
      <div class="pick">
        <div class="lead">Plug your device into <strong>this computer</strong>, then choose how it's connected:</div>
        {#if b.support.midi}
          <button class="opt" onclick={() => b.connectMidi()}>
            <span class="ot">USB — FM9 · Axe-Fx III · AM4</span>
            <span class="od">MIDI device (also: any unit through a MIDI interface)</span>
          </button>
        {/if}
        {#if b.support.serial}
          <button class="opt" onclick={() => b.connectSerial()}>
            <span class="ot">USB — FM3</span>
            <span class="od">The FM3 connects as a serial device</span>
          </button>
        {:else if b.support.midi}
          <div class="miss">FM3 over USB needs Chrome/Edge on desktop (Web Serial). An FM3 on a MIDI interface works here too.</div>
        {/if}
        {#if b.note}<p class="note">{b.note}</p>{/if}
        <p class="legal">Your presets stay in this browser — nothing is uploaded unless you sign in and turn on cloud sync.</p>
      </div>
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
  .bg { position: fixed; inset: 0; background: var(--bg, var(--bg)); display: flex; align-items: center; justify-content: center; padding: 24px; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .card { width: 420px; max-width: 100%; background: var(--surface); border: 1px solid var(--border2); border-radius: 16px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6); padding: 26px 24px 22px; color: var(--text); }
  .brand { display: flex; align-items: center; gap: 13px; margin-bottom: 22px; }
  .h1 { font-size: 20px; font-weight: 800; color: var(--text); }
  .sub { font-size: 12.5px; color: var(--textdim); margin-top: 2px; }
  .pick { display: flex; flex-direction: column; gap: 12px; }
  .lead { font-size: 13.5px; color: var(--text2); line-height: 1.5; }
  .opt { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 14px 16px; background: var(--bg2); border: 1px solid var(--border2); border-radius: 12px; color: var(--text); cursor: pointer; }
  .opt:hover { border-color: var(--accent); }
  .ot { font-size: 14px; font-weight: 800; }
  .od { font-size: 12px; color: var(--textdim); }
  .miss { font-size: 11.5px; color: var(--textfaint); line-height: 1.5; padding: 0 2px; }
  .back { align-self: center; background: none; border: none; color: var(--textdim); font-size: 12px; cursor: pointer; }
  .back:hover { color: var(--text2); }
  .cta { width: 100%; height: 48px; margin-top: 8px; background: var(--accent); color: var(--accentink); border: none; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .cta:hover { background: var(--accentbright); }
  .note { font: 600 11.5px/1.4 'JetBrains Mono', monospace; color: var(--amber); margin: 4px 0 0; text-align: center; }
  .legal { text-align: center; margin-top: 8px; font-size: 11px; color: var(--textmuted); line-height: 1.55; }
  .foot { position: absolute; bottom: 16px; left: 0; right: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; padding: 0 16px; font-size: 11px; color: var(--textfaint); }
  .foot a { color: var(--textdim); text-decoration: none; }
  .foot a:hover { color: var(--text2); }
  .foot .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--border3); }
  .foot .cr { flex-basis: 100%; text-align: center; color: var(--textmuted); margin-top: 2px; }
  .state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 14px 0 6px; }
  .st { font-size: 16px; font-weight: 800; color: var(--text); }
  .st.ok { color: var(--ok); }
  .st.warn { color: var(--amber); }
  .ss { font-size: 12.5px; color: var(--textdim); }
  .hint { font-size: 12px; color: var(--text2); background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-top: 8px; line-height: 1.5; }
  .hint a { color: var(--accent); }
  .spinner { width: 34px; height: 34px; border: 3px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 4px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
