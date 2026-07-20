<script lang="ts">
  import { editor } from '../../editor.svelte';
  import { history } from '../../history.svelte';
  import { withUnit } from '../../format';
  import { LEGAL, openExternal } from '../../legal';
  import { KOFI_URL, COPYRIGHT } from '../../support';
  import type { WidgetInstance, WidgetSize, WorkbenchCommand } from '../../workbench';
  import { isPanelWidgetZone } from '../../workbench';
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
  import { resolveParamWidgetState } from './paramWidgetState';
  import { isSaveDirty } from './saveDirtyState';
  import { computeTrafficRates, formatRate, type TrafficRates } from './telemetryTraffic';
  import type { TelemetryMode, TrafficSnapshot } from '../../types';

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
  // Save chip dirty state (02-widgets.md): unsaved in-app edits since the last
  // Save → accent "Save"; otherwise green "Saved". Derived from read-only history.
  const saveDirty = $derived(isSaveDirty(history.entries, history.cursor));
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
  const paramColor = $derived(readString(widget.state?.color) ?? readString(paramTarget.color) ?? 'var(--accent)');
  // Display mode: pinned params default to the Block-Editor square control-tile
  // look when they live in a custom panel (touch-friendly, name-labelled), and
  // to the compact horizontal chip in bars/rails (where a tall tile won't fit).
  // `state.display` ('tile' | 'ring') overrides the per-context default. `mini`
  // always collapses to the chip so an auto-fit bar stays a single row.
  const paramDisplayPref = $derived(readString(widget.state?.display));
  const paramInPanel = $derived(isPanelWidgetZone(widget.zone));
  const paramTile = $derived(
    !mini && (paramDisplayPref === 'tile' || (paramDisplayPref !== 'ring' && paramInPanel))
  );
  const paramRingPx = $derived(paramTile ? (compact ? 34 : 42) : 24);
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
    if (kind !== 'paramControl' || paramEffectId == null) return;
    return editor.registerPinnedBlock(paramEffectId);
  });
  const paramPreview = $derived(readNumber(widget.state?.previewValue));
  const paramNorm = $derived(paramNamed?.norm ?? (paramPreview != null ? Math.max(0, Math.min(1, paramPreview / 100)) : undefined));
  // effectIds present in the current preset grid — undefined until a preset is loaded
  // so we never falsely flag a bound block as "missing" during a cold boot.
  const paramPresetIds = $derived(
    editor.preset
      ? new Set([...editor.layout.cells, ...editor.layout.shunts].map((cell) => cell.effectId))
      : undefined
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
    paramEffectId == null
      ? undefined
      : [...editor.layout.cells, ...editor.layout.shunts].find((cell) => cell.effectId === paramEffectId)
  );
  const paramTip = $derived.by(() => {
    const head = `${paramBlock} · ${paramLabel}`;
    if (paramLive) return paramNamed ? `${head} · drag or wheel to edit` : paramEnum ? `${head} · click to cycle` : head;
    if (paramReadonly) return paramCell ? `${head} · read-only · click to open block` : head;
    return `${head} · block not in this preset`;
  });
  const paramValueText = $derived.by(() => {
    if (paramNamed) {
      const raw = typeof paramNamed.value === 'number' ? formatParamNumber(paramNamed.value) : '--';
      // withUnit keeps device tokens verbatim (dB/OCT, SECONDS, …), single-spaced; % attaches with no space.
      return withUnit(raw, paramNamed.unit);
    }
    if (paramEnum) return paramEnum.options.find((option) => option.value === paramEnum.value)?.label ?? String(paramEnum.value);
    return paramPreview == null ? '--' : String(Math.round(paramPreview));
  });
  const paramDash = $derived(`${Math.max(0, Math.min(56.5, ((paramNorm ?? 0.5)) * 56.5)).toFixed(1)} 150`);

  // ── telemetry widget (META-17) ──
  // Capability-gated: hidden entirely when the device server has no polling-mode control.
  const hasTelemetry = $derived(editor.hasTelemetryControl);
  const POLL_MODE_KEYS: { key: TelemetryMode; short: string; label: string }[] = [
    { key: 'performance', short: 'P', label: 'Performance' },
    { key: 'balanced', short: 'B', label: 'Balanced' },
    { key: 'reduced', short: 'R', label: 'Reduced (Live)' }
  ];
  // Previous cumulative snapshot kept locally (plain vars — NOT reactive, so updating them inside the
  // effect below can't loop). trafficRates is $state so the readout re-renders when it changes.
  let prevTraffic: TrafficSnapshot | null = null;
  let prevTrafficAt = 0;
  let trafficRates = $state<TrafficRates | null>(null);
  const trafficLoops = $derived(kind === 'telemetry' ? (editor.traffic?.loops ?? []) : []);
  $effect(() => {
    if (kind !== 'telemetry') return;
    const snap = editor.traffic; // track the latest snapshot
    if (!snap) return;
    const now = Date.now();
    const rates = computeTrafficRates(prevTraffic, prevTrafficAt, snap, now);
    if (rates) trafficRates = rates;
    prevTraffic = snap;
    prevTrafficAt = now;
  });

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
    if (editMode || paramEffectId == null) return;
    if (paramNamed) {
      editor.setPinnedParam(paramEffectId, paramNamed, clamp01((paramNamed.norm ?? 0) + delta));
      return;
    }
    if (paramEnum) {
      const index = paramEnum.options.findIndex((option) => option.value === paramEnum.value);
      const next = paramEnum.options[Math.max(0, Math.min(paramEnum.options.length - 1, index + Math.sign(delta)))];
      if (next) editor.setPinnedEnum(paramEffectId, paramEnum, next.value);
    }
  }

  function paramPointerDown(event: PointerEvent) {
    if (editMode || !paramNamed || paramEffectId == null || event.button !== 0) return;
    event.preventDefault();
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
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function paramWheel(event: WheelEvent) {
    if (editMode || !paramNamed) return;
    event.preventDefault();
    nudgeParam(event.deltaY < 0 ? 0.015 : -0.015);
  }

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
    title={paramTip}
    aria-label={paramTip}
    style:--param-color={paramColor}
    onpointerdown={paramPointerDown}
    onwheel={paramWheel}
    onclick={paramClick}
  >
    <!-- control-surface-style tooltip: which block this control belongs to -->
    <span class="axtip">{paramBlock} · {paramLabel}</span>
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
  <button
    class="axis-widget save"
    class:dirty={saveDirty}
    data-size={size}
    type="button"
    onclick={openWidget}
    title={saveDirty ? 'Unsaved edits — click to Save' : 'No unsaved edits'}
  >
    <span class="save-dot"></span>
    {#if expanded}<span>{saveDirty ? 'Save' : 'Saved'}</span>{/if}
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
{:else if kind === 'telemetry'}
  {#if hasTelemetry}
    <div class="axis-widget axis-telemetry" data-size={size} data-mode={editor.pollingMode} title="Device polling mode & live traffic">
      {#if expanded}<span class="mono token">POLL</span>{/if}
      <div class="tmode-row" role="group" aria-label="Polling mode">
        {#each POLL_MODE_KEYS as m}
          <button
            class="tmode"
            class:on={editor.pollingMode === m.key}
            type="button"
            aria-pressed={editor.pollingMode === m.key}
            title={`Polling: ${m.label}`}
            onclick={() => editor.setPollingMode(m.key)}
          >{m.short}</button>
        {/each}
      </div>
      {#if notMini}
        <span class="mono trate" title="TX / RX messages per second">
          <span class="trk">TX</span>{formatRate(trafficRates?.txMsgs ?? 0)}<span class="tru">/s</span>
          <span class="trk rx">RX</span>{formatRate(trafficRates?.rxMsgs ?? 0)}<span class="tru">/s</span>
        </span>
      {/if}
      {#if expanded}
        <span class="mono tkb" title="TX / RX kilobytes per second">{formatRate(trafficRates?.txKB ?? 0)}/{formatRate(trafficRates?.rxKB ?? 0)} KB/s</span>
        <span class="tloops" title={`Active poll loops: ${trafficLoops.join(', ') || 'none'}`} aria-label={`${trafficLoops.length} active poll loop${trafficLoops.length === 1 ? '' : 's'}`}>
          {#each trafficLoops as loop (loop)}<span class="tloop"></span>{/each}
        </span>
      {/if}
    </div>
  {/if}
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
  /* Clean = green "Saved" (green dot + ink); dirty = amber "Save" (02-widgets.md). */
  .save {
    color: var(--ok, #33c46b);
  }
  .save .save-dot {
    color: var(--ok, #33c46b);
    background: var(--ok, #33c46b);
  }
  .save.dirty {
    color: var(--amber, #f5a623);
  }
  .save.dirty .save-dot {
    color: var(--amber, #f5a623);
    background: var(--amber, #f5a623);
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
    color: var(--text2);
  }
  /* control-surface-style hover/focus tooltip (design axtip): source block · param */
  .axtipwrap {
    position: relative;
  }
  .axtip {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
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
  .axtipwrap:hover .axtip,
  .axtipwrap:focus-visible .axtip {
    opacity: 1;
  }
  /* Block-Editor square control-tile look: touch-friendly, always shows the
     parameter name, tinted by the source block's category accent (--param-color). */
  .param.param-tile {
    flex-direction: column;
    justify-content: center;
    height: auto;
    min-height: 92px;
    min-width: 84px;
    width: 100%;
    gap: 5px;
    padding: 12px 10px;
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
  .param.param-tile .param-val {
    font-size: 13px;
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
  /* telemetry monitor (META-17): P/B/R quick-switch + live TX/RX rate + loop dots */
  .axis-telemetry {
    gap: 7px;
  }
  .axis-telemetry .tmode-row {
    display: flex;
    flex: none;
    gap: 2px;
  }
  .axis-telemetry .tmode {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: var(--surface2);
    color: var(--textfaint);
    cursor: pointer;
    font: 800 10px/1 var(--font-mono);
  }
  .axis-telemetry .tmode:hover {
    color: var(--text2);
  }
  .axis-telemetry .tmode.on {
    background: var(--accent);
    color: var(--accentink);
  }
  [data-size='mini'].axis-telemetry .tmode {
    width: 18px;
    height: 18px;
  }
  .axis-telemetry .trate {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    color: var(--text2);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
  .axis-telemetry .trk {
    color: var(--textfaint);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .axis-telemetry .trk.rx {
    margin-left: 4px;
  }
  .axis-telemetry .tru {
    color: var(--textmuted);
    font-size: 9px;
  }
  .axis-telemetry .tkb {
    color: var(--textfaint);
    font-size: 10px;
    white-space: nowrap;
  }
  .axis-telemetry .tloops {
    display: inline-flex;
    flex: none;
    gap: 2px;
    align-items: center;
  }
  .axis-telemetry .tloop {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--ok, #33c46b);
    box-shadow: 0 0 6px var(--ok, #33c46b);
  }
</style>
