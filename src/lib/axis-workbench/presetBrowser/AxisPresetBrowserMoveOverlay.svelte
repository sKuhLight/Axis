<script lang="ts">
  // §4.6 Move overlay — the multi-column device grid that is both the picker and the outcome preview.
  // Every cell shows only a preset name; the column header carries the slot range.
  //
  // Staging model: each DRAG stages an independent move (grab any cell → drop on a destination), and
  // clicking cells builds the working set that the next drag moves. Staged moves are listed as
  // removable chips and applied together on confirm, as ONE snapshot-first permutation. Clicking cells
  // therefore never disturbs a staged move.
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { library } from '$lib/preset/library.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
  import {
    resolveAxisPbMoveBatch,
    type AxisPbMoveFailure,
    type AxisPbMoveStep
  } from './presetBrowserWorkbenchMove';
  import type { AxisPresetBrowserPartView } from './presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();

  // 8 cells per column (decided geometry) — the header shows each column's first slot.
  const COLUMN_ROWS = 8;

  const open = $derived(view.snapshot.moveOpen);
  const staged = $derived(view.moveStagedMoves());
  // The working set is chosen INSIDE the dialog (click cells); it's what the next drag moves.
  const working = $derived(view.moveSelectionSlots());
  const live = $derived(view.snapshot.moveDestination);
  const count = $derived(deviceSession.presetCount);

  const pad = (n: number) => String(n).padStart(3, '0');

  function failureText(reason: AxisPbMoveFailure): string {
    switch (reason) {
      case 'empty-selection': return 'Pick at least one preset';
      case 'not-contiguous': return 'Pick a contiguous run of presets';
      case 'conflicting-moves': return 'That slot is already used by a staged move';
      case 'selection-out-of-range':
      case 'destination-out-of-range': return 'That destination is out of range';
    }
  }

  const plan = (steps: readonly AxisPbMoveStep[]) =>
    resolveAxisPbMoveBatch(steps, { slotCount: count, isEmpty: (slot) => library.slotIsEmpty(slot) });

  const workingStep = $derived<AxisPbMoveStep | null>(
    working.length && live != null ? { selection: working, destination: live } : null
  );
  const stagedResult = $derived(plan(staged));
  const workingResult = $derived(workingStep ? plan([workingStep]) : null);
  // The grid previews the union whenever it merges. If the in-progress move is bad, or clashes with a
  // staged one, the staged moves STAY previewed and this move is reported instead of wiping them.
  const merged = $derived(workingStep ? plan([...staged, workingStep]) : null);
  const combined = $derived(merged && merged.ok ? merged : stagedResult);

  // Shift-click extends from the last clicked cell; reset it whenever the dialog closes.
  let anchor = $state<number | null>(null);
  $effect(() => {
    if (!open) {
      anchor = null;
      stageNote = null;
    }
  });

  // Immediate feedback for a drop that couldn't be staged (kept until the next interaction).
  let stageNote = $state<string | null>(null);

  // A move needs a contiguous run — report that as soon as the set is broken, not only on drop.
  const workingContiguous = $derived(
    working.length < 2 || working.every((slot, i) => i === 0 || slot === working[i - 1]! + 1)
  );

  const notice = $derived.by((): { text: string; bad: boolean } => {
    if (stageNote) return { text: stageNote, bad: true };
    if (working.length && !workingContiguous) return { text: 'Pick a contiguous run of presets', bad: true };
    if (workingResult && !workingResult.ok) return { text: failureText(workingResult.reason), bad: true };
    if (merged && !merged.ok) return { text: failureText(merged.reason), bad: true };
    if (working.length && !workingStep) return { text: 'Drag the set onto a destination (or ⌥-click one)', bad: false };
    if (!working.length && !staged.length) {
      return { text: 'Drag a preset onto a destination, or click presets to pick a set', bad: false };
    }
    return { text: '', bad: false };
  });
  const planHasWrites = $derived(combined.ok && combined.plan.writes.length > 0);
  const writesCount = $derived(combined.ok ? combined.plan.writes.length : 0);
  // Every preset the user is deliberately moving (across all staged moves + the pending one); a write
  // whose source is NOT one of these is a displaced preset swapping back.
  const sources = $derived(
    new Set([...staged, ...(workingStep ? [workingStep] : [])].flatMap((s) => [...s.selection]))
  );
  const swapCount = $derived(
    combined.ok ? combined.plan.writes.filter((w) => !sources.has(w.from)).length : 0
  );

  const countLabel = $derived(
    staged.length && working.length
      ? `${staged.length} staged · ${working.length} selected`
      : staged.length
        ? `${staged.length} staged`
        : working.length
          ? `${working.length} selected`
          : 'Nothing staged'
  );

  function runLabel(step: AxisPbMoveStep): string {
    const run = [...step.selection].sort((a, b) => a - b);
    return run.length === 1 ? pad(run[0]!) : `${pad(run[0]!)}–${pad(run[run.length - 1]!)}`;
  }

  function onCellClick(e: MouseEvent, slot: number) {
    stageNote = null;
    // ⌥-click sets the destination — the click-only alternative to dragging the block.
    if (e.altKey) {
      view.setMoveDestination(slot);
      return;
    }
    // Shift-click grows the working set into a contiguous run from the last click.
    if (e.shiftKey && anchor != null) {
      const lo = Math.min(anchor, slot);
      const hi = Math.max(anchor, slot);
      view.setMoveSource(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
      return;
    }
    view.toggleMoveSource(slot);
    anchor = slot;
  }

  function clearAll() {
    view.clearMoves();
    anchor = null;
    stageNote = null;
  }

  // Drag & drop: grab ANY cell and drop it on a destination. Grabbing a cell outside the working set
  // makes that cell the set, so a single preset is moved in one gesture — no click-to-select first.
  // The preview recolours live under the pointer, so the drop is never a surprise.
  let dragging = $state(false);
  const isWorking = (slot: number) => working.includes(slot);

  function onCellDragStart(e: DragEvent, slot: number) {
    stageNote = null;
    if (!isWorking(slot)) {
      view.setMoveSource([slot]);
      anchor = slot;
    }
    dragging = true;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(slot));
    }
  }
  function onCellDragOver(e: DragEvent, slot: number) {
    if (!dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    // The controller no-ops on an unchanged slot, so this only re-renders when the target moves.
    if (view.snapshot.moveDestination !== slot) view.setMoveDestination(slot);
  }
  function onCellDrop(e: DragEvent, slot: number) {
    e.preventDefault();
    if (!dragging) return;
    view.setMoveDestination(slot);
    stage();
    dragging = false;
  }
  function onCellDragEnd() {
    dragging = false;
  }

  /** Commit the working move as a staged one — unless it's impossible or a no-op, which is reported
   *  in place rather than staged (and never applied). */
  function stage() {
    if (!workingStep) return;
    if (workingResult && !workingResult.ok) {
      stageNote = failureText(workingResult.reason);
      return;
    }
    if (workingResult?.ok && !workingResult.plan.writes.length) {
      stageNote = 'Those presets are already in that position';
      return;
    }
    if (merged && !merged.ok) {
      stageNote = failureText(merged.reason);
      return;
    }
    view.stageMove();
    anchor = null;
    stageNote = null;
  }

  interface Cell {
    slot: number;
    label: string;
    empty: boolean;
    role: string;
  }
  interface Column {
    header: string;
    cells: Cell[];
  }

  // What each slot will hold after ALL staged + pending moves — the whole colour vocabulary.
  const preview = $derived.by(() => {
    const roles = new Map<number, string>();
    const labels = new Map<number, string>();
    if (!combined.ok || !combined.plan.writes.length) {
      for (const slot of working) roles.set(slot, 'source');
      return { roles, labels };
    }
    for (const w of combined.plan.writes) {
      roles.set(w.to, library.slotIsEmpty(w.from) ? 'cleared' : sources.has(w.from) ? 'moved' : 'swap');
      labels.set(w.to, library.nameOfSlot(w.from));
    }
    for (const slot of combined.plan.unchanged) roles.set(slot, 'kept');
    for (const slot of working) if (!roles.has(slot)) roles.set(slot, 'source');
    return { roles, labels };
  });

  const columns = $derived.by(() => {
    const cols: Column[] = [];
    for (let start = 0; start < count; start += COLUMN_ROWS) {
      const cells: Cell[] = [];
      for (let slot = start; slot < Math.min(start + COLUMN_ROWS, count); slot++) {
        // A landed label wins over the slot's current contents; '' means the slot ends up empty.
        const name = preview.labels.get(slot) ?? library.nameOfSlot(slot);
        cells.push({
          slot,
          label: name || 'Empty',
          empty: !name,
          role: preview.roles.get(slot) ?? 'plain'
        });
      }
      cols.push({ header: pad(start), cells });
    }
    return cols;
  });
</script>

<Dialog
  {open}
  title="Move presets"
  width="min(980px, 94vw)"
  maxHeight="86vh"
  onClose={() => view.closeMove()}
  labelledBy="pb-move-title"
>
  <div class="mv">
    <div class="mv-bar">
      <span class="mv-count">{countLabel}</span>
      {#if planHasWrites && combined.ok}
        <span class="chip moved">→ {writesCount} write{writesCount === 1 ? '' : 's'}</span>
        {#if swapCount}<span class="chip swap">{swapCount} swap back</span>{/if}
        {#if combined.plan.cleared.length}<span class="chip cleared">{combined.plan.cleared.length} left empty</span>{/if}
      {/if}
      {#if notice.text}
        <span class="mv-hint" class:bad={notice.bad}>{notice.text}</span>
      {/if}
      {#if staged.length || working.length}
        <span class="mv-sp"></span>
        <button type="button" class="mv-clear" onclick={clearAll}>Clear</button>
      {/if}
    </div>

    {#if staged.length}
      <div class="mv-staged">
        {#each staged as step, i}
          <button
            type="button"
            class="mv-chip-move"
            title="Remove this staged move"
            onclick={() => { view.unstageMove(i); stageNote = null; }}
          >
            <span class="mv-chip-run">{runLabel(step)}</span>
            <span class="mv-chip-arrow" aria-hidden="true">→</span>
            <span class="mv-chip-dest">{pad(step.destination)}</span>
            <span class="mv-chip-x" aria-hidden="true">✕</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="mv-grid" class:dragging>
      {#each columns as col}
        <div class="mv-col">
          <div class="mv-ch">{col.header}</div>
          {#each col.cells as cell}
            <button
              type="button"
              class="mv-cell {cell.role}"
              class:empty={cell.empty}
              draggable="true"
              title={cell.label}
              onclick={(e) => onCellClick(e, cell.slot)}
              ondragstart={(e) => onCellDragStart(e, cell.slot)}
              ondragover={(e) => onCellDragOver(e, cell.slot)}
              ondrop={(e) => onCellDrop(e, cell.slot)}
              ondragend={onCellDragEnd}
            >{cell.label}</button>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  {#snippet footer()}
    <div class="mv-foot">
      <span class="mv-note">Drag a preset onto a destination · stage as many as you like, then confirm · Esc cancels</span>
      <span class="mv-sp"></span>
      <button type="button" class="mv-btn" onclick={() => view.closeMove()}>Cancel</button>
      <button
        type="button"
        class="mv-btn accent"
        disabled={!planHasWrites}
        onclick={() => view.confirmMove()}
      >{writesCount ? `Move ${writesCount}` : 'Move'}</button>
    </div>
  {/snippet}
</Dialog>

<style>
  .mv {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 16px 18px 6px;
  }
  .mv-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .mv-count {
    color: var(--text);
    font: 700 13px/1 var(--font-ui);
  }
  .mv-hint,
  .mv-note {
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
    min-width: 0;
  }
  .mv-hint.bad {
    color: var(--amberink);
  }
  .chip {
    font: 700 10px/1 var(--font-mono);
    padding: 5px 7px;
    border-radius: 6px;
    border: 1px solid var(--border2);
    background: var(--surface2);
    color: var(--textdim);
    white-space: nowrap;
  }
  .chip.moved {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }
  .chip.swap {
    color: var(--amberink);
    border-color: color-mix(in srgb, var(--amber) 45%, var(--border));
  }
  .chip.cleared {
    color: var(--text2);
    border-color: var(--border3);
  }

  /* Staged moves — one removable chip per pending move, applied together on confirm. */
  .mv-staged {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  .mv-chip-move {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 10%, var(--surface2));
    color: var(--text2);
    font: 700 10px/1 var(--font-mono);
    cursor: pointer;
  }
  .mv-chip-move:hover {
    border-color: var(--accent);
  }
  .mv-chip-run,
  .mv-chip-dest {
    color: var(--accent);
  }
  .mv-chip-arrow {
    color: var(--textdim);
  }
  .mv-chip-x {
    color: var(--textdim);
    font-size: 9px;
  }
  .mv-chip-move:hover .mv-chip-x {
    color: var(--text);
  }

  /* Multiple columns, horizontally scrollable. Cells show only the preset name. */
  .mv-grid {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 6px;
    min-width: 0;
  }
  .mv-col {
    flex: 0 0 auto;
    width: 112px;
    display: grid;
    gap: 4px;
    align-content: start;
  }
  .mv-ch {
    color: var(--textfaint);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-align: center;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 2px;
  }
  .mv-cell {
    width: 100%;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border2);
    border-radius: 7px;
    background: var(--surface2);
    color: var(--text2);
    font: 600 12px/1 var(--font-ui);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: grab;
  }
  .mv-cell:hover {
    border-color: var(--border3);
  }
  .mv-cell:active {
    cursor: grabbing;
  }
  /* While dragging, every cell reads as a drop target; the live recolour shows what the drop does. */
  .mv-grid.dragging .mv-cell {
    border-style: dashed;
    cursor: copy;
  }
  .mv-cell.empty {
    border-style: dashed;
    background: var(--input);
    color: var(--textfaint);
    font-weight: 500;
    font-style: italic;
  }
  .mv-cell.source,
  .mv-cell.kept {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    color: var(--accent);
    font-weight: 750;
  }
  .mv-cell.moved {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
    color: var(--accent);
    font-weight: 750;
  }
  .mv-cell.swap {
    border-color: color-mix(in srgb, var(--amber) 55%, var(--border));
    background: color-mix(in srgb, var(--amber) 12%, var(--surface));
    color: var(--amberink);
    font-weight: 700;
  }
  .mv-cell.cleared {
    border-color: var(--border3);
    background: var(--input);
    color: var(--textdim);
    font-style: italic;
  }

  .mv-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }
  .mv-sp {
    flex: 1;
  }
  .mv-clear {
    font: 700 10px/1 var(--font-mono);
    padding: 6px 9px;
    border-radius: 7px;
    border: 1px solid var(--border3);
    background: var(--surface2);
    color: var(--textdim);
    cursor: pointer;
    white-space: nowrap;
  }
  .mv-clear:hover {
    color: var(--text2);
    border-color: var(--border3);
  }
  .mv-btn {
    font: 700 13px/1 var(--font-ui);
    padding: 10px 14px;
    border-radius: 9px;
    border: 1px solid var(--border3);
    background: var(--surface2);
    color: var(--text2);
    cursor: pointer;
  }
  .mv-btn.accent {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink);
  }
  .mv-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
