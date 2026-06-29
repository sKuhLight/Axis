<script lang="ts">
  // Foot Controller editor (effectId 199). Renders the device-authentic layout/view/switch grid from
  // the served FC address model and writes edits straight to the FM3 by computing
  //   pid = field.base + config*stride,  config = layout*FM3configsPerLayout(12) + view*switches(3) + switch
  // (the decoded FC address formula — tapCategory verified on-device). Writes use setParam(199, pid, val).
  import { onMount } from 'svelte';
  import { editor } from './editor.svelte';
  import { forgefx } from './forgefx';
  import type { FcModel } from './types';

  const ACC = '#f5a623';
  let model = $state<FcModel | null>(null);
  let err = $state<string | null>(null);
  let layout = $state(0); // 0..8 (8 = Master)
  let view = $state(0); // 0..3
  let sw = $state(0); // 0..(switches-1)
  // local echo of edits (the FC space isn't bulk-readable yet, so we track what we set this session)
  let edits = $state<Record<string, number>>({});

  onMount(async () => {
    try {
      model = await forgefx.fcModel();
      if (!model) err = 'This device has no decoded Foot Controller model yet.';
    } catch (e) {
      err = (e as Error).message;
    }
  });

  const config = $derived(model ? layout * model.configsPerLayout + view * model.switches + sw : 0);
  const switches = $derived(model?.switches ?? 3);
  const catList = $derived(model ? Object.entries(model.categories).map(([v, label]) => ({ v: +v, label })) : []);
  const colorList = $derived(model ? Object.entries(model.colors).map(([v, label]) => ({ v: +v, label })) : []);

  function pid(field: string, cfg = config): number {
    const f = model!.fields[field];
    return f.base + cfg * f.stride;
  }
  const editKey = (field: string, cfg = config) => `${field}:${cfg}`;
  function cur(field: string): number | undefined {
    return edits[editKey(field)];
  }

  async function write(field: string, value: number) {
    if (!model) return;
    edits = { ...edits, [editKey(field)]: value };
    try {
      await forgefx.setParam(model.effectId, pid(field), value, false);
    } catch (e) {
      editor.showToast('Write failed: ' + (e as Error).message, '#ff6b6b');
    }
  }
  // labels are 11 ASCII pids; write each char (zero-padded)
  async function writeLabel(field: string, text: string) {
    if (!model) return;
    edits = { ...edits, [editKey(field)]: text.length }; // mark touched
    const base = pid(field);
    for (let i = 0; i < model.labelLen; i++) {
      const code = i < text.length ? text.charCodeAt(i) : 0;
      try {
        await forgefx.setParam(model.effectId, base + i, code, false);
      } catch {
        /* */
      }
    }
  }

  const layoutLabel = (i: number) => (i === 8 ? 'Master' : String(i + 1));
</script>

