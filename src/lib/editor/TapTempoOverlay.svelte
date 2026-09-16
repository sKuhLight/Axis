<script lang="ts">
  import { deviceSession } from './editorClients.svelte';
  import { tapTempo, TAP_TEMPO_TIMEOUT_MS } from './tapTempo.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
</script>

<Dialog overlay="tapTempo" open={tapTempo.active} onClose={() => tapTempo.end()} width="300px" labelledBy="tap-tempo-title">
  <div class="tap-body">
    <h2 id="tap-tempo-title" class="tap-hint">Keep tapping…</h2>
    <div class="tap-readout">
      <span class="tap-bpm mono">{deviceSession.bpm}</span>
      <span class="tap-unit mono">BPM</span>
    </div>
    <div class="tap-bar" aria-hidden="true">
      {#key tapTempo.tapCount}
        <span class="tap-fill" style:animation-duration="{TAP_TEMPO_TIMEOUT_MS}ms"></span>
      {/key}
    </div>
  </div>
</Dialog>

<style>
  .tap-body {
    padding: 22px 22px 26px;
    text-align: center;
  }
  .tap-hint {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-dim);
  }
  .tap-readout {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    margin-top: 10px;
  }
  .tap-bpm {
    font-size: 52px;
    font-weight: 800;
    line-height: 1;
    color: var(--text);
  }
  .tap-unit {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--text-faint);
  }
  .tap-bar {
    position: relative;
    height: 4px;
    margin-top: 20px;
    border-radius: 2px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .tap-fill {
    position: absolute;
    inset: 0;
    background: var(--accent);
    transform-origin: left center;
    animation-name: tap-drain;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  @keyframes tap-drain {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
