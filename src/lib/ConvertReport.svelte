<script lang="ts">
  // Cross-device conversion diff report (P4a · META-24 · AXIS-47/48). Renders a ConvertResponse:
  // source→target header + decode-depth caveat, severity summary chips, a severity/free-text filter,
  // and the event list grouped by severity (loss → warn → info) then by kind. Rows that reference a
  // block are clickable to focus that block IN THE CURRENT EDITOR (best-effort — P4b rewires the hook
  // for the fake grid). All formatting/grouping/filtering is the pure convertReport.ts (tested there).
  import type { ConvertResponse, ConverterDeviceId } from './types';
  import {
    deviceName,
    formatEvent,
    filterEvents,
    groupEvents,
    summarize,
    type Severity
  } from './convertReport';

  let {
    result,
    targetDevice,
    onFocusBlock,
    blockAvailable
  }: {
    result: ConvertResponse;
    /** The device the preset was converted TO (for the header). */
    targetDevice?: ConverterDeviceId;
    /** Focus a block referenced by a row. Returns true if it landed somewhere. P4b rewires to the fake grid. */
    onFocusBlock?: (blockKey: string, family: string) => boolean;
    /** Whether a referenced block can currently be focused (drives the clickable state + tooltip). */
    blockAvailable?: (blockKey: string, family: string) => boolean;
  } = $props();

  const SEV_LABEL: Record<Severity, string> = { loss: 'Losses', warn: 'Warnings', info: 'Info' };

  // ── filter state ──
  let activeSeverities = $state<Set<Severity>>(new Set());
  let query = $state('');

  function toggleSeverity(s: Severity) {
    const next = new Set(activeSeverities);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    activeSeverities = next;
  }

  const filtered = $derived(filterEvents(result.events, { severities: activeSeverities, text: query }));
  const groups = $derived(groupEvents(filtered));
  const filteredTally = $derived(summarize(filtered));
  const sourcePartial = $derived(result.events.find((e) => e.kind === 'source-partial'));
  const targetName = $derived(targetDevice ? deviceName(targetDevice) : result.target.name || 'target');

  function rowClick(blockKey: string | undefined, family: string) {
    if (!blockKey) return;
    onFocusBlock?.(blockKey, family);
  }
</script>

