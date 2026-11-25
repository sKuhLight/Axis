<script lang="ts">
  // One Quick Controls tile: the Block Editor's control tile (BeControl) for a parameter pinned to a custom
  // panel, with its own minimal BeHost — the panel is not a block, so there is no block editor around it.
  // Values read and write through the editor's pinned-block hydration (the block may not be open).
  import BeControl from '../../blockEditor/BeControl.svelte';
  import { setBeHost, type BeHost } from '../../blockEditor/beHost';
  import type { BeCtl } from '../../blockEditor/catalog';
  import type { BeItem } from '../../blockEditor/boardModel';
  import { formatCentre, parseTyped } from '../../blockEditor/valueFormat';
  import { editor } from '../../editor.svelte';
  import type { CustomPanelTileInfo } from '../customPanelTiles';

  let {
    info,
    x,
    y,
    c,
    g,
    page,
    editMode = false,
    selected = false,
    onselect,
    onmove,
    onremove
  }: {
    info: CustomPanelTileInfo;
    x: number;
    y: number;
    /** Cell size and gap in px. */
    c: number;
    g: number;
    page: string;
    editMode?: boolean;
    selected?: boolean;
    onselect: () => void;
    /** Ctrl/⌘-drag on the tile: the panel reorders it to the cell under the pointer. */
    onmove: (event: PointerEvent) => void;
    /** The selected tile's × (Delete works too). */
    onremove: () => void;
  } = $props();

  const effectId = $derived(info.effectId);
  const paramId = $derived(info.paramId);
  const live = $derived.by(() => {
    if (effectId == null || paramId == null) return { named: undefined, enm: undefined };
    const view = editor.pinnedView(effectId);
    return {
      named: view.named.find((param) => param.id === paramId),
      enm: view.enums.find((param) => param.id === paramId)
    };
  });
  const named = $derived(live.named);
  const enm = $derived(live.enm);
  const view = $derived(enm ? ('button' as const) : ('knob' as const));
  const item: BeItem = $derived({
    id: `qc:${info.widgetId}`,
    key: `k${effectId ?? 0}.${paramId ?? 0}`,
    view,
    x,
    y,
    w: 2,
    h: 2
  });
  const ctl: BeCtl = $derived({
    key: item.key,
    kind: enm ? 'toggle' : 'cont',
    label: named?.name || enm?.name || info.label,
    id: paramId ?? -1,
    view,
    views: [view],
    w: 2,
    h: 2
  });

  // Keep the bound block hydrated while its control is on screen (the same deal as a pinned widget).
  $effect(() => {
    if (effectId == null) return;
    return editor.registerPinnedBlock(effectId);
  });

  // ── the tile's host ──────────────────────────────────────────────────────────────────────────────
  let editingId = $state<string | null>(null);
  let editBuf = $state('');
  let editInit = '';
  let drag: { pointerId: number; startY: number; norm: number; itemId: string } | null = null;

  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
  const setNorm = (norm: number): void => {
    if (named && effectId != null) editor.setPinnedParam(effectId, named, clamp01(norm));
  };
  const cycle = (): void => {
    if (!enm || effectId == null || !enm.options.length) return;
    const index = enm.options.findIndex((option) => option.value === enm.value);
    const next = enm.options[(index + 1) % enm.options.length];
    if (next) editor.setPinnedEnum(effectId, enm, next.value);
  };

  function startType(itemId: string): void {
    if (!named) return;
    editBuf = formatCentre(named);
    editInit = editBuf;
    editingId = itemId;
  }
  function commitType(itemId: string): void {
    if (editingId !== itemId) return;
    const text = editBuf.trim();
    editingId = null;
    if (!named || text === editInit.trim()) return;
    const norm = parseTyped(named, text);
    if (norm != null) setNorm(norm);
  }

  const host: BeHost = {
    editMode: false,
    flashId: null,
    isPhone: false,
    get accent() {
      return info.color || '';
    },
    get editingId() {
      return editingId;
    },
    get editBuf() {
      return editBuf;
    },
    set editBuf(value: string) {
      editBuf = value;
    },
    openSelectId: null,
    selectMenuId: 'qc-select-tile',
    dragId: null,
    selectedId: null,
    resizingId: null,
    touchArrange: false,
    touchTargets: false,
    scrollAxis: 'y',
    fixedScrollAxis: 'y',
    canPin: false,
    hideHoverActions: true,
    eqBands: [],
    eqGainRange: 12,
    bypassed: false,
    mons: [],
    wave: [],
    wavePos: 0,
    waveLevel: null,
    knob: () => named,
    enm: () => enm,
    loopOn: () => false,
    bpm: 0,
    hasTempo: false,
    typeName: null,
    clock: 0,
    animate: false,
    playhead: () => {},
    meteringOn: false,
    isLiveMeter: () => false,
    observeTileTelemetry: () => undefined,
    tileDown: (event, target) => {
      if (!named || event.button !== 0 || editingId === target.id) return;
      event.stopPropagation();
      drag = { pointerId: event.pointerId, startY: event.clientY, norm: named.norm ?? 0, itemId: target.id };
      const move = (e: PointerEvent): void => {
        if (drag?.pointerId !== e.pointerId) return;
        e.preventDefault();
        setNorm(drag.norm + (drag.startY - e.clientY) / 180);
      };
      const up = (e: PointerEvent): void => {
        if (drag?.pointerId !== e.pointerId) return;
        drag = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    trackDown: (event, _ctl, vertical) => {
      if (!named || event.button !== 0) return;
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const move = (e: PointerEvent): void => {
        const norm = vertical ? 1 - (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;
        setNorm(norm);
      };
      move(event);
      const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    valueKey: (event, _ctl, itemId) => {
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const norm = named?.norm ?? 0;
      const step = event.shiftKey ? 0.1 : 0.01;
      let next: number | null = null;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = norm + step;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = norm - step;
      else if (event.key === 'PageUp') next = norm + 0.1;
      else if (event.key === 'PageDown') next = norm - 0.1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 1;
      else if (event.key === 'Enter') {
        event.preventDefault();
        startType(itemId);
        return;
      }
      if (next == null) return;
      event.preventDefault();
      setNorm(next);
    },
    startType: (itemId) => startType(itemId),
    commitType: (itemId) => commitType(itemId),
    cancelType: () => (editingId = null),
    nudge: (_ctl, dir) => {
      if (named) setNorm((named.norm ?? 0) + dir * 0.01);
      else if (dir > 0) cycle();
    },
    toggle: () => cycle(),
    openSelect: () => cycle(),
    bypass: () => {},
    loop: () => {},
    eqSet: () => {},
    hover: () => {},
    unhover: () => {},
    openMod: () => {},
    pinArm: () => {},
    pinPress: () => {},
    pinClick: () => {},
    pinnable: () => false,
    ctxMenu: (event) => {
      event.preventDefault();
      onselect();
    },
    ctxLongPress: () => onselect(),
    ctxKey: () => onselect(),
    resizeDown: () => {}
  };
  setBeHost(host);

  function onPointerDownCapture(event: PointerEvent): void {
    if (!editMode || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    onselect();
    onmove(event);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="aw-widget-host qc-host"
  class:selected
  data-quick-control={info.widgetId}
  data-widget={info.foreign ? undefined : 'axis.paramControl'}
  style:grid-column="{x + 1} / span 2"
  style:grid-row="{y + 1} / span 2"
  onpointerdowncapture={onPointerDownCapture}
>
  <div
    class="axis-widget param"
    data-param-mode="tile"
    data-param-state="live"
    style:--param-color={info.color ?? 'var(--accent)'}
  >
    <span class="axtip">{info.blockLabel} · {info.label}</span>
    <BeControl {item} {ctl} pos={item} {c} {g} {page} />
  </div>
  {#if editMode}
    <div class="aw-widget-drag-surface" aria-hidden="true"></div>
  {/if}
  {#if selected}
    <button class="qc-remove" type="button" data-quick-control-remove title="Remove from Quick Controls" aria-label="Remove {info.label} from Quick Controls" onclick={onremove}>×</button>
  {/if}
</div>

<style>
  .qc-host {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
  }
  .axis-widget.param {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    border: 1px solid transparent;
    border-radius: 9px;
  }
  .axis-widget.param :global(.be-tile) {
    flex: 1;
    border-color: var(--surface2, var(--border));
  }
  /* the block-editor tile's accent follows the block the control came from */
  .axis-widget.param :global(.be-tile.colored) {
    --accent: var(--param-color);
    --accentbright: color-mix(in srgb, var(--param-color) 80%, var(--text));
    --accent-tint: color-mix(in srgb, var(--param-color) 14%, transparent);
    --accent-border: color-mix(in srgb, var(--param-color) 38%, transparent);
  }
  .qc-host.selected .axis-widget.param {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    border-radius: 9px;
  }
  .qc-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    z-index: 9;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--danger-border, var(--border2));
    background: var(--danger-tint, var(--surface));
    color: var(--danger);
    font: 700 12px/1 var(--font-ui);
    cursor: pointer;
  }
  .aw-widget-drag-surface {
    position: absolute;
    inset: 0;
    z-index: 8;
    border-radius: 9px;
    outline: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent);
    outline-offset: -1px;
    pointer-events: none;
  }
  /* The block name + parameter name, for assistive tech and the tooltip tests; the tile itself shows the
     parameter's own label. */
  .axtip {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
