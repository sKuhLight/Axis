import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument } from '../defaults';
import { repairWorkbenchDocument } from '../invariants';
import { reduceWorkbenchDocument } from '../reducer';
import type { PanelInstance, WidgetInstance, WorkbenchDocument } from '../schema';
import { selectActiveLayout } from '../selectors';

const panel = (id: string, extra: Partial<PanelInstance> = {}): PanelInstance => ({
  id,
  type: 'test.panel',
  title: id,
  ...extra
});

const widget = (id: string, zone = 'top.left', order = 0, extra: Partial<WidgetInstance> = {}): WidgetInstance => ({
  id,
  type: 'test.widget',
  zone,
  order,
  size: 'default',
  ...extra
});

const doc = (): WorkbenchDocument =>
  createEmptyWorkbenchDocument({
    profileId: 'profile.test',
    layoutId: 'layout.test'
  });

const layout = (d: WorkbenchDocument) => selectActiveLayout(d)!;

describe('reduceWorkbenchDocument — panels', () => {
  it('adds a panel to an empty main region', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' });

    expect(r.success).toBe(true);
    const root = layout(r.next).dock.root.main;
    expect(root?.kind).toBe('tabs');
    if (root?.kind === 'tabs') expect(root.panelIds).toEqual(['panel.a']);
  });

  it('adds a second panel as a tab', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const second = reduceWorkbenchDocument(first, {
      type: 'panel.add',
      panel: panel('panel.b'),
      region: 'main',
      target: { kind: 'tab', targetPanelId: 'panel.a' }
    });

    const root = layout(second.next).dock.root.main;
    expect(second.success).toBe(true);
    expect(root?.kind).toBe('tabs');
    if (root?.kind === 'tabs') {
      expect(root.panelIds).toEqual(['panel.a', 'panel.b']);
      expect(root.activePanelId).toBe('panel.b');
    }
  });

  it('activates an existing tab without reordering it', () => {
    let next = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    next = reduceWorkbenchDocument(next, {
      type: 'panel.add',
      panel: panel('panel.b'),
      region: 'main',
      target: { kind: 'tab', targetPanelId: 'panel.a' }
    }).next;

    const activated = reduceWorkbenchDocument(next, { type: 'panel.activate', panelId: 'panel.a' });
    const root = layout(activated.next).dock.root.main;

    expect(activated.success).toBe(true);
    expect(root?.kind).toBe('tabs');
    if (root?.kind === 'tabs') {
      expect(root.panelIds).toEqual(['panel.a', 'panel.b']);
      expect(root.activePanelId).toBe('panel.a');
    }
  });

  it('moves a panel from main to right', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const moved = reduceWorkbenchDocument(first, {
      type: 'panel.move',
      panelId: 'panel.a',
      to: { kind: 'region', region: 'right' }
    });

    expect(moved.success).toBe(true);
    expect(layout(moved.next).dock.root.main).toBeNull();
    const right = layout(moved.next).dock.root.right;
    expect(right?.kind).toBe('tabs');
    if (right?.kind === 'tabs') expect(right.panelIds).toEqual(['panel.a']);
  });

  it('splits panels', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const split = reduceWorkbenchDocument(first, {
      type: 'panel.split',
      panel: panel('panel.b'),
      targetPanelId: 'panel.a',
      axis: 'horizontal'
    });

    const root = layout(split.next).dock.root.main;
    expect(split.success).toBe(true);
    expect(root?.kind).toBe('split');
    if (root?.kind === 'split') {
      expect(root.axis).toBe('horizontal');
      expect(root.children).toHaveLength(2);
      expect(root.ratio).toHaveLength(2);
    }
  });

  it('closes a panel and repairs an empty tab stack', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const closed = reduceWorkbenchDocument(first, { type: 'panel.close', panelId: 'panel.a' });

    expect(closed.success).toBe(true);
    expect(layout(closed.next).dock.root.main).toBeNull();
    expect(layout(closed.next).panels['panel.a']).toBeUndefined();
  });

  it('moves panel-zone widgets to hidden when closing a panel', () => {
    let next = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.custom'), region: 'main' }).next;
    next = reduceWorkbenchDocument(next, {
      type: 'zone.ensure',
      zone: { id: 'panel:panel.custom', label: 'Custom', orientation: 'free', acceptsGroups: true }
    }).next;
    next = reduceWorkbenchDocument(next, {
      type: 'widget.add',
      widget: widget('widget.a', 'panel:panel.custom'),
      zone: 'panel:panel.custom'
    }).next;

    const closed = reduceWorkbenchDocument(next, { type: 'panel.close', panelId: 'panel.custom' });

    expect(closed.success).toBe(true);
    expect(layout(closed.next).panels['panel.custom']).toBeUndefined();
    expect(layout(closed.next).zones['panel:panel.custom']).toBeUndefined();
    expect(layout(closed.next).widgets['widget.a'].zone).toBe('hidden');
  });

  it('prevents closing a locked panel', () => {
    const first = reduceWorkbenchDocument(doc(), {
      type: 'panel.add',
      panel: panel('panel.a', { locked: true }),
      region: 'main'
    }).next;
    const closed = reduceWorkbenchDocument(first, { type: 'panel.close', panelId: 'panel.a' });

    expect(closed.success).toBe(false);
    expect(closed.error?.code).toBe('locked-panel');
  });

  it('tabs a panel onto a stack it is already in', () => {
    let next = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    next = reduceWorkbenchDocument(next, {
      type: 'panel.add',
      panel: panel('panel.b'),
      region: 'main',
      target: { kind: 'tab', targetPanelId: 'panel.a' }
    }).next;

    const tabbed = reduceWorkbenchDocument(next, { type: 'panel.tab', panelId: 'panel.a', targetPanelId: 'panel.b' });
    const root = layout(tabbed.next).dock.root.main;

    expect(tabbed.success).toBe(true);
    expect(root?.kind).toBe('tabs');
    if (root?.kind === 'tabs') {
      expect(root.panelIds).toEqual(['panel.b', 'panel.a']);
      expect(root.activePanelId).toBe('panel.a');
    }
  });

  it('rejects tabbing unknown panels', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const missingPanel = reduceWorkbenchDocument(first, { type: 'panel.tab', panelId: 'missing', targetPanelId: 'panel.a' });
    const missingTarget = reduceWorkbenchDocument(first, { type: 'panel.tab', panelId: 'panel.a', targetPanelId: 'missing' });

    expect(missingPanel.success).toBe(false);
    expect(missingPanel.error?.code).toBe('missing-panel');
    expect(missingTarget.success).toBe(false);
    expect(missingTarget.error?.code).toBe('missing-target');
  });

  it('renames a panel with a trimmed title', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const renamed = reduceWorkbenchDocument(first, { type: 'panel.rename', panelId: 'panel.a', title: '  Inspector  ' });

    expect(renamed.success).toBe(true);
    expect(layout(renamed.next).panels['panel.a'].title).toBe('Inspector');
  });

  it('rejects invalid panel rename commands', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const empty = reduceWorkbenchDocument(first, { type: 'panel.rename', panelId: 'panel.a', title: '' });
    const whitespace = reduceWorkbenchDocument(first, { type: 'panel.rename', panelId: 'panel.a', title: '   ' });
    const missing = reduceWorkbenchDocument(first, { type: 'panel.rename', panelId: 'missing', title: 'Inspector' });

    expect(empty.success).toBe(false);
    expect(empty.error?.code).toBe('invalid-command');
    expect(whitespace.success).toBe(false);
    expect(whitespace.error?.code).toBe('invalid-command');
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-panel');
  });

  it('collapses and expands a panel', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const collapsed = reduceWorkbenchDocument(first, { type: 'panel.collapse', panelId: 'panel.a', collapsed: true });
    const expanded = reduceWorkbenchDocument(collapsed.next, { type: 'panel.collapse', panelId: 'panel.a', collapsed: false });
    const missing = reduceWorkbenchDocument(first, { type: 'panel.collapse', panelId: 'missing', collapsed: true });

    expect(collapsed.success).toBe(true);
    expect(layout(collapsed.next).panels['panel.a'].collapsed).toBe(true);
    expect(expanded.success).toBe(true);
    expect(layout(expanded.next).panels['panel.a'].collapsed).toBe(false);
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-panel');
  });

  it('rejects adding a second panel with the same singleton key', () => {
    const first = reduceWorkbenchDocument(doc(), {
      type: 'panel.add',
      panel: panel('panel.a', { singletonKey: 'inspector' }),
      region: 'main'
    }).next;
    const duplicate = reduceWorkbenchDocument(first, {
      type: 'panel.add',
      panel: panel('panel.b', { singletonKey: 'inspector' }),
      region: 'main'
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.code).toBe('duplicate-singleton');
    expect(duplicate.error?.message).toContain('inspector');
    expect(layout(duplicate.next).panels['panel.b']).toBeUndefined();
  });

  it('repairs duplicate singleton panels by keeping the docked instance', () => {
    const next = doc();
    layout(next).panels['panel.b'] = panel('panel.b', { singletonKey: 'inspector' });
    layout(next).panels['panel.a'] = panel('panel.a', { singletonKey: 'inspector' });
    layout(next).dock.root.main = { kind: 'tabs', id: 'tabs.main', activePanelId: 'panel.a', panelIds: ['panel.a'] };

    const repaired = repairWorkbenchDocument(next);
    const root = layout(repaired).dock.root.main;

    expect(layout(repaired).panels['panel.a']).toBeDefined();
    expect(layout(repaired).panels['panel.b']).toBeUndefined();
    expect(root?.kind).toBe('tabs');
    if (root?.kind === 'tabs') expect(root.panelIds).toEqual(['panel.a']);
  });

  it('resizes a region', () => {
    const resized = reduceWorkbenchDocument(doc(), { type: 'region.resize', region: 'right', sizePx: 420 });

    expect(resized.success).toBe(true);
    expect(layout(resized.next).dock.regions.right.sizePx).toBe(420);
  });

  it('clamps region resize to non-negative sizes', () => {
    const resized = reduceWorkbenchDocument(doc(), { type: 'region.resize', region: 'left', sizePx: -50 });

    expect(resized.success).toBe(true);
    expect(layout(resized.next).dock.regions.left.sizePx).toBe(0);
  });

  it('resizes splits with normalized ratios', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const split = reduceWorkbenchDocument(first, {
      type: 'panel.split',
      panel: panel('panel.b'),
      targetPanelId: 'panel.a',
      axis: 'horizontal'
    }).next;
    const root = layout(split).dock.root.main;
    const splitId = root?.kind === 'split' ? root.id : '';

    const resized = reduceWorkbenchDocument(split, { type: 'split.resize', splitId, ratio: [3, 1] });
    const missing = reduceWorkbenchDocument(split, { type: 'split.resize', splitId: 'missing', ratio: [1, 1] });

    const resizedRoot = layout(resized.next).dock.root.main;
    expect(resized.success).toBe(true);
    expect(resizedRoot?.kind).toBe('split');
    if (resizedRoot?.kind === 'split') expect(resizedRoot.ratio).toEqual([0.75, 0.25]);
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-split');
  });

  it('collapses a region', () => {
    const collapsed = reduceWorkbenchDocument(doc(), { type: 'region.collapse', region: 'bottom', collapsed: true });

    expect(collapsed.success).toBe(true);
    expect(layout(collapsed.next).dock.regions.bottom.collapsed).toBe(true);
  });
});

