/**
 * Edit bar menu models (pure, unit-tested) and the host extension API.
 *
 * The bar renders its PAGE / LAYOUT / PROFILE / Add / ⋯ More menus from these
 * builders; the component only wires the actions. Keeping the models data-only
 * lets the bar render a group either as its full control or as a submenu of ⋯
 * More from the SAME items, and keeps the interim Add menu easy to swap for the
 * palette a later slice brings.
 */
import type { ViewportClass, WorkbenchCommand } from '../core';
import type { WorkbenchAddPageCards } from './addCatalog';
import type { WorkbenchMenuItem } from './contextMenu';
import { placementStatusText } from './placement';
import type { EditBarOverflowGroupId } from './editBarLayout';
import { workbenchBackupTimestamp, type WorkbenchBackupEntry } from './layoutActions';

/** One choice in the host's PROFILE control. */
export interface WorkbenchEditBarProfileOption {
  /** Profile id to pin, or null for "follow the viewport" (Auto). */
  id: string | null;
  /** Accessible name and menu label (e.g. "Auto", "Desktop"). */
  label: string;
  /** When set, the wide control shows this viewport class's glyph instead of the label. */
  viewportClass?: ViewportClass;
  /** The current choice (pinned profile, or Auto when nothing is pinned). */
  active: boolean;
  /** The profile Auto resolved to (shown with a small marker). */
  resolved: boolean;
  title: string;
}

/**
 * A page-level reset the host offers (PAGE menu, nav context menu): e.g.
 * "Reset to default" for a page the app seeds, "Clear page" for any other.
 * Always behind an inline confirm; the commands run as ONE batch (one undo step).
 */
export interface WorkbenchPageResetAction {
  label: string;
  prompt: string;
  confirmLabel: string;
  commands: () => WorkbenchCommand[];
}

/** Rows the host adds around the generic "Blank page" row of every "Add page" menu. */
export interface WorkbenchAddPageItems {
  /** Listed before "Blank page" (e.g. a "Missing default pages" section). */
  leading: WorkbenchMenuItem[];
  /** Listed after it (e.g. "Restore default pages (n)"). */
  trailing?: WorkbenchMenuItem[];
}

/**
 * Host page contributions, shared by the edit bar (PAGE menu, Add ▸ Add page)
 * and the navigation (the "+" menu, the entry context menu). Data-driven like
 * the rest of the extension; functions are re-read on every document change.
 */
export interface WorkbenchEditBarPagesExtension {
  /** Host rows of the "Add page" menu; each row's `run` performs its add. */
  addPageItems: () => WorkbenchAddPageItems;
  /** The reset offered for a page, or null for none. */
  reset: (pageId: string) => WorkbenchPageResetAction | null;
  /**
   * The same contributions as cards for the Add palette (with a dock for the
   * mini-map). Optional: without it the palette shows the generic page cards.
   */
  addPageCards?: () => WorkbenchAddPageCards;
}

/**
 * What a host contributes to the generic edit bar. Data-driven (not snippets) so
 * the bar can render each group wide, collapsed to a dropdown, or inside ⋯ More.
 * Functions are re-read whenever the workbench document changes.
 */
export interface WorkbenchEditBarExtension {
  layout?: {
    /** Value shown on the LAYOUT trigger (e.g. the active preset). */
    label: () => string;
    /** Host items listed first in the LAYOUT menu (presets, reset, …). */
    items: () => WorkbenchMenuItem[];
  };
  profile?: {
    /** Value shown on the collapsed PROFILE dropdown (e.g. "Auto · Desktop"). */
    label: () => string;
    options: () => WorkbenchEditBarProfileOption[];
    select: (id: string | null) => void;
  };
  /** Page rows: "Add page" contributions and per-page resets. */
  pages?: WorkbenchEditBarPagesExtension;
}

export const EDIT_BAR_STATUS_IDLE = 'Drag a tab onto a panel to dock it · Add adds panels, widgets and pages';
export const EDIT_BAR_STATUS_DRAG = 'Release on a highlighted target · anywhere else cancels';

// ── Status text / error chip ────────────────────────────────────────────────

