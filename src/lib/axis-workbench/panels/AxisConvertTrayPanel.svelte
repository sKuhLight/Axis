<script lang="ts">
  // Cross-device converter TRAY + REPORT (Phase 2 · META-24 · AXIS-48). Two tray sections — UNPLACED
  // (placeable: drag from the source grid or "Place") and DROPPED (no target equivalent — listed for
  // awareness with the reason, not placeable) — plus a severity legend and the conversion report grouped
  // loss→warn→info via the convertConflicts foundation (`reportGroups`), each row a severity chip +
  // click-to-locate (focus the block + open its cell) + RESOLVED ✓ once cleared. Sets the offline surface
  // into context so a focus hop can drive the offline editor.
  import { setContext } from 'svelte';
  import { EDITOR_SURFACE_KEY } from '../../editorSurface';
  import { convertEditor } from '../../convertEditor.svelte';
  setContext(EDITOR_SURFACE_KEY, convertEditor);

  import type { PanelInstance } from '../../workbench';
  import type { Cell } from '../../grid';
  import { convert } from '../../convert.svelte';
  import { convertScratch } from '../../convertScratch.svelte';
  import { reportGroups, sevToken } from '../../convertConflicts';
  import { familyLabel, type Severity } from '../../convertReport';

  let { panel: _panel }: { panel: PanelInstance } = $props();

  const tray = $derived(convertScratch.tray);
  const placingKey = $derived(convertScratch.placingKey);
  const canRoute = $derived(convertEditor.canGridRoute);
  const events = $derived(convert.result?.events ?? []);
  const scratch = $derived(convertScratch.state);

  // Dropped blocks (no target equivalent) — informational, not placeable.
  const dropped = $derived(
    events.flatMap((e) =>
      e.kind === 'block-dropped'
        ? [{ key: e.blockKey, name: familyLabel(e.family), reason: dropReason(e.reason) }]
        : []
    )
  );
  function dropReason(reason: 'family-missing' | 'capacity-exceeded' | 'instance-limit'): string {
    return reason === 'family-missing'
      ? 'family-missing — not available on the target'
      : reason === 'capacity-exceeded'
        ? 'capacity-exceeded — target ran out of slots'
        : 'instance-limit — exceeds the target’s limit';
  }

  const groups = $derived(convert.result && scratch ? reportGroups(events, scratch) : []);
  const legend: { sev: Severity; label: string; desc: string }[] = [
    { sev: 'info', label: 'INFO', desc: 'preserved · verify' },
    { sev: 'warn', label: 'WARN', desc: 'adjusted' },
    { sev: 'loss', label: 'LOSS', desc: 'lost · action' }
  ];

  let reportOpen = $state(true);

  function labelFor(family: string, typeName?: string): string {
    return typeName || familyLabel(family) || 'Block';
  }

  // Focus a block: set the resolve focus and, when placed, open its cell in the offline block editor.
  function focusBlock(blockKey: string): boolean {
    const s = convertScratch.state;
    const b = s?.blocks.find((x) => x.key === blockKey);
    if (!b) return false;
    convertScratch.focusKey = blockKey;
    if (b.position) void convertEditor.openCell({ row: b.position.row, col: b.position.col } as Cell);
    return true;
  }
  // Report row click-to-locate: 't:<key>' / 'tray:<key>' focus the block; 'src:'/'' are non-locatable.
  function locate(loc: string) {
    const [kind, id] = loc.split(':');
    if ((kind === 't' || kind === 'tray') && id) focusBlock(id);
  }
</script>

