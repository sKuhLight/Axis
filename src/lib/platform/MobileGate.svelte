<script lang="ts">
  // Full-screen gate for the native mobile shell (VITE_AXIS_MOBILE): pick how the device is attached
  // — USB MIDI or Bluetooth MIDI — grant native access, connect. Shown until the in-page
  // runtime is live; once ready, +page renders the normal Axis UI. Sibling of DirectGate.svelte.
  import { mobileBoot } from './mobile.svelte';
  import BootGateShell from '$lib/ui/BootGateShell.svelte';

  const b = $derived(mobileBoot);
</script>

<BootGateShell subtitle="Connect your device">
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
      <div class="miss">FM3 connects via a DIN or Bluetooth MIDI adapter — its USB port isn't reachable on iOS.</div>
      {#if b.note}<p class="note">{b.note}</p>{/if}
      <p class="legal">Your presets stay on this device — nothing is uploaded.</p>
    </div>
  {/if}
</BootGateShell>

<style>
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
  .state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 14px 0 6px; }
  .st { font-size: 16px; font-weight: 800; color: var(--text); }
  .st.ok { color: var(--ok); }
  .st.warn { color: var(--amber); }
  .ss { font-size: 12.5px; color: var(--textdim); }
  .hint { font-size: 12px; color: var(--text2); background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-top: 8px; line-height: 1.5; }
  .spinner { width: 34px; height: 34px; border: 3px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 4px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
