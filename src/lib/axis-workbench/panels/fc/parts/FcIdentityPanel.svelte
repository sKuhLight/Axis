<script lang="ts">
  import { axisFcWorkbenchController } from '../../../fc/fcWorkbenchController';
  import { axisFcWorkbenchRuntime } from '../../../fc/fcWorkbenchRuntime';
  import type { AxisFcSide } from '../../../fc/fcWorkbenchData';
  import type { AxisFcPartView } from '../../../fc/fcPartView.svelte';

  let { view, wide }: { view: AxisFcPartView; wide: boolean } = $props();

  const SIDES: readonly AxisFcSide[] = ['tap', 'hold'];

  function textFromInput(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }
</script>

<!-- identity: label + LED color + mini-display (§3.4) -->
<div class="fc-identity" class:wide>
  <div class="fc-sidehead">
    <span class="fc-seclab">LABEL</span>
    <span class="fc-spacer"></span>
    <div class="fc-seg small" role="group" aria-label="Label side">
      {#each SIDES as side (side)}
        <button
          type="button"
          class="fc-segbtn"
          class:on={view.snapshot.side === side}
          aria-pressed={view.snapshot.side === side}
          title={`Edit the ${side} label`}
          onclick={() => axisFcWorkbenchController.selectSide(side)}>{side.toUpperCase()}</button>
      {/each}
    </div>
  </div>
  <input
    class="fc-labelinput"
    maxlength={view.runtimeSnapshot.model?.labelLen ?? undefined}
    value={view.labelValue(view.snapshot.side)}
    placeholder={view.autoLabelFor(view.snapshot.side)}
    onchange={(event) => axisFcWorkbenchRuntime.writeLabel(view.snapshot.side, textFromInput(event), view.cfg)}
  />
  {#if view.data.colors.length}
    <div class="fc-colorwrap">
      <span class="fc-seclab">LED COLOR</span>
      <div class="fc-colors">
        {#each view.data.colors as color (color.value)}
          <button
            type="button"
            class="fc-swatch"
            class:on={view.fieldNumber('color') === color.value}
            style={`background:${color.hex}`}
            title={color.name}
            aria-label={color.name}
            onclick={() => axisFcWorkbenchRuntime.writeField('color', color.value, view.cfg)}
          ></button>
        {/each}
      </div>
    </div>
  {/if}
  {#if view.labelModeList.length}
    <div class="fc-modewrap">
      <span class="fc-seclab">MINI-DISPLAY LABEL</span>
      <div class="fc-seg">
        {#each view.labelModeList as mode (mode.value)}
          <button
            type="button"
            class="fc-segbtn"
            class:on={view.fieldNumber(`${view.snapshot.side}Display`) === mode.value}
            aria-pressed={view.fieldNumber(`${view.snapshot.side}Display`) === mode.value}
            title={`Mini-display: ${mode.label}`}
            onclick={() => axisFcWorkbenchRuntime.writeField(`${view.snapshot.side}Display`, mode.value, view.cfg)}
            >{mode.label}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
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
  .fc-spacer {
    flex: 1;
    min-width: 6px;
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
  .fc-modewrap {
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
  .fc-swatch:hover:not(.on) {
    border-color: var(--aw-border-3);
  }
  .fc-swatch.on {
    border-color: rgb(255, 255, 255);
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
  .fc-segbtn:hover:not(.on) {
    color: var(--aw-text);
  }
  .fc-segbtn.on {
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
</style>
