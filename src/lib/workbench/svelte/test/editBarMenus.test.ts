import { describe, expect, it, vi } from 'vitest';
import type { WorkbenchMenuItem } from '../contextMenu';
import {
  EDIT_BAR_STATUS_DRAG,
  EDIT_BAR_STATUS_IDLE,
  buildAddMenuItems,
  buildAddPageMenuItems,
  deletePagePrompt,
  buildLayoutMenuItems,
  buildMoreMenuItems,
  buildPageMenuItems,
  buildProfileMenuItems,
  editBarMoreLabel,
  resolveEditBarStatus,
  type EditBarLayoutMenuInput,
  type EditBarPageMenuInput
} from '../editBarMenus';

const labels = (items: WorkbenchMenuItem[]) => items.map((item) => item.label);
const byId = (items: WorkbenchMenuItem[], id: string) => items.find((item) => item.id === id)!;

function pageInput(overrides: Partial<EditBarPageMenuInput> = {}): EditBarPageMenuInput {
  return {
    pages: [
      { id: 'p1', label: 'Grid' },
      { id: 'p2', label: 'Presets' },
      { id: 'p3', label: 'Live' }
    ],
    activePageId: 'p2',
    canDelete: true,
    actions: {
      activate: vi.fn(),
      rename: vi.fn(() => true),
      duplicate: vi.fn(),
      move: vi.fn(),
      manage: vi.fn(),
      remove: vi.fn()
    },
    ...overrides
  };
}

describe('PAGE menu', () => {
  it('heads with the page name, lists every page as a radio, then the page actions', () => {
    const items = buildPageMenuItems(pageInput());
    expect(items[0]).toMatchObject({ kind: 'header', label: 'Presets' });
    const radios = items.filter((item) => item.kind === 'radio');
    expect(labels(radios)).toEqual(['Grid', 'Presets', 'Live']);
    expect(radios.map((item) => item.checked)).toEqual([false, true, false]);
    expect(labels(items.filter((item) => item.kind !== 'radio' && item.kind !== 'header'))).toEqual([
      'Rename page…',
      'Duplicate page',
      'Move left',
      'Move right',
      'Manage pages and templates…',
      'Delete page'
    ]);
    expect(byId(items, 'page.rename').separatorBefore).toBe(true);
  });

  it('wires every action to the active page', () => {
    const input = pageInput();
    const items = buildPageMenuItems(input);
    byId(items, 'page.open.p3').run();
    expect(input.actions.activate).toHaveBeenCalledWith('p3');
    byId(items, 'page.duplicate').run();
    expect(input.actions.duplicate).toHaveBeenCalledWith('p2');
    byId(items, 'page.moveLeft').run();
    expect(input.actions.move).toHaveBeenCalledWith('p2', 0);
    byId(items, 'page.moveRight').run();
    expect(input.actions.move).toHaveBeenCalledWith('p2', 2);
    byId(items, 'page.manage').run();
    expect(input.actions.manage).toHaveBeenCalled();
    byId(items, 'page.delete').run();
    expect(input.actions.remove).toHaveBeenCalledWith('p2');
  });

  it('renames through an inline input that reports rejection', () => {
    const input = pageInput({
      actions: { ...pageInput().actions, rename: vi.fn((_id: string, label: string) => label.trim().length > 0) }
    });
    const rename = byId(buildPageMenuItems(input), 'page.rename');
    expect(rename).toMatchObject({ kind: 'input', value: 'Presets' });
    expect(rename.onSubmit?.('Pedalboard')).toBe(true);
    expect(rename.onSubmit?.('   ')).toBe(false);
    expect(input.actions.rename).toHaveBeenCalledWith('p2', 'Pedalboard');
  });

  it('disables moves at the ends', () => {
    const first = buildPageMenuItems(pageInput({ activePageId: 'p1' }));
    expect(byId(first, 'page.moveLeft').disabled).toBe(true);
    expect(byId(first, 'page.moveRight').disabled).toBe(false);
    const last = buildPageMenuItems(pageInput({ activePageId: 'p3' }));
    expect(byId(last, 'page.moveRight').disabled).toBe(true);
  });

  it('asks inline before deleting, and cannot delete the last page', () => {
    const del = byId(buildPageMenuItems(pageInput()), 'page.delete');
    expect(del.danger).toBe(true);
    expect(del.confirm).toEqual({
      prompt: 'Delete “Presets”? Its panels stay available in Add panel. Undo brings the page back.',
      confirmLabel: 'Delete'
    });
    expect(deletePagePrompt('Presets')).toBe(del.confirm?.prompt);
    const single = byId(buildPageMenuItems(pageInput({ pages: [{ id: 'p2', label: 'Presets' }], canDelete: false })), 'page.delete');
    expect(single.disabled).toBe(true);
  });

  it('disables Delete of a host-protected page with the reason', () => {
    const del = byId(buildPageMenuItems(pageInput({ protectedReason: 'Used by the preset converter' })), 'page.delete');
    expect(del).toMatchObject({ disabled: true, hint: 'Used by the preset converter' });
  });

  it('offers the host reset (inline confirm) right before Delete', () => {
    const run = vi.fn();
    const items = buildPageMenuItems(
      pageInput({ reset: { label: 'Reset to default', prompt: 'Reset “Presets”?', confirmLabel: 'Reset', run } })
    );
    const ids = items.map((item) => item.id);
    expect(ids.indexOf('page.reset')).toBe(ids.indexOf('page.delete') - 1);
    const reset = byId(items, 'page.reset');
    expect(reset).toMatchObject({ label: 'Reset to default', danger: true, separatorBefore: true });
    expect(reset.confirm).toEqual({ prompt: 'Reset “Presets”?', confirmLabel: 'Reset' });
    reset.run();
    expect(run).toHaveBeenCalledTimes(1);
    expect(byId(items, 'page.delete').separatorBefore).toBe(false);
    expect(byId(buildPageMenuItems(pageInput()), 'page.delete').separatorBefore).toBe(true);
  });

  it('shows only the page list when no page is active', () => {
    const items = buildPageMenuItems(pageInput({ activePageId: 'missing' }));
    expect(items.every((item) => item.kind === 'header' || item.kind === 'radio')).toBe(true);
  });
});

