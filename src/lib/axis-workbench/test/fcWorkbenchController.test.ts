import { describe, expect, it } from 'vitest';
import { AxisFcWorkbenchController } from '../fc/fcWorkbenchController';
import { parseAxisFcPart, axisFcPanelType, AXIS_FC_PARTS } from '../fc/types';

describe('FC Workbench controller', () => {
  it('resets view and switch when a layout is selected (design §3.2 parity)', () => {
    const controller = new AxisFcWorkbenchController();
    controller.selectView(2);
    controller.selectSwitch(5, 'hold');
    expect(controller.snapshot).toMatchObject({ view: 2, switchIndex: 5, inspectorOpen: true });

    controller.selectLayout(3);
    expect(controller.snapshot).toMatchObject({
      layout: 3,
      view: 0,
      switchIndex: null,
      inspectorOpen: false
    });
  });

  it('keeps the layout but resets the switch when a view is selected', () => {
    const controller = new AxisFcWorkbenchController();
    controller.selectLayout(2);
    controller.selectSwitch(4);
    controller.selectView(1);
    expect(controller.snapshot).toMatchObject({ layout: 2, view: 1, switchIndex: null });
  });

  it('opens the inspector with the tapped switch and side', () => {
    const controller = new AxisFcWorkbenchController();
    controller.selectSwitch(7, 'hold');
    expect(controller.snapshot).toMatchObject({ switchIndex: 7, side: 'hold', inspectorOpen: true });
    controller.closeInspector();
    expect(controller.snapshot.inspectorOpen).toBe(false);
  });

  it('notifies subscribers with immutable snapshots', () => {
    const controller = new AxisFcWorkbenchController();
    const seen: number[] = [];
    const off = controller.subscribe((snapshot) => seen.push(snapshot.layout));
    controller.selectLayout(1);
    controller.selectLayout(4);
    off();
    controller.selectLayout(6);
    expect(seen).toEqual([0, 1, 4]);
  });
});

describe('FC part parsing', () => {
  it('accepts the grid render part without minting a registry panel type for it', () => {
    expect(parseAxisFcPart('grid')).toBe('grid');
    expect(parseAxisFcPart('nonsense')).toBe('full');
    expect(parseAxisFcPart(undefined, 'board')).toBe('board');
    // 'grid' stays out of the registry-facing part list (axis.signalGrid owns the grid panel type)
    expect(AXIS_FC_PARTS).not.toContain('grid');
    expect(AXIS_FC_PARTS.map(axisFcPanelType)).toEqual([
      'axis.fc',
      'axis.fc.board',
      'axis.fc.inspector',
      'axis.fc.layouts',
      'axis.fc.led',
      'axis.fc.tap',
      'axis.fc.hold'
    ]);
  });

  it('controller setPart accepts render parts including grid', () => {
    const controller = new AxisFcWorkbenchController();
    controller.setPart('grid');
    expect(controller.snapshot.activePart).toBe('grid');
    controller.setPart('bogus');
    expect(controller.snapshot.activePart).toBe('full');
  });
});
