<script lang="ts">
  // One Block Editor tile: a control in its view (knob, fader, slider, number, button, switch, select,
  // eq, action, meter, wave) or a divider. Sized from its cells; everything it does goes through the
  // BeHost the surface provides (values, gestures, pin, arrange selection).
  import EQGraph from '../EQGraph.svelte';
  import BeGraph from './BeGraph.svelte';
  import { longPress } from '../axis-workbench/longPress';
  import { getBeHost } from './beHost';
  import { isDivider, type BeItem, type BeRect } from './boardModel';
  import type { BeCtl } from './catalog';
  import {
    centredPartHit,
    ctlHeightPx,
    touchCtlHeight,
    dialSize,
    DRAG_START_PX,
    faderHandlePx,
    faderValueHit,
    fitFont,
    fitValueText,
    hoverActionPx,
    hoverActionsFit,
    isFlatMeter,
    labelPx,
    labelRowPx,
    meterFill,
    meterTag,
    meterText,
    meterTone,
    monoTextPx,
    numberHits,
    NUM_WIDE_PX,
    numFontMax,
    pxOf,
    sliderValueHit,
    STANDALONE_EDGE,
    stepPx,
    switchPx,
    TILE_EDGE,
    tileContentBox,
    type HitInset,
    type HitTile
  } from './boardView';
  import { formatCentre, formatFull } from './valueFormat';
  import { tileTouchAction } from './touchGesture';

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
  /** Phone and tablet (search results too): ≥ 40 px touch targets — controls grow where the tile has the
   *  room, invisible hit margins make up the rest (boardView `touchHit`). */
  const touchUi = $derived(host.touchTargets);
  /** The tile's edge strip (border + padding): wider on a search-result tile. */
  const edge = $derived(standalone ? STANDALONE_EDGE : TILE_EDGE);
  const ctlH = $derived(touchUi ? touchCtlHeight(c, pxH, pos.h >= 2 ? labelRowPx(lf) : 0, edge) : ctlHeightPx(c));
  /** Number view: steppers beside the value on a wide tile, under it on a narrow one. */
  const numWide = $derived(pxW >= NUM_WIDE_PX);
  const numVal = $derived(fitValueText(centre, numWide ? pxW - 2 * Math.max(18, Math.min(28, Math.round(c * 0.55))) - 20 : pxW - 8, numFontMax(pxW, pxH), 9));
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
  const stepSz = $derived(stepPx(c));
  const swW = $derived(switchPx(c).w);
  const swH = $derived(switchPx(c).h);
  const knob = $derived(swH - 8);

  // touch: the hit margins of the parts smaller than 40 px (a `::before` of the part; boardView.ts keeps
  // each margin on its own side of the neighbouring parts)
  const hitTile = $derived<HitTile>({ pxW, pxH, c, g, lf, showLabel: pos.h >= 2, edge });
  const numHit = $derived(touchUi && ctl?.kind === 'cont' && view === 'number' ? numberHits(hitTile, { st: stepSz, nf, valueW: monoTextPx(numVal.text, nf), wide: numWide }) : null);
  const switchHit = $derived(touchUi && view === 'switch' ? centredPartHit(hitTile, swW, swH) : null);
  const ctlHit = $derived(touchUi ? centredPartHit(hitTile, pxW - 2 * edge, ctlH) : null);
  /** Fader / slider value read-outs: text in the value font plus their 2 × 4 px padding, 2 × 2 px tall. */
  const fvalHit = $derived(touchUi && view === 'fader' ? faderValueHit(hitTile, monoTextPx(centre, lf) + 8, lf + 4) : null);
  const svalHit = $derived(touchUi && view === 'slider' ? sliderValueHit(hitTile, monoTextPx(centre, lf) + 8, lf + 4) : null);
  const hitStyle = (h: HitInset | null | undefined): string | undefined => (h ? `--ht:${h.top}px;--hr:${h.right}px;--hb:${h.bottom}px;--hl:${h.left}px` : undefined);
  const flatMeter = $derived(view === 'meter' && isFlatMeter(pos.w, pos.h));
  const bars = $derived(host.mons.length ? host.mons : [null]);

  // hover actions (normal mode, pointer devices): ⚡ pin · ∿ modifier, sized from the cell; left out where
  // they would cover the control (one-row tiles, small pills / fields — the control menu has both there)
  const tact = $derived(hoverActionPx(c));
  const actFits = $derived(hoverActionsFit(view, pos.h, pxW, pxH, tact, tileContentBox(view, { pxW, pxH, c, lf, showLabel, ctlH })));
  const showPin = $derived(!ed && !!ctl && !host.isPhone && actFits && host.canPin && host.pinnable(ctl));
  const showMod = $derived(!ed && ctl?.kind === 'cont' && !host.isPhone && actFits);

  // arrange: the selected tile is outlined, shows its w×h and its corner handle (the bar holds its tools)
  const selected = $derived(ed && host.selectedId === item.id);
  const dims = $derived(selected || (ed && host.resizingId === item.id));

  // touch: a value control leaves the board's scroll axis to the browser (a swipe along it scrolls) and
  // takes the other one for its value; Arrange takes every gesture (touchGesture.ts). The flat search
  // results scroll vertically.
  const touchAction = $derived(tileTouchAction({ editMode: ed, kind: ctl?.kind, view, scroll: standalone ? 'y' : host.scrollAxis }));
  const NWAVE = 110;
  /** Looper transport: action, symbol, accessible name. Stop and Undo are momentary, the rest latch. */
  const LOOP_BUTTONS: readonly [string, string, string][] = [
    ['record', 'REC', 'Record'],
    ['play', '▶', 'Play'],
    ['stop', '■', 'Stop'],
    ['overdub', 'DUB', 'Overdub'],
    ['undo', '↺', 'Undo'],
    ['reverse', 'REV', 'Reverse'],
    ['half', '½', 'Half speed']
  ];
  const LOOP_LATCHING: ReadonlySet<string> = new Set(['record', 'play', 'overdub', 'reverse', 'half']);

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
  class:sel={selected}
  class:div={!!div}
  class:eq={view === 'eq'}
  class:graph={view === 'graph'}
  class:standalone
  class:touch={touchUi}
  class:dragging={host.dragId === item.id}
  class:flash={!standalone && host.flashId === item.id}
  data-be-item={item.id}
  data-be-key={key || null}
  data-be-view={view}
  data-be-x={pos.x}
  data-be-y={pos.y}
  data-be-w={pos.w}
  data-be-h={pos.h}
  style:grid-column={standalone ? null : `${pos.x + 1} / span ${pos.w}`}
  style:grid-row={standalone ? null : `${pos.y + 1} / span ${pos.h}`}
  style:width={standalone ? `${pxW}px` : null}
  style:height={standalone ? `${pxH}px` : null}
  style:touch-action={touchAction}
  style:--lf="{lf}px"
  oncontextmenu={(e) => {
    if (ctl && !div && tileEl) host.ctxMenu(e, item, ctl, tileEl);
  }}
  onkeydown={(e) => {
    if (ctl && !div && tileEl) host.ctxKey(e, item, ctl, tileEl);
  }}
  onpointerdowncapture={(e) => {
    if (!ed && ctl) host.pinArm(e, ctl);
  }}
  use:longPress={{
    // a slow arrange move or value drag past the drag threshold is never also a long-press
    moveTolerance: DRAG_START_PX,
    onLongPress: (d) => {
      if (ctl && !div) host.ctxLongPress(item, ctl, d);
    }
  }}
  onpointerdown={(e) => tileEl && host.tileDown(e, item, ctl, page, tileEl)}
  onmouseenter={() => ctl && host.hover(ctl)}
  onmouseleave={() => host.unhover()}
