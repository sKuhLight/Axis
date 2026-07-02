<script lang="ts">
  import type { NamedParam } from './types';
  import { fmtCompact } from './format';

  // Vertical gain faders per band — the classic graphic-EQ view (alternative to the graph).
  interface FB {
    key: string;
    label: string;
    gain: NamedParam;
  }
  let { bands, accent = '#35c9d6', onSet }: { bands: FB[]; accent?: string; onSet: (p: NamedParam, norm: number) => void } = $props();

  let drag: { p: NamedParam; el: HTMLElement } | null = null;
  function down(e: PointerEvent, p: NamedParam) {
    e.preventDefault();
    drag = { p, el: e.currentTarget as HTMLElement };
    move(e);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const r = drag.el.getBoundingClientRect();
    onSet(drag.p, Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)));
  }
  function up() {
    drag = null;
  }
</script>

<svelte:window onpointermove={move} onpointerup={up} />
<div class="bank scroll">
  {#each bands as b (b.key)}
    <div class="col">
      <div class="v mono">{fmtCompact(b.gain)}</div>
      <div class="track" style="--c:{accent}" role="slider" aria-label={b.label} aria-valuenow={Math.round((b.gain.norm ?? 0) * 100)} tabindex="0" onpointerdown={(e) => down(e, b.gain)}>
        <div class="fill" style="height:{Math.round((b.gain.norm ?? 0) * 100)}%"></div>
        <div class="handle" style="bottom:calc({Math.round((b.gain.norm ?? 0) * 100)}% - 7px)"></div>
      </div>
      <div class="lbl">{b.label}</div>
    </div>
  {/each}
</div>

<style>
  .bank {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 8px 2px;
    align-items: stretch;
    justify-content: space-between;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 40px;
  }
  .v {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
  }
  .track {
    position: relative;
    width: 18px;
    height: 150px;
    border-radius: 8px;
    background: var(--track);
    border: 1px solid var(--border);
    cursor: ns-resize;
    touch-action: none;
  }
  .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 8px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c));
  }
  .handle {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 26px;
    height: 14px;
    border-radius: 5px;
    background: var(--amber);
    border: 3px solid var(--bg2);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  }
  .lbl {
    font: 600 9px/1.1 var(--font-mono);
    color: var(--textdim);
    text-align: center;
    white-space: nowrap;
  }
</style>
