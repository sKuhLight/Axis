<script lang="ts">
  // Full-screen gate for the native mobile shell (VITE_AXIS_MOBILE): pick how the device is attached
  // — USB MIDI, Bluetooth MIDI, or Axis Remote — grant native access, connect. Shown until the in-page
  // runtime is live; once ready, +page renders the normal Axis UI. Sibling of DirectGate.svelte.
  import { mobileBoot } from './mobile.svelte';
  import { LEGAL } from './legal';
  import { COPYRIGHT } from './support';

  const b = $derived(mobileBoot);
</script>

<div class="bg">
  <div class="card">
    <div class="brand">
      <svg width="34" height="34" viewBox="0 0 30 30"><circle cx="9" cy="9" r="3.4" fill="#35c9d6" /><circle cx="21" cy="9" r="3.4" fill="#4f6bed" /><circle cx="15" cy="21" r="3.4" fill="#f5a623" /><path d="M9 9 L21 9 L15 21 Z" fill="none" stroke="#3a3a44" stroke-width="1.6" /></svg>
      <div><div class="h1">Axis</div><div class="sub">Connect your device</div></div>
    </div>

    {#if b.phase === 'connecting'}
      <div class="state"><div class="spinner"></div><div class="st">Connecting…</div><div class="ss">Talking to your device.</div></div>
    {:else if b.phase === 'ready'}
      <div class="state"><div class="st ok">Connected</div></div>
    {:else if b.phase === 'error'}
      <div class="state">
        <div class="st warn">Couldn't connect</div>
        <div class="ss">{b.note ?? 'The device did not answer.'}</div>
        <div class="hint">Make sure the device is on and connected, then retry.</div>
        <button class="cta" onclick={() => b.retry()}>Try again</button>
      </div>
    {:else if b.endpointChoices.length > 0}
      <div class="pick">
        <div class="lead">Several MIDI devices found — which one is your Fractal unit?</div>
        {#each b.endpointChoices as e (e.id)}
          <button class="opt" onclick={() => b.connectEndpoint(e.id)}>
            <span class="ot">{e.name}</span>
            <span class="od">{e.link.toUpperCase()} MIDI{e.fractal ? ' · Fractal' : ''}</span>
          </button>
        {/each}
        <button class="back" onclick={() => (b.endpointChoices = [])}>Back</button>
      </div>
    {:else}
      <div class="pick">
        <div class="lead">Connect your Fractal unit, then choose how it's attached:</div>
        <button class="opt" onclick={() => b.connectMidi()}>
          <span class="ot">USB MIDI</span>
          <span class="od">FM9 · Axe-Fx III · AM4 (or any unit via a USB MIDI interface)</span>
        </button>
        <button class="opt" onclick={() => b.pairBluetooth()}>
          <span class="ot">Bluetooth MIDI</span>
          <span class="od">Pair a BLE MIDI adapter</span>
        </button>
        <button class="opt" onclick={() => b.useRemote()}>
          <span class="ot">Axis Remote</span>
          <span class="od">Control the Axis desktop app on your PC over the internet</span>
        </button>
        <div class="miss">FM3 connects via a DIN or Bluetooth MIDI adapter, or through Axis Remote — its USB port isn't reachable on iOS.</div>
        {#if b.note}<p class="note">{b.note}</p>{/if}
        <p class="legal">Your presets stay on this device — nothing is uploaded unless you sign in and turn on cloud sync.</p>
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
  .bg { position: fixed; inset: 0; background: var(--bg); display: flex; align-items: center; justify-content: center; padding: 24px; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
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
  .spinner { width: 34px; height: 34px; border: 3px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 4px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
