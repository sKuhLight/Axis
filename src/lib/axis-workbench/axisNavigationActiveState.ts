/**
 * Active-section tint for the Axis ACTION nav entries (01-shell.md §9 — active =
 * the content section currently in front).
 *
 * ROUND 15 (Pages model): the seven page-bound nav entries (grid / library / fc /
 * controllers / scenes / live / setup) resolve their active tint GENERICALLY in
 * `NavigationHost` via `pageNavigationEntryActive` — the entry is active while its
 * bound page is the layout's `activePageId`. So this app-side provider only needs to
 * cover the remaining ACTION entries — Theme and Axis Cloud — whose open-state lives
 * on the editor store. Passed in via {@link AxisNavigationActiveSnapshot} so the
 * resolver stays pure (no Svelte, no `editor` import) and directly unit-testable.
 *
 * Any entry not covered here resolves to inactive (untinted) — the page entries are
 * never routed to this provider, and everything else is genuinely inactive.
 */
export interface AxisNavigationActiveSnapshot {
  /** editor.themeOpen — the Appearance/Theme modal is open. */
  themeOpen: boolean;
  /** editor.axisOpen — the Axis Cloud/account modal is open. */
  accountOpen: boolean;
}

/**
 * Resolve whether one ACTION nav entry is the active section. Page-bound entries are
 * handled generically by the framework and never reach this function.
 */
export function isAxisNavigationEntryActive(snapshot: AxisNavigationActiveSnapshot, entryId: string): boolean {
  switch (entryId) {
    case 'theme':
      return snapshot.themeOpen;
    case 'account':
      return snapshot.accountOpen;
    default:
      return false;
  }
}