describe('reduceWorkbenchDocument — widget zones', () => {
  it('ensures, renames, and hides widget zones', () => {
    let next = doc();
    const ensured = reduceWorkbenchDocument(next, {
      type: 'zone.ensure',
      zone: { id: 'panel:panel.a', label: 'Panel A', orientation: 'free', acceptsGroups: true }
    });
    next = ensured.next;
    const renamed = reduceWorkbenchDocument(next, { type: 'zone.rename', zoneId: 'panel:panel.a', label: '  Controls  ' });
    const hidden = reduceWorkbenchDocument(renamed.next, { type: 'zone.hide', zoneId: 'panel:panel.a', hidden: true });

    expect(ensured.success).toBe(true);
    expect(renamed.success).toBe(true);
    expect(hidden.success).toBe(true);
    expect(layout(hidden.next).zones['panel:panel.a']).toMatchObject({ label: 'Controls', hidden: true });
  });

  it('deletes non-default zones while moving widgets to hidden', () => {
    let next = reduceWorkbenchDocument(doc(), {
      type: 'zone.ensure',
      zone: { id: 'panel:panel.a', label: 'Panel A', orientation: 'free', acceptsGroups: true }
    }).next;
    next = reduceWorkbenchDocument(next, {
      type: 'widget.add',
      widget: widget('widget.a', 'panel:panel.a'),
      zone: 'panel:panel.a'
    }).next;

    const deleted = reduceWorkbenchDocument(next, { type: 'zone.delete', zoneId: 'panel:panel.a' });
    const protectedZone = reduceWorkbenchDocument(next, { type: 'zone.delete', zoneId: 'top.left' });
    const missingZone = reduceWorkbenchDocument(next, { type: 'zone.rename', zoneId: 'missing', label: 'Missing' });

    expect(deleted.success).toBe(true);
    expect(layout(deleted.next).zones['panel:panel.a']).toBeUndefined();
    expect(layout(deleted.next).widgets['widget.a'].zone).toBe('hidden');
    expect(protectedZone.success).toBe(false);
    expect(protectedZone.error?.code).toBe('protected-zone');
    expect(missingZone.success).toBe(false);
    expect(missingZone.error?.code).toBe('missing-zone');
  });

  it('deletes zones while moving widgets to an explicit target zone', () => {
    let next = reduceWorkbenchDocument(doc(), {
      type: 'zone.ensure',
      zone: { id: 'panel:panel.a', label: 'Panel A', orientation: 'free', acceptsGroups: true }
    }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.a', 'panel:panel.a'), zone: 'panel:panel.a' }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.b', 'panel:panel.a', 1), zone: 'panel:panel.a' }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.c'), zone: 'top.left' }).next;

    const deleted = reduceWorkbenchDocument(next, { type: 'zone.delete', zoneId: 'panel:panel.a', moveWidgetsTo: 'top.left' });

    expect(deleted.success).toBe(true);
    expect(layout(deleted.next).zones['panel:panel.a']).toBeUndefined();
    expect(layout(deleted.next).widgets['widget.c'].order).toBe(0);
    expect(layout(deleted.next).widgets['widget.a']).toMatchObject({ zone: 'top.left', order: 1 });
    expect(layout(deleted.next).widgets['widget.b']).toMatchObject({ zone: 'top.left', order: 2 });
  });
});

