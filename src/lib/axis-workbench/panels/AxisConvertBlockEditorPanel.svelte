<script lang="ts">
  // Cross-device converter BLOCK EDITOR (Phase 2 · META-24 · AXIS-48). Unlike the live editor this is a
  // conflict-resolution surface: it reads the OFFLINE convertScratch buffer + the convertConflicts
  // foundation (NOT a device) and renders, per the design mockup — a header (glyph · name · "was <src>" ·
  // kept N of M), a conflict banner (type-unresolved / substituted-unverified with Verify / verified), an
  // AVAILABLE-TYPES-ONLY picker (the invalid source type struck "not on <target>"), and per-param status
  // rows (ok / clamped from→to + range / unverified ? / dropped struck + reason). Picking a target type
  // resolves the type conflict; the mappable params carry over automatically (the converter already
  // mapped them into the block — we surface, we don't re-map).
  import { setContext } from 'svelte';
  import { EDITOR_SURFACE_KEY } from '../../editorSurface';
  import { convertEditor } from '../../convertEditor.svelte';
  setContext(EDITOR_SURFACE_KEY, convertEditor);

  import type { PanelInstance } from '../../workbench';
  import type { BlockTypeOption } from '../../types';
  import { convert } from '../../convert.svelte';
  import { convertScratch } from '../../convertScratch.svelte';
  import { editor } from '../../editor.svelte';
  import { deviceName, familyLabel } from '../../convertReport';
  import { blockParamViews, paramKeptCounts, familyCat, type ParamStatus } from '../../convertConflicts';

  let { panel: _panel }: { panel: PanelInstance } = $props();

  const scratch = $derived(convertScratch.state);
  const key = $derived(convertScratch.focusKey);
  const block = $derived(key && scratch ? scratch.blocks.find((b) => b.key === key) ?? null : null);
  const events = $derived(convert.result?.events ?? []);
  const targetId = $derived(convert.lastRequest?.targetDevice);
  const targetName = $derived(targetId ? deviceName(targetId) : 'the target');

  const cat = $derived(block ? familyCat(block.family) : null);
  const famLabel = $derived(block ? familyLabel(block.family) : '');
  const typeConflict = $derived(block && scratch ? scratch.conflicts.find((c) => c.id === `type:${block.key}`) ?? null : null);

  const paramViews = $derived(block ? blockParamViews(events, { key: block.key, params: block.params }) : []);
  const kept = $derived(paramKeptCounts(paramViews));

  // ── banner state ──
  type Banner =
    | { kind: 'unresolved'; src: string }
    | { kind: 'substituted'; src: string; confidence?: string }
    | { kind: 'verified'; src: string; tgt?: string }
    | null;
  const banner = $derived.by((): Banner => {
    if (!block || !typeConflict?.type) return null;
    const t = typeConflict.type;
    if (t.unresolved) return typeConflict.resolved ? null : { kind: 'unresolved', src: t.sourceTypeName };
    if (typeConflict.resolved) return { kind: 'verified', src: t.sourceTypeName, tgt: block.typeName };
    return { kind: 'substituted', src: t.sourceTypeName, confidence: t.confidence };
  });
  // params are gated only until an UNRESOLVED type is picked (mockup: "Pick a target type to map params").
  const locked = $derived(banner?.kind === 'unresolved');
  // "kept N of M" reads as broken when a block has no mapped params at all (the converter only maps
  // families it has a concept table for — deeper param mapping is codec work). Say so plainly instead.
  const keptLabel = $derived(
    locked ? `— of ${kept.total} params` : kept.total === 0 ? 'no parameters mapped' : `kept ${kept.kept} of ${kept.total} params`
  );

  // ── type picker ──
  const showPicker = $derived(!!typeConflict?.type);
  $effect(() => {
    const fam = block?.family;
    if (fam && typeConflict) void convertScratch.loadTypes(fam);
  });
  const types = $derived(block && typeConflict ? convertScratch.typesFor(block.family) : undefined);
  const typeList = $derived(Array.isArray(types) ? types : []);
  const invalidType = $derived(banner?.kind === 'unresolved' ? banner.src : null);

  function pickType(o: BlockTypeOption) {
    if (!block) return;
    convertScratch.setType(block.key, { typeName: o.name, typeValue: o.value });
    editor.showToast(`${famLabel} set to “${o.name}” · conflict resolved`, '#33c46b');
  }
  function verify() {
    if (!block) return;
    convertScratch.acceptType(block.key);
    editor.showToast('Substitution verified', '#33c46b');
  }

  const displayName = $derived(block ? block.typeName || 'Set type…' : '');
  const srcType = $derived(typeConflict?.type?.sourceTypeName ?? '');

  function dotColor(s: ParamStatus): string {
    return s === 'ok' ? 'var(--ok)' : s === 'dropped' ? 'var(--danger)' : 'var(--amber)';
  }
</script>

