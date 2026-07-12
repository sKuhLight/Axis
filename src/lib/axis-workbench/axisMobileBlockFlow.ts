import type {
  WidgetInstance,
  WorkbenchCommand,
  WorkbenchDocument,
  WorkbenchLayout
} from '../workbench/core';
import { activeWorkbenchPage, selectActiveLayout } from '../workbench/core';
import { AXIS_MOBILE_BLOCK_EXPAND_RATIO } from './axisMobileBlockFlowConstants';

/**
 * Phone-profile "block-open" flow (operator T31 / R9d).
 *
 * On the phone profile only, when a block becomes active/clicked the block editor
 * expands to take ~75% of the workbench height (bottom stack) and the grid above it
 * flips to *map* mode; when the block editor is minimized again the previous bottom
 * size and grid mode are restored, returning to the column-based mobile layout.
 *
 * This module is the pure, framework-free decision core: given the current inputs it
 * returns the commands to dispatch (through the controller, so persistence/undo stay
 * coherent) plus the "memory" the caller must carry into the next tick. It never reads
 * or writes the document itself — the thin svelte wiring in `AxisWorkbenchShell.svelte`
 * feeds it the observable state and applies the returned commands.
 *
 * ── Why grid-map forcing needs a widget move (not just widget.state) ──────────────
 * `AxisSignalGridPanel` derives the grid view from the *visible* gridMode widget via
 * `axisGridViewFromWidgets`, which ignores a `hidden` widget (returns the auto+M
 * default). The mobile preset hides the gridMode widget, so a bare
 * `widget.state {mode:'map'}` on it would have no visible effect. To force map through
 * commands only (no grid-file edits), the flow moves the gridMode widget out of the
 * `hidden` zone into the gridbar while it forces map, and moves it back to `hidden`
 * on restore. Both go through reducer commands (`widget.move` + `widget.state`).
 */

/** The dock region the phone-profile block editor lives in (mobile preset editorMode:'drawer'). */
export const AXIS_BLOCK_EDITOR_REGION = 'bottom' as const;

/** Widget type of the grid-mode chip whose state drives the SignalGrid view. */
export const AXIS_GRID_MODE_WIDGET_TYPE = 'axis.gridMode';

/** Panel type of the block editor (so we can locate its instance generically). */
export const AXIS_BLOCK_EDITOR_PANEL_TYPE = 'axis.blockEditor';

/** Grid-mode value string the SignalGrid view understands. */
export type AxisGridModeValue = 'auto' | 'full' | 'map';

/**
 * Persistent memory the flow carries between ticks. Stored by the wiring layer (a
 * plain runes object) — NOT on the document, so the expand/restore choreography never
 * pollutes persisted layout state and undo history stays about real user edits.
 */
export interface AxisMobileBlockFlowMemory {
  /** True once the flow has expanded the editor and is holding the expanded state. */
  expanded: boolean;
  /** Bottom-region sizePx captured just before expanding (restored on minimize). */
  prevBottomSizePx: number | null;
  /** gridMode widget's previous mode value, captured before forcing map. */
  prevGridMode: AxisGridModeValue | null;
  /** gridMode widget's previous zone, captured before moving it visible to force map. */
  prevGridZone: string | null;
  /**
   * The bottom sizePx the flow itself last wrote. Lets us detect a *manual* user
   * resize while expanded (current size ≠ our size) and, per the operator rule,
   * NOT snap back on the next tick — we only restore on explicit minimize.
   */
  appliedBottomSizePx: number | null;
}

export function createAxisMobileBlockFlowMemory(): AxisMobileBlockFlowMemory {
  return {
    expanded: false,
    prevBottomSizePx: null,
    prevGridMode: null,
    prevGridZone: null,
    appliedBottomSizePx: null
  };
}

export interface AxisMobileBlockFlowInput {
  /** True only on the phone profile — the flow is a no-op on tablet/desktop. */
  profileIsPhone: boolean;
  /** True when a block editor is active/open for a selected block. */
  blockOpen: boolean;
  /** Workbench-height (px) available to size the expanded editor against. */
  workbenchHeightPx: number;
  /** Current document (read-only) — the flow inspects the active layout, never mutates it. */
  doc: WorkbenchDocument;
}

export interface AxisMobileBlockFlowDecision {
  /** Commands to dispatch through the controller (ordered; may be empty). */
  commands: WorkbenchCommand[];
  /** Next memory to carry forward. */
  memory: AxisMobileBlockFlowMemory;
}

interface GridModeWidgetRef {
  id: string;
  zone: string;
  mode: AxisGridModeValue;
}

function readGridMode(value: unknown): AxisGridModeValue {
  return value === 'full' || value === 'map' ? value : 'auto';
}

/** Locate the gridMode widget instance in a layout (any zone, including hidden). */
function findGridModeWidget(layout: WorkbenchLayout): GridModeWidgetRef | null {
  const widgets = Object.values(layout.widgets ?? {}) as WidgetInstance[];
  const widget = widgets.find((w) => w?.type === AXIS_GRID_MODE_WIDGET_TYPE);
  if (!widget) return null;
  return { id: widget.id, zone: widget.zone, mode: readGridMode(widget.state?.mode) };
}

/** True when the active layout docks a block editor panel (so expanding is meaningful). */
function hasBlockEditorPanel(layout: WorkbenchLayout): boolean {
  return Object.values(layout.panels ?? {}).some((p) => p?.type === AXIS_BLOCK_EDITOR_PANEL_TYPE);
}

