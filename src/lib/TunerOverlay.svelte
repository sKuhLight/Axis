<script lang="ts">
  import { editor } from './editor.svelte';

  // Standard 6-string reference (low→high). Highlight the one matching the detected note letter.
  const STRINGS = ['E', 'A', 'D', 'G', 'B', 'E'];

  const cents = $derived(editor.tuner.cents ?? 0);
  const note = $derived(editor.tuner.note);
  const octave = $derived(editor.tuner.octave);
  const freq = $derived(editor.tuner.freq);
  const inTune = $derived(note != null && Math.abs(cents) <= 5);
  // needle: -50..+50 cents → 0..100% across the meter
  const needlePct = $derived(Math.max(0, Math.min(100, 50 + cents)));
  const noteLetter = $derived(note ? note[0] : null);
</script>

{#if editor.tuner.active}
  <div class="tuner-wrap" data-screen="Tuner">
    <button class="bg" aria-label="Close tuner" onclick={() => editor.toggleTuner()}></button>
    <div class="card">
      <header>
        <span class="ttl mono">TUNER</span>
        <button class="close" aria-label="Close" onclick={() => editor.toggleTuner()}>✕</button>
      </header>

      <div class="note" class:lit={note != null} class:tuned={inTune}>
        {note ?? '—'}{#if note != null && octave != null}<span class="oct">{octave}</span>{/if}
      </div>
      <div class="cents mono">
        {#if note != null}{cents > 0 ? '+' : ''}{Math.round(cents)}¢{#if freq}<span class="hz"> · {freq.toFixed(1)} Hz</span>{/if}{:else}listening…{/if}
      </div>

      <div class="meter">
        <div class="ticks">
          {#each [-50, -25, 0, 25, 50] as t}
            <span class="tick" class:center={t === 0} style="left:{50 + t}%"></span>
          {/each}
        </div>
        <div class="needle" class:tuned={inTune} style="left:{needlePct}%"></div>
      </div>

      <div class="strings">
        {#each STRINGS as s, i (i)}
          <span class="str" class:on={noteLetter === s}>{s}</span>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .tuner-wrap {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: axsOverlay 0.18s ease;
  }
  .bg {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(4px);
    cursor: pointer;
  }
  .card {
    position: relative;
    width: min(440px, 92vw);
    padding: 18px 22px 24px;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    border: 1px solid var(--surface-3);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    animation: axsPalette 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ttl {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--text-mut);
  }
  .close {
    width: 30px;
    height: 30px;
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    border-radius: 8px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .note {
    text-align: center;
    font: 800 86px/1 var(--font-ui);
    color: var(--border3);
    margin: 14px 0 2px;
    transition: color 0.12s;
  }
  .note.lit {
    color: var(--text);
  }
  .note.tuned {
    color: #5fc46b;
    text-shadow: 0 0 26px rgba(95, 196, 107, 0.5);
  }
  .oct {
    font-size: 36px;
    font-weight: 700;
    color: var(--text-mut);
    vertical-align: super;
    margin-left: 4px;
  }
  .hz {
    color: var(--text-faint);
  }
  .cents {
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-mut);
    margin-bottom: 18px;
  }
  .meter {
    position: relative;
    height: 46px;
    margin: 0 6px 20px;
    border-bottom: 1px solid var(--surface-3);
  }
  .ticks {
    position: absolute;
    inset: 0;
  }
  .tick {
    position: absolute;
    bottom: 0;
    width: 1px;
    height: 12px;
    background: var(--border2);
    transform: translateX(-50%);
  }
  .tick.center {
    height: 22px;
    background: var(--border3);
  }
  .needle {
    position: absolute;
    bottom: -1px;
    width: 3px;
    height: 40px;
    background: var(--amber);
    border-radius: 2px;
    transform: translateX(-50%);
    transition: left 0.07s linear;
    box-shadow: 0 0 12px rgba(245, 166, 35, 0.6);
  }
  .needle.tuned {
    background: #5fc46b;
    box-shadow: 0 0 14px rgba(95, 196, 107, 0.7);
  }
  .strings {
    display: flex;
    justify-content: center;
    gap: 10px;
  }
  .str {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    color: var(--text-mut);
    font: 700 13px/1 var(--font-mono);
  }
  .str.on {
    background: #16252a;
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
