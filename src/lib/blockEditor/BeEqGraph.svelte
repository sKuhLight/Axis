<script lang="ts">
  import EQGraph from '../EQGraph.svelte';
  import type { BlockVisual } from '../types';
  import { fmtCompact } from '../format';
  import { getBeHost } from './beHost';
  import { visualEqBands } from './eqVisual';
  let { visual, edit = false }: { visual: BlockVisual; edit?: boolean } = $props();
  const host = getBeHost();
  const bands = $derived(visualEqBands(visual, host.knob, host.enm));
  const plotBands = $derived(bands.filter((b) => b.freq || b.centerHz != null));
  const gainRange = $derived(Math.max(12, ...bands.flatMap((b) => b.gain ? [Math.abs(b.gain.min ?? 0), Math.abs(b.gain.max ?? 0)] : [])));
</script>
<div class="be-eq-visual" class:edit data-be-eq={visual.key}>
  {#if plotBands.length}
    <div class="plot"><EQGraph bands={plotBands} {gainRange} accent={host.accent} onSet={(p, n) => { if (!edit) host.eqSet(p, n); }} /></div>
  {/if}
  {#if visual.mode === 'graphic'}
    <div class="bands" class:standalone={!plotBands.length}>
      {#each bands as b (b.key)}
        {#if b.gain}
          {@const caption = b.label || (b.centerHz != null ? b.centerHz >= 1000 ? `${b.centerHz / 1000}k` : String(b.centerHz) : b.gain.name)}
          <label><span>{fmtCompact(b.gain)}</span><input aria-label={caption} type="range" min="0" max="1" step="0.001" value={b.gain.norm ?? 0} disabled={edit} oninput={(e) => { if (b.gain) host.eqSet(b.gain, Number(e.currentTarget.value)); }} /><span>{caption}</span></label>
        {/if}
      {/each}
    </div>
  {/if}
</div>
<style>
  .be-eq-visual { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; gap:6px; padding:4px; box-sizing:border-box; }
  .plot { flex:1; min-height:110px; }
  .bands { display:flex; gap:4px; justify-content:space-evenly; min-height:86px; }
  .bands.standalone { flex:1; justify-content:space-evenly; }
  .bands.standalone input { flex:1; min-height:44px; height:0; }
  label { display:flex; flex-direction:column; align-items:center; min-width:0; font:10px var(--font-mono); color:var(--textdim); gap:3px; }
  input { writing-mode:vertical-lr; direction:rtl; width:22px; height:60px; accent-color:var(--c,var(--accent)); }
  .edit { pointer-events:none; }
</style>