function currentBottomSizePx(layout: WorkbenchLayout): number | null {
  // Pages: region sizes are per-page — read the ACTIVE page's dock (the one
  // region.resize targets).
  const size = activeWorkbenchPage(layout)?.dock?.regions?.bottom?.sizePx;
  return typeof size === 'number' ? size : null;
}

/** Target expanded bottom size: ~75% of the workbench height, clamped sanely. */
export function computeExpandedBottomPx(workbenchHeightPx: number): number {
  const h = workbenchHeightPx > 0 ? workbenchHeightPx : 0;
  return Math.max(240, Math.round(h * AXIS_MOBILE_BLOCK_EXPAND_RATIO));
}

/**
 * Pure transition core. Returns the commands to reach the desired state plus the next
 * memory. Idempotent: re-running with the same inputs (and the memory it returned)
 * yields no commands. Respects a manual resize while expanded (never re-snaps).
 *
 * Transition table (phone profile):
 *
 *   state \ input | blockOpen=true                 | blockOpen=false
 *   --------------|-------------------------------|------------------------------
 *   collapsed     | ENTER: capture prev size+mode,| (no-op)
 *                 | resize bottom→75%, force map   |
 *   expanded      | (idempotent no-op; if the user| LEAVE: restore prev size+mode,
 *                 | resized, adopt their size and  | move gridMode back to prev zone
 *                 | leave it — never snap back)    |
 *
 * On non-phone profiles the flow is inert: if it had expanded (e.g. the profile just
 * switched away), it restores once and clears memory so it hands back a clean layout.
 */
export function decideAxisMobileBlockFlow(
  input: AxisMobileBlockFlowInput,
  memory: AxisMobileBlockFlowMemory
): AxisMobileBlockFlowDecision {
  const layout = selectActiveLayout(input.doc);

  // Off the phone profile (or no layout): if we're still holding an expanded state,
  // restore it once; otherwise do nothing.
  if (!input.profileIsPhone || !layout) {
    if (memory.expanded && layout) return restore(layout, memory);
    return { commands: [], memory: memory.expanded ? createAxisMobileBlockFlowMemory() : memory };
  }

  const grid = findGridModeWidget(layout);

  if (input.blockOpen) {
    if (memory.expanded) {
      // Idempotent hold. Do NOT re-apply the size (respect a manual user resize).
      return { commands: [], memory };
    }
    if (!hasBlockEditorPanel(layout)) {
      // No block editor docked to expand — nothing to do.
      return { commands: [], memory };
    }
    return expand(layout, grid, input.workbenchHeightPx, memory);
  }

  // blockOpen === false
  if (memory.expanded) return restore(layout, memory);
  return { commands: [], memory };
}

function expand(
  layout: WorkbenchLayout,
  grid: GridModeWidgetRef | null,
  workbenchHeightPx: number,
  memory: AxisMobileBlockFlowMemory
): AxisMobileBlockFlowDecision {
  const commands: WorkbenchCommand[] = [];
  const target = computeExpandedBottomPx(workbenchHeightPx);
  const prevBottom = currentBottomSizePx(layout);

  commands.push({ type: 'region.resize', region: AXIS_BLOCK_EDITOR_REGION, sizePx: target });

  let prevGridMode: AxisGridModeValue | null = null;
  let prevGridZone: string | null = null;
  if (grid) {
    prevGridMode = grid.mode;
    prevGridZone = grid.zone;
    // Force map. A hidden gridMode widget is ignored by the panel's view derivation,
    // so surface it into the gridbar first (idempotent if already there).
    if (grid.zone === 'hidden') {
      commands.push({ type: 'widget.move', widgetIds: [grid.id], zone: 'gridbar' });
    }
    if (grid.mode !== 'map') {
      commands.push({ type: 'widget.state', widgetId: grid.id, state: { mode: 'map' } });
    }
  }

  return {
    commands,
    memory: {
      expanded: true,
      prevBottomSizePx: prevBottom,
      prevGridMode,
      prevGridZone,
      appliedBottomSizePx: target
    }
  };
}

function restore(layout: WorkbenchLayout, memory: AxisMobileBlockFlowMemory): AxisMobileBlockFlowDecision {
  const commands: WorkbenchCommand[] = [];

  // Restore the bottom size — but if the user manually resized while expanded, honour
  // *their* size on minimize by only restoring when the current size still equals the
  // size we applied. (The operator rule targets "don't snap back on the next poll";
  // an explicit minimize with a user-chosen size keeps that size.)
  const current = currentBottomSizePx(layout);
  const userResized = memory.appliedBottomSizePx != null && current != null && current !== memory.appliedBottomSizePx;
  if (!userResized && memory.prevBottomSizePx != null) {
    commands.push({ type: 'region.resize', region: AXIS_BLOCK_EDITOR_REGION, sizePx: memory.prevBottomSizePx });
  }

  const grid = findGridModeWidget(layout);
  if (grid) {
    if (memory.prevGridMode != null && grid.mode !== memory.prevGridMode) {
      commands.push({ type: 'widget.state', widgetId: grid.id, state: { mode: memory.prevGridMode } });
    }
    // Return the widget to its previous zone (e.g. back to 'hidden' on the mobile preset).
    if (memory.prevGridZone != null && grid.zone !== memory.prevGridZone) {
      commands.push(
        memory.prevGridZone === 'hidden'
          ? { type: 'widget.hide', widgetIds: [grid.id] }
          : { type: 'widget.move', widgetIds: [grid.id], zone: memory.prevGridZone }
      );
    }
  }

  return { commands, memory: createAxisMobileBlockFlowMemory() };
}