>
  {#if div}
    {#if div.kind === 'hdiv'}
      <div class="be-hdiv" role="separator" aria-label={div.label || undefined}>
        {#if div.label}<span class="be-divlbl">{div.label}</span>{/if}
        <span class="be-hline"></span>
      </div>
    {:else}
      <div class="be-vdiv" role="separator" aria-orientation="vertical" aria-label={div.label || undefined}>
        {#if div.label}<span class="be-divlbl vert">{div.label}</span>{/if}
        <span class="be-vline"></span>
      </div>
    {/if}
  {:else if ctl}
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
        onpointerenter={(e) => e.pointerType === 'mouse' && host.tipShow(e.currentTarget, ctl)}
        onpointerleave={() => host.tipHide()}
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
        <button
          class="be-fval"
          class:be-hit={!!fvalHit}
          type="button"
          data-be-value
          title="{full} · click to type"
          aria-label="{label}: {full} — type a value"
          style={hitStyle(fvalHit?.hit)}
          style:min-height={fvalHit ? `${fvalHit.minH}px` : null}
          onpointerdown={stop}
          onclick={() => host.startType(item.id, ctl)}>{centre}</button
        >
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
        <div class="be-vhandle" style:bottom="calc({pct}% - 6px)" style:width="{faderHandlePx(c)}px"></div>
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
          <button
            class="be-sval"
            class:be-hit={!!svalHit}
            type="button"
            data-be-value
            title="{full} · click to type"
            aria-label="{label}: {full} — type a value"
            style={hitStyle(svalHit)}
            onpointerdown={stop}
            onclick={() => host.startType(item.id, ctl)}>{centre}</button
          >
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
            class:be-hit={!!numHit}
            style={hitStyle(numHit?.value)}
            data-be-value
            role="spinbutton"
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
        <button
          class="be-step"
          class:be-hit={!!numHit}
          type="button"
          style={hitStyle(dir < 0 ? numHit?.minus : numHit?.plus)}
          style:width="{stepSz}px"
          style:height="{stepSz}px"
          aria-label="{dir < 0 ? 'Decrease' : 'Increase'} {label}"
          onpointerdown={stop}
          onclick={() => host.nudge(ctl, dir)}>{dir < 0 ? '−' : '+'}</button
        >
      {/snippet}
      {#if numWide}
        <div class="be-numrow">{@render stepper(-1)}{@render numValue()}{@render stepper(1)}</div>
      {:else}
        {@render numValue()}
        <div class="be-numrow">{@render stepper(-1)}{@render stepper(1)}</div>
      {/if}
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'toggle' && view === 'switch'}
      <button
        class="be-switch"
        class:on={togOn}
        class:be-hit={!!switchHit}
        type="button"
        role="switch"
        aria-checked={togOn}
        aria-label={label}
        title="{label}: {optLabel}"
        style={hitStyle(switchHit)}
        style:width="{swW}px"
        style:height="{swH}px"
        onclick={() => !ed && host.toggle(ctl)}
      >
        <span class="be-snob" style:width="{knob}px" style:height="{knob}px" style:left="{togOn ? swW - knob - 5 : 3}px"></span>
      </button>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'toggle'}
      <button
        class="be-pill"
        class:on={togOn}
        class:be-hit={!!ctlHit}
        type="button"
        aria-pressed={togOn}
        aria-label={label}
        title="{label}: {optLabel}"
        style={hitStyle(ctlHit)}
        style:height="{ctlH}px"
        style:font-size="{pillFont}px"
        onclick={() => !ed && host.toggle(ctl)}
      >
        {#if pillLed}<span class="be-led"></span>{/if}<span class="be-pilltxt">{pillText}</span>
      </button>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'select'}
      <button
        class="be-field"
        class:open={host.openSelectId === item.id}
        class:narrow={!selCaret}
        class:be-hit={!!ctlHit}
        style={hitStyle(ctlHit)}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={host.openSelectId === item.id}
        aria-controls={host.openSelectId === item.id ? host.selectMenuId : undefined}
        aria-label="{label}: {optLabel}"
        title="{label}: {optLabel}"
        style:height="{ctlH}px"
        style:font-size="{selFont}px"
        onclick={(e) => !ed && host.openSelect(e, item.id, ctl)}
      >
        <span class="be-fieldtxt">{optLabel}</span>{#if selCaret}<span class="be-caret" aria-hidden="true">▾</span>{/if}
      </button>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {:else if ctl.kind === 'eq'}
      <div class="be-eqtitle" style:left="{ed ? 30 : 12}px">{label}</div>
      <div class="be-eqbox" style:pointer-events={ed ? 'none' : 'auto'}>
        <EQGraph bands={host.eqBands} gainRange={host.eqGainRange} accent={host.accent} onSet={(pp, n) => host.eqSet(pp, n)} />
      </div>
    {:else if ctl.kind === 'graph' && ctl.visual}
      <BeGraph visual={ctl.visual} itemId={item.id} {pxW} {pxH} edit={ed} />
    {:else if ctl.kind === 'action'}
      <button
        class="be-pill action"
        class:byp={host.bypassed}
        class:be-hit={!!ctlHit}
        type="button"
        aria-pressed={!host.bypassed}
        title={label}
        style={hitStyle(ctlHit)}
        style:height="{ctlH}px"
        style:font-size="{pillFont}px"
        onclick={() => !ed && host.bypass()}
      >
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
          {#each LOOP_BUTTONS as [act, sym, name] (act)}
            <button
              class="be-loopbtn"
              class:on={host.loopOn(act)}
              class:rec={act === 'record'}
              type="button"
              aria-label={name}
              title={name}
              aria-pressed={LOOP_LATCHING.has(act) ? host.loopOn(act) : undefined}
              onpointerdown={stop}
              onclick={() => host.loop(act)}>{sym}</button
            >
          {/each}
        </div>
      </div>
      {#if showLabel}<div class="be-lbl">{label}</div>{/if}
    {/if}

    <!-- hover actions: ⚡ pin (click = default target, press-drag = pin drag at once) · ∿ modifier -->
    {#if showPin}
      <button
        class="be-tact pin"
        type="button"
        data-be-pin
        style:--tact="{tact}px"
        title="Pin as a quick control — click, or drag it onto a panel"
        aria-label="Pin {label}"
        onpointerdown={(e) => host.pinPress(e, ctl)}
        onclick={() => host.pinClick(ctl)}
      >
        <svg width={Math.round(tact * 0.56)} height={Math.round(tact * 0.56)} viewBox="0 0 16 16" aria-hidden="true"><path d="M9.2 1 L3 9.2 H7.4 L6.4 15 L13 6.6 H8.6 Z" fill="currentColor" /></svg>
      </button>
    {/if}
    {#if showMod}
      <button class="be-tact mod" type="button" data-be-mod style:--tact="{tact}px" onpointerdown={stop} onclick={() => host.openMod(ctl)} title="Edit modifier" aria-label="Edit modifier for {label}">∿</button>
    {/if}
  {/if}

  {#if ed}
    <div class="be-chrome"></div>
    {#if dims}<span class="be-dims" data-be-dims>{item.w}×{item.h}</span>{/if}
    <button
      class="be-rsz"
      class:touch={host.touchArrange}
      type="button"
      tabindex="-1"
      aria-label="Resize {div ? 'divider' : label}"
      title="Drag to resize"
      data-be-resize
      onpointerdown={(e) => tileEl && host.resizeDown(e, item.id, tileEl)}
    >
      <svg width="11" height="11" viewBox="0 0 13 13" aria-hidden="true"><path d="M12 5 L5 12 M12 9 L9 12 M12 1 L1 12" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
  {/if}
</div>

<style>
  /* a "Find a control…" jump points at its tile */
  .be-tile.flash {
    animation: beTileFlash 1.4s ease;
  }
  @keyframes beTileFlash {
    0%,
    55% {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
    }
    100% {
      border-color: transparent;
      background: transparent;
      box-shadow: 0 0 0 0 transparent;
    }
  }
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
    /* iOS Safari: a long-press (the control menu) selects no text and shows no callout */
    -webkit-user-select: none;
    -webkit-touch-callout: none;
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
  .be-tile.graph {
    padding: 0;
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
  /* in arrange mode the whole tile is grabbable; only the corner handle stays interactive */
  .be-tile.edit > :not(.be-rsz) {
    pointer-events: none;
  }
  .be-tile.sel {
    z-index: 2;
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

  /* ── hover actions: ⚡ pin (top left) · ∿ modifier (top right) ── */
  .be-tact {
    position: absolute;
    top: 2px;
    z-index: 7;
    width: var(--tact, 18px);
    height: var(--tact, 18px);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: calc(var(--tact, 18px) * 0.6);
    line-height: 1;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
    opacity: 0;
    /* an invisible action takes no press: a touch in the tile's corner never pins by accident */
    pointer-events: none;
    transition: opacity 0.12s, color 0.12s, border-color 0.12s, background 0.12s;
  }
  .be-tact.pin {
    left: 2px;
    cursor: grab;
    touch-action: none;
  }
  .be-tact.mod {
    right: 2px;
  }
  .be-tile:hover .be-tact,
  .be-tile:focus-within .be-tact {
    opacity: 1;
    pointer-events: auto;
  }
  /* hover actions are for pointer devices: on a touch-only screen the control menu (long-press) carries
     pin and modifier */
  @media (hover: none) {
    .be-tact {
      display: none;
    }
  }
  .be-tact:hover,
  .be-tact:focus-visible {
    color: var(--amber);
    border-color: var(--amber-border);
    background: var(--amber-tint);
  }
  .be-tact:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
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
  /* keyboard focus ring on every operable part of a tile */
  .be-fval:focus-visible,
  .be-sval:focus-visible,
  .be-step:focus-visible,
  .be-pill:focus-visible,
  .be-switch:focus-visible,
  .be-field:focus-visible,
  .be-loopbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
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
  /* phone / tablet: a part smaller than 40 px reaches 40 px through an invisible hit margin of its own,
     sized per side from the room there (boardView.ts touchHit: never over a neighbouring operable part).
     Above the board's other tiles, so a margin also takes the gap and the neighbour's edge strip. */
  .be-hit {
    position: relative;
  }
  .be-hit::before {
    content: '';
    position: absolute;
    z-index: 1;
    top: calc(-1 * var(--ht, 0px));
    right: calc(-1 * var(--hr, 0px));
    bottom: calc(-1 * var(--hb, 0px));
    left: calc(-1 * var(--hl, 0px));
  }
  /* the pill's margin must not be clipped (its text ellipsises on its own) */
  .be-pill.be-hit {
    overflow: visible;
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
  /* phone / tablet: 40 px tall; at least 36 px wide (the row wraps below that), the 4 px gap shared
     between neighbours as a 2 px hit margin each side → 40 px */
  .be-tile.touch .be-loopbtn {
    position: relative;
    min-width: 36px;
    min-height: 40px;
  }
  .be-tile.touch .be-loopbtn::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -2px;
    right: -2px;
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

  /* ── arrange: outline, the selection (w×h + corner handle) ── */
  .be-chrome {
    position: absolute;
    inset: 0;
    z-index: 5;
    border-radius: 8px;
    border: 1px dashed color-mix(in srgb, var(--accent) 34%, transparent);
    background: color-mix(in srgb, var(--bg) 35%, transparent);
    pointer-events: none;
  }
  .be-tile.sel .be-chrome {
    border: 1.5px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .be-tile.dragging .be-chrome {
    border: 2px dashed var(--accent);
  }
  .be-dims {
    position: absolute;
    top: 3px;
    left: 50%;
    z-index: 8;
    transform: translateX(-50%);
    white-space: nowrap;
    padding: 2px 5px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    border: 1px solid var(--accent-border);
    font: 700 9px/1 var(--font-mono);
    color: var(--accentbright);
    pointer-events: none;
  }
  /* the corner handle: on the selected tile (and under the pointer); invisible handles take no press */
  .be-rsz {
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 8;
    width: 20px;
    height: 20px;
    padding: 3px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    background: transparent;
    border: 0;
    cursor: nwse-resize;
    touch-action: none;
    visibility: hidden;
    pointer-events: auto;
  }
  /* touch (tablet): a 40 px target that reaches past the tile's corner, so it covers little of the tile */
  .be-rsz.touch {
    right: -14px;
    bottom: -14px;
    width: 40px;
    height: 40px;
    padding: 17px;
  }
  .be-tile.sel .be-rsz {
    visibility: visible;
  }
  @media (hover: hover) {
    .be-tile.edit:hover .be-rsz {
      visibility: visible;
    }
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