<div class="report">
  <header class="rhead">
    <div class="route">
      <span class="dev src">{result.source.device}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="dev tgt">{targetName}</span>
    </div>
    <div class="pname" title={result.source.name}>{result.source.name || '(unnamed preset)'}</div>
  </header>

  {#if sourcePartial && sourcePartial.kind === 'source-partial'}
    <div class="caveat" role="note">
      <span class="cic" aria-hidden="true">⚠</span>
      <div>
        <b>Source decoded partially — “{sourcePartial.decodeDepth}”.</b>
        <span>{sourcePartial.detail} The conversion below is based on what could be read.</span>
      </div>
    </div>
  {/if}

  <!-- summary chips double as severity filters -->
  <div class="chips" role="group" aria-label="Filter by severity">
    <button class="chip total" class:dim={activeSeverities.size > 0} onclick={() => (activeSeverities = new Set())} title="Show all">
      <span class="cnum">{result.summary.total}</span><span class="clab">total</span>
    </button>
    {#each ['loss', 'warn', 'info'] as const as s (s)}
      <button
        class="chip {s}"
        class:on={activeSeverities.has(s)}
        class:dim={activeSeverities.size > 0 && !activeSeverities.has(s)}
        onclick={() => toggleSeverity(s)}
        title="Filter: {SEV_LABEL[s]}"
      >
        <span class="cnum">{result.summary[s]}</span><span class="clab">{SEV_LABEL[s]}</span>
      </button>
    {/each}
    <input class="q" type="search" placeholder="Filter events…" bind:value={query} aria-label="Filter events by text" />
  </div>

  {#if result.events.length === 0}
    <div class="empty ok">
      <span aria-hidden="true">✓</span> Clean conversion — no changes to report.
    </div>
  {:else if filtered.length === 0}
    <div class="empty">No events match the current filter.</div>
  {:else}
    <div class="groups">
      {#each groups as g (g.severity)}
        <section class="sevgroup {g.severity}">
          <h3 class="sevhead">
            <span class="sevdot" aria-hidden="true"></span>
            {SEV_LABEL[g.severity]}
            <span class="badge">{g.count}</span>
          </h3>
          {#each g.kinds as kg (kg.kind)}
            <div class="kindgroup">
              <div class="kindlabel">{kg.kind}<span class="kbadge">{kg.events.length}</span></div>
              <ul class="rows">
                {#each kg.events as e, i (kg.kind + i)}
                  {@const f = formatEvent(e)}
                  {@const canFocus = !!f.blockKey && (blockAvailable ? blockAvailable(f.blockKey, 'family' in e ? e.family : '') : true)}
                  <li class="row" class:clickable={canFocus}>
                    {#if f.blockKey}
                      <button
                        class="rowbtn"
                        disabled={!canFocus}
                        title={canFocus ? 'Focus this block in the editor' : 'This block isn’t in the current editor view'}
                        onclick={() => rowClick(f.blockKey, 'family' in e ? e.family : '')}
                      >
                        <span class="rtitle">{f.title}</span>
                        {#if f.detail}<span class="rdetail">{f.detail}</span>{/if}
                      </button>
                    {:else}
                      <div class="rowstatic">
                        <span class="rtitle">{f.title}</span>
                        {#if f.detail}<span class="rdetail">{f.detail}</span>{/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/each}
    </div>
    {#if activeSeverities.size > 0 || query}
      <div class="fnote">Showing {filteredTally.total} of {result.summary.total} events.</div>
    {/if}
  {/if}
</div>

<style>
  .report { display: flex; flex-direction: column; gap: 12px; }
  .rhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .route { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; }
  .dev { color: var(--text); }
  .dev.tgt { color: var(--accent); }
  .arrow { color: var(--textdim); font-weight: 400; }
  .pname { font-family: var(--font-mono, monospace); font-size: 12.5px; color: var(--textdim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }

  .caveat { display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--amber, #e0a53a) 45%, transparent); background: color-mix(in srgb, var(--amber, #e0a53a) 12%, transparent); font-size: 12px; }
  .caveat .cic { color: var(--amber, #e0a53a); font-size: 15px; line-height: 1.2; }
  .caveat b { display: block; color: var(--text); margin-bottom: 2px; }
  .caveat span { color: var(--textdim); }

  .chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--border2); background: var(--bg2); color: var(--text); cursor: pointer; font-size: 12px; transition: opacity 0.12s, border-color 0.12s; }
  .chip .cnum { font-weight: 800; font-variant-numeric: tabular-nums; }
  .chip .clab { color: var(--textdim); }
  .chip.dim { opacity: 0.42; }
  .chip.loss { border-color: color-mix(in srgb, var(--danger, #d6543f) 55%, var(--border2)); }
  .chip.loss.on { background: color-mix(in srgb, var(--danger, #d6543f) 20%, var(--bg2)); }
  .chip.loss .cnum { color: var(--danger, #d6543f); }
  .chip.warn { border-color: color-mix(in srgb, var(--amber, #e0a53a) 55%, var(--border2)); }
  .chip.warn.on { background: color-mix(in srgb, var(--amber, #e0a53a) 20%, var(--bg2)); }
  .chip.warn .cnum { color: var(--amber, #e0a53a); }
  .chip.info { border-color: color-mix(in srgb, var(--accent) 55%, var(--border2)); }
  .chip.info.on { background: color-mix(in srgb, var(--accent) 18%, var(--bg2)); }
  .chip.info .cnum { color: var(--accent); }
  .chip.total .cnum { color: var(--text); }
  .q { flex: 1; min-width: 130px; height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid var(--border2); background: var(--surface); color: var(--text); font-size: 12px; }
  .q:focus { outline: none; border-color: var(--accent); }

  .empty { padding: 20px; text-align: center; color: var(--textdim); font-size: 13px; border: 1px dashed var(--border2); border-radius: 10px; }
  .empty.ok { color: var(--ok, #33c46b); border-color: color-mix(in srgb, var(--ok, #33c46b) 40%, transparent); }

  .groups { display: flex; flex-direction: column; gap: 14px; }
  .sevgroup { border: 1px solid var(--border2); border-radius: 11px; overflow: hidden; }
  .sevhead { display: flex; align-items: center; gap: 8px; margin: 0; padding: 9px 12px; font-size: 12.5px; font-weight: 700; background: var(--bg2); border-bottom: 1px solid var(--border2); }
  .sevdot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .sevgroup.loss .sevdot { background: var(--danger, #d6543f); }
  .sevgroup.warn .sevdot { background: var(--amber, #e0a53a); }
  .sevgroup.info .sevdot { background: var(--accent); }
  .badge { margin-left: auto; font-size: 11px; font-weight: 800; color: var(--textdim); font-variant-numeric: tabular-nums; }

  .kindgroup { padding: 8px 12px; border-top: 1px solid color-mix(in srgb, var(--border2) 55%, transparent); }
  .kindgroup:first-of-type { border-top: none; }
  .kindlabel { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono, monospace); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--textdim); margin-bottom: 5px; }
  .kbadge { font-size: 10px; color: var(--textdim); opacity: 0.75; }

  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .row { border-radius: 8px; }
  .rowbtn, .rowstatic { display: flex; flex-direction: column; gap: 1px; width: 100%; text-align: left; padding: 6px 9px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--text); font-size: 12.5px; }
  .rowbtn { cursor: pointer; }
  .row.clickable .rowbtn:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
  .rowbtn:disabled { cursor: default; }
  .rtitle { color: var(--text); }
  .rdetail { font-size: 11px; color: var(--textdim); }

  .fnote { font-size: 11px; color: var(--textdim); text-align: right; }

  @media (max-width: 560px) {
    .pname { max-width: 100%; }
  }
</style>
