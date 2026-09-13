import { describe, expect, it } from 'vitest';
import { createWorkbenchId, reduceWorkbenchDocument, type WorkbenchCommand, type WorkbenchDocument } from '../../workbench/core';
import { createAxisLayoutPreset } from '../axisWorkbenchLayoutPresets';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import {
  computeExpandedBottomPx,
  createAxisMobileBlockFlowMemory,
  decideAxisMobileBlockFlow,
  type AxisMobileBlockFlowInput,
  type AxisMobileBlockFlowMemory
} from '../axisMobileBlockFlow';

const WORKBENCH_H = 800;
const EXPANDED = computeExpandedBottomPx(WORKBENCH_H); // 600

/** Build a doc whose active profile uses the default preset's layout. */
function docFromPreset(): WorkbenchDocument {
  const doc = createAxisWorkbenchDefaultDocument();
  const layout = createAxisLayoutPreset('default', { layoutId: createWorkbenchId('layout') });
  doc.layouts[layout.id] = layout;
  doc.profiles[doc.activeProfileId].layoutId = layout.id;
  return doc;
}

function apply(doc: WorkbenchDocument, commands: WorkbenchCommand[]): WorkbenchDocument {
  let next = doc;
  for (const command of commands) {
    const result = reduceWorkbenchDocument(next, command);
    expect(result.success).toBe(true);
    next = result.next;
  }
  return next;
}

function activeLayout(doc: WorkbenchDocument) {
  return doc.layouts[doc.profiles[doc.activeProfileId].layoutId];
}

// Pages (schema v2): region sizes live on the ACTIVE page's dock.
function activeDock(doc: WorkbenchDocument) {
  const layout = activeLayout(doc);
  return layout.pages[layout.activePageId].dock;
}

function gridModeWidget(doc: WorkbenchDocument) {
  return Object.values(activeLayout(doc).widgets).find((w) => w.type === 'axis.gridMode')!;
}

function input(over: Partial<AxisMobileBlockFlowInput> & Pick<AxisMobileBlockFlowInput, 'doc'>): AxisMobileBlockFlowInput {
  return { profileIsPhone: true, blockOpen: false, workbenchHeightPx: WORKBENCH_H, ...over };
}

describe('computeExpandedBottomPx', () => {
  it('is ~75% of the workbench height', () => {
    expect(computeExpandedBottomPx(800)).toBe(600);
    expect(computeExpandedBottomPx(1000)).toBe(750);
  });
  it('clamps to a sane minimum for tiny/zero heights', () => {
    expect(computeExpandedBottomPx(0)).toBe(240);
    expect(computeExpandedBottomPx(100)).toBe(240);
  });
});

describe('decideAxisMobileBlockFlow — enter (phone, block opens)', () => {
  it('expands the bottom to ~75% and forces grid map, capturing prev state', () => {
    const doc = docFromPreset();
    const mem0 = createAxisMobileBlockFlowMemory();
    const beforeBottom = activeDock(doc).regions.bottom.sizePx ?? null;
    const beforeGrid = gridModeWidget(doc);
    expect(beforeGrid.zone).toBe('gridbar'); // default preset already docks gridMode

    const { commands, memory } = decideAxisMobileBlockFlow(input({ doc, blockOpen: true }), mem0);

    // region.resize + widget.state map — no widget.move, already visible.
    expect(commands.map((c) => c.type)).toEqual(['region.resize', 'widget.state']);
    expect(memory).toMatchObject({
      expanded: true,
      prevBottomSizePx: beforeBottom,
      prevGridMode: 'auto',
      prevGridZone: 'gridbar',
      appliedBottomSizePx: EXPANDED
    });

    const next = apply(doc, commands);
    expect(activeDock(next).regions.bottom.sizePx).toBe(EXPANDED);
    const g = gridModeWidget(next);
    expect(g.zone).toBe('gridbar');
    expect(g.state?.mode).toBe('map');
  });

  it('is idempotent while already expanded (no re-snap, no commands)', () => {
    const doc = docFromPreset();
    const first = decideAxisMobileBlockFlow(input({ doc, blockOpen: true }), createAxisMobileBlockFlowMemory());
    const expanded = apply(doc, first.commands);
    const second = decideAxisMobileBlockFlow(input({ doc: expanded, blockOpen: true }), first.memory);
    expect(second.commands).toEqual([]);
    expect(second.memory).toEqual(first.memory);
  });

  it('is a no-op when no block editor panel is docked', () => {
    const doc = docFromPreset();
    const layout = activeLayout(doc);
    for (const id of Object.keys(layout.panels)) {
      if (layout.panels[id].type === 'axis.blockEditor') delete layout.panels[id];
    }
    const { commands, memory } = decideAxisMobileBlockFlow(input({ doc, blockOpen: true }), createAxisMobileBlockFlowMemory());
    expect(commands).toEqual([]);
    expect(memory.expanded).toBe(false);
  });

  it('still moves a hidden gridMode widget into the gridbar (older/custom layouts)', () => {
    const doc = docFromPreset();
    const gid = gridModeWidget(doc).id;
    const hidden = apply(doc, [{ type: 'widget.hide', widgetIds: [gid] }]);

    const { commands, memory } = decideAxisMobileBlockFlow(input({ doc: hidden, blockOpen: true }), createAxisMobileBlockFlowMemory());
    expect(commands.map((c) => c.type)).toEqual(['region.resize', 'widget.move', 'widget.state']);
    expect(memory.prevGridZone).toBe('hidden');

    const next = apply(hidden, commands);
    const g = gridModeWidget(next);
    expect(g.zone).toBe('gridbar');
    expect(g.state?.mode).toBe('map');
  });
});

