<script lang="ts">
  // First-run guided tour: a self-contained spotlight overlay + coach-mark bubble. Anchors to real UI via
  // data-tour="<key>" attributes, positions the bubble next to the anchor, and is advanced by its own
  // buttons (fully modal, so device state can't change mid-tour). No external deps or assets.
  import { editor } from './editor.svelte';

  type Place = 'right' | 'below' | 'above' | 'center';
  type Step = { anchor?: string; title: string; body: string; place?: Place };
  // NOTE: keep this length in sync with TOUR_LAST in editor.svelte.ts (9 steps → last index 8).
  const STEPS: Step[] = [
    { title: 'Welcome to Axis', body: 'A fast, offline-first editor for your Fractal device. This quick tour points out the essentials — you can skip any time and replay it later from Axis → About.', place: 'center' },
    { anchor: 'build', title: 'Your signal grid', body: "Build is home base — the routing grid where your amp, cab, and effects live. You're looking at it now.", place: 'right' },
    { anchor: 'library', title: 'Browse your presets', body: 'Open the Preset Browser to scan every preset on your device, search by name or contents, tag favorites, and import .syx files.', place: 'right' },
    { anchor: 'grid', title: 'Place a block', body: 'Tap any empty slot (the + tiles) to open the block picker and drop in an amp, drive, delay, or any effect. Drag a placed block to move it.', place: 'below' },
    { anchor: 'statushint', title: 'Tune any parameter', body: "Select a block to open its editor — turn knobs, switch channels A–D, set bypass. Hover any control and its full name and value appear here, in the status bar.", place: 'above' },
    { anchor: 'fc', title: 'Lay out your footswitches', body: "The Footswitch editor mirrors your device's foot controller — assign functions, labels, and colors, with live read-back from the hardware.", place: 'right' },
    { anchor: 'conn', title: 'Stay connected', body: 'This LED shows your device link — green means connected. Axis auto-detects your Fractal unit; click here to pick a port manually or pair a USB-MIDI device.', place: 'right' },
    { anchor: 'axis', title: 'Account, sync & privacy', body: 'The Axis hub is your account: sync your library, footswitch layouts, and setlists across devices for free — plus privacy controls and diagnostics.', place: 'right' },
    { title: "You're set", body: "That's the tour. Everything's offline-first and your presets stay on your machine. Replay this any time from Axis → About.", place: 'center' }
  ];

  const step = $derived(STEPS[editor.tourStep] ?? STEPS[0]);
  const last = $derived(editor.tourStep >= STEPS.length - 1);
  let rect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let vw = $state(1280);
  let vh = $state(800);

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const key = step?.anchor;
    if (!key) { rect = null; return; }
    const el = document.querySelector(`[data-tour="${key}"]`) as HTMLElement | null;
    if (!el) { rect = null; return; }
    const r = el.getBoundingClientRect();
    const pad = 6;
    rect = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
  }

  // Re-measure whenever the step changes and while the tour is open (resize / scroll / layout settle).
  $effect(() => {
    if (!editor.tourActive) return;
    void editor.tourStep; // track
    measure();
    const raf = requestAnimationFrame(measure); // catch elements that animate in
    const onMove = () => measure();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    const ro = new ResizeObserver(onMove);
    ro.observe(document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); editor.endTour(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); editor.tourNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); editor.tourPrev(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      ro.disconnect();
      window.removeEventListener('keydown', onKey, true);
    };
  });

  const CARD_W = 300;
  // Bubble position: clamp into the viewport with an 8px margin. Uses left/top, except 'above' pins bottom.
  const cardStyle = $derived.by(() => {
    const place = step?.place ?? 'center';
    if (!rect || place === 'center') {
      return `left:50%; top:50%; transform:translate(-50%,-50%); width:${CARD_W}px;`;
    }
    const m = 8;
    let left = rect.x;
    if (place === 'right') left = rect.x + rect.w + 12;
    left = Math.max(m, Math.min(left, vw - CARD_W - m));
    if (place === 'above') {
      const bottom = Math.max(m, vh - rect.y + 12);
      return `left:${left}px; bottom:${bottom}px; width:${CARD_W}px;`;
    }
    let top = place === 'below' ? rect.y + rect.h + 12 : rect.y;
    top = Math.max(m, Math.min(top, vh - 180));
    return `left:${left}px; top:${top}px; width:${CARD_W}px;`;
  });
</script>

{#if editor.tourActive}
  <div class="tour" role="dialog" aria-modal="true" aria-label="Axis tour">
    <!-- spotlight: full-screen dim with a rounded punch-out over the anchor (SVG mask) -->
    <svg class="dim" width={vw} height={vh} viewBox="0 0 {vw} {vh}">
      <defs>
        <mask id="tourmask">
          <rect x="0" y="0" width={vw} height={vh} fill="white" />
          {#if rect}
            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="12" fill="black" />
          {/if}
        </mask>
      </defs>
      <rect x="0" y="0" width={vw} height={vh} fill="rgba(6,6,8,0.72)" mask="url(#tourmask)" />
    </svg>
    {#if rect}
      <div class="ring" style="left:{rect.x}px; top:{rect.y}px; width:{rect.w}px; height:{rect.h}px;"></div>
    {/if}

    <div class="card" style={cardStyle}>
      <div class="h1">{step.title}</div>
      <div class="body">{step.body}</div>
      <div class="foot">
        <button class="skip" onclick={() => editor.endTour()}>Skip</button>
        <span class="count">{editor.tourStep + 1} / {STEPS.length}</span>
        <span class="sp"></span>
        {#if editor.tourStep > 0}<button class="back" onclick={() => editor.tourPrev()}>Back</button>{/if}
        <button class="next" onclick={() => editor.tourNext()}>{last ? 'Done' : 'Next'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour { position: fixed; inset: 0; z-index: 400; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .dim { position: fixed; inset: 0; pointer-events: auto; }
  .ring { position: fixed; border: 2px solid var(--accent, #35c9d6); border-radius: 12px; box-shadow: 0 0 0 2px rgba(53, 201, 214, 0.25), 0 0 22px rgba(53, 201, 214, 0.4); pointer-events: none; }
  .card { position: fixed; max-width: calc(100vw - 24px); background: #161619; border: 1px solid #2e2e36; border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); padding: 16px 18px 14px; color: #e9e9ee; }
  .h1 { font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 7px; }
  .body { font-size: 13px; line-height: 1.5; color: #b9b9c2; }
  .foot { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
  .count { font: 600 10px/1 'JetBrains Mono', monospace; color: #56565e; }
  .sp { flex: 1; }
  .skip { background: none; border: none; color: #8a8a94; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0; }
  .skip:hover { color: #cfcfd6; }
  .back { background: transparent; border: 1px solid #2e2e36; color: #cfcfd6; border-radius: 8px; height: 32px; padding: 0 13px; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .back:hover { border-color: #3f3f48; color: #fff; }
  .next { background: #35c9d6; color: #06181a; border: none; border-radius: 8px; height: 32px; padding: 0 16px; font-size: 12.5px; font-weight: 800; cursor: pointer; }
  .next:hover { background: #46d6e2; }
</style>
