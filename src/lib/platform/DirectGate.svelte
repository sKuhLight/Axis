<script lang="ts">
  // Full-screen gate for Browser Direct mode (axisapp.live): pick how the device is
  // attached, grant the browser permission, connect. Shown until the in-page runtime is live; once
  // ready, +page renders the normal Axis UI.
  import { directBoot } from './direct.svelte';
  import BootGateShell from '$lib/ui/BootGateShell.svelte';

  const b = $derived(directBoot);
  const supported = $derived(b.support.midi || b.support.serial);
</script>

<BootGateShell subtitle="Direct — play from this browser">
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
      <div class="hint">Use <strong>Chrome or Edge on a computer</strong> for the full experience.</div>
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
      <p class="legal">Your presets stay in this browser — nothing is uploaded.</p>
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