describe('reduceWorkbenchDocument — widgets', () => {
  it('adds a widget to a top zone', () => {
    const added = reduceWorkbenchDocument(doc(), {
      type: 'widget.add',
      widget: widget('widget.a'),
      zone: 'top.left'
    });

    expect(added.success).toBe(true);
    expect(layout(added.next).widgets['widget.a'].zone).toBe('top.left');
  });

  it('moves a widget between zones', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'widget.add', widget: widget('widget.a'), zone: 'top.left' }).next;
    const moved = reduceWorkbenchDocument(first, { type: 'widget.move', widgetIds: ['widget.a'], zone: 'rail' });

    expect(moved.success).toBe(true);
    expect(layout(moved.next).widgets['widget.a'].zone).toBe('rail');
  });

  it('hides a widget', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'widget.add', widget: widget('widget.a'), zone: 'top.left' }).next;
    const hidden = reduceWorkbenchDocument(first, { type: 'widget.hide', widgetIds: ['widget.a'] });

    expect(hidden.success).toBe(true);
    expect(layout(hidden.next).widgets['widget.a'].zone).toBe('hidden');
  });

  it('prevents hiding a locked widget', () => {
    const first = reduceWorkbenchDocument(doc(), {
      type: 'widget.add',
      widget: widget('widget.a', 'top.left', 0, { locked: true }),
      zone: 'top.left'
    }).next;
    const hidden = reduceWorkbenchDocument(first, { type: 'widget.hide', widgetIds: ['widget.a'] });

    expect(hidden.success).toBe(false);
    expect(hidden.error?.code).toBe('locked-widget');
  });

  it('resizes widgets', () => {
    const first = reduceWorkbenchDocument(doc(), { type: 'widget.add', widget: widget('widget.a'), zone: 'top.left' }).next;
    const compact = reduceWorkbenchDocument(first, { type: 'widget.resize', widgetId: 'widget.a', size: 'compact' });
    const mini = reduceWorkbenchDocument(compact.next, { type: 'widget.resize', widgetId: 'widget.a', size: 'mini' });
    const missing = reduceWorkbenchDocument(first, { type: 'widget.resize', widgetId: 'missing', size: 'compact' });

    expect(compact.success).toBe(true);
    expect(layout(compact.next).widgets['widget.a'].size).toBe('compact');
    expect(mini.success).toBe(true);
    expect(layout(mini.next).widgets['widget.a'].size).toBe('mini');
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-widget');
  });

  it('prevents resizing a locked widget', () => {
    const first = reduceWorkbenchDocument(doc(), {
      type: 'widget.add',
      widget: widget('widget.a', 'top.left', 0, { locked: true }),
      zone: 'top.left'
    }).next;
    const resized = reduceWorkbenchDocument(first, { type: 'widget.resize', widgetId: 'widget.a', size: 'compact' });

    expect(resized.success).toBe(false);
    expect(resized.error?.code).toBe('locked-widget');
    expect(layout(resized.next).widgets['widget.a'].size).toBe('default');
  });

  it('groups widgets', () => {
    let next = reduceWorkbenchDocument(doc(), { type: 'widget.add', widget: widget('widget.a', 'top.left', 0), zone: 'top.left' }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.b', 'top.left', 1), zone: 'top.left' }).next;
    const grouped = reduceWorkbenchDocument(next, { type: 'widget.group', widgetIds: ['widget.b', 'widget.a'], groupId: 'group.a' });

    expect(grouped.success).toBe(true);
    expect(layout(grouped.next).widgetGroups['group.a'].widgetIds).toEqual(['widget.a', 'widget.b']);
    expect(layout(grouped.next).widgets['widget.a'].groupId).toBe('group.a');
  });

  it('prevents grouping locked widgets', () => {
    let next = reduceWorkbenchDocument(doc(), {
      type: 'widget.add',
      widget: widget('widget.a', 'top.left', 0, { locked: true }),
      zone: 'top.left'
    }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.b', 'top.left', 1), zone: 'top.left' }).next;
    const grouped = reduceWorkbenchDocument(next, { type: 'widget.group', widgetIds: ['widget.a', 'widget.b'], groupId: 'group.a' });

    expect(grouped.success).toBe(false);
    expect(grouped.error?.code).toBe('locked-widget');
  });

  it('preserves and protects locked widget groups', () => {
    let next = reduceWorkbenchDocument(doc(), { type: 'widget.add', widget: widget('widget.a', 'top.left', 0), zone: 'top.left' }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.b', 'top.left', 1), zone: 'top.left' }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.group', widgetIds: ['widget.a', 'widget.b'], groupId: 'group.a' }).next;
    layout(next).widgetGroups['group.a'].locked = true;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.c', 'top.left', 2), zone: 'top.left' }).next;

    const changed = reduceWorkbenchDocument(next, {
      type: 'widget.group',
      groupId: 'group.a',
      widgetIds: ['widget.a', 'widget.b', 'widget.c']
    });
    const ungrouped = reduceWorkbenchDocument(next, { type: 'widget.ungroup', groupId: 'group.a' });

    expect(changed.success).toBe(false);
    expect(changed.error?.code).toBe('locked-widget-group');
    expect(ungrouped.success).toBe(false);
    expect(ungrouped.error?.code).toBe('locked-widget-group');
  });

  it('ungroups widgets', () => {
    let next = reduceWorkbenchDocument(doc(), { type: 'widget.add', widget: widget('widget.a', 'top.left', 0), zone: 'top.left' }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.add', widget: widget('widget.b', 'top.left', 1), zone: 'top.left' }).next;
    next = reduceWorkbenchDocument(next, { type: 'widget.group', widgetIds: ['widget.a', 'widget.b'], groupId: 'group.a' }).next;
    const ungrouped = reduceWorkbenchDocument(next, { type: 'widget.ungroup', groupId: 'group.a' });

    expect(ungrouped.success).toBe(true);
    expect(layout(ungrouped.next).widgetGroups['group.a']).toBeUndefined();
    expect(layout(ungrouped.next).widgets['widget.a'].groupId).toBeNull();
    expect(layout(ungrouped.next).widgets['widget.b'].order).toBeGreaterThan(layout(ungrouped.next).widgets['widget.a'].order);
  });
});