describe('decideAxisMobileBlockFlow — leave (block minimized/closed)', () => {
  it('restores the prev bottom size + grid mode + grid zone', () => {
    const doc = docFromPreset();
    const enter = decideAxisMobileBlockFlow(input({ doc, blockOpen: true }), createAxisMobileBlockFlowMemory());
    const expanded = apply(doc, enter.commands);

    const leave = decideAxisMobileBlockFlow(input({ doc: expanded, blockOpen: false }), enter.memory);
    const restored = apply(expanded, leave.commands);

    expect(activeDock(restored).regions.bottom.sizePx).toBe(activeDock(doc).regions.bottom.sizePx);
    const g = gridModeWidget(restored);
    expect(g.zone).toBe('gridbar');
    expect(g.state?.mode).toBe('auto');
    expect(leave.memory).toEqual(createAxisMobileBlockFlowMemory());
  });

  it('does nothing when never expanded', () => {
    const doc = docFromPreset();
    const { commands, memory } = decideAxisMobileBlockFlow(input({ doc, blockOpen: false }), createAxisMobileBlockFlowMemory());
    expect(commands).toEqual([]);
    expect(memory.expanded).toBe(false);
  });
});

describe('decideAxisMobileBlockFlow — user-resize respect', () => {
  it('does not re-snap the bottom size while expanded even if it differs', () => {
    const doc = docFromPreset();
    const enter = decideAxisMobileBlockFlow(input({ doc, blockOpen: true }), createAxisMobileBlockFlowMemory());
    let expanded = apply(doc, enter.commands);
    // Simulate the user dragging the bottom divider to a custom size.
    expanded = apply(expanded, [{ type: 'region.resize', region: 'bottom', sizePx: 420 }]);

    const hold = decideAxisMobileBlockFlow(input({ doc: expanded, blockOpen: true }), enter.memory);
    expect(hold.commands).toEqual([]); // never fights the user
  });

  it('keeps the user size on minimize (does not restore prev) after a manual resize', () => {
    const doc = docFromPreset();
    const enter = decideAxisMobileBlockFlow(input({ doc, blockOpen: true }), createAxisMobileBlockFlowMemory());
    let expanded = apply(doc, enter.commands);
    expanded = apply(expanded, [{ type: 'region.resize', region: 'bottom', sizePx: 420 }]);

    const leave = decideAxisMobileBlockFlow(input({ doc: expanded, blockOpen: false }), enter.memory);
    // No region.resize command — the user's 420 stays; grid mode still restores.
    expect(leave.commands.some((c) => c.type === 'region.resize')).toBe(false);
    const restored = apply(expanded, leave.commands);
    expect(activeDock(restored).regions.bottom.sizePx).toBe(420);
    expect(gridModeWidget(restored).zone).toBe('gridbar');
  });
});

describe('decideAxisMobileBlockFlow — non-phone profiles', () => {
  it('is inert on desktop/tablet when never expanded', () => {
    const doc = docFromPreset();
    const { commands, memory } = decideAxisMobileBlockFlow(
      input({ doc, profileIsPhone: false, blockOpen: true }),
      createAxisMobileBlockFlowMemory()
    );
    expect(commands).toEqual([]);
    expect(memory.expanded).toBe(false);
  });

  it('restores once if the profile switches away from phone while expanded', () => {
    const doc = docFromPreset();
    const enter = decideAxisMobileBlockFlow(input({ doc, blockOpen: true }), createAxisMobileBlockFlowMemory());
    const expanded = apply(doc, enter.commands);

    const off = decideAxisMobileBlockFlow(input({ doc: expanded, profileIsPhone: false, blockOpen: true }), enter.memory);
    expect(off.commands.length).toBeGreaterThan(0);
    const restored = apply(expanded, off.commands);
    expect(gridModeWidget(restored).zone).toBe('gridbar');
    expect(off.memory.expanded).toBe(false);
  });
});
