/**
 * Workbench layout undo/redo — an IN-MEMORY snapshot ring for the *workbench
 * layout* only.
 *
 * This is deliberately SEPARATE from any host-level content/edit history the app
 * may keep: this ring only undoes changes to the workbench chrome (docked
 * panels, widget zones, regions, navigation, profile/layout arrangement) and
 * never touches host content state.
 *
 * ## Not persisted, ever
 *
 * The ring lives on the controller instance, NOT on the {@link WorkbenchDocument}.
 * It holds structural clones of the document taken around dispatches; those
 * clones are never written back to the schema, localStorage, or the cloud. A
 * controller that has been undone/redone many times serialises byte-identical to
 * one that never had a history — the document object is the only thing that
 * persists, and the ring is invisible to it.
 *
 * ## Ring shape
 *
 * A single linear timeline with a cursor:
 *
 *   past ... [cursor] ... future
 *
 * - `entries[cursor]` is the CURRENT committed document.
 * - undo moves the cursor left and returns the older snapshot to restore.
 * - redo moves the cursor right and returns the newer snapshot.
 * - a fresh commit made while the cursor is not at the end truncates the future
 *   (classic undo-stack semantics) before pushing.
 * - the ring is capped at {@link DEFAULT_LAYOUT_HISTORY_DEPTH} entries; pushing
 *   past the cap evicts the OLDEST entry (the cursor stays pinned to the end).
 *
 * ## Coalescing
 *
 * Continuous interactions emit a stream of same-type commands — dragging a split
 * handle fires `split.resize` on every pointer move, nudging a widget fires
 * `widget.move`, holding grid-mode repeat fires `widget.state`. Recording every
 * one would make a single gesture cost dozens of undo steps. So a commit
 * COALESCES into the previous entry when all of:
 *   - the commit's coalesce key equals the previous commit's key, AND
 *   - it lands within {@link DEFAULT_COALESCE_WINDOW_MS} of the previous commit.
 * A coalesced commit overwrites the current snapshot in place (the pre-gesture
 * snapshot below it is preserved as the single undo target) and refreshes the
 * timestamp so a continuing stream keeps extending the same step.
 *
 * The clock is injectable so the windows are deterministic under test.
 */

import type { WorkbenchCommand, WorkbenchDocument } from '../core';

/** Max snapshots retained (current + undo depth). */
export const DEFAULT_LAYOUT_HISTORY_DEPTH = 50;
/** Time window within which same-key commands collapse into one undo step. */
export const DEFAULT_COALESCE_WINDOW_MS = 450;

/** Injectable clock so coalescing windows are deterministic in tests. */
export interface LayoutHistoryEnv {
  now(): number;
}

const defaultEnv: LayoutHistoryEnv = { now: () => Date.now() };

export interface LayoutHistoryOptions {
  /** Ring capacity (current + undo depth). Defaults to {@link DEFAULT_LAYOUT_HISTORY_DEPTH}. */
  depth?: number;
  /** Coalesce window in ms. Defaults to {@link DEFAULT_COALESCE_WINDOW_MS}. */
  coalesceWindowMs?: number;
  env?: LayoutHistoryEnv;
}

interface HistoryEntry {
  doc: WorkbenchDocument;
  /** Coalesce key of the commit that PRODUCED this entry (undefined for the seed). */
  key: string | null;
  /** Clock time of the commit that produced this entry. */
  at: number;
}

/**
 * Command types that must NOT create an undo step. These are transient / view
 * state that either the app re-derives or that would spam the ring with noise
 * the user never thinks of as an "edit" to their layout.
 *
 * Everything NOT listed here is captured (default-include). See the inclusion /
 * exclusion table in the task notes for the rationale per command family.
 */
const EXCLUDED_COMMAND_TYPES = new Set<WorkbenchCommand['type']>([
  // Pure activation / focus — no structural change, and re-selecting is cheap.
  'panel.activate',
  // Page activation is pure view state (which page is in front); switching back
  // is one nav click. Structural page ops (add/remove/rename/duplicate) ARE
  // captured — those edit the layout.
  'page.activate',
  // Profile activation is driven by viewport resolution (ResizeObserver) and by
  // the profile switcher; undoing a resize-driven profile swap would be baffling.
  'profile.activate'
]);

/**
 * Compute the coalesce key for a command. Commands sharing a key AND falling
 * inside the coalesce window collapse into a single undo step. The key is scoped
 * to the specific target so resizing split A then split B are two steps, but a
 * continuous drag of split A is one.
 *
 * Returns `null` for commands that should always stand alone (never coalesce
 * with an adjacent commit even of the same type).
 */
export function coalesceKeyFor(command: WorkbenchCommand): string | null {
  switch (command.type) {
    case 'split.resize':
      return `split.resize:${command.splitId}`;
    case 'region.resize':
      return `region.resize:${command.region}`;
    case 'widget.move':
      // A continuous nudge/drag of the same widget set collapses; the set order
      // is normalised so re-ordered ids still coalesce.
      return `widget.move:${[...command.widgetIds].sort().join(',')}`;
    case 'widget.resize':
      return `widget.resize:${command.widgetId}`;
    case 'widget.state':
      // Grid-mode / block-size hold-repeat streams collapse per widget.
      return `widget.state:${command.widgetId}`;
    default:
      return null;
  }
}