export interface EditBarStatusInput {
  /** A drag is in flight. */
  dragging: boolean;
  /** Click-to-place is in progress: what is being placed, and where the active spot puts it. */
  placing?: { label: string; active?: string | null } | null;
  /** The latest layout-action feedback (save / apply / import / export / restore). */
  notice: { tone: 'ok' | 'error'; message: string } | null;
  /** The controller's last command result (kept across edit sessions). */
  lastResult: { error?: { message: string } } | null;
  /**
   * The result whose error is NOT shown, compared by identity: the one the user
   * dismissed — or, initially, whatever result already existed when the bar
   * mounted, so an error from before entering Customize never shows.
   */
  dismissedResult: unknown;
}

export interface EditBarStatus {
  /** Error chip text, or null for no chip. */
  error: string | null;
  /** Status text (shown when there is no error and room for it). */
  text: string;
  tone: 'idle' | 'drag' | 'ok';
}

/** What the bar's right side shows: an error chip, or the status / hint text. */
export function resolveEditBarStatus(input: EditBarStatusInput): EditBarStatus {
  const resultError =
    input.lastResult?.error && input.lastResult !== input.dismissedResult ? input.lastResult.error.message : null;
  const error = input.notice?.tone === 'error' ? input.notice.message : resultError;
  if (input.placing) return { error, text: placementStatusText(input.placing.label, input.placing.active), tone: 'drag' };
  if (input.dragging) return { error, text: EDIT_BAR_STATUS_DRAG, tone: 'drag' };
  if (input.notice?.tone === 'ok') return { error, text: input.notice.message, tone: 'ok' };
  return { error, text: EDIT_BAR_STATUS_IDLE, tone: 'idle' };
}

const noop = (): void => {};

// ── PAGE ────────────────────────────────────────────────────────────────────

export interface EditBarPageMenuInput {
  /** Pages in canonical order. */
  pages: ReadonlyArray<{ id: string; label: string }>;
  activePageId: string | undefined;
  /** False when the active page is the last one (it cannot be deleted). */
  canDelete: boolean;
  /** Why the active page is protected from deletion (host), or null. Disables Delete with that reason. */
  protectedReason?: string | null;
  /** The host's reset for the active page ("Reset to default" / "Clear page"), if any. */
  reset?: { label: string; prompt: string; confirmLabel: string; run(): void } | null;
  actions: {
    activate(pageId: string): void;
    /** Returns false when the name was rejected (the field stays open). */
    rename(pageId: string, label: string): boolean;
    duplicate(pageId: string): void;
    move(pageId: string, index: number): void;
    /** Open the Library drawer's pages view. */
    manage(): void;
    remove(pageId: string): void;
  };
}

export function buildPageMenuItems(input: EditBarPageMenuInput): WorkbenchMenuItem[] {
  const { pages, actions } = input;
  const index = pages.findIndex((page) => page.id === input.activePageId);
  const active = index >= 0 ? pages[index] : undefined;
  const items: WorkbenchMenuItem[] = [
    { id: 'page.header', kind: 'header', label: active?.label ?? 'Pages', run: noop },
    ...pages.map(
      (page): WorkbenchMenuItem => ({
        id: `page.open.${page.id}`,
        kind: 'radio',
        label: page.label,
        checked: page.id === input.activePageId,
        run: () => actions.activate(page.id)
      })
    )
  ];
  if (!active) return items;
  const first = index <= 0;
  const last = index >= pages.length - 1;
  items.push(
    {
      id: 'page.rename',
      kind: 'input',
      label: 'Rename page…',
      value: active.label,
      placeholder: 'Page name',
      separatorBefore: true,
      run: noop,
      onSubmit: (value) => actions.rename(active.id, value)
    },
    { id: 'page.duplicate', label: 'Duplicate page', run: () => actions.duplicate(active.id) },
    {
      id: 'page.moveLeft',
      label: 'Move left',
      hint: first ? 'first' : undefined,
      disabled: first,
      run: () => actions.move(active.id, index - 1)
    },
    {
      id: 'page.moveRight',
      label: 'Move right',
      hint: last ? 'last' : undefined,
      disabled: last,
      run: () => actions.move(active.id, index + 1)
    },
    { id: 'page.manage', label: 'Manage pages and templates…', run: () => actions.manage() }
  );
  const reset = input.reset;
  if (reset) {
    items.push({
      id: 'page.reset',
      label: reset.label,
      danger: true,
      separatorBefore: true,
      confirm: { prompt: reset.prompt, confirmLabel: reset.confirmLabel },
      run: () => reset.run()
    });
  }
  const blockedBy = input.protectedReason ?? (input.canDelete ? null : 'last page');
  items.push({
    id: 'page.delete',
    label: 'Delete page',
    danger: true,
    separatorBefore: !reset,
    hint: blockedBy ?? undefined,
    disabled: !!blockedBy,
    confirm: { prompt: deletePagePrompt(active.label), confirmLabel: 'Delete' },
    run: () => actions.remove(active.id)
  });
  return items;
}

