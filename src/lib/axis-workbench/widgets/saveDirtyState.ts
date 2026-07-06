import type { HistoryEntry } from '../../history.svelte';

/**
 * Save-chip dirty derivation (02-widgets.md — Save chip shows green "Saved" when
 * clean, accent "Save" when there are unsaved edits).
 *
 * There is NO device-reported "edit buffer edited" flag surfaced in the editor
 * store (see the report), so we derive the honest, in-app signal instead:
 * **"has the user made undoable edits in this editor since the last Save?"**
 *
 * Source of truth = the per-preset history (`history.entries` / `history.cursor`,
 * both read-only public runes). A device Save pushes a non-undoable, non-barrier
 * checkpoint (`checkpoint('Saved to preset …', false)`); a buffer replacement
 * pushes a barrier checkpoint (`…, true`). We walk backwards from the cursor:
 *  - a live (index < cursor) *undoable* entry before hitting a save marker ⇒ dirty;
 *  - a save marker (undoable === false && !barrier) ⇒ clean from here back;
 *  - a barrier (buffer replaced, e.g. snapshot/file load) resets the baseline —
 *    everything before it belongs to a different buffer, so stop and treat as
 *    clean unless an undoable edit was already seen after it.
 *
 * Caveat (documented, not hidden): this reflects only edits made *through Axis*.
 * Edits made physically on the device are not in history, so a hardware-only
 * change reads as "Saved". A true device edited-buffer flag would supersede this.
 */
export function isSaveDirty(entries: readonly HistoryEntry[], cursor: number): boolean {
  const end = Math.max(0, Math.min(cursor, entries.length));
  for (let i = end - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.undoable) return true; // an editable step still live above the last save
    // non-undoable: a save marker or a barrier — either way the baseline is clean here
    return false;
  }
  return false;
}