describe('reduceWorkbenchDocument — navigation', () => {
  const withNav = () => {
    const next = doc();
    layout(next).navigation.entries = {
      grid: { id: 'grid', label: 'Grid' },
      account: { id: 'account', label: 'Account', locked: true, fixedSlot: 'rail.footer' },
      setup: { id: 'setup', label: 'Setup' }
    };
    layout(next).navigation.order = ['grid', 'account', 'setup'];
    return next;
  };

  it('moves a navigation entry', () => {
    const moved = reduceWorkbenchDocument(withNav(), { type: 'navigation.move', entryId: 'setup', index: 0 });

    expect(moved.success).toBe(true);
    expect(layout(moved.next).navigation.order).toEqual(['setup', 'grid', 'account']);
  });

  it('hides a navigation entry', () => {
    const hidden = reduceWorkbenchDocument(withNav(), { type: 'navigation.hide', entryId: 'setup' });

    expect(hidden.success).toBe(true);
    expect(layout(hidden.next).navigation.entries.setup.hidden).toBe(true);
  });

  it('prevents hiding a locked navigation entry', () => {
    const hidden = reduceWorkbenchDocument(withNav(), { type: 'navigation.hide', entryId: 'account' });

    expect(hidden.success).toBe(false);
    expect(hidden.error?.code).toBe('locked-navigation');
  });
});