/** The inline confirm of every page delete (PAGE menu, nav context menu, Library drawer). */
export function deletePagePrompt(label: string): string {
  return `Delete “${label}”? Its panels stay available in Add panel. Undo brings the page back.`;
}

// ── ADD PAGE (Add ▸ Add page, the nav "+") ─────────────────────────────────

export interface AddPageMenuInput {
  /** Host rows around "Blank page" (missing default pages, restore all, …). */
  host?: WorkbenchAddPageItems | null;
  /** Add an empty page and open it. */
  blank(): void;
}

export function buildAddPageMenuItems(input: AddPageMenuInput): WorkbenchMenuItem[] {
  const leading = input.host?.leading ?? [];
  const trailing = input.host?.trailing ?? [];
  return [
    ...leading,
    { id: 'addPage.blank', label: 'Blank page', separatorBefore: leading.length > 0, run: () => input.blank() },
    ...trailing
  ];
}

// ── LAYOUT ──────────────────────────────────────────────────────────────────

export interface EditBarLayoutMenuInput {
  /** Host items, listed first (presets, reset). */
  hostItems: WorkbenchMenuItem[];
  savedLayouts: ReadonlyArray<{ id: string; label: string }>;
  /** Host backups; the Backups submenu only appears when there are any. */
  backups: ReadonlyArray<WorkbenchBackupEntry>;
  hasActivePage: boolean;
  actions: {
    save(): void;
    apply(pageLayoutId: string): void;
    /** Open the Layouts drawer. */
    manage(): void;
    restore(entry: WorkbenchBackupEntry): void;
    /** Open the file picker. */
    importFile(): void;
    exportPage(): void;
  };
}

export function buildLayoutMenuItems(input: EditBarLayoutMenuInput): WorkbenchMenuItem[] {
  const { actions } = input;
  const saved = [...input.savedLayouts].sort((a, b) => a.label.localeCompare(b.label));
  const savedItems: WorkbenchMenuItem[] = saved.length
    ? [
        { id: 'layout.saved.header', kind: 'header', label: 'Apply to this page', run: noop },
        ...saved.map(
          (entry): WorkbenchMenuItem => ({
            id: `layout.saved.${entry.id}`,
            label: entry.label,
            disabled: !input.hasActivePage,
            run: () => actions.apply(entry.id)
          })
        )
      ]
    : [{ id: 'layout.saved.empty', kind: 'header', label: 'No saved layouts yet', run: noop }];
  savedItems.push({
    id: 'layout.saved.manage',
    label: 'Manage layouts…',
    separatorBefore: true,
    run: () => actions.manage()
  });

  const generic: WorkbenchMenuItem[] = [
    {
      id: 'layout.save',
      label: 'Save this page as layout',
      disabled: !input.hasActivePage,
      separatorBefore: input.hostItems.length > 0,
      run: () => actions.save()
    },
    {
      id: 'layout.saved',
      kind: 'submenu',
      label: `Saved layouts (${saved.length})`,
      items: savedItems,
      run: noop
    }
  ];
  if (input.backups.length) {
    generic.push({
      id: 'layout.backups',
      kind: 'submenu',
      label: 'Backups',
      run: noop,
      items: [
        { id: 'layout.backups.header', kind: 'header', label: 'Restore a backup', run: noop },
        ...input.backups.map(
          (entry): WorkbenchMenuItem => ({
            id: `layout.backup.${entry.slot}`,
            label: workbenchBackupTimestamp(entry),
            hint: `${entry.layoutCount} ${entry.layoutCount === 1 ? 'layout' : 'layouts'}`,
            confirm: {
              prompt: 'Replace the current document with this backup? The current one is backed up first.',
              confirmLabel: 'Restore'
            },
            run: () => actions.restore(entry)
          })
        )
      ]
    });
  }
  generic.push(
    { id: 'layout.import', label: 'Import…', hint: '.json', run: () => actions.importFile() },
    {
      id: 'layout.export',
      label: 'Export this page',
      hint: '.json',
      disabled: !input.hasActivePage,
      run: () => actions.exportPage()
    }
  );
  return [...input.hostItems, ...generic];
}

