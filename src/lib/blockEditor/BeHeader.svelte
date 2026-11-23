<script lang="ts">
  // Block Editor header: type chip (glyph · type name or cab summary · channel letter that unfolds A–D),
  // the page tabs (top navigation), "Find a control…", the Engaged | Mute | Scene Ignore segments and
  // the ⋯ menu trigger (amber dot while the layout differs from its seed). One row when every part fits
  // at its widest (`oneRowMinWidth`: ~1240 px with the tabs, less with the side navigation, whose page
  // list sits beside the board), two rows below: chip · segments · ⋯ on top, tabs · search underneath.
  // The parts are placed in document order (`headerOrder`), so Tab walks row 1 before row 2. Without a
  // block (the virtual-effect screens) it is the compact row: tabs · search · ⋯. On the phone device
  // class every hit target is at least 40 px.
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import BePageNav from './BePageNav.svelte';
  import type { BeNav } from './boardGeometry';
  import { CHANNELS, headerFit, headerOrder, headerRows, MORE_MENU_W, stateLabels, typeChip, type BeBlockChrome } from './headerModel';

  let {
    block,
    nav,
    phone = false,
    width = $bindable(0),
    pages,
    active,
    highlight,
    editMode,
    renaming,
    onGo,
    onStartRename,
    onRename,
    onCancelRename,
    onAdd,
    moreOpen,
    moreDot,
    moreAnchor = $bindable(null),
    onMore,
    search,
    end
  }: {
    block: BeBlockChrome | null;
    /** Effective navigation: the tabs live here only for `top`. */
    nav: BeNav;
    /** Phone device class: ≥ 40 px hit targets. */
    phone?: boolean;
    /** Measured header (= editor) width. */
    width?: number;
    pages: readonly string[];
    active: string;
    highlight: ReadonlySet<string>;
    editMode: boolean;
    renaming: string | null;
    onGo: (page: string) => void;
    onStartRename: (page: string) => void;
    onRename: (page: string, name: string) => void;
    onCancelRename: () => void;
    onAdd: () => void;
    moreOpen: boolean;
    moreDot: boolean;
    /** Box the ⋯ menu opens under (right-aligned to the trigger). */
    moreAnchor?: HTMLElement | null;
    onMore: () => void;
    /** The search (field, or icon button on a narrow editor). */
    search: Snippet<[boolean]>;
    /** Trailing control (the monolith's ✕). */
    end?: Snippet;
  } = $props();

  const rows = $derived(block ? headerRows(width, nav, !!end) : 1);
  const fit = $derived(headerFit(width));
  const chip = $derived(
    block
      ? typeChip({ family: block.family, typeName: block.typeName, pack: block.pack, isCab: block.isCab, cabSummary: block.cabSummary, channel: block.channel })
      : null
  );
  const labels = $derived(stateLabels(width, !!block?.bypassed));
  const canBypass = $derived(!!block?.pack);
  const showTabs = $derived(nav === 'top' && pages.length > 0);
  const order = $derived(headerOrder({ rows, block: !!block, tabs: showTabs, end: !!end, tiny: fit.tiny }));

  // channel letter: a click unfolds A–D (focus on the current channel), a pick or Escape folds it again
  // (focus back on the letter); a press elsewhere folds it too. On a phone the letters open as a bar over
  // the first header row (40 px targets do not fit inside the chip)
  let chanOpen = $state(false);
  let chipEl = $state<HTMLElement | null>(null);
  let headEl = $state<HTMLElement | null>(null);
  let chanBarEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!chanOpen) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!chipEl?.contains(t) && !chanBarEl?.contains(t)) chanOpen = false;
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  });
  $effect(() => {
    if (!chip?.channel) chanOpen = false;
  });
  async function openChannels() {
    chanOpen = true;
    await tick();
    headEl?.querySelector<HTMLElement>('[data-be-channel][aria-pressed="true"], [data-be-channel]')?.focus();
  }
  async function foldChannels() {
    chanOpen = false;
    await tick();
    headEl?.querySelector<HTMLElement>('[data-be-channel-toggle]')?.focus();
  }
  function pickChannel(ch: string) {
    block?.onChannel(ch);
    void foldChannels();
  }
  function chanKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // owned here: the app's Escape chain never sees it
      e.preventDefault();
      e.stopPropagation();
      void foldChannels();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const btns = Array.from(headEl?.querySelectorAll<HTMLElement>('[data-be-channel]') ?? []);
      const i = btns.indexOf(document.activeElement as HTMLElement);
      btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length]?.focus();
    }
  }
