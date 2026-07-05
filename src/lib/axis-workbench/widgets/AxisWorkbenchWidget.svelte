<script lang="ts">
  import { editor } from '../../editor.svelte';
  import { history } from '../../history.svelte';
  import type { WidgetInstance, WidgetSize, WorkbenchCommand } from '../../workbench';

  let {
    widget,
    size
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
  const gridMode = $derived((widget.state?.mode as string | undefined) ?? 'auto');
  const blockSize = $derived((widget.state?.size as string | undefined) ?? 'M');
  const paramTarget = $derived(widget.binding?.target ?? {});
  const paramBlock = $derived(readString(paramTarget.block) ?? readString(widget.state?.block) ?? 'Block');
  const paramLabel = $derived(readString(paramTarget.param) ?? readString(paramTarget.label) ?? readString(widget.state?.label) ?? 'Parameter');
  const paramColor = $derived(readString(widget.state?.color) ?? 'var(--accent)');
  const paramPreview = $derived(readNumber(widget.state?.previewValue));
  const paramDash = $derived(`${Math.max(0, Math.min(56.5, ((paramPreview ?? 50) / 100) * 56.5)).toFixed(1)} 150`);

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

  function presetStep(delta: number) {
    if (pnumRaw < 0) {
      editor.presetOpen = true;
      return;
    }
    void editor.selectPreset(Math.max(0, pnumRaw + delta));
  }

  function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
</script>

{#if kind === 'preset'}
  <div class="axis-widget axis-preset" data-size={size}>
    {#if !mini}
      <button class="preset-arrow" type="button" title="Previous preset" onclick={() => presetStep(-1)}>‹</button>
    {/if}
    <button class="preset-main" type="button" onclick={openWidget}>
      <span class="mono token">PRE</span>
      <span class="mono preset-num">{pnum}</span>
      {#if expanded}<span class="preset-name">{pname}</span>{/if}
      {#if !mini}<span class="chev">▾</span>{/if}
    </button>
    {#if !mini}
      <button class="preset-arrow" type="button" title="Next preset" onclick={() => presetStep(1)}>›</button>
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
      {#each ['full', 'map', 'auto'] as mode}
        {#if !mini || mode === gridMode}
          <button class="pill-chip" class:on={mode === gridMode || mini} type="button">{mode === 'full' ? 'Full' : mode === 'map' ? 'Map' : 'Auto'}</button>
        {/if}
      {/each}
    </div>
  </div>
{:else if kind === 'blockSize'}
  <div class="axis-widget block-size" data-size={size}>
    {#if expanded}<span class="mono token">SIZE</span>{/if}
    {#if !mini}<button class="step" type="button">−</button>{/if}
    <span class="mono strong">{blockSize}</span>
    {#if !mini}<button class="step" type="button">+</button>{/if}
  </div>
{:else if kind === 'paramControl'}
  <button class="axis-widget param" data-size={size} type="button" title={`${paramBlock} · ${paramLabel}`}>
    <span class="param-ring" style:--param-color={paramColor} style:--param-dash={paramDash}>
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12" class="param-track" transform="rotate(135 16 16)"></circle>
        <circle cx="16" cy="16" r="12" class="param-value" transform="rotate(135 16 16)"></circle>
      </svg>
    </span>
    <span class="mono strong">{paramPreview == null ? '--' : Math.round(paramPreview)}</span>
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
    gap: 6px;
  }
  .axis-widget[data-size='mini'] {
    width: 28px;
    height: 28px;
    justify-content: center;
    padding: 0;
    gap: 0;
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
  .param {
    position: relative;
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
</style>
