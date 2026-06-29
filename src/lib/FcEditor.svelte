<script lang="ts">
  // Foot Controller editor (effectId 199). Device-authentic layout/view/switch grid from the served
  // FC address model; writes by computing pid = field.base + config*stride (+index for value/label
  // blocks), config = layout*12 + view*3 + switch. tapCategory formula is device-verified; the field
  // structure + enum vocabularies (categories 0-13, colors 1-12, label modes 0-2) are cache/capture
  // confirmed. Per-category FUNCTION lists + the 6 value-slot meanings are still being mined from the
  // editor decompile — until then Function/Value are raw numeric fields.
  import { onMount } from 'svelte';
  import { editor } from './editor.svelte';
  import { forgefx } from './forgefx';
  import type { FcModel } from './types';

  const ACC = '#f5a623';
  let model = $state<FcModel | null>(null);
  let err = $state<string | null>(null);
  let layout = $state(0);
  let view = $state(0);
  let sw = $state(0);
  let edits = $state<Record<string, number>>({}); // local echo (FC space not bulk-readable yet)

  onMount(async () => {
    try {
      model = await forgefx.fcModel();
      if (!model) err = 'This device has no decoded Foot Controller model yet.';
    } catch (e) {
      err = (e as Error).message;
    }
  });

  const switches = $derived(model?.switches ?? 3);
  const config = $derived(model ? layout * model.configsPerLayout + view * model.switches + sw : 0);
  const catList = $derived(model ? Object.entries(model.categories).map(([v, label]) => ({ v: +v, label })).sort((a, b) => a.v - b.v) : []);
  const colorList = $derived(model ? Object.entries(model.colors).map(([v, c]) => ({ v: +v, ...c })).sort((a, b) => a.v - b.v) : []);

  function pidOf(field: string, cfg = config, index = 0): number {
    const f = model!.fields[field];
    return f.base + cfg * f.stride + index;
  }
  const ek = (field: string, cfg = config) => `${field}:${cfg}`;
  const cur = (field: string, cfg = config) => edits[ek(field, cfg)];

  async function write(field: string, value: number, cfg = config, index = 0) {
    if (!model) return;
    if (index === 0) edits = { ...edits, [ek(field, cfg)]: value };
    try {
      await forgefx.setParam(model.effectId, pidOf(field, cfg, index), value, false);
    } catch (e) {
      editor.showToast('Write failed: ' + (e as Error).message, '#ff6b6b');
    }
  }
  async function writeLabel(field: string, text: string) {
    if (!model) return;
    edits = { ...edits, [ek(field)]: text.length };
    const base = pidOf(field);
    for (let i = 0; i < model.labelLen; i++) {
      try {
        await forgefx.setParam(model.effectId, base + i, i < text.length ? text.charCodeAt(i) : 0, false);
      } catch {
        /* */
      }
    }
  }
  const layoutLabel = (i: number) => (i === 8 ? 'Master' : String(i + 1));
  const catName = (v: number | undefined) => (v != null ? (model?.categories[String(v)] ?? 'Cat ' + v) : '—');

  // ── function model: the selected function for a side drives its value-slots + label options ──
  const labelModeFallback = $derived(model ? Object.entries(model.labelModes).map(([, l]) => l) : []);
  function funcsFor(side: string) {
    const cat = cur(side + 'Category');
    return cat != null ? (model?.functions[String(cat)] ?? []) : [];
  }
  function fnDefFor(side: string) {
    const sel = cur(side + 'Function') ?? 0;
    return funcsFor(side).find((f) => f.ord === sel);
  }
  const slotKey = (side: string, i: number) => `${side}Params#${i}:${config}`;
  const curSlot = (side: string, i: number) => edits[slotKey(side, i)];
  async function writeSlot(side: string, i: number, value: number) {
    if (!model) return;
    edits = { ...edits, [slotKey(side, i)]: value };
    try {
      await forgefx.setParam(model.effectId, pidOf(side + 'Params', config, i), value, false);
    } catch (e) {
      editor.showToast('Write failed: ' + (e as Error).message, '#ff6b6b');
    }
  }
  // changing category also resets the function to 0 (matches the editor)
  async function setCategory(side: string, v: number) {
    await write(side + 'Category', v);
    await write(side + 'Function', 0);
  }
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
      <div class="row">
        <span class="rlbl">LAYOUT</span>
        {#each Array(model.layouts) as _, i (i)}
          <button class="chip" class:on={layout === i} onclick={() => (layout = i)}>{layoutLabel(i)}</button>
        {/each}
      </div>
      <div class="row">
        <span class="rlbl">VIEW</span>
        {#each Array(model.views) as _, i (i)}
          <button class="chip mini" class:on={view === i} onclick={() => (view = i)}>{i + 1}</button>
        {/each}
      </div>

      <div class="board" style="grid-template-columns:repeat({switches},1fr)">
        {#each Array(switches) as _, i (i)}
          {@const cfg = layout * model.configsPerLayout + view * model.switches + i}
          {@const col = colorList.find((x) => x.v === cur('color', cfg))?.hex ?? ACC}
          <button class="swtile" class:on={sw === i} onclick={() => (sw = i)}>
            <span class="led" style="background:{col}"></span>
            <span class="swnum mono">{i + 1}</span>
            <span class="swcat">{catName(cur('tapCategory', cfg))}</span>
            <span class="swhold mono">HOLD · {catName(cur('holdCategory', cfg))}</span>
          </button>
        {/each}
      </div>

      <div class="insp">
        <div class="ititle mono">SWITCH {sw + 1} · {layoutLabel(layout)} · View {view + 1} <span class="cfg">config {config}</span></div>

        {#snippet actionCol(side: string, badge: string, badgeClass: string)}
          {@const fns = funcsFor(side)}
          {@const fnSel = cur(side + 'Function') ?? 0}
          {@const fnDef = fnDefFor(side)}
          {@const labels = fnDef?.labels?.length ? fnDef.labels : labelModeFallback}
          <div class="actcol">
            <div class="ahdr"><span class="abadge {badgeClass}">{badge}</span></div>
            <div class="field">
              <span class="flbl">Category</span>
              <select value={cur(side + 'Category') ?? ''} onchange={(e) => setCategory(side, +e.currentTarget.value)}>
                <option value="" disabled>—</option>
                {#each catList as c (c.v)}<option value={c.v}>{c.label}</option>{/each}
              </select>
            </div>
            <div class="field">
              <span class="flbl">Function {#if !fns.length}<span class="todo">raw</span>{/if}</span>
              {#if fns.length}
                <select value={fnSel} onchange={(e) => write(side + 'Function', +e.currentTarget.value)}>
                  {#each fns as f (f.ord)}<option value={f.ord}>{f.name}</option>{/each}
                </select>
              {:else}
                <input type="number" min="0" value={cur(side + 'Function') ?? 0} onchange={(e) => write(side + 'Function', +e.currentTarget.value)} />
              {/if}
            </div>
            {#if fnDef}
              {#each fnDef.slots as slot (slot.i)}
                <div class="field">
                  <span class="flbl">{slot.role}</span>
                  {#if slot.type === 'bool'}
                    <select value={curSlot(side, slot.i) ?? 0} onchange={(e) => writeSlot(side, slot.i, +e.currentTarget.value)}>
                      <option value={0}>Off</option><option value={1}>On</option>
                    </select>
                  {:else if slot.type === 'enum'}
                    <select value={curSlot(side, slot.i) ?? 0} onchange={(e) => writeSlot(side, slot.i, +e.currentTarget.value)}>
                      {#each slot.options ?? [] as opt, oi (oi)}<option value={oi}>{opt}</option>{/each}
                    </select>
                  {:else if slot.type === 'channel'}
                    <select value={curSlot(side, slot.i) ?? 0} onchange={(e) => writeSlot(side, slot.i, +e.currentTarget.value)}>
                      {#each model!.channels as ch, ci (ci)}<option value={ci}>{ch}</option>{/each}
                    </select>
                  {:else}
                    <input
                      type="number"
                      min={slot.min}
                      max={slot.max}
                      value={curSlot(side, slot.i) ?? slot.min ?? 0}
                      onchange={(e) => writeSlot(side, slot.i, +e.currentTarget.value)}
                    />
                    {#if slot.type === 'block'}<span class="hint">block id</span>{/if}
                  {/if}
                </div>
              {/each}
            {:else}
              <div class="field">
                <span class="flbl">Value <span class="todo">raw</span></span>
                <input type="number" min="0" onchange={(e) => writeSlot(side, 0, +e.currentTarget.value)} />
              </div>
            {/if}
            <div class="field">
              <span class="flbl">Label</span>
              <select value={cur(side + 'Display') ?? ''} onchange={(e) => write(side + 'Display', +e.currentTarget.value)}>
                <option value="" disabled>—</option>
                {#each labels as lab, li (li)}<option value={li}>{lab}</option>{/each}
              </select>
            </div>
            <div class="field">
              <span class="flbl">Custom Label</span>
              <input maxlength={model!.labelLen} placeholder="≤{model!.labelLen} chars" onchange={(e) => writeLabel(side + 'Label', e.currentTarget.value)} />
            </div>
          </div>
        {/snippet}

        <div class="cols">
          {@render actionCol('tap', 'TAP', 'tap')}
          {@render actionCol('hold', 'HOLD', 'hold')}
        </div>

        <!-- color -->
        <div class="field">
          <span class="flbl">Color</span>
          <div class="colors">
            {#each colorList as c (c.v)}
              <button class="csw" class:on={cur('color') === c.v} title={c.name} style="background:{c.hex}" onclick={() => write('color', c.v)} aria-label={c.name}></button>
            {/each}
          </div>
        </div>

        <p class="note">Edits write to the FM3 immediately. Bank/Preset/Scene/Effect are fully modelled (function + typed value-slots); other categories show raw fields until decoded. State read-back is pending (FC space isn't bulk-readable yet).</p>
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
    max-width: 700px;
  }
  .swtile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 96px;
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
  .swhold {
    font-size: 10px;
    color: #7e7e88;
  }
  .insp {
    border-top: 1px solid #1c1c22;
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 620px;
  }
  .ititle {
    font-size: 11px;
    color: #cfcfd6;
    letter-spacing: 0.04em;
  }
  .cfg {
    color: #56565e;
  }
  .cols {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .actcol {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ahdr {
    display: flex;
    align-items: center;
  }
  .abadge {
    font: 700 10px/1 ui-monospace, monospace;
    letter-spacing: 0.1em;
    padding: 4px 8px;
    border-radius: 6px;
  }
  .abadge.tap {
    background: #1d2a2c;
    color: #7fd8de;
  }
  .abadge.hold {
    background: #2a2212;
    color: #f5c518;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .flbl {
    font-size: 12px;
    color: #8a8a93;
  }
  .todo {
    font-size: 9px;
    color: #6e6e78;
    border: 1px solid #2a2a31;
    border-radius: 4px;
    padding: 1px 4px;
  }
  select,
  input {
    height: 34px;
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
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 2px solid transparent;
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
    max-width: 620px;
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
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