<section class="fc" style="--c:{ACC}">
  <header class="fhead">
    <span class="dot"></span>
    <h2>Footswitches</h2>
    <span class="sub mono">FC EDIT · effect 199</span>
    <span class="spacer"></span>
    <button class="back" onclick={() => editor.openBuild()}>← Grid</button>
  </header>

  {#if err}
    <div class="msg">{err}</div>
  {:else if !model}
    <div class="msg">Loading Foot Controller model…</div>
  {:else}
    <div class="body">
      <!-- layouts -->
      <div class="row">
        <span class="rlbl">LAYOUT</span>
        {#each Array(model.layouts) as _, i (i)}
          <button class="chip" class:on={layout === i} onclick={() => (layout = i)}>{layoutLabel(i)}</button>
        {/each}
      </div>
      <!-- views -->
      <div class="row">
        <span class="rlbl">VIEW</span>
        {#each Array(model.views) as _, i (i)}
          <button class="chip mini" class:on={view === i} onclick={() => (view = i)}>{i + 1}</button>
        {/each}
      </div>

      <!-- switch board -->
      <div class="board" style="grid-template-columns:repeat({switches},1fr)">
        {#each Array(switches) as _, i (i)}
          {@const c = layout * model.configsPerLayout + view * model.switches + i}
          {@const catV = edits[`tapCategory:${c}`]}
          <button class="swtile" class:on={sw === i} onclick={() => (sw = i)}>
            <span class="led" style="background:{ACC}"></span>
            <span class="swnum mono">{i + 1}</span>
            <span class="swcat">{catV != null ? (model.categories[catV] ?? 'Cat ' + catV) : '—'}</span>
          </button>
        {/each}
      </div>

      <!-- inspector for the selected switch -->
      <div class="insp">
        <div class="ititle mono">SWITCH {sw + 1} · {layoutLabel(layout)} · View {view + 1} <span class="cfg">config {config}</span></div>

        <div class="field">
          <label for="fc-cat">Tap Category</label>
          <select id="fc-cat" value={cur('tapCategory') ?? ''} onchange={(e) => write('tapCategory', +e.currentTarget.value)}>
            <option value="" disabled>—</option>
            {#each catList as c (c.v)}<option value={c.v}>{c.label}</option>{/each}
          </select>
        </div>

        <div class="field">
          <span class="flbl">Color</span>
          <div class="colors">
            {#each colorList as c (c.v)}
              <button class="csw" class:on={cur('color') === c.v} title={c.label} style="background:#1f5fd0" onclick={() => write('color', c.v)}>{c.label}</button>
            {/each}
            {#if !colorList.length}<span class="hint">colour ordinals partial</span>{/if}
          </div>
        </div>

        <div class="field">
          <label for="fc-lbl">Custom Label (TAP)</label>
          <input id="fc-lbl" maxlength={model.labelLen} placeholder="≤{model.labelLen} chars" onchange={(e) => writeLabel('tapLabel', e.currentTarget.value)} />
        </div>

        <p class="note">Edits write to the FM3 immediately. Reading current state back is pending (FC space isn't bulk-readable yet), so only changes made here are reflected.</p>
      </div>
    </div>
  {/if}
</section>

<style>
  .fc {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .fhead {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line, #2a2a32);
  }
  .fhead h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
  }
  .sub {
    font-size: 11px;
    color: #8a8a93;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .spacer {
    flex: 1;
  }
  .back {
    background: transparent;
    border: 1px solid var(--line, #2a2a32);
    color: var(--text);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .back:hover {
    border-color: var(--c);
    color: var(--c);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
  }
  .rlbl {
    font: 700 10px/1 ui-monospace, monospace;
    color: #6e6e78;
    letter-spacing: 0.08em;
    width: 54px;
  }
  .chip {
    min-width: 34px;
    height: 32px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid #2a2a31;
    background: #16161b;
    color: #b8b8c0;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
  }
  .chip.mini {
    min-width: 32px;
    padding: 0;
  }
  .chip.on {
    background: var(--c);
    border-color: var(--c);
    color: #1c1206;
  }
  .board {
    display: grid;
    gap: 12px;
    max-width: 640px;
  }
  .swtile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 92px;
    padding: 16px 13px 12px;
    border-radius: 14px;
    border: 1px solid #28282f;
    background: linear-gradient(180deg, #181820, #121217);
    cursor: pointer;
    text-align: left;
  }
  .swtile.on {
    border-color: var(--c);
    box-shadow: 0 0 0 1px var(--c);
  }
  .led {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    border-radius: 14px 14px 0 0;
  }
  .swnum {
    position: absolute;
    top: 9px;
    right: 11px;
    font-size: 10px;
    color: #6e6e78;
  }
  .swcat {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }
  .insp {
    border-top: 1px solid #1c1c22;
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 520px;
  }
  .ititle {
    font-size: 11px;
    color: #cfcfd6;
    letter-spacing: 0.04em;
  }
  .cfg {
    color: #56565e;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field label,
  .flbl {
    font-size: 12px;
    color: #8a8a93;
  }
  select,
  input {
    height: 36px;
    background: #0d0d10;
    border: 1px solid #2a2a31;
    border-radius: 9px;
    color: #e7e7ee;
    padding: 0 11px;
    font-size: 13px;
    font-family: inherit;
  }
  select:focus,
  input:focus {
    border-color: var(--c);
    outline: none;
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .csw {
    height: 30px;
    padding: 0 11px;
    border-radius: 8px;
    border: 2px solid transparent;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .csw.on {
    border-color: #fff;
    box-shadow: 0 0 0 2px var(--c);
  }
  .note {
    font-size: 11.5px;
    color: #6e6e78;
    line-height: 1.5;
    margin: 0;
  }
  .msg {
    flex: 1;
    display: grid;
    place-items: center;
    color: #8a8a93;
    font-size: 14px;
    padding: 24px;
    text-align: center;
  }
  .hint {
    font-size: 11px;
    color: #6e6e78;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
