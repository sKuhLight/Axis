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

  const ACC = 'var(--amber)'; // FC accent follows the theme's amber token
  let model = $state<FcModel | null>(null);
  let err = $state<string | null>(null);
  let layout = $state(0);
  let view = $state(0);
  let sw = $state(0);
  let edits = $state<Record<string, number>>({}); // field ordinals (read from unit + written this session)
  let labelText = $state<Record<string, string>>({}); // decoded label text, keyed `${side}Label:${config}`
  // Device read-back via the sub-0x1b value channel (GET /fc/state → Device.fcReadState). It returns the
  // live ordinals (category/function/display/color) + decoded label text per switch — the channel that
  // actually tracks param edits — so we populate cur()/labels from it and the controls reflect the unit.
  // `present` flags a switch as configured (its category is not Unassigned).
  let present = $state<Record<number, boolean>>({});
  let reading = $state(false);

  onMount(async () => {
    try {
      model = await forgefx.fcModel();
      if (!model) err = 'This device has no decoded Foot Controller model yet.';
    } catch (e) {
      err = (e as Error).message;
    }
  });

  // Read the live device state for the switches of the current layout+view, so each tile can flag
  // whether the unit actually has that switch configured. Fields stay blank until edited (see note).
  async function loadState() {
    if (!model || !model.liveState) return; // live per-switch read is FM3-only
    reading = true;
    try {
      const n = model.switches ?? 0;
      const states = await Promise.all(
        Array.from({ length: n }, (_, i) => forgefx.fcState(layout, view, i).catch(() => null))
      );
      const e = { ...edits };
      const lb = { ...labelText };
      const pr = { ...present };
      states.forEach((s) => {
        if (!s) return;
        const c = s.config;
        for (const [f, v] of Object.entries(s.fields)) if (v != null) e[`${f}:${c}`] = v;
        lb[`tapLabel:${c}`] = s.tapLabel;
        lb[`holdLabel:${c}`] = s.holdLabel;
        // configured on the unit = either side has a real (non-Unassigned) category
        pr[c] = (s.fields.tapCategory ?? 0) !== 0 || (s.fields.holdCategory ?? 0) !== 0;
      });
      edits = e;
      labelText = lb;
      present = pr;
    } catch (e) {
      editor.showToast('FC read failed: ' + (e as Error).message, '#ff6b6b');
    } finally {
      reading = false;
    }
  }
  $effect(() => {
    // re-read whenever the model loads or the layout/view changes
    if (model) {
      void layout;
      void view;
      loadState();
    }
  });

  const switches = $derived(model?.switches ?? 3);
  // on mobile the fixed N-column board gets cramped; wrap into readable min-width tiles instead
  const boardCols = $derived(editor.isMobile ? 'repeat(auto-fill, minmax(150px, 1fr))' : `repeat(${switches}, 1fr)`);
  const config = $derived(model ? layout * (model.configsPerLayout ?? 0) + view * (model.switches ?? 0) + sw : 0);
  const catList = $derived(model ? Object.entries(model.categories ?? {}).map(([v, label]) => ({ v: +v, label })).sort((a, b) => a.v - b.v) : []);
  const colorList = $derived(model ? Object.entries(model.colors ?? {}).map(([v, c]) => ({ v: +v, ...c })).sort((a, b) => a.v - b.v) : []);

  function pidOf(field: string, cfg = config, index = 0): number {
    const f = model!.fields[field];
    return (f?.base ?? 0) + cfg * (f?.stride ?? 0) + index;
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
  // Custom-label display-mode ordinal (capture-confirmed = 2). A switch only renders custom text when
  // its display mode is "Custom"; FM3-Edit sets that mode alongside the chars, so we do too — otherwise
  // the characters are stored but never shown.
  const customMode = $derived(model ? +(Object.entries(model.labelModes ?? {}).find(([, v]) => v === 'Custom')?.[0] ?? 2) : 2);
  async function writeLabel(field: string, text: string) {
    if (!model) return;
    edits = { ...edits, [ek(field)]: text.length };
    labelText = { ...labelText, [ek(field)]: text };
    const base = pidOf(field);
    for (let i = 0; i < (model.labelLen ?? 0); i++) {
      try {
        // each char is its own SET: pid = labelBase + i, value = float32(ASCII code), 0-padded
        await forgefx.setParam(model.effectId, base + i, i < text.length ? text.charCodeAt(i) : 0, false);
      } catch {
        /* */
      }
    }
    // put the switch into Custom display mode so the text actually shows (the side is the field prefix)
    if (text.length) await write(field.replace(/Label$/, 'Display'), customMode);
  }
  const layoutLabel = (i: number) => (i === 8 ? 'Master' : String(i + 1));
  const catName = (v: number | undefined) => (v != null ? (model?.categories?.[String(v)] ?? 'Cat ' + v) : '—');

  // ── function model: the selected function for a side drives its value-slots + label options ──
  const labelModeFallback = $derived(model ? Object.entries(model.labelModes ?? {}).map(([, l]) => l) : []);
  function funcsFor(side: string) {
    const cat = cur(side + 'Category');
    return cat != null ? (model?.functions?.[String(cat)] ?? []) : [];
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

  // Nav setters. Live FC read-back uses the sub-0x01 structured config-selector read (GET /fc/state):
  // it confirms which switch slots are configured on the unit (the `present` map drives the tile
  // badge). Field-value read-back (category/value/label) awaits a decode of the structured record's
  // interior bytes — until then those controls stay blank-until-edited, by design.
  const selLayout = (i: number) => (layout = i);
  const selView = (i: number) => (view = i);
  const selSwitch = (i: number) => (sw = i);
  const onDevice = (cfg: number) => !!present[cfg];
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
  {:else if !model.liveState}
    <div class="msg">
      <p><b>Foot Controller address model available</b> — effect {model.effectId}, {model.configs} configs,
        {Object.keys(model.fields).length} param-base fields.</p>
      <p>Live per-switch editing here is <b>FM3-only</b>: this device's (layout, view, switch) decomposition
        and label/LED-colour bases aren't statically recovered yet. FC parameters can still be written via the
        normal parameter path using the bases above.</p>
    </div>
  {:else}
    <div class="body">
      <div class="row">
        <span class="rlbl">LAYOUT</span>
        {#each Array(model.layouts) as _, i (i)}
          <button class="chip" class:on={layout === i} onclick={() => selLayout(i)}>{layoutLabel(i)}</button>
        {/each}
      </div>
      <div class="row">
        <span class="rlbl">VIEW</span>
        {#each Array(model.views) as _, i (i)}
          <button class="chip mini" class:on={view === i} onclick={() => selView(i)}>{i + 1}</button>
        {/each}
      </div>

      <div class="board" style="grid-template-columns:{boardCols}">
        {#each Array(switches) as _, i (i)}
          {@const cfg = layout * (model.configsPerLayout ?? 0) + view * (model.switches ?? 0) + i}
          {@const col = colorList.find((x) => x.v === cur('color', cfg))?.hex ?? ACC}
          <button class="swtile" class:on={sw === i} onclick={() => selSwitch(i)}>
            <span class="led" style="background:{col}"></span>
            <span class="swnum mono">{i + 1}</span>
            {#if onDevice(cfg)}
              <span class="ondev mono" title="Configured on the device (live read)">●&nbsp;on unit</span>
            {/if}
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
              <input maxlength={model!.labelLen} placeholder="≤{model!.labelLen} chars" value={labelText[ek(side + 'Label')] ?? ''} onchange={(e) => writeLabel(side + 'Label', e.currentTarget.value)} />
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

        <p class="note">
          Edits write to the FM3 immediately. Bank/Preset/Scene/Effect are fully modelled (function +
          typed value-slots); other categories show raw fields until decoded. A live read of the unit
          {#if reading}is in progress…{:else}flags which switches are configured on the device (the
          “on unit” badge){/if}; per-field value read-back (category/value/label) awaits a decode of the
          structured read's interior bytes.
        </p>
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
    border-bottom: 1px solid var(--line, var(--border2));
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
    color: var(--textdim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .spacer {
    flex: 1;
  }
  .back {
    background: transparent;
    border: 1px solid var(--line, var(--border2));
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
    color: var(--textfaint);
    letter-spacing: 0.08em;
    width: 54px;
  }
  .chip {
    min-width: 34px;
    height: 32px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid var(--border2);
    background: var(--track);
    color: var(--text2);
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
    color: var(--bg2);
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
    border: 1px solid var(--border2);
    background: linear-gradient(180deg, var(--surface2), var(--surface));
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
    color: var(--textfaint);
  }
  .ondev {
    position: absolute;
    top: 9px;
    left: 11px;
    font-size: 9px;
    color: var(--ok);
    letter-spacing: 0.02em;
  }
  .swcat {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }
  .swhold {
    font-size: 10px;
    color: var(--textfaint);
  }
  .insp {
    border-top: 1px solid var(--surface2);
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 620px;
  }
  .ititle {
    font-size: 11px;
    color: var(--text2);
    letter-spacing: 0.04em;
  }
  .cfg {
    color: var(--textmuted);
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
    background: var(--accent-tint);
    color: var(--accentbright);
  }
  .abadge.hold {
    background: var(--surface2);
    color: var(--amber);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .flbl {
    font-size: 12px;
    color: var(--textdim);
  }
  .todo {
    font-size: 9px;
    color: var(--textfaint);
    border: 1px solid var(--border2);
    border-radius: 4px;
    padding: 1px 4px;
  }
  select,
  input {
    height: 34px;
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 9px;
    color: var(--text);
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
    border-color: var(--border3);
    box-shadow: 0 0 0 2px var(--c);
  }
  .note {
    font-size: 11.5px;
    color: var(--textfaint);
    line-height: 1.5;
    margin: 0;
    max-width: 620px;
  }
  .msg {
    flex: 1;
    display: grid;
    place-items: center;
    color: var(--textdim);
    font-size: 14px;
    padding: 24px;
    text-align: center;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