</script>

{#snippet chipPart()}
  {#if block && chip}
    <div class="be-chip" bind:this={chipEl} data-be-chip>
      <button
        class="be-chip-type"
        type="button"
        title={chip.title}
        aria-label={chip.action === 'cab' ? 'Choose cab' : 'Change block type'}
        disabled={!chip.action}
        data-be-type
        onclick={() => block.onType()}
      >
        <span class="be-glyph" aria-hidden="true" style:background={block.glyphBg} style:border-color={block.glyphBorder}>{block.glyph}</span>
        <span class="be-chip-txt">
          {#if !fit.tiny}<span class="be-chip-sub">{chip.sub}</span>{/if}
          <span class="be-chip-name">{chip.name}</span>
        </span>
        {#if chip.action}
          <svg class="be-chip-mag" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.6 10.6 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
        {/if}
      </button>
      {#if chip.channel}
        <span class="be-chip-sep" aria-hidden="true"></span>
        {#if chanOpen && !phone}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div class="be-chans" role="group" aria-label="Channel" tabindex="-1" onkeydown={chanKey}>
            {#each CHANNELS as ch (ch)}
              <button class="be-chan" class:on={chip.channel === ch} type="button" aria-pressed={chip.channel === ch} title="Channel {ch}" data-be-channel={ch} onclick={() => pickChannel(ch)}>{ch}</button>
            {/each}
          </div>
        {:else}
          <button
            class="be-chip-ch"
            class:on={chanOpen}
            type="button"
            aria-expanded={chanOpen}
            aria-label="Channel {chip.channel} — change channel"
            title="Channel — click to switch"
            data-be-channel-toggle
            onclick={() => (chanOpen ? foldChannels() : openChannels())}
          >
            <span class="be-ch-lbl">CH</span>
            <span class="be-ch-val">{chip.channel}</span>
          </button>
        {/if}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet statePart()}
  {#if block}
    <div class="be-state" role="group" aria-label="Block state">
      <button
        class="be-seg eng"
        class:byp={block.bypassed}
        type="button"
        aria-pressed={!block.bypassed}
        title="Engage / bypass this block"
        disabled={!canBypass}
        data-be-engaged={block.bypassed ? 'false' : 'true'}
        onclick={() => block.onBypass()}
      >
        <span class="be-led" aria-hidden="true"></span><span>{labels.engaged}</span>
      </button>
      <span class="be-seg-sep" aria-hidden="true"></span>
      <button class="be-seg" type="button" aria-pressed="false" title="Mute block output (coming soon)" data-be-mute onclick={() => block.onMute()}>
        <span class="be-led" aria-hidden="true"></span><span>{labels.mute}</span>
      </button>
      <span class="be-seg-sep" aria-hidden="true"></span>
      <button class="be-seg" type="button" aria-pressed="false" title="Scene Ignore — scene changes leave this block alone (coming soon)" data-be-scene onclick={() => block.onScene()}>
        <span class="be-led" aria-hidden="true"></span><span>{labels.scene}</span>
      </button>
    </div>
  {/if}
{/snippet}

<div
  class="be-head"
  class:one={rows === 1}
  class:two={rows === 2}
  class:compact={!block}
  class:tiny={fit.tiny}
  class:xs={fit.xs}
  class:phone
  class:hasend={!!end}
  data-be-head
  data-be-head-rows={rows}
  bind:clientWidth={width}
  bind:this={headEl}
>
  {#if phone && chanOpen && chip?.channel}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="be-chanbar" role="group" aria-label="Channel" tabindex="-1" bind:this={chanBarEl} onkeydown={chanKey}>
      <span class="be-chanbar-lbl">CHANNEL</span>
      {#each CHANNELS as ch (ch)}
        <button class="be-chan" class:on={chip.channel === ch} type="button" aria-pressed={chip.channel === ch} title="Channel {ch}" data-be-channel={ch} onclick={() => pickChannel(ch)}>{ch}</button>
      {/each}
    </div>
  {/if}
  {#each order as part (part)}
    {#if part === 'chip'}
      {@render chipPart()}
    {:else if part === 'tabs'}
      <div class="be-tabs">
        <BePageNav variant="tabs" touch={phone} {pages} {active} {highlight} {editMode} {renaming} {onGo} {onStartRename} {onRename} {onCancelRename} {onAdd} />
      </div>
    {:else if part === 'spA' || part === 'spB'}
      <span class="be-sp" class:a={part === 'spA'}></span>
    {:else if part === 'tools'}
      <div class="be-tools" class:field={fit.searchField}>
        {@render search(!fit.searchField)}
      </div>
    {:else if part === 'state'}
      {@render statePart()}
    {:else if part === 'more'}
      <div class="be-morewrap">
        <button
          class="be-more"
          class:on={moreOpen}
          type="button"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label="Block and layout options"
          title="Arrange, layout and block options"
          data-be-more
          data-custom={moreDot ? 'true' : 'false'}
          onclick={onMore}
        >
          ⋯{#if moreDot}<span class="be-more-dot" aria-hidden="true" data-be-more-dot></span>{/if}
        </button>
        <span class="be-more-anchor" aria-hidden="true" style:width="{MORE_MENU_W}px" bind:this={moreAnchor}></span>
      </div>
    {:else if part === 'end' && end}
      <div class="be-end">{@render end()}</div>
    {:else if part === 'break' || part === 'breakEnd'}
      <span class="be-break" aria-hidden="true"></span>
    {/if}
  {/each}
</div>

<style>
  .be-head {
    position: relative;
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 8px;
    row-gap: 6px;
    min-width: 0;
    padding: 7px 12px;
    background: color-mix(in srgb, var(--surface) 45%, var(--bg2));
    border-bottom: 1px solid var(--surface2);
  }

  /* rows: the parts come in document order (headerOrder); a break starts row 2 */
  .be-break {
    flex-basis: 100%;
    height: 0;
  }
  .be-sp {
    flex: 1 1 0px;
    min-width: 8px;
    height: 1px;
  }
  /* a phone: the spacer gives up its minimum and the chip may shrink a little further, so chip · state ·
     ⋯ (40 px targets) still share row one at 390 px */
  .tiny .be-sp {
    min-width: 0;
  }
  .two.tiny .be-chip {
    min-width: 116px;
  }
  /* a 360 px phone: tighter segments and a chip that may shrink a little more */
  .two.xs .be-chip {
    min-width: 100px;
  }
  .tiny.xs .be-seg {
    padding: 0 6px;
    gap: 4px;
  }
  /* a phone with a close button (monolith sheet): the chip takes row one beside ✕ */
  .two.tiny.hasend .be-chip {
    flex-grow: 1;
  }

  /* ── type chip ── */
  .be-chip {
    display: flex;
    align-items: stretch;
    height: 36px;
    min-width: 0;
    flex: 0 1 auto;
    max-width: 390px;
    border-radius: 9px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  /* two rows: the chip gives way (basis 0, up to its own width) so the state segments and ⋯ share its
     row, also on a phone; below ~132 px of chip (a phone with the monolith's close button) the
     segments move to a row of their own instead of cutting the type name to a letter */
  .two .be-chip {
    flex: 1000 1 0px;
    min-width: 132px;
    max-width: max-content;
  }
  .tiny .be-chip-mag,
  .tiny .be-ch-lbl {
    display: none;
  }
  .tiny .be-chip-ch {
    padding: 0 10px;
  }
  .be-chip-type {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    flex: 0 1 auto;
    padding: 0 10px 0 4px;
    border: 0;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: background 0.12s;
  }
  .be-chip-type:hover:not(:disabled),
  .be-chip-ch:hover {
    background: var(--surface2);
  }
  .be-chip-type:disabled {
    cursor: default;
  }
  .be-glyph {
    width: 28px;
    height: 28px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    border: 1px solid;
    font-size: 14px;
    color: var(--text);
  }
  .be-chip-txt {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    max-width: 300px;
    overflow: hidden;
    line-height: 1.15;
  }
  .be-chip-sub {
    max-width: 100%;
    font: 600 9px/1.25 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--textdim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-chip-name {
    max-width: 100%;
    font: 800 13px/1.2 var(--font-ui);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-chip-mag {
    flex: none;
    margin-left: 2px;
    color: var(--accent);
  }
  .be-chip-sep {
    width: 1px;
    flex: none;
    margin: 6px 0;
    background: var(--border);
  }
  .be-chip-ch {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
    padding: 0 11px 0 10px;
    border: 0;
    background: transparent;
    cursor: pointer;
    transition: background 0.12s;
  }
  .be-ch-lbl {
    font: 700 9px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--textdim);
  }
  .be-ch-val {
    font: 800 14px/1 var(--font-mono);
    color: var(--accentbright);
  }
  .be-chans {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
    padding: 0 5px;
    animation: beChan 0.16s ease;
  }
  @keyframes beChan {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
  }
  .be-chan {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    background: transparent;
    color: var(--textdim);
    font: 700 11.5px/1 var(--font-mono);
  }
  .be-chan:hover {
    color: var(--text);
    background: var(--surface2);
  }
  .be-chan.on {
    color: var(--accentbright);
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }

  /* ── tabs + search ── */
  /* the tabs never push the search to another line: they take what is left (up to their own width) and
     scroll sideways beyond that */
  .be-tabs {
    display: flex;
    min-width: 0;
    flex: 1000 1 0px;
    max-width: max-content;
  }
  .one .be-tabs {
    margin-left: 4px;
  }
  .be-tools {
    display: flex;
    align-items: center;
    flex: none;
  }
  .be-tools.field {
    width: 200px;
  }
  .one .be-tools.field {
    width: 220px;
  }
  .compact .be-tools.field {
    flex: 0 1 220px;
    min-width: 140px;
  }

  /* ── block state: one joined control ── */
  .be-state {
    display: flex;
    align-items: stretch;
    flex: none;
    height: 30px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border2);
  }
  .be-seg {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 11px;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
    background: transparent;
    color: var(--textdim);
    font: 600 12px/1 var(--font-ui);
    transition:
      background 0.12s,
      color 0.12s,
      filter 0.12s;
  }
  .tiny .be-seg {
    padding: 0 8px;
  }
  .be-seg:hover:not(:disabled) {
    filter: brightness(1.2);
  }
  .be-seg:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .be-led {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--border3);
  }
  .be-seg.eng {
    background: var(--ok-tint);
    color: var(--ok);
  }
  .be-seg.eng .be-led {
    background: var(--ok);
    box-shadow: 0 0 7px var(--ok);
  }
  .be-seg.eng.byp {
    background: var(--danger-tint);
    color: var(--danger);
  }
  .be-seg.eng.byp .be-led {
    background: var(--danger);
    box-shadow: 0 0 7px var(--danger);
  }
  .be-seg-sep {
    width: 1px;
    flex: none;
    background: var(--border2);
  }

  /* ── ⋯ ── */
  .be-morewrap {
    position: relative;
    flex: none;
  }
  .be-more {
    position: relative;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 8px;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
    font: 600 15px/1 var(--font-ui);
    transition:
      border-color 0.12s,
      color 0.12s;
  }
  .be-more:hover {
    border-color: var(--border3);
    color: var(--text);
  }
  .be-more.on {
    border-color: var(--accent-border);
    color: var(--accentbright);
  }
  .be-more-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--amber);
    box-shadow: 0 0 5px var(--amber);
  }
  /* the menu opens under this box: as wide as the menu, right edge on the trigger's right edge */
  .be-more-anchor {
    position: absolute;
    right: 0;
    top: 100%;
    height: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .be-end {
    display: flex;
    flex: none;
  }
  .be-chip-ch.on {
    background: var(--surface2);
  }
  /* phone: the channel letters as a bar over the first header row */
  .be-chanbar {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 4px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 12px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--accent-border);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--bg) 70%, transparent);
    animation: beChan 0.16s ease;
  }
  .be-chanbar-lbl {
    flex: 1;
    font: 700 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: var(--textdim);
  }
  .be-chanbar .be-chan {
    flex: none;
    width: 52px;
    height: 40px;
    font-size: 14px;
  }
  /* ── phone device class: every hit target ≥ 40 px ── */
  .phone .be-chip {
    height: 42px;
  }
  .phone .be-chan,
  .phone .be-more {
    width: 40px;
    height: 40px;
  }
  .phone .be-state {
    height: 42px; /* 40 px segments inside the 1 px border */
  }
  .phone .be-chip-ch {
    min-width: 40px;
    justify-content: center;
  }
</style>