function layoutInput(overrides: Partial<EditBarLayoutMenuInput> = {}): EditBarLayoutMenuInput {
  return {
    hostItems: [],
    savedLayouts: [],
    backups: [],
    hasActivePage: true,
    actions: {
      save: vi.fn(),
      apply: vi.fn(),
      manage: vi.fn(),
      restore: vi.fn(),
      importFile: vi.fn(),
      exportPage: vi.fn()
    },
    ...overrides
  };
}

describe('LAYOUT menu', () => {
  it('lists host items first, then the generic page-layout items', () => {
    const host: WorkbenchMenuItem = { id: 'host.preset', kind: 'radio', label: 'Default', checked: true, run: () => {} };
    const items = buildLayoutMenuItems(layoutInput({ hostItems: [host] }));
    expect(labels(items)).toEqual(['Default', 'Save this page as layout', 'Saved layouts (0)', 'Import…', 'Export this page']);
    expect(byId(items, 'layout.save').separatorBefore).toBe(true);
    expect(byId(buildLayoutMenuItems(layoutInput()), 'layout.save').separatorBefore).toBe(false);
  });

  it('nests saved layouts (sorted, apply each) and Manage layouts… in a counted submenu', () => {
    const input = layoutInput({
      savedLayouts: [
        { id: 'b', label: 'Studio copy' },
        { id: 'a', label: 'Grid Layout 1' }
      ]
    });
    const saved = byId(buildLayoutMenuItems(input), 'layout.saved');
    expect(saved).toMatchObject({ kind: 'submenu', label: 'Saved layouts (2)' });
    expect(labels(saved.items!)).toEqual(['Apply to this page', 'Grid Layout 1', 'Studio copy', 'Manage layouts…']);
    byId(saved.items!, 'layout.saved.b').run();
    expect(input.actions.apply).toHaveBeenCalledWith('b');
    byId(saved.items!, 'layout.saved.manage').run();
    expect(input.actions.manage).toHaveBeenCalled();
  });

  it('offers Manage layouts… even with nothing saved', () => {
    const saved = byId(buildLayoutMenuItems(layoutInput()), 'layout.saved');
    expect(labels(saved.items!)).toEqual(['No saved layouts yet', 'Manage layouts…']);
  });

  it('shows Backups only when the provider listed entries; each restore asks first', () => {
    expect(buildLayoutMenuItems(layoutInput()).some((item) => item.id === 'layout.backups')).toBe(false);
    const entry = { slot: 1, rev: 3, updatedAt: null, layoutCount: 1 };
    const input = layoutInput({ backups: [entry] });
    const backups = byId(buildLayoutMenuItems(input), 'layout.backups');
    expect(backups.kind).toBe('submenu');
    const restore = byId(backups.items!, 'layout.backup.1');
    expect(restore).toMatchObject({ label: 'Unknown time', hint: '1 layout' });
    expect(restore.confirm?.confirmLabel).toBe('Restore');
    restore.run();
    expect(input.actions.restore).toHaveBeenCalledWith(entry);
  });

  it('wires save / import / export and disables page actions without an active page', () => {
    const input = layoutInput();
    const items = buildLayoutMenuItems(input);
    byId(items, 'layout.save').run();
    byId(items, 'layout.import').run();
    byId(items, 'layout.export').run();
    expect(input.actions.save).toHaveBeenCalled();
    expect(input.actions.importFile).toHaveBeenCalled();
    expect(input.actions.exportPage).toHaveBeenCalled();
    const none = buildLayoutMenuItems(layoutInput({ hasActivePage: false }));
    expect(byId(none, 'layout.save').disabled).toBe(true);
    expect(byId(none, 'layout.export').disabled).toBe(true);
  });
});

