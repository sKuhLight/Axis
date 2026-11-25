/**
 * Escape and the block editor's `editorOpen` flag.
 *
 * The app's Escape chain (`routes/+page.svelte`) ends with "close the block
 * editor". Every branch that handles Escape marks it with `preventDefault()`
 * so later Escape consumers (the workbench restoring a maximized panel) leave
 * that press alone. But `editorOpen` turns true on the first block click and
 * stays true, and only some shells show anything for it:
 *   - the legacy monolith shell: the editor is a modal-ish surface → closing is visible;
 *   - the workbench on the PHONE profile: the mobile block flow expands the editor
 *     (and shows its Minimize bar) while `editorOpen` → closing is visible;
 *   - the workbench on tablet / desktop: the embedded editor ignores the flag →
 *     closing changes nothing on screen, so that Escape must stay free.
 * `closeEditor()` still runs in every case; only the "handled" marking depends
 * on this decision.
 */
export interface AxisEditorEscapeInput {
  /** The workbench shell is mounted (false = legacy monolith shell). */
  workbenchShell: boolean;
  /** The active workbench profile's breakpoint, when the workbench is mounted. */
  profileBreakpoint: string | undefined;
}

/** True when closing the block editor on Escape has a visible effect (so the key counts as handled). */
export function axisEditorCloseIsVisible(input: AxisEditorEscapeInput): boolean {
  return !input.workbenchShell || input.profileBreakpoint === 'phone';
}
