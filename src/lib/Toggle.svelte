<script lang="ts">
  // Pill toggle for a 2-option (on/off) enum — lives in the knob grid like a knob.
  interface Opt {
    value: number;
    label: string;
  }
  let {
    label,
    value,
    options,
    onChange
  }: { label: string; value: number; options: Opt[]; onChange: (v: number) => void } = $props();

  const onOpt = $derived(options[1] ?? options[0]);
  const offOpt = $derived(options[0]);
  const on = $derived(value === onOpt?.value);
  const valueText = $derived((on ? onOpt : offOpt)?.label ?? String(value));
  const flip = () => onChange((on ? offOpt : onOpt)?.value ?? value);
</script>

<div class="wrap">
  <div class="val mono" class:on>{valueText}</div>
  <button class="switch" class:on aria-pressed={on} aria-label={label} title={label} onclick={flip}>
    <span class="knob"></span>
  </button>
  <div class="label">{label}</div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    width: 100%;
  }
  .val {
    font: 700 11px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: var(--textfaint);
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .val.on {
    color: #5fd98f;
  }
  .switch {
    position: relative;
    width: 58px;
    height: 32px;
    border-radius: 16px;
    cursor: pointer;
    background: var(--track);
    border: 1px solid var(--border2);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    flex: none;
    padding: 0;
  }
  .switch.on {
    background: var(--ok-tint);
    border-color: var(--ok-border);
    box-shadow: inset 0 0 10px rgba(70, 209, 127, 0.25);
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--textmuted);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    transition: left 0.16s cubic-bezier(0.3, 0.8, 0.3, 1), background 0.15s;
  }
  .switch.on .knob {
    left: 29px;
    background: var(--ok);
    box-shadow: 0 0 8px rgba(70, 209, 127, 0.7), 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .label {
    font-weight: 600;
    font-size: 12px;
    color: var(--text2);
    text-align: center;
    line-height: 1.2;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