describe('reduceWorkbenchDocument — profiles', () => {
  it('adds, activates, and renames profiles', () => {
    let next = doc();
    next.layouts['layout.stage'] = { ...layout(next), id: 'layout.stage', label: 'Stage Layout' };

    const added = reduceWorkbenchDocument(next, {
      type: 'profile.add',
      profile: { id: 'profile.stage', label: '  Stage  ', layoutId: 'layout.stage', breakpoint: 'desktop' }
    });
    const activated = reduceWorkbenchDocument(added.next, { type: 'profile.activate', profileId: 'profile.stage' });
    const renamed = reduceWorkbenchDocument(activated.next, { type: 'profile.rename', profileId: 'profile.stage', label: '  Performance  ' });

    expect(added.success).toBe(true);
    expect(added.next.profiles['profile.stage'].label).toBe('Stage');
    expect(activated.success).toBe(true);
    expect(activated.next.activeProfileId).toBe('profile.stage');
    expect(renamed.success).toBe(true);
    expect(renamed.next.profiles['profile.stage'].label).toBe('Performance');
  });

  it('sets a profile layout only when the profile and layout exist', () => {
    let next = doc();
    next.profiles['profile.stage'] = { id: 'profile.stage', label: 'Stage', layoutId: 'layout.test' };
    next.layouts['layout.stage'] = { ...layout(next), id: 'layout.stage', label: 'Stage Layout' };

    const changed = reduceWorkbenchDocument(next, { type: 'profile.setLayout', profileId: 'profile.stage', layoutId: 'layout.stage' });
    const missingProfile = reduceWorkbenchDocument(next, { type: 'profile.setLayout', profileId: 'missing', layoutId: 'layout.stage' });
    const missingLayout = reduceWorkbenchDocument(next, { type: 'profile.setLayout', profileId: 'profile.stage', layoutId: 'missing' });

    expect(changed.success).toBe(true);
    expect(changed.next.profiles['profile.stage'].layoutId).toBe('layout.stage');
    expect(missingProfile.success).toBe(false);
    expect(missingProfile.error?.code).toBe('missing-profile');
    expect(missingLayout.success).toBe(false);
    expect(missingLayout.error?.code).toBe('missing-layout');
  });

  it('rejects invalid profile commands', () => {
    const duplicate = reduceWorkbenchDocument(doc(), {
      type: 'profile.add',
      profile: { id: 'profile.test', label: 'Duplicate', layoutId: 'layout.test' }
    });
    const emptyLabel = reduceWorkbenchDocument(doc(), {
      type: 'profile.add',
      profile: { id: 'profile.empty', label: '  ', layoutId: 'layout.test' }
    });
    const missingLayout = reduceWorkbenchDocument(doc(), {
      type: 'profile.add',
      profile: { id: 'profile.stage', label: 'Stage', layoutId: 'missing' }
    });
    const missingActivate = reduceWorkbenchDocument(doc(), { type: 'profile.activate', profileId: 'missing' });

    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.code).toBe('duplicate-id');
    expect(emptyLabel.success).toBe(false);
    expect(emptyLabel.error?.code).toBe('invalid-command');
    expect(missingLayout.success).toBe(false);
    expect(missingLayout.error?.code).toBe('missing-layout');
    expect(missingActivate.success).toBe(false);
    expect(missingActivate.error?.code).toBe('missing-profile');
  });

  it('deletes inactive profiles and protects active or last profiles without fallback', () => {
    let next = doc();
    next.profiles['profile.stage'] = { id: 'profile.stage', label: 'Stage', layoutId: 'layout.test' };

    const deletedInactive = reduceWorkbenchDocument(next, { type: 'profile.delete', profileId: 'profile.stage' });
    const lastProfile = reduceWorkbenchDocument(doc(), { type: 'profile.delete', profileId: 'profile.test' });
    const activeWithoutFallback = reduceWorkbenchDocument(next, { type: 'profile.delete', profileId: 'profile.test' });
    const activeWithFallback = reduceWorkbenchDocument(next, {
      type: 'profile.delete',
      profileId: 'profile.test',
      fallbackProfileId: 'profile.stage'
    });

    expect(deletedInactive.success).toBe(true);
    expect(deletedInactive.next.profiles['profile.stage']).toBeUndefined();
    expect(lastProfile.success).toBe(false);
    expect(lastProfile.error?.code).toBe('protected-profile');
    expect(activeWithoutFallback.success).toBe(false);
    expect(activeWithoutFallback.error?.code).toBe('protected-profile');
    expect(activeWithFallback.success).toBe(true);
    expect(activeWithFallback.next.activeProfileId).toBe('profile.stage');
    expect(activeWithFallback.next.profiles['profile.test']).toBeUndefined();
  });
});

