<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { dampedModifierSource, lfoModifierSourceValue, mapModifierSource, type LfoModifierVisualization } from './lfoModifier';

  // Live rotary knob — matches the design prototype (135° start, 270° sweep, cyan
  // value arc). The current position is a short radial tick in the ring colour,
  // sitting in the moat between the face disc and the ring — deliberately NOT
  // amber, so it reads as "this knob's value" rather than "this knob is modulated"
  // (that is the MOD badge's job). Vertical drag sets the value; a clean tap (no
  // drag) requests inline editing.
  let {
    value = 0, // normalized 0..1
    label = '',
    valueText = '',
    color = '#35c9d6',
    size = 56,
    modded = false,
    onModifier = () => {},
    disabled = false,
    freeMotion = false,
    visualization = null,
    bpm = 120,
    formatValue = null,
    onInput = (_v: number) => {},
    onEdit = () => {}
  }: {
    value?: number;
    label?: string;
    valueText?: string;
    color?: string;
    size?: number;
    modded?: boolean;
    onModifier?: () => void;
    disabled?: boolean;
    /** Keep the pointer under the user's hand while a discrete parent value changes at thresholds. */
    freeMotion?: boolean;
    visualization?: LfoModifierVisualization | null;
    bpm?: number;
    formatValue?: ((value: number) => string) | null;
    onInput?: (v: number) => void;
    onEdit?: () => void;
  } = $props();

  const TRACK = 113.1; // 270° of r=24
  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  let dragging = false;
  let moved = false;
  let startY = 0;
  let startVal = 0;
  let visualValue = $state(untrack(() => value));
  let lastExternalValue = $state(untrack(() => value));
  let reducedMotion = $state(false);
  let frame = 0;
  let lastNow = 0;
  let smoothedSource: number | null = null;
  let animatedValue = $state<number | null>(null);
  const editableValue = $derived(freeMotion ? visualValue : value);
  const shownValue = $derived(dragging ? editableValue : (animatedValue ?? editableValue));
  const shownValueText = $derived(animatedValue != null && !dragging && formatValue ? formatValue(shownValue) : valueText);
  // The MOD marker sits on the dial face. The face spans r=15 of a 64-unit viewBox, so it is
  // ~0.47x the dial wide; the 8.5px "MOD" badge measures ~25px, which stops fitting below ~58px.
  // Under that the badge degrades to a dot rather than spilling over the face.
  const MOD_PILL_MIN = 58;
  const modAsDot = $derived(size < MOD_PILL_MIN);
  // Butt caps on both the track and the value arc: a round cap overhangs the path
  // end by half the stroke width, which either pushed the arc past the position
  // tick or, once pulled back to compensate, left a gap at 100%. A flat radial cut
  // ends exactly at the value and mirrors the tick's own shape. The arc is simply
  // not drawn at the minimum.
  const arcLen = $derived(clamp(shownValue) * TRACK);
  const showArc = $derived(arcLen > 0.5);
  const dash = $derived(`${arcLen} 300`);
  const angle = $derived(-135 + clamp(shownValue) * 270);

  $effect(() => {
    const external = value;
    if (!dragging && external !== lastExternalValue) visualValue = external;
    lastExternalValue = external;
  });

  function down(e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    dragging = true;
    moved = false;
    startY = e.clientY;
    startVal = editableValue;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const dy = startY - e.clientY; // up = increase
    if (Math.abs(dy) > 3) moved = true;
    if (moved) {
      const next = clamp(startVal + dy / 160);
      if (freeMotion) visualValue = next;
      onInput(next);
    }
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (!moved) onEdit();
  }

  const tick = (now: number) => {
    frame = 0;
    if (visualization && !reducedMotion) {
      const source = lfoModifierSourceValue(visualization, now / 1000, bpm);
      if (source == null) {
        animatedValue = null;
        smoothedSource = null;
      } else {
        const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
        const previous = smoothedSource ?? 0.5;
        smoothedSource = dampedModifierSource(previous, source, dt, visualization.attackSeconds, visualization.releaseSeconds);
        animatedValue = mapModifierSource(smoothedSource, visualization.mapping);
      }
      lastNow = now;
      frame = requestAnimationFrame(tick);
    }
  };

  $effect(() => {
    void visualization;
    smoothedSource = null;
    animatedValue = null;
    lastNow = 0;
    if (visualization && !reducedMotion && !frame) frame = requestAnimationFrame(tick);
    if ((!visualization || reducedMotion) && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });

  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => {
      reducedMotion = media.matches;
      if (reducedMotion) animatedValue = null;
    };
    updateMotion();
    media.addEventListener('change', updateMotion);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      media.removeEventListener('change', updateMotion);
    };
  });
