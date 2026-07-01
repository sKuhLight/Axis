<script lang="ts">
  // Compact dropdown: label-on-top field (112–236px) that opens a fixed popup menu.
  // Multiple of these flow in a flex-wrap row (laid out by the parent), so they don't waste space.
  interface Opt {
    value: number;
    label: string;
  }
  let {
    label,
    value,
    options,
    accent = '#35c9d6',
    onChange
  }: { label: string; value: number; options: Opt[]; accent?: string; onChange: (v: number) => void } = $props();

  const current = $derived(options.find((o) => o.value === value));
  // width scales with the longest label, like the design (maxLen*8 + 50, clamped)
  const width = $derived.by(() => {
    const maxLen = options.reduce((m, o) => Math.max(m, o.label.length), label.length);
    return Math.max(112, Math.min(236, Math.round(maxLen * 8 + 50)));
  });

  let open = $state(false);
  let menu = $state<{ left: number; top: number; width: number } | null>(null);
  let fieldEl = $state<HTMLDivElement | null>(null);

  function toggle() {
    if (open) {
      open = false;
      return;
    }
    const r = fieldEl?.getBoundingClientRect();
    if (!r) return;
    // open below the field, flip up if it would overflow the viewport
    const below = window.innerHeight - r.bottom;
    const top = below < 200 && r.top > below ? r.top - Math.min(248, options.length * 38 + 12) - 4 : r.bottom + 4;
    menu = { left: r.left, top, width: r.width };
    open = true;
  }
  function pick(v: number) {
    open = false;
    onChange(v);
  }
</script>

<div class="dd-wrap" style="--c:{accent}; width:{width}px">
  <div class="lbl">{label}</div>
  <div class="field" class:open bind:this={fieldEl} role="button" tabindex="0" onclick={toggle} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}>
    <span class="cur">{current?.label ?? value}</span>
    <span class="caret">▾</span>
  </div>
</div>

{#if open && menu}
  <button class="backdrop" aria-label="Close" onclick={() => (open = false)}></button>
  <div class="menu scroll" style="left:{menu.left}px; top:{menu.top}px; width:{menu.width}px">
    {#each options as o (o.value)}
      <button class="opt" class:active={o.value === value} onclick={() => pick(o.value)}>
        <span class="ol">{o.label}</span>
        {#if o.value === value}<span class="chk">✓</span>{/if}
      </button>
    {/each}
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
    color: #c3c3cb;
    white-space: nowrap;
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
    color: #ededf2;
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
  .menu {
    position: fixed;
    z-index: 120;
    max-height: 248px;
    overflow-y: auto;
    background: #1a1a1f;
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
    color: #c3c3cb;
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