describe('reduceWorkbenchDocument — layouts', () => {
  it('renames layouts with trimmed labels', () => {
    const renamed = reduceWorkbenchDocument(doc(), { type: 'layout.rename', layoutId: 'layout.test', label: '  Studio  ' });

    expect(renamed.success).toBe(true);
    expect(renamed.next.layouts['layout.test'].label).toBe('Studio');
  });

  it('rejects invalid layout rename commands', () => {
    const empty = reduceWorkbenchDocument(doc(), { type: 'layout.rename', layoutId: 'layout.test', label: '   ' });
    const missing = reduceWorkbenchDocument(doc(), { type: 'layout.rename', layoutId: 'missing', label: 'Studio' });

    expect(empty.success).toBe(false);
    expect(empty.error?.code).toBe('invalid-command');
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-layout');
  });

  it('deletes unreferenced saved layouts', () => {
    const next = doc();
    layout(next).label = 'Default';
    next.layouts['layout.saved'] = { ...layout(next), id: 'layout.saved', label: 'Saved' };

    const deleted = reduceWorkbenchDocument(next, { type: 'layout.delete', layoutId: 'layout.saved' });

    expect(deleted.success).toBe(true);
    expect(deleted.next.layouts['layout.saved']).toBeUndefined();
    expect(layout(deleted.next).id).toBe('layout.test');
  });

  it('prevents deleting layouts referenced by profiles', () => {
    const next = doc();
    next.layouts['layout.saved'] = { ...layout(next), id: 'layout.saved', label: 'Saved' };
    next.profiles['profile.stage'] = { id: 'profile.stage', label: 'Stage', layoutId: 'layout.saved' };

    const active = reduceWorkbenchDocument(next, { type: 'layout.delete', layoutId: 'layout.test' });
    const referenced = reduceWorkbenchDocument(next, { type: 'layout.delete', layoutId: 'layout.saved' });

    expect(active.success).toBe(false);
    expect(active.error?.code).toBe('protected-layout');
    expect(referenced.success).toBe(false);
    expect(referenced.error?.code).toBe('protected-layout');
  });
});