</script>

<div class="knob" style="width:{size + 8}px">
  <div class="val mono">{shownValueText}</div>
  <div
    class="box"
    class:disabled
    style="width:{size}px; height:{size}px"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    role="slider"
    aria-valuenow={Math.round(clamp(editableValue) * 100)}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-label={label}
    tabindex="0"
  >
    <svg width={size} height={size} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="24" fill="none" style="stroke:var(--border2)" stroke-width="5" stroke-linecap="butt" stroke-dasharray="113.1 300" transform="rotate(135 32 32)" />
      {#if showArc}
        <circle cx="32" cy="32" r="24" fill="none" stroke={color} stroke-width="5" stroke-linecap="butt" stroke-dasharray={dash} transform="rotate(135 32 32)" />
      {/if}
      <circle cx="32" cy="32" r="15" style="fill:var(--surface2)" stroke="#000" stroke-width="1" />
      <!-- x offset by half the 3-wide stroke so the tick's leading (clockwise) edge, not its
           centre, sits on the value ray — flush with the arc's flat end. -->
      <g transform="rotate({angle} 32 32)"><line x1="30.5" y1="16.5" x2="30.5" y2="9.5" stroke={color} stroke-width="3" stroke-linecap="round" /></g>
    </svg>
    {#if modded}
      <button
        class="mod-pill"
        class:dot={modAsDot}
        type="button"
        aria-label="Edit modifier for {label}"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={onModifier}
      >{#if !modAsDot}MOD{/if}</button>
    {/if}
  </div>
  <div class="lbl">{label}</div>
</div>

<style>
  .knob { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }

  .box { position: relative; cursor: pointer; touch-action: none; user-select: none; }
  .box.disabled { opacity: 0.4; cursor: default; }
  .box svg { display: block; }
  /* The readout is a recessed chip ABOVE the dial — the arrangement the device's own editor uses,
     and the reason it never has a fit problem: the face stays empty, so unit-bearing values
     ("12000.0 Hz", "-12.5 ct") get a full-width row instead of a 26px circle, and the dial stays
     legible as it shrinks. It also keeps the caption LAST in the column, which matters: a wrapped
     caption ("Delay Time") paints its second line below itself by design (see .lbl), so anything
     placed under it collides. Widens past a small dial up to the same 76px the caption uses. */
  .val {
    width: max-content; min-width: 100%; max-width: 76px;
    padding: 2px 5px; border-radius: 3px;
    background: var(--input); box-shadow: inset 0 1px 2px color-mix(in srgb, #000 55%, transparent);
    font: 500 10px/1.4 var(--font-mono); color: var(--text); font-variant-numeric: tabular-nums;
    text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    pointer-events: none;
  }
  /* The caption reserves exactly one line of the flex column: a wrapped second line paints BELOW it
     (overflow: visible) instead of growing the column and shoving the dial up off its row. It is
     therefore the LAST element in the column — nothing may be placed under it. */
  .lbl { font-size: 12px; font-weight: 600; color: var(--textdim); text-align: center; max-width: 76px; line-height: 1.1; white-space: pre-line; cursor: pointer; height: 1.1em; }
  /* MOD sits centred on the dial FACE. The face is empty now that the readout moved to its chip,
     and the position tick lives at r=15.5–22.5 of the 32-unit viewBox — well outside the pill's
     corners at every angle — so the badge never collides with it. */
  .mod-pill { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 1; padding: 0 3px; border: 1px solid var(--amber-border); border-radius: 3px; background: var(--amber-tint); color: var(--amber); font: 600 8.5px/1.5 var(--font-mono); letter-spacing: 0.04em; white-space: nowrap; cursor: pointer; }
  /* The face is r=15 of a 64 viewBox, so its usable width is ~0.47x the dial. Below MOD_PILL_MIN
     the word no longer fits and the badge becomes a dot — modifier state stays visible at every
     size, which is exactly where a dense board needs it most. */
  .mod-pill.dot { width: 6px; height: 6px; padding: 0; border-radius: 50%; border-color: var(--amber); background: var(--amber); }
  .mod-pill:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
</style>
