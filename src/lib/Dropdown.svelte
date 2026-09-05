<script lang="ts">
  // Compact dropdown: label-on-top field (112–236px) that opens a fixed popup menu.
  // Multiple of these flow in a flex-wrap row (laid out by the parent), so they don't waste space.
  import { tick } from 'svelte';
  import { effectiveZoom } from './workbench/svelte/contextMenu';
  interface Opt {
    value: number;
    label: string;
  }
  let {
    label,
    value,
    options,
    accent = '#35c9d6',
    fixedWidth,
    fieldHeight,
    hideLabel = false,
    onChange
  }: {
    label: string;
    value: number;
    options: Opt[];
    accent?: string;
    /** Exact width in px. The device canvas passes the box the DEVICE authored for this control, which
     *  overrides the label-length sizing below — that heuristic exists for the flow layouts, where
     *  nothing else decides the width. */
    fixedWidth?: number;
    /** Exact field height in px (the canvas's boxes are as short as 28px). */
    fieldHeight?: number;
    /** Drop the caption above the field — the `dropdownNoLabel`/`readout*` tokens have none. */
    hideLabel?: boolean;
    onChange: (v: number) => void;
  } = $props();

  const current = $derived(options.find((o) => o.value === value));
  // width scales with the longest label, like the design (maxLen*8 + 50, clamped)
  const width = $derived.by(() => {
    if (fixedWidth != null) return fixedWidth;
    const maxLen = options.reduce((m, o) => Math.max(m, o.label.length), label.length);
    return Math.max(112, Math.min(236, Math.round(maxLen * 8 + 50)));
  });

  let open = $state(false);
  let menu = $state<{ left: number; top: number; width: number } | null>(null);
  let fieldEl = $state<HTMLDivElement | null>(null);
  let scrimEl = $state<HTMLElement | null>(null);

  // The menu is portaled to <body> so it escapes the device canvas's scale transform (a transformed
  // ancestor is the containing block for `position: fixed`, which would otherwise anchor the popup to
  // the canvas surface rather than the viewport). Body still sits under the root `<html>` CSS zoom
  // (the UI-scale setting), so the field's VISUAL rect coords must be divided back into the LAYOUT
  // space a fixed element positions in — the viewport-spanning backdrop self-calibrates that ratio.
  const zoomNow = () => (scrimEl ? effectiveZoom(scrimEl.getBoundingClientRect().width, scrimEl.offsetWidth) : 1);

  function place() {
    const r = fieldEl?.getBoundingClientRect();
    if (!r) return null;
    // open below the field, flip up if it would overflow the viewport
    const below = window.innerHeight - r.bottom;
    const top = below < 200 && r.top > below ? r.top - Math.min(248, options.length * 38 + 12) - 4 : r.bottom + 4;
    const z = zoomNow();
    return { left: r.left / z, top: top / z, width: r.width / z };
  }

  function toggle() {
    if (open) {
      open = false;
      return;
    }
    menu = place();
    open = true;
    // First paint has no backdrop yet, so the zoom estimate above is 1; re-place once the scrim exists.
    void tick().then(() => {
      if (open) menu = place();
    });
  }
  function pick(v: number) {
    open = false;
    onChange(v);
  }

  // Lift the popup out of the canvas surface into <body> so its fixed position resolves to the viewport.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode === document.body) document.body.removeChild(node);
      }
    };
  }
</script>

<div class="dd-wrap" style="--c:{accent}; width:{width}px">
  {#if !hideLabel}<div class="lbl">{label}</div>{/if}
  <div class="field" class:open class:dense={fieldHeight != null && fieldHeight < 34} style:height={fieldHeight != null ? `${fieldHeight}px` : undefined} bind:this={fieldEl} role="button" tabindex="0" onclick={toggle} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}>
    <span class="cur">{current?.label ?? value}</span>
    <span class="caret">▾</span>
  </div>
</div>

{#if open && menu}
  <div class="portal" style:--c={accent} use:portal>
    <button class="backdrop" bind:this={scrimEl} aria-label="Close" onclick={() => (open = false)}></button>
    <div class="menu scroll" style="left:{menu.left}px; top:{menu.top}px; width:{menu.width}px">
      {#each options as o (o.value)}
        <button class="opt" class:active={o.value === value} onclick={() => pick(o.value)}>
          <span class="ol">{o.label}</span>
          {#if o.value === value}<span class="chk">✓</span>{/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .dd-wrap {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  .lbl {
    font-weight: 600;
    font-size: 12px;
    color: var(--text2);
    white-space: pre-line;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    padding: 0 12px;
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    min-width: 0;
  }
  .field.open,
  .field:hover {
    border-color: var(--c);
  }
  .cur {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .field.dense {
    padding: 0 6px;
    border-radius: 6px;
    font-size: 11px;
  }
  .caret {
    font-size: 10px;
    color: var(--textfaint);
    flex: none;
    margin-left: 8px;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 119;
    border: 0;
    background: transparent;
    cursor: default;
  }
  .portal {
    display: contents;
  }
  .menu {
    position: fixed;
    z-index: 120;
    max-height: 248px;
    overflow-y: auto;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 11px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
    padding: 6px;
  }
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 10px 11px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: var(--text2);
    background: transparent;
  }
  .opt:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .opt.active {
    font-weight: 700;
    color: var(--text);
    background: rgba(53, 201, 214, 0.12);
  }
  .ol {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chk {
    color: var(--c);
    flex: none;
  }
</style>
