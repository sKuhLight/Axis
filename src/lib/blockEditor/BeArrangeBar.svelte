<script lang="ts">
  // The Arrange bar: ONE row under the header while arranging — the selection's tools (a control: View,
  // Size S/M/L, ⚡ Pin, ⇆ grid swipe control, ✕ Remove; a divider: label field, Rotate, ✕ Remove) or a hint,
  // then Undo · + Add · + Divider h / v · Close gaps · Tidy up · Auto-pack · Page ▾ · ✓ Done. What does
  // not fit goes into a "⋯" menu at the end of the row (arrangeBar.ts decides from the parts' measured
  // widths), so the board keeps its height. The Page ▾ and ⋯ menus (which one is open: `menu`; their
  // triggers: `pageAnchor` / `moreAnchor`; the parts in the ⋯: `overflow`) are rendered by BeSurface in the
  // editor's one overlay layer.
  import { tick, untrack } from 'svelte';
  import { barParts, fitBar, type ArrangeSel, type BarActions, type BarPart } from './arrangeBar';
  import { UNDO_KEYS } from './arrangeModel';
  import type { BeView } from './boardModel';
  import { SIZE_NAME, VIEW_NAME } from './controlMenu';

  let {
    sel,
    canUndo,
    autoPack,
    page,
    touch = false,
    libOpen = false,
    labelFocus = 0,
    actions,
    onDone,
    menu = $bindable(null),
    pageAnchor = $bindable(null),
    moreAnchor = $bindable(null),
    overflow = $bindable([]),
    libAnchor = $bindable(null),
    barEl = $bindable(null)
  }: {
    sel: ArrangeSel | null;
    canUndo: boolean;
    autoPack: boolean;
    /** The current page (Page ▾ acts on it; "+ Add" adds to it). */
    page: string;
    /** Tablet: ≥ 40 px targets. */
    touch?: boolean;
    libOpen?: boolean;
    /** Bumped when the divider label field should take the focus. */
    labelFocus?: number;
    actions: BarActions;
    onDone: () => void;
    /** The open bar menu: Page ▾ or the ⋯ overflow. */
    menu?: 'page' | 'more' | null;
    pageAnchor?: HTMLElement | null;
    moreAnchor?: HTMLElement | null;
    /** The parts the ⋯ offers (row order). */
    overflow?: BarPart[];
    /** Where the "Add" library opens from: "+ Add", or the ⋯ when "+ Add" went into it. */
    libAnchor?: HTMLElement | null;
    barEl?: HTMLElement | null;
  } = $props();

  const VIEW_ICON: Readonly<Partial<Record<BeView, string>>> = { knob: '◉', fader: '⇕', slider: '⇔', number: '#', button: '⏻', switch: '⊙' };
  const GAP = 6;
  const moreW = $derived(touch ? 40 : 30);

  const parts = $derived(barParts(sel));
  let rowW = $state(0);
  let measEl = $state<HTMLElement | null>(null);
  let widths = $state<Partial<Record<BarPart, number>>>({});
  // the row's padding (2 × 12 px) and the gap the flexible spacer before Undo adds
  const fit = $derived(fitBar(Math.max(0, rowW - 24 - GAP), parts, widths, GAP, moreW));
  const shown = (p: BarPart) => !fit.hidden.has(p);

  /** Measure every part at its natural width in the hidden copy of the row. */
  function measure() {
    if (!measEl) return;
    const next: Partial<Record<BarPart, number>> = {};
    for (const el of measEl.querySelectorAll<HTMLElement>('[data-part]')) next[el.dataset.part as BarPart] = el.offsetWidth;
    const same = Object.keys(next).length === Object.keys(widths).length && Object.entries(next).every(([k, v]) => widths[k as BarPart] === v);
    if (!same) widths = next;
  }
  $effect(() => {
    void [parts, sel, page, touch, autoPack, canUndo];
    void tick().then(measure);
  });
  $effect(() => {
    const node = measEl;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(node);
    return () => ro.disconnect();
  });

  // ── menus: Page ▾ and the ⋯ overflow (rendered by BeSurface) ──
  let addBtn = $state<HTMLElement | null>(null);
  $effect(() => {
    const next = fit.overflow;
    untrack(() => {
      if (next.length !== overflow.length || next.some((p, i) => p !== overflow[i])) overflow = next;
    });
  });
  // the library opens from "+ Control", or from the ⋯ when "+ Control" is in there
  $effect(() => {
    libAnchor = shown('add') ? addBtn : moreAnchor;
  });
  // a menu whose trigger went away (the part moved into the ⋯, the bar closed) closes
  $effect(() => {
    if (menu === 'page' && !shown('page')) menu = null;
    if (menu === 'more' && !fit.overflow.length) menu = null;
  });

  // ── the divider label field: commit on Enter / leaving it; Escape puts the stored label back. The field
  //    carries its divider's id (`data-be-div`): it commits to that divider even when it loses the focus to
  //    a press that already selected something else (another tile, empty grid). ──
  let labelEl = $state<HTMLInputElement | null>(null);
  let lastFocus = untrack(() => labelFocus);
  $effect(() => {
    const n = labelFocus;
    const el = labelEl;
    if (n === lastFocus) return;
    lastFocus = n; // taken even when the field is in the ⋯ (no field here): a later field must not take it
    if (!el) return;
    el.focus();
    el.select();
  });
  const labelOf = (el: HTMLInputElement) => el.dataset.beDiv ?? '';
  function labelKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === 'Enter') {
      e.preventDefault();
      actions.label(labelOf(e.currentTarget), e.currentTarget.value);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      // the field's own Escape: Arrange stays on
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.value = sel?.kind === 'divider' ? sel.label : '';
      e.currentTarget.blur();
    }
  }
