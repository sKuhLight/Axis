<script lang="ts">
  // Live rotary knob — matches the design prototype (135° start, 270° sweep, cyan
  // value arc, amber pointer). Vertical drag sets the value; double-click resets.
  let {
    value = 0, // normalized 0..1
    label = '',
    valueText = '',
    color = '#35c9d6',
    size = 56,
    disabled = false,
    onInput = (_v: number) => {},
    onReset = () => {}
  }: {
    value?: number;
    label?: string;
    valueText?: string;
    color?: string;
    size?: number;
    disabled?: boolean;
    onInput?: (v: number) => void;
    onReset?: () => void;
  } = $props();

  const TRACK = 113.1; // 270° of r=24
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const dash = $derived(`${clamp(value) * TRACK} 300`);
  const angle = $derived(-135 + clamp(value) * 270);

  let dragging = false;
  let startY = 0;
  let startVal = 0;

  function down(e: PointerEvent) {
    if (disabled) return;
    dragging = true;
    startY = e.clientY;
    startVal = value;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const dy = startY - e.clientY; // up = increase
    onInput(clamp(startVal + dy / 160));
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }
</script>

<div class="knob" style="width:{size + 8}px">
  <div
    class="box"
    class:disabled
    style="width:{size}px; height:{size}px"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    ondblclick={() => onReset()}
    role="slider"
    aria-valuenow={Math.round(clamp(value) * 100)}
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
  .knob { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .box { position: relative; cursor: ns-resize; touch-action: none; user-select: none; }
  .box.disabled { opacity: 0.4; cursor: default; }
  .box svg { display: block; }
  .val {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 600; color: var(--text2); pointer-events: none;
  }
  .lbl { font-size: 10px; font-weight: 600; color: var(--textdim); text-align: center; max-width: 72px; line-height: 1.1; }
</style>