// ── PROFILE ─────────────────────────────────────────────────────────────────

export function buildProfileMenuItems(
  options: ReadonlyArray<WorkbenchEditBarProfileOption>,
  select: (id: string | null) => void
): WorkbenchMenuItem[] {
  return [
    { id: 'profile.header', kind: 'header', label: 'Device profile', run: noop },
    ...options.map(
      (option): WorkbenchMenuItem => ({
        id: `profile.${option.id ?? 'auto'}`,
        kind: 'radio',
        label: option.label,
        checked: option.active,
        hint: option.resolved ? 'auto' : undefined,
        run: () => select(option.id)
      })
    )
  ];
}

// ── ADD (the menu stays for hosts without an Add palette) ────────────────────

export interface EditBarAddMenuInput {
  pageLabel?: string;
  actions: {
    /** Library drawer, pages view (its "Add Panel · To This Page" section). */
    addPanel(): void;
    addCustomPanel(): void;
    /** Library drawer, widgets view. */
    addWidget(): void;
    openLibrary(): void;
  };
  /** The "Add page ▸" submenu rows ({@link buildAddPageMenuItems}). */
  addPageItems: WorkbenchMenuItem[];
}

export function buildAddMenuItems(input: EditBarAddMenuInput): WorkbenchMenuItem[] {
  const { actions } = input;
  return [
    { id: 'add.header', kind: 'header', label: input.pageLabel ? `Add to ${input.pageLabel}` : 'Add', run: noop },
    { id: 'add.panel', label: 'Add panel…', run: () => actions.addPanel() },
    { id: 'add.customPanel', label: 'Add custom panel', run: () => actions.addCustomPanel() },
    { id: 'add.widget', label: 'Add widget…', run: () => actions.addWidget() },
    { id: 'add.page', kind: 'submenu', label: 'Add page', items: input.addPageItems, run: noop },
    { id: 'add.library', label: 'Open library', separatorBefore: true, run: () => actions.openLibrary() }
  ];
}

// ── ⋯ MORE ──────────────────────────────────────────────────────────────────

export interface EditBarMoreGroup {
  id: EditBarOverflowGroupId;
  /** Submenu label, e.g. "Page: Grid". */
  label: string;
  /** The group's full menu. */
  items: WorkbenchMenuItem[];
  /** A group that is one action (Add + opening the palette): a plain row instead of a submenu. */
  run?: () => void;
}

/** The More menu label of a collapsed group. */
export function editBarMoreLabel(
  id: EditBarOverflowGroupId,
  labels: { page: string; layout: string; profile: string }
): string {
  switch (id) {
    case 'page':
      return `Page: ${labels.page}`;
    case 'layout':
      return `Layout: ${labels.layout}`;
    case 'profile':
      return `Profile: ${labels.profile}`;
    case 'add':
      return 'Add';
  }
}

/** One submenu per collapsed group, in the order given (scope order). */
export function buildMoreMenuItems(groups: ReadonlyArray<EditBarMoreGroup>): WorkbenchMenuItem[] {
  return groups.map(
    (group): WorkbenchMenuItem =>
      group.run
        ? { id: `more.${group.id}`, label: group.label, run: group.run }
        : {
            id: `more.${group.id}`,
            kind: 'submenu',
            label: group.label,
            items: group.items,
            run: noop
          }
  );
}
