<script lang="ts">
  // Theme & appearance picker (the new global theme engine's UI). Presets, accent, light/dark, UI scale,
  // and font choices. Fully tokenized (var(--…)) so it reflects the theme it edits.
  import { theme, THEME_PRESETS, ACCENT_SWATCHES, FONT_UI, FONT_MONO } from './theme.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const cfg = $derived(theme.cfg);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="bg" role="presentation" onclick={onclose}>
  <div class="card scroll" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <div><div class="h1">Appearance</div><div class="sub">Theme, accent &amp; scale — saved on this device</div></div>
      <button class="x" aria-label="Close" onclick={onclose}>✕</button>
    </div>

    <div class="sec">PRESETS</div>
    <div class="presets">
      {#each THEME_PRESETS as p (p.id)}
        <button class="preset" class:on={cfg.preset === p.id} onclick={() => theme.setPreset(p.id)}
          style:--pv-bg={p.pal.bg ?? (p.base === 'light' ? '#e9ebf0' : '#0c0c0e')}
          style:--pv-surf={p.pal.surface ?? (p.base === 'light' ? '#ffffff' : '#141417')}
          style:--pv-acc={p.accent}>
          <span class="swatch"><span class="dot"></span></span>
          <span class="pname">{p.name}</span>
          <span class="pbase">{p.base}</span>
        </button>
      {/each}
    </div>

    <div class="sec">ACCENT</div>
    <div class="accents">
      {#each ACCENT_SWATCHES as sw (sw)}
        <button class="acc" class:on={cfg.accent.toLowerCase() === sw.toLowerCase()} style:background={sw}
          aria-label={sw} onclick={() => theme.setAccent(sw)}></button>
      {/each}
      <label class="acc custom" style:background={cfg.accent} title="Custom color">
        <input type="color" value={cfg.accent} oninput={(e) => theme.setAccent((e.currentTarget as HTMLInputElement).value)} />
      </label>
    </div>

    <div class="sec">MODE</div>
    <div class="seg">
      <button class:on={cfg.base === 'dark'} onclick={() => theme.setBase('dark')}>Dark</button>
      <button class:on={cfg.base === 'light'} onclick={() => theme.setBase('light')}>Light</button>
    </div>

    <div class="sec">UI SCALE <span class="val mono">{cfg.scale}%</span></div>
    <input class="range" type="range" min="80" max="130" step="5" value={cfg.scale}
      oninput={(e) => theme.setScale(+(e.currentTarget as HTMLInputElement).value)} />

    <div class="row2">
      <label class="fld">
        <span class="flbl">UI FONT</span>
        <select value={cfg.fontUi} onchange={(e) => theme.setFontUi((e.currentTarget as HTMLSelectElement).value)}>
          {#each FONT_UI as f (f[0])}<option value={f[0]}>{f[0]}</option>{/each}
        </select>
      </label>
      <label class="fld">
        <span class="flbl">MONO FONT</span>
        <select value={cfg.fontMono} onchange={(e) => theme.setFontMono((e.currentTarget as HTMLSelectElement).value)}>
          {#each FONT_MONO as f (f[0])}<option value={f[0]}>{f[0]}</option>{/each}
        </select>
      </label>
    </div>
  </div>
</div>

<style>
  .bg { position: fixed; inset: 0; background: rgba(6, 6, 8, 0.62); backdrop-filter: blur(3px); z-index: 380; display: flex; align-items: center; justify-content: center; padding: 24px; animation: axsOverlay 0.18s ease-out; }
  .card { width: 420px; max-width: 100%; max-height: 88vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border2); border-radius: 16px; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.55); color: var(--text); padding: 22px 22px 24px; animation: axsPalette 0.16s ease-out; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
  .h1 { font-size: 19px; font-weight: 800; color: var(--text); }
  .sub { font-size: 12.5px; color: var(--textdim); margin-top: 2px; }
  .x { width: 30px; height: 30px; flex: none; border: 0; border-radius: 8px; background: var(--bg2); color: var(--textdim); font-size: 14px; cursor: pointer; }
  .x:hover { color: var(--text); background: var(--surface2); }
  .sec { font: 700 9px/1 var(--font-mono); letter-spacing: 0.12em; color: var(--textfaint); margin: 18px 0 10px; display: flex; align-items: center; gap: 8px; }
  .sec .val { color: var(--textdim); }
  .presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
  .preset { display: flex; flex-direction: column; gap: 7px; align-items: flex-start; padding: 11px; border-radius: 12px; border: 1px solid var(--border); background: var(--pv-bg); cursor: pointer; text-align: left; }
  .preset.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .preset .swatch { width: 100%; height: 26px; border-radius: 7px; background: var(--pv-surf); border: 1px solid rgba(128, 128, 128, 0.18); display: flex; align-items: center; padding: 0 8px; }
  .preset .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--pv-acc); }
  .pname { font-size: 12.5px; font-weight: 700; color: var(--text); }
  .pbase { font: 600 8.5px/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; color: var(--textfaint); }
  .accents { display: flex; flex-wrap: wrap; gap: 9px; }
  .acc { width: 34px; height: 34px; border-radius: 9px; border: 2px solid transparent; cursor: pointer; padding: 0; position: relative; }
  .acc.on { border-color: var(--text); box-shadow: 0 0 0 2px var(--bg); }
  .acc.custom { display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px dashed var(--border3); }
  .acc.custom input { opacity: 0; width: 100%; height: 100%; cursor: pointer; }
  .seg { display: flex; gap: 3px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
  .seg button { flex: 1; height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--textdim); font-size: 13px; font-weight: 700; cursor: pointer; }
  .seg button.on { background: var(--accent); color: var(--accentink); }
  .range { width: 100%; accent-color: var(--accent); }
  .row2 { display: flex; gap: 12px; margin-top: 18px; }
  .fld { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .flbl { font: 700 9px/1 var(--font-mono); letter-spacing: 0.1em; color: var(--textfaint); }
  .fld select { height: 40px; padding: 0 10px; background: var(--input); border: 1px solid var(--border2); border-radius: 10px; color: var(--text); font-family: var(--font-ui); font-size: 13px; cursor: pointer; }
  .fld select:focus { border-color: var(--accent); outline: none; }
</style>
