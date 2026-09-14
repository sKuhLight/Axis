/**
 * Detail-pane load-action warning copy.
 *
 * "Switch to Preset" and "Audition" both replace the edit buffer, so both silently discard unsaved
 * edits to the current preset. When the preset is dirty (same signal as the Save widget chip —
 * see `../widgets/saveDirtyState`), the two buttons turn amber with a ⚠ and explain themselves
 * on hover. Keeping the copy here keeps it out of the markup and assertable.
 */

export type AxisPbLoadAction = 'load' | 'audition';

export interface AxisPbLoadWarning {
  /** True when the action would discard unsaved edits — drives the amber tint and the ⚠. */
  warn: boolean;
  /** Button `title` (and, when warning, `aria-label`): what the action does, or what it costs. */
  tooltip: string;
}

const CLEAN_TOOLTIP: Record<AxisPbLoadAction, string> = {
  // "Switch to Preset" navigates the device to a stored slot — the edit buffer is replaced.
  load: 'Switch the device to this preset (the edit buffer is replaced)',
  // Non-device entries (imported files / local folder) are tried out in the edit buffer.
  audition:
    'Load into the edit buffer without switching slots or saving anything — try it out Axe-Change style'
};

const DIRTY_TOOLTIP = '⚠ You have unsaved changes in the current preset.';

export function loadActionWarning(saveDirty: boolean, action: AxisPbLoadAction): AxisPbLoadWarning {
  if (!saveDirty) return { warn: false, tooltip: CLEAN_TOOLTIP[action] };
  return { warn: true, tooltip: DIRTY_TOOLTIP };
}
