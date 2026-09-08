<script lang="ts">
  import { untrack } from 'svelte';

  // Live rotary knob — matches the design prototype (135° start, 270° sweep, cyan
  // value arc, amber pointer). Vertical drag sets the value; a clean tap (no drag)
  // requests inline editing.
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
  const shownValue = $derived(freeMotion ? visualValue : value);
  const dash = $derived(`${clamp(shownValue) * TRACK} 300`);
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
    startVal = shownValue;
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
</script>

<div class="knob" style="width:{size + 8}px">
  {#if modded}<button class="mod-pill" type="button" aria-label="Edit modifier for {label}" onclick={onModifier}>MOD</button>{/if}
  <div
    class="box"
    class:disabled
    style="width:{size}px; height:{size}px"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    role="slider"
    aria-valuenow={Math.round(clamp(shownValue) * 100)}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-label={label}
    tabindex="0"
  >
    <svg width={size} height={size} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="24" fill="none" style="stroke:var(--border2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="113.1 300" transform="rotate(135 32 32)" />
      <circle cx="32" cy="32" r="24" fill="none" stroke={color} stroke-width="5" stroke-linecap="round" stroke-dasharray={dash} transform="rotate(135 32 32)" />
      <circle cx="32" cy="32" r="15" style="fill:var(--surface2)" stroke="#000" stroke-width="1" />
      <g transform="rotate({angle} 32 32)"><circle cx="32" cy="20.5" r="2.7" fill="#f5a623" /></g>
    </svg>
    <div class="val mono">{valueText}</div>
  </div>
  <div class="lbl">{label}</div>
</div>

<style>
  .knob { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .box { position: relative; cursor: pointer; touch-action: none; user-select: none; }
  .box.disabled { opacity: 0.4; cursor: default; }
  .box svg { display: block; }
  .val {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 600; color: var(--text2); pointer-events: none;
  }
  /* The caption reserves exactly one line of the flex column: a wrapped second line paints BELOW it
     (overflow: visible) instead of growing the column and shoving the dial up off its row. */
  .lbl { font-size: 12px; font-weight: 600; color: var(--textdim); text-align: center; max-width: 76px; line-height: 1.1; white-space: pre-line; cursor: pointer; height: 1.1em; }
  .mod-pill { position: absolute; top: -4px; right: 0; z-index: 1; padding: 1px 5px; border: 1px solid var(--amber-border); border-radius: 4px; background: var(--amber-tint); color: var(--amber); font: 600 8px/1.2 var(--font-mono); letter-spacing: 0.04em; white-space: nowrap; cursor: pointer; box-shadow: 0 2px 5px color-mix(in srgb, var(--bg) 65%, transparent); }
</style>