describe('reduceWorkbenchDocument — libraries', () => {
  it('renames panel templates with trimmed titles', () => {
    const saved = reduceWorkbenchDocument(doc(), {
      type: 'library.panel.save',
      template: {
        id: 'template.panel',
        title: 'Panel',
        panels: { 'panel.template': panel('panel.template') }
      }
    }).next;

    const renamed = reduceWorkbenchDocument(saved, { type: 'library.panel.rename', templateId: 'template.panel', title: '  Better Panel  ' });
    const empty = reduceWorkbenchDocument(saved, { type: 'library.panel.rename', templateId: 'template.panel', title: '  ' });
    const missing = reduceWorkbenchDocument(saved, { type: 'library.panel.rename', templateId: 'missing', title: 'Better Panel' });

    expect(renamed.success).toBe(true);
    expect(renamed.next.panelLibrary['template.panel'].title).toBe('Better Panel');
    expect(empty.success).toBe(false);
    expect(empty.error?.code).toBe('invalid-command');
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-template');
  });

  it('renames widget templates with trimmed titles', () => {
    const saved = reduceWorkbenchDocument(doc(), {
      type: 'library.widget.save',
      template: {
        id: 'template.widget',
        title: 'Widget',
        widgets: { 'widget.template': widget('widget.template') }
      }
    }).next;

    const renamed = reduceWorkbenchDocument(saved, { type: 'library.widget.rename', templateId: 'template.widget', title: '  Better Widget  ' });
    const empty = reduceWorkbenchDocument(saved, { type: 'library.widget.rename', templateId: 'template.widget', title: '  ' });
    const missing = reduceWorkbenchDocument(saved, { type: 'library.widget.rename', templateId: 'missing', title: 'Better Widget' });

    expect(renamed.success).toBe(true);
    expect(renamed.next.widgetLibrary['template.widget'].title).toBe('Better Widget');
    expect(empty.success).toBe(false);
    expect(empty.error?.code).toBe('invalid-command');
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-template');
  });

  it('saves and deletes panel templates', () => {
    const saved = reduceWorkbenchDocument(doc(), {
      type: 'library.panel.save',
      template: {
        id: 'template.panel',
        title: 'Panel',
        panels: {
          'panel.template': panel('panel.template')
        }
      }
    });
    const deleted = reduceWorkbenchDocument(saved.next, { type: 'library.panel.delete', templateId: 'template.panel' });

    expect(saved.success).toBe(true);
    expect(saved.next.panelLibrary['template.panel']).toBeDefined();
    expect(deleted.success).toBe(true);
    expect(deleted.next.panelLibrary['template.panel']).toBeUndefined();
  });

  it('saves and deletes widget templates', () => {
    const saved = reduceWorkbenchDocument(doc(), {
      type: 'library.widget.save',
      template: {
        id: 'template.widget',
        title: 'Widget',
        widgets: {
          'widget.template': widget('widget.template')
        }
      }
    });
    const deleted = reduceWorkbenchDocument(saved.next, { type: 'library.widget.delete', templateId: 'template.widget' });

    expect(saved.success).toBe(true);
    expect(saved.next.widgetLibrary['template.widget']).toBeDefined();
    expect(deleted.success).toBe(true);
    expect(deleted.next.widgetLibrary['template.widget']).toBeUndefined();
  });
});
