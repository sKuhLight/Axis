<script lang="ts">
  // Persistent bottom bar. Left: the hover-hint for the block/parameter under the cursor (falls back to
  // the current selection / connection state) — scrolls like a news ticker when it overflows. Right:
  // Ko-fi support link · copyright · imprint.
  import { editor } from './editor.svelte';
  import { LEGAL, openExternal } from './legal';
  import { KOFI_URL, COPYRIGHT } from './support';

  const left = $derived(
    editor.hint ??
      (editor.selected ? editor.selected.display : editor.conn.state === 'online' ? 'Ready' : editor.conn.state === 'offline' ? 'Device offline' : 'Connecting…')
  );

  // ── ticker: scroll the text horizontally when it's wider than its slot ──
  let box = $state<HTMLElement | null>(null);
  let text = $state<HTMLElement | null>(null);
  let shift = $state(0); // px the text overflows its box (0 = fits, no scroll)
  $effect(() => {
    void left; // re-measure whenever the message changes
    if (!box || !text) return;
    // measure after the DOM paints the new text
    requestAnimationFrame(() => {
      if (!box || !text) return;
      const over = text.scrollWidth - box.clientWidth;
      shift = over > 6 ? over + 12 : 0;
    });
  });
  // pace the scroll ~40px/s (min 6s) so long descriptions read at a comfortable clip
  const dur = $derived(Math.max(6, Math.round(shift / 40)));
</script>

<footer class="sb">
  <div class="left" bind:this={box} data-tour="statushint" title={left}>
    <span
      class="tick"
      class:run={shift > 0}
      bind:this={text}
      style="--shift:{shift}px; --dur:{dur}s">{left}</span>
  </div>
  <div class="right">
    <button class="kofi" onclick={() => openExternal(KOFI_URL)} title="Support Axis development on Ko-fi">☕ Support on Ko-fi</button>
    <span class="sep"></span>
    <span class="cr">{COPYRIGHT}</span>
    <span class="sep"></span>
    <button class="lnk" onclick={() => openExternal(LEGAL.imprint)}>Imprint</button>
  </div>
</footer>

<style>
  .sb {
    flex: none;
    /* Extend down into the iOS home-indicator safe area; bg fills it, content stays above. 0 off native. */
    height: calc(26px + var(--axis-safe-bottom));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px var(--axis-safe-bottom);
    background: var(--bg-rail, var(--bg2));
    border-top: 1px solid var(--border, var(--border));
    font-size: 11px;
    color: var(--text-mut, var(--textdim));
    user-select: none;
  }
  .left {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    color: var(--textdim);
  }
  .tick {
    display: inline-block;
    white-space: nowrap;
    will-change: transform;
  }
  /* news-ticker: slide the full text into view and back, so nothing is truncated */
  .tick.run {
    animation: sbtick var(--dur) linear infinite alternate;
  }
  @keyframes sbtick {
    0%,
    8% {
      transform: translateX(0);
    }
    92%,
    100% {
      transform: translateX(calc(-1 * var(--shift)));
    }
  }
  .right { flex: none; display: flex; align-items: center; gap: 10px; }
  .kofi { background: none; border: none; color: #13c3ff; font-size: 11px; font-weight: 700; cursor: pointer; padding: 0; }
  .kofi:hover { filter: brightness(1.12); }
  .lnk { background: none; border: none; color: var(--text-mut, var(--textdim)); font-size: 11px; cursor: pointer; padding: 0; }
  .lnk:hover { color: var(--text2); }
  .cr { color: var(--textmuted); }
  .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--border3); }
  @media (max-width: 640px) {
    .cr { display: none; }
  }
</style>