<div class="cbe">
  {#if !block}
    <div class="cbe-empty">
      <span class="e-icon" aria-hidden="true">⌖</span>
      <span>Select a block on either grid to inspect and resolve its conversion.</span>
    </div>
  {:else}
    <!-- header -->
    <header class="cbe-head">
      <div class="hicon" style="--c:{cat?.accent};">{cat?.glyph}</div>
      <div class="htitle">
        <div class="hname">{displayName}</div>
        <div class="hsub">{famLabel.toUpperCase()}{srcType ? ` · was ${srcType}` : ''}</div>
      </div>
      <span class="spacer"></span>
      <div class="kept" class:locked>{keptLabel}</div>
    </header>

    <!-- banner -->
    {#if banner}
      <div class="banner {banner.kind}">
        <span class="b-icon">{banner.kind === 'unresolved' ? '!' : banner.kind === 'verified' ? '✓' : '~'}</span>
        <div class="b-text">
          {#if banner.kind === 'unresolved'}
            <div class="b-title">Type ‘{banner.src}’ not available on {targetName}</div>
            <div class="b-detail">Pick a type below to map this block — compatible parameters carry over automatically.</div>
          {:else if banner.kind === 'substituted'}
            <div class="b-title">Substituted — nearest {targetName} {famLabel.toLowerCase()}{banner.confidence ? ` (${banner.confidence} match)` : ''}</div>
            <div class="b-detail">Was ‘{banner.src}’. Confirm the substitution or pick a different type.</div>
          {:else}
            <div class="b-title">Substitution verified</div>
            <div class="b-detail">Mapped from ‘{banner.src}’{banner.tgt ? ` to ‘${banner.tgt}’` : ''}.</div>
          {/if}
        </div>
        {#if banner.kind === 'substituted'}
          <button type="button" class="verify-btn" onclick={verify}>Verify substitution</button>
        {/if}
      </div>
    {/if}

    <div class="cbe-body">
      <!-- available-types-only picker -->
      {#if showPicker}
        <aside class="picker">
          <div class="picker-title">AVAILABLE {famLabel.toUpperCase()} TYPES · {targetName}</div>
          <div class="picker-list">
            {#if invalidType}
              <div class="invalid-chip">
                <span class="ic-x">✕</span>
                <div class="ic-text">
                  <div class="ic-name">{invalidType}</div>
                  <div class="ic-sub">not on {targetName}</div>
                </div>
              </div>
            {/if}
            {#if types === 'loading'}
              <div class="picker-note">Loading types…</div>
            {:else if types === 'error'}
              <div class="picker-note err">Couldn’t load the type list.</div>
            {:else if typeList.length === 0}
              <div class="picker-note">No types available.</div>
            {:else}
              {#each typeList as o (o.value)}
                {@const current = o.name === block.typeName}
                <button type="button" class="opt" class:current onclick={() => pickType(o)}>
                  <span class="opt-name">{o.name}</span>
                  {#if current}<span class="opt-cur">CURRENT</span>{/if}
                </button>
              {/each}
            {/if}
          </div>
        </aside>
      {/if}

      <!-- param list -->
      <div class="params">
        {#if locked}
          <div class="params-locked"><span class="pl-icon">!</span> Pick a target type to map parameters.</div>
        {:else}
          <div class="params-grid">
            {#each paramViews as p (p.name)}
              <div class="prow {p.status}">
                <span class="pdot" style="background:{dotColor(p.status)};"></span>
                <span class="pname" class:strike={p.status === 'dropped'}>{p.name}</span>
                <span class="pval">
                  {#if p.status === 'clamped'}
                    {p.from} → {p.to}{#if p.range}<span class="prange"> · {p.range}</span>{/if}
                  {:else if p.status === 'dropped'}
                    {p.reason}
                  {:else}
                    {p.value}
                  {/if}
                </span>
                {#if p.status === 'clamped'}<span class="ptag warn">clamped</span>
                {:else if p.status === 'unverified'}<span class="ptag warn">?</span>
                {:else if p.status === 'dropped'}<span class="ptag loss">dropped</span>{/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .cbe {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg2);
    color: var(--text);
  }
  .cbe-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 11px;
    color: var(--textmuted);
    font-size: 13px;
    padding: 16px;
    text-align: center;
  }
  .e-icon {
    font-size: 20px;
  }

  .cbe-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--surface2, var(--border));
  }
  .hicon {
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #fff;
    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 65%, #000), color-mix(in srgb, var(--c) 30%, #000));
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  }
  .htitle {
    min-width: 0;
    line-height: 1.15;
  }
  .hname {
    font-size: 14px;
    font-weight: 800;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hsub {
    font: 500 9.5px/1.3 var(--font-mono, monospace);
    color: var(--textfaint, var(--textdim));
    letter-spacing: 0.06em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spacer {
    flex: 1;
  }
  .kept {
    flex: none;
    display: flex;
    align-items: center;
    height: 26px;
    padding: 0 10px;
    border-radius: 8px;
    font: 700 10px/1 var(--font-mono, monospace);
    letter-spacing: 0.03em;
    background: var(--surface);
    border: 1px solid var(--border2, var(--border));
    color: var(--text2, var(--text));
  }
  .kept.locked {
    color: var(--textmuted);
  }

  .banner {
    flex: none;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border2, var(--border));
  }
  .banner.unresolved {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    border-bottom-color: color-mix(in srgb, var(--danger) 35%, transparent);
  }
  .banner.substituted {
    background: color-mix(in srgb, var(--amber) 10%, transparent);
    border-bottom-color: color-mix(in srgb, var(--amber) 35%, transparent);
  }
  .banner.verified {
    background: color-mix(in srgb, var(--ok) 10%, transparent);
    border-bottom-color: color-mix(in srgb, var(--ok) 30%, transparent);
  }
  .b-icon {
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 800 14px/1 var(--font-mono, monospace);
    color: #10121a;
  }
  .banner.unresolved .b-icon {
    background: var(--danger);
  }
  .banner.substituted .b-icon {
    background: var(--amber);
  }
  .banner.verified .b-icon {
    background: var(--ok);
  }
  .b-text {
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }
  .b-title {
    font-size: 12.5px;
    font-weight: 700;
  }
  .banner.unresolved .b-title {
    color: var(--danger);
  }
  .banner.substituted .b-title {
    color: var(--amber);
  }
  .banner.verified .b-title {
    color: var(--ok);
  }
  .b-detail {
    font-size: 11px;
    color: var(--textdim);
  }
  .verify-btn {
    flex: none;
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 13px;
    border-radius: 8px;
    cursor: pointer;
    font: 700 11px/1 var(--font-ui, sans-serif);
    background: var(--amber);
    color: #10121a;
    border: 1px solid var(--amber);
  }
  .verify-btn:hover {
    filter: brightness(1.06);
  }

  .cbe-body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .picker {
    flex: none;
    width: 230px;
    border-right: 1px solid var(--surface2, var(--border));
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .picker-title {
    flex: none;
    padding: 9px 14px 7px;
    font: 700 9px/1.3 var(--font-mono, monospace);
    letter-spacing: 0.1em;
    color: var(--textfaint, var(--textdim));
  }
  .picker-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    scrollbar-width: thin;
  }
  .picker-note {
    padding: 8px 4px;
    font-size: 11.5px;
    color: var(--textdim);
  }
  .picker-note.err {
    color: var(--danger);
  }
  .invalid-chip {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 11px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    border: 1px dashed color-mix(in srgb, var(--danger) 50%, transparent);
  }
  .ic-x {
    font-size: 12px;
    color: var(--danger);
    flex: none;
  }
  .ic-text {
    min-width: 0;
    line-height: 1.2;
  }
  .ic-name {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--danger);
    text-decoration: line-through;
  }
  .ic-sub {
    font: 500 9px/1 var(--font-mono, monospace);
    color: var(--textmuted);
    margin-top: 3px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-radius: 9px;
    cursor: pointer;
    text-align: left;
    font: 600 12px/1.2 var(--font-ui, sans-serif);
    background: var(--surface);
    border: 1px solid var(--border2, var(--border));
    color: var(--text2, var(--text));
  }
  .opt:hover {
    border-color: var(--border3, var(--border));
  }
  .opt.current {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: var(--accent);
    color: var(--accent);
  }
  .opt-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .opt-cur {
    flex: none;
    font: 700 8px/1 var(--font-mono, monospace);
    letter-spacing: 0.06em;
    color: var(--accent);
  }

  .params {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    scrollbar-width: thin;
  }
  .params-locked {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    color: var(--textmuted);
    font-size: 12.5px;
    text-align: center;
  }
  .pl-icon {
    font-size: 16px;
    color: var(--danger);
    font-weight: 800;
  }
  .params-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
    gap: 8px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 11px;
    border-radius: 9px;
    background: var(--surface);
    border: 1px solid var(--border2, var(--border));
  }
  .prow.clamped,
  .prow.unverified {
    border-color: color-mix(in srgb, var(--amber) 28%, var(--border2, var(--border)));
  }
  .prow.dropped {
    border-color: color-mix(in srgb, var(--danger) 25%, var(--border2, var(--border)));
    opacity: 0.72;
  }
  .pdot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .pname {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pname.strike {
    text-decoration: line-through;
    color: var(--textmuted);
  }
  .pval {
    font: 600 11px/1.2 var(--font-mono, monospace);
    color: var(--text2, var(--textdim));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 55%;
    text-align: right;
  }
  .prow.clamped .pval,
  .prow.unverified .pval {
    color: var(--amber);
  }
  .prow.dropped .pval {
    color: var(--textmuted);
  }
  .prange {
    color: var(--textfaint, var(--textmuted));
  }
  .ptag {
    flex: none;
    font: 700 8px/1 var(--font-mono, monospace);
    letter-spacing: 0.05em;
    color: #10121a;
    border-radius: 5px;
    padding: 3px 5px;
  }
  .ptag.warn {
    background: var(--amber);
  }
  .ptag.loss {
    background: var(--danger);
  }
</style>
