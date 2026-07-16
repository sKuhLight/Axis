import { describe, expect, it } from 'vitest';
import { isAxisWorkbenchFeatureEnabled } from '../featureGate';
import { AXIS_FC_PARTS, axisFcPanelType } from '../fc/types';
import { AXIS_PRESET_BROWSER_PARTS, axisPresetBrowserPanelType } from '../presetBrowser/types';
import {
  AXIS_WORKBENCH_ACTION_IDS,
  AXIS_WORKBENCH_BASE_PANEL_TYPES,
  AXIS_WORKBENCH_FC_PANEL_TYPES,
  AXIS_WORKBENCH_NAVIGATION_IDS,
  AXIS_WORKBENCH_PRESET_BROWSER_PANEL_TYPES,
  AXIS_WORKBENCH_WIDGET_TYPES
} from '../axisWorkbenchRegistryManifest';

describe('Axis Workbench integration contracts', () => {
  it('workbench is the default shell; VITE_AXIS_WORKBENCH=0 is the legacy escape hatch', () => {
    expect(isAxisWorkbenchFeatureEnabled({ VITE_AXIS_WORKBENCH: '1' })).toBe(true);
    expect(isAxisWorkbenchFeatureEnabled({})).toBe(true);
    expect(isAxisWorkbenchFeatureEnabled({ VITE_AXIS_WORKBENCH: 'true' })).toBe(true);
    expect(isAxisWorkbenchFeatureEnabled({ VITE_AXIS_WORKBENCH: '0' })).toBe(false);
  });

  it('declares required Axis panel, widget, navigation, and action types', () => {
    expect(AXIS_WORKBENCH_BASE_PANEL_TYPES).toEqual([
      'axis.signalGrid',
      'axis.blockEditor',
      'axis.presetBrowser',
      'axis.fc',
      'axis.history',
      'axis.account',
      'axis.deviceTools',
      'axis.customPanel',
      'axis.virtualScreen',
      'axis.placeholder',
      'axis.convertGrid',
      'axis.convertBlockEditor',
      'axis.convertMinimap',
      'axis.convertTray'
    ]);

    expect(AXIS_WORKBENCH_PRESET_BROWSER_PANEL_TYPES).toEqual(AXIS_PRESET_BROWSER_PARTS.map(axisPresetBrowserPanelType));
    expect(AXIS_WORKBENCH_FC_PANEL_TYPES).toEqual(AXIS_FC_PARTS.map(axisFcPanelType));

    expect(AXIS_WORKBENCH_WIDGET_TYPES).toEqual([
      'axis.logo',
      'axis.preset',
      'axis.scenes',
      'axis.view',
      'axis.addBlock',
      'axis.tuner',
      'axis.tempo',
      'axis.cpu',
      'axis.meterToggle',
      'axis.save',
      'axis.search',
      'axis.history',
      'axis.gridMap',
      'axis.undoRedo',
      'axis.connection',
      'axis.account',
      'axis.gridMode',
      'axis.blockSize',
      'axis.fcDevice',
      'axis.fcLayouts',
      'axis.fcSwitchView',
      'axis.paramControl',
      'axis.hint',
      'axis.legal',
      'axis.telemetry'
    ]);

    expect(AXIS_WORKBENCH_NAVIGATION_IDS).toEqual([
      'grid',
      'library',
      'fc',
      'controllers',
      'scenes',
      'live',
      'setup',
      'theme',
      'account'
    ]);

    expect(AXIS_WORKBENCH_ACTION_IDS).toContain('axis.pinSelectedParameters');
    expect(AXIS_WORKBENCH_ACTION_IDS).toContain('axis.openGrid');
    expect(AXIS_WORKBENCH_ACTION_IDS).toContain('axis.openFc');
    expect(AXIS_WORKBENCH_ACTION_IDS).toContain('axis.openControllers');
    expect(AXIS_WORKBENCH_ACTION_IDS).toContain('axis.openTheme');
  });
});
