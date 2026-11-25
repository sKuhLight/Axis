<script lang="ts">
  import BlockGlyph from '../BlockGlyph.svelte';
  // Block Editor header: type chip (glyph · type name or cab summary · channel letter that unfolds A–D),
  // the page tabs (top navigation), "Find a control…", the Engaged | Bypass mode ▾ | Scene Ignore segments
  // (both from the device, per channel; on a phone-width editor Bypass mode moves into ⋯) and
  // the ⋯ menu trigger (amber dot while the layout differs from its seed). One row when every part fits
  // at its compact width; below that the page tabs have their own scrollable row. Search, state
  // and options remain joined at the right. Wide headers expand the search field.
  // The parts are placed in document order (`headerOrder`), so Tab walks row 1 before row 2. Without a
  // block (the virtual-effect screens) it is the compact row: tabs · search · ⋯. On the phone device
  // class every hit target is at least 40 px.
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import BePageNav from './BePageNav.svelte';
  import type { BeNav } from './boardGeometry';
  import { CHANNELS, bypassModeInMenu, bypassModeText, headerFit, headerOrder, headerRows, MORE_MENU_W, stateLabels, typeChip, type BeBlockChrome } from './headerModel';

  let {
    block,
    nav,
    phone = false,
    touch = false,
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
    bypassModeOpen = false,
    bypassModeAnchor = $bindable(null),
    onBypassMode = () => {},
    blockLibraryOpen = false,
    blockLibraryAnchor = $bindable(null),
    onBlockLibrary,
    search,
    end
  }: {
    block: BeBlockChrome | null;
    /** Effective navigation: the tabs live here only for `top`. */
    nav: BeNav;
    /** Phone device class: the channel letters open as a bar over row one. */
    phone?: boolean;
    /** Touch device class (phone and tablet): ≥ 40 px hit targets. */
    touch?: boolean;
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
    /** The Bypass mode menu is open (it opens under the control). */
    bypassModeOpen?: boolean;
    /** The Bypass mode control (the menu's anchor); null while ⋯ holds it (a phone-width editor). */
    bypassModeAnchor?: HTMLElement | null;
    /** Open / close the Bypass mode menu. */
    onBypassMode?: () => void;
    blockLibraryOpen?: boolean;
    blockLibraryAnchor?: HTMLElement | null;
    onBlockLibrary?: () => void;
    /** Opens the control search. */
    search: Snippet;
    /** Trailing control (the monolith's ✕). */
    end?: Snippet;
  } = $props();

  const rows = $derived(block ? headerRows(width, nav, !!end, touch) : 1);
  const fit = $derived(headerFit(width));
  const chip = $derived(
    block
      ? typeChip({ family: block.family, typeName: block.typeName, pack: block.pack, isCab: block.isCab, cabSummary: block.cabSummary, channel: block.channel })
      : null
  );
  const labels = $derived(stateLabels(width, !!block?.bypassed));
  const canBypass = $derived(!!block?.pack);
  // where chip · state · ⋯ (· ✕) would not share row one, the Bypass mode control moves into ⋯ (BeSurface
  // reads the same measured `width` for the ⋯ rows)
  const bmInMenu = $derived(bypassModeInMenu(width, { hasEnd: !!end, touch }));
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
        <span class="be-glyph" aria-hidden="true" style:background={block.glyphBg} style:border-color={block.glyphBorder}><BlockGlyph glyph={block.glyph} /></span>
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
      {#if onBlockLibrary}
        <span class="be-chip-sep" aria-hidden="true"></span>
        <button
          class="be-chip-lib"
          type="button"
          aria-label="Block library"
          aria-haspopup="menu"
          aria-expanded={blockLibraryOpen}
          title="Block library"
          data-be-block-library
          bind:this={blockLibraryAnchor}
          onclick={onBlockLibrary}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 4h5v16H4zM10 4h5v16h-5zM16 5l3-1 4 15-3 1z" />
          </svg>
          <span class="be-chip-lib-lbl">Library</span>
          <span aria-hidden="true" class="be-chip-lib-arrow">▾</span>
        </button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet statePart()}
  {#if block}
    {@const scene = block.blockState.scene}
    {@const bm = block.blockState.bypassMode}
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
      {#if !bmInMenu}
        <span class="be-seg-sep" aria-hidden="true"></span>
        <!-- Bypass mode: what the block does while bypassed (the device's own modes); a muting mode shows the
             muted mark, red while the block is bypassed (it is silent now). Unavailable = aria-disabled with
             the reason in the title (it stays focusable so the reason can be read); while the block is
             re-read the last mode stays on show (`pending`: disabled, not dimmed — no flicker). -->
        <button
          class="be-seg be-bm"
          class:off={!bm.enabled}
          class:pending={bm.pending}
          class:open={bypassModeOpen}
          type="button"
          aria-haspopup="menu"
          aria-expanded={bypassModeOpen}
          aria-disabled={!bm.enabled}
          aria-busy={bm.pending}
          aria-label={bm.label ? `Bypass mode: ${bm.label}` : 'Bypass mode'}
          title={bm.title}
          data-be-bypass-mode={bm.value ?? 'off'}
          data-be-bypass-muting={bm.muting ? 'true' : 'false'}
          bind:this={bypassModeAnchor}
          onclick={() => bm.enabled && onBypassMode()}
        >
          {#if bm.muting}
            <svg class="be-bm-mute" class:live={block.bypassed} data-be-bypass-muted width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"
              ><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" /><path d="M11 5.5l4 5M15 5.5l-4 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg
            >
          {/if}
          <span class="be-bm-txt">{bypassModeText(bm, width)}</span>
          {#if bm.label}<span class="be-bm-caret" aria-hidden="true">▾</span>{/if}
        </button>
      {/if}
      <span class="be-seg-sep" aria-hidden="true"></span>
      <button
        class="be-seg be-scene"
        class:on={scene.on}
        class:off={!scene.enabled}
        class:pending={scene.pending}
        aria-busy={scene.pending}
        type="button"
        aria-pressed={scene.on}
        aria-disabled={!scene.enabled}
        title={scene.title}
        data-be-scene={scene.on ? 'on' : 'off'}
        onclick={() => scene.enabled && block.onSceneIgnore(!scene.on)}
      >
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
  class:narrow={fit.narrow}
  class:tiny={fit.tiny}
  class:xs={fit.xs}
  class:phone
  class:touch
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
        <BePageNav variant="tabs" {touch} {pages} {active} {highlight} {editMode} {renaming} {onGo} {onStartRename} {onRename} {onCancelRename} {onAdd} />
      </div>
    {:else if part === 'spA' || part === 'spB'}
      <span class="be-sp" class:a={part === 'spA'}></span>
    {:else if part === 'actions'}
      <div class="be-actions" role="group" aria-label="Block controls">
        <div class="be-tools">
          {@render search()}
        </div>
        {@render statePart()}
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
  .be-chip-ch:hover,
  .be-chip-lib:hover {
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
  .be-chip-lib {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: none;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: var(--textdim);
    font: 600 11px/1 var(--font-ui);
    cursor: pointer;
  }
  .be-chip-lib[aria-expanded='true'] {
    color: var(--be-accent, var(--accent));
    background: var(--surface2);
  }
  .narrow .be-chip-lib-lbl,
  .tiny .be-chip-lib-arrow {
    display: none;
  }
  .touch .be-chip-lib {
    min-width: 40px;
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
    justify-content: center;
    overflow: hidden;
  }
  .one .be-chip { min-width: 172px; max-width: 280px; }
  .one .be-tabs {
    margin-inline: 4px;
  }
  .be-tools {
    display: flex;
    align-items: center;
    flex: none;
  }

  .be-actions {
    display: flex;
    align-items: stretch;
    flex: none;
    height: 36px;
    border: 1px solid var(--border2);
    border-radius: 9px;
    background: var(--surface);
    box-sizing: border-box;
  }
  .be-actions .be-state {
    height: 100%;
    border: 0;
    border-inline: 1px solid var(--border2);
    border-radius: 0;
  }
  .be-actions .be-more {
    height: 100%;
    border: 0;
    border-radius: 0 8px 8px 0;
  }
  .be-actions :global(.be-find-ic) {
    height: 34px;
    border: 0;
    border-radius: 8px 0 0 8px;
    background: transparent;
  }
  .be-actions :global(.be-find) { width: 100%; }
  .touch .be-actions { height: 42px; }
  .touch .be-actions :global(.be-find-ic) { height: 40px; }

  /* ── block state: one joined control ── */
  .be-state {
    box-sizing: border-box;
    display: flex;
    align-items: stretch;
    flex: none;
    height: 36px;
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
  /* unavailable (aria-disabled, focusable: the title says why); a pending re-read keeps the last state at
     full strength (no flicker on a channel switch / scene change / undo) */
  .be-seg.off {
    cursor: default;
    opacity: 0.6;
  }
  .be-seg.off.pending {
    cursor: progress;
    opacity: 1;
  }
  .be-seg.off:hover {
    filter: none;
  }
  /* Scene Ignore on: accent LED and text */
  .be-seg.be-scene.on {
    background: var(--accent-tint);
    color: var(--accentbright);
  }
  .be-seg.be-scene.on .be-led {
    background: var(--accent);
    box-shadow: 0 0 7px var(--accent);
  }
  /* Bypass mode: the current mode, a caret, the muted mark for a silencing mode */
  .be-bm {
    gap: 5px;
  }
  .be-bm.open {
    background: var(--surface2);
    color: var(--text);
  }
  .be-bm-txt {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-bm-caret {
    font-size: 10px;
    color: var(--textdim);
  }
  .be-bm-mute {
    flex: none;
    color: var(--amber);
  }
  .be-bm-mute.live {
    color: var(--danger);
  }

  /* ── ⋯ ── */
  .be-morewrap {
    position: relative;
    flex: none;
  }
  .be-more {
    position: relative;
    width: 36px;
    height: 36px;
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
  /* ── touch device classes (phone and tablet): every hit target ≥ 40 px ── */
  .touch .be-chip {
    height: 42px;
  }
  .touch .be-chan,
  .touch .be-more {
    width: 40px;
    height: 40px;
  }
  .touch .be-state {
    height: 42px; /* 40 px segments inside the 1 px border */
  }
  .touch .be-seg {
    min-width: 40px;
    justify-content: center;
  }
  .touch .be-chip-ch {
    min-width: 40px;
    justify-content: center;
  }
</style>
