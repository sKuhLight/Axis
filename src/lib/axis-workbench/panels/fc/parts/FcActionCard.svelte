<script lang="ts">
  import { axisFcCategoryColor, axisFcSlotBounds } from '../../../fc/fcWorkbenchData';
  import { axisFcWorkbenchRuntime } from '../../../fc/fcWorkbenchRuntime';
  import type { AxisFcSide } from '../../../fc/fcWorkbenchData';
  import type { AxisFcPartView } from '../../../fc/fcPartView.svelte';

  let { view, which, bordered }: { view: AxisFcPartView; which: AxisFcSide; bordered: boolean } = $props();

  const fns = $derived(view.functionsForSide(which));
  const fn = $derived(view.selectedFunctionForSide(which));
  const side = $derived(view.data.sides.find((item) => item.side === which));

  function numberFromInput(event: Event) {
    return +(event.currentTarget as HTMLInputElement).value;
  }
</script>

<div class="fc-card" class:bordered>
  <div class="fc-cardhead">
    <span class="fc-carddot" class:hold={which === 'hold'}></span>
    <span class="fc-cardtitle">{which.toUpperCase()}</span>
    <span class="fc-spacer"></span>
    <span class="fc-cardsum">{view.summaryFor(which)}</span>
  </div>

  {#if view.catList.length}
    <div class="fc-group">
      <span class="fc-seclab">CATEGORY</span>
      <div class="fc-chips">
        {#each view.catList as cat (cat.value)}
          <button
            type="button"
            class="fc-chip"
            class:on={view.fieldNumber(`${which}Category`) === cat.value}
            aria-pressed={view.fieldNumber(`${which}Category`) === cat.value}
            title={`${which.toUpperCase()} category: ${cat.label}`}
            style={`--fc-cat:${axisFcCategoryColor(cat.label) ?? 'var(--aw-accent)'}`}
            onclick={() => axisFcWorkbenchRuntime.setCategory(which, cat.value, view.cfg)}>{cat.label}</button>
        {/each}
      </div>
    </div>
  {:else}
    <label class="fc-fld">
      <span>Category (raw)</span>
      <input
        type="number"
        min="0"
        value={view.fieldNumber(`${which}Category`)}
        onchange={(event) => axisFcWorkbenchRuntime.setCategory(which, numberFromInput(event), view.cfg)}
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
            class:on={view.fieldNumber(`${which}Function`) === f.ord}
            aria-pressed={view.fieldNumber(`${which}Function`) === f.ord}
            title={`Function: ${f.name}`}
            onclick={() => axisFcWorkbenchRuntime.writeField(`${which}Function`, f.ord, view.cfg)}>{f.name}</button>
        {/each}
      </div>
    </div>
  {:else if view.fieldNumber(`${which}Category`) !== 0}
    <label class="fc-fld">
      <span>Function (raw)</span>
      <input
        type="number"
        min="0"
        value={view.fieldNumber(`${which}Function`)}
        onchange={(event) => axisFcWorkbenchRuntime.writeField(`${which}Function`, numberFromInput(event), view.cfg)}
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
            class:on={view.slotNumber(which, slot.i) === 1}
            role="switch"
            aria-checked={view.slotNumber(which, slot.i) === 1}
            aria-label={slot.role}
            onclick={() =>
              axisFcWorkbenchRuntime.writeSlot(which, slot.i, view.slotNumber(which, slot.i) === 1 ? 0 : 1, view.cfg)}
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
                class:on={view.slotNumber(which, slot.i) === oi}
                aria-pressed={view.slotNumber(which, slot.i) === oi}
                title={`${slot.role}: ${option}`}
                onclick={() => axisFcWorkbenchRuntime.writeSlot(which, slot.i, oi, view.cfg)}>{option}</button>
            {/each}
          </div>
        </div>
      {:else if slot.type === 'channel' && view.runtimeSnapshot.model?.channels?.length}
        <div class="fc-group">
          <span class="fc-seclab">CHANNEL</span>
          <div class="fc-chips">
            {#each view.runtimeSnapshot.model.channels as channel, ci (ci)}
              <button
                type="button"
                class="fc-mini"
                class:on={view.slotNumber(which, slot.i) === ci}
                aria-pressed={view.slotNumber(which, slot.i) === ci}
                title={`Channel ${channel}`}
                onclick={() => axisFcWorkbenchRuntime.writeSlot(which, slot.i, ci, view.cfg)}>{channel}</button>
            {/each}
          </div>
        </div>
      {:else if slot.type === 'scene'}
        <div class="fc-group">
          <span class="fc-seclab">{slot.role.toUpperCase()}</span>
          <div class="fc-chips">
            {#each view.sceneOptions(slot) as scene (scene)}
              <button
                type="button"
                class="fc-mini"
                class:on={view.slotNumber(which, slot.i, slot.min ?? 1) === scene}
                aria-pressed={view.slotNumber(which, slot.i, slot.min ?? 1) === scene}
                title={`${slot.role} ${scene}`}
                onclick={() => axisFcWorkbenchRuntime.writeSlot(which, slot.i, scene, view.cfg)}>{scene}</button>
            {/each}
          </div>
        </div>
      {:else}
        {@const bounds = axisFcSlotBounds(slot, view.slotNumber(which, slot.i, slot.min ?? 0))}
        {@const wide = bounds.hi - bounds.lo > 32}
        <div class="fc-inline">
          <span class="fc-inlinelab">{slot.role}{slot.type === 'block' ? ' (block id)' : ''}</span>
          <div class="fc-stepper" title={`Range ${bounds.lo}–${bounds.hi}`}>
            {#if wide}
              <button type="button" class="fc-step" disabled={bounds.atMin} aria-label="−10" title="−10" onclick={() => view.stepSlot(which, slot, -10)}>«</button>
            {/if}
            <button type="button" class="fc-step" disabled={bounds.atMin} aria-label="−1" title="−1" onclick={() => view.stepSlot(which, slot, -1)}>−</button>
            <span class="fc-stepval">{bounds.value}</span>
            <button type="button" class="fc-step" disabled={bounds.atMax} aria-label="+1" title="+1" onclick={() => view.stepSlot(which, slot, 1)}>+</button>
            {#if wide}
              <button type="button" class="fc-step" disabled={bounds.atMax} aria-label="+10" title="+10" onclick={() => view.stepSlot(which, slot, 10)}>»</button>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  {:else if side && view.fieldNumber(`${which}Category`) !== 0}
    {#each Array(side.slotCount) as _, index (index)}
      <label class="fc-fld">
        <span>Value {index + 1} (raw)</span>
        <input
          type="number"
          value={view.slotNumber(which, index)}
          onchange={(event) => axisFcWorkbenchRuntime.writeSlot(which, index, numberFromInput(event), view.cfg)}
        />
      </label>
    {/each}
  {/if}
</div>

<style>
  .fc-spacer {
    flex: 1;
    min-width: 6px;
  }
  .fc-seclab {
    font: 600 9px/1 var(--aw-font-mono);
    letter-spacing: 0.1em;
    color: var(--aw-text-muted);
  }
  .fc-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
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
  .fc-chip:hover:not(.on) {
    border-color: var(--aw-border-3);
    color: var(--aw-text);
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
  .fc-mini:hover:not(.on) {
    border-color: var(--aw-border-3);
    color: var(--aw-text);
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
  .fc-step:hover:not(:disabled) {
    border-color: var(--aw-border-3);
    color: var(--aw-text);
  }
  .fc-step:disabled {
    opacity: 0.35;
    cursor: default;
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
  .fc-pill:hover:not(.on) {
    background: var(--aw-border-3);
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
    background: rgb(255, 255, 255);
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
</style>