describe('PROFILE, Add and More menus', () => {
  it('renders profile options as radio rows with the Auto-resolved hint', () => {
    const select = vi.fn();
    const items = buildProfileMenuItems(
      [
        { id: null, label: 'Auto', active: true, resolved: false, title: '' },
        { id: 'desk', label: 'Desktop', viewportClass: 'desktop', active: false, resolved: true, title: '' }
      ],
      select
    );
    expect(items[0].kind).toBe('header');
    expect(items.slice(1).map((item) => [item.kind, item.label, item.checked, item.hint])).toEqual([
      ['radio', 'Auto', true, undefined],
      ['radio', 'Desktop', false, 'auto']
    ]);
    items[1].run();
    expect(select).toHaveBeenCalledWith(null);
    items[2].run();
    expect(select).toHaveBeenCalledWith('desk');
  });

  it('lists the Add actions; Add page is a submenu', () => {
    const actions = { addPanel: vi.fn(), addCustomPanel: vi.fn(), addWidget: vi.fn(), openLibrary: vi.fn() };
    const blank = vi.fn();
    const addPageItems = buildAddPageMenuItems({ blank });
    const items = buildAddMenuItems({ pageLabel: 'Grid', actions, addPageItems });
    expect(items[0]).toMatchObject({ kind: 'header', label: 'Add to Grid' });
    expect(labels(items.slice(1))).toEqual(['Add panel…', 'Add custom panel', 'Add widget…', 'Add page', 'Open library']);
    expect(byId(items, 'add.page')).toMatchObject({ kind: 'submenu', items: addPageItems });
    items.slice(1).forEach((item) => item.run());
    Object.values(actions).forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
    expect(blank).not.toHaveBeenCalled();
  });

  it('Add page: host rows around the generic Blank page row', () => {
    const blank = vi.fn();
    expect(buildAddPageMenuItems({ blank }).map((item) => [item.id, item.label, item.separatorBefore])).toEqual([
      ['addPage.blank', 'Blank page', false]
    ]);
    const lead: WorkbenchMenuItem = { id: 'h', kind: 'header', label: 'Missing default pages', run: () => {} };
    const trail: WorkbenchMenuItem = { id: 't', label: 'Restore default pages (2)', run: () => {} };
    const items = buildAddPageMenuItems({ host: { leading: [lead], trailing: [trail] }, blank });
    expect(items.map((item) => item.id)).toEqual(['h', 'addPage.blank', 't']);
    expect(byId(items, 'addPage.blank').separatorBefore).toBe(true);
    byId(items, 'addPage.blank').run();
    expect(blank).toHaveBeenCalledTimes(1);
  });

  it('builds one submenu per collapsed group, carrying its full menu', () => {
    const names = { page: 'Grid', layout: 'Default', profile: 'Auto · Desktop' };
    expect(editBarMoreLabel('page', names)).toBe('Page: Grid');
    expect(editBarMoreLabel('layout', names)).toBe('Layout: Default');
    expect(editBarMoreLabel('profile', names)).toBe('Profile: Auto · Desktop');
    expect(editBarMoreLabel('add', names)).toBe('Add');
    const child: WorkbenchMenuItem = { id: 'c', label: 'Child', run: () => {} };
    const more = buildMoreMenuItems([
      { id: 'layout', label: 'Layout: Default', items: [child] },
      { id: 'add', label: 'Add', items: [] }
    ]);
    expect(more.map((item) => [item.id, item.kind, item.label])).toEqual([
      ['more.layout', 'submenu', 'Layout: Default'],
      ['more.add', 'submenu', 'Add']
    ]);
    expect(more[0].items).toEqual([child]);
  });

  it('a group that is one action (Add with a palette) is a plain row', () => {
    const run = vi.fn();
    const more = buildMoreMenuItems([{ id: 'add', label: 'Add…', items: [], run }]);
    expect(more).toEqual([{ id: 'more.add', label: 'Add…', run }]);
    more[0].run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('status text / error chip', () => {
  const failed = { error: { message: 'Page label cannot be empty.' } };
  const base = { dragging: false, notice: null, lastResult: null, dismissedResult: null };

  it('shows the idle hint by default and the drag hint while dragging', () => {
    expect(resolveEditBarStatus(base)).toEqual({ error: null, text: EDIT_BAR_STATUS_IDLE, tone: 'idle' });
    expect(resolveEditBarStatus({ ...base, dragging: true })).toMatchObject({ text: EDIT_BAR_STATUS_DRAG, tone: 'drag' });
  });

  it('while placing, the line names the item and how to place it (over the drag hint)', () => {
    const placing = { label: 'Preset Browser' };
    expect(resolveEditBarStatus({ ...base, placing })).toEqual({
      error: null,
      text: 'Preset Browser · Click a highlight to place · Esc cancels',
      tone: 'drag'
    });
    expect(resolveEditBarStatus({ ...base, placing, dragging: true }).text).toContain('Click a highlight to place');
    expect(resolveEditBarStatus({ ...base, placing, lastResult: failed }).error).toBe('Page label cannot be empty.');
  });

  it('while placing with an active spot, the line says where it lands', () => {
    expect(resolveEditBarStatus({ ...base, placing: { label: 'History', active: 'Split right · Signal Grid' } }).text).toBe(
      'History → Split right · Signal Grid · Click or Enter places · Esc cancels'
    );
    expect(resolveEditBarStatus({ ...base, placing: { label: 'History', active: null } }).text).toBe(
      'History · Click a highlight to place · Esc cancels'
    );
  });

  it('an ok notice replaces the hint (but not the drag hint)', () => {
    const notice = { tone: 'ok' as const, message: 'Saved “Grid Layout 1”.' };
    expect(resolveEditBarStatus({ ...base, notice })).toMatchObject({ text: notice.message, tone: 'ok', error: null });
    expect(resolveEditBarStatus({ ...base, notice, dragging: true }).tone).toBe('drag');
  });

  it('shows a command error until that very result is dismissed', () => {
    expect(resolveEditBarStatus({ ...base, lastResult: failed }).error).toBe('Page label cannot be empty.');
    expect(resolveEditBarStatus({ ...base, lastResult: failed, dismissedResult: failed }).error).toBeNull();
    // A NEW failing result shows again even after an earlier dismissal.
    const again = { error: { message: 'Page label cannot be empty.' } };
    expect(resolveEditBarStatus({ ...base, lastResult: again, dismissedResult: failed }).error).not.toBeNull();
    // A successful result has no chip.
    expect(resolveEditBarStatus({ ...base, lastResult: { error: undefined } }).error).toBeNull();
  });

  it('a result that already existed when the bar mounted is treated as dismissed', () => {
    // The bar seeds dismissedResult with the result present at mount.
    const atMount = failed;
    expect(resolveEditBarStatus({ ...base, lastResult: failed, dismissedResult: atMount }).error).toBeNull();
  });

  it('an error notice wins over the command error', () => {
    const notice = { tone: 'error' as const, message: 'File is not valid JSON.' };
    expect(resolveEditBarStatus({ ...base, notice, lastResult: failed }).error).toBe('File is not valid JSON.');
  });
});
