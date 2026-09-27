<script lang="ts">
  /**
   * The metronome modal (Mixer Ruler design). Opened by the top-bar metronome widget or the
   * global `M` key. Space starts/stops, Up/Down nudge the tempo; the tempo seeds from the preset tap tempo and — when
   * moved — drives the Tempo/Pitch page's Tempo knob; Level drives the device metronome level.
   */
  import Dialog from '$lib/ui/Dialog.svelte';
  import { overlays } from '$lib/overlay/overlays.svelte';
  import { deviceSession } from './editorClients.svelte';
  import { metronome } from './metronome.svelte';

  const open = $derived(overlays.isOpen('metronome'));
  const running = $derived(metronome.running);
  const beat = $derived(metronome.beat);

  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);

  // Seed the tempo from the preset tap tempo and mirror the device's switch/level each open.
  let wasOpen = $state(false);
  $effect(() => {
    const isOpen = open;
    if (isOpen && !wasOpen) {
      metronome.seed(deviceSession.bpm);
      void metronome.syncFromDevice();
    }
    wasOpen = isOpen;
  });

  $effect(() => {
    if (editing && input) {
      input.focus();
      input.select();
    }
  });

  function beginEdit() {
    draft = String(metronome.bpm);
    editing = true;
  }
  function commit() {
    if (!editing) return;
    editing = false;
    const n = Number.parseInt(draft, 10);
    if (!Number.isNaN(n)) metronome.setBpm(n);
  }
  function cancel() {
    editing = false;
  }
</script>

<Dialog
  overlay="metronome"
  open={open}
  onClose={() => overlays.close('metronome')}
  width="430px"
  title="Metronome"
  class="metro-dlg"
>
  <div class="body">
    <div class="readout">
      <div class="bpm">
        {#if editing}
          <input
            class="mono"
            bind:this={input}
            bind:value={draft}
            inputmode="numeric"
            aria-label="Tempo in BPM"
            onblur={commit}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
          />
        {:else}
          <button class="num mono" type="button" title="Click to type a tempo" onclick={beginEdit}>{metronome.bpm}</button>
        {/if}
        <span class="unit mono">BPM</span>
      </div>
      <div class="dots" aria-hidden="true">
        {#each [0, 1, 2, 3] as i (i)}
          <span class="dot" class:on={running && beat === i} class:down={i === 0}></span>
        {/each}
      </div>
    </div>

    <input
      class="ruler"
      type="range"
      min="24"
      max="250"
      step="1"
      value={metronome.bpm}
      aria-label="Tempo"
      oninput={(e) => metronome.setBpm(Number((e.currentTarget as HTMLInputElement).value))}
    />
    <div class="scale mono"><span>24</span><span>80</span><span>140</span><span>200</span><span>250</span></div>

    <div class="level">
      <span class="lbl">Level</span>
      <input
        type="range"
        min="-40"
        max="20"
        step="0.5"
        value={metronome.level}
        aria-label="Metronome level"
        oninput={(e) => metronome.setLevel(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <span class="db mono">{metronome.levelText}</span>
    </div>

    <button class="transport" class:on={running} type="button" onclick={() => metronome.toggle()}>
      <span class="glyph">{running ? '■' : '▶'}</span>{running ? 'Stop' : 'Start'}
    </button>
  </div>
</Dialog>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 22px 22px;
  }
  .readout {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .bpm {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .num,
  .bpm input {
    padding: 0;
    border: 0;
    border-bottom: 2px dashed transparent;
    background: transparent;
    color: var(--text);
    font: 800 48px/1 var(--font-mono);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    cursor: text;
  }
  .num:hover {
    color: var(--accent);
    border-bottom-color: var(--accent-border);
  }
  .bpm input {
    width: 3.4ch;
    border-bottom-color: var(--accent);
    color: var(--accent);
    outline: none;
  }
  .unit {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--text-faint);
  }
  .dots {
    display: flex;
    gap: 6px;
    padding-bottom: 8px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--track);
    border: 1px solid var(--border2);
    transition: transform 0.08s, background 0.08s;
  }
  .dot.down {
    outline: 1px solid var(--border2);
    outline-offset: 2px;
  }
  .dot.on {
    background: var(--accent);
    border-color: var(--accent);
    transform: scale(1.25);
  }
  .ruler {
    width: 100%;
    height: 30px;
    margin: 2px 0 -6px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--track);
    border-radius: 6px;
  }
  .ruler::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 26px;
    border-radius: 3px;
    background: var(--accent);
    border: 2px solid var(--surface);
    cursor: ew-resize;
  }
  .scale {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-faint);
  }
  .level {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .lbl {
    font-size: 12px;
    color: var(--text-dim);
  }
  .level input {
    flex: 1;
    accent-color: var(--amber);
  }
  .db {
    width: 76px;
    text-align: right;
    font-size: 12px;
    font-weight: 600;
    color: var(--amber);
  }
  .transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    height: 46px;
    margin-top: 4px;
    border: 1px solid var(--accent-border);
    border-radius: 11px;
    background: var(--accent-tint);
    color: var(--accent);
    font: 800 15px/1 var(--font-ui);
    cursor: pointer;
  }
  .transport:hover {
    background: color-mix(in srgb, var(--accent) 20%, var(--surface));
  }
  .transport.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accentink);
  }
  .glyph {
    font-size: 14px;
  }
</style>