</script>

{#snippet part(p: BarPart, live: boolean)}
  {#if p === 'tag'}
    <span class="be-ab-tag">✥ ARRANGE</span>
  {:else if p === 'hint'}
    <span class="be-ab-hint">{touch ? 'Tap a tile to select it · drag it anywhere · ⌟ resizes' : `Drag tiles anywhere · ⌟ resizes · arrows nudge · Del removes · ${UNDO_KEYS} undoes`}</span>
  {:else if p === 'sel-name' && sel}
    <span class="be-ab-name" title={sel.name}>{sel.name}</span>
  {:else if p === 'sel-view' && sel?.kind === 'control'}
    <div class="be-ab-seg" role="group" aria-label="View">
      {#each sel.views as v (v)}
        <button
          type="button"
          class:on={v === sel.view}
          aria-pressed={v === sel.view}
          title={VIEW_NAME[v]}
          data-be-ab-view={live ? v : null}
          onclick={() => v !== sel.view && actions.view(v)}><span aria-hidden="true">{VIEW_ICON[v] ?? '◇'}</span>{VIEW_NAME[v]}</button
        >
      {/each}
    </div>
  {:else if p === 'sel-size' && sel?.kind === 'control'}
    <div class="be-ab-seg" role="group" aria-label="Size">
      {#each sel.sizes as z (z.label ?? 'custom')}
        {#if z.label}
          <button
            type="button"
            class="sz"
            class:on={z.checked}
            aria-pressed={z.checked}
            title="{SIZE_NAME[z.label]} · {z.w}×{z.h}"
            data-be-ab-size={live ? z.label : null}
            onclick={() => !z.checked && actions.size(z.w, z.h)}>{z.label}</button
          >
        {:else}
          <span class="be-ab-custom" title="Custom size">{z.w}×{z.h}</span>
        {/if}
      {/each}
    </div>
  {:else if p === 'sel-pin'}
    <button class="be-ab-ic pin" type="button" title="Pin as quick control" aria-label="Pin as quick control" data-be-ab={live ? 'pin' : null} onclick={() => actions.pin()}>
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.2 1 L3 9.2 H7.4 L6.4 15 L13 6.6 H8.6 Z" fill="currentColor" /></svg>
    </button>
  {:else if p === 'sel-swipe' && sel?.kind === 'control'}
    <button
      class="be-ab-ic swipe"
      class:on={!!sel.swipe}
      type="button"
      title={sel.swipe ? 'Grid swipe control: on' : 'Make it the grid swipe control'}
      aria-label="Grid swipe control"
      aria-pressed={!!sel.swipe}
      data-be-ab={live ? 'swipe' : null}
      onclick={() => actions.swipe()}>⇆</button
    >
  {:else if p === 'div-label' && sel?.kind === 'divider'}
    {#if live}
      {#key sel.id}
        <input
          bind:this={labelEl}
          class="be-ab-label"
          value={sel.label}
          placeholder="Label (optional)"
          aria-label="Divider label"
          data-be-ab="label"
          data-be-div={sel.id}
          onkeydown={labelKey}
          onchange={(e) => actions.label(labelOf(e.currentTarget), e.currentTarget.value)}
        />
      {/key}
    {:else}
      <span class="be-ab-label"></span>
    {/if}
  {:else if p === 'div-rotate'}
    <button class="be-ab-btn" type="button" title="Switch between horizontal and vertical" data-be-ab={live ? 'rotate' : null} onclick={() => actions.rotate()}>⟲ Rotate</button>
  {:else if p === 'sel-remove'}
    <button class="be-ab-ic danger" type="button" title="Remove from page (Del)" aria-label={sel?.kind === 'divider' ? 'Remove divider' : 'Remove from page'} data-be-ab={live ? 'remove' : null} onclick={() => actions.remove()}>✕</button>
  {:else if p === 'undo'}
    <button class="be-ab-ic undo" type="button" title="Undo ({UNDO_KEYS})" aria-label="Undo" disabled={!canUndo} data-be-ab={live ? 'undo' : null} onclick={() => actions.undo()}>↶</button>
  {:else if p === 'add'}
    {#if live}
      <button
        bind:this={addBtn}
        class="be-ab-btn accent"
        class:on={libOpen}
        type="button"
        title="Add a control to {page} (library: click = first free spot, drag = exact spot)"
        aria-label="Add a control"
        aria-expanded={libOpen}
        aria-haspopup="dialog"
        data-be-ab="add"
        onclick={() => actions.add()}>+ Control</button
      >
    {:else}
      <button class="be-ab-btn accent" type="button">+ Control</button>
    {/if}
  {:else if p === 'divider'}
    <div class="be-ab-seg" role="group" aria-label="Add divider">
      <button type="button" class="dv" title="Add a horizontal divider" aria-label="Add a horizontal divider" data-be-ab={live ? 'hdiv' : null} onclick={() => actions.divider('hdiv')}
        ><svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><path d="M1 6 H15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>+</button
      >
      <button type="button" class="dv" title="Add a vertical divider" aria-label="Add a vertical divider" data-be-ab={live ? 'vdiv' : null} onclick={() => actions.divider('vdiv')}
        ><svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><path d="M5 1 V13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>+</button
      >
    </div>
  {:else if p === 'close-gaps'}
    <button class="be-ab-btn" type="button" title="Remove the empty rows and columns of {page}" data-be-ab={live ? 'close-gaps' : null} onclick={() => actions.closeGaps()}>Close gaps</button>
  {:else if p === 'tidy'}
    <button class="be-ab-btn" type="button" title="Slide everything on {page} up and left" data-be-ab={live ? 'tidy' : null} onclick={() => actions.tidy()}>Tidy up</button>
  {:else if p === 'autopack'}
    <button
      class="be-ab-btn"
      class:on={autoPack}
      type="button"
      title="Tidy the page after every move, resize or add"
      aria-pressed={autoPack}
      data-be-autopack={live ? '' : null}
      data-be-ab={live ? 'autopack' : null}
      onclick={() => actions.autoPack(!autoPack)}>{autoPack ? '⊞' : '⊡'} Auto-pack</button
    >
  {:else if p === 'page'}
    {#if live}
      <button bind:this={pageAnchor} class="be-ab-btn page" class:on={menu === 'page'} type="button" title="Page options" aria-haspopup="menu" aria-expanded={menu === 'page'} data-be-ab="page" onclick={() => (menu = menu === 'page' ? null : 'page')}
        ><span class="be-ab-pg">Page: {page}</span><span class="be-ab-caret" aria-hidden="true">▾</span></button
      >
    {:else}
      <button class="be-ab-btn page" type="button"><span class="be-ab-pg">Page: {page}</span><span class="be-ab-caret">▾</span></button>
    {/if}
  {:else if p === 'done'}
    <button class="be-ab-btn done" type="button" title="Finish arranging (Esc)" data-be-arrange-done={live ? '' : null} onclick={onDone}>✓ Done</button>
  {/if}
{/snippet}

<div class="be-ab" class:touch bind:this={barEl} bind:clientWidth={rowW} role="toolbar" aria-label="Arrange" data-be-arrange-bar>
  {#each parts as p (p)}
    {#if p === 'undo'}<span class="be-ab-sp"></span>{/if}
    {#if p === 'done' && fit.overflow.length}
      <button bind:this={moreAnchor} class="be-ab-ic more" class:on={menu === 'more'} type="button" title="More arrange tools" aria-label="More arrange tools" aria-haspopup="menu" aria-expanded={menu === 'more'} data-be-ab="more" onclick={() => (menu = menu === 'more' ? null : 'more')}>⋯</button>
    {/if}
    {#if shown(p)}
      <span class="be-ab-part" data-be-part={p}>{@render part(p, true)}</span>
    {/if}
  {/each}

  <!-- every part at its natural width, invisible: what fitBar measures -->
  <div class="be-ab-meas" bind:this={measEl} aria-hidden="true" inert>
    {#each parts as p (p)}
      <span class="be-ab-part" data-part={p}>{@render part(p, false)}</span>
    {/each}
  </div>
</div>


<style>
  .be-ab {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    min-width: 0;
    padding: 6px 12px;
    overflow: hidden;
    background: color-mix(in srgb, var(--accent) 5%, var(--bg2));
    border-top: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .be-ab-meas {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    gap: 6px;
    visibility: hidden;
    pointer-events: none;
    white-space: nowrap;
  }
  .be-ab-part {
    flex: none;
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .be-ab-sp {
    flex: 1;
    min-width: 0;
  }
  .be-ab-tag {
    font: 700 9.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--accentbright);
    white-space: nowrap;
  }
  .be-ab-hint {
    font: 500 11.5px/1.3 var(--font-ui);
    color: var(--textdim);
    white-space: nowrap;
  }
  .be-ab-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 12px/1 var(--font-ui);
    color: var(--text);
  }
  .be-ab-btn,
  .be-ab-ic,
  .be-ab-seg button {
    height: 28px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font: 600 12px/1 var(--font-ui);
  }
  .be-ab-btn {
    padding: 0 11px;
  }
  .be-ab-btn:hover,
  .be-ab-ic:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text);
  }
  .be-ab-btn.on {
    background: var(--accent-tint);
    border-color: var(--accent);
    color: var(--accentbright);
  }
  .be-ab-btn.accent {
    background: var(--accent-tint);
    border-color: var(--accent-border);
    color: var(--accentbright);
    font-weight: 700;
  }
  .be-ab-btn.done {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accentink);
    font-weight: 700;
  }
  .be-ab-btn.page {
    max-width: 200px;
  }
  .be-ab-pg {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-ab-caret {
    font-size: 9px;
    color: var(--textfaint);
  }
  .be-ab-ic {
    width: 28px;
    padding: 0;
    font-size: 14px;
  }
  .be-ab-ic:disabled {
    opacity: 0.38;
    cursor: default;
  }
  .be-ab-ic.pin {
    color: var(--amber);
  }
  .be-ab-ic.pin:hover {
    border-color: var(--amber-border);
    background: var(--amber-tint);
  }
  .be-ab-ic.swipe.on {
    color: var(--amber);
    border-color: var(--amber-border);
    background: var(--amber-tint);
  }
  .be-ab-ic.danger {
    font-size: 11px;
    color: var(--danger);
    background: var(--danger-tint);
    border-color: var(--danger-border);
  }
  .be-ab-ic.more.on {
    border-color: var(--accent);
    color: var(--accentbright);
  }
  .be-ab-seg {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: var(--input);
    border: 1px solid var(--border);
  }
  .be-ab-seg button {
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--textdim);
    font-size: 11.5px;
  }
  .be-ab-seg button.sz {
    min-width: 26px;
    padding: 0 6px;
    font-family: var(--font-mono);
    font-weight: 700;
  }
  .be-ab-seg button.dv {
    gap: 2px;
    padding: 0 7px;
  }
  .be-ab-seg button:hover {
    color: var(--text);
    background: var(--surface2);
  }
  .be-ab-seg button.on {
    color: var(--accentbright);
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .be-ab-custom {
    padding: 0 7px;
    font: 700 10.5px/1 var(--font-mono);
    color: var(--accentbright);
  }
  .be-ab-label {
    display: block;
    width: 170px;
    height: 28px;
    box-sizing: border-box;
    padding: 0 10px;
    border-radius: 8px;
    background: var(--input);
    border: 1px solid var(--accent-border);
    outline: none;
    color: var(--text);
    font: 600 12px/1 var(--font-ui);
  }
  .be-ab-label:focus {
    border-color: var(--accent);
  }

  /* tablet: ≥ 40 px targets */
  .be-ab.touch .be-ab-btn,
  .be-ab.touch .be-ab-ic,
  .be-ab.touch .be-ab-label {
    height: 40px;
  }
  .be-ab.touch .be-ab-ic {
    width: 40px;
  }
  .be-ab.touch .be-ab-seg {
    padding: 0;
  }
  .be-ab.touch .be-ab-seg button {
    height: 40px;
    min-width: 40px;
  }
</style>