<div class="axis-convert-tray">
  <!-- UNPLACED -->
  <section class="tray-sec">
    <header class="sec-head"><span>Unplaced · drag onto the grid to place</span><em>{tray.length}</em></header>
    {#if !canRoute}
      <p class="route-note">Cable editing coming soon</p>
    {/if}
    {#if tray.length}
      <ul class="tray-list">
        {#each tray as block (block.key)}
          <li class="tray-row unplaced" class:armed={placingKey === block.key}>
            <span class="tr-name" title={block.family}>{labelFor(block.family, block.typeName)}</span>
            <span class="tr-actions">
              <button
                type="button"
                class="tr-btn place"
                class:on={placingKey === block.key}
                onclick={() => convertScratch.arm(block.key)}
              >{placingKey === block.key ? 'Placing…' : 'Place'}</button>
              <button type="button" class="tr-btn danger" onclick={() => convertScratch.discard(block.key)}>Discard</button>
            </span>
          </li>
        {/each}
      </ul>
      {#if placingKey}
        <p class="arm-hint">Click an empty grid cell to place the armed block.</p>
      {/if}
    {:else}
      <p class="tray-empty"><span class="ok-tick">✓</span> Everything convertible is placed.</p>
    {/if}
  </section>

  <!-- DROPPED -->
  {#if dropped.length}
    <section class="tray-sec">
      <header class="sec-head"><span>Dropped · no target equivalent</span><em>{dropped.length}</em></header>
      <ul class="tray-list">
        {#each dropped as d (d.key)}
          <li class="tray-row dropped">
            <div class="tr-text">
              <span class="tr-name">{d.name}</span>
              <span class="tr-reason">{d.reason}</span>
            </div>
            <span class="drop-tag">DROPPED</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- REPORT -->
  {#if convert.result}
    <section class="report-sec">
      <button type="button" class="report-toggle" class:open={reportOpen} onclick={() => (reportOpen = !reportOpen)}>
        <span class="chev" aria-hidden="true"></span>
        Conversion report
        <em>{convert.result.summary.total}</em>
      </button>

      {#if reportOpen}
        <!-- severity legend (shared language across every surface) -->
        <div class="legend">
          {#each legend as l (l.sev)}
            <span class="leg" title={l.desc}>
              <span class="leg-dot" style="background:{sevToken(l.sev)};"></span>
              <span class="leg-label" style="color:{sevToken(l.sev)};">{l.label}</span>
              <span class="leg-desc">{l.desc}</span>
            </span>
          {/each}
        </div>

        <div class="report-body">
          {#if groups.length === 0}
            <div class="rep-empty"><span class="ok-tick">✓</span> Clean conversion — nothing to resolve.</div>
          {:else}
            {#each groups as g (g.sev)}
              <div class="grp-head">
                <span class="grp-dot" style="background:{sevToken(g.sev)};"></span>
                <span class="grp-label" style="color:{sevToken(g.sev)};">{g.label}</span>
                <span class="grp-count">{g.rows.length}</span>
                <span class="grp-rule"></span>
              </div>
              <div class="grp-rows">
                {#each g.rows as r, i (g.sev + i)}
                  <button
                    type="button"
                    class="rep-row"
                    class:locatable={r.loc.startsWith('t:') || r.loc.startsWith('tray:')}
                    onclick={() => locate(r.loc)}
                  >
                    <span
                      class="rchip"
                      class:done={r.done}
                      style={r.done ? '' : `color:${sevToken(g.sev)}; background:color-mix(in srgb, ${sevToken(g.sev)} 15%, transparent);`}
                    >{r.done ? 'RESOLVED' : g.label}</span>
                    <span class="rtext">
                      <span class="rtitle">{r.title}</span>
                      <span class="rdetail">{r.detail}</span>
                    </span>
                    {#if r.done}<span class="rdone">✓</span>
                    {:else if r.loc.startsWith('t:') || r.loc.startsWith('tray:')}<span class="rlocate">⌖</span>{/if}
                  </button>
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .axis-convert-tray {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    padding: 12px;
    background: var(--bg2);
    color: var(--text);
  }
  .sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: var(--textfaint, var(--textdim));
    font: 700 9px/1.3 var(--font-mono, monospace);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .sec-head em {
    font-style: normal;
    color: var(--accent);
  }
  .route-note {
    margin: 0 0 8px;
    font-size: 11px;
    color: var(--textdim);
  }
  .tray-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .tray-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 11px;
    border-radius: 11px;
    background: var(--surface, var(--bg));
    border: 1px solid var(--border2, var(--border));
  }
  .tray-row.unplaced {
    border-color: color-mix(in srgb, var(--amber) 40%, var(--border2, var(--border)));
  }
  .tray-row.armed {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface, var(--bg)));
  }
  .tray-row.dropped {
    opacity: 0.9;
    filter: grayscale(0.35);
  }
  .tr-text {
    min-width: 0;
    line-height: 1.25;
  }
  .tr-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 700;
    display: block;
  }
  .tr-reason {
    font-size: 10.5px;
    color: var(--danger);
  }
  .drop-tag {
    flex: none;
    font: 700 8px/1 var(--font-mono, monospace);
    letter-spacing: 0.06em;
    color: var(--danger);
    border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
    border-radius: 6px;
    padding: 4px 6px;
  }
  .tr-actions {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .tr-btn {
    padding: 4px 11px;
    border-radius: 8px;
    border: 1px solid var(--border2, var(--border));
    background: transparent;
    color: var(--text);
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .tr-btn:hover {
    border-color: var(--border3, var(--border));
  }
  .tr-btn.place {
    background: color-mix(in srgb, var(--amber) 16%, transparent);
    border-color: color-mix(in srgb, var(--amber) 50%, transparent);
    color: var(--amber);
  }
  .tr-btn.place.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .tr-btn.danger:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
  .arm-hint,
  .tray-empty {
    margin: 8px 0 0;
    font-size: 11.5px;
    color: var(--textdim);
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .ok-tick {
    color: var(--ok);
  }

  .report-sec {
    border-top: 1px solid var(--border2, var(--border));
    padding-top: 10px;
  }
  .report-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 0;
    border: none;
    background: transparent;
    color: var(--textfaint, var(--textdim));
    font: 700 9px/1 var(--font-mono, monospace);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .report-toggle em {
    margin-left: auto;
    font-style: normal;
    color: var(--accent);
  }
  .chev {
    width: 7px;
    height: 7px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(-45deg);
    transition: transform 0.12s;
  }
  .report-toggle.open .chev {
    transform: rotate(45deg);
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin: 10px 0 4px;
  }
  .leg {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 6px;
    border-radius: 7px;
    background: var(--surface, var(--bg));
    border: 1px solid var(--border2, var(--border));
  }
  .leg-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }
  .leg-label {
    font: 700 8.5px/1 var(--font-mono, monospace);
  }
  .leg-desc {
    font-size: 9.5px;
    color: var(--textdim);
  }

  .report-body {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .rep-empty {
    padding: 16px;
    text-align: center;
    color: var(--textdim);
    font-size: 12.5px;
    border: 1px dashed color-mix(in srgb, var(--ok) 40%, var(--border2, var(--border)));
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
  }
  .grp-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0 6px;
  }
  .grp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .grp-label {
    font: 700 9.5px/1 var(--font-mono, monospace);
    letter-spacing: 0.12em;
  }
  .grp-count {
    font: 600 9.5px/1 var(--font-mono, monospace);
    color: var(--textfaint, var(--textdim));
  }
  .grp-rule {
    flex: 1;
    height: 1px;
    background: var(--surface2, var(--border2));
  }
  .grp-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }
  .rep-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 11px;
    border-radius: 10px;
    background: var(--surface, var(--bg));
    border: 1px solid var(--border2, var(--border));
    text-align: left;
    cursor: default;
    color: var(--text);
    width: 100%;
  }
  .rep-row.locatable {
    cursor: pointer;
  }
  .rep-row.locatable:hover {
    border-color: var(--border3, var(--border));
    background: var(--surface2, var(--surface));
  }
  .rchip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    height: 20px;
    padding: 0 8px;
    border-radius: 6px;
    flex: none;
    font: 700 8.5px/1 var(--font-mono, monospace);
    letter-spacing: 0.06em;
    border: 1px solid transparent;
  }
  .rchip.done {
    color: var(--ok);
    background: color-mix(in srgb, var(--ok) 14%, transparent);
    border-color: color-mix(in srgb, var(--ok) 45%, transparent);
  }
  .rtext {
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }
  .rtitle {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rdetail {
    display: block;
    font-size: 10.5px;
    color: var(--textdim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rdone {
    color: var(--ok);
    flex: none;
    font-size: 13px;
  }
  .rlocate {
    color: var(--textmuted);
    flex: none;
    font-size: 13px;
  }
</style>
