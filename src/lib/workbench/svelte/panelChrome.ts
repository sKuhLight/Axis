/**
 * Pure pieces of the pane (tab stack) chrome: the panel ⋯ menu model, the
 * collapsed-strip label, and the Escape rule for a maximized panel.
 */
import type { DockRegionId, PanelInstance } from '../core';
import type { WorkbenchMenuItem } from './contextMenu';
import { PANEL_REGION_MOVE_OPTIONS } from './moveAlternatives';

/** Labels of the region targets inside the "Move to" submenu. */
export const PANEL_MOVE_REGION_LABELS: Record<DockRegionId, string> = {
  left: 'Left dock',
  right: 'Right dock',
  top: 'Top dock',
  bottom: 'Bottom dock',
  main: 'Main'
};

export interface PanelMenuActions {
  moveToRegion: (region: DockRegionId) => void;
  moveToPage: (pageId: string) => void;
  toggleMaximize: () => void;
  toggleCollapse: () => void;
  save: () => void;
  /** Remove from page: parks the panel (`panel.remove`); it stays in Add panel. */
  remove: () => void;
}

export interface PanelMenuInput {
  panel: PanelInstance;
  editMode: boolean;
  maximized: boolean;
  /** Maximize is offered (false inside a mobile dock drawer). Defaults to true. */
  canMaximize?: boolean;
  /** Pages of the layout in order (the active one is skipped in "Move to"). */
  pages: { id: string; label: string }[];
  activePageId?: string;
  actions: PanelMenuActions;
}

const noop = () => {};

/** Label (and title / aria-label) of the panel header × and the ⋯ menu row. */
export const PANEL_REMOVE_LABEL = 'Remove from page';

/**
 * The panel ⋯ menu: Move to ▸ (docks, main, other pages) · Maximize/Restore ·
 * Collapse/Expand · Save To Library · Remove from page. Moving, saving and
 * removing are edit-mode actions; maximize and collapse work in both modes.
 * Removing PARKS the panel (never deletes it) — Undo covers it, so no confirm.
 * Locked = cannot LEAVE the layout: a locked panel can still be moved (Move to
 * stays enabled), but not removed or saved as a template.
 */
export function buildPanelMenuItems(input: PanelMenuInput): WorkbenchMenuItem[] {
  const { panel, editMode, actions } = input;
  const editable = editMode && !panel.locked;
  const otherPages = input.pages.filter((page) => page.id !== input.activePageId);
  const moveItems: WorkbenchMenuItem[] = [
    ...PANEL_REGION_MOVE_OPTIONS.map(
      (option): WorkbenchMenuItem => ({
        id: `move-${option.id}`,
        label: PANEL_MOVE_REGION_LABELS[option.id],
        run: () => actions.moveToRegion(option.id)
      })
    ),
    ...otherPages.map(
      (page, index): WorkbenchMenuItem => ({
        id: `move-page-${page.id}`,
        label: `Page: ${page.label}`,
        separatorBefore: index === 0,
        run: () => actions.moveToPage(page.id)
      })
    )
  ];
  return [
    { id: 'move', kind: 'submenu', label: 'Move to', disabled: !editMode, run: noop, items: moveItems },
    {
      id: 'maximize',
      label: input.maximized ? 'Restore Panel' : 'Maximize Panel',
      separatorBefore: true,
      // Maximize and collapse are exclusive: a collapsed panel is not maximized…
      disabled: input.canMaximize === false || (!input.maximized && !!panel.collapsed),
      run: actions.toggleMaximize
    },
    {
      id: 'collapse',
      label: panel.collapsed ? 'Expand Panel' : 'Collapse Panel',
      // …and a maximized one is not collapsed.
      disabled: panel.collapsible === false || input.maximized,
      run: actions.toggleCollapse
    },
    { id: 'save', label: 'Save To Library', separatorBefore: true, disabled: !editable, run: actions.save },
    {
      id: 'remove',
      label: PANEL_REMOVE_LABEL,
      danger: true,
      separatorBefore: true,
      disabled: !editable || panel.closable === false,
      run: actions.remove
    }
  ];
}

/** The label of a collapsed stack's strip: every tab title, joined. */
export function collapsedStripLabel(titles: string[]): string {
  return titles.filter(Boolean).join(' · ');
}

/**
 * Surfaces that own Escape while open — a maximized panel must not restore on
 * the same press: workbench menus / drawers / the nav rename field, and any
 * dialog (`role="dialog"`, `aria-modal`), including the app's own (history,
 * device tools, convert, …) that close themselves without preventDefault.
 */
export const MAXIMIZE_ESCAPE_OVERLAYS =
  '.aw-context-menu, [role="dialog"], [aria-modal="true"], .aw-layout-drawer, .aw-lib-drawer, .aw-nav-rename';

export interface MaximizeEscapeInput {
  key: string;
  maximized: boolean;
  /** Something handled this Escape during its dispatch (called preventDefault). */
  defaultPrevented: boolean;
  /** A drag is in progress (its own Escape cancels the drag). */
  dragging: boolean;
  /**
   * A menu, drawer or dialog was open when the key went down — snapshot taken in
   * the capture phase, before its own handler could close (and unmount) it.
   */
  overlayOpenAtCapture: boolean;
  /** Focus was in a text field. */
  editableTarget: boolean;
}

/**
 * Escape restores a maximized panel only when nothing else consumed it: no
 * overlay was open at capture time AND nothing called preventDefault during the
 * dispatch (the app's own Escape chain does when it closes something); never
 * during a drag or from a text field.
 */
export function shouldRestoreMaximizedOnEscape(input: MaximizeEscapeInput): boolean {
  return (
    input.key === 'Escape' &&
    input.maximized &&
    !input.defaultPrevented &&
    !input.dragging &&
    !input.overlayOpenAtCapture &&
    !input.editableTarget
  );
}

export interface MaximizeOwnerInput {
  /** The controller's maximized panel. */
  maximizedPanelId: string | null;
  /** Panels of the tab stack instance asking. */
  stackPanelIds: readonly string[];
  /** The instance renders inside a mobile dock drawer (never the owner). */
  overlay: boolean;
  /** The instance is mounted AND laid out (false on unmount / display:none ancestor). */
  rendered: boolean;
}

/**
 * The inline stack that shows the maximized panel is its only visible owner.
 * When that owner goes away — unmounted (page switch, pages mode dropping the
 * side regions) or not laid out (a phone-hidden region) — the maximize must be
 * released, or it would linger invisibly and resurface later.
 *
 * Consequence (intended): moving a maximized panel to another stack — its own
 * "Move to ▸", or a drop — unmounts or changes its owner, so the moved panel
 * arrives restored. The controller alone keeps the id while the panel stays on
 * the page; this owner rule is what releases it.
 */
export function shouldReleaseMaximize(input: MaximizeOwnerInput): boolean {
  return !!input.maximizedPanelId && !input.overlay && !input.rendered && input.stackPanelIds.includes(input.maximizedPanelId);
}
