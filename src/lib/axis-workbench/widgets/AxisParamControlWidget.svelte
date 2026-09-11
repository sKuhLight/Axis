<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import { fmtControlValue } from '$lib/ui/format';
  import { isPanelWidgetZone } from '../../workbench';
  import { resolveParamWidgetState } from './paramWidgetState';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { widget, size, editMode = false }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const compact = $derived(size === 'compact');

  function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  const paramTarget = $derived(widget.binding?.target ?? {});
  const paramBlock = $derived(readString(paramTarget.block) ?? readString(widget.state?.block) ?? 'Block');
  const paramLabel = $derived(readString(paramTarget.param) ?? readString(paramTarget.label) ?? readString(widget.state?.label) ?? 'Parameter');
  const paramColor = $derived(readString(widget.state?.color) ?? readString(paramTarget.color) ?? 'var(--accent)');
  // Display mode: pinned params default to the Block-Editor square control-tile
  // look when they live in a custom panel (touch-friendly, name-labelled), and
  // to the compact horizontal chip in bars/rails (where a tall tile won't fit).
  // `state.display` ('tile' | 'ring') overrides the per-context default. `mini`
  // always collapses to the chip so an auto-fit bar stays a single row.
  const paramDisplayPref = $derived(readString(widget.state?.display));
  const paramInPanel = $derived(isPanelWidgetZone(widget.zone));
  const paramTile = $derived(!mini && (paramDisplayPref === 'tile' || (paramDisplayPref !== 'ring' && paramInPanel)));
  // Tile rings are sized so the whole card stays close to square in an ~88px
  // grid track; a 42px ring made every pinned control a tall column.
  const paramRingPx = $derived(paramTile ? (compact ? 30 : 34) : 24);
  const paramEffectId = $derived(readNumber(paramTarget.effectId) ?? readNumber(paramTarget.eid));
  const paramId = $derived(readNumber(paramTarget.paramId) ?? readNumber(paramTarget.pid));
  // Live param/enum data for the bound block: its own arrays when it's the open
  // block, else the hydrated pinned copy (T20 bug #4 — a pinned control must read
  // and write live regardless of what, if anything, is selected). Registering the
  // block below drives that on-demand hydration.
  const paramView = $derived(paramEffectId != null ? editor.pinnedView(paramEffectId) : { named: [], enums: [] });
  const paramNamed = $derived(paramId != null ? paramView.named.find((param) => param.id === paramId) : undefined);
  const paramEnum = $derived(paramId != null ? paramView.enums.find((param) => param.id === paramId) : undefined);
  // Keep the bound block hydrated for as long as this pinned control is mounted.
  $effect(() => {
    if (paramEffectId == null) return;
    return editor.registerPinnedBlock(paramEffectId);
  });
  const paramPreview = $derived(readNumber(widget.state?.previewValue));
  const paramNorm = $derived(paramNamed?.norm ?? (paramPreview != null ? Math.max(0, Math.min(1, paramPreview / 100)) : undefined));
  // effectIds present in the current preset grid — undefined until a preset is loaded
  // so we never falsely flag a bound block as "missing" during a cold boot.
  const paramPresetIds = $derived(
    editor.preset ? new Set([...editor.layout.cells, ...editor.layout.shunts].map((cell) => cell.effectId)) : undefined
  );
  // Explicit binding state: live (block open, read/write), readonly (block exists
  // but isn't open — click to open), missing (block not in this preset).
  const paramState = $derived(
    resolveParamWidgetState({
      boundEffectId: paramEffectId,
      openEffectId: editor.selected?.effectId,
      presetEffectIds: paramPresetIds,
      hasLiveData: !!paramNamed || !!paramEnum
    })
  );
  const paramLive = $derived(paramState === 'live');
  const paramReadonly = $derived(paramState === 'readonly');
  const paramMissing = $derived(paramState === 'missing');
  // Which grid cell the binding points at (used to open it when read-only).
  const paramCell = $derived(
    paramEffectId == null ? undefined : [...editor.layout.cells, ...editor.layout.shunts].find((cell) => cell.effectId === paramEffectId)
  );
  const paramTip = $derived.by(() => {
    const head = `${paramBlock} · ${paramLabel}`;
    if (paramLive) return paramNamed ? `${head} · drag or wheel to edit` : paramEnum ? `${head} · click to cycle` : head;
    if (paramReadonly) return paramCell ? `${head} · read-only · click to open block` : head;
    return `${head} · block not in this preset`;
  });
  const paramValueText = $derived.by(() => {
    if (paramNamed) return fmtControlValue(paramNamed);
    if (paramEnum) return paramEnum.options.find((option) => option.value === paramEnum.value)?.label ?? String(paramEnum.value);
    return paramPreview == null ? '--' : String(Math.round(paramPreview));
  });
  const paramDash = $derived(`${Math.max(0, Math.min(56.5, (paramNorm ?? 0.5) * 56.5)).toFixed(1)} 150`);

  function nudgeParam(delta: number) {
    if (editMode || paramEffectId == null) return;
    if (paramNamed) {
      editor.setPinnedParam(paramEffectId, paramNamed, clamp01((paramNamed.norm ?? 0) + delta));
      return;
    }
    if (paramEnum) {
      const count = paramEnum.options.length;
      if (!count) return;
      const index = paramEnum.options.findIndex((option) => option.value === paramEnum.value);
      const nextIndex = (((index + Math.sign(delta)) % count) + count) % count;
      const next = paramEnum.options[nextIndex];
      if (next) editor.setPinnedEnum(paramEffectId, paramEnum, next.value);
    }
  }

  // Hide the hover tooltip the instant the control is acted on (drag or wheel);
  // it stays out of the way until the next pointerleave clears the flag.
  let paramInteracting = $state(false);

  function paramPointerDown(event: PointerEvent) {
    if (editMode || !paramNamed || paramEffectId == null || event.button !== 0) return;
    event.preventDefault();
    paramInteracting = true;
    const startY = event.clientY;
    const startNorm = paramNamed.norm ?? 0;
    const eid = paramEffectId;
    const named = paramNamed;
    const onMove = (move: PointerEvent) => {
      editor.setPinnedParam(eid, named, clamp01(startNorm + (startY - move.clientY) / 180));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      paramInteracting = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function paramWheel(event: WheelEvent) {
    if (editMode || !paramNamed) return;
    event.preventDefault();
    paramInteracting = true;
    nudgeParam(event.deltaY < 0 ? -0.015 : 0.015);
  }

  // Fixed-position tooltip: a purely-CSS `:hover` `.axtip` sat inside the panel's
  // `overflow: hidden` body, so the leftmost control's tooltip was clipped/hidden
  // behind the dock on its left. Position it against the viewport and clamp it on-screen.
  let paramEl = $state<HTMLElement | null>(null);
  let paramTipEl = $state<HTMLElement | null>(null);
  let paramTipHover = $state(false);
  let paramTipFocus = $state(false);
  const paramTipVisible = $derived(!paramInteracting && (paramTipHover || paramTipFocus));
  let paramTipPos = $state<{ left: number; top: number } | null>(null);

  $effect(() => {
    if (!paramTipVisible || !paramEl || !paramTipEl) return;
    const rect = paramEl.getBoundingClientRect();
    const width = paramTipEl.offsetWidth;
    const height = paramTipEl.offsetHeight;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
    const top = Math.min(rect.bottom + 6, window.innerHeight - height - 8);
    paramTipPos = { left, top };
  });

  function openParamBlock() {
    if (editMode || !paramCell) return;
    void editor.openCell(paramCell);
  }

  function paramClick() {
    if (editMode) return;
    // read-only: a click opens the bound block so the widget becomes live
    if (paramReadonly) {
      openParamBlock();
      return;
    }
    if (paramLive && paramEnum) nudgeParam(1);
  }
</script>

<button
  class="axis-widget param axtipwrap"
  class:param-tile={paramTile}
  class:writable={paramLive && (!!paramNamed || !!paramEnum)}
  class:readonly={paramReadonly}
  class:missing={paramMissing}
  data-size={size}
  data-param-mode={paramTile ? 'tile' : 'chip'}
  data-param-state={paramState}
  type="button"
  disabled={!editMode && paramMissing}
  aria-label={paramTip}
  style:--param-color={paramColor}
  bind:this={paramEl}
  onpointerdown={paramPointerDown}
  onwheel={paramWheel}
  onclick={paramClick}
  onpointerenter={() => (paramTipHover = true)}
  onpointerleave={() => {
    paramTipHover = false;
    paramInteracting = false;
  }}
  onpointercancel={() => (paramInteracting = false)}
  onfocus={() => (paramTipFocus = true)}
  onblur={() => (paramTipFocus = false)}
>
  <!-- tooltip: which block this control belongs to + how to act -->
  <span
    class="axtip"
    class:show={paramTipVisible && paramTipPos !== null}
    bind:this={paramTipEl}
    style:left={paramTipPos ? `${paramTipPos.left}px` : undefined}
    style:top={paramTipPos ? `${paramTipPos.top}px` : undefined}
  >{paramTip}</span>
  <span class="param-ring" style:--param-dash={paramDash} style:width={`${paramRingPx}px`} style:height={`${paramRingPx}px`}>
    <svg width={paramRingPx} height={paramRingPx} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12" class="param-track" transform="rotate(135 16 16)"></circle>
      <circle cx="16" cy="16" r="12" class="param-value" transform="rotate(135 16 16)"></circle>
    </svg>
    {#if paramReadonly}
      <!-- lock affordance: this binding is a read-only preview until its block is opened -->
      <svg class="param-badge lock" width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2.5" y="5" width="7" height="5.2" rx="1" fill="currentColor"></rect>
        <path d="M4 5 V3.6 a2 2 0 0 1 4 0 V5" fill="none" stroke="currentColor" stroke-width="1.2"></path>
      </svg>
    {:else if paramMissing}
      <!-- missing: the bound block isn't in the current preset -->
      <svg class="param-badge warn" width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 1.5 L11 10.5 H1 Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path>
        <path d="M6 5 V7.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"></path>
        <circle cx="6" cy="9" r="0.7" fill="currentColor"></circle>
      </svg>
    {/if}
  </span>
  <span class="mono strong param-val">{paramMissing ? '--' : paramValueText}</span>
  {#if !mini}<span class="mono token param-name">{paramLabel}</span>{/if}
</button>

<style>
  .param {
    position: relative;
    /* let the hover tooltip (.axtip, positioned below) escape the chip/tile */
    overflow: visible;
  }
  .param.writable {
    border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  }
  .param.writable:hover {
    border-color: var(--accent);
  }
  /* read-only preview: block is in the preset but its live values aren't hydrated
     yet (a brief flash) or hydration is disabled on a slow link — dimmed, lock
     badge, click opens the block. A SOLID border (never dashed) so a resting
     control is never mistaken for a drag/drop slot (T20 bug #3). */
  .param.readonly {
    border-style: solid;
    border-color: var(--aw-border-2, var(--border2));
  }
  .param.readonly .param-ring svg:first-child,
  .param.readonly .strong {
    opacity: 0.55;
  }
  .param.readonly:hover {
    border-color: var(--aw-border-3, var(--border3));
  }
  .param.readonly:hover .param-ring svg:first-child,
  .param.readonly:hover .strong {
    opacity: 0.78;
  }
  /* missing: bound block not in this preset — inert, warning badge. SOLID border
     (never dashed) so it reads as "unavailable", not as an empty drag slot. */
  .param.missing {
    border-style: solid;
    border-color: color-mix(in srgb, var(--amber, #f5a623) 30%, var(--border));
    cursor: default;
  }
  .param.missing .param-ring svg:first-child,
  .param.missing .strong,
  .param.missing .token {
    opacity: 0.4;
  }
  .param-badge {
    position: absolute;
    right: -3px;
    bottom: -3px;
  }
  .param-badge.lock {
    color: var(--aw-text-muted, var(--textmuted));
  }
  .param-badge.warn {
    color: var(--amber, #f5a623);
  }
  .param-ring {
    position: relative;
    width: 24px;
    height: 24px;
    flex: none;
  }
  .param-track,
  .param-value {
    fill: none;
    stroke-width: 3.4;
    stroke-linecap: round;
    stroke-dasharray: 56.5 150;
  }
  .param-track {
    stroke: var(--border2);
  }
  .param-value {
    stroke: var(--param-color);
    stroke-dasharray: var(--param-dash);
  }
  .param .param-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text2);
  }
  /* hover/focus tooltip (design axtip): source block · param */
  .axtipwrap {
    position: relative;
  }
  .axtip {
    position: fixed;
    white-space: nowrap;
    background: var(--aw-surface-2, var(--surface2));
    border: 1px solid var(--aw-border-3, var(--border3));
    color: var(--text);
    font: 600 10px/1 var(--font-mono);
    letter-spacing: 0.04em;
    padding: 6px 9px;
    border-radius: 7px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.1s ease;
    z-index: 400;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  }
  .axtip.show {
    opacity: 1;
  }
  /* Block-Editor square control-tile look: touch-friendly, always shows the
     parameter name, tinted by the source block's category accent (--param-color). */
  .param.param-tile {
    flex-direction: column;
    justify-content: center;
    height: auto;
    /* Kept just under the 88px grid track so a tile reads as a square card rather
       than a tall column. */
    min-height: 84px;
    min-width: 0;
    max-width: 100%;
    width: 100%;
    gap: 4px;
    padding: 10px 8px;
    border: 1px solid color-mix(in srgb, var(--param-color) 30%, var(--border));
    border-radius: 12px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--param-color) 8%, var(--bg2)), var(--bg2));
    text-align: center;
    touch-action: none;
  }
  .param.param-tile[data-size='compact'] {
    min-height: 76px;
    min-width: 72px;
    padding: 9px 8px;
  }
  .param.param-tile:hover {
    border-color: color-mix(in srgb, var(--param-color) 62%, var(--border));
  }
  /* The value can be a long enum name ("GAIN ENHANCER"), not just a number, so it
     is clamped exactly like the parameter name below — an unclamped value pushes
     the tile past its grid track and makes one card wider than its neighbours. */
  .param.param-tile .param-val {
    font-size: 13px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .param.param-tile .param-name {
    font-size: 10px;
    letter-spacing: 0.06em;
    color: color-mix(in srgb, var(--param-color) 55%, var(--text2));
  }
  .param.param-tile.readonly {
    border-style: solid;
  }
  .param.param-tile.missing {
    border-style: solid;
    border-color: color-mix(in srgb, var(--amber, #f5a623) 30%, var(--border));
    background: var(--bg2);
  }
</style>
