<script lang="ts">
  import { onMount } from 'svelte';
  import FcEditor from '../../../FcEditor.svelte';
  import SignalGrid from '../../../SignalGrid.svelte';
  import type { PanelInstance } from '../../../workbench';
  import { getWorkbenchContext } from '../../../workbench/svelte/context';
  import { axisGridViewFromWidgets } from '../../gridView';
  import { bindAxisRuntimeHost } from '../../runtimeBinding';
  import {
    axisFcActionLabel,
    axisFcCategoryColor,
    createAxisFcDataView,
    type AxisFcSide,
    type AxisFcSlotLike
  } from '../../fc/fcWorkbenchData';
  import { createAxisFcWorkbenchHost } from '../../fc/fcWorkbenchHost';
  import { axisFcPartFromPanelType, parseAxisFcPart, type AxisFcPart } from '../../fc/types';
  import { axisFcWorkbenchController, type AxisFcControllerSnapshot } from '../../fc/fcWorkbenchController';
  import {
    axisFcWorkbenchRuntime,
    type AxisFcRuntimeSnapshot
  } from '../../fc/fcWorkbenchRuntime';

  let { panel }: { panel: PanelInstance } = $props();
  const { controller: workbench } = getWorkbenchContext();
  let snapshot = $state<AxisFcControllerSnapshot>(axisFcWorkbenchController.snapshot);
  let runtimeSnapshot = $state<AxisFcRuntimeSnapshot>(axisFcWorkbenchRuntime.snapshot);
  let lastReadKey = '';
  const part = $derived<AxisFcPart>(parseAxisFcPart(panel.state?.part, axisFcPartFromPanelType(panel.type)));

  // Reactive data view over BOTH the selection and runtime snapshots (board tiles, assigned
  // dots and summaries redraw on live read-back / session writes).
  const data = $derived(
    createAxisFcDataView({
      model: runtimeSnapshot.model,
      layout: snapshot.layout,
      view: snapshot.view,
      switchIndex: snapshot.switchIndex,
      side: snapshot.side,
      edits: runtimeSnapshot.edits,
      labelText: runtimeSnapshot.labelText,
      present: runtimeSnapshot.present
    })
  );

  // fc-part="grid": the Signal Grid mounted inside an FC panel (04-fc-and-grid.md §1.1).
  // Grid state is NOT on the FC controller (§1.4) — the grid consumes the gridbar widgets'
  // mode/size exactly like the Signal Grid panel does.
  const gridView = $derived(axisGridViewFromWidgets(Object.values($workbench.activeLayout?.widgets ?? {})));

  // Part gating, ported from renderVals() (04-fc-and-grid.md §1.2).
  const showBoard = $derived(part === 'board');
  const showLayoutsStrip = $derived(part === 'board' || part === 'layouts');
  const showInspector = $derived(part === 'inspector' || part === 'led' || part === 'tap' || part === 'hold');
  const showIdentity = $derived(part === 'inspector' || part === 'led');
  const cfg = $derived(data.selectedConfig);

  onMount(() => {
    if (parseAxisFcPart(panel.state?.part, axisFcPartFromPanelType(panel.type)) === 'grid') return;
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
    if (!runtimeSnapshot.model?.liveState || part === 'full' || part === 'grid' || key === lastReadKey) return;
    lastReadKey = key;
    void axisFcWorkbenchRuntime.readSelection(snapshot);
  });

  function fieldNumber(field: string): number {
    return Number(runtimeSnapshot.edits[`${field}:${cfg}`] ?? 0);
  }

  function slotNumber(side: AxisFcSide, slotIndex: number, fallback = 0): number {
    return Number(runtimeSnapshot.edits[`${side}Params#${slotIndex}:${cfg}`] ?? fallback);
  }

  function labelValue(side: AxisFcSide): string {
    return runtimeSnapshot.labelText[`${side}Label:${cfg}`] ?? '';
  }

  const catList = $derived(
    Object.entries(runtimeSnapshot.model?.categories ?? {})
      .map(([value, label]) => ({ value: Number(value), label }))
      .sort((a, b) => a.value - b.value)
  );

  const labelModeList = $derived(
    Object.entries(runtimeSnapshot.model?.labelModes ?? {})
      .map(([value, label]) => ({ value: Number(value), label }))
      .sort((a, b) => a.value - b.value)
  );

  function functionsForSide(side: AxisFcSide) {
    return runtimeSnapshot.model?.functions?.[String(fieldNumber(`${side}Category`))] ?? [];
  }

  function selectedFunctionForSide(side: AxisFcSide) {
    const ord = fieldNumber(`${side}Function`);
    return functionsForSide(side).find((fn) => fn.ord === ord) ?? null;
  }

  function summaryFor(side: AxisFcSide): string {
    return axisFcActionLabel(runtimeSnapshot.model, side, cfg, runtimeSnapshot.edits, 'Empty');
  }

  function autoLabelFor(side: AxisFcSide): string {
    return axisFcActionLabel(runtimeSnapshot.model, side, cfg, runtimeSnapshot.edits);
  }

  function slotRange(slot: AxisFcSlotLike): { lo: number; hi: number } {
    const hiDefault = slot.type === 'preset' ? 511 : 127;
    return { lo: slot.min ?? 0, hi: slot.max ?? hiDefault };
  }

  function stepSlot(side: AxisFcSide, slot: AxisFcSlotLike, delta: number) {
    const { lo, hi } = slotRange(slot);
    const next = Math.max(lo, Math.min(hi, slotNumber(side, slot.i, slot.min ?? 0) + delta));
    void axisFcWorkbenchRuntime.writeSlot(side, slot.i, next, cfg);
  }

  function sceneOptions(slot: AxisFcSlotLike): number[] {
    const lo = slot.min ?? 1;
    const hi = Math.min(slot.max ?? 8, lo + 11);
    return Array.from({ length: Math.max(1, hi - lo + 1) }, (_, i) => lo + i);
  }

  function cardVisible(which: AxisFcSide): boolean {
    return part === 'inspector' || part === which;
  }

  const SIDES: readonly AxisFcSide[] = ['tap', 'hold'];

  function numberFromInput(event: Event) {
    return +(event.currentTarget as HTMLInputElement).value;
  }

  function textFromInput(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }
</script>

{#if part === 'full'}
  <div class="axis-pane-fill">
    <FcEditor />
  </div>
{:else if part === 'grid'}
  <div class="axis-pane-fill">
    <SignalGrid view={gridView} />
  </div>
{:else}
  <section class="fc-part" class:insp-bg={showInspector} data-part={part}>
    {#if runtimeSnapshot.error}
      <div class="fc-empty">
        <strong>FC model unavailable</strong>
        <span>{runtimeSnapshot.error}</span>
      </div>
    {:else if !data.ready || runtimeSnapshot.loading}
      <div class="fc-empty">
        <strong>Loading FC model</strong>
        <span>Reading Foot Controller address model</span>
      </div>
    {:else}
      {#if showBoard}
        <!-- header strip (§3.1) -->
        <div class="fc-head">
          <span class="fc-title">FC CONTROLLERS</span>
          {#if data.board.length}
            <div class="fc-devices">
              {#each ['FM3', 'FC-6', 'FC-12'] as device (device)}
                <span
                  class="fc-dev"
                  class:on={data.device === device}
                  title={data.device === device
                    ? `Connected FC device profile (${data.deviceNote})`
                    : 'Device profile follows the connected unit'}>{device}</span>
              {/each}
            </div>
          {/if}
          <span class="fc-spacer"></span>
          <span class="fc-devnote">{data.deviceNote}</span>
        </div>
      {/if}

      {#if showLayoutsStrip}
        <!-- LAYOUTS strip (§3.2) -->
        {#if data.layouts.length}
          <div class="fc-strip">
            <span class="fc-striplab">LAYOUTS</span>
            {#each data.layouts as layout (layout.index)}
              <button
                type="button"
                class="fc-laychip"
                class:on={layout.active}
                class:master={layout.label === 'Master'}
                class:assigned={layout.assigned}
                onclick={() => axisFcWorkbenchController.selectLayout(layout.index)}
              >
                {layout.label === 'Master' ? 'MASTER' : layout.label}
                {#if layout.assigned && !layout.active}<span class="fc-dot"></span>{/if}
              </button>
            {/each}
          </div>
        {:else}
          <div class="fc-strip fc-strip-flat">
            <span class="fc-striplab">CONFIGS</span>
            {#each data.configs.slice(0, 64) as config (config.index)}
              <button
                type="button"
                class="fc-laychip"
                class:on={config.active}
                onclick={() => axisFcWorkbenchController.selectSwitch(config.index)}>{config.label}</button>
            {/each}
          </div>
        {/if}
      {/if}

      {#if showBoard}
        <!-- board hero (§3.1) -->
        <div class="fc-board-scroll">
          <div class="fc-hero" style={`max-width:${data.boardMaxWidth}px`}>
            <input
              class="fc-layname"
              value={data.layoutName}
              placeholder="Layout name"
              readonly
              title="Layout rename is not supported by this device's FC model"
            />
            {#if data.views.length > 1}
              <div class="fc-viewwrap">
                <span class="fc-viewlab">VIEW</span>
                {@render viewNav()}
              </div>
            {/if}
          </div>
          {#if data.board.length}
            <div
              class="fc-board"
              style={`grid-template-columns:repeat(${data.boardCols},1fr); max-width:${data.boardMaxWidth}px`}
            >
              {#each data.board as tile (tile.index)}
                <button
                  type="button"
                  class="fc-tile"
                  class:on={tile.active}
                  class:empty={tile.empty}
                  style={`--fc-led:${tile.ledHex ?? 'var(--aw-border)'}`}
                  onclick={() => axisFcWorkbenchController.selectSwitch(tile.index, snapshot.side)}
                >
                  <span class="fc-led" class:lit={!tile.empty}></span>
                  <span class="fc-num">{tile.num}</span>
                  {#if tile.onDevice}
                    <span class="fc-ondev" title="Configured on the device (live read)">● on unit</span>
                  {/if}
                  <span class="fc-tilelbl">{tile.label}</span>
                  <span class="fc-rows">
                    <span class="fc-row"><i class="fc-badge tap">T</i><em class="fc-rowtxt">{tile.tapText}</em></span>
                    <span class="fc-row"><i class="fc-badge hold">H</i><em class="fc-rowtxt hold">{tile.holdText}</em></span>
                  </span>
                </button>
              {/each}
            </div>
            <div class="fc-hint">Tap a switch to edit its Tap &amp; Hold actions below</div>
          {:else}
            <div class="fc-empty">
              <strong>Flat FC config space</strong>
              <span>Select configs in the layouts pane</span>
            </div>
          {/if}
        </div>
      {/if}

      {#if showInspector}
        <!-- switch inspector (§3.3); part instances always show and fill the pane (§1.2) -->
        <div class="fc-insp">
          <div class="fc-ihead">
            <span class="fc-ilab">SWITCH</span>
            <span class="fc-inum">{(data.selectedSwitch ?? 0) + 1}</span>
            {#if data.views.length > 1}
              <span class="fc-idiv"></span>
              <span class="fc-viewlab">VIEW</span>
              {@render viewNav()}
            {/if}
            <span class="fc-spacer"></span>
            {#if runtimeSnapshot.present[cfg]}
              <span class="fc-present" title="Configured on the device (live read)">● on unit</span>
            {/if}
            {#if runtimeSnapshot.reading}
              <span class="fc-reading">reading…</span>
            {/if}
          </div>

          <div class="fc-ibody" class:solo={part !== 'inspector'}>
            {#if showIdentity}
              <!-- identity: label + LED color + mini-display (§3.4) -->
              <div class="fc-identity" class:wide={part === 'led'}>
                <div class="fc-sidehead">
                  <span class="fc-seclab">LABEL</span>
                  <span class="fc-spacer"></span>
                  <div class="fc-seg small">
                    {#each SIDES as side (side)}
                      <button
                        type="button"
                        class="fc-segbtn"
                        class:on={snapshot.side === side}
                        onclick={() => axisFcWorkbenchController.selectSide(side)}>{side.toUpperCase()}</button>
                    {/each}
                  </div>
                </div>
                <input
                  class="fc-labelinput"
                  maxlength={runtimeSnapshot.model?.labelLen ?? undefined}
                  value={labelValue(snapshot.side)}
                  placeholder={autoLabelFor(snapshot.side)}
                  onchange={(event) =>
                    axisFcWorkbenchRuntime.writeLabel(snapshot.side, textFromInput(event), cfg)}
                />
                {#if data.colors.length}
                  <div class="fc-colorwrap">
                    <span class="fc-seclab">LED COLOR</span>
                    <div class="fc-colors">
                      {#each data.colors as color (color.value)}
                        <button
                          type="button"
                          class="fc-swatch"
                          class:on={fieldNumber('color') === color.value}
                          style={`background:${color.hex}`}
                          title={color.name}
                          aria-label={color.name}
                          onclick={() => axisFcWorkbenchRuntime.writeField('color', color.value, cfg)}
                        ></button>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if labelModeList.length}
                  <div class="fc-modewrap">
                    <span class="fc-seclab">MINI-DISPLAY LABEL</span>
                    <div class="fc-seg">
                      {#each labelModeList as mode (mode.value)}
                        <button
                          type="button"
                          class="fc-segbtn"
                          class:on={fieldNumber(`${snapshot.side}Display`) === mode.value}
                          onclick={() =>
                            axisFcWorkbenchRuntime.writeField(`${snapshot.side}Display`, mode.value, cfg)}
                          >{mode.label}</button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            {#each SIDES as which (which)}
              {#if cardVisible(which)}
                {@render actionCard(which)}
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </section>
{/if}

{#snippet viewNav()}
  {#each data.views as view (view.index)}
    <button
      type="button"
      class="fc-viewchip"
      class:on={view.active}
      class:assigned={view.assigned}
      onclick={() => axisFcWorkbenchController.selectView(view.index)}
    >
      {view.label}
      {#if view.assigned && !view.active}<span class="fc-dot tiny"></span>{/if}
    </button>
  {/each}
{/snippet}

{#snippet actionCard(which: AxisFcSide)}
  {@const fns = functionsForSide(which)}
  {@const fn = selectedFunctionForSide(which)}
  {@const side = data.sides.find((item) => item.side === which)}
  <div class="fc-card" class:bordered={part === 'inspector'}>
    <div class="fc-cardhead">
      <span class="fc-carddot" class:hold={which === 'hold'}></span>
      <span class="fc-cardtitle">{which.toUpperCase()}</span>
      <span class="fc-spacer"></span>
      <span class="fc-cardsum">{summaryFor(which)}</span>
    </div>

    {#if catList.length}
      <div class="fc-group">
        <span class="fc-seclab">CATEGORY</span>
        <div class="fc-chips">
          {#each catList as cat (cat.value)}
            <button
              type="button"
              class="fc-chip"
              class:on={fieldNumber(`${which}Category`) === cat.value}
              style={`--fc-cat:${axisFcCategoryColor(cat.label) ?? 'var(--aw-accent)'}`}
              onclick={() => axisFcWorkbenchRuntime.setCategory(which, cat.value, cfg)}>{cat.label}</button>
          {/each}
        </div>
      </div>
    {:else}
      <label class="fc-fld">
        <span>Category (raw)</span>
        <input
          type="number"
          min="0"
          value={fieldNumber(`${which}Category`)}
          onchange={(event) => axisFcWorkbenchRuntime.setCategory(which, numberFromInput(event), cfg)}
        />
      </label>
    {/if}

    {#if fns.length}
      <div class="fc-group">
        <span class="fc-seclab">FUNCTION</span>
        <div class="fc-chips">
          {#each fns as f (f.ord)}
            <button
              type="button"
              class="fc-chip accent"
              class:on={fieldNumber(`${which}Function`) === f.ord}
              onclick={() => axisFcWorkbenchRuntime.writeField(`${which}Function`, f.ord, cfg)}>{f.name}</button>
          {/each}
        </div>
      </div>
    {:else if fieldNumber(`${which}Category`) !== 0}
      <label class="fc-fld">
        <span>Function (raw)</span>
        <input
          type="number"
          min="0"
          value={fieldNumber(`${which}Function`)}
          onchange={(event) => axisFcWorkbenchRuntime.writeField(`${which}Function`, numberFromInput(event), cfg)}
        />
      </label>
    {/if}

    {#if fn}
      {#each fn.slots as slot (slot.i)}
        {#if slot.type === 'bool'}
          <div class="fc-inline">
            <span class="fc-inlinelab">{slot.role}</span>
            <button
              type="button"
              class="fc-pill"
              class:on={slotNumber(which, slot.i) === 1}
              role="switch"
              aria-checked={slotNumber(which, slot.i) === 1}
              aria-label={slot.role}
              onclick={() =>
                axisFcWorkbenchRuntime.writeSlot(which, slot.i, slotNumber(which, slot.i) === 1 ? 0 : 1, cfg)}
            >
              <span class="fc-pilldot"></span>
            </button>
          </div>
        {:else if slot.type === 'enum' && slot.options?.length}
          <div class="fc-group">
            <span class="fc-seclab">{slot.role.toUpperCase()}</span>
            <div class="fc-chips">
              {#each slot.options as option, oi (oi)}
                <button
                  type="button"
                  class="fc-chip accent"
                  class:on={slotNumber(which, slot.i) === oi}
                  onclick={() => axisFcWorkbenchRuntime.writeSlot(which, slot.i, oi, cfg)}>{option}</button>
              {/each}
            </div>
          </div>
        {:else if slot.type === 'channel' && runtimeSnapshot.model?.channels?.length}
          <div class="fc-group">
            <span class="fc-seclab">CHANNEL</span>
            <div class="fc-chips">
              {#each runtimeSnapshot.model.channels as channel, ci (ci)}
                <button
                  type="button"
                  class="fc-mini"
                  class:on={slotNumber(which, slot.i) === ci}
                  onclick={() => axisFcWorkbenchRuntime.writeSlot(which, slot.i, ci, cfg)}>{channel}</button>
              {/each}
            </div>
          </div>
        {:else if slot.type === 'scene'}
          <div class="fc-group">
            <span class="fc-seclab">{slot.role.toUpperCase()}</span>
            <div class="fc-chips">
              {#each sceneOptions(slot) as scene (scene)}
                <button
                  type="button"
                  class="fc-mini"
                  class:on={slotNumber(which, slot.i, slot.min ?? 1) === scene}
                  onclick={() => axisFcWorkbenchRuntime.writeSlot(which, slot.i, scene, cfg)}>{scene}</button>
              {/each}
            </div>
          </div>
        {:else}
          {@const range = slotRange(slot)}
          <div class="fc-inline">
            <span class="fc-inlinelab">{slot.role}{slot.type === 'block' ? ' (block id)' : ''}</span>
            <div class="fc-stepper">
              {#if range.hi - range.lo > 32}
                <button type="button" class="fc-step" onclick={() => stepSlot(which, slot, -10)}>«</button>
              {/if}
              <button type="button" class="fc-step" onclick={() => stepSlot(which, slot, -1)}>−</button>
              <span class="fc-stepval">{slotNumber(which, slot.i, slot.min ?? 0)}</span>
              <button type="button" class="fc-step" onclick={() => stepSlot(which, slot, 1)}>+</button>
              {#if range.hi - range.lo > 32}
                <button type="button" class="fc-step" onclick={() => stepSlot(which, slot, 10)}>»</button>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    {:else if side && fieldNumber(`${which}Category`) !== 0}
      {#each Array(side.slotCount) as _, index (index)}
        <label class="fc-fld">
          <span>Value {index + 1} (raw)</span>
          <input
            type="number"
            value={slotNumber(which, index)}
            onchange={(event) => axisFcWorkbenchRuntime.writeSlot(which, index, numberFromInput(event), cfg)}
          />
        </label>
      {/each}
    {/if}
  </div>
{/snippet}

<style>
  .axis-pane-fill {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--aw-bg);
  }
  .fc-part {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--aw-bg);
    color: var(--aw-text-2);
    font-family: var(--aw-font-ui);
  }
  /* §1.2 part-container override: inspector parts fill the pane on bg2 */
  .fc-part.insp-bg {
    background: var(--aw-bg-2);
  }

  .fc-spacer {
    flex: 1;
    min-width: 6px;
  }

  /* ── header strip (§3.1) ─────────────────────────────────────────────── */
  .fc-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 13px;
    flex-wrap: wrap;
    padding: 12px 18px;
    border-bottom: 1px solid var(--aw-surface-2);
  }
  .fc-title {
    font: 700 12px/1 var(--aw-font-mono);
    letter-spacing: 0.16em;
    color: var(--aw-text-2);
  }
  .fc-devices {
    display: flex;
    gap: 3px;
    background: var(--aw-bg-2);
    border: 1px solid var(--aw-border);
    border-radius: 9px;
    padding: 3px;
  }
  .fc-dev {
    height: 28px;
    padding: 0 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 700;
    color: var(--aw-text-muted);
    background: transparent;
  }
  .fc-dev.on {
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .fc-devnote {
    font: 600 10px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
  }

  /* ── LAYOUTS strip (§3.2) ────────────────────────────────────────────── */
  .fc-strip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--aw-surface-2);
    overflow-x: auto;
  }
  .fc-striplab {
    flex: none;
    margin-right: 2px;
    font: 700 10px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    color: var(--aw-text-muted);
  }
  .fc-laychip {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    min-width: 34px;
    padding: 0;
    border-radius: 9px;
    border: 1px solid var(--aw-border-2);
    background: var(--aw-surface);
    color: #5c5c64;
    font: 700 14px/1 var(--aw-font-mono);
    cursor: pointer;
  }
  .fc-laychip.assigned {
    color: #dcdce2;
  }
  .fc-laychip.master {
    min-width: 80px;
    padding: 0 13px;
    font: 700 11px/1 var(--aw-font-mono);
    letter-spacing: 0.08em;
  }
  .fc-laychip.on {
    background: var(--aw-accent);
    border-color: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .fc-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--aw-accent);
  }
  .fc-dot.tiny {
    top: 4px;
    right: 4px;
    width: 4px;
    height: 4px;
  }

  /* ── board hero (§3.1) ───────────────────────────────────────────────── */
  .fc-board-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px 14px;
  }
  .fc-hero {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 auto 14px;
  }
  .fc-layname {
    flex: 1;
    min-width: 0;
    background: var(--aw-bg-2);
    border: 1px solid var(--aw-border);
    border-radius: 11px;
    padding: 11px 14px;
    color: var(--aw-text);
    font: 700 15px/1 var(--aw-font-ui);
    outline: none;
  }
  .fc-viewwrap {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .fc-viewlab {
    font: 700 9px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
    color: var(--aw-text-muted);
  }
  .fc-viewchip {
    position: relative;
    width: 34px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid var(--aw-border-2);
    background: var(--aw-surface);
    color: var(--aw-text-faint);
    font: 700 13px/1 var(--aw-font-mono);
    cursor: pointer;
  }
  .fc-viewchip.assigned {
    color: var(--aw-text-2);
  }
  .fc-viewchip.on {
    background: var(--aw-accent);
    border-color: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .fc-board {
    display: grid;
    gap: 14px;
    width: 100%;
    margin: 0 auto;
  }
  .fc-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 112px;
    padding: 15px 13px 12px;
    border-radius: 14px;
    border: 1px solid #28282f;
    background: linear-gradient(180deg, #181820, #121217);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    user-select: none;
    text-align: left;
    overflow: hidden;
    transition:
      border-color 0.12s,
      box-shadow 0.12s;
  }
  .fc-tile.empty {
    background: var(--aw-bg-2);
    border-color: var(--aw-surface-2);
  }
  .fc-tile.on {
    border-color: var(--aw-accent);
    box-shadow:
      0 0 0 1px var(--aw-accent),
      0 8px 26px color-mix(in srgb, var(--aw-accent) 18%, transparent);
  }
  .fc-led {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    background: var(--aw-border);
    opacity: 0.6;
  }
  .fc-led.lit {
    background: var(--fc-led);
    box-shadow: 0 0 12px var(--fc-led);
    opacity: 1;
  }
  .fc-num {
    position: absolute;
    top: 11px;
    right: 11px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font: 700 10px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
    background: rgba(12, 12, 14, 0.7);
    border: 1px solid var(--aw-border);
  }
  .fc-ondev {
    position: absolute;
    top: 13px;
    left: 13px;
    font: 600 9px/1 var(--aw-font-mono);
    letter-spacing: 0.02em;
    color: var(--ok, #42d392);
  }
  .fc-tilelbl {
    padding-right: 20px;
    font: 700 13.5px/1.2 var(--aw-font-ui);
    color: var(--aw-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .fc-tile.empty .fc-tilelbl {
    font: 700 13.5px/1.2 var(--aw-font-mono);
    color: #45454e;
  }
  .fc-rows {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fc-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .fc-badge {
    flex: none;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font: 700 8px/1 var(--aw-font-mono);
    font-style: normal;
  }
  .fc-badge.tap {
    color: #0a191a;
    background: var(--aw-accent);
  }
  .fc-badge.hold {
    color: #1c1206;
    background: var(--aw-amber);
  }
  .fc-rowtxt {
    font: 600 11px/1.2 var(--aw-font-mono);
    font-style: normal;
    color: var(--aw-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fc-rowtxt.hold {
    color: #7e7e88;
  }
  .fc-hint {
    margin-top: 14px;
    text-align: center;
    font: 600 11px/1.4 var(--aw-font-mono);
    color: var(--aw-text-muted);
  }

  /* ── inspector (§3.3) ────────────────────────────────────────────────── */
  .fc-insp {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--aw-bg-2);
  }
  .fc-ihead {
    flex: none;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 16px 18px 13px;
    border-bottom: 1px solid var(--aw-surface-2);
  }
  .fc-ilab {
    font: 700 11px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    color: var(--aw-text-faint);
  }
  .fc-inum {
    font: 700 17px/1 var(--aw-font-mono);
    color: var(--aw-text);
  }
  .fc-idiv {
    width: 1px;
    height: 18px;
    background: var(--aw-border);
    margin: 0 3px;
  }
  .fc-present {
    font: 600 9px/1 var(--aw-font-mono);
    color: var(--ok, #42d392);
  }
  .fc-reading {
    font: 600 10px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
  }
  .fc-ibody {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
  }
  .fc-ibody.solo {
    flex-wrap: nowrap;
    flex-direction: column;
  }
  .fc-identity {
    flex: 1 1 250px;
    min-width: min(240px, 100%);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 18px;
  }
  .fc-identity.wide {
    flex: 1;
    min-width: 0;
    max-width: 560px;
  }
  .fc-sidehead {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fc-labelinput {
    width: 100%;
    box-sizing: border-box;
    background: var(--aw-bg-2);
    border: 1px solid var(--aw-border-2);
    border-radius: 11px;
    padding: 12px 14px;
    color: var(--aw-text);
    font: 600 14px/1 var(--aw-font-ui);
    outline: none;
  }
  .fc-labelinput:focus {
    border-color: var(--aw-accent);
  }
  .fc-colorwrap,
  .fc-modewrap,
  .fc-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fc-seclab {
    font: 600 9px/1 var(--aw-font-mono);
    letter-spacing: 0.1em;
    color: var(--aw-text-muted);
  }
  .fc-colors {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .fc-swatch {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .fc-swatch.on {
    border-color: #fff;
    box-shadow: 0 0 0 2px var(--aw-accent);
  }
  .fc-seg {
    display: flex;
    gap: 4px;
    background: var(--aw-bg-2);
    border: 1px solid var(--aw-border);
    border-radius: 10px;
    padding: 4px;
  }
  .fc-segbtn {
    flex: 1;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--aw-text-muted);
    font: 700 12px/1 var(--aw-font-ui);
    cursor: pointer;
  }
  .fc-seg.small {
    padding: 3px;
  }
  .fc-seg.small .fc-segbtn {
    flex: none;
    height: 22px;
    padding: 0 9px;
    font: 700 9px/1 var(--aw-font-mono);
    letter-spacing: 0.08em;
  }
  .fc-segbtn.on {
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }

  /* ── action cards (§3.5) ─────────────────────────────────────────────── */
  .fc-card {
    flex: 1 1 300px;
    min-width: min(290px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
  }
  .fc-card.bordered {
    border-left: 1px solid var(--aw-surface-2);
  }
  .fc-cardhead {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .fc-carddot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    background: var(--aw-accent);
  }
  .fc-carddot.hold {
    background: var(--aw-amber);
  }
  .fc-cardtitle {
    font: 700 12px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
    color: var(--aw-text);
  }
  .fc-cardsum {
    font: 600 11px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fc-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .fc-chip {
    --fc-cat: var(--aw-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 31px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid var(--aw-border-2);
    background: var(--aw-surface);
    color: var(--aw-text-2);
    font: 600 12px/1 var(--aw-font-ui);
    white-space: nowrap;
    cursor: pointer;
  }
  .fc-chip.on {
    background: var(--fc-cat);
    border-color: var(--fc-cat);
    color: var(--aw-accent-ink);
  }
  .fc-chip.accent {
    --fc-cat: var(--aw-accent);
  }
  .fc-mini {
    width: 31px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid var(--aw-border-2);
    background: var(--aw-surface);
    color: var(--aw-text-2);
    font: 700 12px/1 var(--aw-font-mono);
    cursor: pointer;
  }
  .fc-mini.on {
    background: var(--aw-accent);
    border-color: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .fc-inline {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fc-inlinelab {
    flex: 1;
    min-width: 0;
    font: 600 12px/1 var(--aw-font-ui);
    color: var(--aw-text-2);
  }
  .fc-stepper {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--aw-surface);
    border: 1px solid var(--aw-border-2);
    border-radius: 10px;
    padding: 4px;
  }
  .fc-step {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--aw-border-2);
    border-radius: 8px;
    background: var(--aw-surface);
    color: var(--aw-text-2);
    font: 600 13px/1 var(--aw-font-mono);
    cursor: pointer;
  }
  .fc-stepval {
    min-width: 38px;
    text-align: center;
    font: 700 14px/1 var(--aw-font-mono);
    color: var(--aw-text);
  }
  .fc-pill {
    position: relative;
    flex: none;
    width: 42px;
    height: 24px;
    border: 0;
    border-radius: 13px;
    background: var(--aw-border-2);
    cursor: pointer;
    transition: background 0.15s;
    padding: 0;
  }
  .fc-pill.on {
    background: var(--aw-accent);
  }
  .fc-pilldot {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.15s;
  }
  .fc-pill.on .fc-pilldot {
    left: 21px;
  }

  .fc-fld {
    display: grid;
    gap: 5px;
  }
  .fc-fld span {
    color: var(--aw-text-muted);
    font-size: 11px;
  }
  .fc-fld input {
    width: 100%;
    height: 32px;
    min-width: 0;
    border: 1px solid var(--aw-border-2);
    border-radius: 8px;
    background: var(--aw-bg-2);
    color: var(--aw-text);
    padding: 0 9px;
    font: 700 12px/1 var(--aw-font-ui);
  }

  .fc-empty {
    flex: 1;
    min-height: 140px;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--aw-text-muted);
  }
  .fc-empty strong {
    color: var(--aw-text);
    font-size: 13px;
  }
  .fc-empty span {
    font-size: 12px;
  }
</style>
