<script lang="ts">
  // One Block Editor tile: a control in its view (knob, fader, slider, number, button, switch, select,
  // eq, action, meter, wave) or a divider. Sized from its cells; everything it does goes through the
  // BeHost the surface provides (values, gestures, pin, arrange chrome).
  import EQGraph from '../EQGraph.svelte';
  import { longPress } from '../axis-workbench/longPress';
  import { getBeHost } from './beHost';
  import { isDivider, type BeItem, type BeRect } from './boardModel';
  import type { BeCtl } from './catalog';
  import { dialSize, fitFont, fitValueText, isFlatMeter, labelPx, meterFill, meterTag, meterText, meterTone, pxOf } from './boardView';
  import { formatCentre, formatFull } from './valueFormat';

  let {
    item,
    ctl,
    pos,
    c,
    g,
    page = '',
    standalone = false
  }: {
    item: BeItem;
    ctl: BeCtl | undefined;
    /** Where the item is drawn (its own rect, or the re-flowed one). */
    pos: BeRect;
    c: number;
    g: number;
    page?: string;
    /** Not inside a page grid (search results): sized by its own width / height. */
    standalone?: boolean;
  } = $props();

  const host = getBeHost();
  let tileEl = $state<HTMLElement | null>(null);

  const div = $derived(isDivider(item) ? item : null);
  const view = $derived(div ? div.kind : (item as { view: string }).view);
  const key = $derived(div ? '' : (item as { key: string }).key);
  const pxW = $derived(pxOf(pos.w, c, g));
  const pxH = $derived(pxOf(pos.h, c, g));
  const lf = $derived(labelPx(c));
  const ed = $derived(host.editMode && !standalone);
  const label = $derived(ctl?.label ?? '');

  // live values
  const p = $derived(ctl?.kind === 'cont' ? host.knob(ctl.id) : undefined);
  const en = $derived(ctl?.kind === 'toggle' || ctl?.kind === 'select' ? host.enm(ctl.id) : undefined);
  const norm = $derived(p?.norm ?? 0);
  const pct = $derived(Math.round(norm * 100));
  const centre = $derived(p ? formatCentre(p) : '–');
  const full = $derived(p ? formatFull(p) : '–');
  const editing = $derived(host.editingId === item.id);
  const togOn = $derived(!!en && en.value === (en.options[1]?.value ?? 1));
  const optLabel = $derived(en?.options.find((o) => o.value === en.value)?.label ?? (en ? (togOn ? 'On' : 'Off') : '–'));

  // sizes
  const dial = $derived(dialSize(pxW, pxH, lf));
  const vf = $derived(Math.max(9, Math.min(22, Math.round(dial * 0.2))));
  /** Value inside the dial: the unit gives way when the dial is too small for it. */
  const dialVal = $derived(fitValueText(centre, dial * 0.56, vf));
  const ctlH = $derived(Math.max(22, Math.min(36, Math.round(c * 0.72))));
  /** Number view: steppers beside the value on a wide tile, under it on a narrow one. */
  const numWide = $derived(pxW >= 110);
  const numVal = $derived(fitValueText(centre, numWide ? pxW - 2 * Math.max(18, Math.min(28, Math.round(c * 0.55))) - 20 : pxW - 8, Math.max(11, Math.min(30, Math.round(Math.min(pxW * 0.2, pxH * 0.36)))), 9));
  const nf = $derived(numVal.font);
  const showLabel = $derived(pos.h >= 2);
  /** On / off pills drop their LED when the tile is narrow. */
  const pillLed = $derived(pxW >= 72);
  /** Text of an on / off pill (switch-less toggle or the block's Engaged / Bypassed action). */
  const pillText = $derived(ctl?.kind === 'action' ? (host.bypassed ? 'Bypassed' : 'Engaged') : showLabel ? optLabel : label);
  // tile padding 2×3, border 2×1, pill padding 2×5, LED 7 + gap 6
  const pillFont = $derived(fitFont(pillText, pxW - 18 - (pillLed ? 13 : 0), lf + 0.5));
  /** Select field: the caret gives way on a narrow tile so the option name stays readable. */
  const selCaret = $derived(pxW >= 72);
  // tile padding 2×3, border 2×1, field padding 2×6 (2×4 without the caret), caret 9 + margin 3
  const selFont = $derived(fitFont(optLabel, pxW - (selCaret ? 32 : 16), lf + 0.5));
  const stepSz = $derived(Math.max(16, Math.min(28, Math.round(c * 0.55))));
  const swW = $derived(Math.max(30, Math.min(54, Math.round(c * 1.05))));
  const swH = $derived(Math.max(18, Math.min(30, Math.round(c * 0.6))));
  const knob = $derived(swH - 8);
  const flatMeter = $derived(view === 'meter' && isFlatMeter(pos.w, pos.h));
  const bars = $derived(host.mons.length ? host.mons : [null]);

  // arrange chrome: button size from the cell; one row on tiles too short for two
  const cb = $derived(Math.max(14, Math.min(18, Math.round(c * 0.6))));
  const cbShort = $derived(pxH < 2 * cb + 10);
  const VIEW_ICON: Record<string, string> = { knob: '◉', fader: '⇕', slider: '⇔', number: '#', button: '⏻', switch: '⊙', select: '▾', eq: '∿', action: '⏼', meter: '▊', wave: '⌇', hdiv: '―', vdiv: '│' };

  const valueDrag = $derived(ctl?.kind === 'cont' && (view === 'knob' || view === 'number'));
  const touchAction = $derived(ed || valueDrag ? 'none' : 'manipulation');
  const NWAVE = 110;

  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  const stop = (e: Event) => e.stopPropagation();
  function onInputKey(e: KeyboardEvent) {
    if (!ctl) return;
    e.stopPropagation(); // the dial / track around the input handles keys of its own
    if (e.key === 'Enter') {
      e.preventDefault();
      host.commitType(item.id, ctl);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      host.cancelType();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={tileEl}
  class="be-tile"
  class:edit={ed}
  class:div={!!div}
  class:eq={view === 'eq'}
  class:standalone
  class:dragging={host.dragId === item.id}
  data-be-item={item.id}
  data-be-key={key || null}
  data-be-view={view}
  data-be-x={pos.x}
  data-be-y={pos.y}
  style:grid-column={standalone ? null : `${pos.x + 1} / span ${pos.w}`}
  style:grid-row={standalone ? null : `${pos.y + 1} / span ${pos.h}`}
  style:width={standalone ? `${pxW}px` : null}
  style:height={standalone ? `${pxH}px` : null}
  style:touch-action={touchAction}
  style:--lf="{lf}px"
  oncontextmenu={(e) => {
    if (!ed && ctl) host.pinMenu(e, ctl);
  }}
  onpointerdowncapture={(e) => {
    if (!ed && ctl) host.pinArm(e, ctl);
  }}
  use:longPress={{
    onLongPress: (d) => {
      if (!ed && ctl) host.pinLongPress(ctl, d);
    }
  }}
  onpointerdown={(e) => tileEl && host.tileDown(e, item, ctl, page, tileEl)}
  onmouseenter={() => ctl && host.hover(ctl)}
  onmouseleave={() => host.unhover()}
>
  {#if div}
    {#if div.kind === 'hdiv'}
      <div class="be-hdiv">
        {#if div.label}<span class="be-divlbl">{div.label}</span>{/if}
        <span class="be-hline"></span>
      </div>
    {:else}
      <div class="be-vdiv">
        {#if div.label}<span class="be-divlbl vert">{div.label}</span>{/if}
        <span class="be-vline"></span>
      </div>
    {/if}
  {:else if ctl}
    {#if !ed && ctl.kind === 'cont'}
      <button class="be-tact" type="button" onpointerdown={stop} onclick={() => host.openMod(ctl)} title="Edit modifier" aria-label="Edit modifier for {label}">∿</button>
    {/if}

    {#if ctl.kind === 'cont' && view === 'knob'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="be-dial"
        role="slider"
        tabindex="0"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pct}
        aria-valuetext={full}
        style:width="{dial}px"
        style:height="{dial}px"
        onkeydown={(e) => host.valueKey(e, ctl, item.id)}
        onmouseenter={(e) => host.tipShow(e.currentTarget, ctl)}
        onmouseleave={() => host.tipHide()}
        ondblclick={() => host.startType(item.id, ctl)}
      >
        <svg width={dial} height={dial} viewBox="0 0 64 64" aria-hidden="true">
          <circle class="be-arc-bg" cx="32" cy="32" r="25" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="117.8 300" transform="rotate(135 32 32)" />
          <circle class="be-arc" cx="32" cy="32" r="25" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="{((pct / 100) * 117.8).toFixed(1)} 300" transform="rotate(135 32 32)" />
          <circle class="be-cap" cx="32" cy="32" r="17.5" stroke-width="1" />
          <g transform="rotate({(-135 + 2.7 * pct).toFixed(1)} 32 32)"><circle class="be-ptr" cx="32" cy="7" r="3.3" stroke-width="1.6" /></g>
        </svg>
        {#if editing}
          <input class="be-vin dial" style:font-size="{Math.max(10, vf)}px" style:width="{Math.max(44, Math.round(dial * 0.8))}px" value={host.editBuf} aria-label="Value" use:focusSelect oninput={(e) => (host.editBuf = e.currentTarget.value)} onkeydown={onInputKey} onblur={() => host.commitType(item.id, ctl)} onpointerdown={stop} />
        {:else}
          <div class="be-kval" data-be-value title="{full} · drag or click to type" style:font-size="{dialVal.font}px">{dialVal.text}</div>
        {/if}
      </div>
      <div class="be-lbl">{label}</div>
    {:else if ctl.kind === 'cont' && view === 'fader'}
      {#if editing}
        <input class="be-vin" style:width="{Math.max(44, pxW - 8)}px" value={host.editBuf} aria-label="Value" use:focusSelect oninput={(e) => (host.editBuf = e.currentTarget.value)} onkeydown={onInputKey} onblur={() => host.commitType(item.id, ctl)} onpointerdown={stop} />
      {:else}
        <button class="be-fval" type="button" data-be-value title="{full} · click to type" onpointerdown={stop} onclick={() => host.startType(item.id, ctl)}>{centre}</button>
      {/if}
      <div
        class="be-vtrack"
        role="slider"
        tabindex="0"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pct}
        aria-valuetext={full}
        style:width="{Math.max(8, Math.min(14, Math.round(c * 0.3)))}px"
        onpointerdown={(e) => host.trackDown(e, ctl, true)}
        onkeydown={(e) => host.valueKey(e, ctl, item.id)}
      >
        <div class="be-vfill" style:height="{pct}%"></div>
        <div class="be-vhandle" style:bottom="calc({pct}% - 6px)" style:width="{Math.max(18, Math.min(28, Math.round(c * 0.62)))}px"></div>
      </div>
      <div class="be-lbl">{label}</div>
    {:else if ctl.kind === 'cont' && view === 'slider'}
      <div class="be-srow">
        <span class="be-slbl">{label}</span>
        <div
          class="be-htrack"
          role="slider"
          tabindex="0"
          aria-label={label}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={pct}
          aria-valuetext={full}
          onpointerdown={(e) => host.trackDown(e, ctl, false)}
          onkeydown={(e) => host.valueKey(e, ctl, item.id)}
        >
          <div class="be-hfill" style:width="{pct}%"></div>
          <div class="be-hhandle" style:left="calc({pct}% - 7px)"></div>
        </div>
        {#if editing}
          <input class="be-vin" style:width="56px" value={host.editBuf} aria-label="Value" use:focusSelect oninput={(e) => (host.editBuf = e.currentTarget.value)} onkeydown={onInputKey} onblur={() => host.commitType(item.id, ctl)} onpointerdown={stop} />
        {:else}
          <button class="be-sval" type="button" data-be-value title="{full} · click to type" onpointerdown={stop} onclick={() => host.startType(item.id, ctl)}>{centre}</button>
        {/if}
      </div>
    {:else if ctl.kind === 'cont'}
      <!-- number -->
      {#snippet numValue()}
        {#if editing}
          <input class="be-vin" style:width="{Math.max(40, Math.min(pxW - 8, Math.round(nf * 4.2)))}px" style:font-size="{nf}px" value={host.editBuf} aria-label="Value" use:focusSelect oninput={(e) => (host.editBuf = e.currentTarget.value)} onkeydown={onInputKey} onblur={() => host.commitType(item.id, ctl)} onpointerdown={stop} />
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="be-nval"
            data-be-value
            role="slider"
            tabindex="0"
            aria-label={label}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={pct}
            aria-valuetext={full}
            title="{full} · drag or click to type"
            style:font-size="{nf}px"
            onkeydown={(e) => host.valueKey(e, ctl, item.id)}
            ondblclick={() => host.startType(item.id, ctl)}
          >{numVal.text}</div>
        {/if}
      {/snippet}
      {#snippet stepper(dir: number)}
        <button class="be-step" type="button" style:width="{stepSz}px" style:height="{stepSz}px" aria-label="{dir < 0 ? 'Decrease' : 'Increase'} {label}" onpointerdown={stop} onclick={() => host.nudge(ctl, dir)}>{dir < 0 ? '−' : '+'}</button>
      {/snippet}
      {#if numWide}
        <div class="be-numrow">{@render stepper(-1)}{@render numValue()}{@render stepper(1)}</div>
      {:else}
        {@render numValue()}
        <div class="be-numrow">{@render stepper(-1)}{@render stepper(1)}</div>
      {/if}
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'toggle' && view === 'switch'}
      <button class="be-switch" class:on={togOn} type="button" role="switch" aria-checked={togOn} aria-label={label} title="{label}: {optLabel}" style:width="{swW}px" style:height="{swH}px" onclick={() => !ed && host.toggle(ctl)}>
        <span class="be-snob" style:width="{knob}px" style:height="{knob}px" style:left="{togOn ? swW - knob - 5 : 3}px"></span>
      </button>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'toggle'}
      <button class="be-pill" class:on={togOn} type="button" aria-pressed={togOn} aria-label={label} title="{label}: {optLabel}" style:height="{ctlH}px" style:font-size="{pillFont}px" onclick={() => !ed && host.toggle(ctl)}>
        {#if pillLed}<span class="be-led"></span>{/if}<span class="be-pilltxt">{pillText}</span>
      </button>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'select'}
      <button class="be-field" class:open={host.openSelectId === item.id} class:narrow={!selCaret} type="button" aria-haspopup="listbox" aria-label="{label}: {optLabel}" title="{label}: {optLabel}" style:height="{ctlH}px" style:font-size="{selFont}px" onclick={(e) => !ed && host.openSelect(e, item.id, ctl)}>
        <span class="be-fieldtxt">{optLabel}</span>{#if selCaret}<span class="be-caret" aria-hidden="true">▾</span>{/if}
      </button>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'eq'}
      <div class="be-eqtitle" style:left="{ed ? 30 : 12}px">{label}</div>
      <div class="be-eqbox" style:pointer-events={ed ? 'none' : 'auto'}>
        <EQGraph bands={host.eqBands} gainRange={host.eqGainRange} accent={host.accent} onSet={(pp, n) => host.eqSet(pp, n)} />
      </div>
    {:else if ctl.kind === 'action'}
      <button class="be-pill action" class:byp={host.bypassed} type="button" aria-pressed={!host.bypassed} title={label} style:height="{ctlH}px" style:font-size="{pillFont}px" onclick={() => !ed && host.bypass()}>
        {#if pillLed}<span class="be-led"></span>{/if}<span class="be-pilltxt">{pillText}</span>
      </button>
    {:else if ctl.kind === 'meter'}
      {#if flatMeter}
        <div class="be-mflat" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(meterFill(host.mons[0] ?? null) * 100)} aria-valuetext={meterText(host.mons[0] ?? null)} title="Live level ({label})">
          <span class="be-slbl">{label}</span>
          <div class="be-mbars">
            {#each bars as m, i (i)}
              <div class="be-mhtrack"><div class="be-mhfill tone-{meterTone(meterFill(m))}" style:width="{Math.round(meterFill(m) * 100)}%"></div></div>
            {/each}
          </div>
          <span class="be-mtext">{meterText(host.mons[0] ?? null)}</span>
        </div>
      {:else}
        <div class="be-mval">{meterText(host.mons[0] ?? null)}</div>
        <div class="be-mrow" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(meterFill(host.mons[0] ?? null) * 100)} title="Live level ({label})">
          {#each bars as m, i (i)}
            <div class="be-mcol">
              <div class="be-mtrack"><div class="be-mfill tone-{meterTone(meterFill(m))}" style:height="{Math.round(meterFill(m) * 100)}%"></div></div>
              {#if host.mons.length > 1 && m}<div class="be-mtag">{meterTag(m)}</div>{/if}
            </div>
          {/each}
        </div>
        {#if showLabel}<div class="be-lbl">{label}</div>{/if}
      {/if}
    {:else if ctl.kind === 'wave'}
      <div class="be-wavebox" title="Looper waveform">
        <svg class="be-wavesvg" viewBox="0 0 {NWAVE} 40" preserveAspectRatio="none" aria-hidden="true">
          {#each host.wave as mag, i (i)}
            <rect class="be-wbar" x={i + 0.15} y={20 - mag * 19} width="0.7" height={Math.max(0.5, mag * 38)} />
          {/each}
          <line class="be-playhead" x1={host.wavePos * NWAVE} y1="0" x2={host.wavePos * NWAVE} y2="40" />
        </svg>
        {#if host.waveLevel != null}
          <div class="be-wavelvl"><div class="be-wavelvlfill" style:width="{Math.round(host.waveLevel * 100)}%"></div></div>
        {/if}
        <div class="be-loopbtns">
          {#each [['record', 'REC'], ['play', '▶'], ['stop', '■'], ['overdub', 'DUB'], ['undo', '↺'], ['reverse', 'REV'], ['half', '½']] as [act, sym] (act)}
            <button class="be-loopbtn" class:on={host.loopOn(act)} class:rec={act === 'record'} type="button" onpointerdown={stop} onclick={() => host.loop(act)}>{sym}</button>
          {/each}
        </div>
      </div>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {/if}
  {/if}

  {#if ed}
    <div class="be-chrome"></div>
    <div class="be-cbar" class:short={cbShort} style:--cb="{cb}px">
      <button class="be-x" type="button" title="Remove" aria-label="Remove {div ? 'divider' : label}" onpointerdown={stop} onclick={() => host.remove(item.id)}>✕</button>
      {#if pxW >= 50}<span class="be-dims">{item.w}×{item.h}</span>{/if}
      {#if ctl && ctl.views.length > 1}
        <button class="be-vcyc" type="button" title="Change control type ({view})" aria-label="Change control type" onpointerdown={stop} onclick={() => host.cycleView(item.id)}>{VIEW_ICON[view] ?? '◇'}{#if pxW >= 120}<span class="be-vcyc-t">{view}</span>{/if}</button>
      {/if}
      {#if ctl && host.canPin && host.pinnable(ctl)}
        <button class="be-pinb" type="button" title="Pin to a Workbench custom panel" aria-label="Pin {label} to a custom panel" onpointerdown={stop} onclick={() => host.pinToWorkbench(ctl)}>⌖</button>
      {/if}
      {#if ctl?.kind === 'cont'}
        <button class="be-swipe" class:on={host.isSwipe(ctl.id)} type="button" title="Map to grid swipe control (adjust from the Signal Grid tile)" aria-label="Grid swipe control" onpointerdown={stop} onclick={() => host.toggleSwipe(ctl)}>⚡</button>
      {/if}
      <button class="be-rsz" type="button" aria-label="Resize" title="Drag to resize" onpointerdown={(e) => tileEl && host.resizeDown(e, item.id, tileEl)}>
        <svg width="10" height="10" viewBox="0 0 13 13" aria-hidden="true"><path d="M12 5 L5 12 M12 9 L9 12 M12 1 L1 12" stroke-width="1.6" stroke-linecap="round" /></svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .be-tile {
    position: relative;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px;
    user-select: none;
    border: 1px solid transparent;
    transition: opacity 0.15s, background 0.12s;
  }
  .be-tile:not(.edit):not(.div):not(.eq):hover {
    background: var(--surface);
  }
  .be-tile.standalone {
    flex: none;
    padding: 6px;
    border-radius: 11px;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    border-color: var(--surface2);
  }
  .be-tile.eq {
    padding: 0;
    background: var(--input);
    border-color: var(--border);
  }
  .be-tile.div {
    padding: 0;
  }
  .be-tile.div:not(.edit) {
    pointer-events: none;
  }
  .be-tile.edit {
    cursor: grab;
  }
  .be-tile.dragging {
    opacity: 0.3;
  }
  /* in arrange mode the whole tile is grabbable; only the chrome buttons stay interactive */
  .be-tile.edit > :not(.be-cbar) {
    pointer-events: none;
  }
  /* ── labels ── */
  .be-lbl {
    flex: none;
    width: 100%;
    font: 600 var(--lf) / 1.15 var(--font-ui);
    color: var(--textdim);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .be-slbl {
    flex: none;
    max-width: 38%;
    font: 600 var(--lf) / 1.15 var(--font-ui);
    color: var(--textdim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── hover quick action (modifier) ── */
  .be-tact {
    position: absolute;
    top: 2px;
    right: 2px;
    z-index: 7;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
    opacity: 0;
    transition: opacity 0.12s, color 0.12s, border-color 0.12s;
  }
  .be-tile:hover .be-tact,
  .be-tile:focus-within .be-tact {
    opacity: 1;
  }
  .be-tact:hover {
    color: var(--amber);
    border-color: var(--amber-border);
  }

  /* ── knob ── */
  .be-dial {
    position: relative;
    flex: none;
    border-radius: 50%;
    cursor: ns-resize;
    outline-offset: 2px;
  }
  .be-dial svg {
    display: block;
  }
  .be-dial:focus-visible,
  .be-vtrack:focus-visible,
  .be-htrack:focus-visible,
  .be-nval:focus-visible {
    outline: 2px solid var(--accent);
  }
  .be-arc-bg {
    stroke: var(--border);
  }
  .be-arc {
    stroke: var(--c, var(--accent));
  }
  .be-cap {
    fill: var(--bg2);
    stroke: var(--input);
  }
  .be-ptr {
    fill: var(--amber);
    stroke: var(--bg2);
  }
  .be-kval {
    position: absolute;
    inset: 24%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--text);
    white-space: nowrap;
    cursor: text;
  }
  .be-vin {
    flex: none;
    text-align: center;
    background: var(--input);
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--text);
    outline: none;
    padding: 2px 0;
    font: 600 var(--lf) / 1 var(--font-mono);
  }
  .be-vin.dial {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  /* ── fader ── */
  .be-fval,
  .be-sval {
    flex: none;
    padding: 2px 4px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    font: 600 var(--lf) / 1 var(--font-mono);
    color: var(--text);
    white-space: nowrap;
    cursor: text;
  }
  .be-sval {
    color: var(--accentbright);
  }
  .be-fval:hover,
  .be-sval:hover {
    background: var(--surface2);
  }
  .be-vtrack {
    position: relative;
    flex: 1;
    min-height: 20px;
    margin: 3px 0;
    border-radius: 7px;
    background: var(--input);
    border: 1px solid var(--border);
    cursor: ns-resize;
  }
  .be-vfill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 7px;
    background: linear-gradient(180deg, var(--accentbright), var(--accent));
  }
  .be-vhandle {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    height: 12px;
    border-radius: 4px;
    background: var(--amber);
    border: 3px solid var(--bg2);
    box-shadow: 0 2px 5px color-mix(in srgb, var(--bg) 60%, transparent);
  }

  /* ── slider ── */
  .be-srow {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 100%;
    padding: 0 4px;
  }
  .be-htrack {
    position: relative;
    flex: 1;
    min-width: 24px;
    height: 8px;
    border-radius: 5px;
    background: var(--input);
    border: 1px solid var(--border);
    cursor: ew-resize;
  }
  .be-hfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 5px;
    background: linear-gradient(90deg, var(--accent), var(--accentbright));
  }
  .be-hhandle {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--amber);
    border: 3px solid var(--bg2);
    box-shadow: 0 2px 5px color-mix(in srgb, var(--bg) 60%, transparent);
  }

  /* ── number ── */
  .be-numrow {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .be-step {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-size: 14px;
    cursor: pointer;
  }
  .be-step:hover {
    border-color: var(--border3);
    color: var(--text);
  }
  .be-nval {
    font-family: var(--font-mono);
    font-weight: 700;
    line-height: 1;
    color: var(--text);
    text-align: center;
    white-space: nowrap;
    cursor: ns-resize;
    border-radius: 4px;
  }

  /* ── on / off ── */
  .be-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 0 5px;
    border-radius: 7px;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
    font: 700 calc(var(--lf) + 0.5px) / 1 var(--font-ui);
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .be-pill.on {
    background: var(--accent-tint);
    border-color: var(--accent-border);
    color: var(--accentbright);
  }
  .be-pill.action {
    background: var(--ok-tint);
    border-color: var(--ok-border);
    color: var(--ok);
  }
  .be-pill.action.byp {
    background: var(--danger-tint);
    border-color: var(--danger-border);
    color: var(--danger);
  }
  .be-pilltxt {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .be-led {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--textmuted);
  }
  .be-pill.on .be-led {
    background: var(--accent);
    box-shadow: 0 0 7px var(--accent);
  }
  .be-pill.action .be-led {
    background: var(--ok);
    box-shadow: 0 0 7px var(--ok);
  }
  .be-pill.action.byp .be-led {
    background: var(--danger);
    box-shadow: 0 0 7px var(--danger);
  }
  .be-switch {
    position: relative;
    flex: none;
    padding: 0;
    border-radius: 999px;
    cursor: pointer;
    background: var(--input);
    border: 1px solid var(--border2);
    transition: background 0.15s, border-color 0.15s;
  }
  .be-switch.on {
    background: var(--accent-tint);
    border-color: var(--accent-border);
  }
  .be-snob {
    position: absolute;
    top: 3px;
    border-radius: 50%;
    background: var(--textmuted);
    transition: left 0.16s cubic-bezier(0.3, 0.8, 0.3, 1), background 0.15s;
  }
  .be-switch.on .be-snob {
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }

  /* ── select ── */
  .be-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0 6px;
    border-radius: 7px;
    background: var(--input);
    border: 1px solid var(--border2);
    color: var(--text);
    font: 600 calc(var(--lf) + 0.5px) / 1 var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .be-field:hover {
    border-color: var(--border3);
  }
  .be-field.open {
    border-color: var(--accent);
  }
  .be-field.narrow {
    justify-content: center;
    padding: 0 4px;
  }
  .be-fieldtxt {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .be-caret {
    flex: none;
    margin-left: 3px;
    font-size: 9px;
    color: var(--textfaint);
  }

  /* ── eq ── */
  .be-eqtitle {
    position: absolute;
    top: 8px;
    z-index: 2;
    font: 600 11px/1 var(--font-ui);
    color: var(--textdim);
    pointer-events: none;
  }
  .be-eqbox {
    width: 100%;
    height: 100%;
    display: flex;
  }

  /* ── meter ── */
  .be-mval {
    flex: none;
    font: 600 var(--lf) / 1 var(--font-mono);
    color: var(--text);
    white-space: nowrap;
  }
  .be-mrow {
    display: flex;
    flex: 1;
    gap: 6px;
    justify-content: center;
    align-items: stretch;
    min-height: 20px;
  }
  .be-mcol {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .be-mtag {
    font-size: 9px;
    line-height: 1;
    color: var(--textfaint);
  }
  .be-mtrack {
    position: relative;
    flex: 1;
    width: 14px;
    min-height: 20px;
    margin: 3px 0;
    border-radius: 6px;
    background: var(--input);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .be-mfill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    transition: height 90ms linear;
  }
  .be-mflat {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 100%;
    padding: 0 4px;
  }
  .be-mbars {
    flex: 1;
    min-width: 20px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .be-mhtrack {
    position: relative;
    height: 10px;
    border-radius: 3px;
    background: var(--input);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .be-mhfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    transition: width 90ms linear;
  }
  .be-mtext {
    flex: none;
    padding: 4px 6px;
    border-radius: 4px;
    background: var(--input);
    border: 1px solid var(--border);
    font: 600 var(--lf) / 1 var(--font-mono);
    color: var(--text);
    white-space: nowrap;
  }
  .tone-accent {
    background: var(--c, var(--accent));
  }
  .tone-amber {
    background: var(--amber);
  }
  .tone-danger {
    background: var(--danger);
  }

  /* ── looper waveform ── */
  .be-wavebox {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 4px;
    width: 100%;
    min-height: 40px;
    padding: 4px 0;
  }
  .be-wavesvg {
    flex: 1;
    width: 100%;
    min-height: 28px;
    border-radius: 6px;
    background: var(--track);
    border: 1px solid var(--border);
  }
  .be-wbar {
    fill: var(--c, var(--accent));
    opacity: 0.85;
  }
  .be-playhead {
    stroke: var(--amber);
    stroke-width: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .be-wavelvl {
    position: relative;
    height: 4px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
  }
  .be-wavelvlfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 3px;
    background: var(--c, var(--accent));
  }
  .be-loopbtns {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .be-loopbtn {
    flex: 1;
    min-width: 34px;
    padding: 5px 2px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--track);
    color: var(--text);
    cursor: pointer;
  }
  .be-loopbtn:hover {
    border-color: var(--accent);
  }
  .be-loopbtn.on {
    background: var(--accent);
    color: var(--accentink);
    border-color: transparent;
  }
  .be-loopbtn.rec.on {
    background: var(--danger);
    color: var(--text);
  }

  /* ── dividers ── */
  .be-hdiv {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 0 2px;
  }
  .be-vdiv {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 2px 0;
  }
  .be-divlbl {
    flex: none;
    font: 700 calc(var(--lf) - 1.5px) / 1 var(--font-mono);
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--textfaint);
    white-space: nowrap;
  }
  .be-divlbl.vert {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  .be-hline {
    flex: 1;
    height: 1px;
    background: var(--border2);
  }
  .be-vline {
    flex: 1;
    width: 1px;
    background: var(--border2);
  }

  /* ── arrange chrome (interim) ── */
  .be-chrome {
    position: absolute;
    inset: 0;
    z-index: 5;
    border-radius: 8px;
    border: 1px dashed color-mix(in srgb, var(--accent) 34%, transparent);
    background: color-mix(in srgb, var(--bg) 35%, transparent);
    pointer-events: none;
  }
  .be-tile.dragging .be-chrome {
    border: 2px dashed var(--accent);
  }
  .be-cbar {
    position: absolute;
    inset: 2px;
    z-index: 8;
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    grid-template-rows: auto 1fr auto;
    grid-template-areas: 'x d d v' '. . . .' 'p s . r';
    gap: 2px;
    pointer-events: none;
  }
  .be-cbar.short .be-dims {
    align-self: center;
  }
  .be-cbar.short {
    grid-template-columns: auto auto auto 1fr auto auto;
    grid-template-rows: 1fr;
    grid-template-areas: 'x p s d v r';
    align-items: center;
  }
  .be-cbar > * {
    pointer-events: auto;
  }
  .be-dims {
    grid-area: d;
    justify-self: center;
    align-self: start;
    white-space: nowrap;
    overflow: hidden;
    max-width: 100%;
    padding: 2px 4px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    font: 700 8px/1 var(--font-mono);
    color: var(--textmuted);
    pointer-events: none;
  }
  .be-x,
  .be-vcyc,
  .be-swipe,
  .be-pinb,
  .be-rsz {
    height: var(--cb);
    min-width: var(--cb);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 5px;
    font-size: calc(var(--cb) * 0.58);
    line-height: 1;
    cursor: pointer;
  }
  .be-x {
    grid-area: x;
    background: var(--danger-tint);
    border: 1px solid var(--danger-border);
    color: var(--danger);
  }
  .be-vcyc {
    grid-area: v;
    padding: 0 3px;
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    color: var(--accentbright);
  }
  .be-vcyc-t {
    font: 700 8.5px/1 var(--font-mono);
  }
  .be-pinb {
    grid-area: p;
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    color: var(--accentbright);
  }
  .be-swipe {
    grid-area: s;
    background: var(--amber-tint);
    border: 1px solid var(--amber-border);
    color: var(--textfaint);
  }
  .be-swipe.on {
    border-color: var(--amber);
    color: var(--amber);
  }
  .be-rsz {
    grid-area: r;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 2px;
    background: transparent;
    border: 0;
    cursor: nwse-resize;
    touch-action: none;
  }
  .be-rsz path {
    stroke: var(--accent);
  }
  .be-tile[data-be-view='hdiv'] .be-rsz {
    cursor: ew-resize;
  }
  .be-tile[data-be-view='vdiv'] .be-rsz {
    cursor: ns-resize;
  }
</style>
