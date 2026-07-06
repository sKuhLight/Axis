<script lang="ts">
  import { editor } from '../../editor.svelte';
  import { history } from '../../history.svelte';
  import { LEGAL, openExternal } from '../../legal';
  import { KOFI_URL, COPYRIGHT } from '../../support';
  import type { WidgetInstance, WidgetSize, WorkbenchCommand } from '../../workbench';
  import {
    AXIS_GRID_MODES,
    axisGridMapDots,
    cycleAxisBlockSize,
    cycleAxisGridMode,
    readAxisBlockSize,
    readAxisGridMode,
    stepAxisBlockSize,
    type AxisBlockSize,
    type AxisGridMode
  } from '../gridView';
  import { axisFcWorkbenchController, type AxisFcControllerSnapshot } from '../fc/fcWorkbenchController';
  import { axisFcWorkbenchRuntime } from '../fc/fcWorkbenchRuntime';
  import { axisFcDeviceForSwitchCount, type AxisFcModelLike } from '../fc/fcWorkbenchData';
  import {
    AXIS_FC_DEVICES,
    axisFcLayoutChipLabel,
    createAxisHoldRepeat,
    cycleAxisFcDevice,
    cycleAxisFcLayout,
    readAxisFcDevice,
    type AxisFcDevice
  } from './widgetControls';

  let {
    widget,
    size,
    dispatch,
    editMode = false
  }: {
    widget: WidgetInstance;
    size: WidgetSize;
    dispatch: (command: WorkbenchCommand) => void;
    editMode: boolean;
  } = $props();

  const mini = $derived(size === 'mini');
  const compact = $derived(size === 'compact');
  const expanded = $derived(size === 'default');
  const notMini = $derived(size !== 'mini');
  const kind = $derived(widget.type.replace(/^axis\./, ''));
  const pnumRaw = $derived(editor.preset && editor.preset.number >= 0 ? editor.preset.number : -1);
  const pnum = $derived(pnumRaw >= 0 ? String(pnumRaw).padStart(3, '0') : '---');
  const pname = $derived(editor.preset?.name || (editor.conn.state === 'online' ? 'DEBUG' : 'offline'));
  const cpu = $derived(Math.max(0, Math.min(100, editor.cpu ?? 0)));
  const cpuText = $derived(editor.cpu != null ? `${editor.cpu.toFixed(0)}%` : '--');
  const cpuColor = $derived(cpu > 75 ? 'var(--danger)' : cpu > 55 ? 'var(--amber)' : 'var(--accent)');
  const connDot = $derived(editor.conn.state === 'online' ? 'var(--ok)' : editor.conn.state === 'offline' ? 'var(--danger)' : 'var(--amber)');
  const sceneCount = $derived(Math.max(1, editor.sceneCount || 8));
  const activeScene = $derived(Math.max(1, Math.min(sceneCount, editor.scene || 1)));
  const initials = $derived((editor.cloud.user?.email?.slice(0, 2) || 'AX').toUpperCase());
  // Bottom-bar status hint (parity with the old StatusBar left slot): the hover-hint for the
  // control under the cursor, falling back to the selection / connection state.
  const hintText = $derived(
    editor.hint ??
      (editor.selected
        ? editor.selected.display
        : editor.conn.state === 'online'
          ? 'Ready'
          : editor.conn.state === 'offline'
            ? 'Device offline'
            : 'Connecting…')
  );
  const gridMode = $derived(readAxisGridMode(widget.state?.mode));
  const blockSize = $derived(readAxisBlockSize(widget.state?.size));
  const isFcKind = $derived(kind === 'fcDevice' || kind === 'fcLayouts' || kind === 'fcSwitchView');
  let fcSel = $state<AxisFcControllerSnapshot>(axisFcWorkbenchController.snapshot);
  let fcModel = $state<AxisFcModelLike | null>(axisFcWorkbenchRuntime.snapshot.model);
  $effect(() => {
    if (!isFcKind) return;
    const offSel = axisFcWorkbenchController.subscribe((next) => (fcSel = next));
    const offModel = axisFcWorkbenchRuntime.subscribe((next) => (fcModel = next.model));
    return () => {
      offSel();
      offModel();
    };
  });
  // roster sizes from the live FC model when a panel has loaded it; design counts otherwise
  const fcLayoutCount = $derived(fcModel?.layouts ?? 9);
  const fcViewCount = $derived(fcModel?.views ?? 4);
  const fcLayout = $derived(Math.max(0, Math.min(fcLayoutCount - 1, fcSel.layout)));
  const fcView = $derived(Math.max(0, Math.min(fcViewCount - 1, fcSel.view)));
  const fcSwitch = $derived(fcSel.switchIndex ?? 0);
  // With a live FC model the device chip mirrors the connected unit's switch count
  // (04-fc-and-grid.md §3.1/§5 — the selector is display-only then); widget state
  // only drives it while no model is loaded.
  const fcDevice = $derived(
    fcModel?.switches != null
      ? readAxisFcDevice(axisFcDeviceForSwitchCount(fcModel.switches))
      : readAxisFcDevice(widget.state?.device)
  );
  const mapDots = $derived(
    kind === 'gridMap'
      ? axisGridMapDots(
          [...editor.layout.cells, ...editor.layout.shunts],
          editor.layout.rows || 4,
          editor.layout.cols || 12
        )
      : []
  );
  const paramTarget = $derived(widget.binding?.target ?? {});
  const paramBlock = $derived(readString(paramTarget.block) ?? readString(widget.state?.block) ?? 'Block');
  const paramLabel = $derived(readString(paramTarget.param) ?? readString(paramTarget.label) ?? readString(widget.state?.label) ?? 'Parameter');
  const paramColor = $derived(readString(widget.state?.color) ?? 'var(--accent)');
  const paramEffectId = $derived(readNumber(paramTarget.effectId) ?? readNumber(paramTarget.eid));
  const paramId = $derived(readNumber(paramTarget.paramId) ?? readNumber(paramTarget.pid));
  const paramNamed = $derived(
    paramEffectId != null && editor.selected?.effectId === paramEffectId && paramId != null
      ? editor.params.find((param) => param.id === paramId)
      : undefined
  );
  const paramEnum = $derived(
    paramEffectId != null && editor.selected?.effectId === paramEffectId && paramId != null
      ? editor.enums.find((param) => param.id === paramId)
      : undefined
  );
  const paramPreview = $derived(readNumber(widget.state?.previewValue));
  const paramNorm = $derived(paramNamed?.norm ?? (paramPreview != null ? Math.max(0, Math.min(1, paramPreview / 100)) : undefined));
  const paramValueText = $derived.by(() => {
    if (paramNamed) {
      const raw = typeof paramNamed.value === 'number' ? formatParamNumber(paramNamed.value) : '--';
      return `${raw}${paramNamed.unit ? ` ${paramNamed.unit}` : ''}`;
    }
    if (paramEnum) return paramEnum.options.find((option) => option.value === paramEnum.value)?.label ?? String(paramEnum.value);
    return paramPreview == null ? '--' : String(Math.round(paramPreview));
  });
  const paramDash = $derived(`${Math.max(0, Math.min(56.5, ((paramNorm ?? 0.5)) * 56.5)).toFixed(1)} 150`);

  function openWidget() {
    if (kind === 'preset') editor.presetOpen = true;
    else if (kind === 'addBlock') {
      editor.paletteMode = 'place';
      editor.paletteOpen = true;
    } else if (kind === 'tuner') editor.toggleTuner();
    else if (kind === 'tempo') editor.tapTempo();
    else if (kind === 'save') editor.openSave();
    else if (kind === 'search') editor.openLibrary();
    else if (kind === 'history') history.panelOpen = true;
    else if (kind === 'account') editor.openAxis('account');
    else if (kind === 'connection') editor.openPorts();
    else if (kind === 'undoRedo') void history.undo();
  }

  function setGridMode(mode: AxisGridMode) {
    dispatch({ type: 'widget.state', widgetId: widget.id, state: { mode } });
  }

  function setBlockSize(next: AxisBlockSize) {
    dispatch({ type: 'widget.state', widgetId: widget.id, state: { size: next } });
  }

  function setFcDevice(device: AxisFcDevice) {
    dispatch({ type: 'widget.state', widgetId: widget.id, state: { device } });
  }

  function presetStep(delta: number) {
    if (pnumRaw < 0) {
      editor.presetOpen = true;
      return;
    }
    void editor.selectPreset(Math.max(0, pnumRaw + delta));
  }

  // hold-to-repeat (spec §1.3: 380ms arm, 100ms repeat) for preset ‹/› and blocksize −/+
  const presetPrevHold = createAxisHoldRepeat(() => presetStep(-1));
  const presetNextHold = createAxisHoldRepeat(() => presetStep(1));
  const sizeLessHold = createAxisHoldRepeat(() => setBlockSize(stepAxisBlockSize(blockSize, -1)));
  const sizeMoreHold = createAxisHoldRepeat(() => setBlockSize(stepAxisBlockSize(blockSize, 1)));
  $effect(() => () => {
    presetPrevHold.stop();
    presetNextHold.stop();
    sizeLessHold.stop();
    sizeMoreHold.stop();
  });

  function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  function formatParamNumber(value: number): string {
    if (!Number.isFinite(value)) return '--';
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function nudgeParam(delta: number) {
    if (editMode) return;
    if (paramNamed) {
      editor.setParam(paramNamed, clamp01((paramNamed.norm ?? 0) + delta));
      return;
    }
    if (paramEnum) {
      const index = paramEnum.options.findIndex((option) => option.value === paramEnum.value);
      const next = paramEnum.options[Math.max(0, Math.min(paramEnum.options.length - 1, index + Math.sign(delta)))];
      if (next) editor.setEnum(paramEnum, next.value);
    }
  }

  function paramPointerDown(event: PointerEvent) {
    if (editMode || !paramNamed || event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startNorm = paramNamed.norm ?? 0;
    const onMove = (move: PointerEvent) => {
      editor.setParam(paramNamed, clamp01(startNorm + (startY - move.clientY) / 180));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function paramWheel(event: WheelEvent) {
    if (editMode || !paramNamed) return;
    event.preventDefault();
    nudgeParam(event.deltaY < 0 ? 0.015 : -0.015);
  }

  function paramClick() {
    if (editMode) return;
    if (paramEnum) nudgeParam(1);
  }
</script>

{#if kind === 'preset'}
  <div class="axis-widget axis-preset" data-size={size}>
    {#if !mini}
      <button
        class="preset-arrow"
        type="button"
        title="Previous preset (hold to scan)"
        onclick={() => presetStep(-1)}
        onpointerdown={(event) => presetPrevHold.start(event)}
        onpointerup={presetPrevHold.stop}
        onpointerleave={presetPrevHold.stop}
      >‹</button>
    {/if}
    <button class="preset-main" type="button" onclick={openWidget}>
      <span class="mono token">PRE</span>
      <span class="mono preset-num">{pnum}</span>
      {#if expanded}<span class="preset-name">{pname}</span>{/if}
      {#if !mini}<span class="chev">▾</span>{/if}
    </button>
    {#if !mini}
      <button
        class="preset-arrow"
        type="button"
        title="Next preset (hold to scan)"
        onclick={() => presetStep(1)}
        onpointerdown={(event) => presetNextHold.start(event)}
        onpointerup={presetNextHold.stop}
        onpointerleave={presetNextHold.stop}
      >›</button>
    {/if}
  </div>
{:else if kind === 'scenes'}
  <div class="axis-widget chips" data-size={size}>
    {#if expanded}<span class="mono token">SCN</span>{/if}
    <div class="chip-row">
      {#each Array(sceneCount) as _, i}
        {@const s = i + 1}
        {#if !mini || activeScene === s}
          <button
            class="num-chip"
            class:on={activeScene === s}
            type="button"
            title={`Scene ${s}`}
            onclick={() => editor.selectScene(mini ? (activeScene % sceneCount) + 1 : s)}
          >
            {s}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{:else if kind === 'view'}
  <div class="axis-widget chips" data-size={size}>
    {#if expanded}<span class="mono token">VIEW</span>{/if}
    <div class="chip-row">
      <button
        class="pill-chip"
        class:on={editor.globalMode === 'basic' || mini}
        type="button"
        onclick={() => editor.setGlobalMode(mini ? (editor.globalMode === 'basic' ? 'advanced' : 'basic') : 'basic')}
      >
        {mini ? (editor.globalMode === 'basic' ? 'Basic' : 'Adv') : 'Basic'}
      </button>
      {#if !mini}
        <button class="pill-chip" class:on={editor.globalMode === 'advanced'} type="button" onclick={() => editor.setGlobalMode('advanced')}>
          {compact ? 'Adv' : 'Advanced'}
        </button>
      {/if}
    </div>
  </div>
{:else if kind === 'gridMode'}
  <div class="axis-widget chips" data-size={size}>
    {#if expanded}<span class="mono token">GRID</span>{/if}
    <div class="chip-row">
      {#each AXIS_GRID_MODES as mode}
        {#if !mini || mode === gridMode}
          <button
            class="pill-chip"
            class:on={mode === gridMode || mini}
            type="button"
            title={mode === 'full' ? 'Blocks at the chosen size — grid pans' : mode === 'map' ? 'Glyph minimap' : 'Fit blocks to the pane'}
            onclick={() => setGridMode(mini ? cycleAxisGridMode(gridMode) : mode)}
          >
            {mode === 'full' ? 'Full' : mode === 'map' ? 'Map' : 'Auto'}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{:else if kind === 'blockSize'}
  <div class="axis-widget block-size" data-size={size}>
    {#if expanded}<span class="mono token">SIZE</span>{/if}
    {#if mini}
      <button class="mono strong size-cycle" type="button" title="Cycle block size" onclick={() => setBlockSize(cycleAxisBlockSize(blockSize))}>{blockSize}</button>
    {:else}
      <button
        class="step"
        type="button"
        title="Smaller blocks (hold)"
        disabled={blockSize === 'S'}
        onclick={() => setBlockSize(stepAxisBlockSize(blockSize, -1))}
        onpointerdown={(event) => sizeLessHold.start(event)}
        onpointerup={sizeLessHold.stop}
        onpointerleave={sizeLessHold.stop}
      >−</button>
      <span class="mono strong">{blockSize}</span>
      <button
        class="step"
        type="button"
        title="Bigger blocks (hold)"
        disabled={blockSize === 'L'}
        onclick={() => setBlockSize(stepAxisBlockSize(blockSize, 1))}
        onpointerdown={(event) => sizeMoreHold.start(event)}
        onpointerup={sizeMoreHold.stop}
        onpointerleave={sizeMoreHold.stop}
      >+</button>
    {/if}
  </div>
{:else if kind === 'paramControl'}
  <button
    class="axis-widget param"
    class:writable={!!paramNamed || !!paramEnum}
    data-size={size}
    type="button"
    title={`${paramBlock} · ${paramLabel}${paramNamed ? ' · drag or wheel to edit' : paramEnum ? ' · click to cycle' : ''}`}
    onpointerdown={paramPointerDown}
    onwheel={paramWheel}
    onclick={paramClick}
  >
    <span class="param-ring" style:--param-color={paramColor} style:--param-dash={paramDash}>
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12" class="param-track" transform="rotate(135 16 16)"></circle>
        <circle cx="16" cy="16" r="12" class="param-value" transform="rotate(135 16 16)"></circle>
      </svg>
    </span>
    <span class="mono strong">{paramValueText}</span>
    {#if expanded}<span class="mono token">{paramLabel}</span>{/if}
  </button>
{:else if kind === 'tempo'}
  <button class="axis-widget" data-size={size} type="button" onclick={openWidget} title="Tap tempo">
    <span class="mono big">{editor.bpm}</span>
    {#if notMini}<span class="mono token">BPM</span>{/if}
  </button>
{:else if kind === 'cpu'}
  <div class="axis-widget meter" data-size={size} title="DSP load">
    <span class="mono token">CPU</span>
    <span class="bar"><span style:width={`${cpu}%`} style:background={cpuColor}></span></span>
    {#if expanded}<span class="mono strong">{cpuText}</span>{/if}
  </div>
{:else if kind === 'connection'}
  <button class="axis-widget" data-size={size} type="button" onclick={openWidget} title="Connection">
    <span class="led" style:background={connDot}></span>
    {#if expanded}<span class="mono token">{editor.conn.fw ? `AX-3 · FW${editor.conn.fw}` : editor.conn.state}</span>{/if}
  </button>
{:else if kind === 'account'}
  <button class="axis-widget square account" data-size={size} type="button" onclick={openWidget} title="Account and cloud sync">
    <span>{initials}</span>
  </button>
{:else if kind === 'history'}
  <button class="axis-widget square" data-size={size} type="button" onclick={openWidget} title="History">
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
      <path d="M8 4.6 V8 L10.3 9.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
    </svg>
  </button>
{:else if kind === 'save'}
  <button class="axis-widget save" data-size={size} type="button" onclick={openWidget} title="Save">
    <span class="save-dot"></span>
    {#if expanded}<span>Save</span>{/if}
  </button>
{:else if kind === 'addBlock'}
  <button class="axis-widget add" data-size={size} type="button" onclick={openWidget} title="Add block">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
      <path d="M10.6 10.6 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
    </svg>
    {#if expanded}<span>Add block</span><span class="shortcut mono">⌘K</span>{/if}
  </button>
{:else if kind === 'search'}
  <button class="axis-widget search" data-size={size} type="button" onclick={openWidget} title="Search presets">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
      <path d="M10.8 10.8 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
    </svg>
    {#if expanded}<span>Search presets...</span>{/if}
  </button>
{:else if kind === 'logo'}
  <div class="axis-widget square logo" data-size={size} title="Axis">
    <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="9" cy="9" r="3.4" class="logo-a"></circle>
      <circle cx="21" cy="9" r="3.4" class="logo-b"></circle>
      <circle cx="15" cy="21" r="3.4" class="logo-c"></circle>
      <path d="M9 9 L21 9 L15 21 Z" fill="none" class="logo-tri"></path>
    </svg>
  </div>
{:else if kind === 'gridMap'}
  <button
    class="axis-widget map"
    data-size={size}
    type="button"
    title="Grid map · show the Block Editor navigator"
    onclick={() => dispatch({ type: 'panel.activate', panelId: 'axis.blockEditor' })}
  >
    <span class="map-dots">
      {#each mapDots as on, i (i)}
        <span class="map-dot" class:on></span>
      {/each}
    </span>
    {#if expanded}<span class="mono token">MAP</span>{/if}
  </button>
{:else if kind === 'fcDevice'}
  <div class="axis-widget chips" data-size={size}>
    {#if expanded}<span class="mono token">FC</span>{/if}
    <div class="chip-row">
      {#if mini}
        <button
          class="pill-chip on"
          type="button"
          title={`FC device ${fcDevice} · tap for next`}
          onclick={() => setFcDevice(cycleAxisFcDevice(fcDevice))}
        >
          {fcDevice}
        </button>
      {:else}
        {#each AXIS_FC_DEVICES as device (device)}
          <button
            class="pill-chip"
            class:on={device === fcDevice}
            type="button"
            title={`FC device ${device}`}
            onclick={() => setFcDevice(device)}
          >
            {device}
          </button>
        {/each}
      {/if}
    </div>
  </div>
{:else if kind === 'fcLayouts'}
  <div class="axis-widget chips" data-size={size}>
    {#if expanded}<span class="mono token">LAY</span>{/if}
    <div class="chip-row">
      {#if mini}
        <button
          class="num-chip on"
          type="button"
          title={`Layout ${axisFcLayoutChipLabel(fcLayout)} · tap for next`}
          onclick={() => axisFcWorkbenchController.selectLayout(cycleAxisFcLayout(fcLayout, fcLayoutCount))}
        >
          {axisFcLayoutChipLabel(fcLayout)}
        </button>
      {:else}
        {#each Array(fcLayoutCount) as _, i}
          <button
            class="num-chip"
            class:on={i === fcLayout}
            type="button"
            title={`Layout ${axisFcLayoutChipLabel(i)}`}
            onclick={() => axisFcWorkbenchController.selectLayout(i)}
          >
            {axisFcLayoutChipLabel(i)}
          </button>
        {/each}
      {/if}
    </div>
  </div>
{:else if kind === 'fcSwitchView'}
  <div class="axis-widget fc-switch" data-size={size}>
    {#if expanded}<span class="mono token">SW</span>{/if}
    <button class="fc-arrow" type="button" title="Previous switch" onclick={() => axisFcWorkbenchController.selectSwitch(Math.max(0, fcSwitch - 1))}>‹</button>
    <span class="mono big fc-num">{fcSwitch + 1}</span>
    <button class="fc-arrow" type="button" title="Next switch" onclick={() => axisFcWorkbenchController.selectSwitch(fcSwitch + 1)}>›</button>
    {#if expanded}<span class="mono token">VIEW</span>{/if}
    {#if !mini}
      <div class="chip-row">
        {#each Array(fcViewCount) as _, i}
          <button class="num-chip" class:on={i === fcView} type="button" title={`View ${i + 1}`} onclick={() => axisFcWorkbenchController.selectView(i)}>
            {i + 1}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else if kind === 'meterToggle'}
  <button
    class="axis-widget meter-toggle"
    class:on={editor.meteringOn}
    data-size={size}
    type="button"
    disabled={!editor.canMeterBlocks}
    title={editor.canMeterBlocks
      ? "Per-block audio meters — polls the open block's level once per ~0.5s"
      : 'Per-block metering needs a ready device with live monitors on a fast link'}
    onclick={() => (editor.meteringOn = !editor.meteringOn)}
  >
    <span class="meter-glyph">▊</span>
    {#if expanded}<span class="mono token">METER</span>{/if}
    {#if notMini}<span class="mono meter-state">{editor.meteringOn ? 'ON' : 'OFF'}</span>{/if}
  </button>
{:else if kind === 'hint'}
  <div class="axis-widget hint" data-size={size} title={hintText}>
    <span class="mono hint-text">{hintText}</span>
  </div>
{:else if kind === 'legal'}
  <div class="axis-widget legal" data-size={size}>
    <button class="kofi" type="button" title="Support Axis development on Ko-fi" onclick={() => openExternal(KOFI_URL)}>☕{#if notMini}<span> Support on Ko-fi</span>{/if}</button>
    {#if expanded}
      <span class="sep" aria-hidden="true"></span>
      <span class="cr">{COPYRIGHT}</span>
    {/if}
    <span class="sep" aria-hidden="true"></span>
    <button class="lnk" type="button" onclick={() => openExternal(LEGAL.imprint)}>Imprint</button>
  </div>
{:else}
  <button class="axis-widget" data-size={size} type="button" onclick={openWidget} title={kind}>
    <span class="glyph">{kind === 'tuner' ? '♪' : kind === 'undoRedo' ? '↶' : '•'}</span>
    {#if expanded}<span class="mono token">{kind === 'tuner' ? 'TUNE' : kind}</span>{/if}
  </button>
{/if}

<style>
  .axis-widget,
  .axis-widget button {
    font-family: var(--font-ui);
  }
  .axis-widget {
    max-width: 100%;
    min-width: 0;
    height: 38px;
    display: inline-flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    padding: 0 13px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg2);
    color: var(--text2);
    cursor: pointer;
    overflow: hidden;
    font: 700 12px/1 var(--font-ui);
    white-space: nowrap;
  }
  button.axis-widget,
  .axis-widget button {
    appearance: none;
  }
  button.axis-widget,
  .axis-widget button {
    border: 0;
  }
  :global(.aw-widget-group) .axis-widget {
    border-color: transparent;
    background: transparent;
  }
  button.axis-widget:hover,
  .axis-widget button:hover {
    color: var(--text);
  }
  button.axis-widget:hover {
    border-color: var(--border3);
  }
  .axis-widget[data-size='compact'] {
    height: 34px;
    padding-inline: 10px;
    gap: 8px;
  }
  .axis-widget[data-size='mini'] {
    height: 28px;
    padding: 0 7px;
    gap: 5px;
    border-radius: 8px;
  }
  .axis-preset {
    padding: 0;
    gap: 0;
  }
  .preset-main,
  .preset-arrow {
    height: 100%;
    display: inline-flex;
    align-items: center;
    background: transparent;
    color: var(--textdim);
    cursor: pointer;
  }
  .preset-main {
    min-width: 0;
    gap: 9px;
    padding: 0 8px;
    color: var(--text2);
  }
  .preset-arrow {
    width: 24px;
    justify-content: center;
    font-size: 17px;
  }
  .preset-num {
    color: var(--amber);
    font-size: 14px;
    font-weight: 800;
  }
  .preset-name {
    max-width: 150px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }
  .chev {
    color: var(--textmuted);
    font-size: 10px;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .token {
    flex: none;
    color: var(--textfaint);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .strong,
  .big {
    color: var(--text);
    font-weight: 800;
  }
  .big {
    font-size: 14px;
  }
  .chip-row {
    display: flex;
    flex-wrap: nowrap;
    gap: 3px;
  }
  .num-chip,
  .pill-chip {
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: transparent;
    color: var(--textfaint);
    cursor: pointer;
    font-weight: 700;
  }
  .num-chip {
    min-width: 21px;
    padding: 0 5px;
    font: 800 11px/1 var(--font-mono);
  }
  .pill-chip {
    padding: 5px 10px;
    font-size: 11px;
  }
  [data-size='compact'] .num-chip {
    min-width: 18px;
    height: 20px;
    padding-inline: 3px;
  }
  [data-size='compact'] .pill-chip {
    height: 20px;
    padding: 4px 8px;
    font-size: 10.5px;
  }
  [data-size='mini'] .num-chip,
  [data-size='mini'] .pill-chip {
    min-width: 24px;
    height: 22px;
    padding: 0 6px;
  }
  .num-chip.on,
  .pill-chip.on {
    background: var(--accent);
    color: var(--accentink);
  }
  .meter .bar {
    width: 44px;
    height: 6px;
    flex: none;
    overflow: hidden;
    border-radius: 3px;
    background: var(--track);
  }
  [data-size='mini'].meter .bar {
    width: 26px;
  }
  .meter .bar span {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .led,
  .save-dot {
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
    box-shadow: 0 0 8px currentColor;
  }
  .save-dot {
    width: 8px;
    height: 8px;
    color: var(--amber);
    background: var(--amber);
  }
  .save {
    color: #f5c878;
  }
  .square {
    width: 38px;
    justify-content: center;
    padding: 0;
    color: var(--textdim);
  }
  .square[data-size='compact'] {
    width: 34px;
  }
  .square[data-size='mini'] {
    width: 28px;
    justify-content: center;
    padding: 0;
  }
  .account span {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), #4f6bed);
    color: var(--accentink);
    font-weight: 800;
    font-size: 10px;
  }
  .add {
    color: #4fd1dc;
  }
  .shortcut {
    padding: 4px 6px;
    border: 1px solid #234142;
    border-radius: 5px;
    background: #0d1516;
    color: #5e8a8c;
    font-size: 10px;
    font-weight: 700;
  }
  .search {
    color: var(--textfaint);
  }
  .step {
    width: 22px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--surface2);
    color: var(--textdim);
    cursor: pointer;
    font-size: 15px;
    font-weight: 700;
  }
  .step:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .size-cycle {
    background: transparent;
    cursor: pointer;
    font-size: 12px;
  }
  .param {
    position: relative;
  }
  .param.writable {
    border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  }
  .param.writable:hover {
    border-color: var(--accent);
  }
  .param-ring {
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
  .glyph {
    color: var(--textdim);
    font-size: 15px;
    line-height: 1;
  }
  .logo {
    cursor: default;
  }
  .logo .logo-a {
    fill: var(--aw-accent);
  }
  .logo .logo-b {
    fill: var(--blue, var(--aw-accent));
  }
  .logo .logo-c {
    fill: var(--aw-amber);
  }
  .logo .logo-tri {
    stroke: var(--aw-border-3);
    stroke-width: 1.6;
  }
  .map-dots {
    display: grid;
    flex: none;
    grid-template-columns: repeat(6, 3px);
    grid-auto-rows: 3px;
    gap: 2px;
  }
  .map-dot {
    width: 3px;
    height: 3px;
    border-radius: 1px;
    background: var(--aw-border-2);
  }
  .map-dot.on {
    background: var(--aw-accent);
  }
  .fc-arrow {
    width: 16px;
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    background: transparent;
    color: var(--aw-text-muted);
    cursor: pointer;
    font-size: 16px;
  }
  .fc-arrow:hover {
    color: var(--aw-text);
  }
  .fc-num {
    min-width: 14px;
    text-align: center;
  }
  .meter-toggle .meter-glyph {
    color: var(--aw-text-faint);
    font-size: 11px;
    line-height: 1;
  }
  .meter-toggle .meter-state {
    color: var(--aw-text-faint);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .meter-toggle.on .meter-glyph,
  .meter-toggle.on .meter-state {
    color: var(--aw-accent);
  }
  .meter-toggle:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .hint {
    flex: 1;
    min-width: 0;
    max-width: 420px;
    justify-content: flex-start;
    border-color: transparent;
    background: transparent;
    cursor: default;
  }
  .hint-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--textdim);
    font-size: 11px;
    font-weight: 600;
  }
  .legal {
    gap: 10px;
    border-color: transparent;
    background: transparent;
    color: var(--textdim);
    cursor: default;
  }
  .legal .kofi {
    background: none;
    color: var(--blue, #13c3ff);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .legal .kofi:hover {
    filter: brightness(1.12);
  }
  .legal .lnk {
    background: none;
    color: var(--textdim);
    font-size: 11px;
    cursor: pointer;
  }
  .legal .lnk:hover {
    color: var(--text2);
  }
  .legal .cr {
    color: var(--textmuted);
    font-size: 11px;
  }
  .legal .sep {
    width: 3px;
    height: 3px;
    flex: none;
    border-radius: 50%;
    background: var(--border3);
  }
</style>
