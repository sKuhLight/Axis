import { describe, expect, it } from 'vitest';
import {
  AXIS_TOP_BAR_PARITY_MARKER,
  createAxisWorkbenchDefaultDocument,
  ensureAxisTopBarParity
} from '../axisWorkbenchDefaults';
import { createAxisLayoutPreset } from '../axisWorkbenchLayoutPresets';
import { AXIS_TABLET_PROFILE_ID } from '../axisWorkbenchLayoutActions';
import { selectActiveLayout, type WorkbenchLayout } from '../../workbench';

/** The top-bar face of a layout: id → the bits that decide what renders. */
function topBarOf(layout: WorkbenchLayout) {
  return Object.fromEntries(
    Object.values(layout.widgets)
      .filter((widget) => widget.zone.startsWith('top.'))
      .map((widget) => [
        widget.id,
        { type: widget.type, zone: widget.zone, size: widget.size, state: widget.state ?? null }
      ])
  );
}

/** A document whose tablet layout still carries the retired per-device top bar. */
function docWithStaleTablet() {
  const doc = createAxisWorkbenchDefaultDocument();
  const desktop = selectActiveLayout(doc) as WorkbenchLayout;
  const tablet = createAxisLayoutPreset('default', { layoutId: 'axis.layout.tablet' });

  for (const id of Object.keys(tablet.widgets)) {
    if (tablet.widgets[id].zone.startsWith('top.')) delete tablet.widgets[id];
  }
  tablet.widgets['axis.widget.preset'] = { id: 'axis.widget.preset', type: 'axis.preset', zone: 'top.left', order: 0, size: 'default' };
  tablet.widgets['axis.widget.scenes'] = { id: 'axis.widget.scenes', type: 'axis.scenes', zone: 'top.center', order: 0, size: 'default' };
  tablet.widgets['axis.widget.save'] = { id: 'axis.widget.save', type: 'axis.save', zone: 'top.center', order: 1, size: 'default' };
  tablet.widgets['axis.widget.tuner'] = { id: 'axis.widget.tuner', type: 'axis.tuner', zone: 'top.right', order: 0, size: 'default', groupId: 'axis.group.status' };
  tablet.widgets['axis.widget.tempo'] = { id: 'axis.widget.tempo', type: 'axis.tempo', zone: 'top.right', order: 1, size: 'default', groupId: 'axis.group.status' };
  tablet.widgets['axis.widget.cpu'] = { id: 'axis.widget.cpu', type: 'axis.cpu', zone: 'top.right', order: 2, size: 'default', groupId: 'axis.group.status' };
  tablet.widgetGroups['axis.group.status'] = {
    id: 'axis.group.status',
    widgetIds: ['axis.widget.tuner', 'axis.widget.tempo', 'axis.widget.cpu']
  };

  doc.layouts[tablet.id] = tablet;
  doc.profiles[AXIS_TABLET_PROFILE_ID] = {
    id: AXIS_TABLET_PROFILE_ID,
    label: 'Tablet',
    layoutId: tablet.id,
    breakpoint: 'tablet'
  };
  return { doc, desktop, tablet };
}

describe('ensureAxisTopBarParity', () => {
  it('copies the desktop top bar onto a stale profile layout', () => {
    const { doc, desktop, tablet } = docWithStaleTablet();

    ensureAxisTopBarParity(doc);

    expect(topBarOf(tablet)).toEqual(topBarOf(desktop));
    // Scenes/Save come back to top.left and the meter returns.
    expect(tablet.widgets['axis.widget.scenes'].zone).toBe('top.left');
    expect(tablet.widgets['axis.widget.save'].zone).toBe('top.left');
    expect(tablet.widgets['axis.widget.meterToggle']).toBeDefined();
  });

  it('prunes the retired status group but leaves non-top widgets and groups alone', () => {
    const { doc, tablet } = docWithStaleTablet();
    tablet.widgetGroups['axis.group.custom'] = { id: 'axis.group.custom', widgetIds: ['axis.widget.gridMode', 'axis.widget.blockSize'] };
    tablet.widgets['axis.widget.gridMode'].groupId = 'axis.group.custom';
    tablet.widgets['axis.widget.blockSize'].groupId = 'axis.group.custom';
    const nonTopBefore = Object.entries(tablet.widgets)
      .filter(([, widget]) => !widget.zone.startsWith('top.'))
      .map(([id, widget]) => [id, widget.zone]);

    ensureAxisTopBarParity(doc);

    expect(tablet.widgetGroups['axis.group.status']).toBeUndefined();
    expect(tablet.widgetGroups['axis.group.custom']).toBeDefined();
    expect(
      Object.entries(tablet.widgets)
        .filter(([, widget]) => !widget.zone.startsWith('top.'))
        .map(([id, widget]) => [id, widget.zone])
    ).toEqual(nonTopBefore);
  });

  it('is idempotent (one-shot via the document marker)', () => {
    const { doc } = docWithStaleTablet();

    ensureAxisTopBarParity(doc);
    expect(doc.metadata?.[AXIS_TOP_BAR_PARITY_MARKER]).toBe('v1');
    const once = JSON.stringify(doc);

    ensureAxisTopBarParity(doc);
    expect(JSON.stringify(doc)).toBe(once);
  });

  it('never touches the desktop layout (it is the reference)', () => {
    const { doc, desktop } = docWithStaleTablet();
    const before = JSON.stringify(desktop);

    ensureAxisTopBarParity(doc);

    expect(JSON.stringify(desktop)).toBe(before);
  });
});
