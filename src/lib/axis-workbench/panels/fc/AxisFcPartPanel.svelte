<script lang="ts">
  import { onMount } from 'svelte';
  import FcEditor from '../../../FcEditor.svelte';
  import type { PanelInstance } from '../../../workbench';
  import { bindAxisRuntimeHost } from '../../runtimeBinding';
  import type { AxisFcSide } from '../../fc/fcWorkbenchData';
  import { createAxisFcWorkbenchHost } from '../../fc/fcWorkbenchHost';
  import { axisFcPartFromPanelType, parseAxisFcPart, type AxisFcPart } from '../../fc/types';
  import { axisFcWorkbenchController, type AxisFcControllerSnapshot } from '../../fc/fcWorkbenchController';
  import {
    axisFcWorkbenchRuntime,
    type AxisFcRuntimeSnapshot
  } from '../../fc/fcWorkbenchRuntime';

  let { panel }: { panel: PanelInstance } = $props();
  let snapshot = $state<AxisFcControllerSnapshot>(axisFcWorkbenchController.snapshot);
  let runtimeSnapshot = $state<AxisFcRuntimeSnapshot>(axisFcWorkbenchRuntime.snapshot);
  let lastReadKey = '';
  const part = $derived<AxisFcPart>(parseAxisFcPart(panel.state?.part, axisFcPartFromPanelType(panel.type)));
  const data = $derived(axisFcWorkbenchRuntime.viewFor(snapshot));

  onMount(() => {
    return bindAxisRuntimeHost({
      runtime: axisFcWorkbenchRuntime,
      host: createAxisFcWorkbenchHost(),
      onSnapshot: (next) => (runtimeSnapshot = next),
      start: async () => {
        await axisFcWorkbenchRuntime.loadModel();
      }
    });
  });

  $effect(() => {
    axisFcWorkbenchController.setPart(part);
  });

  $effect(() => axisFcWorkbenchController.subscribe((next) => (snapshot = next)));

  $effect(() => {
    const key = `${runtimeSnapshot.model?.liveState}:${part}:${snapshot.layout}:${snapshot.view}:${snapshot.switchIndex ?? 'none'}`;
    if (!runtimeSnapshot.model?.liveState || part === 'full' || key === lastReadKey) return;
    lastReadKey = key;
    void axisFcWorkbenchRuntime.readSelection(snapshot);
  });

  function selectSide(side: AxisFcSide) {
    axisFcWorkbenchController.selectSide(side);
  }

  function selectSwitch(index: number) {
    axisFcWorkbenchController.selectSwitch(index, snapshot.side);
  }

  function fieldValue(field: string) {
    return runtimeSnapshot.edits[`${field}:${data.selectedConfig}`] ?? '';
  }

  function slotValue(side: AxisFcSide, slotIndex: number) {
    return runtimeSnapshot.edits[`${side}Params#${slotIndex}:${data.selectedConfig}`] ?? '';
  }

  function labelValue(side: AxisFcSide) {
    return runtimeSnapshot.labelText[`${side}Label:${data.selectedConfig}`] ?? '';
  }

  function numberFromInput(event: Event) {
    return +(event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
  }

  function textFromInput(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }
</script>

{#if part === 'full'}
  <div class="axis-pane-fill">
    <FcEditor />
  </div>
{:else}
  <section class="axis-part-pane" data-part={part}>
    <header>
      <span>Foot Controller</span>
      <strong>{part}</strong>
    </header>

    {#if runtimeSnapshot.error}
      <div class="axis-part-empty">
        <strong>FC model unavailable</strong>
        <span>{runtimeSnapshot.error}</span>
      </div>
    {:else if !data.ready || runtimeSnapshot.loading}
      <div class="axis-part-empty">
        <strong>Loading FC model</strong>
        <span>Reading Foot Controller address model</span>
      </div>
    {:else if part === 'layouts'}
      <div class="axis-layouts">
        {#if data.layouts.length}
          {#each data.layouts as layout}
            <button type="button" class:active={layout.active} onclick={() => axisFcWorkbenchController.selectLayout(layout.index)}>
              <span>{layout.label}</span>
              <em>Layout</em>
            </button>
          {/each}
        {:else}
          {#each data.configs.slice(0, 64) as config}
            <button type="button" class:active={config.active} onclick={() => axisFcWorkbenchController.selectSwitch(config.index)}>
              <span>{config.label}</span>
              <em>Config</em>
            </button>
          {/each}
        {/if}
      </div>
    {:else if part === 'board'}
      {#if data.views.length > 1}
        <div class="axis-view-row">
          {#each data.views as view}
            <button type="button" class:active={view.active} onclick={() => axisFcWorkbenchController.selectView(view.index)}>{view.label}</button>
          {/each}
        </div>
      {/if}
      {#if data.switches.length}
        <div class="axis-switch-board">
          {#each data.switches as sw}
            <button type="button" class:active={sw.active} onclick={() => selectSwitch(sw.index)}>
              <span>{sw.label}</span>
              <strong>Config {sw.config}</strong>
            </button>
          {/each}
        </div>
      {:else}
        <div class="axis-part-empty">
          <strong>Flat FC config space</strong>
          <span>Select configs in the layouts pane</span>
        </div>
      {/if}
    {:else if part === 'tap' || part === 'hold'}
      <div class="axis-side-switch">
        <button type="button" class:active={snapshot.side === 'tap'} onclick={() => selectSide('tap')}>Tap</button>
        <button type="button" class:active={snapshot.side === 'hold'} onclick={() => selectSide('hold')}>Hold</button>
      </div>
      {@const side = data.sides.find((item) => item.side === part)}
      <div class="axis-side-summary">
        <strong>{part.toUpperCase()} side</strong>
        <span>Switch {data.selectedSwitch == null ? 'none' : data.selectedSwitch + 1} · Config {data.selectedConfig}</span>
        {#if side}
          <dl>
            <div><dt>Categories</dt><dd>{side.categoryCount}</dd></div>
            <div><dt>Functions</dt><dd>{side.functionCount}</dd></div>
            <div><dt>Value slots</dt><dd>{side.slotCount}</dd></div>
            <div><dt>Label modes</dt><dd>{side.labelModeCount}</dd></div>
          </dl>
          <div class="axis-edit-fields">
            <label>
              <span>Category</span>
              {#if runtimeSnapshot.model?.categories}
                <select value={fieldValue(`${part}Category`)} onchange={(event) => axisFcWorkbenchRuntime.setCategory(part, numberFromInput(event), data.selectedConfig)}>
                  <option value="" disabled>—</option>
                  {#each Object.entries(runtimeSnapshot.model.categories) as [value, label] (value)}
                    <option value={value}>{label}</option>
                  {/each}
                </select>
              {:else}
                <input type="number" value={fieldValue(`${part}Category`)} onchange={(event) => axisFcWorkbenchRuntime.setCategory(part, numberFromInput(event), data.selectedConfig)} />
              {/if}
            </label>
            <label>
              <span>Function</span>
              <input type="number" value={fieldValue(`${part}Function`)} onchange={(event) => axisFcWorkbenchRuntime.writeField(`${part}Function`, numberFromInput(event), data.selectedConfig)} />
            </label>
            <label>
              <span>Custom Label</span>
              <input maxlength={runtimeSnapshot.model?.labelLen ?? undefined} value={labelValue(part)} onchange={(event) => axisFcWorkbenchRuntime.writeLabel(part, textFromInput(event), data.selectedConfig)} />
            </label>
            {#each Array(side.slotCount) as _, index}
              <label>
                <span>Value {index + 1}</span>
                <input type="number" value={slotValue(part, index)} onchange={(event) => axisFcWorkbenchRuntime.writeSlot(part, index, numberFromInput(event), data.selectedConfig)} />
              </label>
            {/each}
          </div>
        {/if}
      </div>
    {:else if part === 'led'}
      {#if data.colors.length}
        <div class="axis-led-grid">
          {#each data.colors as color}
            <button type="button" title={color.name} onclick={() => axisFcWorkbenchRuntime.writeField('color', color.value, data.selectedConfig)}>
              <span style={`background:${color.hex}`}></span>
              <strong>{color.name}</strong>
              <em>{color.value}</em>
            </button>
          {/each}
        </div>
      {:else}
        <div class="axis-part-empty">
          <strong>No LED color metadata</strong>
          <span>{data.note}</span>
        </div>
      {/if}
    {:else if part === 'inspector'}
      <div class="axis-inspector">
        <strong>{data.selectedSwitch == null ? 'No switch selected' : `Switch ${data.selectedSwitch + 1}`}</strong>
        <span>Layout {data.selectedLayout + 1} · View {data.selectedView + 1} · Config {data.selectedConfig}</span>
        <p>{runtimeSnapshot.reading ? 'Reading current FC switch state...' : data.note}</p>
        {#if runtimeSnapshot.present[data.selectedConfig]}
          <em class="axis-present">Configured on unit</em>
        {/if}
        <div class="axis-side-switch">
          <button type="button" class:active={snapshot.side === 'tap'} onclick={() => selectSide('tap')}>Tap</button>
          <button type="button" class:active={snapshot.side === 'hold'} onclick={() => selectSide('hold')}>Hold</button>
        </div>
      </div>
    {/if}
  </section>
{/if}

<style>
  .axis-pane-fill {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
    background: var(--bg);
  }
  .axis-part-pane {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    overflow: auto;
    background: var(--bg);
    color: var(--text2);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  header strong {
    color: var(--accent);
  }
  .axis-side-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .axis-view-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .axis-view-row button {
    width: 34px;
  }
  .axis-layouts,
  .axis-switch-board,
  .axis-led-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(94px, 1fr));
    gap: 8px;
  }
  button {
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text2);
    cursor: pointer;
    font: 700 12px/1 var(--font-ui);
  }
  .axis-layouts button,
  .axis-switch-board button,
  .axis-led-grid button {
    min-height: 58px;
    height: auto;
    display: grid;
    place-items: center;
    gap: 4px;
    padding: 8px;
  }
  .axis-layouts span,
  .axis-switch-board span {
    color: var(--text);
    font-size: 15px;
  }
  .axis-layouts em,
  .axis-switch-board strong,
  .axis-led-grid em {
    color: var(--textdim);
    font-style: normal;
    font-size: 10px;
  }
  .axis-led-grid span {
    width: 28px;
    height: 6px;
    border-radius: 999px;
  }
  .axis-led-grid strong {
    max-width: 100%;
    overflow: hidden;
    color: var(--text2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }
  button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .axis-side-summary,
  .axis-inspector {
    display: grid;
    gap: 12px;
  }
  .axis-side-summary > strong,
  .axis-inspector > strong {
    color: var(--text);
    font-size: 15px;
  }
  .axis-side-summary > span,
  .axis-inspector > span,
  .axis-inspector p {
    margin: 0;
    color: var(--textdim);
    font-size: 12px;
    line-height: 1.45;
  }
  .axis-present {
    width: fit-content;
    border: 1px solid color-mix(in srgb, var(--ok, #42d392) 55%, transparent);
    border-radius: 999px;
    padding: 4px 7px;
    color: var(--ok, #42d392);
    font-style: normal;
    font-size: 10px;
  }
  .axis-edit-fields {
    display: grid;
    gap: 9px;
  }
  label {
    display: grid;
    gap: 5px;
  }
  label span {
    color: var(--textdim);
    font-size: 11px;
  }
  input,
  select {
    width: 100%;
    height: 32px;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text);
    padding: 0 9px;
    font: 700 12px/1 var(--font-ui);
  }
  dl {
    margin: 0;
    display: grid;
    gap: 7px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    padding-bottom: 6px;
  }
  dt,
  dd {
    margin: 0;
    font-size: 11px;
  }
  dt {
    color: var(--textdim);
  }
  dd {
    color: var(--text2);
  }
  .axis-part-empty {
    flex: 1;
    min-height: 140px;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--textdim);
  }
  .axis-part-empty strong {
    color: var(--text);
    font-size: 13px;
  }
  .axis-part-empty span {
    font-size: 12px;
  }
</style>
