import { describe, expect, it } from 'vitest';
import { AxisFcWorkbenchController } from '../fc/fcWorkbenchController';
import { AXIS_FC_PARTS, axisFcPanelType, axisFcPartFromPanelType, parseAxisFcPart } from '../fc/types';
import { AxisPresetBrowserWorkbenchController } from '../presetBrowser/presetBrowserWorkbenchController';
import {
  AXIS_PRESET_BROWSER_PARTS,
  axisPresetBrowserPanelType,
  axisPresetBrowserPartFromPanelType,
  parseAxisPresetBrowserPart
} from '../presetBrowser/types';

describe('Axis Workbench split panel contracts', () => {
  it('maps Preset Browser parts to panel types', () => {
    expect(AXIS_PRESET_BROWSER_PARTS).toEqual(['full', 'sources', 'list', 'detail']);
    expect(axisPresetBrowserPanelType('full')).toBe('axis.presetBrowser');
    expect(axisPresetBrowserPanelType('sources')).toBe('axis.presetBrowser.sources');
    expect(axisPresetBrowserPartFromPanelType('axis.presetBrowser.detail')).toBe('detail');
    expect(parseAxisPresetBrowserPart('unknown')).toBe('full');
  });

  it('shares Preset Browser selection state through a controller', () => {
    const controller = new AxisPresetBrowserWorkbenchController();
    const seen: string[] = [];
    const unsubscribe = controller.subscribe((snapshot) => seen.push(`${snapshot.sourceId}:${snapshot.entryId ?? 'none'}`));

    controller.openSource('cloud');
    controller.selectEntry('preset.001');
    controller.focusBlock(123);
    controller.closeDetail();
    unsubscribe();

    expect(seen).toEqual(['device:none', 'cloud:none', 'cloud:preset.001', 'cloud:preset.001', 'cloud:preset.001']);
    expect(controller.snapshot).toMatchObject({
      sourceId: 'cloud',
      entryId: 'preset.001',
      focusedBlockEffectId: 123,
      detailOpen: false
    });
  });

  it('delegates Preset Browser host actions without global buses', () => {
    const controller = new AxisPresetBrowserWorkbenchController();
    const calls: string[] = [];
    const unbind = controller.bindHost({
      openSource: (sourceId) => { calls.push(`source:${sourceId}`); },
      selectEntry: (entryId) => { calls.push(`entry:${entryId ?? 'none'}`); },
      focusBlock: (effectId) => { calls.push(`block:${effectId ?? 'none'}`); },
      openDetail: (entryId) => { calls.push(`detail:${entryId ?? 'none'}`); },
      loadEntry: (entryId) => { calls.push(`load:${entryId}`); }
    });

    controller.openSource('local');
    controller.selectEntry('preset.002');
    controller.focusBlock(42);
    controller.openDetail();
    expect(controller.loadSelected()).toBe(true);
    unbind();
    controller.openSource('cloud');

    expect(calls).toEqual(['source:local', 'entry:preset.002', 'block:42', 'detail:preset.002', 'load:preset.002']);
  });

  it('maps FC parts to panel types', () => {
    expect(AXIS_FC_PARTS).toEqual(['full', 'board', 'inspector', 'layouts', 'led', 'tap', 'hold']);
    expect(axisFcPanelType('full')).toBe('axis.fc');
    expect(axisFcPanelType('board')).toBe('axis.fc.board');
    expect(axisFcPartFromPanelType('axis.fc.hold')).toBe('hold');
    expect(parseAxisFcPart('unknown')).toBe('full');
  });

  it('shares FC selection state through a controller', () => {
    const controller = new AxisFcWorkbenchController();
    const seen: string[] = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      seen.push(`${snapshot.layout}:${snapshot.view}:${snapshot.switchIndex ?? 'none'}:${snapshot.side}`);
    });

    controller.selectLayout(2);
    controller.selectView(1);
    controller.selectSwitch(3, 'hold');
    controller.selectSide('tap');
    controller.closeInspector();
    unsubscribe();

    expect(seen).toEqual(['0:0:none:tap', '2:0:none:tap', '2:1:none:tap', '2:1:3:hold', '2:1:3:tap', '2:1:3:tap']);
    expect(controller.snapshot).toMatchObject({
      layout: 2,
      view: 1,
      switchIndex: 3,
      side: 'tap',
      inspectorOpen: false
    });
  });

  it('delegates FC host actions without global buses', () => {
    const controller = new AxisFcWorkbenchController();
    const calls: string[] = [];
    const unbind = controller.bindHost({
      selectLayout: (layout) => { calls.push(`layout:${layout}`); },
      selectView: (view) => { calls.push(`view:${view}`); },
      selectSwitch: (switchIndex, side) => { calls.push(`switch:${switchIndex ?? 'none'}:${side}`); },
      selectSide: (side) => { calls.push(`side:${side}`); },
      openInspector: (switchIndex) => { calls.push(`inspector:${switchIndex ?? 'none'}`); }
    });

    controller.selectLayout(1);
    controller.selectView(2);
    controller.selectSwitch(4, 'hold');
    controller.selectSide('tap');
    controller.openInspector();
    unbind();
    controller.selectLayout(3);

    expect(calls).toEqual(['layout:1', 'view:2', 'switch:4:hold', 'side:tap', 'inspector:4']);
  });
});