/** True when a command should be recorded as (or coalesced into) an undo step. */
export function isCapturedCommand(command: WorkbenchCommand): boolean {
  return !EXCLUDED_COMMAND_TYPES.has(command.type);
}

function cloneDoc(doc: WorkbenchDocument): WorkbenchDocument {
  // structuredClone keeps this a true deep copy the ring owns; falls back to a
  // JSON round-trip on the (very old) runtimes lacking it. The document is plain
  // JSON data, so either is faithful.
  if (typeof structuredClone === 'function') return structuredClone(doc);
  return JSON.parse(JSON.stringify(doc)) as WorkbenchDocument;
}

/**
 * The layout-history ring. Lives on the controller; never serialised.
 *
 * Usage from the controller:
 *   - {@link seed} once with the initial document.
 *   - {@link reset} on `setDocument` (external adoption / restore) so the new
 *     document becomes the baseline WITHOUT a spurious undo step.
 *   - {@link record} AFTER a successful mutating dispatch, passing the command
 *     and the resulting document.
 *   - {@link undo} / {@link redo} return the document to restore (or `null`).
 */
export class LayoutHistory {
  #entries: HistoryEntry[] = [];
  #cursor = -1;
  readonly #depth: number;
  readonly #window: number;
  readonly #env: LayoutHistoryEnv;

  constructor(options: LayoutHistoryOptions = {}) {
    this.#depth = Math.max(1, Math.floor(options.depth ?? DEFAULT_LAYOUT_HISTORY_DEPTH));
    this.#window = Math.max(0, options.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS);
    this.#env = options.env ?? defaultEnv;
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor >= 0 && this.#cursor < this.#entries.length - 1;
  }

  /** Number of retained snapshots (current + undo/redo). Test/introspection. */
  get length(): number {
    return this.#entries.length;
  }

  /**
   * Establish the baseline snapshot. Idempotent-ish: always drops any existing
   * history and starts fresh with `doc` as the sole (current) entry.
   */
  seed(doc: WorkbenchDocument): void {
    this.#entries = [{ doc: cloneDoc(doc), key: null, at: this.#env.now() }];
    this.#cursor = 0;
  }

  /** Alias of {@link seed} for the "external document swap" call site. */
  reset(doc: WorkbenchDocument): void {
    this.seed(doc);
  }

  /**
   * Record the result of a mutating command. Call ONLY after a successful
   * dispatch, with the resulting document. Excluded command types are ignored.
   * Same-key commands within the coalesce window overwrite the current snapshot
   * instead of pushing a new one.
   */
  record(command: WorkbenchCommand, next: WorkbenchDocument): void {
    if (!isCapturedCommand(command)) return;
    if (this.#cursor < 0) {
      // No baseline yet — treat this document as the seed.
      this.seed(next);
      return;
    }

    const now = this.#env.now();
    const key = coalesceKeyFor(command);
    const current = this.#entries[this.#cursor];

    const coalesces =
      this.#cursor === this.#entries.length - 1 && // only coalesce at the tip
      key !== null &&
      current.key === key &&
      now - current.at <= this.#window;

    if (coalesces) {
      // Extend the same undo step: overwrite the tip snapshot, refresh the clock.
      this.#entries[this.#cursor] = { doc: cloneDoc(next), key, at: now };
      return;
    }

    // A new step. Truncate any redo future first.
    if (this.#cursor < this.#entries.length - 1) {
      this.#entries = this.#entries.slice(0, this.#cursor + 1);
    }
    this.#entries.push({ doc: cloneDoc(next), key, at: now });
    this.#cursor = this.#entries.length - 1;

    // Cap: evict oldest, keep the cursor pinned to the tip.
    while (this.#entries.length > this.#depth) {
      this.#entries.shift();
      this.#cursor -= 1;
    }
  }

  /**
   * Record a whole batch (dispatchMany) as ONE standalone undo step, provided at
   * least one command in the batch was capturable. A batch is a single user
   * action (apply a layout, insert a panel = add + activate) so it never
   * coalesces with an adjacent step even if the last command shares a key.
   */
  recordBatch(commands: WorkbenchCommand[], next: WorkbenchDocument): void {
    if (!commands.some(isCapturedCommand)) return;
    if (this.#cursor < 0) {
      this.seed(next);
      return;
    }
    if (this.#cursor < this.#entries.length - 1) {
      this.#entries = this.#entries.slice(0, this.#cursor + 1);
    }
    // key:null so a following single command can't coalesce into the batch.
    this.#entries.push({ doc: cloneDoc(next), key: null, at: this.#env.now() });
    this.#cursor = this.#entries.length - 1;
    while (this.#entries.length > this.#depth) {
      this.#entries.shift();
      this.#cursor -= 1;
    }
  }

  /**
   * Step back one undo step. Returns a fresh clone of the document to restore,
   * or `null` if there is nothing to undo. The returned clone is owned by the
   * caller (safe to hand to `setDocument`, which repairs it in place).
   */
  undo(): WorkbenchDocument | null {
    if (!this.canUndo) return null;
    this.#cursor -= 1;
    return cloneDoc(this.#entries[this.#cursor].doc);
  }

  /** Step forward one redo step, or `null` if there is nothing to redo. */
  redo(): WorkbenchDocument | null {
    if (!this.canRedo) return null;
    this.#cursor += 1;
    return cloneDoc(this.#entries[this.#cursor].doc);
  }
}
