import { findTabStackById, selectActiveDock, selectPanelLocation } from '../workbench';
import type { WorkbenchDocument } from '../workbench';

/**
 * Which navigation entry is the "active section" (01-shell.md §9 — active = the
 * content section currently in front). This is the pure resolution logic behind
 * the Axis navigation-state provider registered on the render registry; keeping
 * it here (no Svelte, no `editor` import) makes it directly unit-testable.
 *
 * The signal is split by how each nav entry surfaces its content:
 *  - `grid` opens the Signal Grid panel in `main` (controller/document state);
 *  - `library` (Preset Browser)/`controllers`/`scenes`/`setup`/`live` dock a
 *    panel and become active when that panel is the active tab of its stack
 *    (document state); `library` additionally tints for the legacy overlay
 *    (editor.inLibrary) surfaced outside the workbench shell;
 *  - `fc` (Footswitches), `theme`, `account` open an overlay/rail screen whose
 *    open-state lives on the editor store — those are passed in via
 *    {@link AxisNavigationActiveSnapshot} so this stays pure.
 *
 * Any entry not covered here resolves to inactive (untinted).
 */
export interface AxisNavigationActiveSnapshot {
  /** editor.inLibrary — the full Preset Browser rail screen is open. */
  libraryOpen: boolean;
  /** editor.virtual — the open virtual-effect rail screen (slug 'fc' == Footswitches). */
  virtualSlug: string | null;
  /** editor.themeOpen — the Appearance/Theme modal is open. */
  themeOpen: boolean;
  /** editor.axisOpen — the Axis Cloud/account modal is open. */
  accountOpen: boolean;
}

/** Panel id docked by each panel-backed nav entry (see axisWorkbenchNavigationActions registrations). */
const PANEL_BACKED_ENTRIES: Record<string, string> = {
  grid: 'axis.signalGrid',
  library: 'axis.presetBrowser',
  controllers: 'axis.controllers',
  scenes: 'axis.scenes',
  setup: 'axis.setup',
  live: 'axis.live'
};

/** True when `panelId` is the *active tab* of whatever tab stack it lives in. */
function isActiveTab(doc: WorkbenchDocument, panelId: string): boolean {
  const location = selectPanelLocation(doc, panelId);
  if (!location) return false;
  // Pages: both the location lookup above and this stack walk are scoped to the
  // ACTIVE page's dock — a panel docked on an inactive page is not "in front".
  const dock = selectActiveDock(doc);
  if (!dock) return false;
  for (const node of Object.values(dock.root)) {
    const stack = findTabStackById(node, location.tabStackId);
    if (stack) return stack.activePanelId === panelId;
  }
  return false;
}

/**
 * Resolve whether one nav entry is the active section.
 *
 * Precedence: overlay/rail screens (library, fc, theme, account) win over the
 * docked grid, because opening one replaces the grid/editor view even though the
 * Signal Grid panel still sits (unfocused) in `main`. This keeps at most one
 * entry tinted and matches what the user actually sees in front.
 */
export function isAxisNavigationEntryActive(
  doc: WorkbenchDocument,
  snapshot: AxisNavigationActiveSnapshot,
  entryId: string
): boolean {
  switch (entryId) {
    case 'library':
      // V13d: the Preset Browser nav entry now docks/focuses a workbench panel,
      // so its active tint follows that panel being the active tab. The legacy
      // overlay (editor.inLibrary, still used outside the workbench shell) keeps
      // tinting it too so the signal stays correct wherever PB is surfaced.
      return snapshot.libraryOpen || isActiveTab(doc, PANEL_BACKED_ENTRIES.library);
    case 'fc':
      return snapshot.virtualSlug === 'fc';
    case 'theme':
      return snapshot.themeOpen;
    case 'account':
      return snapshot.accountOpen;
    case 'grid': {
      // An overlay/rail screen sits *over* the grid — don't tint Grid then.
      if (snapshot.libraryOpen || snapshot.virtualSlug != null || snapshot.themeOpen || snapshot.accountOpen) {
        return false;
      }
      return isActiveTab(doc, PANEL_BACKED_ENTRIES.grid);
    }
    case 'controllers':
    case 'scenes':
    case 'setup':
    case 'live': {
      const panelId = PANEL_BACKED_ENTRIES[entryId];
      return panelId ? isActiveTab(doc, panelId) : false;
    }
    default:
      return false;
  }
}
